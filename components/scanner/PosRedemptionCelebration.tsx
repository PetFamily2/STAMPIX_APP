import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ltrIslandText, rtlCenterText } from '@/lib/rtl';
import {
  POS_REDEMPTION_CELEBRATION_DURATION_MS,
  shouldAnimatePosRedemptionCelebration,
} from '@/lib/scanner/posCelebration';

const SPARKLE_COUNT = 12;
const SPARKLE_COLORS = ['#FBBF24', '#22C55E', '#60A5FA', '#A78BFA'];

type PosRedemptionCelebrationProps = {
  eventKey: string;
  customerName: string;
  programName: string;
  rewardName: string;
  currentStamps: number;
  maxStamps: number;
  onComplete: (eventKey: string) => void;
};

export default function PosRedemptionCelebration({
  eventKey,
  customerName,
  programName,
  rewardName,
  currentStamps,
  maxStamps,
  onComplete,
}: PosRedemptionCelebrationProps) {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const entrance = useRef(new Animated.Value(1)).current;
  const sparkles = useMemo(
    () =>
      Array.from({ length: SPARKLE_COUNT }, (_, index) => ({
        id: `${eventKey}:sparkle:${index}`,
        angle: (index / SPARKLE_COUNT) * Math.PI * 2,
        distance: 54 + (index % 3) * 10,
      })),
    [eventKey]
  );

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) {
      return;
    }
    entrance.stopAnimation();
    entrance.setValue(reduceMotion ? 1 : 0);

    const animation = shouldAnimatePosRedemptionCelebration(reduceMotion)
      ? Animated.sequence([
          Animated.timing(entrance, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.back(1.4)),
            useNativeDriver: true,
          }),
          Animated.delay(560),
          Animated.timing(entrance, {
            toValue: 0,
            duration: 220,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      : null;
    animation?.start();

    const timeout = setTimeout(() => {
      onComplete(eventKey);
    }, POS_REDEMPTION_CELEBRATION_DURATION_MS);

    return () => {
      animation?.stop();
      clearTimeout(timeout);
    };
  }, [entrance, eventKey, onComplete, reduceMotion]);

  const cardScale = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  });
  const sparkleProgress = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 1],
  });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLabel={`ההטבה מומשה. ${customerName}. ${rewardName}. ${currentStamps} מתוך ${maxStamps}`}
      style={[styles.overlay, { opacity: entrance }]}
    >
      <View style={styles.backdrop} />
      {reduceMotion === false ? (
        <View style={styles.sparkleField} accessible={false}>
          {sparkles.map((sparkle, index) => {
            const translateX = Animated.multiply(
              sparkleProgress,
              Math.cos(sparkle.angle) * sparkle.distance
            );
            const translateY = Animated.multiply(
              sparkleProgress,
              Math.sin(sparkle.angle) * sparkle.distance
            );
            return (
              <Animated.View
                key={sparkle.id}
                style={[
                  styles.sparkle,
                  {
                    backgroundColor:
                      SPARKLE_COLORS[index % SPARKLE_COLORS.length],
                    transform: [{ translateX }, { translateY }],
                  },
                ]}
              />
            );
          })}
        </View>
      ) : null}
      <Animated.View
        style={[styles.card, { transform: [{ scale: cardScale }] }]}
      >
        <View style={styles.icon}>
          <Ionicons name="gift" size={34} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>ההטבה מומשה!</Text>
        <Text style={styles.customer} numberOfLines={1}>
          {customerName}
        </Text>
        <Text style={styles.context} numberOfLines={1}>
          {programName} · {rewardName}
        </Text>
        <Text style={styles.balance}>
          {currentStamps}/{maxStamps}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(236, 253, 245, 0.96)',
  },
  sparkleField: {
    position: 'absolute',
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  card: {
    width: '86%',
    maxWidth: 360,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 5,
    shadowColor: '#166534',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  icon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  title: {
    width: '100%',
    ...rtlCenterText,
    color: '#14532D',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  customer: {
    width: '100%',
    ...rtlCenterText,
    color: '#0F172A',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  context: {
    width: '100%',
    ...rtlCenterText,
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  balance: {
    ...ltrIslandText,
    color: '#14532D',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
  },
});
