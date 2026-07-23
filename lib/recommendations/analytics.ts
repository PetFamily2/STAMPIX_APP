import type {
  AnalyticsEventName,
  RecommendationAnalyticsProps,
} from '@/lib/analytics/events';
import type { RecommendationAction } from './navigation';

type AnalyticsRecommendation = {
  stableId: string;
  category: string;
  priority: number;
  placement: 'primary' | 'secondary';
  action: unknown;
  evidenceFingerprint: string;
};

const RECOMMENDATION_ACTION_TYPES = new Set<RecommendationAction['type']>([
  'open_business_address',
  'open_business_profile',
  'open_programs',
  'open_program',
  'open_campaigns',
  'open_campaign',
  'open_customers_segment',
  'open_team_pending',
  'open_subscription',
]);

function getSafeRecommendationActionType(action: unknown) {
  try {
    if (
      typeof action !== 'object' ||
      action === null ||
      !('type' in action) ||
      typeof action.type !== 'string'
    ) {
      return 'invalid_action';
    }
    return RECOMMENDATION_ACTION_TYPES.has(
      action.type as RecommendationAction['type']
    )
      ? action.type
      : 'invalid_action';
  } catch {
    return 'invalid_action';
  }
}

export type RecommendationTrackFunction = (
  eventName: AnalyticsEventName | string,
  props: Record<string, unknown>
) => unknown;

export function safelyTrackRecommendationEvent(
  trackEvent: RecommendationTrackFunction,
  eventName: AnalyticsEventName | string,
  props: Record<string, unknown>
) {
  try {
    const result = trackEvent(eventName, props);
    if (
      result !== null &&
      (typeof result === 'object' || typeof result === 'function') &&
      typeof (result as PromiseLike<unknown>).then === 'function'
    ) {
      void Promise.resolve(result).catch(() => undefined);
    }
  } catch {
    // Recommendation analytics must never interrupt presentation or navigation.
  }
}

export function getRecommendationAnalyticsProps(
  recommendation: AnalyticsRecommendation
): RecommendationAnalyticsProps {
  return {
    stable_recommendation_id: recommendation.stableId,
    category: recommendation.category,
    priority: recommendation.priority,
    placement: recommendation.placement,
    action_type: getSafeRecommendationActionType(recommendation.action),
    evidence_fingerprint: recommendation.evidenceFingerprint,
  };
}

export function createRecommendationShownGuard(maxEntries = 96) {
  const seen = new Set<string>();
  const boundedMaxEntries = Math.max(1, Math.floor(maxEntries));

  return {
    shouldTrack(input: {
      businessId: string;
      stableId: string;
      evidenceFingerprint: string;
    }) {
      const key = [
        input.businessId,
        input.stableId,
        input.evidenceFingerprint,
      ].join('|');
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      while (seen.size > boundedMaxEntries) {
        const oldestKey = seen.values().next().value;
        if (typeof oldestKey !== 'string') {
          break;
        }
        seen.delete(oldestKey);
      }
      return true;
    },
  };
}
