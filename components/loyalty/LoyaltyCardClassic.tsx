import { useId } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, Pattern, Polygon, Rect } from 'react-native-svg';
import { AppText as Text } from '@/components/ui/AppText';
import { normalizeStampShape, type StampShape } from '@/constants/stampOptions';
import {
  buildLoyaltyCardAccessibilityLabel,
  resolveLoyaltyCardPresentation,
} from '@/lib/loyalty/cardPresentation';
import { classicPrintedRewardLine } from '@/lib/loyalty/classicPrintedCopy';
import {
  classicNameWeight,
  classicStampColumns,
  classicStampRotation,
} from '@/lib/loyalty/classicStampLayout';
import { resolveClassicStampPalette } from '@/lib/loyalty/classicStampPalette';
import { ltrIslandText, flexDirection as rtlRow } from '@/lib/rtl';
import { ClassicStampGlyph } from './ClassicStampGlyph';
import type { LoyaltyCardProps } from './LoyaltyCard';

function PaperGrain({ ink }: { ink: string }) {
  const patternId = `classic-grain-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <Pattern
          id={patternId}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
        >
          <Circle cx="1" cy="1" r="0.7" fill={ink} opacity={0.09} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </Svg>
  );
}

function plateStyle(
  shape: StampShape,
  earned: boolean,
  ink: string,
  mute: string
): ViewStyle {
  const radius =
    shape === 'circle' || shape === 'icon'
      ? 999
      : shape === 'roundedSquare'
        ? 12
        : 4;
  return {
    width: '88%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: shape === 'icon' ? 0 : earned ? 1.75 : 1.25,
    borderColor: shape === 'icon' ? 'transparent' : earned ? ink : mute,
    borderRadius: radius,
    backgroundColor: earned && shape !== 'icon' ? `${ink}1A` : 'transparent',
  };
}

export function LoyaltyCardClassic({
  businessName,
  businessLogoUrl,
  programTitle,
  rewardName,
  maxStamps,
  progress,
  lifecycle,
  membershipStatus = 'joined',
  cardThemeId,
  stampIcon,
  stampShape = 'circle',
  variant,
  selected = false,
  density = 'full',
  onPress,
}: LoyaltyCardProps) {
  const palette = resolveClassicStampPalette(cardThemeId);
  const shape = normalizeStampShape(stampShape);
  const presentation = resolveLoyaltyCardPresentation({
    variant,
    lifecycle,
    membershipStatus,
    progress,
    maxStamps,
    rewardName,
  });
  const earned = presentation.hasProgressData ? presentation.current : 0;
  const ready = presentation.state === 'rewardReady';
  const archived = presentation.state === 'archived';
  const columns = classicStampColumns(presentation.target);
  const compact = density === 'compact';
  const visibleStampCount =
    compact && presentation.target > 10 ? 5 : presentation.target;
  const printedReward = classicPrintedRewardLine(programTitle, rewardName);
  const label = buildLoyaltyCardAccessibilityLabel({
    businessName,
    programTitle,
    rewardName: printedReward ?? programTitle,
    presentation,
  });
  const logoUri = businessLogoUrl?.trim() || null;
  const tally = presentation.hasProgressData
    ? `${presentation.current} / ${presentation.target}`
    : String(presentation.target);

  const card = (
    <View
      style={[
        styles.card,
        compact ? styles.cardCompact : null,
        {
          backgroundColor: palette.paper,
          borderColor: selected ? palette.ink : 'transparent',
          opacity: archived ? 0.72 : 1,
        },
      ]}
    >
      <PaperGrain ink={palette.ink} />
      <View style={[styles.face, compact ? styles.faceCompact : null]}>
        {logoUri ? (
          <Image
            accessible={false}
            source={{ uri: logoUri }}
            style={[styles.logo, { borderColor: palette.ink }]}
          />
        ) : null}
        <View style={styles.nameWrap}>
          <Text
            numberOfLines={2}
            style={[
              styles.name,
              compact ? styles.nameCompact : null,
              shape === 'square' || shape === 'hexagon'
                ? styles.nameRuled
                : null,
              shape === 'roundedSquare' ? styles.nameUnderlined : null,
              {
                color: palette.ink,
                fontWeight: classicNameWeight(shape),
                borderColor: palette.ink,
              },
            ]}
          >
            {businessName}
          </Text>
        </View>
        <Text
          numberOfLines={2}
          style={[
            styles.program,
            compact ? styles.programCompact : null,
            { color: palette.soft },
          ]}
        >
          {programTitle}
        </Text>
        <View
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
          style={styles.grid}
        >
          {Array.from({ length: visibleStampCount }, (_, index) => {
            const on = index < earned;
            const rewardSlot = index === presentation.target - 1;
            const rotation = on ? classicStampRotation(index) : 0;
            return (
              <View
                key={`stamp-${index + 1}`}
                style={[styles.cell, { width: `${100 / columns}%` }]}
              >
                <View
                  style={[
                    plateStyle(shape, on, palette.ink, palette.mute),
                    shape === 'hexagon' ? styles.hexPlate : null,
                    on ? { transform: [{ rotate: `${rotation}deg` }] } : null,
                  ]}
                >
                  {rewardSlot &&
                  !on &&
                  shape !== 'hexagon' &&
                  shape !== 'icon' ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.innerRing,
                        {
                          borderColor: palette.mute,
                          borderRadius:
                            shape === 'circle'
                              ? 999
                              : shape === 'roundedSquare'
                                ? 8
                                : 2,
                        },
                      ]}
                    />
                  ) : null}
                  {shape === 'hexagon' ? (
                    <Svg
                      pointerEvents="none"
                      style={StyleSheet.absoluteFill}
                      viewBox="0 0 100 100"
                    >
                      <Polygon
                        fill={on ? `${palette.ink}1A` : 'none'}
                        points="50,5 93,27 93,73 50,95 7,73 7,27"
                        stroke={on ? palette.ink : palette.mute}
                        strokeWidth={on ? 3 : 2}
                      />
                      {rewardSlot && !on ? (
                        <Polygon
                          fill="none"
                          points="50,14 84,32 84,68 50,86 16,68 16,32"
                          stroke={palette.mute}
                          strokeWidth={1.6}
                        />
                      ) : null}
                    </Svg>
                  ) : null}
                  {on ? (
                    <View pointerEvents="none" style={styles.ghost}>
                      <ClassicStampGlyph
                        color={palette.ink}
                        earned={true}
                        icon={stampIcon ?? 'star'}
                        paper={palette.paper}
                      />
                    </View>
                  ) : null}
                  <ClassicStampGlyph
                    color={on ? palette.ink : palette.mute}
                    earned={on}
                    icon={stampIcon ?? 'star'}
                    paper={palette.paper}
                  />
                </View>
              </View>
            );
          })}
        </View>
        {printedReward ? (
          <Text
            numberOfLines={2}
            style={[
              styles.reward,
              compact ? styles.rewardCompact : null,
              { color: palette.ink },
            ]}
          >
            {printedReward}
          </Text>
        ) : null}
        <Text
          accessibilityRole={
            presentation.hasProgressData ? 'progressbar' : undefined
          }
          accessibilityValue={
            presentation.hasProgressData
              ? {
                  min: 0,
                  max: presentation.target,
                  now: presentation.current,
                }
              : undefined
          }
          style={[styles.tally, ltrIslandText, { color: palette.soft }]}
        >
          {tally}
        </Text>
        {ready ? (
          <Text
            style={[
              styles.ready,
              { borderColor: palette.ink, color: palette.ink },
            ]}
          >
            מוכן
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [styles.press, pressed ? styles.pressed : null]}
      >
        {card}
      </Pressable>
    );
  }

  return (
    <View accessible={true} accessibilityLabel={label}>
      {card}
    </View>
  );
}

export function LoyaltyCardClassicSkeleton() {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={styles.skeleton}
    />
  );
}

const styles = StyleSheet.create({
  press: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  pressed: { opacity: 0.94 },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 2,
    shadowColor: '#46301A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  face: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 2,
  },
  nameWrap: { width: '100%', alignItems: 'center' },
  name: {
    width: '100%',
    textAlign: 'center',
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  nameCompact: {
    fontSize: 18,
    lineHeight: 22,
  },
  nameRuled: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  nameUnderlined: {
    borderBottomWidth: 3,
    paddingBottom: 2,
    alignSelf: 'center',
  },
  program: {
    width: '100%',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  programCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  grid: {
    width: '100%',
    flexDirection: rtlRow.row,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  cell: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  hexPlate: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  innerRing: {
    position: 'absolute',
    top: 3,
    right: 3,
    bottom: 3,
    left: 3,
    borderWidth: 1.25,
  },
  ghost: {
    position: 'absolute',
    top: 2,
    left: 2,
    opacity: 0.34,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reward: {
    width: '100%',
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  rewardCompact: {
    fontSize: 14,
    lineHeight: 18,
  },
  cardCompact: {
    maxWidth: 280,
  },
  faceCompact: {
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 10,
    gap: 4,
  },
  tally: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  ready: {
    minHeight: 32,
    marginTop: 2,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderRadius: 999,
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 30,
    fontWeight: '700',
  },
  skeleton: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    height: 240,
    borderRadius: 12,
    backgroundColor: '#E7D7C4',
  },
});
