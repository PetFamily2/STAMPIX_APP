import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { resolveCardTheme } from '@/constants/cardThemes';
import type { StampShape } from '@/constants/stampOptions';

type ProgramCardVariant = 'hero' | 'list' | 'compact' | 'wallet';
type ProgramCardStatus = 'default' | 'redeemable' | 'archived';

type ProgramCustomerCardPreviewProps = {
  businessName: string;
  rewardName: string;
  maxStamps: number;
  previewCurrentStamps?: number;
  title?: string;
  stampIcon?: string;
  stampShape?: StampShape;
  cardThemeId?: string | null;
  programImageUrl?: string | null;
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

function getStampShapeStyle(
  shape: StampShape,
  variant: ProgramCardVariant
): ViewStyle {
  const compact = variant === 'compact';
  switch (shape) {
    case 'roundedSquare':
      return { borderRadius: compact ? 4 : 5 };
    case 'square':
      return { borderRadius: 2 };
    case 'hexagon':
      return {
        borderRadius: 3,
        transform: [{ rotate: '45deg' }],
      };
    case 'icon':
      return { borderRadius: compact ? 6 : 7 };
    default:
      return {
        borderRadius: compact ? 7 : 9,
      };
  }
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
  stampShape = 'circle',
  cardThemeId,
  programImageUrl,
  businessLogoUrl,
  variant = 'list',
  status = 'default',
  selected = false,
  showAllStamps = false,
}: ProgramCustomerCardPreviewProps) {
  const isWallet = variant === 'wallet';
  const goal = Math.max(1, Number(maxStamps || 0));
  const fallbackCurrent =
    variant === 'hero' || isWallet ? Math.min(4, goal) : Math.min(2, goal);
  const current = clamp(previewCurrentStamps ?? fallbackCurrent, 0, goal);
  const visibleStamps = showAllStamps ? goal : goal;
  const dotIds = Array.from({ length: visibleStamps }, (_, index) => index + 1);
  const stampRows =
    visibleStamps <= 10
      ? [dotIds]
      : [
          dotIds.slice(0, Math.ceil(visibleStamps / 2)),
          dotIds.slice(Math.ceil(visibleStamps / 2)),
        ];
  const theme = resolveCardTheme(cardThemeId ?? undefined);

  const cardImageUri = programImageUrl?.trim() ? programImageUrl.trim() : null;
  const logoUri = businessLogoUrl?.trim() ? businessLogoUrl.trim() : null;
  const monogram = getMonogram(businessName);
  const badgeText =
    status === 'archived'
      ? TEXT.archivedBadge
      : status === 'redeemable'
        ? TEXT.readyBadge
        : null;
  const walletBrand = title?.trim() ? title : businessName;

  const walletVisibleMax = isWallet ? Math.min(goal, 16) : 0;
  const walletStampOverflow = isWallet
    ? Math.max(0, goal - walletVisibleMax)
    : 0;
  const walletStampGroups: number[][] = [];
  if (isWallet) {
    for (let g = 0; g < walletVisibleMax; g += 4) {
      walletStampGroups.push(
        Array.from(
          { length: Math.min(4, walletVisibleMax - g) },
          (_, i) => g + i + 1
        )
      );
    }
  }

  return (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        isWallet ? styles.containerWallet : null,
        variant === 'hero' ? styles.containerHero : null,
        variant === 'compact' ? styles.containerCompact : null,
        selected ? styles.containerSelected : null,
      ]}
    >
      {isWallet ? null : (
        <View
          style={[
            styles.glow,
            { backgroundColor: theme.glow },
            variant === 'compact' ? styles.glowCompact : null,
          ]}
        />
      )}

      {isWallet ? (
        <>
          <View style={styles.walletTopRow}>
            <View style={styles.walletBrandColumn}>
              <Text
                style={[styles.walletBrand, { color: theme.titleColor }]}
                numberOfLines={1}
              >
                {walletBrand}
              </Text>
              <Text
                style={[styles.walletBrandSub, { color: theme.subtitleColor }]}
              >
                club card
              </Text>
            </View>
            <View style={styles.walletChip}>
              <View style={styles.walletChipLineH} />
              <View style={styles.walletChipLineH} />
              <View style={styles.walletChipLineH} />
              <View style={styles.walletChipLineV} />
            </View>
          </View>

          <View style={styles.walletStampGroups}>
            {walletStampGroups.map((group, gi) => (
              <View key={gi} style={styles.walletStampGroup}>
                {group.map((dotId) => (
                  <View
                    key={dotId}
                    style={[
                      styles.walletStampDot,
                      dotId <= current
                        ? styles.walletStampDotFilled
                        : styles.walletStampDotEmpty,
                    ]}
                  />
                ))}
              </View>
            ))}
            {walletStampOverflow > 0 ? (
              <Text
                style={[
                  styles.walletStampOverflowText,
                  { color: theme.subtitleColor },
                ]}
              >
                +{walletStampOverflow}
              </Text>
            ) : null}
          </View>

          <View style={styles.walletBottomRow}>
            <Text
              style={[styles.walletOwner, { color: theme.subtitleColor }]}
              numberOfLines={1}
            >
              {businessName}
            </Text>
            <Text style={[styles.walletProgress, { color: theme.titleColor }]}>
              {current}/{goal}
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.headerRow}>
            <View
              style={[
                styles.logoShell,
                variant === 'compact' ? styles.logoShellCompact : null,
              ]}
            >
              {cardImageUri ? (
                <Image
                  source={{ uri: cardImageUri }}
                  style={styles.logoImage}
                  resizeMode="cover"
                  accessibilityLabel="Program image"
                />
              ) : logoUri ? (
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

          <View style={styles.stampsGrid}>
            {stampRows.map((row, rowIndex) => (
              <View
                key={`${title ?? rewardName}-row-${rowIndex + 1}`}
                style={styles.stampsLine}
              >
                {row.map((dotId) => {
                  const isFilled = dotId <= current;
                  const shouldShowIcon =
                    stampShape === 'icon'
                      ? Boolean(stampIcon)
                      : variant !== 'compact' && Boolean(stampIcon);
                  return (
                    <View
                      key={`${title ?? rewardName}-${dotId}`}
                      style={styles.stampCell}
                    >
                      <View
                        style={[
                          styles.stampDot,
                          variant === 'compact' ? styles.stampDotCompact : null,
                          getStampShapeStyle(stampShape, variant),
                          isFilled ? styles.stampDotFilled : styles.stampDotEmpty,
                        ]}
                      >
                        {shouldShowIcon ? (
                          <Text
                            style={[
                              styles.stampIconText,
                              stampShape === 'hexagon'
                                ? styles.stampIconTextHex
                                : null,
                            ]}
                          >
                            {stampIcon?.[0] ?? ''}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.footerRow}>
            {badgeText ? <Text style={styles.badge}>{badgeText}</Text> : null}
          </View>
        </>
      )}
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
  containerWallet: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 18,
    aspectRatio: 1.586,
    justifyContent: 'space-between',
    gap: 0,
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
  stampsGrid: {
    gap: 6,
  },
  stampsLine: {
    width: '100%',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stampCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  stampIconTextHex: {
    transform: [{ rotate: '-45deg' }],
  },
  footerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
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
  walletTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  walletBrandColumn: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  walletBrand: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  walletBrandSub: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'right',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  walletChip: {
    width: 46,
    height: 36,
    borderRadius: 7,
    backgroundColor: 'rgba(255,210,80,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(180,140,20,0.55)',
    justifyContent: 'space-between',
    padding: 7,
    overflow: 'hidden',
  },
  walletChipLineH: {
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(140,100,0,0.48)',
  },
  walletChipLineV: {
    position: 'absolute',
    width: 2,
    height: 22,
    top: 7,
    left: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(140,100,0,0.48)',
  },
  walletStampGroups: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'nowrap',
  },
  walletStampGroup: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
  },
  walletStampDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  walletStampDotFilled: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.88)',
  },
  walletStampDotEmpty: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.28)',
  },
  walletStampOverflowText: {
    fontSize: 13,
    fontWeight: '800',
  },
  walletBottomRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  walletOwner: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'right',
  },
  walletProgress: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    textAlign: 'left',
  },
});
