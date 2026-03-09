import type { Href } from 'expo-router';

export type UpgradeNavigationReason =
  | 'feature_locked'
  | 'limit_reached'
  | 'subscription_inactive';

type RequiredPlan = 'starter' | 'pro' | 'premium' | null;
type RecommendedPlan = 'pro' | 'premium';

type RouterLike = {
  push: (href: Href) => void;
};

type OpenSubscriptionComparisonOptions = {
  featureKey?: string;
  requiredPlan?: RequiredPlan;
  reason?: UpgradeNavigationReason;
  autoOpenUpgrade?: boolean;
};

const lockedInteractionCounts = new Map<string, number>();

function resolveRecommendedPlan(requiredPlan: RequiredPlan): RecommendedPlan {
  return requiredPlan === 'premium' ? 'premium' : 'pro';
}

function buildInteractionKey(
  featureKey: string | undefined,
  requiredPlan: RequiredPlan,
  reason: UpgradeNavigationReason | undefined
) {
  return [
    featureKey?.trim() || 'generic',
    requiredPlan || 'unknown',
    reason || 'feature_locked',
  ].join(':');
}

function recordLockedInteraction(
  featureKey: string | undefined,
  requiredPlan: RequiredPlan,
  reason: UpgradeNavigationReason | undefined
) {
  const key = buildInteractionKey(featureKey, requiredPlan, reason);
  const nextCount = (lockedInteractionCounts.get(key) ?? 0) + 1;
  lockedInteractionCounts.set(key, nextCount);
  return nextCount;
}

export function buildSubscriptionComparisonHref(
  options: OpenSubscriptionComparisonOptions = {}
): Href {
  const params: Record<string, string> = {
    focus: 'comparison',
    recommendedPlan: resolveRecommendedPlan(options.requiredPlan ?? null),
  };

  if (options.reason) {
    params.upgradeReason = options.reason;
  }

  const normalizedFeatureKey = options.featureKey?.trim();
  if (normalizedFeatureKey) {
    params.featureKey = normalizedFeatureKey;
  }

  if (options.autoOpenUpgrade) {
    params.autoOpenUpgrade = 'true';
  }

  return {
    pathname: '/(authenticated)/(business)/settings-business-subscription',
    params,
  };
}

export function openSubscriptionComparison(
  router: RouterLike,
  options: OpenSubscriptionComparisonOptions = {}
) {
  const interactionCount = recordLockedInteraction(
    options.featureKey,
    options.requiredPlan ?? null,
    options.reason
  );

  router.push(
    buildSubscriptionComparisonHref({
      ...options,
      autoOpenUpgrade: options.autoOpenUpgrade ?? interactionCount >= 2,
    })
  );
}
