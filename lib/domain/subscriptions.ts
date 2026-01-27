// ============================================================================
// Subscription plan helpers
// ============================================================================

export type SubscriptionPlan = 'free' | 'pro' | 'unlimited';

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  'free',
  'pro',
  'unlimited',
];

export const SUBSCRIPTION_PLAN_ORDER: Record<SubscriptionPlan, number> = {
  free: 0,
  pro: 1,
  unlimited: 2,
};

export const SUBSCRIPTION_PLAN_LABELS: Record<SubscriptionPlan, string> = {
  free: 'חינמי',
  pro: 'Pro',
  unlimited: 'Unlimited',
};

export function canAccessAdvancedFeatures(plan: SubscriptionPlan): boolean {
  return plan !== 'free';
}

export function isUnlimitedPlan(plan: SubscriptionPlan): boolean {
  return plan === 'unlimited';
}

export function bestPlan(
  first: SubscriptionPlan,
  second: SubscriptionPlan
): SubscriptionPlan {
  return SUBSCRIPTION_PLAN_ORDER[first] >= SUBSCRIPTION_PLAN_ORDER[second]
    ? first
    : second;
}

const PLAN_KEYWORDS: Omit<Record<SubscriptionPlan, RegExp>, 'free'> = {
  pro: /\b(pro|premium)\b/i,
  unlimited: /\bunlimited\b/i,
};

export function planFromRevenueCatEntitlements(
  entitlements?: Record<string, unknown>
): SubscriptionPlan {
  const activeEntitlements = Object.keys(entitlements ?? {});
  if (activeEntitlements.some((id) => PLAN_KEYWORDS.unlimited.test(id))) {
    return 'unlimited';
  }
  if (activeEntitlements.some((id) => PLAN_KEYWORDS.pro.test(id))) {
    return 'pro';
  }
  return 'free';
}

export function planFromRevenueCatSubscriber(
  subscriber: any
): SubscriptionPlan {
  return planFromRevenueCatEntitlements(subscriber?.entitlements?.active);
}

export function getPrimaryProductIdFromSubscriber(
  subscriber: any
): string | undefined {
  const active = subscriber?.entitlements?.active;
  if (!active) return undefined;
  const firstEntry = Object.values(active)[0] as
    | { product_identifier?: string }
    | undefined;
  return firstEntry?.product_identifier;
}
