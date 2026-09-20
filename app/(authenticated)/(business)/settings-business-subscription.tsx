import { useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  BusinessSettingsSubpageHeader,
  SETTINGS_TOKENS,
  useSettingsContentWidth,
} from '@/components/business-settings';
import { useGuidedTargetRef } from '@/components/guidance/GuidedActionAnchor';
import { GuidedActionScreenOverlay } from '@/components/guidance/GuidedActionOverlay';
import { SubscriptionSalesPanel } from '@/components/subscription/SubscriptionSalesPanel';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { BILLING_PERIOD_LABELS, type BillingPeriod } from '@/config/appConfig';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
import {
  isSubscriptionRecoveryStatus,
  resolveSubscriptionGuideTarget,
} from '@/lib/recommendations/guidance';
import { alignItems, flexDirection, textAlign } from '@/lib/rtl';
import { buildRevenueCatBusinessAppUserId } from '@/lib/subscription/billingGuards';
import {
  buildComparisonRows,
  normalizePlanCatalog,
  type PlanId,
  resolveSubscriptionPlanAction,
  resolveSubscriptionPlanSelection,
} from '@/lib/subscription/planComparison';

type UpgradeReason =
  | 'feature_locked'
  | 'limit_reached'
  | 'subscription_inactive';

const TEXT_START = textAlign.start;
const TEXT_END = textAlign.end;

const PLAN_LABELS: Record<PlanId, string> = {
  starter: 'Starter',
  pro: 'Pro',
  premium: 'Premium',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'פעיל',
  trialing: 'ניסיון',
  past_due: 'תשלום נכשל',
  canceled: 'מבוטל',
  inactive: 'לא פעיל',
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePlanParam(value: string | string[] | undefined): PlanId | null {
  const normalized = firstParam(value);
  if (
    normalized === 'starter' ||
    normalized === 'pro' ||
    normalized === 'premium'
  ) {
    return normalized;
  }

  return null;
}

function parseUpgradeReasonParam(
  value: string | string[] | undefined
): UpgradeReason | null {
  const normalized = firstParam(value);
  if (
    normalized === 'feature_locked' ||
    normalized === 'limit_reached' ||
    normalized === 'subscription_inactive'
  ) {
    return normalized;
  }

  return null;
}

function formatLimit(used: number, limit: number) {
  return `${used}/${limit}`;
}

function resolveTeamSeatUsageChip(args: {
  isTeamFeatureLocked: boolean;
  entitlementsLoaded: boolean;
  teamSummary: { usedSeats: number; maxSeats: number } | null | undefined;
  limitValue: number;
}) {
  if (args.isTeamFeatureLocked) {
    return {
      value: '—',
      hint: 'לא זמין',
      showSpinner: false,
      hasReliableUsage: false,
    };
  }

  if (!args.entitlementsLoaded || args.teamSummary === undefined) {
    return {
      value: '',
      hint: 'מושבים',
      showSpinner: true,
      hasReliableUsage: false,
    };
  }

  if (args.teamSummary === null) {
    return {
      value: '—',
      hint: 'לא זמין',
      showSpinner: false,
      hasReliableUsage: false,
    };
  }

  return {
    value: formatLimit(args.teamSummary.usedSeats, args.limitValue),
    hint: 'מושבים',
    showSpinner: false,
    hasReliableUsage: true,
    usedSeats: args.teamSummary.usedSeats,
  };
}

export default function BusinessSettingsSubscriptionScreen() {
  const contentWidth = useSettingsContentWidth();
  const subscriptionRecoveryTargetRef = useGuidedTargetRef();
  const quotaTargetRef = useGuidedTargetRef();
  const guideScrollRef = useRef<ScrollView | null>(null);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    recommendedPlan?: string | string[];
    upgradeReason?: string | string[];
    featureKey?: string | string[];
    autoOpenUpgrade?: string | string[];
    guideId?: string | string[];
    limitKey?: string | string[];
  }>();
  const hasAutoOpenedModalRef = useRef(false);

  const { activeBusiness, activeBusinessId } = useActiveBusiness();
  const capabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;

  const {
    entitlements,
    planCatalog: planCatalogQuery,
    limitStatus,
    gate,
    isLoading,
  } = useEntitlements(activeBusinessId);
  const { restorePurchases, getManagementUrl } = useRevenueCat();
  const teamGate = gate('team');
  const usageSummary = useQuery(
    api.entitlements.getBusinessUsageSummary,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const teamSummary = useQuery(
    api.business.getBusinessTeamSummary,
    activeBusinessId && entitlements && !teamGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip'
  ) as { usedSeats: number; maxSeats: number } | null | undefined;
  const billingIdentity = useQuery(
    api.businessBilling.getBusinessBillingIdentity,
    activeBusinessId && capabilities?.manage_subscription === true
      ? { businessId: activeBusinessId }
      : 'skip'
  );

  const recommendedPlanParam = parsePlanParam(params.recommendedPlan);
  const upgradeReasonParam = parseUpgradeReasonParam(params.upgradeReason);
  const featureKeyParam = firstParam(params.featureKey);
  const autoOpenUpgradeParam = firstParam(params.autoOpenUpgrade) === 'true';
  const guideIdParam = firstParam(params.guideId);
  const guideLimitKeyParam = firstParam(params.limitKey);

  const normalizedPlanCatalog = useMemo(
    () => normalizePlanCatalog(planCatalogQuery),
    [planCatalogQuery]
  );
  const comparisonRows = useMemo(
    () => buildComparisonRows(normalizedPlanCatalog),
    [normalizedPlanCatalog]
  );

  const currentPlan = entitlements?.plan ?? 'starter';
  const cardsStatus = limitStatus('maxCards', usageSummary?.cardsUsed ?? 0);
  const customersStatus = limitStatus(
    'maxCustomers',
    usageSummary?.customersUsed ?? 0
  );
  const campaignsStatus = limitStatus('maxCampaigns');
  const retentionStatus = limitStatus(
    'maxActiveRetentionActions',
    usageSummary?.activeRetentionActionsUsed ??
      entitlements?.usage.activeRetentionActions ??
      0
  );
  const aiExecutionsStatus = limitStatus(
    'maxAiExecutionsPerMonth',
    usageSummary?.aiExecutionsThisMonthUsed ??
      entitlements?.usage.aiExecutionsThisMonth ??
      0
  );
  const teamSeatLimitValue = limitStatus('maxTeamSeats').limitValue;
  const teamSeatUsageChip = resolveTeamSeatUsageChip({
    isTeamFeatureLocked: teamGate.isLocked,
    entitlementsLoaded: entitlements !== null && entitlements !== undefined,
    teamSummary,
    limitValue: teamSeatLimitValue,
  });
  const teamSeatsStatus = teamSeatUsageChip.hasReliableUsage
    ? limitStatus('maxTeamSeats', teamSeatUsageChip.usedSeats)
    : limitStatus('maxTeamSeats');

  const usageWarnings = useMemo(() => {
    const warnings: string[] = [];

    if (cardsStatus.isNearLimit || cardsStatus.isAtLimit) {
      warnings.push(
        `כרטיסים ${formatLimit(cardsStatus.currentValue, cardsStatus.limitValue)}`
      );
    }
    if (customersStatus.isNearLimit || customersStatus.isAtLimit) {
      warnings.push(
        `לקוחות ${formatLimit(customersStatus.currentValue, customersStatus.limitValue)}`
      );
    }
    if (campaignsStatus.isNearLimit || campaignsStatus.isAtLimit) {
      warnings.push(
        `קמפיינים ${formatLimit(
          campaignsStatus.currentValue,
          campaignsStatus.limitValue
        )}`
      );
    }
    if (retentionStatus.isNearLimit || retentionStatus.isAtLimit) {
      warnings.push(
        `פעולות שימור ${formatLimit(
          retentionStatus.currentValue,
          retentionStatus.limitValue
        )}`
      );
    }

    if (aiExecutionsStatus.isNearLimit || aiExecutionsStatus.isAtLimit) {
      warnings.push(
        `AI ${formatLimit(
          aiExecutionsStatus.currentValue,
          aiExecutionsStatus.limitValue
        )}`
      );
    }
    if (
      teamSeatUsageChip.hasReliableUsage &&
      (teamSeatsStatus.isNearLimit || teamSeatsStatus.isAtLimit)
    ) {
      warnings.push(
        `צוות ${formatLimit(
          teamSeatsStatus.currentValue,
          teamSeatsStatus.limitValue
        )}`
      );
    }

    return warnings;
  }, [
    aiExecutionsStatus,
    campaignsStatus,
    cardsStatus,
    customersStatus,
    retentionStatus,
    teamSeatUsageChip.hasReliableUsage,
    teamSeatsStatus,
  ]);

  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<PlanId>('pro');
  const [upgradeReason, setUpgradeReason] =
    useState<UpgradeReason>('feature_locked');
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<
    string | undefined
  >(undefined);
  const [comparisonSelectedPlan, setComparisonSelectedPlan] =
    useState<PlanId>('pro');
  const [comparisonBillingPeriod, setComparisonBillingPeriod] =
    useState<BillingPeriod>('monthly');
  const [isRestoringSubscription, setIsRestoringSubscription] = useState(false);

  const openUpgrade = useCallback(
    (targetPlan?: PlanId) => {
      const selectedTarget = targetPlan ?? comparisonSelectedPlan;

      setUpgradePlan(selectedTarget);
      setUpgradeReason(
        entitlements?.isSubscriptionActive !== true
          ? 'subscription_inactive'
          : (upgradeReasonParam ?? 'feature_locked')
      );
      setUpgradeFeatureKey(featureKeyParam?.trim() || 'business_subscription');
      setIsUpgradeVisible(true);
    },
    [
      comparisonSelectedPlan,
      entitlements?.isSubscriptionActive,
      featureKeyParam,
      upgradeReasonParam,
    ]
  );

  const handleRestoreSubscription = useCallback(async () => {
    if (!activeBusinessId || isRestoringSubscription) {
      return;
    }
    const appUserId = buildRevenueCatBusinessAppUserId(
      billingIdentity?.providerAppUserId ?? null
    );
    if (!appUserId) {
      Alert.alert(
        'שחזור רכישות',
        'לא הצלחנו לזהות את חשבון החיוב של העסק. נסו שוב מאוחר יותר.'
      );
      return;
    }
    setIsRestoringSubscription(true);
    try {
      await restorePurchases({
        appUserId,
        syncUserSubscription: false,
      });
    } finally {
      setIsRestoringSubscription(false);
    }
  }, [
    activeBusinessId,
    billingIdentity?.providerAppUserId,
    isRestoringSubscription,
    restorePurchases,
  ]);

  const handleManageSubscription = useCallback(async () => {
    const appUserId = buildRevenueCatBusinessAppUserId(
      billingIdentity?.providerAppUserId ?? null
    );
    const managementUrl = await getManagementUrl(appUserId ?? undefined);
    if (managementUrl) {
      const canOpen = await Linking.canOpenURL(managementUrl);
      if (canOpen) {
        await Linking.openURL(managementUrl);
        return;
      }
    }
    Alert.alert(
      'ניהול המנוי',
      'ניהול המנוי מתבצע בחנות של Apple או Google. לא הצלחנו לפתוח את מסך הניהול כרגע.'
    );
  }, [billingIdentity?.providerAppUserId, getManagementUrl]);

  useEffect(() => {
    if (!entitlements) {
      return;
    }

    setComparisonSelectedPlan(
      resolveSubscriptionPlanSelection({
        currentPlan,
        recommendedPlan: recommendedPlanParam,
      })
    );
  }, [currentPlan, entitlements, recommendedPlanParam]);

  useEffect(() => {
    if (entitlements?.billingPeriod) {
      setComparisonBillingPeriod(entitlements.billingPeriod);
    }
  }, [entitlements?.billingPeriod]);

  useEffect(() => {
    if (
      !autoOpenUpgradeParam ||
      hasAutoOpenedModalRef.current ||
      !activeBusinessId ||
      !entitlements
    ) {
      return;
    }

    hasAutoOpenedModalRef.current = true;
    openUpgrade(
      resolveSubscriptionPlanSelection({
        currentPlan,
        recommendedPlan: recommendedPlanParam,
      })
    );
  }, [
    activeBusinessId,
    autoOpenUpgradeParam,
    currentPlan,
    entitlements,
    openUpgrade,
    recommendedPlanParam,
  ]);

  if (activeBusiness && capabilities?.manage_subscription !== true) {
    return <Redirect href="/(authenticated)/(business)/settings" />;
  }

  if (!activeBusinessId) {
    return (
      <SafeAreaView style={styles.emptyState}>
        <Text style={styles.emptyStateText}>לא נמצא עסק פעיל.</Text>
      </SafeAreaView>
    );
  }

  const displaySubscriptionStatus =
    entitlements?.isSubscriptionActive === true
      ? (entitlements.subscriptionStatus ?? 'active')
      : 'inactive';
  const currentStatusLabel =
    !entitlements
      ? 'טוענים את מצב המנוי'
      : displaySubscriptionStatus === 'canceled' &&
          entitlements.isSubscriptionActive
        ? entitlements.subscriptionEndAt
          ? `המנוי יבוטל בתאריך ${new Date(
              entitlements.subscriptionEndAt
            ).toLocaleDateString('he-IL')}`
          : 'המנוי יבוטל בסוף התקופה ששולמה'
        : (STATUS_LABELS[displaySubscriptionStatus] ?? 'לא פעיל');
  const showSubscriptionRecoveryAction =
    entitlements !== null &&
    isSubscriptionRecoveryStatus(displaySubscriptionStatus);
  const subscriptionGuideTarget = resolveSubscriptionGuideTarget({
    guideId: guideIdParam,
    subscriptionStatus: entitlements ? displaySubscriptionStatus : undefined,
    limitKey: guideLimitKeyParam,
  });
  const activePlan =
    entitlements?.isSubscriptionActive === true ? currentPlan : undefined;
  const comparisonPlanAction = resolveSubscriptionPlanAction({
    currentPlan,
    selectedPlan: comparisonSelectedPlan,
    isSubscriptionActive: entitlements?.isSubscriptionActive === true,
  });
  const comparisonCtaLabel =
    comparisonPlanAction === 'manage'
      ? 'ניהול המסלול הנוכחי'
      : comparisonPlanAction === 'reactivate'
        ? `הפעלת ${PLAN_LABELS[comparisonSelectedPlan]}`
        : comparisonPlanAction === 'switch'
          ? `מעבר ל-${PLAN_LABELS[comparisonSelectedPlan]}`
          : `שדרוג ל-${PLAN_LABELS[comparisonSelectedPlan]}`;

  const usageItems = [
    {
      key: 'billing_period',
      label: 'חיוב',
      value: entitlements?.billingPeriod
        ? BILLING_PERIOD_LABELS[entitlements.billingPeriod]
        : 'ללא',
      hint: currentStatusLabel,
    },
    {
      key: 'cards_usage',
      label: 'כרטיסים',
      value: formatLimit(usageSummary?.cardsUsed ?? 0, cardsStatus.limitValue),
      hint: 'בשימוש',
    },
    {
      key: 'customers_usage',
      label: 'לקוחות',
      value: formatLimit(
        usageSummary?.customersUsed ?? 0,
        customersStatus.limitValue
      ),
      hint: 'בעסק',
    },
    {
      key: 'retention_usage',
      label: 'פעולות שימור',
      value: formatLimit(
        usageSummary?.activeRetentionActionsUsed ?? 0,
        retentionStatus.limitValue
      ),
      hint: 'קמפיינים',
    },
    {
      key: 'campaigns_usage',
      label: 'קמפיינים',
      value: formatLimit(
        campaignsStatus.currentValue,
        campaignsStatus.limitValue
      ),
      hint: 'פעילים',
    },
    {
      key: 'ai_usage',
      label: 'AI',
      value: formatLimit(
        usageSummary?.aiExecutionsThisMonthUsed ?? 0,
        aiExecutionsStatus.limitValue
      ),
      hint: 'חודשי',
    },
    {
      key: 'team_seats_usage',
      label: 'צוות',
      value: teamSeatUsageChip.value,
      hint: teamSeatUsageChip.hint,
      showSpinner: teamSeatUsageChip.showSpinner,
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        ref={guideScrollRef}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, 12) + 24,
            width: contentWidth,
          },
        ]}
      >
        <BusinessSettingsSubpageHeader
          title="מסלול וחיוב"
          fallbackHref={BUSINESS_ROUTES.settings}
          backgroundColor="#E9F0FF"
        />

        <View style={styles.currentPlanCard}>
          <View style={styles.currentPlanCopy}>
            <Text style={styles.currentPlanEyebrow}>
              {entitlements?.isSubscriptionActive === true
                ? 'המסלול הנוכחי'
                : 'המסלול להפעלה'}
            </Text>
            {entitlements ? (
              <Text style={styles.currentPlanName}>
                {PLAN_LABELS[currentPlan]}
              </Text>
            ) : (
              <ActivityIndicator size="small" color="#2F6BFF" />
            )}
            <Text style={styles.currentPlanStatus}>{currentStatusLabel}</Text>
          </View>
          <Text style={styles.currentPlanHint}>
            השימוש והמכסות העדכניים מוצגים כאן.
          </Text>
        </View>

        <View style={styles.usageStrip}>
          {usageItems.map((item) => (
            <View
              key={item.key}
              ref={
                item.key === 'campaigns_usage' &&
                subscriptionGuideTarget?.action === 'review_campaigns_quota'
                  ? quotaTargetRef
                  : undefined
              }
              style={styles.usageChip}
            >
              {isLoading ||
              usageSummary === undefined ||
              item.showSpinner === true ? (
                <ActivityIndicator size="small" color="#2F6BFF" />
              ) : (
                <>
                  <Text style={styles.usageChipLabel}>{item.label}</Text>
                  <Text style={styles.usageChipValue}>{item.value}</Text>
                  <Text style={styles.usageChipHint}>{item.hint}</Text>
                </>
              )}
            </View>
          ))}
        </View>

        <View
          ref={
            subscriptionGuideTarget?.action === 'restore_purchases'
              ? subscriptionRecoveryTargetRef
              : undefined
          }
          collapsable={false}
          style={styles.subscriptionRecoveryRow}
        >
          <View style={styles.subscriptionRecoveryCopy}>
            <Text style={styles.subscriptionRecoveryTitle}>
              רכישות ומנוי בחנות
            </Text>
            <Text style={styles.subscriptionRecoveryDescription}>
              {showSubscriptionRecoveryAction
                ? `סטטוס מנוי: ${currentStatusLabel}. אפשר לשחזר את הרכישה הקיימת.`
                : 'אפשר לשחזר רכישות קודמות או לפתוח את ניהול המנוי בחנות.'}
            </Text>
          </View>
          <View style={styles.subscriptionActionButtons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="שחזור רכישות למנוי הנוכחי"
              disabled={isRestoringSubscription}
              onPress={() => {
                void handleRestoreSubscription();
              }}
              style={({ pressed }) => [
                styles.subscriptionRecoveryButton,
                pressed ? styles.secondaryButtonPressed : null,
                isRestoringSubscription ? styles.buttonDisabled : null,
              ]}
            >
              {isRestoringSubscription ? (
                <ActivityIndicator size="small" color="#1D4ED8" />
              ) : (
                <Text style={styles.subscriptionRecoveryButtonText}>
                  שחזור רכישות
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ניהול המנוי בחנות"
              onPress={() => {
                void handleManageSubscription();
              }}
              style={({ pressed }) => [
                styles.subscriptionRecoveryButton,
                pressed ? styles.secondaryButtonPressed : null,
              ]}
            >
              <Text style={styles.subscriptionRecoveryButtonText}>
                ניהול המנוי
              </Text>
            </Pressable>
          </View>
        </View>

        {usageWarnings.length > 0 ? (
          <View style={styles.warningStrip}>
            <Text style={styles.warningStripTitle}>שימו לב:</Text>
            <Text style={styles.warningStripText} numberOfLines={3}>
              {usageWarnings.join(' • ')}
            </Text>
          </View>
        ) : null}

        <View style={styles.panelWrap}>
          {entitlements ? (
            <SubscriptionSalesPanel
              plans={normalizedPlanCatalog}
              rows={comparisonRows}
              selectedPlan={comparisonSelectedPlan}
              billingPeriod={comparisonBillingPeriod}
              currentPlan={activePlan}
              context="settings"
              footerMode="inline"
              showPlanSelector={false}
              ctaLabel={comparisonCtaLabel}
              ctaDisabled={isLoading}
              footerInsetBottom={0}
              onSelectPlan={setComparisonSelectedPlan}
              onBillingPeriodChange={setComparisonBillingPeriod}
              onPressCta={() => {
                if (comparisonPlanAction === 'manage') {
                  void handleManageSubscription();
                  return;
                }
                openUpgrade(comparisonSelectedPlan);
              }}
            />
          ) : (
            <ActivityIndicator size="small" color="#2F6BFF" />
          )}
        </View>
      </ScrollView>

      <UpgradeModal
        visible={isUpgradeVisible}
        businessId={activeBusinessId}
        initialPlan={upgradePlan}
        initialBillingPeriod={comparisonBillingPeriod}
        reason={upgradeReason}
        featureKey={upgradeFeatureKey}
        onClose={() => setIsUpgradeVisible(false)}
      />
      <GuidedActionScreenOverlay
        activeBusinessId={activeBusinessId}
        routeKey="business-subscription"
        targetRefs={{
          'subscription-recover': subscriptionRecoveryTargetRef,
          'quota-review': quotaTargetRef,
        }}
        scrollTargetIntoView={() => {
          if (guideIdParam === 'quota-review') {
            guideScrollRef.current?.scrollTo({
              y: 0,
              animated: false,
            });
            return;
          }
          guideScrollRef.current?.scrollTo({
            y: 80,
            animated: false,
          });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  content: {
    paddingBottom: 0,
    gap: SETTINGS_TOKENS.sectionGap,
    alignSelf: 'center',
  },
  stickyHeader: {
    paddingBottom: 8,
  },
  emptyState: {
    flex: 1,
    backgroundColor: '#E9F0FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyStateText: {
    width: '100%',
    textAlign: 'right',
    writingDirection: 'rtl',
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  backButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backButtonPressed: {
    opacity: 0.82,
  },
  usageStrip: {
    marginTop: 4,
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 8,
  },
  currentPlanCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFD3FF',
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  currentPlanCopy: {
    alignItems: alignItems.start,
    gap: 2,
  },
  currentPlanEyebrow: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: TEXT_START,
  },
  currentPlanName: {
    color: '#1D4ED8',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: TEXT_START,
  },
  currentPlanStatus: {
    color: '#334155',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: TEXT_START,
  },
  currentPlanHint: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: TEXT_START,
  },
  usageChip: {
    flexBasis: 124,
    flexGrow: 1,
    minWidth: 0,
    minHeight: 88,
    borderRadius: SETTINGS_TOKENS.radiusLg,
    borderWidth: 1,
    borderColor: '#DCE7F8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: alignItems.start,
    justifyContent: 'center',
    gap: 2,
  },
  usageChipLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    textAlign: TEXT_START,
  },
  usageChipValue: {
    width: '100%',
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: TEXT_END,
  },
  usageChipHint: {
    width: '100%',
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    textAlign: TEXT_END,
  },
  subscriptionRecoveryRow: {
    minHeight: 76,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'stretch',
    gap: 12,
  },
  subscriptionRecoveryCopy: {
    flex: 1,
    alignItems: alignItems.start,
    gap: 3,
  },
  subscriptionActionButtons: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 8,
  },
  subscriptionRecoveryTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
    textAlign: TEXT_START,
  },
  subscriptionRecoveryDescription: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    textAlign: TEXT_START,
  },
  subscriptionRecoveryButton: {
    minHeight: 48,
    minWidth: 112,
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  subscriptionRecoveryButtonText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  warningStrip: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warningStripTitle: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '900',
    textAlign: TEXT_START,
  },
  warningStripText: {
    flex: 1,
    color: '#B45309',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: TEXT_START,
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  panelWrap: {
    marginTop: 2,
  },
});
