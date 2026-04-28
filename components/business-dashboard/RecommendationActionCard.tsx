import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';

type Tone = 'critical' | 'warning' | 'neutral' | 'success';

const PALETTE: Record<
  Tone,
  {
    iconBg: string;
    iconColor: string;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    body: string;
    border: string;
    bg: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  critical: {
    iconBg: '#FFF2E6',
    iconColor: '#F97316',
    icon: 'people-outline',
    title: '#111827',
    body: '#475569',
    border: '#F0E7D6',
    bg: '#FFFDFC',
    badgeBg: '#FFF5DB',
    badgeText: '#C27100',
  },
  warning: {
    iconBg: '#DCFCE7',
    iconColor: '#16A34A',
    icon: 'megaphone-outline',
    title: '#111827',
    body: '#475569',
    border: '#DCE8FF',
    bg: '#FAFFFC',
    badgeBg: '#EEF4FF',
    badgeText: '#2563EB',
  },
  neutral: {
    iconBg: '#EAF2FF',
    iconColor: '#2563EB',
    icon: 'leaf-outline',
    title: '#111827',
    body: '#475569',
    border: '#DCE8FF',
    bg: '#FFFFFF',
    badgeBg: '#EEF4FF',
    badgeText: '#2563EB',
  },
  success: {
    iconBg: '#DFF4FF',
    iconColor: '#0284C7',
    icon: 'checkmark-circle-outline',
    title: '#111827',
    body: '#475569',
    border: '#DCE8FF',
    bg: '#FFFFFF',
    badgeBg: '#EEF4FF',
    badgeText: '#2563EB',
  },
};

export function RecommendationActionCard({
  layoutMode,
  title,
  body,
  supportingText,
  evidenceTags,
  primaryCtaLabel,
  onPressCta,
  secondaryActionLabel,
  onPressSecondaryAction,
  tone,
  emphasis,
  badgeLabel,
  isLoading = false,
}: {
  layoutMode: DashboardLayoutMode;
  title: string;
  body: string;
  supportingText?: string;
  evidenceTags: string[];
  primaryCtaLabel?: string | null;
  onPressCta?: (() => void) | null;
  secondaryActionLabel?: string | null;
  onPressSecondaryAction?: (() => void) | null;
  tone: Tone;
  emphasis: 'primary' | 'secondary';
  badgeLabel?: string | null;
  isLoading?: boolean;
}) {
  const layout = getDashboardLayout(layoutMode);
  const palette = PALETTE[tone];
  const hasPrimaryCta = Boolean(
    primaryCtaLabel && onPressCta && emphasis === 'primary'
  );
  const hasSecondaryAction = Boolean(
    secondaryActionLabel && onPressSecondaryAction
  );

  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: layout.cardRadius,
          borderColor: palette.border,
          backgroundColor: palette.bg,
          width: layout.recommendationCardWidthPrimary,
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.topRow}>
          {emphasis === 'primary' ? (
            <View style={styles.statusBox}>
              <Ionicons name="checkbox-outline" size={22} color="#94A3B8" />
            </View>
          ) : badgeLabel ? (
            <View style={[styles.badge, { backgroundColor: palette.badgeBg }]}>
              <Text style={[styles.badgeText, { color: palette.badgeText }]}>
                {badgeLabel}
              </Text>
            </View>
          ) : (
            <View />
          )}

          <View style={styles.titleWrap}>
            <Text
              className={tw.textStart}
              style={[styles.title, { color: palette.title }]}
            >
              {title}
            </Text>
          </View>

          <View
            style={[styles.iconBubble, { backgroundColor: palette.iconBg }]}
          >
            <Ionicons name={palette.icon} size={20} color={palette.iconColor} />
          </View>
        </View>

        <Text
          className={tw.textStart}
          style={[styles.body, { color: palette.body }]}
        >
          {body}
        </Text>

        {supportingText ? (
          <Text className={tw.textStart} style={styles.supportingText}>
            {supportingText}
          </Text>
        ) : null}

        {evidenceTags.length > 0 ? (
          <View style={styles.tagsWrap}>
            {evidenceTags
              .slice(0, emphasis === 'primary' ? 2 : 1)
              .map((tag) => (
                <Text key={tag} style={styles.evidenceText}>
                  {tag}
                </Text>
              ))}
          </View>
        ) : null}

        {emphasis === 'primary' ? (
          <View style={styles.primaryActionsRow}>
            {hasSecondaryAction ? (
              <Pressable
                onPress={onPressSecondaryAction as () => void}
                style={styles.secondaryActionButton}
              >
                <Text style={styles.secondaryActionText}>
                  {secondaryActionLabel}
                </Text>
                <Ionicons name="chevron-back" size={15} color="#64748B" />
              </Pressable>
            ) : (
              <View />
            )}

            {hasPrimaryCta ? (
              <Pressable
                onPress={onPressCta as () => void}
                disabled={isLoading}
                style={styles.primaryCtaWrap}
              >
                <View style={styles.primaryCta}>
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryCtaText}>{primaryCtaLabel}</Text>
                  )}
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : hasSecondaryAction ? (
          <View style={styles.secondaryFooter}>
            <Pressable
              onPress={onPressSecondaryAction as () => void}
              style={styles.secondaryInlineAction}
            >
              <Text style={styles.inlineActionText}>
                {secondaryActionLabel}
              </Text>
              <Ionicons name="chevron-back" size={14} color="#64748B" />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    minHeight: 150,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  content: {
    gap: 7,
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  body: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
  supportingText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
  tagsWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  evidenceText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.textMuted,
    textAlign: 'right',
  },
  primaryActionsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  primaryCtaWrap: {
    flex: 1,
  },
  primaryCta: {
    minHeight: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: DASHBOARD_TOKENS.colors.brandBlue,
  },
  primaryCtaText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  secondaryActionButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  secondaryActionText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
  secondaryFooter: {
    marginTop: 4,
    alignItems: 'flex-start',
  },
  secondaryInlineAction: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
  },
  inlineActionText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
  badge: {
    minWidth: 40,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
  statusBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
