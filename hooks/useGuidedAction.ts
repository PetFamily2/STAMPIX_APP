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
  buildBusinessMismatchCleanupKey,
  buildGuidedStatusQueriesRequest,
  buildGuidedStatusRetryIdentity,
  canActivateGuidedTarget,
  clampGuideSteps,
  createBoundedKeySet,
  createBoundedRetryController,
  createGuidedActionRuntimeCoordinator,
  createGuidedFocusController,
  createGuidedMeasurementSequence,
  getClearedGuideRouteParams,
  GUIDE_INSTRUCTIONS,
  GUIDE_TARGET_IDS,
  isPermanentGuideQueryError,
  isGuideRectVisible,
  REJECTED_GUIDE_CLEANUP_MESSAGE,
  resolveGuidedActionStatus,
  resolveGuidedClientPresence,
  resolveProfileGuideField,
  shouldAutoClearBusinessMismatchGuide,
  shouldClearRejectedGuideRouteParams,
  shouldResetGuidedStatusRetryAfterSuccess,
  type GuideViewport,
  type GuidedActionRuntimeCoordinator,
  type GuidedFreshStatusQueryResult,
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
  const clientPresence = resolveGuidedClientPresence({
    guideSessionId,
    guideId,
    stableId,
    evidenceFingerprint,
    recommendationBusinessId,
    businessId: routeBusinessId,
    entityId,
    filter,
    section,
    fieldId,
    limitKey,
  });
  const hasGuideMetadata = clientPresence.hasGuideMetadata;
  const isInertVisit = clientPresence.isInert;
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
  const bindingOk = binding.ok;
  const bindingReasonCode = binding.ok ? null : binding.reasonCode;
  const bindingGuideSessionId = binding.ok ? binding.guideSessionId : null;
  const bindingGuideId = binding.ok ? binding.guideId : null;
  const bindingStableId = binding.ok ? binding.stableId : null;
  const bindingBusinessId = binding.ok ? binding.businessId : null;
  const convex = useConvex();
  const connectionState = useConvexConnectionState();
  const requiredMetadataValid =
    typeof evidenceFingerprint === 'string' &&
    evidenceFingerprint.length > 0 &&
    evidenceFingerprint === evidenceFingerprint.trim();
  const [pauseReactiveStatus, setPauseReactiveStatus] = useState(false);
  const guideStatusArgs = useMemo(() => {
    if (
      isInertVisit ||
      !bindingOk ||
      !requiredMetadataValid ||
      !bindingGuideSessionId ||
      !bindingBusinessId ||
      !bindingStableId ||
      !bindingGuideId ||
      !evidenceFingerprint
    ) {
      return null;
    }
    return {
      guideSessionId:
        bindingGuideSessionId as Id<'recommendationGuideSessions'>,
      businessId: bindingBusinessId as Id<'businesses'>,
      stableId: bindingStableId,
      guideId: bindingGuideId,
      evidenceFingerprint,
      ...(entityId ? { entityId } : {}),
    };
  }, [
    bindingBusinessId,
    bindingGuideId,
    bindingGuideSessionId,
    bindingOk,
    bindingStableId,
    entityId,
    evidenceFingerprint,
    isInertVisit,
    requiredMetadataValid,
  ]);
  const statusQueryRequest = useMemo(
    () =>
      buildGuidedStatusQueriesRequest({
        enabled: !pauseReactiveStatus && guideStatusArgs !== null,
        query: api.recommendations.getBusinessRecommendationGuideStatus,
        args: guideStatusArgs,
      }),
    [guideStatusArgs, pauseReactiveStatus]
  );
  const statusQueries = useQueries(statusQueryRequest);
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
  const runtimeCoordinatorRef = useRef<GuidedActionRuntimeCoordinator | null>(
    null
  );
  if (runtimeCoordinatorRef.current === null) {
    runtimeCoordinatorRef.current = createGuidedActionRuntimeCoordinator();
  }
  const getRuntimeCoordinator = useCallback(() => {
    if (runtimeCoordinatorRef.current === null) {
      runtimeCoordinatorRef.current = createGuidedActionRuntimeCoordinator();
    }
    return runtimeCoordinatorRef.current;
  }, []);
  const prepareTargetRef = useRef(input.prepareTarget);
  const outcomeGuardRef = useRef(createGuideOutcomeGuard());
  const acknowledgedRef = useRef(createBoundedKeySet());
  const startedRef = useRef(createBoundedKeySet());
  const businessMismatchClearedKeyRef = useRef<string | null>(null);
  const rejectedFeedbackKeyRef = useRef<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<LayoutRectangle | null>(
    null
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [targetUnavailable, setTargetUnavailable] = useState(false);
  const [queryRetry, setQueryRetry] = useState<{
    requestKey: string;
    state: 'loading' | 'success' | 'error';
    result?: GuidedFreshStatusQueryResult;
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
  const serverStatus: GuidedTargetServerStatus = isInertVisit
    ? 'loading'
    : resolveGuidedActionStatus({
        bindingValid: bindingOk,
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
    bindingOk &&
    input.activeBusinessId !== null &&
    bindingBusinessId !== null &&
    String(input.activeBusinessId) === bindingBusinessId;
  const profileField =
    bindingOk && bindingGuideId === 'profile-complete'
      ? resolveProfileGuideField(fieldId)
      : null;
  const targetMetadataValid =
    !bindingOk ||
    (bindingGuideId === 'profile-complete'
      ? profileField !== null
      : bindingGuideId === 'inactive-review'
        ? filter === 'at_risk'
        : bindingGuideId === 'near-reward'
          ? filter === 'near_reward'
          : bindingGuideId === 'team-pending'
            ? section === 'pending'
            : bindingGuideId === 'quota-review'
              ? limitKey === 'campaigns'
              : true);
  const targetActivation = useMemo<GuidedTargetActivationInput>(
    () => ({
      bindingValid: bindingOk,
      guideSessionId,
      serverStatus,
      businessMatches,
      isSwitchingBusiness: input.isSwitchingBusiness === true,
      isClosed,
      routeAndEntityMatch:
        bindingOk &&
        targetMetadataValid &&
        input.destinationTargetValid !== false,
    }),
    [
      bindingOk,
      businessMatches,
      guideSessionId,
      input.isSwitchingBusiness,
      isClosed,
      serverStatus,
      targetMetadataValid,
      input.destinationTargetValid,
    ]
  );
  const canActivateTarget =
    !isInertVisit && canActivateGuidedTarget(targetActivation);
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
      : bindingOk && bindingGuideId
        ? [GUIDE_INSTRUCTIONS[bindingGuideId]]
        : [];
  const targetId =
    bindingOk && bindingGuideId ? GUIDE_TARGET_IDS[bindingGuideId] : null;

  const syncStatusRetryState = useCallback(() => {
    const next = getRuntimeCoordinator().getStatusRetryState();
    setStatusRetryState((current) =>
      current.attempts === next.attempts &&
      current.inFlight === next.inFlight &&
      current.exhausted === next.exhausted
        ? current
        : {
            attempts: next.attempts,
            inFlight: next.inFlight,
            exhausted: next.exhausted,
          }
    );
  }, [getRuntimeCoordinator]);

  const cancelTargetPreparation = useCallback(() => {
    getRuntimeCoordinator().cancelPreparation();
  }, [getRuntimeCoordinator]);

  const runTargetPreparation = useCallback((force = false) => {
    const prepare = prepareTargetRef.current;
    const activationKey = targetActivationKeyRef.current;
    if (!prepare || !targetActivationAllowedRef.current) {
      return false;
    }
    const result = getRuntimeCoordinator().prepareTarget({
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
  }, [getRuntimeCoordinator, guideSessionId]);

  const deactivateGuidedTarget = useCallback(() => {
    targetActivationAllowedRef.current = false;
    cancelTargetPreparation();
    getRuntimeCoordinator().deactivate();
    measurementRetryRef.current.stop();
    lastMeasurementKeyRef.current = null;
    focusControllerRef.current.reset();
    activeAnchorIdRef.current = null;
    anchorsRef.current.clear();
    setAnchorRect((current) => (current === null ? current : null));
    setTargetUnavailable((current) => (current === false ? current : false));
  }, [cancelTargetPreparation, getRuntimeCoordinator]);

  const clearGuide = useCallback(() => {
    const mayClearRoute = shouldClearRejectedGuideRouteParams({
      hasGuideMetadata,
      userRequestedClose: true,
    });
    if (guideRequestKey) {
      setClosedGuideRequestKey(guideRequestKey);
    }
    deactivateGuidedTarget();
    getRuntimeCoordinator().cancelStatusRetry();
    syncStatusRetryState();
    setPauseReactiveStatus(false);
    setQueryRetry(null);
    setFeedback(null);
    setStepIndex(0);
    rejectedFeedbackKeyRef.current = null;
    if (mayClearRoute) {
      router.setParams(getClearedGuideRouteParams() as never);
    }
  }, [
    deactivateGuidedTarget,
    getRuntimeCoordinator,
    guideRequestKey,
    hasGuideMetadata,
    router,
    syncStatusRetryState,
  ]);

  const measureAnchor = useCallback(
    (anchorId: string, _force = false) => {
      if (!targetActivationAllowedRef.current) {
        setAnchorRect((current) => (current === null ? current : null));
        return;
      }
      const registration = anchorsRef.current.get(anchorId);
      if (!registration) {
        setAnchorRect((current) => (current === null ? current : null));
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
    if (isInertVisit) {
      return;
    }
    if (activeBusinessIdRef.current === input.activeBusinessId) {
      return;
    }
    activeBusinessIdRef.current = input.activeBusinessId;
    businessMismatchClearedKeyRef.current = null;
    rejectedFeedbackKeyRef.current = null;
    deactivateGuidedTarget();
    getRuntimeCoordinator().cancelStatusRetry();
    syncStatusRetryState();
    setPauseReactiveStatus(false);
    setQueryRetry(null);
    acknowledgedRef.current.clear();
    startedRef.current.clear();
    setStepIndex(0);
    setFeedback(null);
  }, [
    deactivateGuidedTarget,
    getRuntimeCoordinator,
    input.activeBusinessId,
    isInertVisit,
    syncStatusRetryState,
  ]);

  const statusRequestIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    if (isInertVisit) {
      if (statusRequestIdentityRef.current !== null) {
        statusRequestIdentityRef.current = null;
        getRuntimeCoordinator().setIdentity(null);
      }
      return;
    }
    if (statusRequestIdentityRef.current === statusRequestIdentity) {
      return;
    }
    statusRequestIdentityRef.current = statusRequestIdentity;
    getRuntimeCoordinator().setIdentity(statusRequestIdentity);
    syncStatusRetryState();
    setPauseReactiveStatus(false);
    setQueryRetry(null);
    setFeedback(null);
    acknowledgedRef.current.clear();
    startedRef.current.clear();
    rejectedFeedbackKeyRef.current = null;
  }, [
    getRuntimeCoordinator,
    isInertVisit,
    statusRequestIdentity,
    syncStatusRetryState,
  ]);

  useEffect(() => {
    if (isInertVisit || canActivateTarget) {
      return;
    }
    deactivateGuidedTarget();
  }, [canActivateTarget, deactivateGuidedTarget, isInertVisit]);

  useEffect(() => {
    if (isInertVisit || !canActivateTarget || !prepareTargetRef.current) {
      return;
    }
    runTargetPreparation();
    return cancelTargetPreparation;
  }, [
    canActivateTarget,
    cancelTargetPreparation,
    isInertVisit,
    runTargetPreparation,
    targetActivationKey,
  ]);

  useEffect(() => {
    if (
      isInertVisit ||
      !statusRequestIdentity ||
      effectiveStatusResult === undefined ||
      effectiveStatusResult instanceof Error
    ) {
      return;
    }
    const retryState = getRuntimeCoordinator().getStatusRetryState();
    if (
      shouldResetGuidedStatusRetryAfterSuccess({
        identity: statusRequestIdentity,
        retryIdentity: retryState.identity,
        attempts: retryState.attempts,
        inFlight: retryState.inFlight,
        exhausted: retryState.exhausted,
      })
    ) {
      getRuntimeCoordinator().resetStatusRetry(statusRequestIdentity);
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
    setFeedback((current) => (current === null ? current : null));
  }, [
    effectiveStatusResult,
    getRuntimeCoordinator,
    isInertVisit,
    matchingQueryRetry,
    reactiveStatusResult,
    statusRequestIdentity,
    syncStatusRetryState,
  ]);

  useEffect(() => {
    if (isInertVisit || serverStatus !== 'rejected' || !hasGuideMetadata) {
      return;
    }
    const rejectionKey = guideRequestKey ?? statusRequestIdentity ?? 'rejected';
    if (rejectedFeedbackKeyRef.current === rejectionKey) {
      return;
    }
    rejectedFeedbackKeyRef.current = rejectionKey;
    getRuntimeCoordinator().cancelStatusRetry();
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
    getRuntimeCoordinator,
    guideRequestKey,
    hasGuideMetadata,
    isInertVisit,
    matchingQueryRetry,
    serverStatus,
    statusRequestIdentity,
    syncStatusRetryState,
  ]);

  useEffect(() => {
    if (isInertVisit || input.isSwitchingBusiness !== true) {
      return;
    }
    getRuntimeCoordinator().cancelStatusRetry();
    syncStatusRetryState();
    setPauseReactiveStatus(false);
    setQueryRetry(null);
  }, [
    getRuntimeCoordinator,
    input.isSwitchingBusiness,
    isInertVisit,
    syncStatusRetryState,
  ]);

  useEffect(
    () => () => {
      targetActivationAllowedRef.current = false;
      cancelTargetPreparation();
      const coordinator = runtimeCoordinatorRef.current;
      if (coordinator) {
        coordinator.deactivate();
        coordinator.cancelStatusRetry();
        coordinator.dispose();
      }
      runtimeCoordinatorRef.current = null;
      measurementRetryRef.current.stop();
      anchorsRef.current.clear();
    },
    [cancelTargetPreparation]
  );

  useEffect(() => {
    if (isInertVisit) {
      return;
    }
    const cleanupKey = buildBusinessMismatchCleanupKey({
      activeBusinessId: input.activeBusinessId,
      guideId,
      guideSessionId,
      stableId,
      recommendationBusinessId,
    });
    if (
      !shouldAutoClearBusinessMismatchGuide({
        activeBusinessId: input.activeBusinessId,
        guideId,
        bindingOk,
        reasonCode: bindingReasonCode,
        cleanupKey,
        alreadyClearedKey: businessMismatchClearedKeyRef.current,
      })
    ) {
      return;
    }
    businessMismatchClearedKeyRef.current = cleanupKey;
    clearGuide();
  }, [
    bindingOk,
    bindingReasonCode,
    clearGuide,
    guideId,
    guideSessionId,
    input.activeBusinessId,
    isInertVisit,
    recommendationBusinessId,
    stableId,
  ]);

  useEffect(() => {
    if (
      isInertVisit ||
      !canActivateTarget ||
      !bindingOk ||
      !bindingBusinessId ||
      !bindingStableId ||
      !bindingGuideId ||
      !evidenceFingerprint ||
      status?.state !== 'active'
    ) {
      return;
    }
    const key = `${bindingBusinessId}|${bindingStableId}|${evidenceFingerprint}`;
    if (!startedRef.current.add(key)) {
      return;
    }
    safelyTrackRecommendationEvent(
      track,
      ANALYTICS_EVENTS.guidedActionStarted,
      {
        stable_recommendation_id: bindingStableId,
        guide_id: bindingGuideId,
        evidence_fingerprint: evidenceFingerprint,
        route_key: input.routeKey,
        step_index: 0,
        step_count: suppliedSteps.length,
      }
    );
  }, [
    bindingBusinessId,
    bindingGuideId,
    bindingOk,
    bindingStableId,
    canActivateTarget,
    evidenceFingerprint,
    input.routeKey,
    isInertVisit,
    status?.state,
    suppliedSteps.length,
  ]);

  useEffect(() => {
    if (
      isInertVisit ||
      !bindingOk ||
      !bindingBusinessId ||
      !bindingStableId ||
      !bindingGuideId ||
      !bindingGuideSessionId ||
      !evidenceFingerprint ||
      !connectionState.isWebSocketConnected ||
      (status?.state !== 'completed' &&
        status?.state !== 'invalidated')
    ) {
      return;
    }
    const outcomeState = status.state;
    const key = `${bindingBusinessId}|${bindingStableId}|${evidenceFingerprint}|${outcomeState}`;
    if (!acknowledgedRef.current.add(key)) {
      return;
    }
    void acknowledge({
      guideSessionId:
        bindingGuideSessionId as Id<'recommendationGuideSessions'>,
      businessId: bindingBusinessId as Id<'businesses'>,
      stableId: bindingStableId,
      guideId: bindingGuideId,
      evidenceFingerprint,
      ...(entityId ? { entityId } : {}),
    })
      .then((result) => {
        if (
          outcomeGuardRef.current.shouldTrack({
            businessId: bindingBusinessId,
            stableId: bindingStableId,
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
              stable_recommendation_id: bindingStableId,
              guide_id: bindingGuideId,
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
    bindingBusinessId,
    bindingGuideId,
    bindingGuideSessionId,
    bindingOk,
    bindingStableId,
    clearGuide,
    connectionState.isWebSocketConnected,
    entityId,
    evidenceFingerprint,
    input.routeKey,
    isInertVisit,
    status?.state,
  ]);

  const next = useCallback(() => {
    if (
      !canActivateTarget ||
      !bindingOk ||
      !bindingStableId ||
      !bindingGuideId ||
      !evidenceFingerprint
    ) {
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
        stable_recommendation_id: bindingStableId,
        guide_id: bindingGuideId,
        evidence_fingerprint: evidenceFingerprint,
        route_key: input.routeKey,
        step_index: stepIndex,
        step_count: suppliedSteps.length,
      }
    );
    setStepIndex(nextIndex);
  }, [
    bindingGuideId,
    bindingOk,
    bindingStableId,
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
      isInertVisit ||
      !guideStatusArgs ||
      !statusRequestIdentity ||
      serverStatus === 'rejected'
    ) {
      return;
    }
    const requestIdentity = statusRequestIdentity;
    const requestArgs = { ...guideStatusArgs };
    const coordinator = getRuntimeCoordinator();
    const outcome = await coordinator.retryFreshStatus({
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
            coordinator.getStatusRetryState().identity !== requestIdentity ||
            !coordinator.getStatusRetryState().inFlight
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
    getRuntimeCoordinator,
    guideStatusArgs,
    isInertVisit,
    serverStatus,
    statusRequestIdentity,
    syncStatusRetryState,
  ]);

  const retry = useCallback(() => {
    if (isInertVisit) {
      return;
    }
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
    isInertVisit,
    measureAnchor,
    retryGuideStatus,
    runTargetPreparation,
    serverStatus,
    targetId,
  ]);

  const bindObservableTarget = useCallback(
    (bindInput: {
      identity: string;
      getCurrent: () => unknown | null;
      subscribe: (listener: (node: unknown | null) => void) => () => void;
      register: (node: unknown) => (() => void) | void;
    }) => {
      if (isInertVisit || !canActivateTarget) {
        return false;
      }
      return getRuntimeCoordinator().bindObservableTarget({
        activation: targetActivation,
        identity: bindInput.identity,
        getCurrent: bindInput.getCurrent,
        subscribe: bindInput.subscribe,
        register: bindInput.register,
      });
    },
    [
      canActivateTarget,
      getRuntimeCoordinator,
      isInertVisit,
      targetActivation,
    ]
  );

  return useMemo(
    () => ({
      isRequested: hasGuideMetadata && !isClosed,
      hasGuideMetadata,
      isInert: isInertVisit,
      isBindingValid: bindingOk && requiredMetadataValid,
      isReady: canActivateTarget,
      canActivateTarget,
      targetActivation,
      targetActivationKey,
      isLoading: !isInertVisit && serverStatus === 'loading',
      status: isInertVisit ? ('loading' as const) : serverStatus,
      reasonCode: isInertVisit
        ? 'INERT'
        : status?.state === serverStatus
          ? status.reasonCode
          : bindingOk
            ? serverStatus === 'rejected'
              ? 'REJECTED'
              : serverStatus === 'error'
                ? 'QUERY_ERROR'
                : serverStatus === 'unavailable'
                  ? 'UNAVAILABLE'
                  : 'LOADING'
            : (bindingReasonCode ?? 'INVALID_GUIDE'),
      guideId: bindingOk ? bindingGuideId : null,
      stableId: bindingOk ? bindingStableId : null,
      targetId,
      instruction:
        suppliedSteps[stepIndex] ??
        (bindingOk && bindingGuideId
          ? GUIDE_INSTRUCTIONS[bindingGuideId]
          : null),
      stepIndex,
      stepCount: suppliedSteps.length,
      fieldId: profileField,
      limitKey,
      entityId,
      anchorRect,
      feedback: isInertVisit ? null : feedback,
      targetUnavailable: isInertVisit ? false : targetUnavailable,
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
      bindingGuideId,
      bindingOk,
      bindingReasonCode,
      bindingStableId,
      bindObservableTarget,
      canActivateTarget,
      clearGuide,
      deactivateGuidedTarget,
      entityId,
      feedback,
      hasGuideMetadata,
      isClosed,
      isInertVisit,
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
