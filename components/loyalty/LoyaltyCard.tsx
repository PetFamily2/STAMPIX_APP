import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { resolveCardTheme } from '@/constants/cardThemes';
import type { StampShape } from '@/constants/stampOptions';
import {
  buildLoyaltyCardAccessibilityLabel,
  getBusinessMonogram,
  resolveLoyaltyCardPresentation,
  type LoyaltyCardProgress,
  type LoyaltyCardVariant,
  type LoyaltyProgramLifecycle,
} from '@/lib/loyalty/cardPresentation';
import {
  alignItems,
  flexDirection,
  ltrIslandText,
  rtlAutoText,
  selfStart,
} from '@/lib/rtl';

export type LoyaltyCardProps = {
  variant: LoyaltyCardVariant;
  businessName: string;
  businessLogoUrl?: string | null;
  programTitle: string;
  rewardName: string;
  programImageUrl?: string | null;
  maxStamps: number;
  progress: LoyaltyCardProgress;
  lifecycle: LoyaltyProgramLifecycle;
  membershipStatus?: 'joined' | 'available';
  cardThemeId?: string | null;
  stampIcon?: string;
  stampShape?: StampShape;
  selected?: boolean;
  onPress?: () => void;
};

function getStampShapeStyle(shape: StampShape): ViewStyle {
  if (shape === 'square') {
    return { borderRadius: 4 };
  }
  if (shape === 'roundedSquare') {
    return { borderRadius: 8 };
  }
  if (shape === 'hexagon') {
    return { borderRadius: 5, transform: [{ rotate: '45deg' }] };
  }
  return { borderRadius: 999 };
}

function ProgressMarks({
  current,
  target,
  variant,
  stampIcon,
  stampShape,
  accent,
  onAccent,
  emptyBorder,
}: {
  current: number;
  target: number;
  variant: LoyaltyCardVariant;
  stampIcon?: string;
  stampShape: StampShape;
  accent: string;
  onAccent: string;
  emptyBorder: string;
}) {
  const isExpanded = variant === 'full' || variant === 'preview';
  const shouldSplit = isExpanded && target > 8;
  const marks = Array.from({ length: target }, (_, index) => index + 1);
  const splitAt = shouldSplit ? Math.ceil(target / 2) : target;
  const rows = shouldSplit
    ? [marks.slice(0, splitAt), marks.slice(splitAt)]
    : [marks];
  const iconGlyphs = Array.from(stampIcon?.trim() ?? '');
  const configuredIcon =
    stampShape === 'icon' && iconGlyphs.length > 0 && iconGlyphs.length <= 2
      ? iconGlyphs[0]
      : null;

  return (
    <View
      style={styles.marksGroup}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {rows.map((row, rowIndex) => (
        <View key={`progress-row-${rowIndex + 1}`} style={styles.marksRow}>
          {row.map((mark) => {
            const complete = mark <= current;
            return (
              <View
                key={`progress-mark-${mark}`}
                style={[
                  styles.mark,
                  isExpanded ? styles.markExpanded : null,
                  getStampShapeStyle(stampShape),
                  {
                    backgroundColor: complete ? accent : 'transparent',
                    borderColor: complete ? accent : emptyBorder,
                  },
                ]}
              >
                {complete ? (
                  <Text
                    style={[
                      styles.markText,
                      isExpanded ? styles.markTextExpanded : null,
                      stampShape === 'hexagon' ? styles.markTextHexagon : null,
                      { color: onAccent },
                    ]}
                  >
                    {configuredIcon || '✓'}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function ProgressRail({
  current,
  target,
  variant,
  accent,
  trackColor,
}: {
  current: number;
  target: number;
  variant: LoyaltyCardVariant;
  accent: string;
  trackColor: string;
}) {
  const percentage = `${Math.round((current / target) * 100)}%` as `${number}%`;
  const isExpanded = variant === 'full' || variant === 'preview';
  return (
    <View
      style={[
        styles.rail,
        isExpanded ? styles.railExpanded : null,
        { backgroundColor: trackColor },
      ]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.railFill,
          { width: percentage, backgroundColor: accent },
        ]}
      />
      <View style={[styles.railNotch, styles.railNotchQuarter]} />
      <View style={[styles.railNotch, styles.railNotchHalf]} />
      <View style={[styles.railNotch, styles.railNotchThreeQuarter]} />
    </View>
  );
}

export default function LoyaltyCard({
  variant,
  businessName,
  businessLogoUrl,
  programTitle,
  rewardName,
  programImageUrl,
  maxStamps,
  progress,
  lifecycle,
  membershipStatus = 'joined',
  cardThemeId,
  stampIcon,
  stampShape = 'circle',
  selected = false,
  onPress,
}: LoyaltyCardProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isNarrow = windowWidth < 360;
  const theme = resolveCardTheme(cardThemeId ?? undefined);
  const presentation = resolveLoyaltyCardPresentation({
    variant,
    lifecycle,
    membershipStatus,
    progress,
    maxStamps,
    rewardName,
  });
  const isExpanded = variant === 'full' || variant === 'preview';
  const isManagement = variant === 'management';
  const isReady = presentation.state === 'rewardReady';
  const isArchived = presentation.state === 'archived';
  const logoUri = businessLogoUrl?.trim() || null;
  const programImageUri = programImageUrl?.trim() || null;
  const showProgramImage = Boolean(
    programImageUri &&
      !isManagement &&
      (variant !== 'wallet' || windowWidth >= 360)
  );
  const accessibilityLabel = buildLoyaltyCardAccessibilityLabel({
    businessName,
    programTitle,
    rewardName,
    presentation,
  });
  const badgeText = isArchived
    ? 'בארכיון'
    : isReady
      ? 'ההטבה מוכנה'
      : membershipStatus === 'available'
        ? 'להצטרפות'
        : lifecycle === 'draft'
          ? 'טיוטה'
          : null;

  const card = (
    <LinearGradient
      colors={[theme.surface, theme.surfaceAlt]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.card,
        variant === 'wallet' ? styles.cardWallet : null,
        isNarrow ? styles.cardNarrow : null,
        isExpanded ? styles.cardExpanded : null,
        variant === 'preview' ? styles.cardPreview : null,
        isManagement ? styles.cardManagement : null,
        { borderColor: theme.keyline },
        selected ? styles.cardSelected : null,
        isReady ? styles.cardReady : null,
        isArchived ? styles.cardArchived : null,
      ]}
    >
      {isReady ? <View style={styles.readyWash} /> : null}
      {isArchived ? <View style={styles.archivedWash} /> : null}

      <View style={styles.identityRow}>
        <View
          style={[
            styles.logo,
            isExpanded ? styles.logoExpanded : null,
            { borderColor: theme.keyline },
          ]}
        >
          {logoUri ? (
            <Image
              source={{ uri: logoUri }}
              resizeMode="cover"
              style={styles.image}
              accessible={false}
            />
          ) : (
            <Text style={[styles.monogram, { color: theme.onSurface }]}>
              {getBusinessMonogram(businessName)}
            </Text>
          )}
        </View>

        <View style={styles.identityCopy}>
          <Text
            style={[
              styles.businessName,
              isExpanded ? styles.businessNameExpanded : null,
              rtlAutoText,
              { color: theme.onSurface },
            ]}
            numberOfLines={isExpanded ? 2 : 1}
            ellipsizeMode="tail"
          >
            {businessName}
          </Text>
          <Text
            style={[
              styles.programTitle,
              rtlAutoText,
              { color: theme.onSurfaceMuted },
            ]}
            numberOfLines={isExpanded ? 2 : 1}
            ellipsizeMode="tail"
          >
            {programTitle}
          </Text>
        </View>

        {badgeText ? (
          <View
            style={[
              styles.badge,
              isReady ? styles.badgeReady : null,
              isArchived ? styles.badgeArchived : null,
              !isReady && !isArchived
                ? { borderColor: theme.keyline }
                : null,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                {
                  color:
                    isReady || isArchived
                      ? '#FFFFFF'
                      : theme.onSurface,
                },
              ]}
            >
              {badgeText}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.rewardRow}>
        <View style={styles.rewardCopy}>
          <Text
            style={[
              styles.rewardName,
              isExpanded ? styles.rewardNameExpanded : null,
              isManagement ? styles.rewardNameManagement : null,
              isReady ? styles.rewardNameReady : null,
              rtlAutoText,
              { color: theme.onSurface },
            ]}
            numberOfLines={isExpanded ? undefined : 2}
            ellipsizeMode="tail"
            adjustsFontSizeToFit={!isExpanded}
            minimumFontScale={0.88}
          >
            {rewardName}
          </Text>
        </View>
        {showProgramImage && programImageUri ? (
          <View
            style={[
              styles.programImage,
              isExpanded ? styles.programImageExpanded : null,
              { borderColor: theme.keyline },
            ]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Image
              source={{ uri: programImageUri }}
              resizeMode="cover"
              style={styles.image}
              accessible={false}
            />
          </View>
        ) : null}
      </View>

      {presentation.targetIsValid ? (
        <View style={styles.progressBlock}>
          <View style={styles.progressCountRow}>
            {presentation.hasProgressData ? (
              <>
                <Text
                  style={[
                    styles.progressCount,
                    isExpanded ? styles.progressCountExpanded : null,
                    ltrIslandText,
                    { color: theme.onSurface },
                  ]}
                >
                  {presentation.current}
                </Text>
                <Text
                  style={[
                    styles.progressConnector,
                    { color: theme.onSurfaceMuted },
                  ]}
                >
                  מתוך
                </Text>
                <Text
                  style={[
                    styles.progressCount,
                    isExpanded ? styles.progressCountExpanded : null,
                    ltrIslandText,
                    { color: theme.onSurface },
                  ]}
                >
                  {presentation.target}
                </Text>
                <Text
                  style={[
                    styles.progressLabel,
                    { color: theme.onSurfaceMuted },
                  ]}
                >
                  ניקובים
                </Text>
              </>
            ) : (
              <>
                <Text
                  style={[
                    styles.progressCount,
                    isExpanded ? styles.progressCountExpanded : null,
                    ltrIslandText,
                    { color: theme.onSurface },
                  ]}
                >
                  {presentation.target}
                </Text>
                <Text
                  style={[
                    styles.progressLabel,
                    { color: theme.onSurfaceMuted },
                  ]}
                >
                  יעד ניקובים
                </Text>
              </>
            )}
          </View>

          {presentation.strategy === 'discrete' ? (
            <ProgressMarks
              current={presentation.current}
              target={presentation.target}
              variant={variant}
              stampIcon={stampIcon}
              stampShape={stampShape}
              accent={theme.accent}
              onAccent={theme.onAccent}
              emptyBorder={theme.onSurfaceMuted}
            />
          ) : (
            <ProgressRail
              current={presentation.current}
              target={presentation.target}
              variant={variant}
              accent={theme.accent}
              trackColor={
                theme.isLight
                  ? 'rgba(67,20,7,0.14)'
                  : 'rgba(255,255,255,0.16)'
              }
            />
          )}
        </View>
      ) : null}

      <View style={styles.footerRow}>
        <View style={styles.statusCopy}>
          {presentation.isSample ? (
            <Text style={[styles.sampleLabel, { color: theme.onSurface }]}>
              תצוגה לדוגמה
            </Text>
          ) : null}
          <Text
            style={[styles.statusText, { color: theme.onSurfaceMuted }]}
            numberOfLines={isExpanded ? undefined : 2}
          >
            {presentation.statusText}
          </Text>
        </View>
        <Text
          style={[styles.signature, { color: theme.onSurfaceMuted }]}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          S · StampAix
        </Text>
      </View>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.root,
          isExpanded ? styles.rootExpanded : null,
          variant === 'preview' ? styles.rootPreview : null,
          pressed ? styles.rootPressed : null,
        ]}
      >
        {card}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.root,
        isExpanded ? styles.rootExpanded : null,
        variant === 'preview' ? styles.rootPreview : null,
      ]}
      accessible={true}
      accessibilityLabel={accessibilityLabel}
    >
      {card}
    </View>
  );
}

export function LoyaltyCardSkeleton({
  variant = 'wallet',
}: {
  variant?: LoyaltyCardVariant;
}) {
  const expanded = variant === 'full' || variant === 'preview';
  return (
    <View
      style={[
        styles.skeleton,
        expanded ? styles.skeletonExpanded : null,
      ]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.skeletonHeader}>
        <View style={styles.skeletonLogo} />
        <View style={styles.skeletonCopy}>
          <View style={styles.skeletonLineShort} />
          <View style={styles.skeletonLineTiny} />
        </View>
      </View>
      <View style={styles.skeletonReward} />
      <View style={styles.skeletonProgress} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: 420,
  },
  rootPressed: { opacity: 0.94 },
  rootExpanded: { maxWidth: 600 },
  rootPreview: { maxWidth: 560 },
  card: {
    width: '100%',
    minHeight: 184,
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardWallet: { maxWidth: 420 },
  cardNarrow: { paddingHorizontal: 16, paddingVertical: 16 },
  cardExpanded: {
    maxWidth: 600,
    minHeight: 250,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 18,
  },
  cardPreview: { maxWidth: 560 },
  cardManagement: {
    minHeight: 150,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  cardSelected: { borderColor: '#93C5FD', borderWidth: 2 },
  cardReady: { borderColor: '#34D399' },
  cardArchived: { borderColor: '#94A3B8' },
  readyWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(236,253,245,0.1)',
  },
  archivedWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.28)',
  },
  identityRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoExpanded: { width: 52, height: 52, borderRadius: 16 },
  image: { width: '100%', height: '100%' },
  monogram: { fontSize: 14, lineHeight: 18, fontWeight: '800' },
  identityCopy: { flex: 1, alignItems: alignItems.start, gap: 2 },
  businessName: {
    width: '100%',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  businessNameExpanded: { fontSize: 17, lineHeight: 22 },
  programTitle: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  badge: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeReady: { backgroundColor: '#0F766E', borderColor: '#34D399' },
  badgeArchived: { backgroundColor: '#475569', borderColor: '#94A3B8' },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  rewardRow: { flexDirection: flexDirection.row, alignItems: 'center', gap: 12 },
  rewardCopy: { flex: 1, alignItems: alignItems.start },
  rewardName: {
    width: '100%',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
  },
  rewardNameExpanded: { fontSize: 30, lineHeight: 35 },
  rewardNameManagement: { fontSize: 21, lineHeight: 25 },
  rewardNameReady: { fontWeight: '900' },
  programImage: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  programImageExpanded: { width: 88, height: 64, borderRadius: 18 },
  progressBlock: { gap: 8 },
  progressCountRow: {
    flexDirection: flexDirection.row,
    alignItems: 'baseline',
    gap: 6,
  },
  progressCount: { fontSize: 22, lineHeight: 27, fontWeight: '800' },
  progressCountExpanded: { fontSize: 32, lineHeight: 36 },
  progressLabel: {
    ...rtlAutoText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  progressConnector: {
    ...rtlAutoText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  marksGroup: { gap: 8 },
  marksRow: { flexDirection: flexDirection.row, alignItems: 'center', gap: 6 },
  mark: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markExpanded: { width: 24, height: 24 },
  markText: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  markTextExpanded: { fontSize: 13, lineHeight: 15 },
  markTextHexagon: { transform: [{ rotate: '-45deg' }] },
  rail: { height: 8, borderRadius: 999, overflow: 'hidden' },
  railExpanded: { height: 10 },
  railFill: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
  },
  railNotch: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  railNotchQuarter: { right: '25%' },
  railNotchHalf: { right: '50%' },
  railNotchThreeQuarter: { right: '75%' },
  footerRow: {
    flexDirection: flexDirection.row,
    alignItems: alignItems.start,
    gap: 12,
  },
  statusCopy: { flex: 1, alignItems: alignItems.start, gap: 2 },
  sampleLabel: {
    ...rtlAutoText,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  statusText: {
    ...rtlAutoText,
    width: '100%',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  signature: {
    ...ltrIslandText,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    opacity: 0.62,
  },
  skeleton: {
    width: '100%',
    maxWidth: 420,
    minHeight: 184,
    alignSelf: 'center',
    borderRadius: 24,
    backgroundColor: '#DCE6F7',
    padding: 20,
    gap: 20,
  },
  skeletonExpanded: {
    maxWidth: 600,
    minHeight: 250,
    borderRadius: 28,
    padding: 24,
  },
  skeletonHeader: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
  },
  skeletonLogo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#C7D6ED',
  },
  skeletonCopy: { flex: 1, alignItems: alignItems.start, gap: 7 },
  skeletonLineShort: {
    width: '58%',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#C7D6ED',
  },
  skeletonLineTiny: {
    width: '36%',
    height: 9,
    borderRadius: 5,
    backgroundColor: '#C7D6ED',
  },
  skeletonReward: {
    width: '76%',
    height: 28,
    borderRadius: 8,
    backgroundColor: '#C7D6ED',
    alignSelf: selfStart,
  },
  skeletonProgress: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C7D6ED',
  },
});
