import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';

type Tone = 'teal' | 'violet' | 'blue' | 'amber';

const TONE_MAP: Record<
  Tone,
  { iconBg: string; iconColor: string; trendColor: string; value: string }
> = {
  teal: {
    iconBg: '#DFF8F3',
    iconColor: '#0F766E',
    trendColor: '#16A34A',
    value: '#16A34A',
  },
  violet: {
    iconBg: '#F3E8FF',
    iconColor: '#7C3AED',
    trendColor: '#16A34A',
    value: '#5B3DF5',
  },
  blue: {
    iconBg: '#DBEAFE',
    iconColor: '#1D4ED8',
    trendColor: '#16A34A',
    value: '#1473E6',
  },
  amber: {
    iconBg: '#FEF3C7',
    iconColor: '#B45309',
    trendColor: '#16A34A',
    value: '#EF4444',
  },
};

export function DailyKpiCard({
  layoutMode,
  label,
  metaLabel: _metaLabel,
  value,
  icon,
  tone,
  trend,
  comparisonText,
}: {
  layoutMode: DashboardLayoutMode;
  label: string;
  metaLabel: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  trend: { direction: 'up' | 'down' | 'flat'; label: string } | null;
  comparisonText: string;
}) {
  const layout = getDashboardLayout(layoutMode);
  const palette = TONE_MAP[tone];
  const trendLabel = trend ? trend.label : comparisonText;

  return (
    <View style={styles.metricItem}>
      <View style={styles.iconArea}>
        <View style={[styles.iconBubble, { backgroundColor: palette.iconBg }]}>
          <Ionicons name={icon} size={18} color={palette.iconColor} />
        </View>
      </View>

      <View style={styles.labelArea}>
        <Text className={tw.textStart} numberOfLines={2} style={styles.label}>
          {label}
        </Text>
      </View>

      <View style={styles.valueArea}>
        <Text
          adjustsFontSizeToFit={true}
          className={tw.textStart}
          minimumFontScale={0.72}
          numberOfLines={1}
          style={[
            styles.value,
            {
              color: palette.value,
              fontSize: layout.kpiValueSize,
              lineHeight: layout.kpiValueSize + 4,
            },
          ]}
        >
          {value}
        </Text>
      </View>

      <View style={styles.trendArea}>
        <Text
          style={[styles.trendText, { color: palette.trendColor }]}
          numberOfLines={1}
        >
          {trendLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  metricItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 108,
  },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconArea: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelArea: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  valueArea: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  trendArea: {
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  label: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.textMuted,
    textAlign: 'center',
  },
  value: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textAlign: 'center',
    letterSpacing: 0,
    width: '100%',
  },
  trendText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
