import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { SubscriptionSalesPanel } from '@/components/subscription/SubscriptionSalesPanel';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { BILLING_PERIOD_LABELS, type BillingPeriod } from '@/config/appConfig';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { IS_RTL } from '@/lib/rtl';
import {
  buildComparisonRows,
  normalizePlanCatalog,
  type PlanId,
} from '@/lib/subscription/planComparison';

type UpgradeReason =
  | 'feature_locked'
  | 'limit_reached'
  | 'subscription_inactive';

const TEXT_START = IS_RTL ? 'right' : 'left';
const TEXT_END = IS_RTL ? 'left' : 'right';
const ROW_DIRECTION = IS_RTL ? 'row-reverse' : 'row';

const PLAN_LABELS: Record<PlanId, string> = {
  starter: 'Starter',
  pro: 'Pro AI',
  premium: 'Premium AI',
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

function resolveNextPlan(plan: PlanId): 'pro' | 'premium' | null {
  if (plan === 'starter') {
    return 'pro';
  }

  if (plan === 'pro') {
    return 'premium';
  }

  return null;
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

  const { activeBusinessId } = useActiveBusiness();
  const {
    entitlements,
    planCatalog: planCatalogQuery,
    limitStatus,
    isLoading,
  } = useEntitlements(activeBusinessId);
  const usageSummary = useQuery(
    api.entitlements.getBusinessUsageSummary,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
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
  const currentPlanLabel = PLAN_LABELS[currentPlan];
  const nextPlan = resolveNextPlan(currentPlan);
  const nextPlanLabel = nextPlan ? PLAN_LABELS[nextPlan] : null;

  const cardsStatus = limitStatus(
    'maxCards',
    usageSummary?.cardsUsed ?? entitlements?.limits.maxCards ?? 0
  );
  const customersStatus = limitStatus(
    'maxCustomers',
    usageSummary?.customersUsed ?? 0
  );
  const aiStatus = limitStatus(
    'maxActiveRetentionActions',
    usageSummary?.activeRetentionActionsUsed ??
      entitlements?.usage.activeRetentionActions ??
      0
  );

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
    if (aiStatus.isNearLimit || aiStatus.isAtLimit) {
      warnings.push(
        `שימור ${formatLimit(aiStatus.currentValue, aiStatus.limitValue)}`
      );
    }

    return warnings;
  }, [aiStatus, cardsStatus, customersStatus]);

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
        ? 'שדרוג ל-Pro AI'
        : `שדרוג ל-${PLAN_LABELS[comparisonUpgradePlan]}`;

  const usageItems = [
    {
      label: 'חיוב',
      value: entitlements?.billingPeriod
        ? BILLING_PERIOD_LABELS[entitlements.billingPeriod]
        : 'ללא',
      hint: currentStatusLabel,
    },
    {
      label: 'כרטיסים',
      value: formatLimit(usageSummary?.cardsUsed ?? 0, cardsStatus.limitValue),
      hint: 'בשימוש',
    },
    {
      label: 'לקוחות',
      value: formatLimit(
        usageSummary?.customersUsed ?? 0,
        customersStatus.limitValue
      ),
      hint: 'בעסק',
    },
    {
      label: 'שימור',
      value: formatLimit(
        usageSummary?.activeRetentionActionsUsed ?? 0,
        aiStatus.limitValue
      ),
      hint: 'קמפיינים',
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View
        style={[
          styles.content,
          {
            paddingTop: (insets.top || 0) + 12,
          },
        ]}
      >
        <BusinessScreenHeader
          title="מסלול וחיוב"
          subtitle="תמונת מצב ברורה של המסלול, השימוש בפועל והאפשרויות לשדרוג"
          titleNumberOfLines={2}
          subtitleNumberOfLines={2}
          titleAccessory={
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                pressed ? styles.backButtonPressed : null,
              ]}
            >
              <Text style={styles.backButtonText}>←</Text>
            </Pressable>
          }
        />

        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroStatusBadge}>
              <Text style={styles.heroStatusText}>{currentStatusLabel}</Text>
            </View>
            <Text style={styles.heroEyebrow}>המסלול הפעיל</Text>
          </View>
          <Text style={styles.heroTitle}>{currentPlanLabel}</Text>
          <Text style={styles.heroSubtitle}>
            {nextPlan && nextPlanLabel
              ? `${currentPlanLabel} פעיל כרגע. שדרוג ל-${nextPlanLabel} יגדיל מכסות ויפתח יכולות נוספות לעסק.`
              : 'אתם כבר במסלול הגבוה ביותר. כאן אפשר לעקוב אחרי השימוש ולנהל את המנוי.'}
          </Text>
        </View>

        <View style={styles.usageStrip}>
          {usageItems.map((item) => (
            <View key={item.label} style={styles.usageChip}>
              {isLoading || usageSummary === undefined ? (
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
            <Text style={styles.warningStripText} numberOfLines={2}>
              {usageWarnings.join(' • ')}
            </Text>
          </View>
        ) : null}

        <View style={styles.panelWrap}>
          <SubscriptionSalesPanel
            plans={normalizedPlanCatalog}
            rows={comparisonRows}
            selectedPlan={comparisonSelectedPlan}
            billingPeriod={comparisonBillingPeriod}
            currentPlan={currentPlan}
            context="settings"
            ctaLabel={comparisonCtaLabel}
            ctaDisabled={isLoading}
            footerInsetBottom={tabBarHeight + 10}
            onSelectPlan={setComparisonSelectedPlan}
            onBillingPeriodChange={setComparisonBillingPeriod}
            onPressCta={() => openUpgrade(comparisonUpgradePlan)}
          />
        </View>
      </View>

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
    flex: 1,
    paddingHorizontal: 18,
    paddingBottom: 0,
    gap: 10,
  },
  emptyState: {
    flex: 1,
    backgroundColor: '#E9F0FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyStateText: {
    textAlign: 'center',
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
  backButtonText: {
    fontSize: 16,
    color: '#0F172A',
    lineHeight: 18,
  },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#CFE0F7',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  heroTopRow: {
    flexDirection: ROW_DIRECTION,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroStatusBadge: {
    borderRadius: 999,
    backgroundColor: '#E7F0FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroStatusText: {
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  heroEyebrow: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    textAlign: TEXT_START,
  },
  heroTitle: {
    color: '#0F172A',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    textAlign: TEXT_START,
  },
  heroSubtitle: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: TEXT_START,
  },
  usageStrip: {
    flexDirection: ROW_DIRECTION,
    gap: 8,
  },
  usageChip: {
    flex: 1,
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE7F8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: IS_RTL ? 'flex-end' : 'flex-start',
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
    flexDirection: ROW_DIRECTION,
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
  panelWrap: {
    flex: 1,
    minHeight: 0,
  },
});
