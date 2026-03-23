import { StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';
import { ChartCardShell } from './ChartCardShell';

export type RankingDatum = {
  label: string;
  value: number;
};

export function HorizontalRankingChart({
  title,
  subtitle,
  data,
  color = DASHBOARD_TOKENS.colors.teal,
}: {
  title: string;
  subtitle?: string;
  data: RankingDatum[];
  color?: string;
}) {
  const chartData = data.slice(0, 6).map((item) => ({
    label: item.label,
    value: Math.max(item.value, 0),
  }));
  const maxValue = Math.max(1, ...chartData.map((item) => item.value));

  return (
    <ChartCardShell title={title} subtitle={subtitle}>
      <View style={styles.chartBox}>
        {chartData.length > 0 ? (
          chartData.map((item) => {
            const fillPercent = Math.max(
              6,
              Math.round((item.value / maxValue) * 100)
            );
            return (
              <View key={item.label} style={styles.row}>
                <View style={styles.rowTextWrap}>
                  <Text
                    className={tw.textStart}
                    style={styles.rowLabel}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  <Text style={styles.rowValue}>
                    {item.value.toLocaleString('he-IL')}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${fillPercent}%`,
                        backgroundColor: color,
                        opacity: item.value <= 0 ? 0.24 : 1,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })
        ) : (
          <Text className={tw.textStart} style={styles.emptyText}>
            אין נתוני פעילות להצגה.
          </Text>
        )}
      </View>
    </ChartCardShell>
  );
}

const styles = StyleSheet.create({
  chartBox: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF2F8',
    backgroundColor: '#FCFDFF',
    padding: 12,
  },
  row: {
    gap: 6,
  },
  rowTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  rowValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E8EEF7',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
});
