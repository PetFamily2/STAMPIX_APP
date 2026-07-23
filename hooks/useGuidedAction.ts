import {
  useConvexConnectionState,
  useMutation,
  useQuery,
} from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutRectangle, View } from 'react-native';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  createGuideOutcomeGuard,
  safelyTrackRecommendationEvent,
} from '@/lib/recommendations/analytics';
import {
  canActivateGuidedTarget,
  clampGuideSteps,
  GUIDE_INSTRUCTIONS,
  type GuidedTargetActivationInput,
  type GuidedTargetServerStatus,
  type RecommendationGuideEntityKind,
  validateGuideBinding,
} from '@/lib/recommendations/guidance';

type GuideRouteParams = {
  businessId?: string | string[];
  recommendationBusinessId?: string | string[];
  guideSessionId?: string | string[];
  guideId?: string | string[];
  stableId?: string | string[];
  evidenceFingerprint?: string | string[];
  entityId?: string | string[];
  targetField?: string | string[];
  limitKey?: string | string[];
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export type GuidedActionAnchorRegistration = {
  id: string;
  ref: View | null;
  focus?: () => void;
  expand?: () => void;
  scrollIntoView?: () => void;
};

export type GuidedActionController = ReturnType<typeof useGuidedAction>;

export function useGuidedAction(input: {
  activeBusinessId: Id<'businesses'> | null;
  isSwitchingBusiness?: boolean;
  routeKey: string;
  routeEntityId?: string;
  routeEntityKind?: RecommendationGuideEntityKind;
  steps?: string[];
}) {
  const router = useRouter();
  const params = useLocalSearchParams<GuideRouteParams>();
  const routeBusinessId = firstParam(params.businessId);
  const recommendationBusinessId = firstParam(
    params.recommendationBusinessId
  );
  const guideSessionId = firstParam(params.guideSessionId);
  const guideId = firstParam(params.guideId);
  const stableId = firstParam(params.stableId);
  const evidenceFingerprint = firstParam(params.evidenceFingerprint);
  const entityId = firstParam(params.entityId);
  const targetField = firstParam(params.targetField);
  const limitKey = firstParam(params.limitKey);
  const binding = validateGuideBinding({
    guideSessionId,
    guideId,
    stableId,
    routeBusinessId,
    recommendationBusinessId,
    activeBusinessId: input.activeBusinessId,
    currentRouteKey: input.routeKey,
    guideEntityId: entityId,
    routeEntityId: input.routeEntityId,
    routeEntityKind: input.routeEntityKind,
  });
  const status = useQuery(
    api.recommendations.getBusinessRecommendationGuideStatus,
    binding.ok && evidenceFingerprint
      ? {
          guideSessionId:
            binding.guideSessionId as Id<'recommendationGuideSessions'>,
          businessId: binding.businessId as Id<'businesses'>,
          stableId: binding.stableId,
          guideId: binding.guideId,
          evidenceFingerprint,
          ...(entityId ? { entityId } : {}),
        }
      : 'skip'
  );
  const connectionState = useConvexConnectionState();
  const acknowledge = useMutation(
    api.recommendations.acknowledgeBusinessRecommendationGuideStatus
  );
  const anchorsRef = useRef(
    new Map<string, GuidedActionAnchorRegistration>()
  );
  const targetActivationAllowedRef = useRef(false);
  const targetActivationKeyRef = useRef('');
  const activeBusinessIdRef = useRef(input.activeBusinessId);
  const lastMeasurementKeyRef = useRef<string | null>(null);
  const pendingMeasurementFrameRef = useRef<number | null>(null);
  const outcomeGuardRef = useRef(createGuideOutcomeGuard());
  const acknowledgedRef = useRef(new Set<string>());
  const startedRef = useRef(new Set<string>());
  const [anchorRect, setAnchorRect] = useState<LayoutRectangle | null>(
    null
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [closedGuideRequestKey, setClosedGuideRequestKey] = useState<
    string | null
  >(null);
  const guideRequestKey = guideSessionId
    ? [
        guideSessionId,
        guideId ?? '',
        stableId ?? '',
        routeBusinessId ?? '',
        recommendationBusinessId ?? '',
        entityId ?? '',
      ].join('|')
    : null;
  const isClosed =
    guideRequestKey !== null && guideRequestKey === closedGuideRequestKey;
  const serverStatus: GuidedTargetServerStatus =
    !binding.ok ||
    !evidenceFingerprint ||
    !connectionState.isWebSocketConnected
      ? 'unavailable'
      : (status?.state ?? 'loading');
  const businessMatches =
    binding.ok &&
    input.activeBusinessId !== null &&
    String(input.activeBusinessId) === binding.businessId;
  const targetActivation = useMemo<GuidedTargetActivationInput>(
    () => ({
      bindingValid: binding.ok,
      guideSessionId,
      serverStatus,
      businessMatches,
      isSwitchingBusiness: input.isSwitchingBusiness === true,
      isClosed,
      routeAndEntityMatch: binding.ok,
    }),
    [
      binding.ok,
      businessMatches,
      guideSessionId,
      input.isSwitchingBusiness,
      isClosed,
      serverStatus,
    ]
  );
  const canActivateTarget = canActivateGuidedTarget(targetActivation);
  const targetActivationKey = [
    guideRequestKey ?? 'none',
    input.routeKey,
    input.routeEntityKind ?? '',
    input.routeEntityId ?? '',
    stepIndex,
  ].join('|');
  targetActivationAllowedRef.current = canActivateTarget;
  targetActivationKeyRef.current = targetActivationKey;
  const suppliedSteps =
    input.steps && input.steps.length > 0
      ? input.steps.slice(0, clampGuideSteps(input.steps.length))
      : binding.ok
        ? [GUIDE_INSTRUCTIONS[binding.guideId]]
        : [];

  const deactivateGuidedTarget = useCallback(() => {
    targetActivationAllowedRef.current = false;
    if (pendingMeasurementFrameRef.current !== null) {
      cancelAnimationFrame(pendingMeasurementFrameRef.current);
      pendingMeasurementFrameRef.current = null;
    }
    lastMeasurementKeyRef.current = null;
    anchorsRef.current.clear();
    setAnchorRect(null);
  }, []);

  const clearGuide = useCallback(() => {
    if (guideRequestKey) {
      setClosedGuideRequestKey(guideRequestKey);
    }
    deactivateGuidedTarget();
    setFeedback(null);
    setStepIndex(0);
    router.setParams({
      guideSessionId: undefined,
      guideId: undefined,
      stableId: undefined,
      evidenceFingerprint: undefined,
      recommendationBusinessId: undefined,
      entityId: undefined,
      targetField: undefined,
      limitKey: undefined,
    } as never);
  }, [deactivateGuidedTarget, guideRequestKey, router]);

  const measureAnchor = useCallback((anchorId: string) => {
    if (!targetActivationAllowedRef.current) {
      setAnchorRect(null);
      return;
    }
    const anchor = anchorsRef.current.get(anchorId);
    const node = anchor?.ref;
    if (!node || typeof node.measureInWindow !== 'function') {
      setAnchorRect(null);
      return;
    }
    const activationKey = targetActivationKeyRef.current;
    const measurementKey = `${activationKey}|${anchorId}`;
    if (lastMeasurementKeyRef.current === measurementKey) {
      return;
    }
    lastMeasurementKeyRef.current = measurementKey;
    anchor?.expand?.();
    anchor?.scrollIntoView?.();
    if (pendingMeasurementFrameRef.current !== null) {
      cancelAnimationFrame(pendingMeasurementFrameRef.current);
    }
    pendingMeasurementFrameRef.current = requestAnimationFrame(() => {
      pendingMeasurementFrameRef.current = null;
      if (
        !targetActivationAllowedRef.current ||
        targetActivationKeyRef.current !== activationKey
      ) {
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        if (
          targetActivationAllowedRef.current &&
          targetActivationKeyRef.current === activationKey &&
          width > 0 &&
          height > 0
        ) {
          setAnchorRect({ x, y, width, height });
          anchor.focus?.();
        }
      });
    });
  }, []);

  const registerAnchor = useCallback(
    (registration: GuidedActionAnchorRegistration) => {
      if (!targetActivationAllowedRef.current) {
        return () => undefined;
      }
      anchorsRef.current.set(registration.id, registration);
      measureAnchor(registration.id);
      return () => {
        if (anchorsRef.current.get(registration.id) === registration) {
          anchorsRef.current.delete(registration.id);
          setAnchorRect(null);
        }
      };
    },
    [measureAnchor]
  );

  useEffect(() => {
    if (activeBusinessIdRef.current === input.activeBusinessId) {
      return;
    }
    activeBusinessIdRef.current = input.activeBusinessId;
    deactivateGuidedTarget();
    setStepIndex(0);
    setFeedback(null);
  }, [deactivateGuidedTarget, input.activeBusinessId]);

  useEffect(() => {
    if (!canActivateTarget) {
      deactivateGuidedTarget();
    }
  }, [canActivateTarget, deactivateGuidedTarget]);

  useEffect(
    () => () => {
      targetActivationAllowedRef.current = false;
      if (pendingMeasurementFrameRef.current !== null) {
        cancelAnimationFrame(pendingMeasurementFrameRef.current);
        pendingMeasurementFrameRef.current = null;
      }
      anchorsRef.current.clear();
    },
    []
  );

  useEffect(() => {
    if (
      input.activeBusinessId &&
      guideId &&
      !binding.ok &&
      binding.reasonCode === 'BUSINESS_MISMATCH'
    ) {
      clearGuide();
    }
  }, [binding, clearGuide, guideId, input.activeBusinessId]);

  useEffect(() => {
    if (
      !canActivateTarget ||
      !binding.ok ||
      !evidenceFingerprint ||
      status?.state !== 'active'
    ) {
      return;
    }
    const key = `${binding.businessId}|${binding.stableId}|${evidenceFingerprint}`;
    if (startedRef.current.has(key)) {
      return;
    }
    startedRef.current.add(key);
    safelyTrackRecommendationEvent(
      track,
      ANALYTICS_EVENTS.guidedActionStarted,
      {
        stable_recommendation_id: binding.stableId,
        guide_id: binding.guideId,
        evidence_fingerprint: evidenceFingerprint,
        route_key: input.routeKey,
        step_index: 0,
        step_count: suppliedSteps.length,
      }
    );
  }, [
    binding,
    canActivateTarget,
    evidenceFingerprint,
    input.routeKey,
    status?.state,
    suppliedSteps.length,
  ]);

  useEffect(() => {
    if (
      !binding.ok ||
      !evidenceFingerprint ||
      !connectionState.isWebSocketConnected ||
      (status?.state !== 'completed' &&
        status?.state !== 'invalidated')
    ) {
      return;
    }
    const key = `${binding.businessId}|${binding.stableId}|${evidenceFingerprint}|${status.state}`;
    if (acknowledgedRef.current.has(key)) {
      return;
    }
    acknowledgedRef.current.add(key);
    void acknowledge({
      guideSessionId:
        binding.guideSessionId as Id<'recommendationGuideSessions'>,
      businessId: binding.businessId as Id<'businesses'>,
      stableId: binding.stableId,
      guideId: binding.guideId,
      evidenceFingerprint,
      ...(entityId ? { entityId } : {}),
    })
      .then((result) => {
        if (
          outcomeGuardRef.current.shouldTrack({
            businessId: binding.businessId,
            stableId: binding.stableId,
            evidenceFingerprint,
            state: result.state,
          })
        ) {
          safelyTrackRecommendationEvent(
            track,
            result.state === 'completed'
              ? ANALYTICS_EVENTS.recommendationCompleted
              : ANALYTICS_EVENTS.recommendationInvalidated,
            {
              stable_recommendation_id: binding.stableId,
              guide_id: binding.guideId,
              evidence_fingerprint: evidenceFingerprint,
              route_key: input.routeKey,
              reason_code: result.reasonCode,
            }
          );
        }
        clearGuide();
      })
      .catch(() => {
        acknowledgedRef.current.delete(key);
        setFeedback('לא הצלחנו לעדכן את מצב ההדרכה. נסו שוב.');
      });
  }, [
    acknowledge,
    binding,
    clearGuide,
    connectionState.isWebSocketConnected,
    entityId,
    evidenceFingerprint,
    input.routeKey,
    status,
  ]);

  const next = useCallback(() => {
    if (!canActivateTarget || !binding.ok || !evidenceFingerprint) {
      return;
    }
    const nextIndex = Math.min(
      suppliedSteps.length - 1,
      stepIndex + 1
    );
    safelyTrackRecommendationEvent(
      track,
      ANALYTICS_EVENTS.guidedStepCompleted,
      {
        stable_recommendation_id: binding.stableId,
        guide_id: binding.guideId,
        evidence_fingerprint: evidenceFingerprint,
        route_key: input.routeKey,
        step_index: stepIndex,
        step_count: suppliedSteps.length,
      }
    );
    setStepIndex(nextIndex);
  }, [
    binding,
    canActivateTarget,
    evidenceFingerprint,
    input.routeKey,
    stepIndex,
    suppliedSteps.length,
  ]);

  return useMemo(
    () => ({
      isRequested: Boolean(guideId) && !isClosed,
      isBindingValid: binding.ok,
      isReady: canActivateTarget,
      canActivateTarget,
      targetActivation,
      targetActivationKey,
      isLoading: serverStatus === 'loading',
      status: serverStatus,
      reasonCode:
        status?.state === serverStatus
          ? status.reasonCode
          : binding.ok
            ? serverStatus === 'unavailable'
              ? 'UNAVAILABLE'
              : 'LOADING'
            : binding.reasonCode,
      guideId: binding.ok ? binding.guideId : null,
      stableId: binding.ok ? binding.stableId : null,
      instruction:
        suppliedSteps[stepIndex] ??
        (binding.ok ? GUIDE_INSTRUCTIONS[binding.guideId] : null),
      stepIndex,
      stepCount: suppliedSteps.length,
      targetField,
      limitKey,
      entityId,
      anchorRect,
      feedback,
      registerAnchor,
      measureAnchor,
      deactivateGuidedTarget,
      previous: () => setStepIndex((current) => Math.max(0, current - 1)),
      next,
      close: clearGuide,
      retry: () => setFeedback(null),
    }),
    [
      anchorRect,
      binding,
      canActivateTarget,
      clearGuide,
      deactivateGuidedTarget,
      entityId,
      feedback,
      guideId,
      isClosed,
      limitKey,
      measureAnchor,
      next,
      registerAnchor,
      serverStatus,
      status,
      stepIndex,
      suppliedSteps,
      targetActivation,
      targetActivationKey,
      targetField,
    ]
  );
}
