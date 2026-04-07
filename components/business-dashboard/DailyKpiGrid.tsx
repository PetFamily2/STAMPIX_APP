import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { SurfaceCard } from '@/components/business-ui';
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
    bubble: ['#EAF2FF', '#F4F8FF'],
    icon: '#2563EB',
  },
  violet: {
    bubble: ['#DBEAFE', '#EFF6FF'],
    icon: '#1D4ED8',
  },
  blue: {
    bubble: ['#DFF4FF', '#F0F9FF'],
    icon: '#0284C7',
  },
  amber: {
    bubble: ['#EAF2FF', '#F7FAFF'],
    icon: '#2F6BFF',
  },
};

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
    tone: Tone;
    trend: { direction: 'up' | 'down' | 'flat'; label: string } | null;
    comparisonText: string;
  }>;
}) {
  return (
    <SurfaceCard elevated={false} padding="sm" radius="lg" style={styles.card}>
      <View style={styles.row}>
        {items.map((item, index) => {
          const palette = TONE_MAP[item.tone];
          const helperText =
            item.trend && item.trend.direction !== 'flat'
              ? item.trend.label
              : item.comparisonText;

          return (
            <View
              key={item.key}
              style={[
                styles.segment,
                index < items.length - 1 ? styles.segmentDivider : null,
              ]}
            >
              <View style={styles.metricRow}>
                <LinearGradient
                  colors={[...palette.bubble]}
                  style={styles.iconBubble}
                >
                  <Ionicons name={item.icon} size={14} color={palette.icon} />
                </LinearGradient>

                <Text
                  className={tw.textStart}
                  numberOfLines={1}
                  style={styles.value}
                >
                  {item.value}
                </Text>
              </View>

              <Text
                className={tw.textStart}
                numberOfLines={2}
                style={styles.label}
              >
                {item.label}
              </Text>

              <Text
                className={tw.textStart}
                numberOfLines={1}
                style={styles.metaLabel}
              >
                {item.metaLabel}
              </Text>

              <Text
                className={tw.textStart}
                numberOfLines={1}
                style={styles.helperText}
              >
                {helperText}
              </Text>
            </View>
          );
        })}
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: '#E6EBF4',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  segment: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
    gap: 4,
    paddingHorizontal: 5,
  },
  segmentDivider: {
    borderRightWidth: 1,
    borderRightColor: '#EEF2F7',
  },
  metricRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  iconBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  value: {
    flex: 1,
    minWidth: 0,
    fontSize: 19,
    lineHeight: 22,
    fontFamily: 'SpaceMono',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  metaLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  helperText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    color: '#2563EB',
    textAlign: 'center',
  },
});
