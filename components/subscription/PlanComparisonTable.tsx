import { Check } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BILLING_PERIOD_LABELS, type BillingPeriod } from '@/config/appConfig';
import { IS_RTL } from '@/lib/rtl';
import {
  buildComparisonRows,
  type ComparisonRow,
  computeAnnualSavings,
  getPlanPriceForPeriod,
  type PlanCatalogItem,
  type PlanId,
} from '@/lib/subscription/planComparison';

type PlanComparisonTableProps = {
  plans: PlanCatalogItem[];
  rows?: ComparisonRow[];
  selectedPlan: PlanId;
  billingPeriod: BillingPeriod;
  onSelectPlan: (plan: PlanId) => void;
  onBillingPeriodChange: (period: BillingPeriod) => void;
  popularPlan?: PlanId;
  popularLabel?: string;
};

const FEATURE_COLUMN_WIDTH = 190;
const PLAN_COLUMN_WIDTH = 118;
const TABLE_MIN_WIDTH = FEATURE_COLUMN_WIDTH + PLAN_COLUMN_WIDTH * 3;

const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'premium'];

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  if (Math.abs(value - Math.round(value)) < 0.001) {
    return String(Math.round(value));
  }

  return value.toFixed(2);
}

function renderCellText(
  row: ComparisonRow,
  planId: PlanId
): { text: string; isPositive: boolean } {
  const cell = row.cells[planId];
  if (cell.type === 'boolean') {
    return {
      text: cell.value ? '✓' : '—',
      isPositive: cell.value,
    };
  }

  return {
    text: cell.value,
    isPositive: true,
  };
}

export function PlanComparisonTable({
  plans,
  rows,
  selectedPlan,
  billingPeriod,
  onSelectPlan,
  onBillingPeriodChange,
  popularPlan = 'pro',
  popularLabel = 'הכי פופולרי',
}: PlanComparisonTableProps) {
  const orderedPlans = useMemo(() => {
    const byPlan = new Map<PlanId, PlanCatalogItem>(
      plans.map((plan) => [plan.plan, plan])
    );
    return PLAN_ORDER.map((planId) => byPlan.get(planId)).filter(
      (plan): plan is PlanCatalogItem => Boolean(plan)
    );
  }, [plans]);

  const comparisonRows = useMemo(
    () => rows ?? buildComparisonRows(orderedPlans),
    [orderedPlans, rows]
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.periodWrap}>
        {(['monthly', 'yearly'] as const).map((period) => {
          const active = billingPeriod === period;
          return (
            <Pressable
              key={period}
              onPress={() => onBillingPeriodChange(period)}
              style={[
                styles.periodButton,
                active ? styles.periodButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.periodText,
                  active ? styles.periodTextActive : null,
                ]}
              >
                {BILLING_PERIOD_LABELS[period]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.cardsWrap}>
        {orderedPlans.map((plan) => {
          const active = selectedPlan === plan.plan;
          const isPopular = plan.plan === popularPlan;
          const price = getPlanPriceForPeriod(plan, billingPeriod);
          const yearlySavings =
            plan.plan !== 'starter' && billingPeriod === 'yearly'
              ? computeAnnualSavings(plan.pricing)
              : null;
          const perLabel = billingPeriod === 'monthly' ? '/חודש' : '/שנה';

          return (
            <Pressable
              key={plan.plan}
              onPress={() => onSelectPlan(plan.plan)}
              style={[styles.planCard, active ? styles.planCardActive : null]}
            >
              {isPopular ? (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>{popularLabel}</Text>
                </View>
              ) : null}

              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.label}</Text>
                <View
                  style={[
                    styles.selectionDot,
                    active ? styles.selectionDotActive : null,
                  ]}
                >
                  {active ? (
                    <Check color="#FFFFFF" size={13} strokeWidth={3} />
                  ) : null}
                </View>
              </View>

              <View style={styles.priceWrap}>
                {plan.plan === 'starter' ? (
                  <Text style={styles.planPrice}>חינם</Text>
                ) : (
                  <Text style={styles.planPrice}>₪{formatPrice(price)}</Text>
                )}
                <Text style={styles.planPeriod}>{perLabel}</Text>
              </View>

              {yearlySavings ? (
                <View style={styles.savingsBadge}>
                  <Text style={styles.savingsText}>
                    חיסכון ₪{formatPrice(yearlySavings.amount)} (
                    {yearlySavings.percent}%)
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tableScrollContent}
      >
        <View style={[styles.table, { minWidth: TABLE_MIN_WIDTH }]}>
          <View style={styles.tableHeaderRow}>
            <View style={[styles.featureCell, styles.headerCell]}>
              <Text style={styles.headerText}>השוואת מסלולים</Text>
            </View>
            {orderedPlans.map((plan) => (
              <View
                key={plan.plan}
                style={[
                  styles.planCell,
                  styles.headerCell,
                  selectedPlan === plan.plan ? styles.selectedColumn : null,
                ]}
              >
                <Text style={styles.headerText}>{plan.label}</Text>
              </View>
            ))}
          </View>

          {comparisonRows.map((row) => (
            <View key={row.id} style={styles.tableRow}>
              <View style={styles.featureCell}>
                <Text style={styles.featureLabel}>{row.label}</Text>
              </View>
              {orderedPlans.map((plan) => {
                const { text, isPositive } = renderCellText(row, plan.plan);
                const isBooleanCell = row.cells[plan.plan].type === 'boolean';
                return (
                  <View
                    key={`${row.id}:${plan.plan}`}
                    style={[
                      styles.planCell,
                      selectedPlan === plan.plan ? styles.selectedColumn : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        isBooleanCell && !isPositive
                          ? styles.cellTextMuted
                          : null,
                        isBooleanCell && isPositive
                          ? styles.cellTextSuccess
                          : null,
                      ]}
                    >
                      {text}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
    gap: 14,
  },
  periodWrap: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    gap: 10,
  },
  periodButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodButtonActive: {
    borderColor: '#2563EB',
    backgroundColor: '#DBEAFE',
  },
  periodText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  periodTextActive: {
    color: '#1D4ED8',
  },
  cardsWrap: {
    gap: 10,
  },
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    position: 'relative',
    gap: 8,
  },
  planCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    alignSelf: IS_RTL ? 'flex-end' : 'flex-start',
    backgroundColor: '#0F172A',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    zIndex: 2,
  },
  popularBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  planHeader: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  planName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
    textAlign: IS_RTL ? 'right' : 'left',
    flex: 1,
  },
  selectionDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  selectionDotActive: {
    borderColor: '#1D4ED8',
    backgroundColor: '#1D4ED8',
  },
  priceWrap: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  planPrice: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '900',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  planPeriod: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  savingsBadge: {
    alignSelf: IS_RTL ? 'flex-end' : 'flex-start',
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  savingsText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '800',
  },
  tableScrollContent: {
    paddingBottom: 2,
  },
  table: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  tableHeaderRow: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    backgroundColor: '#F8FAFC',
  },
  tableRow: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
  },
  headerCell: {
    minHeight: 44,
    justifyContent: 'center',
  },
  featureCell: {
    width: FEATURE_COLUMN_WIDTH,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  planCell: {
    width: PLAN_COLUMN_WIDTH,
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedColumn: {
    backgroundColor: '#F1F5F9',
  },
  headerText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  featureLabel: {
    color: '#1E293B',
    fontSize: 12,
    fontWeight: '700',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  cellText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  cellTextMuted: {
    color: '#94A3B8',
  },
  cellTextSuccess: {
    color: '#15803D',
  },
});
