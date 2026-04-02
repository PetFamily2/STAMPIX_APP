import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { SurfaceCard, TrendIndicator } from '@/components/business-ui';
import { tw } from '@/lib/rtl';

type Tone = 'teal' | 'violet' | 'blue' | 'amber';

const TONE_MAP: Record<
  Tone,
  {
    bubble: readonly [string, string];
    icon: string;
  }
> = {
  teal: {
    bubble: ['#E9DDFF', '#F3ECFF'],
    icon: '#6D4BFF',
  },
  violet: {
    bubble: ['#DDF7F4', '#ECFDFC'],
    icon: '#0F766E',
  },
  blue: {
    bubble: ['#E7F9F7', '#EFFCFB'],
    icon: '#0F766E',
  },
  amber: {
    bubble: ['#FFE9F0', '#FFF5F8'],
    icon: '#DB2777',
  },
};

export function DailyKpiCard({
  label,
  metaLabel,
  value,
  icon,
  tone,
  trend,
  comparisonText,
}: {
  label: string;
  metaLabel: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  trend: { direction: 'up' | 'down' | 'flat'; label: string } | null;
  comparisonText: string;
}) {
  const palette = TONE_MAP[tone];

  return (
    <SurfaceCard radius="lg" padding="sm" elevated={false} style={styles.card}>
      <View style={styles.headerRow}>
        <LinearGradient colors={[...palette.bubble]} style={styles.iconBubble}>
          <Ionicons name={icon} size={16} color={palette.icon} />
        </LinearGradient>

        <View style={styles.copyWrap}>
          <Text className={tw.textStart} style={styles.label}>
            {label}
          </Text>
          <Text className={tw.textStart} style={styles.metaLabel}>
            {metaLabel}
          </Text>
        </View>
      </View>

      <View style={styles.metricRow}>
        <Text className={tw.textStart} numberOfLines={1} style={styles.value}>
          {value}
        </Text>
        <TrendIndicator trend={trend} />
      </View>

      <Text className={tw.textStart} style={styles.comparisonText}>
        {comparisonText}
      </Text>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 136,
    justifyContent: 'space-between',
    gap: 8,
    borderColor: '#E6EBF4',
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    color: '#111827',
  },
  metaLabel: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  metricRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  value: {
    flexShrink: 1,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    color: '#111827',
  },
  comparisonText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    color: '#64748B',
  },
});
