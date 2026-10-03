import type { Id } from '../../_generated/dataModel';
import { createProviderAppUserId, isUsableProviderAppUserId } from './identity';
import {
  GENERAL_FREE_TRIAL_MS,
  GENERAL_FREE_TRIAL_PLAN,
  MVP_FEATURE_FLAGS,
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

  const id = await ctx.db.insert('businessBillingAccounts', {
    businessId: args.businessId,
    ownerUserId: args.ownerUserId,
    providerAppUserId,
    plan: undefined,
    lastPlan: undefined,
    status: 'inactive',
    billingPeriod: null,
    hasProviderEvidence: false,
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.get(id);
}


export async function startBusinessOnboardingTrial(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    ownerUserId: Id<'users'>;
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  const account = await ensureBusinessBillingAccount(ctx, {
    businessId: args.businessId,
    ownerUserId: args.ownerUserId,
    now,
  });

  if (!MVP_FEATURE_FLAGS.generalFreeTrialEnabled) {
    return { started: false as const, reason: 'disabled' as const, account };
  }
  if (typeof account?.trialStartedAt === 'number') {
    return { started: false as const, reason: 'already_started' as const, account };
  }
  if (account?.hasProviderEvidence === true) {
    return {
      started: false as const,
      reason: 'provider_evidence_exists' as const,
      account,
    };
  }

  const trialEndAt = now + GENERAL_FREE_TRIAL_MS;
  await ctx.db.patch(account._id, {
    plan: GENERAL_FREE_TRIAL_PLAN,
    lastPlan: GENERAL_FREE_TRIAL_PLAN,
    status: 'trialing',
    billingPeriod: null,
    subscriptionStartAt: now,
    currentPeriodStartAt: now,
    currentPeriodEndAt: trialEndAt,
    trialStartedAt: now,
    trialEndAt,
    trialSource: 'business_onboarding',
    updatedAt: now,
  });
  await ctx.db.patch(args.businessId, {
    subscriptionPlan: GENERAL_FREE_TRIAL_PLAN,
    subscriptionStatus: 'trialing',
    subscriptionStartAt: now,
    subscriptionEndAt: trialEndAt,
    billingPeriod: null,
    updatedAt: now,
  });

  return {
    started: true as const,
    reason: 'started' as const,
    trialStartedAt: now,
    trialEndAt,
    plan: GENERAL_FREE_TRIAL_PLAN,
  };
}
