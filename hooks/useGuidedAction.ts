import {
  useConvex,
  useConvexConnectionState,
  useMutation,
  useQueries,
} from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  type LayoutRectangle,
  type View,
} from 'react-native';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  createGuideOutcomeGuard,
  safelyTrackRecommendationEvent,
} from '@/lib/recommendations/analytics';
import {
  buildGuidedStatusRetryIdentity,
  canActivateGuidedTarget,
  clampGuideSteps,
  createBoundedKeySet,
  createBoundedRetryController,
  createGuidedActionRuntimeCoordinator,
  createGuidedFocusController,
  createGuidedMeasurementSequence,
  getClearedGuideRouteParams,
  hasGuideLikeRouteMetadata,
  GUIDE_INSTRUCTIONS,
  GUIDE_TARGET_IDS,
  isPermanentGuideQueryError,
  isGuideRectVisible,
  REJECTED_GUIDE_CLEANUP_MESSAGE,
  resolveGuidedActionStatus,
  resolveProfileGuideField,
  type GuideViewport,
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
  fieldId?: string | string[];
  limitKey?: string | string[];
  filter?: string | string[];
  section?: string | string[];
};

const STATUS_RETRY_CACHE_RELEASE_ATTEMPTS = 20;
const STATUS_RETRY_CACHE_RELEASE_DELAY_MS = 40;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export type GuidedActionAnchorRegistration = {
  id: string;
  ref: View | null;
  getRef?: () => View | null;
  focus?: () => void;
  getFocus?: () => (() => void) | null;
  scrollIntoView?: () => void;
};

export type GuidedActionController = ReturnType<typeof useGuidedAction>;

export function useGuidedAction(input: {
  activeBusinessId: Id<'businesses'> | null;
  isSwitchingBusiness?: boolean;
  routeKey: string;
  routeEntityId?: string;
  routeEntityKind?: RecommendationGuideEntityKind;
  destinationTargetValid?: boolean;
  prepareTarget?: () => void | Promise<void>;
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
  const fieldId = firstParam(params.fieldId);
  const limitKey = firstParam(params.limitKey);
  const filter = firstParam(params.filter);
  const section = firstParam(params.section);
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
  const convex = useConvex();
  const connectionState = useConvexConnectionState();
  const requiredMetadataValid =
    typeof evidenceFingerprint === 'string' &&
    evidenceFingerprint.length > 0 &&
    evidenceFingerprint === evidenceFingerprint.trim();
  const guideStatusArgs =
    binding.ok && requiredMetadataValid
      ? {
          guideSessionId:
            binding.guideSessionId as Id<'recommendationGuideSessions'>,
          businessId: binding.businessId as Id<'businesses'>,
          stableId: binding.stableId,
          guideId: binding.guideId,
          evidenceFingerprint,
          ...(entityId ? { entityId } : {}),
        }
      : null;
  const [pauseReactiveStatus, setPauseReactiveStatus] = useState(false);
  const statusQueries = useQueries(
    guideStatusArgs && !pauseReactiveStatus
      ? {
          guideStatus: {
            query:
              api.recommendations.getBusinessRecommendationGuideStatus,
            args: guideStatusArgs,
          },
        }
      : {}
  );
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
  const measurementRetryRef = useRef(createBoundedRetryController());
  const measurementViewportRef = useRef<GuideViewport | null>(null);
  const activeAnchorIdRef = useRef<string | null>(null);
  const focusControllerRef = useRef(createGuidedFocusController());
  const runtimeCoordinatorRef = useRef(createGuidedActionRuntimeCoordinator());
  const prepareTargetRef = useRef(input.prepareTarget);
  const outcomeGuardRef = useRef(createGuideOutcomeGuard());
  const acknowledgedRef = useRef(createBoundedKeySet());
  const startedRef = useRef(createBoundedKeySet());
  const [anchorRect, setAnchorRect] = useState<LayoutRectangle | null>(
    null
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [targetUnavailable, setTargetUnavailable] = useState(false);
  const [queryRetry, setQueryRetry] = useState<{
    requestKey: string;
    state: 'loading' | 'success' | 'error';
    result?: {
      state: 'active' | 'completed' | 'invalidated' | 'restricted';
      reasonCode: string;
    };
    error?: Error;
  } | null>(null);
  const [statusRetryState, setStatusRetryState] = useState({
    attempts: 0,
    inFlight: false,
    exhausted: false,
  });
  const [closedGuideRequestKey, setClosedGuideRequestKey] = useState<
    string | null
  >(null);
  const hasGuideMetadata = hasGuideLikeRouteMetadata({
    guideSessionId,
    guideId,
    stableId,
    evidenceFingerprint,
    recommendationBusinessId,
  });
  const guideRequestKey = hasGuideMetadata
    ? [
        guideSessionId ?? '',
        guideId ?? '',
        stableId ?? '',
        routeBusinessId ?? '',
        recommendationBusinessId ?? '',
        entityId ?? '',
        fieldId ?? '',
        limitKey ?? '',
        filter ?? '',
        section ?? '',
      ].join('|')
    : null;
  const statusRequestIdentity = guideRequestKey
    ? buildGuidedStatusRetryIdentity({
        businessId:
          routeBusinessId ??
          recommendationBusinessId ??
          (input.activeBusinessId ? String(input.activeBusinessId) : ''),
        guideSessionId,
        stableId,
        guideId,
        routeKey: input.routeKey,
        entityId: entityId ?? input.routeEntityId,
        stepIndex,
      })
    : null;
  const isClosed =
    guideRequestKey !== null && guideRequestKey === closedGuideRequestKey;
  const reactiveStatusResult = guideStatusArgs
    ? statusQueries.guideStatus
    : undefined;
  const matchingQueryRetry =
    queryRetry?.requestKey === statusRequestIdentity ? queryRetry : null;
  const effectiveStatusResult =
    reactiveStatusResult instanceof Error &&
    isPermanentGuideQueryError(reactiveStatusResult)
      ? reactiveStatusResult
      : (reactiveStatusResult === undefined ||
            reactiveStatusResult instanceof Error) &&
          matchingQueryRetry
        ? matchingQueryRetry.state === 'loading'
          ? undefined
          : matchingQueryRetry.state === 'success'
            ? matchingQueryRetry.result
            : matchingQueryRetry.error
        : reactiveStatusResult;
  const connectionUnavailable =
    !connectionState.isWebSocketConnected &&
    (connectionState.hasEverConnected ||
      connectionState.connectionRetries > 0);
  const serverStatus: GuidedTargetServerStatus =
    resolveGuidedActionStatus({
      bindingValid: binding.ok,
      requiredMetadataValid,
      connected: !connectionUnavailable,
      queryResult: effectiveStatusResult,
    });
  const status =
    effectiveStatusResult &&
    !(effectiveStatusResult instanceof Error)
      ? effectiveStatusResult
      : undefined;
  const businessMatches =
    binding.ok &&
    input.activeBusinessId !== null &&
    String(input.activeBusinessId) === binding.businessId;
  const profileField =
    binding.ok && binding.guideId === 'profile-complete'
      ? resolveProfileGuideField(fieldId)
      : null;
  const targetMetadataValid =
    !binding.ok ||
    (binding.guideId === 'profile-complete'
      ? profileField !== null
      : binding.guideId === 'inactive-review'
        ? filter === 'at_risk'
        : binding.guideId === 'near-reward'
          ? filter === 'near_reward'
          : binding.guideId === 'team-pending'
            ? section === 'pending'
            : binding.guideId === 'quota-review'
              ? limitKey === 'campaigns'
              : true);
  const targetActivation = useMemo<GuidedTargetActivationInput>(
    () => ({
      bindingValid: binding.ok,
      guideSessionId,
      serverStatus,
      businessMatches,
      isSwitchingBusiness: input.isSwitchingBusiness === true,
      isClosed,
      routeAndEntityMatch:
        binding.ok &&
        targetMetadataValid &&
        input.destinationTargetValid !== false,
    }),
    [
      binding.ok,
      businessMatches,
      guideSessionId,
      input.isSwitchingBusiness,
      isClosed,
      serverStatus,
      targetMetadataValid,
      input.destinationTargetValid,
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
  prepareTargetRef.current = input.prepareTarget;
  const suppliedSteps =
    input.steps && input.steps.length > 0
      ? input.steps.slice(0, clampGuideSteps(input.steps.length))
      : binding.ok
        ? [GUIDE_INSTRUCTIONS[binding.guideId]]
        : [];
  const targetId = binding.ok ? GUIDE_TARGET_IDS[binding.guideId] : null;

  const syncStatusRetryState = useCallback(() => {
    const next = runtimeCoordinatorRef.current.getStatusRetryState();
    setStatusRetryState({
      attempts: next.attempts,
      inFlight: next.inFlight,
      exhausted: next.exhausted,
    });
  }, []);

  const cancelTargetPreparation = useCallback(() => {
    runtimeCoordinatorRef.current.cancelPreparation();
  }, []);

  const runTargetPreparation = useCallback((force = false) => {
    const prepare = prepareTargetRef.current;
    const activationKey = targetActivationKeyRef.current;
    if (!prepare || !targetActivationAllowedRef.current) {
      return false;
    }
    const result = runtimeCoordinatorRef.current.prepareTarget({
      activation: {
        bindingValid: true,
        guideSessionId: guideSessionId ?? 'session',
        serverStatus: 'active',
        businessMatches: true,
        isSwitchingBusiness: false,
        isClosed: false,
        routeAndEntityMatch: true,
      },
      identity: activationKey,
      prepareTarget: prepare,
      force,
      onFailure: () => {
        if (
          targetActivationKeyRef.current !== activationKey ||
          !targetActivationAllowedRef.current
        ) {
          return;
        }
        setTargetUnavailable(true);
        setFeedback('לא הצלחנו להכין את יעד ההדרכה. נסו שוב.');
      },
    });
    return result.ran;
  }, [guideSessionId]);

  const deactivateGuidedTarget = useCallback(() => {
    targetActivationAllowedRef.current = false;
    cancelTargetPreparation();
    runtimeCoordinatorRef.current.deactivate();
    measurementRetryRef.current.stop();
    lastMeasurementKeyRef.current = null;
    focusControllerRef.current.reset();
    activeAnchorIdRef.current = null;
    anchorsRef.current.clear();
    setAnchorRect(null);
    setTargetUnavailable(false);
  }, [cancelTargetPreparation]);

  const clearGuide = useCallback(() => {
    if (guideRequestKey) {
      setClosedGuideRequestKey(guideRequestKey);
    }
    deactivateGuidedTarget();
    runtimeCoordinatorRef.current.cancelStatusRetry();
    syncStatusRetryState();
    setPauseReactiveStatus(false);
    setQueryRetry(null);
    setFeedback(null);
    setStepIndex(0);
    router.setParams(getClearedGuideRouteParams() as never);
  }, [
    deactivateGuidedTarget,
    guideRequestKey,
    router,
    syncStatusRetryState,
  ]);

  const measureAnchor = useCallback(
    (anchorId: string, _force = false) => {
      if (!targetActivationAllowedRef.current) {
        setAnchorRect(null);
        return;
      }
      const registration = anchorsRef.current.get(anchorId);
      if (!registration) {
        setAnchorRect(null);
        return;
      }
      const activationKey = targetActivationKeyRef.current;
      const measurementKey = `${activationKey}|${anchorId}`;
      lastMeasurementKeyRef.current = measurementKey;
      activeAnchorIdRef.current = anchorId;
      setAnchorRect(null);
      setTargetUnavailable(false);
      const sequence = createGuidedMeasurementSequence({
        canScroll: Boolean(registration.scrollIntoView),
      });
      const failOrRetry = (attempt: number, retry: () => void) => {
        if (attempt >= measurementRetryRef.current.getMaxAttempts()) {
          setAnchorRect(null);
          setTargetUnavailable(true);
          setFeedback('לא הצלחנו לאתר את היעד במסך. נסו שוב.');
          return;
        }
        retry();
      };

      measurementRetryRef.current.start((attempt, retry) => {
        if (
          !targetActivationAllowedRef.current ||
          targetActivationKeyRef.current !== activationKey ||
          anchorsRef.current.get(anchorId) !== registration
        ) {
          return;
        }
        const node = registration.getRef?.() ?? registration.ref;
        if (!node || typeof node.measureInWindow !== 'function') {
          sequence.next({ available: false });
          failOrRetry(attempt, retry);
          return;
        }
        node.measureInWindow((x, y, width, height) => {
          if (
            !targetActivationAllowedRef.current ||
            targetActivationKeyRef.current !== activationKey ||
            anchorsRef.current.get(anchorId) !== registration
          ) {
            return;
          }
          if (width <= 0 || height <= 0) {
            sequence.next({ available: false });
            failOrRetry(attempt, retry);
            return;
          }
          const rect = { x, y, width, height };
          const window = Dimensions.get('window');
          const viewport = measurementViewportRef.current ?? {
            width: window.width,
            height: window.height,
          };
          const actions = sequence.next({
            available: true,
            visible: isGuideRectVisible(rect, viewport),
          });
          if (
            registration.scrollIntoView &&
            actions[0] === 'scroll'
          ) {
            registration.scrollIntoView();
            retry();
            return;
          }
          if (actions[0] === 'retry') {
            failOrRetry(attempt, retry);
            return;
          }
          setFeedback(null);
          setTargetUnavailable(false);
          setAnchorRect(rect);
          const focus = registration.getFocus?.() ?? registration.focus;
          focusControllerRef.current.focusOnce(measurementKey, focus);
        });
      });
    },
    []
  );

  const registerAnchor = useCallback(
    (registration: GuidedActionAnchorRegistration) => {
      if (!targetActivationAllowedRef.current) {
        return () => undefined;
      }
      anchorsRef.current.set(registration.id, registration);
      measureAnchor(registration.id, true);
      return () => {
        if (anchorsRef.current.get(registration.id) === registration) {
          anchorsRef.current.delete(registration.id);
          measurementRetryRef.current.stop();
          activeAnchorIdRef.current = null;
          setAnchorRect(null);
          setTargetUnavailable(false);
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
    runtimeCoordinatorRef.current.cancelStatusRetry();
    syncStatusRetryState();
    setPauseReactiveStatus(false);
    setQueryRetry(null);
    acknowledgedRef.current.clear();
    startedRef.current.clear();
    setStepIndex(0);
    setFeedback(null);
  }, [
    deactivateGuidedTarget,
    input.activeBusinessId,
    syncStatusRetryState,
  ]);

  const statusRequestIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    if (statusRequestIdentityRef.current === statusRequestIdentity) {
      return;
    }
    statusRequestIdentityRef.current = statusRequestIdentity;
    runtimeCoordinatorRef.current.setIdentity(statusRequestIdentity);
    syncStatusRetryState();
    setPauseReactiveStatus(false);
    setQueryRetry(null);
    setFeedback(null);
    acknowledgedRef.current.clear();
    startedRef.current.clear();
  }, [statusRequestIdentity, syncStatusRetryState]);

  useEffect(() => {
    if (!canActivateTarget) {
      deactivateGuidedTarget();
    }
  }, [canActivateTarget, deactivateGuidedTarget]);

  useEffect(() => {
    if (!canActivateTarget || !prepareTargetRef.current) {
      return;
    }
    runTargetPreparation();
    return cancelTargetPreparation;
  }, [
    canActivateTarget,
    cancelTargetPreparation,
    runTargetPreparation,
    targetActivationKey,
  ]);

  useEffect(() => {
    if (
      !statusRequestIdentity ||
      effectiveStatusResult === undefined ||
      effectiveStatusResult instanceof Error
    ) {
      return;
    }
    const retryState = runtimeCoordinatorRef.current.getStatusRetryState();
    if (
      retryState.identity === statusRequestIdentity &&
      (retryState.attempts > 0 ||
        retryState.inFlight ||
        retryState.exhausted)
    ) {
      runtimeCoordinatorRef.current.resetStatusRetry(statusRequestIdentity);
      syncStatusRetryState();
    }
    if (
      reactiveStatusResult !== undefined &&
      !(reactiveStatusResult instanceof Error) &&
      matchingQueryRetry
    ) {
      setPauseReactiveStatus(false);
      setQueryRetry(null);
    }
    setFeedback(null);
  }, [
    effectiveStatusResult,
    matchingQueryRetry,
    reactiveStatusResult,
    statusRequestIdentity,
    syncStatusRetryState,
  ]);

  useEffect(() => {
    if (serverStatus !== 'rejected' || !hasGuideMetadata) {
      return;
    }
    runtimeCoordinatorRef.current.cancelStatusRetry();
    syncStatusRetryState();
    const isManualPermanentRejection =
      matchingQueryRetry?.state === 'error' &&
      isPermanentGuideQueryError(matchingQueryRetry.error);
    if (!isManualPermanentRejection) {
      setPauseReactiveStatus(false);
      setQueryRetry(null);
    }
    setFeedback(REJECTED_GUIDE_CLEANUP_MESSAGE);
  }, [
    hasGuideMetadata,
    matchingQueryRetry,
    serverStatus,
    syncStatusRetryState,
  ]);

  useEffect(() => {
    if (input.isSwitchingBusiness !== true) {
      return;
    }
    runtimeCoordinatorRef.current.cancelStatusRetry();
    syncStatusRetryState();
    setPauseReactiveStatus(false);
    setQueryRetry(null);
  }, [input.isSwitchingBusiness, syncStatusRetryState]);

  useEffect(
    () => () => {
      targetActivationAllowedRef.current = false;
      cancelTargetPreparation();
      runtimeCoordinatorRef.current.deactivate();
      runtimeCoordinatorRef.current.cancelStatusRetry();
      measurementRetryRef.current.stop();
      anchorsRef.current.clear();
    },
    [cancelTargetPreparation]
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
    if (!startedRef.current.add(key)) {
      return;
    }
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
    if (!acknowledgedRef.current.add(key)) {
      return;
    }
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

  const setMeasurementViewport = useCallback(
    (viewport: GuideViewport) => {
      measurementViewportRef.current = viewport;
      const activeAnchorId = activeAnchorIdRef.current;
      if (targetActivationAllowedRef.current && activeAnchorId) {
        measureAnchor(activeAnchorId, true);
      }
    },
    [measureAnchor]
  );

  const retryGuideStatus = useCallback(async () => {
    if (
      !guideStatusArgs ||
      !statusRequestIdentity ||
      serverStatus === 'rejected'
    ) {
      return;
    }
    const requestIdentity = statusRequestIdentity;
    const requestArgs = { ...guideStatusArgs };
    const outcome = await runtimeCoordinatorRef.current.retryFreshStatus({
      identity: requestIdentity,
      status: serverStatus,
      connected: connectionState.isWebSocketConnected,
      args: requestArgs,
      onOffline: () => {
        setFeedback('אין כרגע חיבור לשרת. בדקו את החיבור ונסו שוב.');
      },
      onLoading: () => {
        syncStatusRetryState();
        setFeedback('טוענים מחדש את ההדרכה...');
        setPauseReactiveStatus(true);
        setQueryRetry({
          requestKey: requestIdentity,
          state: 'loading',
        });
      },
      query: async (args) => {
        let cacheReleased = false;
        for (
          let attempt = 0;
          attempt < STATUS_RETRY_CACHE_RELEASE_ATTEMPTS;
          attempt += 1
        ) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, STATUS_RETRY_CACHE_RELEASE_DELAY_MS);
          });
          if (
            runtimeCoordinatorRef.current.getStatusRetryState().identity !==
              requestIdentity ||
            !runtimeCoordinatorRef.current.getStatusRetryState().inFlight
          ) {
            throw new Error('GUIDE_QUERY_STALE');
          }
          const watch = convex.watchQuery(
            api.recommendations.getBusinessRecommendationGuideStatus,
            args as typeof guideStatusArgs
          );
          try {
            cacheReleased = watch.localQueryResult() === undefined;
          } catch {
            cacheReleased = false;
          }
          if (cacheReleased) {
            break;
          }
        }
        if (!cacheReleased) {
          throw new Error('GUIDE_QUERY_REFRESH_TIMEOUT');
        }
        return convex.query(
          api.recommendations.getBusinessRecommendationGuideStatus,
          args as typeof guideStatusArgs
        );
      },
      onSuccess: (result) => {
        syncStatusRetryState();
        setPauseReactiveStatus(false);
        setQueryRetry({
          requestKey: requestIdentity,
          state: 'success',
          result,
        });
        setFeedback(null);
      },
      onRejected: (error) => {
        const normalizedError =
          error instanceof Error ? error : new Error('GUIDE_QUERY_FAILED');
        syncStatusRetryState();
        setQueryRetry({
          requestKey: requestIdentity,
          state: 'error',
          error: normalizedError,
        });
        setFeedback(REJECTED_GUIDE_CLEANUP_MESSAGE);
      },
      onRetryableError: (exhausted, error) => {
        const normalizedError =
          error instanceof Error ? error : new Error('GUIDE_QUERY_FAILED');
        setPauseReactiveStatus(false);
        syncStatusRetryState();
        setQueryRetry({
          requestKey: requestIdentity,
          state: 'error',
          error: normalizedError,
        });
        setFeedback(
          exhausted
            ? 'מיצינו את מספר ניסיונות הטעינה להדרכה הזו.'
            : 'לא הצלחנו לטעון את ההדרכה. נסו שוב.'
        );
      },
      onStale: () => {
        syncStatusRetryState();
      },
    });
    if (outcome.reason === 'exhausted' || outcome.reason === 'in_flight') {
      syncStatusRetryState();
      if (outcome.reason === 'exhausted') {
        setFeedback('מיצינו את מספר ניסיונות הטעינה להדרכה הזו.');
      }
    }
  }, [
    connectionState.isWebSocketConnected,
    convex,
    guideStatusArgs,
    serverStatus,
    statusRequestIdentity,
    syncStatusRetryState,
  ]);

  const retry = useCallback(() => {
    setFeedback(null);
    setTargetUnavailable(false);
    if (serverStatus === 'error' || serverStatus === 'unavailable') {
      void retryGuideStatus();
      return;
    }
    if (!targetActivationAllowedRef.current) {
      return;
    }
    runTargetPreparation(true);
    const activeAnchorId = activeAnchorIdRef.current ?? targetId;
    if (activeAnchorId) {
      measureAnchor(activeAnchorId, true);
    }
  }, [
    measureAnchor,
    retryGuideStatus,
    runTargetPreparation,
    serverStatus,
    targetId,
  ]);

  const bindObservableTarget = useCallback(
    (input: {
      identity: string;
      getCurrent: () => unknown | null;
      subscribe: (listener: (node: unknown | null) => void) => () => void;
      register: (node: unknown) => (() => void) | void;
    }) =>
      runtimeCoordinatorRef.current.bindObservableTarget({
        activation: targetActivation,
        identity: input.identity,
        getCurrent: input.getCurrent,
        subscribe: input.subscribe,
        register: input.register,
      }),
    [targetActivation]
  );

  return useMemo(
    () => ({
      isRequested: hasGuideMetadata && !isClosed,
      hasGuideMetadata,
      isBindingValid: binding.ok && requiredMetadataValid,
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
            ? serverStatus === 'rejected'
              ? 'REJECTED'
              : serverStatus === 'error'
                ? 'QUERY_ERROR'
                : serverStatus === 'unavailable'
                  ? 'UNAVAILABLE'
                  : 'LOADING'
            : binding.reasonCode,
      guideId: binding.ok ? binding.guideId : null,
      stableId: binding.ok ? binding.stableId : null,
      targetId,
      instruction:
        suppliedSteps[stepIndex] ??
        (binding.ok ? GUIDE_INSTRUCTIONS[binding.guideId] : null),
      stepIndex,
      stepCount: suppliedSteps.length,
      fieldId: profileField,
      limitKey,
      entityId,
      anchorRect,
      feedback,
      targetUnavailable,
      isStatusRetrying: statusRetryState.inFlight,
      statusRetryExhausted: statusRetryState.exhausted,
      statusRetryAttempt: statusRetryState.attempts,
      registerAnchor,
      measureAnchor,
      setMeasurementViewport,
      bindObservableTarget,
      deactivateGuidedTarget,
      previous: () => setStepIndex((current) => Math.max(0, current - 1)),
      next,
      close: clearGuide,
      retry,
    }),
    [
      anchorRect,
      binding,
      bindObservableTarget,
      canActivateTarget,
      clearGuide,
      deactivateGuidedTarget,
      entityId,
      feedback,
      guideId,
      hasGuideMetadata,
      isClosed,
      limitKey,
      measureAnchor,
      next,
      profileField,
      registerAnchor,
      requiredMetadataValid,
      retry,
      serverStatus,
      status,
      statusRetryState.attempts,
      statusRetryState.exhausted,
      statusRetryState.inFlight,
      stepIndex,
      suppliedSteps,
      targetActivation,
      targetActivationKey,
      targetId,
      targetUnavailable,
      setMeasurementViewport,
    ]
  );
}
