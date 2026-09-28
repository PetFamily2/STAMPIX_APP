import type { Id } from '../../_generated/dataModel';
import type {
  BillingPeriod,
  BusinessPlan,
  BusinessSubscriptionStatus,
} from './productionContract';

export type CanonicalBillingProvider = 'revenuecat' | 'payplus';

export type CanonicalBillingEventKind =
  | 'initial_payment'
  | 'renewal'
  | 'plan_change'
  | 'billing_issue'
  | 'recovery'
  | 'cancellation'
  | 'expiration'
  | 'refund'
  | 'pause';

export type TimestampFieldAction =
  | { kind: 'preserve' }
  | { kind: 'set'; value: number }
  | { kind: 'clear' };

export type RevokeFieldAction =
  | { kind: 'preserve' }
  | { kind: 'set'; value: number; reason: string }
  | { kind: 'clear' };

export type GraceFieldAction =
  | { kind: 'clear' }
  | { kind: 'set'; value: number | null };

/**
 * Provider-neutral event already verified and mapped by an adapter.
 * Field actions say whether a lifecycle column is written, cleared, or left
 * as stored. The canonical writer does not infer those effects from names.
 */
export type VerifiedBillingEvent = {
  provider: CanonicalBillingProvider;
  externalEventId: string;
  businessId: Id<'businesses'>;
  occurredAt: number;
  appliedAt: number;
  eventKind: CanonicalBillingEventKind;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  status: BusinessSubscriptionStatus;
  periodStartAt: number;
  periodEndAt: number | null;
  providerProductId: string | null;
  providerSubscriptionId: string | null;
  recordsPaidServicePeriod: boolean;
  revokesReferral: boolean;
  canceledAtAction: TimestampFieldAction;
  revokeAction: RevokeFieldAction;
  graceAction: GraceFieldAction;
};

export type RevenueCatMappedEvent = {
  eventId: string;
  eventType: string;
  businessId: Id<'businesses'>;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  purchasedAt?: number;
  expirationAt?: number | null;
  gracePeriodEndAt?: number | null;
  providerEventAt?: number;
  providerProductId?: string | null;
  providerSubscriptionId?: string | null;
  fallbackPeriodStartAt?: number | null;
  fallbackPeriodEndAt?: number | null;
  now: number;
};

const REVENUECAT_EVENT_KIND: Record<string, CanonicalBillingEventKind> = {
  INITIAL_PURCHASE: 'initial_payment',
  NON_RENEWING_PURCHASE: 'initial_payment',
  TRIAL_STARTED: 'initial_payment',
  RENEWAL: 'renewal',
  PRODUCT_CHANGE: 'plan_change',
  BILLING_ISSUE: 'billing_issue',
  UNCANCELLATION: 'recovery',
  SUBSCRIPTION_EXTENDED: 'recovery',
  REFUND_REVERSED: 'recovery',
  CANCELLATION: 'cancellation',
  EXPIRATION: 'expiration',
  REFUND: 'refund',
  SUBSCRIPTION_PAUSED: 'pause',
};

function revenueCatSubscriptionStatus(
  eventType: string
): BusinessSubscriptionStatus {
  if (eventType === 'TRIAL_STARTED') {
    return 'trialing';
  }
  if (eventType === 'BILLING_ISSUE') {
    return 'past_due';
  }
  if (eventType === 'CANCELLATION') {
    return 'canceled';
  }
  if (
    eventType === 'EXPIRATION' ||
    eventType === 'REFUND' ||
    eventType === 'SUBSCRIPTION_PAUSED'
  ) {
    return 'inactive';
  }
  return 'active';
}

function resolvePeriodStartAt(source: RevenueCatMappedEvent): number {
  if (typeof source.purchasedAt === 'number') {
    return source.purchasedAt;
  }
  if (typeof source.fallbackPeriodStartAt === 'number') {
    return source.fallbackPeriodStartAt;
  }
  return source.now;
}

function resolvePeriodEndAt(
  source: RevenueCatMappedEvent,
  revokesReferral: boolean
): number | null {
  const endAt =
    source.expirationAt === undefined
      ? (source.fallbackPeriodEndAt ?? null)
      : source.expirationAt;
  if (revokesReferral) {
    return endAt ?? source.now;
  }
  return endAt;
}

export function mapRevenueCatToCanonicalEvent(
  source: RevenueCatMappedEvent
): VerifiedBillingEvent {
  const eventKind = REVENUECAT_EVENT_KIND[source.eventType];
  if (!eventKind) {
    throw new Error('REVENUECAT_UNSUPPORTED_EVENT_TYPE');
  }

  const revokesReferral =
    source.eventType === 'EXPIRATION' || source.eventType === 'REFUND';
  const occurredAt = source.providerEventAt ?? source.now;

  return {
    provider: 'revenuecat',
    externalEventId: source.eventId,
    businessId: source.businessId,
    occurredAt,
    appliedAt: source.now,
    eventKind,
    plan: source.plan,
    billingPeriod: source.billingPeriod,
    status: revokesReferral
      ? 'inactive'
      : revenueCatSubscriptionStatus(source.eventType),
    periodStartAt: resolvePeriodStartAt(source),
    periodEndAt: resolvePeriodEndAt(source, revokesReferral),
    providerProductId: source.providerProductId ?? null,
    providerSubscriptionId: source.providerSubscriptionId ?? null,
    recordsPaidServicePeriod:
      source.eventType === 'INITIAL_PURCHASE' || source.eventType === 'RENEWAL',
    revokesReferral,
    canceledAtAction:
      source.eventType === 'CANCELLATION'
        ? { kind: 'set', value: source.now }
        : source.eventType === 'UNCANCELLATION'
          ? { kind: 'clear' }
          : { kind: 'preserve' },
    revokeAction: revokesReferral
      ? {
          kind: 'set',
          value: source.now,
          reason: eventKind,
        }
      : { kind: 'clear' },
    graceAction:
      source.eventType === 'BILLING_ISSUE'
        ? { kind: 'set', value: source.gracePeriodEndAt ?? null }
        : { kind: 'clear' },
  };
}
