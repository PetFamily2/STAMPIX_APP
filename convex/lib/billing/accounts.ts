import type { Id } from '../../_generated/dataModel';
import { createProviderAppUserId, isUsableProviderAppUserId } from './identity';
import {
  GENERAL_FREE_TRIAL_PLAN,
  MVP_FEATURE_FLAGS,
  getGeneralFreeTrialEnd,
} from './productionContract';

export async function getBillingAccountForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  return await ctx.db
    .query('businessBillingAccounts')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .first();
}

export async function getBillingAccountByProviderAppUserId(
  ctx: any,
  providerAppUserId: string
) {
  return await ctx.db
    .query('businessBillingAccounts')
    .withIndex('by_providerAppUserId', (q: any) =>
      q.eq('providerAppUserId', providerAppUserId)
    )
    .first();
}

export async function ensureBusinessBillingAccount(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    ownerUserId: Id<'users'>;
    preferredProviderAppUserId?: string | null;
    startGeneralFreeTrial?: boolean;
    now?: number;
  }
) {
  const existing = await getBillingAccountForBusiness(ctx, args.businessId);
  if (existing) {
    return existing;
  }

  const now = args.now ?? Date.now();
  const providerAppUserId = isUsableProviderAppUserId(
    args.preferredProviderAppUserId
  )
    ? String(args.preferredProviderAppUserId)
    : createProviderAppUserId();

  const startsTrial =
    args.startGeneralFreeTrial === true &&
    MVP_FEATURE_FLAGS.generalFreeTrialEnabled;
  const trialEndsAt = startsTrial ? getGeneralFreeTrialEnd(now) : undefined;

  const id = await ctx.db.insert('businessBillingAccounts', {
    businessId: args.businessId,
    ownerUserId: args.ownerUserId,
    providerAppUserId,
    plan: startsTrial ? GENERAL_FREE_TRIAL_PLAN : undefined,
    lastPlan: startsTrial ? GENERAL_FREE_TRIAL_PLAN : undefined,
    status: startsTrial ? 'trialing' : 'inactive',
    billingPeriod: null,
    subscriptionStartAt: startsTrial ? now : undefined,
    currentPeriodStartAt: startsTrial ? now : undefined,
    currentPeriodEndAt: trialEndsAt,
    trialSource: startsTrial ? 'stampaix' : undefined,
    trialStartedAt: startsTrial ? now : undefined,
    trialEndsAt,
    hasProviderEvidence: false,
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.get(id);
}
