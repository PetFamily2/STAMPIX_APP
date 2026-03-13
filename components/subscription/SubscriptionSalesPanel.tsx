import type { ReactNode } from 'react';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { PlanComparisonTable } from '@/components/subscription/PlanComparisonTable';
import { BILLING_PERIOD_LABELS, type BillingPeriod } from '@/config/appConfig';
import { IS_RTL } from '@/lib/rtl';
import {
  buildComparisonRows,
  type ComparisonRow,
  computeAnnualSavings,
  computeEquivalentMonthlyPrice,
  formatPlanPrice,
  type PlanCatalogItem,
  type PlanId,
} from '@/lib/subscription/planComparison';

type SubscriptionSalesContext =
  | 'paywall'
  | 'onboarding'
  | 'settings'
  | 'upgrade';

type SubscriptionSalesPanelProps = {
  plans: PlanCatalogItem[];
  rows?: ComparisonRow[];
  selectedPlan: PlanId;
  billingPeriod: BillingPeriod;
  visiblePlans?: PlanId[];
  currentPlan?: PlanId;
  context: SubscriptionSalesContext;
  ctaLabel: string;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
  footerNote?: string;
  footerNoteTone?: 'default' | 'error';
  footerInsetBottom?: number;
  footerBottomSlot?: ReactNode;
  onSelectPlan: (plan: PlanId) => void;
  onBillingPeriodChange: (period: BillingPeriod) => void;
  onPressCta: () => void;
};

const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'premium'];
const COMPACT_BREAKPOINT = 392;

export function SubscriptionSalesPanel({
  plans,
  rows,
  selectedPlan,
  billingPeriod,
  visiblePlans,
  currentPlan,
  context,
  ctaLabel,
  ctaDisabled = false,
  ctaLoading = false,
  footerNote,
  footerNoteTone = 'default',
  footerInsetBottom = 0,
  footerBottomSlot,
  onSelectPlan,
  onBillingPeriodChange,
  onPressCta,
}: SubscriptionSalesPanelProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isCompact = windowWidth <= COMPACT_BREAKPOINT || context === 'upgrade';

  const orderedPlans = useMemo(() => {
    const visibleOrder =
      visiblePlans && visiblePlans.length > 0
        ? PLAN_ORDER.filter((planId) => visiblePlans.includes(planId))
        : PLAN_ORDER;
    const byPlan = new Map<PlanId, PlanCatalogItem>(
      plans.map((plan) => [plan.plan, plan])
    );

    return visibleOrder
      .map((planId) => byPlan.get(planId))
      .filter((plan): plan is PlanCatalogItem => Boolean(plan));
  }, [plans, visiblePlans]);

  const comparisonRows = useMemo(
    () => rows ?? buildComparisonRows(orderedPlans),
    [orderedPlans, rows]
  );

  const selectedPlanCard =
    orderedPlans.find((plan) => plan.plan === selectedPlan) ?? orderedPlans[0];

  if (!selectedPlanCard) {
    return null;
  }

  const equivalentMonthly =
    selectedPlanCard.plan !== 'starter' && billingPeriod === 'yearly'
      ? computeEquivalentMonthlyPrice(selectedPlanCard.pricing)
      : null;
  const annualSavings =
    selectedPlanCard.plan !== 'starter' && billingPeriod === 'yearly'
      ? computeAnnualSavings(selectedPlanCard.pricing)
      : null;
  const footerSummaryLabel =
    currentPlan && currentPlan === selectedPlanCard.plan
      ? 'המסלול הפעיל'
      : 'המסלול שבחרת';

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={styles.selectorRow}>
          {orderedPlans.map((plan) => {
            const active = plan.plan === selectedPlanCard.plan;
            const isCurrentPlan = currentPlan === plan.plan;

            return (
              <Pressable
                key={plan.plan}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onSelectPlan(plan.plan)}
                style={[
                  styles.selectorButton,
                  isCompact ? styles.selectorButtonCompact : null,
                  active ? styles.selectorButtonActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.selectorText,
                    isCompact ? styles.selectorTextCompact : null,
                    active ? styles.selectorTextActive : null,
                  ]}
                  numberOfLines={2}
                >
                  {plan.label}
                </Text>
                {isCurrentPlan ? (
                  <View
                    style={[
                      styles.currentPlanBadge,
                      active ? styles.currentPlanBadgeActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.currentPlanBadgeText,
                        active ? styles.currentPlanBadgeTextActive : null,
                      ]}
                      numberOfLines={1}
                    >
                      פעיל
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.tableWrap}>
          <PlanComparisonTable
            plans={plans}
            rows={comparisonRows}
            selectedPlan={selectedPlanCard.plan}
            visiblePlans={visiblePlans}
          />
        </View>
      </View>

      <View style={[styles.footerWrap, { paddingBottom: footerInsetBottom }]}>
        <View style={styles.footerCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryTextWrap}>
              <Text style={styles.summaryEyebrow}>{footerSummaryLabel}</Text>
              <Text
                style={[
                  styles.summaryPlanName,
                  isCompact ? styles.summaryPlanNameCompact : null,
                ]}
                numberOfLines={1}
              >
                {selectedPlanCard.label}
              </Text>
            </View>

            {annualSavings ? (
              <View style={styles.savingsBadge}>
                <Text style={styles.savingsText}>
                  חיסכון ₪{formatPlanPrice(annualSavings.amount)} (
                  {annualSavings.percent}%)
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.billingToggleRow}>
            {(['monthly', 'yearly'] as const).map((period) => {
              const active = billingPeriod === period;

              return (
                <Pressable
                  key={period}
                  onPress={() => onBillingPeriodChange(period)}
                  style={[
                    styles.billingToggleButton,
                    active ? styles.billingToggleButtonActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.billingToggleText,
                      active ? styles.billingToggleTextActive : null,
                    ]}
                  >
                    {BILLING_PERIOD_LABELS[period]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.priceBlock}>
            {selectedPlanCard.plan === 'starter' ? (
              <>
                <Text style={styles.priceHeadline}>חינם</Text>
                <Text style={styles.priceSubline}>
                  ללא עלות חודשית או שנתית
                </Text>
              </>
            ) : billingPeriod === 'yearly' && equivalentMonthly ? (
              <>
                <View style={styles.priceHeadlineRow}>
                  <Text style={styles.priceHeadline}>
                    ₪{formatPlanPrice(equivalentMonthly)}
                  </Text>
                  <Text style={styles.pricePeriod}>לחודש</Text>
                </View>
                <Text style={styles.priceSubline}>
                  ₪{formatPlanPrice(selectedPlanCard.pricing.yearly)} לשנה
                </Text>
              </>
            ) : (
              <>
                <View style={styles.priceHeadlineRow}>
                  <Text style={styles.priceHeadline}>
                    ₪
                    {formatPlanPrice(
                      billingPeriod === 'monthly'
                        ? selectedPlanCard.pricing.monthly
                        : selectedPlanCard.pricing.yearly
                    )}
                  </Text>
                  <Text style={styles.pricePeriod}>
                    {billingPeriod === 'monthly' ? 'לחודש' : 'לשנה'}
                  </Text>
                </View>
                <Text style={styles.priceSubline}>
                  {billingPeriod === 'monthly'
                    ? 'חיוב חודשי מתחדש'
                    : 'חיוב שנתי מתחדש'}
                </Text>
              </>
            )}
          </View>

          {footerNote ? (
            <Text
              style={[
                styles.footerNote,
                footerNoteTone === 'error' ? styles.footerNoteError : null,
              ]}
            >
              {footerNote}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: ctaDisabled || ctaLoading }}
            onPress={onPressCta}
            disabled={ctaDisabled || ctaLoading}
            style={[
              styles.ctaButton,
              ctaDisabled ? styles.ctaButtonDisabled : null,
            ]}
          >
            {ctaLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            )}
          </Pressable>

          {footerBottomSlot ? footerBottomSlot : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 12,
  },
  content: {
    flex: 1,
    gap: 10,
  },
  selectorRow: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    gap: 8,
  },
  selectorButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CFE0F7',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  selectorButtonCompact: {
    minHeight: 50,
    borderRadius: 16,
  },
  selectorButtonActive: {
    borderColor: '#2F6BFF',
    backgroundColor: '#EAF2FF',
  },
  selectorText: {
    color: '#0F172A',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  selectorTextCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  selectorTextActive: {
    color: '#1D4ED8',
  },
  currentPlanBadge: {
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  currentPlanBadgeActive: {
    backgroundColor: '#D9E8FF',
  },
  currentPlanBadgeText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
  },
  currentPlanBadgeTextActive: {
    color: '#1D4ED8',
  },
  tableWrap: {
    flex: 1,
    minHeight: 0,
  },
  footerWrap: {
    paddingTop: 2,
  },
  footerCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D6E2F6',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    shadowColor: '#2F6BFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  summaryHeader: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryTextWrap: {
    flex: 1,
    alignItems: IS_RTL ? 'flex-end' : 'flex-start',
    gap: 2,
  },
  summaryEyebrow: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  summaryPlanName: {
    color: '#0F172A',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  summaryPlanNameCompact: {
    fontSize: 17,
  },
  savingsBadge: {
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  savingsText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '800',
  },
  billingToggleRow: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    gap: 8,
  },
  billingToggleButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7E4F8',
    backgroundColor: '#F8FBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  billingToggleButtonActive: {
    borderColor: '#2F6BFF',
    backgroundColor: '#DCEBFF',
  },
  billingToggleText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  billingToggleTextActive: {
    color: '#1D4ED8',
  },
  priceBlock: {
    alignItems: IS_RTL ? 'flex-end' : 'flex-start',
    gap: 2,
  },
  priceHeadlineRow: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  priceHeadline: {
    color: '#0F172A',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  pricePeriod: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  priceSubline: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  footerNote: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  footerNoteError: {
    color: '#DC2626',
  },
  ctaButton: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#2F56D6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
});
