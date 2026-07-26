import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  GuidedTargetRef,
} from '@/components/guidance/GuidedActionAnchor';
import type { Id } from '@/convex/_generated/dataModel';
import {
  type GuidedActionController,
  useGuidedAction,
} from '@/hooks/useGuidedAction';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { flexDirection, rtlBaseView } from '@/lib/rtl';
import {
  getGuideOverlayLayout,
  getGuidePulseIterations,
  getGuidedSpotlightGeometry,
  isGuideRetryableState,
  REJECTED_GUIDE_CLEANUP_MESSAGE,
  shouldRenderGuidedStatusPanel,
  type RecommendationGuideEntityKind,
  type RecommendationGuideId,
} from '@/lib/recommendations/guidance';

export function GuidedActionScreenOverlay({
  activeBusinessId,
  routeKey,
  routeEntityId,
  routeEntityKind,
  destinationTargetValid,
  steps,
  targetRef,
  targetRefs,
  focusTarget,
  focusTargetRef: focusTargetHandleRef,
  prepareTarget,
  scrollTargetIntoView,
}: {
  activeBusinessId: Id<'businesses'> | null;
  routeKey: string;
  routeEntityId?: string;
  routeEntityKind?: RecommendationGuideEntityKind;
  destinationTargetValid?: boolean;
  steps?: string[];
  targetRef?: RefObject<View | null>;
  targetRefs?: Partial<
    Record<RecommendationGuideId, GuidedTargetRef<View>>
  >;
  focusTarget?: () => void;
  focusTargetRef?: RefObject<(() => void) | null>;
  prepareTarget?: () => void | Promise<void>;
  scrollTargetIntoView?: () => void;
}) {
  const { isSwitchingBusiness } = useActiveBusiness();
  const focusTargetCallbackRef = useRef(focusTarget);
  const prepareTargetRef = useRef(prepareTarget);
  const scrollTargetIntoViewRef = useRef(scrollTargetIntoView);
  focusTargetCallbackRef.current = focusTarget;
  prepareTargetRef.current = prepareTarget;
  scrollTargetIntoViewRef.current = scrollTargetIntoView;
  const guide = useGuidedAction({
    activeBusinessId,
    isSwitchingBusiness,
    routeKey,
    routeEntityId,
    routeEntityKind,
    destinationTargetValid,
    prepareTarget: prepareTarget
      ? () => prepareTargetRef.current?.()
      : undefined,
    steps,
  });
  const selectedTargetRef =
    (guide.guideId ? targetRefs?.[guide.guideId] : undefined) ??
    targetRef;

  useEffect(() => {
    if (!selectedTargetRef || !guide.targetId || !guide.canActivateTarget) {
      return;
    }
    const observableTarget = selectedTargetRef as Partial<
      GuidedTargetRef<View>
    >;
    let registrationFrame: number | null = null;
    let unregister: (() => void) | null = null;
    guide.bindObservableTarget({
      identity: `${guide.targetActivationKey}|${guide.targetId}`,
      getCurrent: () => selectedTargetRef.current,
      subscribe: (listener) =>
        typeof observableTarget.subscribe === 'function'
          ? observableTarget.subscribe(listener)
          : () => undefined,
      register: (node) => {
        if (registrationFrame !== null) {
          cancelAnimationFrame(registrationFrame);
          registrationFrame = null;
        }
        unregister?.();
        unregister = null;
        if (!guide.canActivateTarget || !guide.targetId) {
          return;
        }
        registrationFrame = requestAnimationFrame(() => {
          registrationFrame = null;
          if (
            selectedTargetRef.current !== node ||
            !guide.canActivateTarget ||
            !guide.targetId
          ) {
            return;
          }
          unregister = guide.registerAnchor({
            id: guide.targetId,
            ref: node as View,
            getRef: () => selectedTargetRef.current,
            getFocus: () =>
              focusTargetHandleRef?.current ??
              focusTargetCallbackRef.current ??
              null,
            ...(scrollTargetIntoViewRef.current
              ? {
                  scrollIntoView: () =>
                    scrollTargetIntoViewRef.current?.(),
                }
              : {}),
          });
        });
        return () => {
          if (registrationFrame !== null) {
            cancelAnimationFrame(registrationFrame);
            registrationFrame = null;
          }
          unregister?.();
          unregister = null;
        };
      },
    });
    return () => {
      if (registrationFrame !== null) {
        cancelAnimationFrame(registrationFrame);
      }
      unregister?.();
    };
  }, [
    guide.bindObservableTarget,
    guide.canActivateTarget,
    guide.registerAnchor,
    guide.targetActivationKey,
    guide.targetId,
    focusTargetHandleRef,
    selectedTargetRef,
  ]);

  return <GuidedActionOverlay guide={guide} />;
}

export function GuidedActionOverlay({
  guide,
}: {
  guide: GuidedActionController;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [overlayOrigin, setOverlayOrigin] = useState({ x: 0, y: 0 });
  const layerRef = useRef<View | null>(null);
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
    guide.setMeasurementViewport({
      width: window.width,
      height: window.height,
      safeTop: insets.top,
      safeBottom: insets.bottom,
      keyboardHeight,
    });
  }, [
    guide.setMeasurementViewport,
    insets.bottom,
    insets.top,
    keyboardHeight,
    window.height,
    window.width,
  ]);

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

  const panelMode = shouldRenderGuidedStatusPanel({
    hasGuideMetadata: guide.hasGuideMetadata,
    isClosed: !guide.isRequested,
    isBindingValid: guide.isBindingValid,
    canActivateTarget: guide.canActivateTarget,
    status: guide.status,
    feedback: guide.feedback,
  });

  if (panelMode === 'none') {
    return null;
  }

  const overlayLayout = getGuideOverlayLayout({
    width: window.width,
    height: window.height,
    safeTop: insets.top,
    safeBottom: insets.bottom,
    keyboardHeight,
  });
  const retryable = isGuideRetryableState({
    status: guide.status,
    targetUnavailable: guide.targetUnavailable,
    retryExhausted: guide.statusRetryExhausted,
  });

  if (panelMode === 'lifecycle' || panelMode === 'rejected_cleanup') {
    const lifecycleFeedback =
      panelMode === 'rejected_cleanup'
        ? (guide.feedback ?? REJECTED_GUIDE_CLEANUP_MESSAGE)
        : (guide.feedback ??
          (guide.status === 'restricted'
            ? 'ההרשאה לפעולה השתנתה. ההדרכה הופסקה.'
            : guide.status === 'unavailable' || guide.status === 'error'
              ? 'ההדרכה אינה זמינה כרגע.'
              : null));
    if (!lifecycleFeedback) {
      return null;
    }
    const showRetry =
      panelMode !== 'rejected_cleanup' &&
      (retryable || guide.isStatusRetrying);
    return (
      <View pointerEvents="box-none" style={styles.layer}>
        <View
          style={[
            styles.feedbackCard,
            {
              width: overlayLayout.maxWidth,
              maxHeight: overlayLayout.maxHeight,
              marginBottom: overlayLayout.bottom,
            },
          ]}
        >
          <Text allowFontScaling style={styles.feedbackText}>
            {lifecycleFeedback}
          </Text>
          {showRetry ? (
            <RetryButton
              label="נסו שוב לטעון את ההדרכה"
              disabled={guide.isStatusRetrying}
              loading={guide.isStatusRetrying}
              onPress={guide.retry}
            />
          ) : null}
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

  const spotlight = guide.anchorRect
    ? getGuidedSpotlightGeometry(
        guide.anchorRect,
        {
          width: window.width,
          height: window.height,
          safeTop: insets.top,
          safeBottom: insets.bottom,
          keyboardHeight,
          overlayX: overlayOrigin.x,
          overlayY: overlayOrigin.y,
        },
        6
      )
    : null;

  return (
    <View
      ref={layerRef}
      pointerEvents="box-none"
      onLayout={() => {
        layerRef.current?.measureInWindow((x, y) => {
          setOverlayOrigin((current) =>
            current.x === x && current.y === y ? current : { x, y }
          );
        });
      }}
      style={styles.layer}
    >
      {guide.canActivateTarget &&
      spotlight &&
      spotlight.width > 0 &&
      spotlight.height > 0 ? (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.spotlight,
            {
              left: spotlight.left,
              top: spotlight.top,
              width: spotlight.width,
              height: spotlight.height,
              opacity,
            },
          ]}
        />
      ) : null}
      <View
        accessibilityRole="summary"
        accessibilityLiveRegion="polite"
        style={[
          styles.card,
          {
            width: overlayLayout.maxWidth,
            maxHeight: overlayLayout.maxHeight,
            marginBottom: overlayLayout.bottom,
          },
        ]}
      >
        <View style={styles.header}>
          <Text allowFontScaling style={styles.stepLabel}>
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
        <ScrollView
          style={styles.instructionScroll}
          contentContainerStyle={styles.instructionContent}
          showsVerticalScrollIndicator
        >
          <Text allowFontScaling style={styles.instruction}>
            {guide.instruction}
          </Text>
          {guide.feedback ? (
            <Text allowFontScaling style={styles.inlineFeedback}>
              {guide.feedback}
            </Text>
          ) : null}
          {retryable ? (
            <RetryButton
              label="נסו שוב לאתר את יעד ההדרכה"
              onPress={guide.retry}
            />
          ) : null}
          {guide.stepCount > 1 ? (
            <View style={styles.controls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="מעבר לשלב הקודם בהדרכה"
                disabled={guide.stepIndex === 0}
                onPress={guide.previous}
                style={styles.controlButton}
              >
                <Text style={styles.controlText}>הקודם</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="מעבר לשלב הבא בהדרכה"
                disabled={guide.stepIndex >= guide.stepCount - 1}
                onPress={guide.next}
                style={[styles.controlButton, styles.nextButton]}
              >
                <Text style={[styles.controlText, styles.nextText]}>הבא</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

function RetryButton({
  label,
  disabled = false,
  loading = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.retryButton, disabled ? styles.retryButtonDisabled : null]}
    >
      {loading ? <ActivityIndicator size="small" color="#1D4ED8" /> : null}
      <Text style={styles.retryText}>נסו שוב</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
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
    overflow: 'hidden',
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
  instructionScroll: {
    flexShrink: 1,
  },
  instructionContent: {
    flexGrow: 0,
    gap: 10,
    paddingBottom: 2,
  },
  instruction: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  inlineFeedback: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    color: '#991B1B',
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
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
  retryButton: {
    minWidth: 96,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: '#1D4ED8',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  retryButtonDisabled: {
    opacity: 0.65,
  },
  feedbackCard: {
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    overflow: 'hidden',
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
