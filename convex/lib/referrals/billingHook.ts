import type { Id } from '../../_generated/dataModel';
import { runRegisteredHandler } from '../runRegisteredHandler';
import { evaluateReferralProgressInternal } from '../../businessReferralEngine';

export async function evaluateReferralProgressFromBillingEvent(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    eventType: string;
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
    eventType: args.eventType,
    eventId: args.eventId,
    plan: args.plan,
    period: args.period === 'yearly' || args.period === 'monthly' ? args.period : null,
    expirationAt: args.expirationAt,
    isRevoked: args.isRevoked,
    now: args.now,
  });
}
