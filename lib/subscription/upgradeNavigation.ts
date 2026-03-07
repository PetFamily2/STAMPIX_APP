import type { Href } from 'expo-router';

export type UpgradeNavigationReason =
  | 'feature_locked'
  | 'limit_reached'
  | 'subscription_inactive';

type RequiredPlan = 'starter' | 'pro' | 'unlimited' | null | undefined;

type RouterLike = {
  push: (href: Href) => void;
};

type OpenSubscriptionComparisonOptions = {
  featureKey?: string;
  requiredPlan?: RequiredPlan;
  reason?: UpgradeNavigationReason;
};

function resolveRecommendedPlan(
  requiredPlan: RequiredPlan
): 'pro' | 'unlimited' {
  return requiredPlan === 'unlimited' ? 'unlimited' : 'pro';
}

export function buildSubscriptionComparisonHref(
  options: OpenSubscriptionComparisonOptions = {}
): Href {
  const params: Record<string, string> = {
    focus: 'comparison',
    recommendedPlan: resolveRecommendedPlan(options.requiredPlan),
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
