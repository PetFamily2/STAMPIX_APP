import type { Href } from 'expo-router';
import {
  ChartNoAxesCombined,
  Ellipsis,
  Gift,
  LayoutDashboard,
  type LucideIcon,
  QrCode,
  ReceiptText,
  Settings,
  UserRoundCog,
  Users,
} from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';

import type {
  BusinessWebNavItem,
  BusinessWebNavKey,
} from '@/lib/businessWebNavigation';
import { isBusinessWebRouteActive } from '@/lib/businessWebNavigation';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection, rtlCenterText } from '@/lib/rtl';

export const BUSINESS_WEB_BOTTOM_NAV_HEIGHT = 68;

export const businessWebNavIcons: Record<BusinessWebNavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  customers: Users,
  loyalty: Gift,
  team: UserRoundCog,
  analytics: ChartNoAxesCombined,
  billing: ReceiptText,
  campaigns: Gift,
  referrals: Users,
  inbox: ReceiptText,
  scanner: QrCode,
  settings: Settings,
};

type BusinessWebBottomNavProps = {
  currentPathname: string;
  moreOpen: boolean;
  onBarHeight?: (height: number) => void;
  onNavigate: (href: Href) => void;
  onToggleMore: () => void;
  overflow: readonly BusinessWebNavItem[];
  primary: readonly BusinessWebNavItem[];
};

export function BusinessWebBottomNav({
  currentPathname,
  moreOpen,
  onBarHeight,
  onNavigate,
  onToggleMore,
  overflow,
  primary,
}: BusinessWebBottomNavProps) {
  const { width } = useWindowDimensions();
  const labelStyle = width < 360 ? styles.labelNarrow : styles.label;
  const moreSelected =
    moreOpen ||
    overflow.some((item) =>
      isBusinessWebRouteActive(currentPathname, item.href)
    );

  return (
    <View
      accessibilityLabel="ניווט עסקי"
      accessibilityRole="tablist"
      onLayout={(event) => {
        const nextHeight = Math.ceil(event.nativeEvent.layout.height);
        if (nextHeight > 0) {
          onBarHeight?.(nextHeight);
        }
      }}
      style={styles.bar}
    >
      {primary.map((item) => {
        const Icon = businessWebNavIcons[item.key];
        const isActive = isBusinessWebRouteActive(currentPathname, item.href);
        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            key={item.key}
            onPress={() => onNavigate(item.href as Href)}
            style={({ pressed }) => [
              styles.tab,
              width < 360 ? styles.tabNarrow : null,
              pressed ? styles.tabPressed : null,
            ]}
          >
            <View
              style={[styles.iconSlot, isActive ? styles.iconSlotActive : null]}
            >
              <Icon
                color={
                  isActive ? TOKENS.colors.primary : TOKENS.colors.textMuted
                }
                size={22}
                strokeWidth={TOKENS.icons.strokeWidth}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[labelStyle, isActive ? styles.labelActive : null]}
            >
              {item.shortLabel}
            </Text>
          </Pressable>
        );
      })}
      {overflow.length > 0 ? (
        <Pressable
          accessibilityLabel="עוד"
          accessibilityRole="tab"
          accessibilityState={{ expanded: moreOpen, selected: moreSelected }}
          onPress={onToggleMore}
          style={({ pressed }) => [
            styles.tab,
            width < 360 ? styles.tabNarrow : null,
            pressed ? styles.tabPressed : null,
          ]}
        >
          <View
            style={[
              styles.iconSlot,
              moreSelected ? styles.iconSlotActive : null,
            ]}
          >
            <Ellipsis
              color={
                moreSelected ? TOKENS.colors.primary : TOKENS.colors.textMuted
              }
              size={22}
              strokeWidth={TOKENS.icons.strokeWidth}
            />
          </View>
          <Text
            numberOfLines={1}
            style={[labelStyle, moreSelected ? styles.labelActive : null]}
          >
            עוד
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: BUSINESS_WEB_BOTTOM_NAV_HEIGHT,
    flexShrink: 0,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: TOKENS.colors.border,
    zIndex: 40,
    backgroundColor: TOKENS.colors.elevatedSurface,
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 2,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 2,
  },
  tabNarrow: { paddingHorizontal: 0 },
  tabPressed: { opacity: 0.92 },
  iconSlot: {
    minWidth: 44,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  iconSlotActive: { backgroundColor: TOKENS.colors.primarySubtle },
  label: {
    ...rtlCenterText,
    width: '100%',
    color: TOKENS.colors.textSecondary,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  labelNarrow: {
    ...rtlCenterText,
    width: '100%',
    color: TOKENS.colors.textSecondary,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  labelActive: { color: TOKENS.colors.primary, fontWeight: '600' },
});
