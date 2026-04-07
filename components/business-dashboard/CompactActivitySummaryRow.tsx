import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { SurfaceCard } from '@/components/business-ui';
import { tw } from '@/lib/rtl';

type Tone = 'blue' | 'teal' | 'violet' | 'amber';

const TONE_MAP: Record<
  Tone,
  { bg: string; icon: string; iconName: keyof typeof Ionicons.glyphMap }
> = {
  blue: {
    bg: '#EAF2FF',
    icon: '#2563EB',
    iconName: 'people-outline',
  },
  teal: {
    bg: '#DDF7F4',
    icon: '#0F766E',
    iconName: 'megaphone-outline',
  },
  violet: {
    bg: '#DBEAFE',
    icon: '#1D4ED8',
    iconName: 'albums-outline',
  },
  amber: {
    bg: '#EAF2FF',
    icon: '#2F6BFF',
    iconName: 'gift-outline',
  },
};

export function CompactActivitySummaryRow({
  title,
  items,
}: {
  title: string;
  items: Array<{
    key: string;
    label: string;
    value: string;
    tone: Tone;
  }>;
}) {
  return (
    <SurfaceCard
      elevated={false}
      padding="sm"
      radius="hero"
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <Ionicons name="chevron-back" size={16} color="#64748B" />
        <Text className={tw.textStart} style={styles.title}>
          {title}
        </Text>
      </View>

      <View style={styles.statsRow}>
        {items.map((item, index) => {
          const palette = TONE_MAP[item.tone];
          return (
            <View
              key={item.key}
              style={[
                styles.statItem,
                index < items.length - 1 ? styles.statDivider : null,
              ]}
            >
              <View
                style={[styles.iconBubble, { backgroundColor: palette.bg }]}
              >
                <Ionicons
                  name={palette.iconName}
                  size={16}
                  color={palette.icon}
                />
              </View>
              <Text className={tw.textStart} style={styles.value}>
                {item.value}
              </Text>
              <Text className={tw.textStart} style={styles.label}>
                {item.label}
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
    borderColor: '#E4E9F3',
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: '#1F2937',
  },
  statsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 5,
    paddingHorizontal: 6,
  },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: '#EEF2F7',
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 21,
    lineHeight: 24,
    fontWeight: '900',
    color: '#111827',
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
});
