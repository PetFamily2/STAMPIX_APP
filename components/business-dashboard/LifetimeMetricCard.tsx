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
    helper: string;
  }
> = {
  teal: {
    bubble: ['#E8DEFF', '#F1EBFF'],
    icon: '#6D4BFF',
    helper: '#0F766E',
  },
  violet: {
    bubble: ['#E8E4FF', '#F5F0FF'],
    icon: '#7C3AED',
    helper: '#E11D48',
  },
  blue: {
    bubble: ['#DDF7F4', '#ECFDFB'],
    icon: '#0F766E',
    helper: '#0891B2',
  },
  amber: {
    bubble: ['#FFE6EE', '#FFF2F6'],
    icon: '#DB2777',
    helper: '#111827',
  },
};

export function LifetimeMetricCard({
  label,
  value,
  icon,
  tone,
  helperText = 'לכל התקופה',
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
  helperText?: string;
}) {
  const palette = TONE_MAP[tone];

  return (
    <SurfaceCard elevated={false} padding="sm" radius="lg" style={styles.card}>
      <LinearGradient colors={[...palette.bubble]} style={styles.iconBubble}>
        <Ionicons name={icon} size={16} color={palette.icon} />
      </LinearGradient>

      <View style={styles.textWrap}>
        <Text className={tw.textStart} numberOfLines={1} style={styles.value}>
          {value}
        </Text>
        <Text className={tw.textStart} numberOfLines={2} style={styles.label}>
          {label}
        </Text>
      </View>

      <View style={styles.footerRow}>
        <Text
          className={tw.textStart}
          style={[styles.helperText, { color: palette.helper }]}
        >
          {helperText}
        </Text>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 134,
    justifyContent: 'space-between',
    borderColor: '#E5EAF4',
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  textWrap: {
    gap: 4,
  },
  value: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: '#111827',
  },
  label: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#334155',
  },
  footerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    paddingTop: 7,
  },
  helperText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
  },
});
