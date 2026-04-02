import { StyleSheet, View } from 'react-native';

import { LifetimeMetricCard } from './LifetimeMetricCard';

export function LifetimeMetricsRow({
  metrics,
}: {
  metrics: Array<{
    key: string;
    label: string;
    value: string;
    icon:
      | 'ticket-outline'
      | 'gift-outline'
      | 'person-add-outline'
      | 'people-outline';
    tone: 'teal' | 'violet' | 'blue' | 'amber';
    helperText?: string;
  }>;
}) {
  return (
    <View style={styles.row}>
      {metrics.map((metric) => (
        <LifetimeMetricCard
          key={metric.key}
          label={metric.label}
          value={metric.value}
          icon={metric.icon}
          tone={metric.tone}
          helperText={metric.helperText}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
});
