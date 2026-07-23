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
}) => RecommendationNavigationResult | null | undefined;

export function openRecommendationAction(input: {
  businessId: string | null | undefined;
  action: unknown;
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
