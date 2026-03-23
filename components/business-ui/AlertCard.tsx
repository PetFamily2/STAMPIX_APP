import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tw } from '@/lib/rtl';
import { SurfaceCard } from './SurfaceCard';

const toneMap = {
  warning: {
    bg: '#FFF7ED',
    border: '#FED7AA',
    iconBg: '#FFEDD5',
    icon: '#D97706',
    title: '#9A3412',
    subtitle: '#B45309',
  },
  critical: {
    bg: '#FEF2F2',
    border: '#FECACA',
    iconBg: '#FEE2E2',
    icon: '#DC2626',
    title: '#991B1B',
    subtitle: '#B91C1C',
  },
  neutral: {
    bg: '#EFF6FF',
    border: '#BFDBFE',
    iconBg: '#DBEAFE',
    icon: '#1D4ED8',
    title: '#1E3A8A',
    subtitle: '#1D4ED8',
  },
} as const;

export function AlertCard({
  title,
  subtitle,
  ctaLabel,
  onPress,
  tone = 'warning',
}: {
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onPress?: () => void;
  tone?: keyof typeof toneMap;
}) {
  const palette = toneMap[tone];
  return (
    <SurfaceCard
      tone="default"
      elevated={false}
      style={[
        styles.card,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: palette.iconBg }]}>
          <Ionicons
            name="alert-circle-outline"
            size={18}
            color={palette.icon}
          />
        </View>
        <View style={styles.content}>
          <Text
            className={tw.textStart}
            style={[styles.title, { color: palette.title }]}
          >
            {title}
          </Text>
          <Text
            className={tw.textStart}
            style={[styles.subtitle, { color: palette.subtitle }]}
          >
            {subtitle}
          </Text>
        </View>
      </View>
      {ctaLabel && onPress ? (
        <Pressable onPress={onPress} style={styles.cta}>
          <Text style={[styles.ctaText, { color: palette.icon }]}>
            {ctaLabel}
          </Text>
        </Pressable>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  cta: {
    alignSelf: 'flex-end',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
