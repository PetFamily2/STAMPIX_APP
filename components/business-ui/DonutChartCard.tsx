import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';
import { ChartCardShell } from './ChartCardShell';

export type DonutDatum = {
  label: string;
  value: number;
  color: string;
};

export function DonutChartCard({
  title,
  subtitle,
  data,
  centerLabel,
  centerValue,
}: {
  title: string;
  subtitle?: string;
  data: DonutDatum[];
  centerLabel: string;
  centerValue: string;
}) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width - 72, 290);
  const chartHeight = DASHBOARD_TOKENS.chartHeightMd;
  const normalizedData = data.map((item) => ({
    label: item.label,
    value: Math.max(item.value, 0),
    color: item.color,
  }));
  const hasPositiveData = normalizedData.some((item) => item.value > 0);
  const pieData =
    normalizedData.length > 0
      ? hasPositiveData
        ? normalizedData
        : normalizedData.map((item, index) => ({
            ...item,
            value: index === 0 ? 1 : 0,
          }))
      : [
          {
            label: 'אין נתונים',
            value: 1,
            color: '#CBD5E1',
          },
        ];
  const legendData = normalizedData.length > 0 ? normalizedData : pieData;
  const totalValue = pieData.reduce((sum, item) => sum + item.value, 0);
  const size = Math.min(chartWidth, chartHeight);
  const center = size / 2;
  const strokeWidth = 26;
  const radius = Math.max(32, size / 2 - strokeWidth / 2 - 4);
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;

  return (
    <ChartCardShell title={title} subtitle={subtitle}>
      <View style={styles.chartWrap}>
        <View
          style={[
            styles.chartCanvas,
            {
              width: size,
              height: size,
            },
          ]}
        >
          <Svg width={size} height={size}>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke="#E5ECF8"
              strokeWidth={strokeWidth}
              fill="none"
            />
            {pieData.map((item) => {
              const segment =
                totalValue > 0 ? (item.value / totalValue) * circumference : 0;
              const dashOffset = -consumed;
              consumed += segment;
              return (
                <Circle
                  key={item.label}
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${segment} ${circumference}`}
                  strokeDashoffset={dashOffset}
                  transform={`rotate(-90 ${center} ${center})`}
                />
              );
            })}
          </Svg>
          <View style={styles.center}>
            <Text className={tw.textStart} style={styles.centerLabel}>
              {centerLabel}
            </Text>
            <Text className={tw.textStart} style={styles.centerValue}>
              {centerValue}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.legendWrap}>
        {legendData.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>
    </ChartCardShell>
  );
}

const styles = StyleSheet.create({
  chartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartCanvas: {
    position: 'relative',
  },
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  centerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
  centerValue: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    color: DASHBOARD_TOKENS.colors.textPrimary,
  },
  legendWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
});
