import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';
import { UsageProgressBar } from './UsageProgressBar';

export function ProgramHealthRow({
  title,
  members,
  stamps7d,
  redemptions30d,
  onPress,
}: {
  title: string;
  members: number;
  stamps7d: number;
  redemptions30d: number;
  onPress?: () => void;
}) {
  const Component = onPress ? Pressable : View;
  const reference = Math.max(1, stamps7d + redemptions30d);

  return (
    <Component onPress={onPress} style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.iconBubble}>
          <Ionicons
            name="card-outline"
            size={16}
            color={DASHBOARD_TOKENS.colors.brandBlue}
          />
        </View>
        <View style={styles.content}>
          <Text className={tw.textStart} style={styles.title}>
            {title}
          </Text>
          <Text className={tw.textStart} style={styles.meta}>
            לקוחות פעילים: {members} · מימושים 30 יום: {redemptions30d}
          </Text>
        </View>
      </View>
      <UsageProgressBar
        label="פעילות 7 ימים"
        used={stamps7d}
        limit={reference}
        accent="#06B6D4"
      />
    </Component>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFF',
    padding: 12,
    gap: 10,
  },
  head: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DBEAFE',
  },
  content: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.textPrimary,
  },
  meta: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
});
