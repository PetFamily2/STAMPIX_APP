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
    bubble: ['#EAF2FF', '#F4F8FF'],
    icon: '#2563EB',
    helper: '#2563EB',
  },
  violet: {
    bubble: ['#DBEAFE', '#EFF6FF'],
    icon: '#1D4ED8',
    helper: '#1D4ED8',
  },
  blue: {
    bubble: ['#DFF4FF', '#F0F9FF'],
    icon: '#0284C7',
    helper: '#0284C7',
  },
  amber: {
    bubble: ['#EAF2FF', '#F7FAFF'],
    icon: '#2F6BFF',
    helper: '#2F6BFF',
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
      <View style={styles.metricRow}>
        <LinearGradient colors={[...palette.bubble]} style={styles.iconBubble}>
          <Ionicons name={icon} size={14} color={palette.icon} />
        </LinearGradient>
        <Text
          className={tw.textStart}
          numberOfLines={1}
          adjustsFontSizeToFit={true}
          minimumFontScale={0.72}
          style={styles.value}
        >
          {value}
        </Text>
      </View>

      <View style={styles.textWrap}>
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
    minHeight: 92,
    justifyContent: 'space-between',
    borderColor: '#E5EAF4',
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  metricRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  iconBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    gap: 2,
  },
  value: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 17,
    fontWeight: '900',
    color: '#111827',
  },
  label: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '600',
    color: '#334155',
  },
  footerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    marginTop: 3,
    paddingTop: 3,
  },
  helperText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
  },
});
