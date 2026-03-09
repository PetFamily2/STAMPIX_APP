export type SubscriptionPlan = 'starter' | 'pro' | 'premium';

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  'starter',
  'pro',
  'premium',
];

export const SUBSCRIPTION_PLAN_ORDER: Record<SubscriptionPlan, number> = {
  starter: 0,
  pro: 1,
  premium: 2,
};

export const SUBSCRIPTION_PLAN_LABELS: Record<SubscriptionPlan, string> = {
  starter: 'Starter',
  pro: 'Pro AI',
  premium: 'Premium AI',
};

export function canAccessAdvancedFeatures(plan: SubscriptionPlan): boolean {
  return plan !== 'starter';
}

export function isPremiumPlan(plan: SubscriptionPlan): boolean {
  return plan === 'premium';
}

export function bestPlan(
  first: SubscriptionPlan,
  second: SubscriptionPlan
): SubscriptionPlan {
  return SUBSCRIPTION_PLAN_ORDER[first] >= SUBSCRIPTION_PLAN_ORDER[second]
    ? first
    : second;
}

const PLAN_KEYWORDS: Omit<Record<SubscriptionPlan, RegExp>, 'starter'> = {
  pro: /\bpro\b/i,
  premium: /\bpremium\b/i,
};

export function planFromRevenueCatEntitlements(
  entitlements?: Record<string, unknown>
): SubscriptionPlan {
  const activeEntitlements = Object.keys(entitlements ?? {});
  if (activeEntitlements.some((id) => PLAN_KEYWORDS.premium.test(id))) {
    return 'premium';
  }
  if (activeEntitlements.some((id) => PLAN_KEYWORDS.pro.test(id))) {
    return 'pro';
  }
  return 'starter';
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
