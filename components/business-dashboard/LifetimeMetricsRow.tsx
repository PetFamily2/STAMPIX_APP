import { StyleSheet, Text, View } from 'react-native';

import { SurfaceCard } from '@/components/business-ui';
import { tw } from '@/lib/rtl';

type Tone = 'teal' | 'violet' | 'blue' | 'amber';

const TONE_MAP: Record<Tone, { helper: string }> = {
  teal: {
    helper: '#2563EB',
  },
  violet: {
    helper: '#0EA5E9',
  },
  blue: {
    helper: '#1D4ED8',
  },
  amber: {
    helper: '#1E40AF',
  },
};

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
    helperLabel?: string;
    helperValue?: string;
  }>;
}) {
  return (
    <SurfaceCard elevated={false} padding="sm" radius="lg" style={styles.card}>
      <View style={styles.row}>
        {metrics.map((metric, index) => {
          const palette = TONE_MAP[metric.tone];

          return (
            <View
              key={metric.key}
              style={[
                styles.segment,
                index < metrics.length - 1 ? styles.segmentDivider : null,
              ]}
            >
              <Text
                className={tw.textStart}
                numberOfLines={2}
                style={styles.label}
              >
                {metric.label}
              </Text>

              <View style={styles.valueDivider} />

              <Text
                className={tw.textStart}
                adjustsFontSizeToFit={true}
                minimumFontScale={0.72}
                numberOfLines={1}
                style={styles.value}
              >
                {metric.value}
              </Text>

              <View style={styles.helperRow}>
                <Text className={tw.textStart} style={styles.helperLabel}>
                  {metric.helperLabel}
                </Text>
                <Text
                  className={tw.textStart}
                  numberOfLines={1}
                  style={[styles.helperValue, { color: palette.helper }]}
                >
                  {metric.helperValue}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: '#E5EAF4',
    backgroundColor: 'rgba(255,255,255,0.98)',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  segment: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
    paddingHorizontal: 3,
    gap: 4,
  },
  segmentDivider: {
    borderRightWidth: 1,
    borderRightColor: '#EEF2F7',
  },
  value: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    color: '#111827',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  label: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  valueDivider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: '#EEF2F7',
  },
  helperRow: {
    marginTop: 2,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  helperLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  helperValue: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
  },
});
