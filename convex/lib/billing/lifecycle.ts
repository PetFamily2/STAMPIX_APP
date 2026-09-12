import type {
  BillingPeriod,
  BusinessPlan,
  BusinessSubscriptionStatus,
} from './productionContract';
import { isBillingPeriod, isBusinessPlan } from './productionContract';

export type CanonicalBillingState = {
  plan: BusinessPlan | null;
  lastPlan: BusinessPlan | null;
  status: BusinessSubscriptionStatus;
  billingPeriod: BillingPeriod | null;
  subscriptionStartAt: number | null;
  currentPeriodStartAt: number | null;
  currentPeriodEndAt: number | null;
  gracePeriodEndAt: number | null;
  canceledAt: number | null;
  hasProviderEvidence: boolean;
  isSubscriptionActive: boolean;
  operationalAccess: boolean;
};

const ACTIVE_LIKE_STATUSES: BusinessSubscriptionStatus[] = [
  'active',
  'trialing',
];

export function normalizeBusinessPlan(value: unknown): BusinessPlan | null {
  if (value === 'premium' || value === 'unlimited') {
    return 'premium';
  }
  if (value === 'pro') {
    return 'pro';
  }
  if (value === 'starter') {
    return 'starter';
  }
  if (value === 'free') {
    return 'starter';
  }
  return isBusinessPlan(value) ? value : null;
}

export function normalizeBillingPeriod(value: unknown): BillingPeriod | null {
  return isBillingPeriod(value) ? value : null;
}

export function normalizeSubscriptionStatus(
  value: unknown
): BusinessSubscriptionStatus | null {
  if (
    value === 'active' ||
    value === 'trialing' ||
    value === 'past_due' ||
    value === 'canceled' ||
    value === 'inactive'
  ) {
    return value;
  }
  if (value === 'cancelled') {
    return 'canceled';
  }
  return null;
}

export function hasOperationalAccessFromStatus(args: {
  status: BusinessSubscriptionStatus;
  hasProviderEvidence: boolean;
  currentPeriodEndAt: number | null;
  gracePeriodEndAt: number | null;
  entitlementRevokedAt?: number | null;
  now?: number;
}): boolean {
  const now = args.now ?? Date.now();
  if (!args.hasProviderEvidence) {
    return false;
  }
  if (typeof args.entitlementRevokedAt === 'number') {
    return false;
  }
  if (args.status === 'inactive') {
    return false;
  }
  if (ACTIVE_LIKE_STATUSES.includes(args.status)) {
    return true;
  }
  if (args.status === 'canceled') {
    return (
      typeof args.currentPeriodEndAt === 'number' &&
      args.currentPeriodEndAt > now
    );
  }
  if (args.status === 'past_due') {
    return (
      typeof args.gracePeriodEndAt === 'number' && args.gracePeriodEndAt > now
    );
  }
  return false;
}

export function resolveCanonicalBillingState(args: {
  plan?: unknown;
  lastPlan?: unknown;
  status?: unknown;
  billingPeriod?: unknown;
  subscriptionStartAt?: number | null;
  currentPeriodStartAt?: number | null;
  currentPeriodEndAt?: number | null;
  gracePeriodEndAt?: number | null;
  canceledAt?: number | null;
  hasProviderEvidence?: boolean;
  entitlementRevokedAt?: number | null;
  now?: number;
}): CanonicalBillingState {
  const plan = normalizeBusinessPlan(args.plan);
  const lastPlan = normalizeBusinessPlan(args.lastPlan) ?? plan;
  const status = normalizeSubscriptionStatus(args.status) ?? 'inactive';
  const hasProviderEvidence = args.hasProviderEvidence === true;
  const operationalAccess = hasOperationalAccessFromStatus({
    status,
    hasProviderEvidence,
    currentPeriodEndAt: args.currentPeriodEndAt ?? null,
    gracePeriodEndAt: args.gracePeriodEndAt ?? null,
    entitlementRevokedAt: args.entitlementRevokedAt ?? null,
    now: args.now,
  });

  return {
    plan: lastPlan,
    lastPlan,
    status: operationalAccess || hasProviderEvidence ? status : 'inactive',
    billingPeriod: normalizeBillingPeriod(args.billingPeriod),
    subscriptionStartAt: args.subscriptionStartAt ?? null,
    currentPeriodStartAt: args.currentPeriodStartAt ?? null,
    currentPeriodEndAt: args.currentPeriodEndAt ?? null,
    gracePeriodEndAt: args.gracePeriodEndAt ?? null,
    canceledAt: args.canceledAt ?? null,
    hasProviderEvidence,
    isSubscriptionActive: operationalAccess,
    operationalAccess,
  };
}

export function shouldTreatLegacyStarterAsPaid(args: {
  plan?: unknown;
  status?: unknown;
  hasProviderEvidence?: boolean;
}): boolean {
  return (
    args.hasProviderEvidence === true &&
    normalizeBusinessPlan(args.plan) === 'starter' &&
    (args.status === 'active' || args.status === 'trialing')
  );
}
