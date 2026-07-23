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
  selfStart,
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
  isLoading,
  isInteractionLoading,
  onPress,
  onShowOptions,
}: {
  category: RecommendationCategory;
  tone: RecommendationTone;
  title: string;
  reason: string;
  ctaLabel: string;
  emphasis: 'primary' | 'secondary';
  isLoading: boolean;
  isInteractionLoading?: boolean;
  onPress: () => void;
  onShowOptions?: () => void;
}) {
  const palette = TONE_PALETTE[tone];
  const isPrimary = emphasis === 'primary';

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
        {onShowOptions ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="אפשרויות להמלצה"
            accessibilityHint="פתיחת פעולות דחייה והסתרה"
            disabled={isInteractionLoading}
            hitSlop={4}
            onPress={onShowOptions}
            style={({ pressed }) => [
              styles.optionsButton,
              pressed ? styles.pressed : null,
            ]}
          >
            {isInteractionLoading ? (
              <ActivityIndicator size="small" color={palette.label} />
            ) : (
              <Ionicons
                name="ellipsis-horizontal"
                size={22}
                color={palette.label}
              />
            )}
          </Pressable>
        ) : null}
        <View
          style={[
            styles.iconBubble,
            isPrimary ? styles.primaryIconBubble : styles.secondaryIconBubble,
            { backgroundColor: palette.iconBackground },
          ]}
        >
          <Ionicons
            name={palette.icon}
            size={isPrimary ? 22 : 18}
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

      <Text className={tw.textStart} style={styles.reason}>
        {reason}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
        disabled={isLoading}
        onPress={onPress}
        style={({ pressed }) => [
          styles.cta,
          isPrimary ? styles.primaryCta : styles.secondaryCta,
          pressed && !isLoading ? styles.pressed : null,
        ]}
      >
        {isLoading ? (
          <ActivityIndicator
            size="small"
            color={
              isPrimary ? '#FFFFFF' : DASHBOARD_TOKENS.colors.brandBlue
            }
          />
        ) : (
          <>
            <Text
              style={[
                styles.ctaText,
                isPrimary ? styles.primaryCtaText : styles.secondaryCtaText,
              ]}
            >
              {ctaLabel}
            </Text>
            <Ionicons
              name="chevron-back"
              size={17}
              color={
                isPrimary ? '#FFFFFF' : DASHBOARD_TOKENS.colors.brandBlue
              }
            />
          </>
        )}
      </Pressable>
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
    minHeight: 190,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 12,
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  secondaryCard: {
    minHeight: 128,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  headingRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
    ...rtlBaseView,
  },
  optionsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBubble: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  primaryIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: 18,
    lineHeight: 25,
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
  cta: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: selfStart,
    ...rtlBaseView,
  },
  primaryCta: {
    minWidth: 150,
    marginTop: 'auto',
    backgroundColor: DASHBOARD_TOKENS.colors.brandBlue,
  },
  secondaryCta: {
    minWidth: 132,
    marginTop: 'auto',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
  },
  ctaText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  primaryCtaText: {
    color: '#FFFFFF',
  },
  secondaryCtaText: {
    color: DASHBOARD_TOKENS.colors.brandBlue,
  },
  pressed: {
    opacity: 0.82,
  },
});
