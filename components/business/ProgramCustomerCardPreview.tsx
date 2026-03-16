import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text, View } from 'react-native';

import { resolveCardTheme } from '@/constants/cardThemes';

type ProgramCardVariant = 'hero' | 'list' | 'compact';
type ProgramCardStatus = 'default' | 'redeemable' | 'archived';

type ProgramCustomerCardPreviewProps = {
  businessName: string;
  rewardName: string;
  maxStamps: number;
  previewCurrentStamps?: number;
  title?: string;
  stampIcon?: string;
  cardThemeId?: string | null;
  businessLogoUrl?: string | null;
  variant?: ProgramCardVariant;
  status?: ProgramCardStatus;
  selected?: boolean;
  showAllStamps?: boolean;
};

const TEXT = {
  rewardPrefix: '\u05D4\u05D8\u05D1\u05D4',
  readyBadge: '\u05DE\u05D5\u05DB\u05DF \u05DC\u05DE\u05D9\u05DE\u05D5\u05E9',
  archivedBadge: '\u05D1\u05D0\u05E8\u05DB\u05D9\u05D5\u05DF',
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMonogram(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (tokens.length === 0) {
    return 'S';
  }
  return tokens
    .map((token) => token[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

export default function ProgramCustomerCardPreview({
  businessName,
  rewardName,
  maxStamps,
  previewCurrentStamps,
  title,
  stampIcon,
  cardThemeId,
  businessLogoUrl,
  variant = 'list',
  status = 'default',
  selected = false,
  showAllStamps = false,
}: ProgramCustomerCardPreviewProps) {
  const goal = Math.max(1, Number(maxStamps || 0));
  const fallbackCurrent =
    variant === 'hero' ? Math.min(4, goal) : Math.min(2, goal);
  const current = clamp(previewCurrentStamps ?? fallbackCurrent, 0, goal);
  const defaultVisibleStamps = variant === 'compact' ? 8 : 12;
  const visibleStamps = showAllStamps
    ? goal
    : Math.min(goal, defaultVisibleStamps);
  const overflow = Math.max(0, goal - visibleStamps);
  const dotIds = Array.from({ length: visibleStamps }, (_, index) => index + 1);
  const theme = resolveCardTheme(cardThemeId ?? undefined);

  const logoUri = businessLogoUrl?.trim() ? businessLogoUrl.trim() : null;
  const monogram = getMonogram(businessName);
  const badgeText =
    status === 'archived'
      ? TEXT.archivedBadge
      : status === 'redeemable'
        ? TEXT.readyBadge
        : null;

  return (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        variant === 'hero' ? styles.containerHero : null,
        variant === 'compact' ? styles.containerCompact : null,
        selected ? styles.containerSelected : null,
      ]}
    >
      <View
        style={[
          styles.glow,
          { backgroundColor: theme.glow },
          variant === 'compact' ? styles.glowCompact : null,
        ]}
      />

      <View style={styles.headerRow}>
        <View
          style={[
            styles.logoShell,
            variant === 'compact' ? styles.logoShellCompact : null,
          ]}
        >
          {logoUri ? (
            <Image
              source={{ uri: logoUri }}
              style={styles.logoImage}
              resizeMode="cover"
              accessibilityLabel={`${businessName} logo`}
            />
          ) : (
            <Text style={styles.monogramText}>{monogram}</Text>
          )}
        </View>

        <View style={styles.metaColumn}>
          <Text
            style={[
              styles.cardTitle,
              variant === 'compact' ? styles.cardTitleCompact : null,
              { color: theme.titleColor },
            ]}
            numberOfLines={1}
          >
            {title?.trim() ? title : businessName}
          </Text>
          <Text
            style={[
              styles.rewardText,
              variant === 'compact' ? styles.rewardTextCompact : null,
              { color: theme.subtitleColor },
            ]}
            numberOfLines={1}
          >
            {TEXT.rewardPrefix}: {rewardName}
          </Text>
        </View>

        <View
          style={[
            styles.progressChip,
            variant === 'compact' ? styles.progressChipCompact : null,
          ]}
        >
          <Text style={styles.progressChipText}>
            {current}/{goal}
          </Text>
        </View>
      </View>

      <View style={styles.stampsRow}>
        {dotIds.map((dotId) => {
          const isFilled = dotId <= current;
          return (
            <View
              key={`${title ?? rewardName}-${dotId}`}
              style={[
                styles.stampDot,
                variant === 'compact' ? styles.stampDotCompact : null,
                isFilled ? styles.stampDotFilled : styles.stampDotEmpty,
              ]}
            >
              {variant !== 'compact' && stampIcon ? (
                <Text style={styles.stampIconText}>{stampIcon[0] ?? ''}</Text>
              ) : null}
            </View>
          );
        })}
        {overflow > 0 ? (
          <Text style={[styles.overflowText, { color: theme.subtitleColor }]}>
            +{overflow}
          </Text>
        ) : null}
      </View>

      <View style={styles.footerRow}>
        <Text style={[styles.businessNameText, { color: theme.subtitleColor }]}>
          {businessName}
        </Text>
        {badgeText ? <Text style={styles.badge}>{badgeText}</Text> : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    shadowColor: '#0B1220',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 5,
    gap: 10,
  },
  containerHero: {
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 12,
  },
  containerCompact: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  containerSelected: {
    borderColor: 'rgba(255,255,255,0.64)',
    shadowOpacity: 0.24,
  },
  glow: {
    position: 'absolute',
    top: -22,
    left: -32,
    width: 132,
    height: 132,
    borderRadius: 66,
  },
  glowCompact: {
    width: 96,
    height: 96,
    borderRadius: 48,
    top: -14,
    left: -20,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  logoShell: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoShellCompact: {
    width: 40,
    height: 40,
    borderRadius: 13,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  monogramText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  metaColumn: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
    textAlign: 'right',
  },
  cardTitleCompact: {
    fontSize: 14,
    lineHeight: 18,
  },
  rewardText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  rewardTextCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  progressChip: {
    minWidth: 54,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  progressChipCompact: {
    minWidth: 48,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  progressChipText: {
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  stampsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  stampDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampDotCompact: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  stampDotFilled: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(255,255,255,0.96)',
  },
  stampDotEmpty: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.34)',
  },
  stampIconText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1D4ED8',
    lineHeight: 11,
  },
  overflowText: {
    fontSize: 11,
    fontWeight: '800',
  },
  footerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  businessNameText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
  },
});
