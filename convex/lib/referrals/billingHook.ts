import type { Id } from '../../_generated/dataModel';
import { evaluateReferralProgressInternal } from '../../businessReferralEngine';
import type { CanonicalBillingEventKind } from '../billing/canonicalEvent';
import { runRegisteredHandler } from '../runRegisteredHandler';

const PAID_CYCLE_EVENT_KINDS = new Set<CanonicalBillingEventKind>([
  'initial_payment',
  'renewal',
]);

/**
 * The referral engine still branches on its original purchase tokens.
 * Only a recorded paid cycle may use them. Every other canonical event stays
 * on the non-purchase progression path.
 */
function legacyReferralEventType(args: {
  eventKind: CanonicalBillingEventKind;
  recordsPaidServicePeriod: boolean;
}): string {
  if (
    !args.recordsPaidServicePeriod ||
    !PAID_CYCLE_EVENT_KINDS.has(args.eventKind)
  ) {
    return 'BILLING_UPDATE';
  }
  if (args.eventKind === 'initial_payment') {
    return 'INITIAL_PURCHASE';
  }
  return 'RENEWAL';
}

export async function evaluateReferralProgressFromBillingEvent(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    eventKind: CanonicalBillingEventKind;
    recordsPaidServicePeriod: boolean;
    eventId: string;
    providerEventAt?: number;
    plan?: string;
    period?: string | null;
    expirationAt?: number | null;
    isRevoked?: boolean;
    now: number;
  }
) {
  return await runRegisteredHandler(evaluateReferralProgressInternal, ctx, {
    businessId: args.businessId,
    eventType: legacyReferralEventType({
      eventKind: args.eventKind,
      recordsPaidServicePeriod: args.recordsPaidServicePeriod,
    }),
    eventId: args.eventId,
    plan: args.plan,
    period:
      args.period === 'yearly' || args.period === 'monthly'
        ? args.period
        : null,
    expirationAt: args.expirationAt,
    isRevoked: args.isRevoked,
    now: args.now,
  });
}
