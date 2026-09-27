import type { Id } from '../../_generated/dataModel';
import { evaluateReferralProgressFromBillingEvent } from '../referrals/billingHook';
import { markSmartManagerDirty } from '../smartManagerDirty';
import { getBillingAccountForBusiness } from './accounts';
import type { VerifiedBillingEvent } from './canonicalEvent';
import type {
  BusinessPlan,
  BusinessSubscriptionStatus,
} from './productionContract';

export type ApplyVerifiedBillingEventResult =
  | {
      applied: true;
      businessId: Id<'businesses'>;
      plan: BusinessPlan;
      status: BusinessSubscriptionStatus;
    }
  | {
      applied: false;
      reason: 'stale_event';
      businessId: Id<'businesses'>;
    };

/**
 * Applies one already-verified, already-deduped billing event.
 * Provider authentication, payload parsing, and provider event logs stay in
 * the adapter. Paid service periods stay inside the existing referral hook.
 */
export async function applyVerifiedBillingEvent(
  ctx: any,
  event: VerifiedBillingEvent
): Promise<ApplyVerifiedBillingEventResult> {
  const billingAccount = await getBillingAccountForBusiness(
    ctx,
    event.businessId
  );
  if (!billingAccount) {
    throw new Error('BILLING_ACCOUNT_REQUIRED');
  }

  const lastEventAt = Number(billingAccount.lastProviderEventAt ?? 0);
  if (lastEventAt > 0 && event.occurredAt < lastEventAt) {
    return {
      applied: false,
      reason: 'stale_event',
      businessId: event.businessId,
    };
  }

  const canceledAt =
    event.canceledAtAction.kind === 'set'
      ? event.canceledAtAction.value
      : event.canceledAtAction.kind === 'clear'
        ? null
        : billingAccount.canceledAt;
  const entitlementRevokedAt =
    event.revokeAction.kind === 'set'
      ? event.revokeAction.value
      : event.revokeAction.kind === 'clear'
        ? undefined
        : billingAccount.entitlementRevokedAt;
  const revokeReason =
    event.revokeAction.kind === 'set'
      ? event.revokeAction.reason
      : event.revokeAction.kind === 'clear'
        ? undefined
        : billingAccount.revokeReason;

  await ctx.db.patch(billingAccount._id, {
    plan: event.plan,
    lastPlan: event.plan,
    status: event.status,
    billingPeriod: event.billingPeriod,
    provider: event.provider,
    providerProductId: event.providerProductId ?? undefined,
    providerSubscriptionIdentifier: event.providerSubscriptionId ?? undefined,
    subscriptionStartAt: event.periodStartAt,
    currentPeriodStartAt: event.periodStartAt,
    currentPeriodEndAt: event.periodEndAt,
    gracePeriodEndAt:
      event.graceAction.kind === 'clear' ? null : event.graceAction.value,
    canceledAt,
    entitlementRevokedAt,
    revokeReason,
    lastProviderEventAt: event.occurredAt,
    lastProviderEventId: event.externalEventId,
    hasProviderEvidence: true,
    updatedAt: event.appliedAt,
  });

  await ctx.db.patch(event.businessId, {
    subscriptionPlan: event.plan,
    subscriptionStatus: event.status,
    subscriptionStartAt: event.periodStartAt,
    subscriptionEndAt: event.periodEndAt,
    billingPeriod: event.billingPeriod,
    updatedAt: event.appliedAt,
  });

  await evaluateReferralProgressFromBillingEvent(ctx, {
    businessId: event.businessId,
    eventKind: event.eventKind,
    recordsPaidServicePeriod: event.recordsPaidServicePeriod,
    eventId: event.externalEventId,
    providerEventAt: event.occurredAt,
    plan: event.plan,
    period: event.billingPeriod,
    expirationAt: event.periodEndAt,
    isRevoked: event.revokesReferral,
    now: event.appliedAt,
  });

  await markSmartManagerDirty(ctx, {
    businessId: event.businessId,
    domains: ['entitlements', 'team'],
    reasons: ['subscription_state_changed'],
    now: event.appliedAt,
  });

  return {
    applied: true,
    businessId: event.businessId,
    plan: event.plan,
    status: event.status,
  };
}
