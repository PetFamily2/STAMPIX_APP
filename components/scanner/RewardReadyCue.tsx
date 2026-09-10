import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';

import { playSubtleConfirmationHaptic } from '@/lib/feedback';
import { shouldAnimateRewardReadyCue } from '@/lib/scanner/posCelebration';

export default function RewardReadyCue() {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const scale = useRef(new Animated.Value(1)).current;

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
    playSubtleConfirmationHaptic();
    if (!shouldAnimateRewardReadyCue(reduceMotion)) {
      return;
    }
    const animation = Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.12,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 180,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [reduceMotion, scale]);

  return (
    <Animated.View style={[styles.icon, { transform: [{ scale }] }]}>
      <Ionicons name="gift" size={28} color="#FFFFFF" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
