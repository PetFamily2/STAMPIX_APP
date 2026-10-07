import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AnimatedActionBanner from '@/components/AnimatedActionBanner';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import {
  buildCustomerCardCompletedContext,
  buildCustomerStampAddedMessage,
  CUSTOMER_CARD_COMPLETED_SUBTITLE,
  CUSTOMER_CARD_COMPLETED_TITLE,
  CUSTOMER_STAMP_CELEBRATION_DURATION_MS,
  type CustomerStampPresentation,
  observeCustomerStampCelebrationChannel,
  publishCustomerStampCelebrations,
  readCustomerStampCelebrationSessionUserId,
  readCustomerStampPresentation,
  syncCustomerStampCelebrationSession,
  takeCustomerStampPresentationFeedback,
  toCustomerStampMembershipSnapshots,
} from '@/lib/customer/customerStampCelebration';
import {
  readCustomerStampCelebrationArmSnapshot,
  useCustomerStampCelebrationArm,
} from '@/lib/customer/customerStampCelebrationArm';
import { textAlign } from '@/lib/rtl';

function usePrefersReducedMotion(): boolean | null {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) {
        setPrefersReducedMotion(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        setPrefersReducedMotion(enabled);
      }
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return prefersReducedMotion;
}

function CustomerCardCompletedCelebration({
  presentation,
  topOffset,
}: {
  presentation: CustomerStampPresentation;
  topOffset: number;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const contextLine = buildCustomerCardCompletedContext(
    presentation.celebration
  );

  useEffect(() => {
    if (presentation.eventKey < 1) {
      return;
    }
    opacity.setValue(1);
    scale.setValue(1);
    if (prefersReducedMotion !== false) {
      return;
    }
    opacity.setValue(0.92);
    scale.setValue(0.96);
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [opacity, prefersReducedMotion, presentation.eventKey, scale]);

  return (
    <View
      pointerEvents="none"
      style={[styles.completionOverlay, { top: topOffset }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.completionCard, { opacity, transform: [{ scale }] }]}
      >
        <View accessible={false} style={styles.completionBadge}>
          <Ionicons name="gift" size={28} color="#FFFFFF" />
        </View>
        <Text style={styles.completionTitle}>
          {CUSTOMER_CARD_COMPLETED_TITLE}
        </Text>
        <Text style={styles.completionSubtitle}>
          {CUSTOMER_CARD_COMPLETED_SUBTITLE}
        </Text>
        {contextLine ? (
          <Text style={styles.completionContext}>{contextLine}</Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

export default function CustomerStampCelebrationHost() {
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const customerUserId = user?._id ? String(user._id) : null;
  const { serverArmedAt, serverArmFailed } = useCustomerStampCelebrationArm();
  const memberships = useQuery(api.memberships.byCustomer, {});
  const [presentation, setPresentation] =
    useState<CustomerStampPresentation | null>(() =>
      readCustomerStampPresentation(Date.now())
    );
  const sessionUserId = readCustomerStampCelebrationSessionUserId();
  const visiblePresentation =
    customerUserId !== null && sessionUserId === customerUserId
      ? presentation
      : null;

  useEffect(() => {
    const status = syncCustomerStampCelebrationSession(customerUserId);
    if (status === 'reset') {
      setPresentation(null);
    }
    return () => {
      syncCustomerStampCelebrationSession(null);
    };
  }, [customerUserId]);

  useEffect(() => {
    if (
      !customerUserId ||
      readCustomerStampCelebrationSessionUserId() !== customerUserId
    ) {
      return;
    }
    const arm = readCustomerStampCelebrationArmSnapshot();
    const armWasReset =
      serverArmedAt !== arm.serverArmedAt ||
      serverArmFailed !== arm.serverArmFailed;
    const celebrations = observeCustomerStampCelebrationChannel(
      'presentation',
      {
        memberships: toCustomerStampMembershipSnapshots(memberships),
        serverArmedAt: armWasReset ? arm.serverArmedAt : serverArmedAt,
        serverArmFailed: armWasReset ? arm.serverArmFailed : serverArmFailed,
      }
    );
    setPresentation(publishCustomerStampCelebrations(celebrations, Date.now()));
  }, [customerUserId, memberships, serverArmFailed, serverArmedAt]);

  useEffect(() => {
    if (!visiblePresentation) {
      return;
    }
    const delay = Math.max(0, visiblePresentation.hideAt - Date.now());
    const timeout = setTimeout(() => {
      setPresentation(
        readCustomerStampPresentation(visiblePresentation.hideAt)
      );
    }, delay);
    return () => {
      clearTimeout(timeout);
    };
  }, [visiblePresentation]);

  useEffect(() => {
    // Browsers reject unsolicited vibration before any user activation.
    // Native keeps its existing haptic behavior.
    const vibrate = (duration: number) => {
      if (Platform.OS !== 'web' || (typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive === true)) {
        Vibration.vibrate(duration);
      }
    };
    const feedback = takeCustomerStampPresentationFeedback(visiblePresentation);
    if (!feedback || !visiblePresentation) {
      return;
    }
    if (feedback === 'CARD_COMPLETED') {
      vibrate(200);
      AccessibilityInfo.announceForAccessibility(
        `${CUSTOMER_CARD_COMPLETED_TITLE} ${CUSTOMER_CARD_COMPLETED_SUBTITLE}`
      );
      return;
    }
    vibrate(120);
    AccessibilityInfo.announceForAccessibility(
      buildCustomerStampAddedMessage(
        visiblePresentation.celebration.progressLine
      )
    );
  }, [visiblePresentation]);

  if (!visiblePresentation) {
    return null;
  }

  const topOffset = (insets.top || 0) + 8;

  if (visiblePresentation.celebration.kind === 'CARD_COMPLETED') {
    return (
      <CustomerCardCompletedCelebration
        presentation={visiblePresentation}
        topOffset={topOffset}
      />
    );
  }

  return (
    <AnimatedActionBanner
      eventKey={visiblePresentation.eventKey}
      message={buildCustomerStampAddedMessage(
        visiblePresentation.celebration.progressLine
      )}
      bannerStyle={styles.stampBanner}
      messageStyle={styles.stampMessage}
      iconStyle={styles.stampIcon}
      topOffset={topOffset}
      durationMs={CUSTOMER_STAMP_CELEBRATION_DURATION_MS}
      variant="success"
      showFireworks={false}
      showConfetti={false}
      placement="top"
      emphasis="default"
      fullScreenCelebration={false}
    />
  );
}

const styles = StyleSheet.create({
  stampBanner: {
    backgroundColor: '#E8FFF4',
    borderColor: '#88D7AB',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stampMessage: {
    color: '#0A5C35',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '800',
    textAlign: textAlign.center,
  },
  stampIcon: {
    color: '#0A8F4E',
    fontSize: 18,
  },
  completionOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 40,
    elevation: 40,
    alignItems: 'center',
  },
  completionCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#0D9A4B',
    backgroundColor: '#F3FFF8',
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#0D7A3E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  completionBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0D9A4B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  completionTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '900',
    color: '#085C32',
    textAlign: textAlign.center,
    writingDirection: 'rtl',
  },
  completionSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '800',
    color: '#0D7A3E',
    textAlign: textAlign.center,
    writingDirection: 'rtl',
  },
  completionContext: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: '#215E3E',
    textAlign: textAlign.center,
    writingDirection: 'rtl',
  },
});
