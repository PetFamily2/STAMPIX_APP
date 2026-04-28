import { StyleSheet, View } from 'react-native';

import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';

import { DailyKpiCard } from './DailyKpiCard';

type Tone = 'teal' | 'violet' | 'blue' | 'amber';

export function DailyKpiGrid({
  layoutMode,
  items,
}: {
  layoutMode: DashboardLayoutMode;
  items: Array<{
    key: string;
    label: string;
    metaLabel: string;
    value: string;
    icon:
      | 'ticket-outline'
      | 'gift-outline'
      | 'people-outline'
      | 'alert-circle-outline'
      | 'scan-outline'
      | 'warning-outline';
    tone: Tone;
    trend: { direction: 'up' | 'down' | 'flat'; label: string } | null;
    comparisonText: string;
  }>;
}) {
  const layout = getDashboardLayout(layoutMode);

  return (
    <View style={[styles.card, { borderRadius: layout.cardRadius }]}>
      <View style={styles.row}>
        {items.map((item, index) => (
          <View
            key={item.key}
            style={[
              styles.cell,
              index < items.length - 1 ? styles.cellDivider : null,
            ]}
          >
            <DailyKpiCard
              layoutMode={layoutMode}
              label={item.label}
              metaLabel={item.metaLabel}
              value={item.value}
              icon={item.icon}
              tone={item.tone}
              trend={item.trend}
              comparisonText={item.comparisonText}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#EEF2F7',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
  },
  cell: {
    flex: 1,
    paddingHorizontal: 8,
  },
  cellDivider: {
    borderLeftWidth: 1,
    borderLeftColor: '#EDF2F8',
  },
});
