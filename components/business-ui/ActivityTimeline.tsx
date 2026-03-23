import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';
import { SurfaceCard } from './SurfaceCard';

export type TimelineItem = {
  id: string;
  title: string;
  subtitle: string;
  timeLabel: string;
  type?: 'stamp' | 'reward' | 'system';
};

function markerColor(type: TimelineItem['type']) {
  if (type === 'reward') {
    return '#8B5CF6';
  }
  if (type === 'system') {
    return '#06B6D4';
  }
  return '#1E4ED8';
}

function markerIcon(type: TimelineItem['type']) {
  if (type === 'reward') {
    return 'gift-outline' as const;
  }
  if (type === 'system') {
    return 'pulse-outline' as const;
  }
  return 'scan-outline' as const;
}

export function ActivityTimeline({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: TimelineItem[];
}) {
  return (
    <SurfaceCard tone="default" radius="lg" padding="lg" style={styles.wrap}>
      <Text className={tw.textStart} style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text className={tw.textStart} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
      <View style={styles.track}>
        {items.map((item, index) => {
          const color = markerColor(item.type);
          return (
            <View key={item.id} style={styles.row}>
              <View style={styles.info}>
                <Text className={tw.textStart} style={styles.rowTitle}>
                  {item.title}
                </Text>
                <Text className={tw.textStart} style={styles.rowSubtitle}>
                  {item.subtitle}
                </Text>
              </View>
              <Text style={styles.time}>{item.timeLabel}</Text>
              <View style={styles.markerWrap}>
                {index < items.length - 1 ? <View style={styles.line} /> : null}
                <View style={[styles.marker, { backgroundColor: color }]}>
                  <Ionicons
                    name={markerIcon(item.type)}
                    size={12}
                    color="#FFFFFF"
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
  track: {
    marginTop: 2,
    gap: 12,
  },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  markerWrap: {
    width: 22,
    alignItems: 'center',
    position: 'relative',
  },
  line: {
    position: 'absolute',
    top: 18,
    bottom: -30,
    width: 2,
    backgroundColor: '#DBE4F2',
  },
  marker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    alignItems: 'flex-end',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.textPrimary,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
  time: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
});
