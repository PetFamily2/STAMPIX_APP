import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { IS_RTL } from '@/lib/rtl';
import {
  buildComparisonRows,
  type ComparisonRow,
  type PlanCatalogItem,
  type PlanId,
} from '@/lib/subscription/planComparison';

type PlanComparisonTableProps = {
  plans: PlanCatalogItem[];
  rows?: ComparisonRow[];
  selectedPlan: PlanId;
  visiblePlans?: PlanId[];
};

const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'premium'];
const NARROW_BREAKPOINT = 400;

function renderCellText(
  row: ComparisonRow,
  planId: PlanId
): { text: string; isPositive: boolean } {
  const cell = row.cells[planId];

  if (cell.type === 'boolean') {
    return {
      text: cell.value ? '\u2713' : '-',
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
  visiblePlans,
}: PlanComparisonTableProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isNarrow = windowWidth <= NARROW_BREAKPOINT;

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

  const featureColumnFlex =
    orderedPlans.length <= 2 ? 1.55 : isNarrow ? 1.2 : 1.35;
  const planColumnFlex = orderedPlans.length <= 2 ? 1.05 : 1;

  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        <View
          style={[
            styles.featureCell,
            styles.headerCell,
            { flex: featureColumnFlex },
          ]}
        >
          <Text
            style={[
              styles.headerText,
              isNarrow ? styles.headerTextNarrow : null,
            ]}
          >
            פירוט
          </Text>
        </View>
        {orderedPlans.map((plan) => (
          <View
            key={plan.plan}
            style={[
              styles.planCell,
              styles.headerCell,
              { flex: planColumnFlex },
              selectedPlan === plan.plan ? styles.selectedColumn : null,
            ]}
          >
            <Text
              style={[
                styles.headerText,
                isNarrow ? styles.headerTextNarrow : null,
              ]}
              numberOfLines={2}
            >
              {plan.label}
            </Text>
          </View>
        ))}
      </View>

      {comparisonRows.map((row) => (
        <View key={row.id} style={styles.tableRow}>
          <View style={[styles.featureCell, { flex: featureColumnFlex }]}>
            <Text
              style={[
                styles.featureLabel,
                isNarrow ? styles.featureLabelNarrow : null,
              ]}
              numberOfLines={2}
            >
              {isNarrow && row.compactLabel ? row.compactLabel : row.label}
            </Text>
          </View>
          {orderedPlans.map((plan) => {
            const { text, isPositive } = renderCellText(row, plan.plan);
            const isBooleanCell = row.cells[plan.plan].type === 'boolean';

            return (
              <View
                key={`${row.id}:${plan.plan}`}
                style={[
                  styles.planCell,
                  { flex: planColumnFlex },
                  selectedPlan === plan.plan ? styles.selectedColumn : null,
                ]}
              >
                <Text
                  style={[
                    styles.cellText,
                    isNarrow ? styles.cellTextNarrow : null,
                    isBooleanCell && !isPositive ? styles.cellTextMuted : null,
                    isBooleanCell && isPositive
                      ? styles.cellTextPositive
                      : null,
                  ]}
                  numberOfLines={2}
                >
                  {text}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D6E2F6',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    backgroundColor: '#F8FAFF',
  },
  tableRow: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    borderTopWidth: 1,
    borderTopColor: '#EBF1FA',
  },
  headerCell: {
    minHeight: 46,
    justifyContent: 'center',
  },
  featureCell: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  planCell: {
    paddingHorizontal: 6,
    paddingVertical: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedColumn: {
    backgroundColor: '#EEF4FF',
  },
  headerText: {
    color: '#0F172A',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  headerTextNarrow: {
    fontSize: 11,
    lineHeight: 14,
  },
  featureLabel: {
    color: '#1E293B',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  featureLabelNarrow: {
    fontSize: 10,
    lineHeight: 14,
  },
  cellText: {
    color: '#0F172A',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  cellTextNarrow: {
    fontSize: 10,
    lineHeight: 14,
  },
  cellTextMuted: {
    color: '#94A3B8',
  },
  cellTextPositive: {
    color: '#15803D',
  },
});
