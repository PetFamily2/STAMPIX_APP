import { StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';

export function UsageProgressBar({
  label,
  used,
  limit,
  accent = DASHBOARD_TOKENS.colors.brandBlue,
}: {
  label: string;
  used: number;
  limit: number;
  accent?: string;
}) {
  const clampedLimit = Math.max(1, limit);
  const percent = Math.min(100, Math.round((used / clampedLimit) * 100));
  const tone =
    percent >= 100
      ? DASHBOARD_TOKENS.colors.red
      : percent >= 85
        ? DASHBOARD_TOKENS.colors.amber
        : accent;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text className={tw.textStart} style={styles.label}>
          {label}
        </Text>
        <Text className={tw.textStart} style={styles.value}>
          {used}/{limit}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${percent}%`, backgroundColor: tone }]}
        />
      </View>
      <Text className={tw.textStart} style={styles.percent}>
        {percent}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
  value: {
    fontSize: 12,
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.textPrimary,
  },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  percent: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
});
