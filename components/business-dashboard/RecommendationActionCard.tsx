import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SurfaceCard } from '@/components/business-ui';
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
    badgeBg: string;
    badgeText: string;
  }
> = {
  critical: {
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    icon: 'warning-outline',
    title: '#111827',
    body: '#475569',
    border: '#F0E7D6',
    badgeBg: '#FFF5DB',
    badgeText: '#C27100',
  },
  warning: {
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    icon: 'sparkles-outline',
    title: '#111827',
    body: '#475569',
    border: '#F0E7D6',
    badgeBg: '#FFF5DB',
    badgeText: '#C27100',
  },
  neutral: {
    iconBg: '#DDF7F4',
    iconColor: '#0F766E',
    icon: 'leaf-outline',
    title: '#111827',
    body: '#475569',
    border: '#E6EBF4',
    badgeBg: '#FFF1D7',
    badgeText: '#CC8A00',
  },
  success: {
    iconBg: '#DCFCE7',
    iconColor: '#15803D',
    icon: 'checkmark-circle-outline',
    title: '#111827',
    body: '#475569',
    border: '#D8EEDC',
    badgeBg: '#E8F9EE',
    badgeText: '#15803D',
  },
};

export function RecommendationActionCard({
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
  const palette = PALETTE[tone];
  const hasPrimaryCta = Boolean(primaryCtaLabel && onPressCta);
  const hasSecondaryAction = Boolean(
    secondaryActionLabel && onPressSecondaryAction
  );

  return (
    <SurfaceCard
      elevated={emphasis === 'primary'}
      padding={emphasis === 'primary' ? 'lg' : 'md'}
      radius={emphasis === 'primary' ? 'hero' : 'lg'}
      style={[
        styles.card,
        emphasis === 'primary' ? styles.primaryCard : styles.secondaryCard,
        { borderColor: palette.border },
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
            <Ionicons name={palette.icon} size={18} color={palette.iconColor} />
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
                <LinearGradient
                  colors={
                    isLoading ? ['#A5B4FC', '#A5B4FC'] : ['#8B7BFF', '#6D5EF4']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryCtaGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryCtaText}>{primaryCtaLabel}</Text>
                  )}
                </LinearGradient>
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
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
  },
  primaryCard: {
    borderWidth: 1,
  },
  secondaryCard: {
    borderWidth: 1,
  },
  content: {
    gap: 8,
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  supportingText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: '#111827',
  },
  tagsWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  evidenceText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  primaryActionsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
  },
  primaryCtaWrap: {
    flex: 1,
  },
  primaryCtaGradient: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryCtaText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
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
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#64748B',
  },
  secondaryFooter: {
    marginTop: 2,
    alignItems: 'flex-start',
  },
  secondaryInlineAction: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
  },
  inlineActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  badge: {
    minWidth: 44,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  statusBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
