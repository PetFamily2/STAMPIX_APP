import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { PlanComparisonTable } from '@/components/subscription/PlanComparisonTable';
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

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled';
type UpgradeReason =
  | 'feature_locked'
  | 'limit_reached'
  | 'subscription_inactive';

const ROW_DIRECTION = IS_RTL ? 'row-reverse' : 'row';
const TEXT_START = IS_RTL ? 'right' : 'left';
const TEXT_END = IS_RTL ? 'left' : 'right';

const PLAN_FALLBACK_LABELS: Record<PlanId, string> = {
  starter: 'Starter',
  pro: 'Pro AI',
  unlimited: 'Unlimited AI',
};

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'פעיל',
  trialing: 'ניסיון',
  past_due: 'תשלום נכשל',
  canceled: 'מבוטל',
};

function formatLimitValue(
  limitValue: number | null | undefined,
  isUnlimited: boolean
) {
  if (isUnlimited) {
    return 'ללא הגבלה';
  }
  if (limitValue === null || limitValue === undefined) {
    return '-';
  }
  return String(limitValue);
}

function formatSubscriptionStatus(status: string | undefined) {
  if (!status) {
    return 'פעיל';
  }
  return (
    SUBSCRIPTION_STATUS_LABELS[status as SubscriptionStatus] ??
    status.replaceAll('_', ' ')
  );
}

function resolveUpgradeTarget(plan: PlanId): 'pro' | 'unlimited' | null {
  if (plan === 'starter') {
    return 'pro';
  }
  if (plan === 'pro') {
    return 'unlimited';
  }
  return null;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePlanParam(value: string | string[] | undefined): PlanId | null {
  const normalized = firstParam(value);
  if (
    normalized === 'starter' ||
    normalized === 'pro' ||
    normalized === 'unlimited'
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

export default function BusinessSettingsSubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    focus?: string | string[];
    recommendedPlan?: string | string[];
    upgradeReason?: string | string[];
    featureKey?: string | string[];
  }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const comparisonSectionOffsetRef = useRef(0);
  const hasAutoFocusedComparisonRef = useRef(false);
  const lastFocusParamRef = useRef<string | undefined>(undefined);
  const { activeBusinessId } = useActiveBusiness();
  const {
    entitlements,
    planCatalog: planCatalogQuery,
    limitStatus,
    isLoading: isEntitlementsLoading,
  } = useEntitlements(activeBusinessId);
  const focusParam = firstParam(params.focus);
  const recommendedPlanParam = parsePlanParam(params.recommendedPlan);
  const requestedUpgradeReasonParam = parseUpgradeReasonParam(
    params.upgradeReason
  );
  const requestedFeatureKeyParam = firstParam(params.featureKey);
  const programs =
    useQuery(
      api.loyaltyPrograms.listManagementByBusiness,
      activeBusinessId ? { businessId: activeBusinessId } : 'skip'
    ) ?? [];

  const normalizedPlanCatalog = useMemo(
    () => normalizePlanCatalog(planCatalogQuery),
    [planCatalogQuery]
  );

  const comparisonRows = useMemo(
    () => buildComparisonRows(normalizedPlanCatalog),
    [normalizedPlanCatalog]
  );

  const planLabelsById = useMemo(() => {
    const map = new Map<PlanId, string>();
    for (const plan of normalizedPlanCatalog) {
      map.set(plan.plan, plan.label);
    }
    return map;
  }, [normalizedPlanCatalog]);

  const currentPlan = entitlements?.plan ?? 'starter';
  const currentPlanLabel =
    planLabelsById.get(currentPlan) ?? PLAN_FALLBACK_LABELS[currentPlan];
  const upgradeTargetPlan = resolveUpgradeTarget(currentPlan);
  const upgradeTargetLabel = upgradeTargetPlan
    ? (planLabelsById.get(upgradeTargetPlan) ??
      PLAN_FALLBACK_LABELS[upgradeTargetPlan])
    : null;

  const activePrograms = useMemo(
    () => programs.filter((program) => program.lifecycle === 'active'),
    [programs]
  );
  const cardLimit = limitStatus('maxCards', activePrograms.length);
  const customerLimit = limitStatus('maxCustomers');
  const aiLimit = limitStatus(
    'maxAiCampaignsPerMonth',
    entitlements?.usage.aiCampaignsUsedThisMonth
  );
  const aiUsageThisMonth =
    entitlements?.usage.aiCampaignsUsedThisMonth ?? aiLimit.currentValue;

  const statusRows = useMemo(
    () => [
      { label: 'מסלול נוכחי', value: currentPlanLabel },
      {
        label: 'סטטוס מנוי',
        value: formatSubscriptionStatus(entitlements?.subscriptionStatus),
      },
      {
        label: 'מחזור חיוב',
        value: entitlements?.billingPeriod
          ? BILLING_PERIOD_LABELS[entitlements.billingPeriod]
          : '-',
      },
      {
        label: 'כרטיסים פעילים',
        value: cardLimit.isUnlimited
          ? `${activePrograms.length} בשימוש / ללא הגבלה`
          : `${activePrograms.length} מתוך ${formatLimitValue(
              cardLimit.limitValue,
              false
            )}`,
      },
      {
        label: 'מכסת לקוחות',
        value: formatLimitValue(
          customerLimit.limitValue,
          customerLimit.isUnlimited
        ),
      },
      {
        label: 'קמפייני AI בחודש',
        value: aiLimit.isUnlimited
          ? `${aiUsageThisMonth} בשימוש / ללא הגבלה`
          : `${aiUsageThisMonth} מתוך ${formatLimitValue(aiLimit.limitValue, false)}`,
      },
    ],
    [
      activePrograms.length,
      aiLimit.isUnlimited,
      aiLimit.limitValue,
      aiUsageThisMonth,
      cardLimit.isUnlimited,
      cardLimit.limitValue,
      currentPlanLabel,
      customerLimit.isUnlimited,
      customerLimit.limitValue,
      entitlements?.billingPeriod,
      entitlements?.subscriptionStatus,
    ]
  );

  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'unlimited'>('pro');
  const [upgradeReason, setUpgradeReason] =
    useState<UpgradeReason>('feature_locked');
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<
    string | undefined
  >(undefined);
  const [comparisonSelectedPlan, setComparisonSelectedPlan] =
    useState<PlanId>('pro');
  const [comparisonBillingPeriod, setComparisonBillingPeriod] =
    useState<BillingPeriod>('monthly');

  const focusComparisonSection = useCallback(() => {
    if (
      focusParam !== 'comparison' ||
      hasAutoFocusedComparisonRef.current ||
      comparisonSectionOffsetRef.current <= 0
    ) {
      return;
    }

    hasAutoFocusedComparisonRef.current = true;
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, comparisonSectionOffsetRef.current - 8),
        animated: true,
      });
    });
  }, [focusParam]);

  useEffect(() => {
    if (lastFocusParamRef.current === focusParam) {
      return;
    }
    hasAutoFocusedComparisonRef.current = false;
    lastFocusParamRef.current = focusParam;
  }, [focusParam]);

  useEffect(() => {
    focusComparisonSection();
  }, [focusComparisonSection]);

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

  const comparisonUpgradePlan: 'pro' | 'unlimited' =
    currentPlan === 'unlimited'
      ? 'unlimited'
      : comparisonSelectedPlan === 'unlimited'
        ? 'unlimited'
        : 'pro';
  const comparisonUpgradeLabel =
    planLabelsById.get(comparisonUpgradePlan) ??
    PLAN_FALLBACK_LABELS[comparisonUpgradePlan];
  const isSamePlanAsCurrent = comparisonUpgradePlan === currentPlan;
  const comparisonCtaLabel = isSamePlanAsCurrent
    ? 'ניהול חבילה'
    : `שדרוג ל-${comparisonUpgradeLabel}`;

  const openPackageManager = (targetPlan?: 'pro' | 'unlimited') => {
    const fallbackPlan =
      comparisonSelectedPlan === 'unlimited' ? 'unlimited' : 'pro';
    const initialPlan = targetPlan ?? fallbackPlan;
    const reason: UpgradeReason =
      requestedUpgradeReasonParam ??
      (entitlements && !entitlements.isSubscriptionActive
        ? 'subscription_inactive'
        : 'feature_locked');
    const featureKey =
      requestedFeatureKeyParam?.trim() || 'business_subscription';

    setUpgradePlan(initialPlan);
    setUpgradeReason(reason);
    setUpgradeFeatureKey(featureKey);
    setIsUpgradeVisible(true);
  };

  if (!activeBusinessId) {
    return (
      <SafeAreaView style={styles.emptyState}>
        <Text style={styles.emptyStateText}>לא נמצא עסק פעיל.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingTop: (insets.top || 0) + 12 },
        ]}
      >
        <BusinessScreenHeader
          title="מנוי וחבילה"
          subtitle="סטטוס מנוי, מגבלות שימוש והשוואת מסלולים"
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

        <View style={styles.upgradeBanner}>
          <Text style={styles.bannerEyebrow}>המלצת שדרוג</Text>
          <Text style={styles.bannerTitle}>
            {upgradeTargetPlan && upgradeTargetLabel
              ? `שדרג לחבילת ${upgradeTargetLabel}`
              : `אתם במסלול ${currentPlanLabel}`}
          </Text>
          <Text style={styles.bannerSubtitle}>
            {upgradeTargetPlan
              ? "פתחו יותר פיצ'רים, מגבלות שימוש גבוהות יותר ויכולות AI מתקדמות."
              : 'אתם כבר במסלול הגבוה ביותר. אפשר לנהל את החבילה ולעדכן מחזור חיוב.'}
          </Text>

          <TouchableOpacity
            onPress={() => openPackageManager(upgradeTargetPlan ?? 'unlimited')}
            disabled={isEntitlementsLoading}
            style={[
              styles.bannerButton,
              isEntitlementsLoading ? styles.disabled : null,
            ]}
          >
            {isEntitlementsLoading ? (
              <ActivityIndicator color="#1D4ED8" size="small" />
            ) : (
              <Text style={styles.bannerButtonText}>
                {upgradeTargetPlan && upgradeTargetLabel
                  ? `שדרוג ל-${upgradeTargetLabel}`
                  : 'ניהול חבילה'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View
          style={styles.sectionCard}
          onLayout={(event) => {
            comparisonSectionOffsetRef.current = event.nativeEvent.layout.y;
            focusComparisonSection();
          }}
        >
          <Text style={styles.sectionTitle}>פרטי מנוי</Text>

          {isEntitlementsLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : (
            <View style={styles.statusTable}>
              {statusRows.map((row, index) => (
                <View
                  key={row.label}
                  style={[
                    styles.statusRow,
                    index < statusRows.length - 1
                      ? styles.statusRowDivider
                      : null,
                  ]}
                >
                  <Text style={styles.statusLabel}>{row.label}</Text>
                  <Text style={styles.statusValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>השוואת חבילות</Text>
          <Text style={styles.sectionSubtitle}>
            השוואה מלאה בין שלושת המסלולים, כולל מגבלות ופיצ'רים.
          </Text>

          <PlanComparisonTable
            plans={normalizedPlanCatalog}
            rows={comparisonRows}
            selectedPlan={comparisonSelectedPlan}
            billingPeriod={comparisonBillingPeriod}
            onSelectPlan={setComparisonSelectedPlan}
            onBillingPeriodChange={setComparisonBillingPeriod}
            popularPlan="pro"
            popularLabel="הכי פופולרי"
          />

          <TouchableOpacity
            onPress={() => openPackageManager(comparisonUpgradePlan)}
            style={styles.compareCta}
          >
            <Text style={styles.compareCtaText}>{comparisonCtaLabel}</Text>
          </TouchableOpacity>
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
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    gap: 12,
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
  upgradeBanner: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 8,
  },
  bannerEyebrow: {
    color: '#BFDBFE',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    textAlign: TEXT_START,
    letterSpacing: 0.8,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
    textAlign: TEXT_START,
  },
  bannerSubtitle: {
    color: '#DBEAFE',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: TEXT_START,
  },
  bannerButton: {
    marginTop: 4,
    minHeight: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  },
  bannerButtonText: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  sectionCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionTitle: {
    color: '#1A2B4A',
    fontSize: 17,
    fontWeight: '900',
    textAlign: TEXT_START,
  },
  sectionSubtitle: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    textAlign: TEXT_START,
    lineHeight: 18,
  },
  loadingWrap: {
    marginTop: 12,
    minHeight: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusTable: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  statusRow: {
    flexDirection: ROW_DIRECTION,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  statusRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  statusLabel: {
    flex: 1,
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
    textAlign: TEXT_START,
  },
  statusValue: {
    flex: 1,
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
    textAlign: TEXT_END,
  },
  compareCta: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 12,
  },
  compareCtaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.7,
  },
});
