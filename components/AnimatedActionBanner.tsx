import { useEffect, useMemo, useRef, useState } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

type BannerVariant = 'success' | 'info';
type BannerPlacement = 'top' | 'center';
type BannerEmphasis = 'default' | 'large';

type AnimatedActionBannerProps = {
  eventKey: number;
  message: string;
  topOffset?: number;
  durationMs?: number;
  variant?: BannerVariant;
  showFireworks?: boolean;
  showConfetti?: boolean;
  placement?: BannerPlacement;
  emphasis?: BannerEmphasis;
  fullScreenCelebration?: boolean;
  bannerStyle?: StyleProp<ViewStyle>;
  messageStyle?: StyleProp<TextStyle>;
  iconStyle?: StyleProp<TextStyle>;
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
const CONFETTI_PARTICLES = 200;
const CONFETTI_COLORS = [
  '#FFB703',
  '#FB8500',
  '#8ECAE6',
  '#219EBC',
  '#FF6B6B',
  '#95D5B2',
];
const STAR_PARTICLES = 26;
const STAR_COLORS = ['#FFFFFF', '#E8F0FF', '#D8E7FF'];
const STAR_GLOW_COLORS = ['rgba(255,255,255,0.36)', 'rgba(232,240,255,0.3)'];

function FireworksBurst({ triggerKey }: { triggerKey: number }) {
  const particles = useRef(
    Array.from({ length: FIREWORK_PARTICLES }, (_, index) => ({
      id: `particle-${index}`,
      progress: new Animated.Value(0),
    }))
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

    for (const particle of particles) {
      particle.progress.stopAnimation();
      particle.progress.setValue(0);
    }

    const animations = particles.map((particle, index) =>
      Animated.timing(particle.progress, {
        toValue: 1,
        duration: 680,
        delay: index * 18,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );

    Animated.stagger(14, animations).start();
  }, [particles, triggerKey]);

  return (
    <View pointerEvents="none" style={styles.fireworksContainer}>
      {particles.map((particle, index) => {
        const progress = particle.progress;
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
            key={particle.id}
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

function ConfettiBurst({
  triggerKey,
  fullScreen,
  celebrationDurationMs,
}: {
  triggerKey: number;
  fullScreen: boolean;
  celebrationDurationMs: number;
}) {
  const pieces = useRef(
    Array.from({ length: CONFETTI_PARTICLES }, (_, index) => {
      const marginPercent = fullScreen ? 2 : 8;
      return {
        id: `confetti-${index}`,
        progress: new Animated.Value(0),
        xPercent: marginPercent + Math.random() * (100 - marginPercent * 2),
        yPercent: marginPercent + Math.random() * (100 - marginPercent * 2),
        xDrift: (Math.random() - 0.5) * (fullScreen ? 52 : 34),
        yDrift: (Math.random() - 0.5) * (fullScreen ? 56 : 36),
        delayRatio: 0,
        durationRatio: 1.08 + Math.random() * 0.32,
        size: 5 + Math.floor(Math.random() * 5),
        rotateFrom: Math.floor(Math.random() * 90),
        rotateTo: 260 + Math.floor(Math.random() * 260),
      };
    })
  ).current;

  useEffect(() => {
    if (triggerKey <= 0) {
      return;
    }

    const animations: Animated.CompositeAnimation[] = [];
    for (const piece of pieces) {
      piece.progress.stopAnimation();
      piece.progress.setValue(0);
      const duration = Math.max(
        2400,
        Math.floor(celebrationDurationMs * piece.durationRatio)
      );
      const delay = Math.floor(celebrationDurationMs * piece.delayRatio);

      animations.push(
        Animated.timing(piece.progress, {
          toValue: 1,
          duration,
          delay,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
    }

    Animated.parallel(animations).start();
  }, [celebrationDurationMs, pieces, triggerKey]);

  return (
    <View pointerEvents="none" style={styles.confettiLayer}>
      {pieces.map((piece, index) => {
        const translateY = piece.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, piece.yDrift],
        });
        const opacity = piece.progress.interpolate({
          inputRange: [0, 0.12, 0.88, 1],
          outputRange: [0, 1, 1, 0],
        });
        const rotate = piece.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [`${piece.rotateFrom}deg`, `${piece.rotateTo}deg`],
        });
        const translateX = piece.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, piece.xDrift],
        });
        const scale = piece.progress.interpolate({
          inputRange: [0, 0.24, 0.82, 1],
          outputRange: [0.74, 1.05, 1, 0.9],
        });

        return (
          <Animated.View
            key={piece.id}
            style={[
              styles.confettiPiece,
              {
                width: piece.size,
                height: Math.max(8, piece.size * 1.5),
                backgroundColor:
                  CONFETTI_COLORS[index % CONFETTI_COLORS.length],
                left: `${piece.xPercent}%`,
                top: `${piece.yPercent}%`,
                opacity,
                transform: [
                  { translateX },
                  { translateY },
                  { rotate },
                  { scale },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function TwinklingStars({ triggerKey }: { triggerKey: number }) {
  const stars = useRef(
    Array.from({ length: STAR_PARTICLES }, (_, index) => {
      const shellSize = 34 + Math.random() * 24;
      return {
        id: `star-${index}`,
        opacity: new Animated.Value(0.14 + Math.random() * 0.25),
        scale: new Animated.Value(0.72 + Math.random() * 0.24),
        xPercent: Math.random() * 100,
        yPercent: Math.random() * 100,
        shellSize,
        glowSize: 14 + Math.random() * 18,
        coreSize: 2.8 + Math.random() * 2.8,
        rayLong: 20 + Math.random() * 24,
        rayShort: 12 + Math.random() * 14,
        rayThickness: 1.1 + Math.random() * 0.9,
        rotationDeg: -24 + Math.random() * 48,
        delay: Math.floor(Math.random() * 1400),
        upDuration: 1000 + Math.floor(Math.random() * 1400),
        downDuration: 1100 + Math.floor(Math.random() * 1800),
        maxOpacity: 0.74 + Math.random() * 0.22,
        minOpacity: 0.1 + Math.random() * 0.16,
        maxScale: 1.12 + Math.random() * 0.66,
        minScale: 0.68 + Math.random() * 0.2,
      };
    })
  ).current;

  useEffect(() => {
    if (triggerKey <= 0) {
      return;
    }

    const loops: Animated.CompositeAnimation[] = [];
    for (const star of stars) {
      star.opacity.stopAnimation();
      star.scale.stopAnimation();
      star.opacity.setValue(star.minOpacity);
      star.scale.setValue(star.minScale);

      const twinkle = Animated.loop(
        Animated.sequence([
          Animated.delay(star.delay),
          Animated.parallel([
            Animated.timing(star.opacity, {
              toValue: star.maxOpacity,
              duration: star.upDuration,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(star.scale, {
              toValue: star.maxScale,
              duration: star.upDuration,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(star.opacity, {
              toValue: star.minOpacity,
              duration: star.downDuration,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(star.scale, {
              toValue: star.minScale,
              duration: star.downDuration,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      twinkle.start();
      loops.push(twinkle);
    }

    return () => {
      for (const loop of loops) {
        loop.stop();
      }
    };
  }, [stars, triggerKey]);

  return (
    <View pointerEvents="none" style={styles.starsLayer}>
      {stars.map((star, index) => {
        const starColor = STAR_COLORS[index % STAR_COLORS.length];
        const glowColor = STAR_GLOW_COLORS[index % STAR_GLOW_COLORS.length];
        return (
          <Animated.View
            key={star.id}
            style={[
              styles.starShell,
              {
                width: star.shellSize,
                height: star.shellSize,
                left: `${star.xPercent}%`,
                top: `${star.yPercent}%`,
                opacity: star.opacity,
                transform: [
                  { scale: star.scale },
                  { rotate: `${star.rotationDeg}deg` },
                ],
              },
            ]}
          >
            <View
              style={[
                styles.starGlow,
                {
                  width: star.glowSize,
                  height: star.glowSize,
                  borderRadius: star.glowSize / 2,
                  backgroundColor: glowColor,
                },
              ]}
            />
            <View
              style={[
                styles.starRay,
                styles.starRayHorizontal,
                {
                  width: star.rayLong,
                  height: star.rayThickness,
                  backgroundColor: starColor,
                },
              ]}
            />
            <View
              style={[
                styles.starRay,
                styles.starRayVertical,
                {
                  width: star.rayLong,
                  height: star.rayThickness,
                  backgroundColor: starColor,
                },
              ]}
            />
            <View
              style={[
                styles.starRay,
                styles.starRayDiagLeft,
                {
                  width: star.rayShort,
                  height: star.rayThickness,
                  backgroundColor: starColor,
                },
              ]}
            />
            <View
              style={[
                styles.starRay,
                styles.starRayDiagRight,
                {
                  width: star.rayShort,
                  height: star.rayThickness,
                  backgroundColor: starColor,
                },
              ]}
            />
            <View
              style={[
                styles.starCore,
                {
                  width: star.coreSize,
                  height: star.coreSize,
                  borderRadius: star.coreSize / 2,
                  backgroundColor: '#FFFFFF',
                },
              ]}
            />
          </Animated.View>
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
  showConfetti = false,
  placement = 'top',
  emphasis = 'default',
  fullScreenCelebration = false,
  bannerStyle,
  messageStyle,
  iconStyle,
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
  const centered = placement === 'center';
  const showStars = fullScreenCelebration;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        centered ? styles.centerOverlay : styles.topOverlay,
        centered ? null : { top: topOffset },
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {centered ? <View style={styles.centerBackdrop} /> : null}
      {showFireworks || showConfetti || showStars ? (
        <View
          pointerEvents="none"
          style={
            fullScreenCelebration
              ? styles.effectsFullScreen
              : styles.effectsLocal
          }
        >
          {showStars ? <TwinklingStars triggerKey={eventKey} /> : null}
          {showFireworks ? <FireworksBurst triggerKey={eventKey} /> : null}
          {showConfetti ? (
            <ConfettiBurst
              triggerKey={eventKey}
              fullScreen={fullScreenCelebration}
              celebrationDurationMs={durationMs}
            />
          ) : null}
        </View>
      ) : null}
      <View
        style={[
          styles.banner,
          success ? styles.successBanner : styles.infoBanner,
          emphasis === 'large' ? styles.largeBanner : null,
          bannerStyle,
        ]}
      >
        <Text
          style={[
            styles.icon,
            emphasis === 'large' ? styles.largeIcon : null,
            iconStyle,
          ]}
        >
          {success ? '\u2714' : '\u2139'}
        </Text>
        <Text
          style={[
            styles.message,
            emphasis === 'large' ? styles.largeMessage : null,
            messageStyle,
          ]}
        >
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topOverlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 9999,
    elevation: 40,
    alignItems: 'center',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  centerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 20, 48, 0.18)',
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
  largeBanner: {
    minHeight: 86,
    borderRadius: 28,
    borderWidth: 2,
    paddingHorizontal: 22,
    paddingVertical: 18,
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
  largeIcon: {
    fontSize: 24,
  },
  message: {
    color: '#113A64',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  largeMessage: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  effectsLocal: {
    ...StyleSheet.absoluteFillObject,
  },
  effectsFullScreen: {
    ...StyleSheet.absoluteFillObject,
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
  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confettiPiece: {
    position: 'absolute',
    borderRadius: 2,
  },
  starsLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  starShell: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  starGlow: {
    position: 'absolute',
  },
  starRay: {
    position: 'absolute',
    borderRadius: 3,
    opacity: 0.95,
  },
  starRayHorizontal: {
    transform: [{ rotate: '0deg' }],
  },
  starRayVertical: {
    transform: [{ rotate: '90deg' }],
  },
  starRayDiagLeft: {
    transform: [{ rotate: '45deg' }],
  },
  starRayDiagRight: {
    transform: [{ rotate: '-45deg' }],
  },
  starCore: {
    position: 'absolute',
  },
});
