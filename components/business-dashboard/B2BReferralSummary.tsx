import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';

const REFERRAL_ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  generated: 'person-add-outline',
  completed: 'checkmark-circle-outline',
  granted: 'gift-outline',
  redeemed: 'wallet-outline',
};

export function B2BReferralSummary({
  layoutMode,
  items,
}: {
  layoutMode: DashboardLayoutMode;
  items: Array<{
    key: string;
    label: string;
    value: string;
  }>;
}) {
  const layout = getDashboardLayout(layoutMode);

  return (
    <View style={[styles.card, { borderRadius: layout.cardRadius }]}>
      <View style={styles.row}>
        {items.slice(0, 4).map((item, index) => (
          <View
            key={item.key}
            style={[styles.statItem, index < 3 ? styles.statDivider : null]}
          >
            <View style={styles.iconBubble}>
              <Ionicons
                name={REFERRAL_ICON_MAP[item.key] ?? 'people-outline'}
                size={18}
                color={DASHBOARD_TOKENS.colors.brandBlue}
              />
            </View>
            <Text
              adjustsFontSizeToFit={true}
              className={tw.textStart}
              minimumFontScale={0.75}
              numberOfLines={1}
              style={styles.value}
            >
              {item.value}
            </Text>
            <Text className={tw.textStart} style={styles.label}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: DASHBOARD_TOKENS.colors.border,
    paddingVertical: 16,
    paddingHorizontal: 10,
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 110,
    paddingHorizontal: 8,
  },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: DASHBOARD_TOKENS.colors.dividerStrong,
  },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FF',
  },
  value: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.textPrimary,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    textAlign: 'center',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
});
