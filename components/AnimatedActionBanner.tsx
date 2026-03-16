import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

type BannerVariant = 'success' | 'info';

type AnimatedActionBannerProps = {
  eventKey: number;
  message: string;
  topOffset?: number;
  durationMs?: number;
  variant?: BannerVariant;
  showFireworks?: boolean;
};

const FIREWORK_PARTICLES = 12;
const FIREWORK_COLORS = [
  '#FFE066',
  '#FF9F1C',
  '#2EC4B6',
  '#E71D36',
  '#7B61FF',
  '#5DE2E7',
];

function FireworksBurst({ triggerKey }: { triggerKey: number }) {
  const particleProgress = useRef(
    Array.from({ length: FIREWORK_PARTICLES }, () => new Animated.Value(0))
  ).current;

  const vectors = useMemo(
    () =>
      Array.from({ length: FIREWORK_PARTICLES }, (_, index) => {
        const angle = (index / FIREWORK_PARTICLES) * Math.PI * 2;
        return {
          x: Math.cos(angle),
          y: Math.sin(angle),
        };
      }),
    []
  );

  useEffect(() => {
    if (triggerKey <= 0) {
      return;
    }

    for (const value of particleProgress) {
      value.stopAnimation();
      value.setValue(0);
    }

    const animations = particleProgress.map((value, index) =>
      Animated.timing(value, {
        toValue: 1,
        duration: 680,
        delay: index * 18,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );

    Animated.stagger(14, animations).start();
  }, [particleProgress, triggerKey]);

  return (
    <View pointerEvents="none" style={styles.fireworksContainer}>
      {particleProgress.map((progress, index) => {
        const distance = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 82],
        });
        const opacity = progress.interpolate({
          inputRange: [0, 0.45, 1],
          outputRange: [0, 1, 0],
        });
        const scale = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.3, 1.15],
        });
        const translateX = Animated.multiply(distance, vectors[index].x);
        const translateY = Animated.multiply(distance, vectors[index].y);

        return (
          <Animated.View
            key={`particle-${index}`}
            style={[
              styles.fireworkParticle,
              {
                backgroundColor:
                  FIREWORK_COLORS[index % FIREWORK_COLORS.length],
                opacity,
                transform: [{ translateX }, { translateY }, { scale }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export default function AnimatedActionBanner({
  eventKey,
  message,
  topOffset = 8,
  durationMs = 2200,
  variant = 'success',
  showFireworks = false,
}: AnimatedActionBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-24)).current;

  useEffect(() => {
    if (eventKey <= 0) {
      return;
    }

    setIsVisible(true);
    opacity.stopAnimation();
    translateY.stopAnimation();
    opacity.setValue(0);
    translateY.setValue(-24);

    const enter = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    const exit = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -24,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    enter.start();
    const timeout = setTimeout(() => {
      exit.start(() => setIsVisible(false));
    }, durationMs);

    return () => {
      clearTimeout(timeout);
    };
  }, [durationMs, eventKey, opacity, translateY]);

  if (!isVisible) {
    return null;
  }

  const success = variant === 'success';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.overlay,
        {
          top: topOffset,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {showFireworks ? <FireworksBurst triggerKey={eventKey} /> : null}
      <View
        style={[
          styles.banner,
          success ? styles.successBanner : styles.infoBanner,
        ]}
      >
        <Text style={styles.icon}>{success ? '\u2714' : '\u2139'}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 999,
    alignItems: 'center',
  },
  banner: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
  },
  successBanner: {
    backgroundColor: '#EAFBF1',
    borderColor: '#9EDDB9',
  },
  infoBanner: {
    backgroundColor: '#EAF1FF',
    borderColor: '#B7CEFF',
  },
  icon: {
    fontSize: 14,
    color: '#0D7A3E',
    fontWeight: '900',
  },
  message: {
    color: '#113A64',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  fireworksContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fireworkParticle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
