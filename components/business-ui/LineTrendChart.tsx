import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { ChartCardShell } from './ChartCardShell';

export type TrendDatum = {
  label: string;
  value: number;
};

export function LineTrendChart({
  title,
  subtitle,
  data,
  color = DASHBOARD_TOKENS.colors.brandBlue,
}: {
  title: string;
  subtitle?: string;
  data: TrendDatum[];
  color?: string;
}) {
  const { width } = useWindowDimensions();
  const chartData = data.slice(0, 7).map((item) => ({
    label: item.label,
    value: Math.max(item.value, 0),
  }));
  const safeData =
    chartData.length > 0
      ? chartData
      : [
          {
            label: '-',
            value: 0,
          },
        ];
  const chartWidth = Math.max(220, Math.min(width - 74, 520));
  const chartHeight = DASHBOARD_TOKENS.chartHeightMd;
  const paddingX = 12;
  const paddingTop = 14;
  const paddingBottom = 20;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - (paddingTop + paddingBottom);
  const maxY = Math.max(1, ...safeData.map((item) => item.value));
  const baselineY = paddingTop + plotHeight;
  const points = useMemo(() => {
    const count = safeData.length;
    return safeData.map((item, index) => {
      const x =
        count <= 1
          ? paddingX + plotWidth / 2
          : paddingX + (plotWidth / (count - 1)) * index;
      const y = paddingTop + (1 - item.value / maxY) * plotHeight;
      return { x, y };
    });
  }, [maxY, plotHeight, plotWidth, safeData]);
  const linePath = useMemo(() => {
    if (points.length === 0) {
      return '';
    }
    const path = points.map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    );
    return path.join(' ');
  }, [points]);
  const areaPath = useMemo(() => {
    if (points.length === 0) {
      return '';
    }
    const start = points[0];
    const end = points[points.length - 1];
    return `M ${start.x.toFixed(2)} ${baselineY.toFixed(2)} ${linePath} L ${end.x.toFixed(
      2
    )} ${baselineY.toFixed(2)} Z`;
  }, [baselineY, linePath, points]);

  return (
    <ChartCardShell title={title} subtitle={subtitle}>
      <View style={styles.chartBox}>
        <Svg width={chartWidth} height={chartHeight}>
          <Defs>
            <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <Stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          {areaPath ? <Path d={areaPath} fill="url(#trendFill)" /> : null}
          {linePath ? (
            <Path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
      </View>
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
  },
});
