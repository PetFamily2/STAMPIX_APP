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
              color={DASHBOARD_TOKENS.colors.brandBlue}
            />
          </View>
          <Text className={tw.textStart} numberOfLines={2} style={styles.label}>
            {item.label}
          </Text>
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
});
