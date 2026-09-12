import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import type { RecommendationAction } from '@/lib/recommendations/navigation';
import { getRecommendationVisualCtaLabel } from '@/lib/recommendations/presentation';
import { alignItems, flexDirection, rtlBaseView, tw } from '@/lib/rtl';

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
    border: string;
    background: string;
    label: string;
  }
> = {
  blocker: {
    border: '#FECACA',
    background: '#FFF7F7',
    label: '#991B1B',
  },
  setup: {
    border: '#FDE68A',
    background: '#FFFCF5',
    label: '#92400E',
  },
  growth: {
    border: '#A7F3D0',
    background: '#F8FFFC',
    label: '#065F46',
  },
  retention: {
    border: '#DDD6FE',
    background: '#FCFAFF',
    label: '#6D28D9',
  },
  operational: {
    border: '#BFDBFE',
    background: '#F8FBFF',
    label: '#1E40AF',
  },
  informational: {
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
  action,
  emphasis,
  isOpening,
  isSnoozing,
  isDismissing,
  onOpen,
  onSnooze,
}: {
  category: RecommendationCategory;
  tone: RecommendationTone;
  title: string;
  reason: string;
  ctaLabel: string;
  action: RecommendationAction;
  emphasis: 'primary' | 'secondary';
  isOpening: boolean;
  isSnoozing: boolean;
  isDismissing: boolean;
  onOpen: () => void;
  onSnooze: () => void;
}) {
  const palette = TONE_PALETTE[tone];
  const isPrimary = emphasis === 'primary';
  const isBusy = isOpening || isSnoozing || isDismissing;
  const visualCtaLabel = getRecommendationVisualCtaLabel(action);

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
      <View style={styles.topRow}>
        <View style={styles.categoryWrap}>
          <Text
            className={tw.textStart}
            maxFontSizeMultiplier={1.25}
            style={[styles.category, { color: palette.label }]}
          >
            {tone === 'blocker' ? 'דורש טיפול' : CATEGORY_LABELS[category]}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
            accessibilityState={{ disabled: isBusy, busy: isOpening }}
            disabled={isBusy}
            hitSlop={2}
            onPress={onOpen}
            style={({ pressed }) => [
              styles.primaryAction,
              pressed && !isBusy ? styles.pressed : null,
              isBusy ? styles.primaryActionDisabled : null,
            ]}
          >
            {isOpening ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                maxFontSizeMultiplier={1.15}
                numberOfLines={1}
                style={styles.primaryActionText}
              >
                {visualCtaLabel}
              </Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="הזכר לי מאוחר יותר"
            accessibilityHint="ההמלצה תוסתר כעת ותחזור מאוחר יותר"
            accessibilityState={{ disabled: isBusy, busy: isSnoozing }}
            disabled={isBusy}
            hitSlop={2}
            onPress={onSnooze}
            style={({ pressed }) => [
              styles.snoozeAction,
              pressed && !isBusy ? styles.pressed : null,
              isBusy ? styles.snoozeActionDisabled : null,
            ]}
          >
            {isSnoozing ? (
              <ActivityIndicator
                size="small"
                color={DASHBOARD_TOKENS.colors.brandBlue}
              />
            ) : (
              <Ionicons
                name="time-outline"
                size={20}
                color={DASHBOARD_TOKENS.colors.brandBlue}
              />
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.copy}>
        <Text
          className={tw.textStart}
          maxFontSizeMultiplier={1.4}
          style={[styles.title, isPrimary ? styles.primaryTitle : null]}
        >
          {title}
        </Text>
        <Text
          className={tw.textStart}
          maxFontSizeMultiplier={1.5}
          style={styles.reason}
        >
          {reason}
        </Text>
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  secondaryCard: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 3,
  },
  topRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
    ...rtlBaseView,
  },
  categoryWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: alignItems.start,
  },
  copy: {
    width: '100%',
    gap: 1,
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
  actions: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    ...rtlBaseView,
  },
  primaryAction: {
    minWidth: 72,
    height: 40,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: DASHBOARD_TOKENS.colors.brandBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D7E1F2',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.82,
  },
  primaryActionDisabled: {
    backgroundColor: '#6B91E6',
  },
  snoozeActionDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
});
