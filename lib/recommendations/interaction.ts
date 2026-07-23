import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  safelyTrackRecommendationEvent,
  type RecommendationTrackFunction,
} from './analytics';
import {
  getRecommendationNavigationTarget,
  type RecommendationNavigationResult,
  type RecommendationNavigationTarget,
} from './navigation';

type NavigationResolver = (input: {
  businessId: string | null | undefined;
  action: unknown;
  guideSessionId?: unknown;
  guideId?: unknown;
  stableId?: unknown;
  evidenceFingerprint?: unknown;
  entityId?: unknown;
}) => RecommendationNavigationResult | null | undefined;

export function openRecommendationAction(input: {
  businessId: string | null | undefined;
  action: unknown;
  guideSessionId?: unknown;
  guideId?: unknown;
  stableId?: unknown;
  evidenceFingerprint?: unknown;
  entityId?: unknown;
  analyticsProps: Record<string, unknown>;
  trackEvent: RecommendationTrackFunction;
  navigate: (target: RecommendationNavigationTarget) => void;
  onStart?: () => void;
  onSettled?: () => void;
  resolveNavigation?: NavigationResolver;
}): RecommendationNavigationResult {
  const resolveNavigation =
    input.resolveNavigation ?? getRecommendationNavigationTarget;
  const navigation = resolveNavigation({
    businessId: input.businessId,
    action: input.action,
    guideSessionId: input.guideSessionId,
    guideId: input.guideId,
    stableId: input.stableId,
    evidenceFingerprint: input.evidenceFingerprint,
    entityId: input.entityId,
  });

  if (!navigation || navigation.ok !== true) {
    input.onSettled?.();
    return navigation?.ok === false
      ? navigation
      : { ok: false, reason: 'invalid_action' };
  }

  input.onStart?.();
  try {
    safelyTrackRecommendationEvent(
      input.trackEvent,
      ANALYTICS_EVENTS.recommendationOpened,
      input.analyticsProps
    );
    input.navigate(navigation.target);
    return navigation;
  } finally {
    input.onSettled?.();
  }
}

export type RecommendationInteractionRequest = {
  businessId: string;
  stableId: string;
  evidenceFingerprint: string;
  guideId?: string;
  entityId?: string;
};

export type CurrentRecommendationInteractionState = {
  activeBusinessId: string | null;
  isSwitchingBusiness: boolean;
  responseBusinessId: string | null;
  visibleRecommendations: ReadonlyArray<{
    stableId: string;
    evidenceFingerprint: string;
    guideId?: string;
    entityId?: string;
  }>;
};

export function isRecommendationInteractionRequestCurrent(
  request: RecommendationInteractionRequest,
  current: CurrentRecommendationInteractionState
) {
  return (
    current.isSwitchingBusiness === false &&
    current.activeBusinessId === request.businessId &&
    current.responseBusinessId === request.businessId &&
    current.visibleRecommendations.some(
      (recommendation) =>
        recommendation.stableId === request.stableId &&
        recommendation.evidenceFingerprint === request.evidenceFingerprint &&
        (request.guideId === undefined ||
          recommendation.guideId === request.guideId) &&
        (request.entityId === undefined ||
          recommendation.entityId === request.entityId)
    )
  );
}

export async function executeCurrentRecommendationInteraction<TResult>(
  input: {
    request: RecommendationInteractionRequest;
    getCurrentState: () => CurrentRecommendationInteractionState;
    mutate: (
      request: RecommendationInteractionRequest
    ) => Promise<TResult>;
    onSuccess?: (result: TResult) => void;
    onStale?: () => void;
    onError?: () => void;
    onSettled?: () => void;
  }
) {
  try {
    if (
      !isRecommendationInteractionRequestCurrent(
        input.request,
        input.getCurrentState()
      )
    ) {
      input.onStale?.();
      return { ok: false as const, reason: 'stale' as const };
    }
    const result = await input.mutate(input.request);
    input.onSuccess?.(result);
    return { ok: true as const, result };
  } catch {
    input.onError?.();
    return { ok: false as const, reason: 'mutation_failed' as const };
  } finally {
    input.onSettled?.();
  }
}
