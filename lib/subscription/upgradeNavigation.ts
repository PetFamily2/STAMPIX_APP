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
};

function resolveRecommendedPlan(requiredPlan: RequiredPlan): RecommendedPlan {
  return requiredPlan === 'premium' ? 'premium' : 'pro';
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

  return {
    pathname: '/(authenticated)/(business)/settings-business-subscription',
    params,
  };
}

export function openSubscriptionComparison(
  router: RouterLike,
  options: OpenSubscriptionComparisonOptions = {}
) {
  router.push(buildSubscriptionComparisonHref(options));
}
