import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';

import { DailyKpiCard } from './DailyKpiCard';

const SCREEN_WIDTH = Dimensions.get('window').width;
const KPI_CARD_WIDTH = Math.max(
  112,
  Math.min(132, Math.round((SCREEN_WIDTH - 52) / 3))
);

export function DailyKpiGrid({
  items,
}: {
  items: Array<{
    key: string;
    label: string;
    metaLabel: string;
    value: string;
    icon:
      | 'ticket-outline'
      | 'gift-outline'
      | 'people-outline'
      | 'alert-circle-outline';
    tone: 'teal' | 'violet' | 'blue' | 'amber';
    trend: { direction: 'up' | 'down' | 'flat'; label: string } | null;
    comparisonText: string;
  }>;
}) {
  return (
    <ScrollView
      horizontal={true}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((item) => (
        <View key={item.key} style={styles.cardSlot}>
          <DailyKpiCard
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    gap: 8,
    paddingHorizontal: 1,
  },
  cardSlot: {
    width: KPI_CARD_WIDTH,
  },
});
