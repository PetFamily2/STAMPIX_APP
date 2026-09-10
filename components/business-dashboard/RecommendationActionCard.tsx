import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import {
  alignItems,
  flexDirection,
  rtlBaseView,
  tw,
} from '@/lib/rtl';

export type RecommendationCategory =
  | 'operational'
  | 'setup'
  | 'retention'
  | 'growth'
  | 'informational';

export type RecommendationTone =
  | 'blocker'
  | 'setup'
  | 'growth'
  | 'retention'
  | 'operational'
  | 'informational';

const CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  operational: 'תפעול',
  setup: 'השלמת הגדרה',
  growth: 'צמיחה',
  retention: 'שימור לקוחות',
  informational: 'מידע',
};

const TONE_PALETTE: Record<
  RecommendationTone,
  {
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    iconBackground: string;
    border: string;
    background: string;
    label: string;
  }
> = {
  blocker: {
    icon: 'alert-circle-outline',
    iconColor: '#B91C1C',
    iconBackground: '#FEE2E2',
    border: '#FECACA',
    background: '#FFF7F7',
    label: '#991B1B',
  },
  setup: {
    icon: 'construct-outline',
    iconColor: '#B45309',
    iconBackground: '#FEF3C7',
    border: '#FDE68A',
    background: '#FFFCF5',
    label: '#92400E',
  },
  growth: {
    icon: 'trending-up-outline',
    iconColor: '#047857',
    iconBackground: '#D1FAE5',
    border: '#A7F3D0',
    background: '#F8FFFC',
    label: '#065F46',
  },
  retention: {
    icon: 'people-outline',
    iconColor: '#7C3AED',
    iconBackground: '#EDE9FE',
    border: '#DDD6FE',
    background: '#FCFAFF',
    label: '#6D28D9',
  },
  operational: {
    icon: 'megaphone-outline',
    iconColor: '#1D4ED8',
    iconBackground: '#DBEAFE',
    border: '#BFDBFE',
    background: '#F8FBFF',
    label: '#1E40AF',
  },
  informational: {
    icon: 'information-circle-outline',
    iconColor: '#475569',
    iconBackground: '#E2E8F0',
    border: '#E2E8F0',
    background: '#FFFFFF',
    label: '#475569',
  },
};

export function RecommendationActionCard({
  category,
  tone,
  title,
  reason,
  ctaLabel,
  emphasis,
  isOpening,
  isSnoozing,
  isDismissing,
  onOpen,
  onSnooze,
  onDismiss,
}: {
  category: RecommendationCategory;
  tone: RecommendationTone;
  title: string;
  reason: string;
  ctaLabel: string;
  emphasis: 'primary' | 'secondary';
  isOpening: boolean;
  isSnoozing: boolean;
  isDismissing: boolean;
  onOpen: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}) {
  const palette = TONE_PALETTE[tone];
  const isPrimary = emphasis === 'primary';
  const isBusy = isOpening || isSnoozing || isDismissing;

  return (
    <View
      style={[
        styles.card,
        isPrimary ? styles.primaryCard : styles.secondaryCard,
        {
          borderColor: palette.border,
          backgroundColor: palette.background,
        },
      ]}
    >
      <View style={styles.headingRow}>
        <View
          style={[
            styles.iconBubble,
            isPrimary ? styles.primaryIconBubble : styles.secondaryIconBubble,
            { backgroundColor: palette.iconBackground },
          ]}
        >
          <Ionicons
            name={palette.icon}
            size={isPrimary ? 20 : 18}
            color={palette.iconColor}
          />
        </View>
        <View style={styles.copy}>
          <Text
            className={tw.textStart}
            style={[styles.category, { color: palette.label }]}
          >
            {tone === 'blocker'
              ? 'דורש טיפול'
              : CATEGORY_LABELS[category]}
          </Text>
          <Text
            className={tw.textStart}
            style={[styles.title, isPrimary ? styles.primaryTitle : null]}
          >
            {title}
          </Text>
        </View>
      </View>

      <Text className={tw.textStart} numberOfLines={2} style={styles.reason}>
        {reason}
      </Text>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          disabled={isBusy}
          onPress={onOpen}
          style={({ pressed }) => [
            styles.actionButton,
            styles.primaryAction,
            pressed && !isBusy ? styles.pressed : null,
            isBusy ? styles.disabled : null,
          ]}
        >
          {isOpening ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text numberOfLines={2} style={styles.primaryActionText}>
              {ctaLabel}
            </Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="הזכר לי מאוחר יותר"
          disabled={isBusy}
          onPress={onSnooze}
          style={({ pressed }) => [
            styles.actionButton,
            styles.snoozeAction,
            pressed && !isBusy ? styles.pressed : null,
            isBusy ? styles.disabled : null,
          ]}
        >
          {isSnoozing ? (
            <ActivityIndicator
              size="small"
              color={DASHBOARD_TOKENS.colors.brandBlue}
            />
          ) : (
            <Text numberOfLines={2} style={styles.snoozeActionText}>
              הזכר לי מאוחר יותר
            </Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="הסרת ההמלצה"
          accessibilityHint="פתיחת בקשת אישור להסרת ההמלצה"
          disabled={isBusy}
          hitSlop={2}
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.dismissAction,
            pressed && !isBusy ? styles.dismissActionPressed : null,
            isBusy ? styles.disabled : null,
          ]}
        >
          {isDismissing ? (
            <ActivityIndicator
              size="small"
              color={DASHBOARD_TOKENS.colors.textMuted}
            />
          ) : (
            <Ionicons
              name="trash-outline"
              size={19}
              color={DASHBOARD_TOKENS.colors.textMuted}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: DASHBOARD_TOKENS.cardRadiusLarge,
    ...rtlBaseView,
  },
  primaryCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  secondaryCard: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 5,
  },
  headingRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
    ...rtlBaseView,
  },
  iconBubble: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  primaryIconBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  secondaryIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  copy: {
    flex: 1,
    gap: 2,
    alignItems: alignItems.start,
  },
  category: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  title: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  primaryTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  reason: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  actionRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 6,
    ...rtlBaseView,
  },
  actionButton: {
    minWidth: 0,
    minHeight: 44,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAction: {
    flex: 1.08,
    backgroundColor: DASHBOARD_TOKENS.colors.brandBlue,
  },
  snoozeAction: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D7E1F2',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  primaryActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  snoozeActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.brandBlue,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  dismissAction: {
    width: 44,
    height: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'rgba(255,255,255,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dismissActionPressed: {
    backgroundColor: '#FEE2E2',
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.58,
  },
});
