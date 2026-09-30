import { Ionicons } from '@expo/vector-icons';
import {
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { PaintedPressable as Pressable } from '@/components/ui/PaintedPressable';
import {
  DASHBOARD_CARD_STATES,
  DASHBOARD_TOKENS,
} from '@/lib/design/dashboardTokens';
import { QUICK_ACTION_MIN_TAP_TARGET } from '@/lib/design/quickActionLayout';
import { flexDirection, rtlBaseView } from '@/lib/rtl';

const ICON_WELL_SIZE = 42;
const ICON_WELL_RADIUS = 12;
const LOCKED_ICON_TINT = '#F1F5F9';
const PRESSED_BACKGROUND = '#F3F6FB';
const LOCKED_PRESSED_BACKGROUND = '#EEF2F6';

export type QuickActionIconName = keyof typeof Ionicons.glyphMap;

export function QuickActionTile({
  label,
  icon,
  onPress,
  badgeLabel,
  isLocked = false,
  minHeight,
  style,
}: {
  label: string;
  icon: QuickActionIconName;
  onPress: () => void;
  badgeLabel?: string;
  isLocked?: boolean;
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={
        isLocked ? 'פתיחת אפשרויות המסלול עבור פעולה זו' : undefined
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        isLocked ? styles.tileLocked : null,
        typeof minHeight === 'number' ? { minHeight } : null,
        style,
        pressed
          ? isLocked
            ? styles.tileLockedPressed
            : styles.tilePressed
          : null,
      ]}
    >
      <View style={[styles.iconWell, isLocked ? styles.iconWellLocked : null]}>
        <Ionicons
          name={icon}
          size={DASHBOARD_TOKENS.iconSizeLg}
          color={
            isLocked
              ? DASHBOARD_TOKENS.colors.textMuted
              : DASHBOARD_TOKENS.colors.brandBlue
          }
        />
      </View>
      <View style={styles.copyBlock}>
        <Text numberOfLines={2} style={styles.label}>
          {label}
        </Text>
        <View style={styles.stateSlot}>
          {badgeLabel ? (
            <View
              style={[
                styles.badge,
                isLocked ? styles.lockedBadge : styles.neutralBadge,
              ]}
            >
              {isLocked ? (
                <Ionicons
                  name="lock-closed-outline"
                  size={10}
                  color="#92400E"
                />
              ) : null}
              <Text
                numberOfLines={1}
                style={[
                  styles.badgeText,
                  isLocked ? styles.lockedBadgeText : styles.neutralBadgeText,
                ]}
              >
                {badgeLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: QUICK_ACTION_MIN_TAP_TARGET,
    borderWidth: 1,
    borderColor: DASHBOARD_TOKENS.colors.border,
    borderRadius: DASHBOARD_TOKENS.cardRadius,
    backgroundColor: DASHBOARD_CARD_STATES.default.backgroundColor,
    alignItems: 'center',
    paddingHorizontal: DASHBOARD_TOKENS.space[2],
    paddingVertical: DASHBOARD_TOKENS.space[2],
    gap: DASHBOARD_TOKENS.space[2],
    ...DASHBOARD_TOKENS.cardShadowSoft,
    ...rtlBaseView,
  },
  tileLocked: {
    backgroundColor: DASHBOARD_CARD_STATES.locked.backgroundColor,
    borderColor: DASHBOARD_CARD_STATES.locked.borderColor,
  },
  tilePressed: {
    backgroundColor: PRESSED_BACKGROUND,
  },
  tileLockedPressed: {
    backgroundColor: LOCKED_PRESSED_BACKGROUND,
  },
  iconWell: {
    width: ICON_WELL_SIZE,
    height: ICON_WELL_SIZE,
    borderRadius: ICON_WELL_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DASHBOARD_CARD_STATES.active.backgroundColor,
  },
  iconWellLocked: {
    backgroundColor: LOCKED_ICON_TINT,
  },
  copyBlock: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: DASHBOARD_TOKENS.space[1],
  },
  label: {
    alignSelf: 'stretch',
    fontSize: DASHBOARD_TOKENS.sectionSubtitleSize,
    lineHeight: 18,
    fontWeight: DASHBOARD_TOKENS.typography.sectionTitle.fontWeight,
    color: DASHBOARD_TOKENS.colors.textPrimary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  stateSlot: {
    height: 18,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    maxWidth: '100%',
    minHeight: 18,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 6,
  },
  lockedBadge: {
    backgroundColor: '#FEF3C7',
  },
  neutralBadge: {
    backgroundColor: '#EAF1FF',
  },
  badgeText: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  lockedBadgeText: {
    color: '#92400E',
  },
  neutralBadgeText: {
    color: '#1D4ED8',
  },
});
