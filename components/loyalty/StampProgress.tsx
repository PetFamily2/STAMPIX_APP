import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { StampShape } from '@/constants/stampOptions';
import { buildStampProgressLabel } from '@/lib/loyalty/cardPresentation';
import { flexDirection, ltrIslandText } from '@/lib/rtl';
import { StampIcon } from './StampIcon';

function shapeStyle(shape: StampShape): ViewStyle {
  if (shape === 'square') {
    return { borderRadius: 4 };
  }
  if (shape === 'roundedSquare') {
    return { borderRadius: 8 };
  }
  if (shape === 'hexagon') {
    return { borderRadius: 6, transform: [{ rotate: '45deg' }] };
  }
  return { borderRadius: 999 };
}

export function StampProgress({
  current,
  target,
  stampIcon,
  stampShape = 'circle',
  earnedColor,
  earnedIconColor,
  emptyColor,
  compact = false,
  showCount = true,
}: {
  current: number;
  target: number;
  stampIcon?: string;
  stampShape?: StampShape;
  earnedColor: string;
  earnedIconColor: string;
  emptyColor: string;
  compact?: boolean;
  showCount?: boolean;
}) {
  const safeTarget = Math.max(1, Math.floor(target));
  const safeCurrent = Math.min(safeTarget, Math.max(0, Math.floor(current)));
  const markSize = compact ? 22 : safeTarget > 14 ? 25 : 29;
  const iconSize = compact ? 12 : safeTarget > 14 ? 13 : 16;

  return (
    <View
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityLabel={buildStampProgressLabel(safeCurrent, safeTarget)}
      accessibilityValue={{ min: 0, max: safeTarget, now: safeCurrent }}
      style={styles.root}
    >
      {showCount ? (
        <Text style={[styles.count, ltrIslandText, { color: emptyColor }]}>
          {safeCurrent} / {safeTarget}
        </Text>
      ) : null}
      <View
        style={styles.grid}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: safeTarget }, (_, index) => {
          const earned = index < safeCurrent;
          const isRewardStamp = index === safeTarget - 1;
          return (
            <View
              key={`stamp-${index + 1}`}
              style={[
                styles.mark,
                shapeStyle(stampShape),
                {
                  width: markSize,
                  height: markSize,
                  borderColor: earned ? earnedColor : emptyColor,
                  backgroundColor: earned ? earnedColor : 'transparent',
                  borderWidth: isRewardStamp ? 2.5 : 1.5,
                },
              ]}
            >
              {earned ? (
                <View
                  style={stampShape === 'hexagon' ? styles.hexagonIcon : null}
                >
                  <StampIcon
                    value={stampIcon}
                    size={iconSize}
                    color={earnedIconColor}
                  />
                </View>
              ) : isRewardStamp ? (
                <View style={[styles.rewardDot, { backgroundColor: emptyColor }]} />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: 8 },
  count: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  grid: {
    width: '100%',
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 7,
  },
  mark: { alignItems: 'center', justifyContent: 'center' },
  hexagonIcon: { transform: [{ rotate: '-45deg' }] },
  rewardDot: { width: 4, height: 4, borderRadius: 2 },
});
