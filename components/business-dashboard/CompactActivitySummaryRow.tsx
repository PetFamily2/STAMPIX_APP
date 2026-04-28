import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';

export function CompactActivitySummaryRow({
  layoutMode,
  items,
}: {
  layoutMode: DashboardLayoutMode;
  items: Array<{
    key: string;
    type: 'punch' | 'reward';
    customer: string;
    detail: string;
    time: string;
  }>;
}) {
  const layout = getDashboardLayout(layoutMode);

  return (
    <View style={[styles.card, { borderRadius: layout.cardRadius }]}>
      {items.slice(0, 5).map((item, index) => (
        <View
          key={item.key}
          style={[
            styles.row,
            index < Math.min(items.length, 5) - 1 ? styles.rowDivider : null,
          ]}
        >
          <View
            style={[
              styles.iconBubble,
              item.type === 'reward' ? styles.rewardBubble : styles.punchBubble,
            ]}
          >
            <Ionicons
              name={item.type === 'reward' ? 'gift-outline' : 'scan-outline'}
              size={20}
              color={item.type === 'reward' ? '#7C3AED' : '#1D4ED8'}
            />
          </View>
          <View style={styles.textWrap}>
            <Text
              className={tw.textStart}
              numberOfLines={1}
              style={styles.customer}
            >
              {item.customer}
            </Text>
            <Text
              className={tw.textStart}
              numberOfLines={1}
              style={styles.detail}
            >
              {item.detail}
            </Text>
          </View>
          <View style={styles.timeWrap}>
            <Text style={styles.time}>{item.time}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: DASHBOARD_TOKENS.colors.border,
    backgroundColor: '#FFFFFF',
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  row: {
    minHeight: 60,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: DASHBOARD_TOKENS.colors.divider,
  },
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  punchBubble: {
    backgroundColor: '#EEF4FF',
  },
  rewardBubble: {
    backgroundColor: '#F3E8FF',
  },
  textWrap: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 4,
  },
  customer: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textPrimary,
  },
  detail: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '400',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
  timeWrap: {
    minWidth: 46,
    alignItems: 'flex-start',
  },
  time: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
});
