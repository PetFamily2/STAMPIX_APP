import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';

type ShortcutIcon = keyof typeof Ionicons.glyphMap;

export function QuickShortcutsGrid({
  layoutMode,
  items,
}: {
  layoutMode: DashboardLayoutMode;
  items: Array<{
    key: string;
    label: string;
    icon: ShortcutIcon;
    onPress: () => void;
    badgeLabel?: string;
    isLocked?: boolean;
  }>;
}) {
  const layout = getDashboardLayout(layoutMode);

  return (
    <View
      style={[
        styles.row,
        {
          gap: layout.quickShortcutGap,
        },
      ]}
    >
      {items.slice(0, 7).map((item) => (
        <Pressable
          key={item.key}
          onPress={item.onPress}
          style={({ pressed }) => [
            styles.itemCard,
            {
              width: layout.quickShortcutWidth,
              minHeight: layout.quickShortcutMinHeight,
              borderRadius: layout.cardRadius,
            },
            pressed ? styles.itemCardPressed : null,
          ]}
        >
          <View style={styles.iconBubble}>
            <Ionicons
              name={item.icon}
              size={25}
              color={
                item.isLocked ? '#64748B' : DASHBOARD_TOKENS.colors.brandBlue
              }
            />
          </View>
          <Text className={tw.textStart} numberOfLines={2} style={styles.label}>
            {item.label}
          </Text>
          {item.badgeLabel ? (
            <View
              style={[
                styles.badge,
                item.isLocked ? styles.lockedBadge : styles.neutralBadge,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.badgeText,
                  item.isLocked
                    ? styles.lockedBadgeText
                    : styles.neutralBadgeText,
                ]}
              >
                {item.badgeLabel}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 3,
  },
  itemCard: {
    borderWidth: 1,
    borderColor: '#DDE5F1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 6,
    paddingVertical: 10,
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  itemCardPressed: {
    opacity: 0.85,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E9EEF8',
  },
  label: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 0,
  },
  badge: {
    minHeight: 18,
    borderRadius: 999,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedBadge: {
    backgroundColor: '#FEF3C7',
  },
  neutralBadge: {
    backgroundColor: '#EAF1FF',
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textAlign: 'center',
  },
  lockedBadgeText: {
    color: '#92400E',
  },
  neutralBadgeText: {
    color: '#1D4ED8',
  },
});
