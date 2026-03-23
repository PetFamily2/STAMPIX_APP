import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';

type Trend = {
  direction: 'up' | 'down' | 'flat';
  label: string;
};

export function TrendIndicator({ trend }: { trend?: Trend | null }) {
  if (!trend) {
    return null;
  }

  const palette =
    trend.direction === 'up'
      ? { bg: '#ECFDF3', fg: '#16A34A', icon: 'trending-up' as const }
      : trend.direction === 'down'
        ? { bg: '#FEF2F2', fg: '#DC2626', icon: 'trending-down' as const }
        : {
            bg: '#EFF6FF',
            fg: DASHBOARD_TOKENS.colors.brandBlue,
            icon: 'remove' as const,
          };

  return (
    <View style={[styles.wrap, { backgroundColor: palette.bg }]}>
      <Ionicons name={palette.icon} size={12} color={palette.fg} />
      <Text style={[styles.label, { color: palette.fg }]}>{trend.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
  },
});
