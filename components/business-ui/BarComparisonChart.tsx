import { StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';
import { ChartCardShell } from './ChartCardShell';

export type BarDatum = {
  label: string;
  value: number;
};

export function BarComparisonChart({
  title,
  subtitle,
  data,
  color = DASHBOARD_TOKENS.colors.brandBlue,
}: {
  title: string;
  subtitle?: string;
  data: BarDatum[];
  color?: string;
}) {
  const trimmed = data.slice(0, 5).map((item) => ({
    label: item.label,
    value: Math.max(item.value, 0),
  }));
  const chartData =
    trimmed.length > 0
      ? trimmed
      : [
          {
            label: '-',
            value: 0,
          },
        ];
  const maxValue = Math.max(1, ...trimmed.map((item) => item.value));
  const leadPercent = Math.min(
    100,
    Math.round(((trimmed[0]?.value ?? 0) / maxValue) * 100 || 0)
  );

  return (
    <ChartCardShell title={title} subtitle={subtitle}>
      <View style={styles.chartBox}>
        <View style={styles.plotArea}>
          {chartData.map((item, index) => {
            const percent = Math.max(
              5,
              Math.round((item.value / maxValue) * 100)
            );
            return (
              <View key={`${item.label}-${index}`} style={styles.column}>
                <View style={styles.columnTrack}>
                  <View
                    style={[
                      styles.columnFill,
                      {
                        height: `${percent}%`,
                        backgroundColor: color,
                        opacity: item.value <= 0 ? 0.24 : 1,
                      },
                    ]}
                  />
                </View>
                <Text
                  className={tw.textStart}
                  style={styles.columnLabel}
                  numberOfLines={1}
                >
                  {item.label.slice(0, 8)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      <View
        style={[
          styles.progress,
          {
            width: `${leadPercent}%`,
          },
        ]}
      />
    </ChartCardShell>
  );
}

const styles = StyleSheet.create({
  chartBox: {
    height: DASHBOARD_TOKENS.chartHeightMd,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EEF2F8',
    backgroundColor: '#FCFDFF',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
  },
  plotArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  columnTrack: {
    height: '100%',
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#EDF3FB',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  columnFill: {
    width: '100%',
    borderRadius: 12,
    minHeight: 6,
  },
  columnLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  progress: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#93C5FD',
  },
});
