import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { SubscriptionSalesPanel } from '@/components/subscription/SubscriptionSalesPanel';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { BILLING_PERIOD_LABELS, type BillingPeriod } from '@/config/appConfig';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { alignItems, flexDirection, textAlign } from '@/lib/rtl';
import {
  buildComparisonRows,
  normalizePlanCatalog,
  type PlanId,
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
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const params = useLocalSearchParams<{
    recommendedPlan?: string | string[];
    upgradeReason?: string | string[];
    featureKey?: string | string[];
    autoOpenUpgrade?: string | string[];
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
  const referralCreditSummary = useQuery(
    api.referrals.getBusinessReferralCreditSummary,
    activeBusinessId && capabilities?.view_billing_state === true
      ? { businessId: activeBusinessId }
      : 'skip'
  );
  const createBusinessReferralLink = useMutation(
    api.referrals.getOrCreateBusinessReferralLink
  );

  const recommendedPlanParam = parsePlanParam(params.recommendedPlan);
  const upgradeReasonParam = parseUpgradeReasonParam(params.upgradeReason);
  const featureKeyParam = firstParam(params.featureKey);
  const autoOpenUpgradeParam = firstParam(params.autoOpenUpgrade) === 'true';

  const normalizedPlanCatalog = useMemo(
    () => normalizePlanCatalog(planCatalogQuery),
    [planCatalogQuery]
  );
  const comparisonRows = useMemo(
    () => buildComparisonRows(normalizedPlanCatalog),
    [normalizedPlanCatalog]
  );

  const currentPlan = entitlements?.plan ?? 'starter';
  const cardsStatus = limitStatus(
    'maxCards',
    usageSummary?.cardsUsed ?? entitlements?.limits.maxCards ?? 0
  );
  const customersStatus = limitStatus(
    'maxCustomers',
    usageSummary?.customersUsed ?? 0
  );
  const campaignsStatus = limitStatus(
    'maxCampaigns',
    usageSummary?.activeManagementCampaignsUsed ??
      entitlements?.usage.activeManagementCampaigns ??
      0
  );
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
        `מבצעים ${formatLimit(
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
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'premium'>('pro');
  const [upgradeReason, setUpgradeReason] =
    useState<UpgradeReason>('feature_locked');
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<
    string | undefined
  >(undefined);
  const [comparisonSelectedPlan, setComparisonSelectedPlan] =
    useState<PlanId>('pro');
  const [comparisonBillingPeriod, setComparisonBillingPeriod] =
    useState<BillingPeriod>('monthly');
  const [isB2bShareLoading, setIsB2bShareLoading] = useState(false);

  const openUpgrade = useCallback(
    (targetPlan?: 'pro' | 'premium') => {
      const fallbackPlan =
        comparisonSelectedPlan === 'premium' ? 'premium' : 'pro';
      const selectedTarget = targetPlan ?? fallbackPlan;

      setUpgradePlan(selectedTarget);
      setUpgradeReason(
        upgradeReasonParam ??
          (!entitlements?.isSubscriptionActive && currentPlan !== 'starter'
            ? 'subscription_inactive'
            : 'feature_locked')
      );
      setUpgradeFeatureKey(featureKeyParam?.trim() || 'business_subscription');
      setIsUpgradeVisible(true);
    },
    [
      comparisonSelectedPlan,
      currentPlan,
      entitlements?.isSubscriptionActive,
      featureKeyParam,
      upgradeReasonParam,
    ]
  );

  const handleShareBusinessReferral = useCallback(
    async (mode: 'whatsapp' | 'copy') => {
      if (!activeBusinessId || isB2bShareLoading) {
        return;
      }
      try {
        setIsB2bShareLoading(true);
        const link = await createBusinessReferralLink({
          businessId: activeBusinessId,
        });
        const message = `הזמינו בעלי עסקים ל-StampAix וקבלו חודשי מנוי מתנה.\n${link.url}`;

        if (mode === 'whatsapp') {
          const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
          const canOpen = await Linking.canOpenURL(whatsappUrl);
          if (canOpen) {
            await Linking.openURL(whatsappUrl);
          } else {
            await Share.share({ message });
          }
        } else {
          const maybeNavigator = globalThis as {
            navigator?: {
              clipboard?: { writeText?: (value: string) => Promise<void> };
            };
          };
          if (maybeNavigator.navigator?.clipboard?.writeText) {
            await maybeNavigator.navigator.clipboard.writeText(link.url);
          } else {
            await Share.share({ message: link.url });
          }
          Alert.alert('', 'קישור ההזמנה לעסק הוכן לשיתוף');
        }
      } catch {
        Alert.alert('שגיאה', 'לא הצלחנו ליצור קישור הפניה עסקי כרגע.');
      } finally {
        setIsB2bShareLoading(false);
      }
    },
    [activeBusinessId, createBusinessReferralLink, isB2bShareLoading]
  );

  useEffect(() => {
    if (recommendedPlanParam) {
      setComparisonSelectedPlan(recommendedPlanParam);
      return;
    }

    setComparisonSelectedPlan(currentPlan);
  }, [currentPlan, recommendedPlanParam]);

  useEffect(() => {
    if (entitlements?.billingPeriod) {
      setComparisonBillingPeriod(entitlements.billingPeriod);
    }
  }, [entitlements?.billingPeriod]);

  useEffect(() => {
    if (
      !autoOpenUpgradeParam ||
      hasAutoOpenedModalRef.current ||
      !activeBusinessId
    ) {
      return;
    }

    hasAutoOpenedModalRef.current = true;
    openUpgrade(
      recommendedPlanParam === 'premium'
        ? 'premium'
        : recommendedPlanParam === 'pro'
          ? 'pro'
          : currentPlan === 'premium'
            ? 'premium'
            : 'pro'
    );
  }, [
    activeBusinessId,
    autoOpenUpgradeParam,
    currentPlan,
    openUpgrade,
    recommendedPlanParam,
  ]);

  if (activeBusiness && capabilities?.view_billing_state !== true) {
    return <Redirect href="/(authenticated)/(business)/settings" />;
  }

  if (!activeBusinessId) {
    return (
      <SafeAreaView style={styles.emptyState}>
        <Text style={styles.emptyStateText}>לא נמצא עסק פעיל.</Text>
      </SafeAreaView>
    );
  }

  const currentStatusLabel =
    STATUS_LABELS[entitlements?.subscriptionStatus ?? 'active'] ?? 'פעיל';
  const comparisonUpgradePlan: 'pro' | 'premium' =
    comparisonSelectedPlan === 'premium' ? 'premium' : 'pro';
  const comparisonCtaLabel =
    comparisonSelectedPlan === currentPlan && currentPlan !== 'starter'
      ? 'ניהול המסלול הנוכחי'
      : comparisonSelectedPlan === 'starter'
        ? 'שדרוג ל-Pro'
        : `שדרוג ל-${PLAN_LABELS[comparisonUpgradePlan]}`;

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
      hint: 'מבצעים',
    },
    {
      key: 'campaigns_usage',
      label: 'מבצעים',
      value: formatLimit(
        usageSummary?.activeManagementCampaignsUsed ?? 0,
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
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: tabBarHeight + 24,
          },
        ]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
          style={styles.stickyHeader}
        >
          <BusinessScreenHeader
            title="מסלול וחיוב"
            titleNumberOfLines={1}
            titleAccessory={<BackButton onPress={() => router.back()} />}
          />
        </StickyScrollHeader>

        <View style={styles.usageStrip}>
          {usageItems.map((item) => (
            <View key={item.key} style={styles.usageChip}>
              {isLoading ||
              usageSummary === undefined ||
              item.showSpinner === true ? (
                <ActivityIndicator size="small" color="#2F6BFF" />
              ) : (
                <>
                  <Text style={styles.usageChipLabel}>{item.label}</Text>
                  <Text style={styles.usageChipValue} numberOfLines={1}>
                    {item.value}
                  </Text>
                  <Text style={styles.usageChipHint} numberOfLines={1}>
                    {item.hint}
                  </Text>
                </>
              )}
            </View>
          ))}
        </View>

        {usageWarnings.length > 0 ? (
          <View style={styles.warningStrip}>
            <Text style={styles.warningStripTitle}>שימו לב:</Text>
            <Text style={styles.warningStripText} numberOfLines={3}>
              {usageWarnings.join(' • ')}
            </Text>
          </View>
        ) : null}

        <View style={styles.b2bReferralCard}>
          <Text style={styles.b2bReferralTitle}>הפניית עסקים (B2B)</Text>
          <Text style={styles.b2bReferralSubtitle}>
            זיכויי חודשים מנוהלים בנפרד ממסלול המנוי ומופיעים כאן לצורך מעקב.
          </Text>
          <View style={styles.b2bReferralStatsRow}>
            <View style={styles.b2bReferralStat}>
              <Text style={styles.b2bReferralStatValue}>
                {referralCreditSummary?.creditedMonths ?? 0}
              </Text>
              <Text style={styles.b2bReferralStatLabel}>חודשים שזוכו</Text>
            </View>
            <View style={styles.b2bReferralStat}>
              <Text style={styles.b2bReferralStatValue}>
                {referralCreditSummary?.pendingMonths ?? 0}
              </Text>
              <Text style={styles.b2bReferralStatLabel}>ממתינים ל-30 יום</Text>
            </View>
            <View style={styles.b2bReferralStat}>
              <Text style={styles.b2bReferralStatValue}>
                {referralCreditSummary?.remainingCapMonths ?? 24}
              </Text>
              <Text style={styles.b2bReferralStatLabel}>יתרה עד תקרה</Text>
            </View>
          </View>
          <View style={styles.b2bReferralActionsRow}>
            <Pressable
              onPress={() => void handleShareBusinessReferral('whatsapp')}
              disabled={isB2bShareLoading}
              style={({ pressed }) => [
                styles.b2bPrimaryButton,
                pressed ? styles.b2bPrimaryButtonPressed : null,
                isB2bShareLoading ? styles.b2bButtonDisabled : null,
              ]}
            >
              <Text style={styles.b2bPrimaryButtonText}>
                {isB2bShareLoading ? 'טוען...' : 'שיתוף ב-WhatsApp'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleShareBusinessReferral('copy')}
              disabled={isB2bShareLoading}
              style={({ pressed }) => [
                styles.b2bSecondaryButton,
                pressed ? styles.b2bSecondaryButtonPressed : null,
                isB2bShareLoading ? styles.b2bButtonDisabled : null,
              ]}
            >
              <Text style={styles.b2bSecondaryButtonText}>העתקת קישור</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push(
                  '/(authenticated)/(business)/settings-business-referrals'
                )
              }
              style={({ pressed }) => [
                styles.b2bSecondaryButton,
                pressed ? styles.b2bSecondaryButtonPressed : null,
              ]}
            >
              <Text style={styles.b2bSecondaryButtonText}>ניהול הפניות</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.panelWrap}>
          <SubscriptionSalesPanel
            plans={normalizedPlanCatalog}
            rows={comparisonRows}
            selectedPlan={comparisonSelectedPlan}
            billingPeriod={comparisonBillingPeriod}
            currentPlan={currentPlan}
            context="settings"
            footerMode="inline"
            showPlanSelector={false}
            ctaLabel={comparisonCtaLabel}
            ctaDisabled={isLoading}
            footerInsetBottom={0}
            onSelectPlan={setComparisonSelectedPlan}
            onBillingPeriodChange={setComparisonBillingPeriod}
            onPressCta={() => openUpgrade(comparisonUpgradePlan)}
          />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 0,
    gap: 10,
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
  usageChip: {
    width: '31%',
    minHeight: 76,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE7F8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
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
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: TEXT_END,
  },
  usageChipHint: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    textAlign: TEXT_END,
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
  b2bReferralCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE6FB',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10,
  },
  b2bReferralTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1E3A8A',
    textAlign: TEXT_START,
  },
  b2bReferralSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: TEXT_START,
    lineHeight: 18,
  },
  b2bReferralStatsRow: {
    flexDirection: flexDirection.row,
    justifyContent: 'space-between',
    gap: 8,
  },
  b2bReferralStat: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE6FB',
    backgroundColor: '#F8FAFF',
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: alignItems.start,
    gap: 2,
  },
  b2bReferralStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F294B',
    textAlign: TEXT_END,
  },
  b2bReferralStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textAlign: TEXT_END,
  },
  b2bReferralActionsRow: {
    flexDirection: flexDirection.row,
    gap: 8,
  },
  b2bPrimaryButton: {
    flex: 1.4,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  b2bPrimaryButtonPressed: {
    opacity: 0.86,
  },
  b2bPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  b2bSecondaryButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  b2bSecondaryButtonPressed: {
    opacity: 0.85,
  },
  b2bSecondaryButtonText: {
    color: '#1E40AF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  b2bButtonDisabled: {
    opacity: 0.6,
  },
  panelWrap: {
    marginTop: 2,
  },
});
