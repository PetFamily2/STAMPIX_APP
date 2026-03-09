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

type UpgradeReason =
  | 'feature_locked'
  | 'limit_reached'
  | 'subscription_inactive';

const ROW_DIRECTION = IS_RTL ? 'row-reverse' : 'row';
const TEXT_START = IS_RTL ? 'right' : 'left';
const TEXT_END = IS_RTL ? 'left' : 'right';

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
  return `${used} / ${limit}`;
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
  const router = useRouter();
  const params = useLocalSearchParams<{
    focus?: string | string[];
    recommendedPlan?: string | string[];
    upgradeReason?: string | string[];
    featureKey?: string | string[];
    autoOpenUpgrade?: string | string[];
  }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const comparisonSectionOffsetRef = useRef(0);
  const hasAutoFocusedComparisonRef = useRef(false);
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

  const focusParam = firstParam(params.focus);
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
        `כרטיסי נאמנות: ${formatLimit(
          cardsStatus.currentValue,
          cardsStatus.limitValue
        )}`
      );
    }
    if (customersStatus.isNearLimit || customersStatus.isAtLimit) {
      warnings.push(
        `לקוחות: ${formatLimit(
          customersStatus.currentValue,
          customersStatus.limitValue
        )}`
      );
    }
    if (aiStatus.isNearLimit || aiStatus.isAtLimit) {
      warnings.push(
        `קמפייני שימור פעילים: ${formatLimit(aiStatus.currentValue, aiStatus.limitValue)}`
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
      const selectedTarget =
        targetPlan ??
        (comparisonSelectedPlan === 'premium' ? 'premium' : 'pro');

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
        y: Math.max(0, comparisonSectionOffsetRef.current - 12),
        animated: true,
      });
    });
  }, [focusParam]);

  useEffect(() => {
    focusComparisonSection();
  }, [focusComparisonSection]);

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
    comparisonUpgradePlan === currentPlan
      ? 'ניהול המסלול הנוכחי'
      : `שדרוג ל-${PLAN_LABELS[comparisonUpgradePlan]}`;

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
          title="מסלול וחיוב"
          subtitle="הבנה ברורה של המסלול, השימוש בפועל והאפשרויות לשדרוג"
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
          <Text style={styles.heroEyebrow}>המסלול הנוכחי</Text>
          <Text style={styles.heroTitle}>{currentPlanLabel}</Text>
          <Text style={styles.heroSubtitle}>
            {nextPlan && nextPlanLabel
              ? `${currentPlanLabel} פעיל כרגע. שדרוג ל-${nextPlanLabel} יגדיל מכסות ויפתח יכולות נוספות לעסק.`
              : 'אתם כבר במסלול הגבוה ביותר. כאן אפשר לעקוב אחרי השימוש ולהשוות מול מה שכלול במסלול.'}
          </Text>
          <TouchableOpacity
            onPress={() => openUpgrade(nextPlan ?? 'premium')}
            disabled={isLoading}
            style={[styles.heroButton, isLoading ? styles.disabled : null]}
          >
            {isLoading ? (
              <ActivityIndicator color="#1D4ED8" size="small" />
            ) : (
              <Text style={styles.heroButtonText}>
                {nextPlan ? `שדרוג ל-${nextPlanLabel}` : 'ניהול מסלול'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>שימוש ומגבלות</Text>
          {isLoading || usageSummary === undefined ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : (
            <View style={styles.usageGrid}>
              <View style={styles.usageCard}>
                <Text style={styles.usageLabel}>חיוב</Text>
                <Text style={styles.usageValue}>
                  {entitlements?.billingPeriod
                    ? BILLING_PERIOD_LABELS[entitlements.billingPeriod]
                    : 'ללא חיוב'}
                </Text>
                <Text style={styles.usageHint}>
                  סטטוס: {currentStatusLabel}
                </Text>
              </View>
              <View style={styles.usageCard}>
                <Text style={styles.usageLabel}>כרטיסים</Text>
                <Text style={styles.usageValue}>
                  {formatLimit(
                    usageSummary?.cardsUsed ?? 0,
                    cardsStatus.limitValue
                  )}
                </Text>
                <Text style={styles.usageHint}>כרטיסי נאמנות פעילים</Text>
              </View>
              <View style={styles.usageCard}>
                <Text style={styles.usageLabel}>לקוחות</Text>
                <Text style={styles.usageValue}>
                  {formatLimit(
                    usageSummary?.customersUsed ?? 0,
                    customersStatus.limitValue
                  )}
                </Text>
                <Text style={styles.usageHint}>לקוחות פעילים בעסק</Text>
              </View>
              <View style={styles.usageCard}>
                <Text style={styles.usageLabel}>קמפייני שימור פעילים</Text>
                <Text style={styles.usageValue}>
                  {formatLimit(
                    usageSummary?.activeRetentionActionsUsed ?? 0,
                    aiStatus.limitValue
                  )}
                </Text>
                <Text style={styles.usageHint}>כמות פעילה כרגע</Text>
              </View>
            </View>
          )}

          {usageWarnings.length > 0 ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>שימו לב</Text>
              {usageWarnings.map((warning) => (
                <Text key={warning} style={styles.warningText}>
                  • {warning}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <View
          style={styles.sectionCard}
          onLayout={(event) => {
            comparisonSectionOffsetRef.current = event.nativeEvent.layout.y;
            focusComparisonSection();
          }}
        >
          <Text style={styles.sectionTitle}>השוואת מסלולים</Text>
          <Text style={styles.sectionSubtitle}>
            כל המסכים משתמשים באותו קטלוג מסלולים, ולכן ההשוואה כאן תואמת בדיוק
            למה שנאכף בשרת ומה שמופיע ב-upgrade flow.
          </Text>

          <PlanComparisonTable
            plans={normalizedPlanCatalog}
            rows={comparisonRows}
            selectedPlan={comparisonSelectedPlan}
            billingPeriod={comparisonBillingPeriod}
            onSelectPlan={setComparisonSelectedPlan}
            onBillingPeriodChange={setComparisonBillingPeriod}
            popularPlan="pro"
            popularLabel="המסלול המרכזי"
          />

          <TouchableOpacity
            onPress={() => openUpgrade(comparisonUpgradePlan)}
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
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 8,
  },
  heroEyebrow: {
    color: '#BFDBFE',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    textAlign: TEXT_START,
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    textAlign: TEXT_START,
  },
  heroSubtitle: {
    color: '#DBEAFE',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: TEXT_START,
  },
  heroButton: {
    marginTop: 4,
    minHeight: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  },
  heroButtonText: {
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
  usageGrid: {
    marginTop: 12,
    flexDirection: ROW_DIRECTION,
    flexWrap: 'wrap',
    gap: 10,
  },
  usageCard: {
    width: '48.5%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'flex-end',
    gap: 4,
  },
  usageLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    textAlign: TEXT_START,
  },
  usageValue: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '900',
    textAlign: TEXT_END,
  },
  usageHint: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    textAlign: TEXT_END,
  },
  warningCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  warningTitle: {
    color: '#9A3412',
    fontSize: 12,
    fontWeight: '900',
    textAlign: TEXT_START,
  },
  warningText: {
    color: '#C2410C',
    fontSize: 12,
    fontWeight: '600',
    textAlign: TEXT_START,
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
