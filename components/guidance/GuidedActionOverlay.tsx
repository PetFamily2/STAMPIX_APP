import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Id } from '@/convex/_generated/dataModel';
import {
  type GuidedActionController,
  useGuidedAction,
} from '@/hooks/useGuidedAction';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { flexDirection, rtlBaseView } from '@/lib/rtl';
import {
  createGuidedTargetActivationOrchestrator,
  getGuideBottomInset,
  getGuidePulseIterations,
  type RecommendationGuideEntityKind,
} from '@/lib/recommendations/guidance';

export function GuidedActionScreenOverlay({
  activeBusinessId,
  routeKey,
  routeEntityId,
  routeEntityKind,
  steps,
  targetRef,
  focusTarget,
  scrollTargetIntoView,
}: {
  activeBusinessId: Id<'businesses'> | null;
  routeKey: string;
  routeEntityId?: string;
  routeEntityKind?: RecommendationGuideEntityKind;
  steps?: string[];
  targetRef?: RefObject<View | null>;
  focusTarget?: () => void;
  scrollTargetIntoView?: () => void;
}) {
  const { isSwitchingBusiness } = useActiveBusiness();
  const activationOrchestratorRef = useRef(
    createGuidedTargetActivationOrchestrator()
  );
  const focusTargetRef = useRef(focusTarget);
  const scrollTargetIntoViewRef = useRef(scrollTargetIntoView);
  focusTargetRef.current = focusTarget;
  scrollTargetIntoViewRef.current = scrollTargetIntoView;
  const guide = useGuidedAction({
    activeBusinessId,
    isSwitchingBusiness,
    routeKey,
    routeEntityId,
    routeEntityKind,
    steps,
  });
  useEffect(() => {
    if (!targetRef) {
      activationOrchestratorRef.current.deactivate();
      return;
    }
    activationOrchestratorRef.current.update(
      guide.targetActivation,
      guide.targetActivationKey,
      {
        activate: () =>
          guide.registerAnchor({
            id: `${routeKey}-target`,
            ref: targetRef.current,
            focus: () => focusTargetRef.current?.(),
            scrollIntoView: () => scrollTargetIntoViewRef.current?.(),
          }),
      }
    );
  }, [
    guide.registerAnchor,
    guide.targetActivation,
    guide.targetActivationKey,
    routeKey,
    targetRef,
  ]);
  useEffect(
    () => () => {
      activationOrchestratorRef.current.deactivate();
    },
    []
  );
  return <GuidedActionOverlay guide={guide} />;
}

export function GuidedActionOverlay({
  guide,
}: {
  guide: GuidedActionController;
}) {
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const opacity = useState(() => new Animated.Value(0.82))[0];

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(enabled);
      }
    });
    const listener = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => {
      mounted = false;
      listener.remove();
    };
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!guide.canActivateTarget || reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.82,
          duration: 240,
          useNativeDriver: true,
        }),
      ]),
      { iterations: getGuidePulseIterations(reduceMotion) }
    );
    animation.start();
    return () => animation.stop();
  }, [guide.canActivateTarget, opacity, reduceMotion]);

  if (!guide.isRequested) {
    return null;
  }
  if (!guide.isBindingValid) {
    return null;
  }
  if (!guide.isReady) {
    const lifecycleFeedback =
      guide.feedback ??
      (guide.status === 'restricted'
        ? 'ההרשאה לפעולה השתנתה. ההדרכה הופסקה.'
        : null);
    if (lifecycleFeedback) {
      return (
        <View
          pointerEvents="box-none"
          style={[
            styles.layer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackText}>{lifecycleFeedback}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="סגירת ההדרכה"
              onPress={guide.close}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={22} color="#334155" />
            </Pressable>
          </View>
        </View>
      );
    }
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.layer,
        {
          paddingBottom: getGuideBottomInset(
            insets.bottom,
            keyboardHeight
          ),
        },
      ]}
    >
      {guide.canActivateTarget && guide.anchorRect ? (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.spotlight,
            {
              left: Math.max(8, guide.anchorRect.x - 6),
              top: guide.anchorRect.y - 6,
              width: guide.anchorRect.width + 12,
              height: guide.anchorRect.height + 12,
              opacity,
            },
          ]}
        />
      ) : null}
      <View
        accessibilityRole="summary"
        accessibilityLiveRegion="polite"
        style={styles.card}
      >
        <View style={styles.header}>
          <Text style={styles.stepLabel}>
            {guide.stepCount > 1
              ? `שלב ${guide.stepIndex + 1} מתוך ${guide.stepCount}`
              : 'הדרכה קצרה'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="דלגו וסגרו את ההדרכה"
            onPress={guide.close}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={22} color="#334155" />
          </Pressable>
        </View>
        <Text allowFontScaling style={styles.instruction}>
          {guide.instruction}
        </Text>
        {guide.stepCount > 1 ? (
          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              disabled={guide.stepIndex === 0}
              onPress={guide.previous}
              style={styles.controlButton}
            >
              <Text style={styles.controlText}>הקודם</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={guide.stepIndex >= guide.stepCount - 1}
              onPress={guide.next}
              style={[styles.controlButton, styles.nextButton]}
            >
              <Text style={[styles.controlText, styles.nextText]}>הבא</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 12,
    right: 12,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  spotlight: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#2563EB',
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  card: {
    width: '100%',
    maxWidth: 620,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    ...rtlBaseView,
  },
  header: {
    minHeight: 44,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepLabel: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '800',
    color: '#2563EB',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  instruction: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    flexDirection: flexDirection.row,
    gap: 10,
  },
  controlButton: {
    minWidth: 96,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  nextButton: {
    backgroundColor: '#2563EB',
  },
  controlText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: '#2563EB',
  },
  nextText: {
    color: '#FFFFFF',
  },
  feedbackCard: {
    width: '100%',
    maxWidth: 620,
    minHeight: 64,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    ...rtlBaseView,
  },
  feedbackText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: '#991B1B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
