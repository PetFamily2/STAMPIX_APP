import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';
import { SurfaceCard } from './SurfaceCard';
import { TrendIndicator } from './TrendIndicator';

type KpiTone = 'blue' | 'teal' | 'violet' | 'emerald' | 'amber' | 'red';

const toneMap: Record<
  KpiTone,
  {
    tint: string;
    icon: string;
    iconGradient: readonly [string, string];
  }
> = {
  blue: {
    tint: '#EFF6FF',
    icon: '#1E4ED8',
    iconGradient: ['#DBEAFE', '#DCE7FF'],
  },
  teal: {
    tint: '#ECFEFF',
    icon: '#0E7490',
    iconGradient: ['#CCFBF1', '#CFFAFE'],
  },
  violet: {
    tint: '#F5F3FF',
    icon: '#7C3AED',
    iconGradient: ['#EDE9FE', '#F3E8FF'],
  },
  emerald: {
    tint: '#ECFDF3',
    icon: '#15803D',
    iconGradient: ['#DCFCE7', '#ECFDF3'],
  },
  amber: {
    tint: '#FFF7ED',
    icon: '#D97706',
    iconGradient: ['#FED7AA', '#FFEDD5'],
  },
  red: {
    tint: '#FEF2F2',
    icon: '#DC2626',
    iconGradient: ['#FECACA', '#FEE2E2'],
  },
};

export function KpiCard({
  label,
  value,
  icon,
  tone = 'blue',
  trend,
  onPress,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: KpiTone;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string } | null;
  onPress?: () => void;
}) {
  const palette = toneMap[tone];

  const CardComponent = onPress ? Pressable : View;

  return (
    <CardComponent onPress={onPress} style={styles.pressable}>
      <SurfaceCard
        padding="md"
        elevated={false}
        style={[
          styles.card,
          {
            backgroundColor: palette.tint,
          },
        ]}
      >
        <View style={styles.row}>
          <LinearGradient
            colors={[...palette.iconGradient]}
            style={styles.iconBubble}
          >
            <Ionicons name={icon} size={16} color={palette.icon} />
          </LinearGradient>
          <TrendIndicator trend={trend ?? null} />
        </View>
        <Text className={tw.textStart} style={styles.label}>
          {label}
        </Text>
        <Text className={tw.textStart} style={styles.value}>
          {value}
        </Text>
      </SurfaceCard>
    </CardComponent>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  card: {
    minHeight: 110,
    gap: 10,
    borderColor: '#D8E4F8',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
  value: {
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '800',
    color: DASHBOARD_TOKENS.colors.textPrimary,
  },
});
