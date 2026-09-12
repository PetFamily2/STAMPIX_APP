import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  ensureBusinessBillingAccount,
  getBillingAccountForBusiness,
} from './lib/billing/accounts';
import { requireActorHasBusinessCapability, requireCurrentUser } from './guards';

export const getBusinessBillingIdentity = query({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'manage_subscription'
    );
    const business = await ctx.db.get(businessId);
    if (!business) {
      return null;
    }
    const account = await getBillingAccountForBusiness(ctx, businessId);
    return {
      businessId,
      providerAppUserId: account?.providerAppUserId ?? null,
      hasProviderEvidence: account?.hasProviderEvidence === true,
      status: account?.status ?? business.subscriptionStatus ?? 'inactive',
      plan: account?.plan ?? business.subscriptionPlan ?? 'starter',
      billingPeriod: account?.billingPeriod ?? business.billingPeriod ?? null,
      currentPeriodEndAt:
        account?.currentPeriodEndAt ?? business.subscriptionEndAt ?? null,
      gracePeriodEndAt: account?.gracePeriodEndAt ?? null,
      canceledAt: account?.canceledAt ?? null,
    };
  },
});

export const ensureMyBusinessBillingIdentity = mutation({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    const user = await requireCurrentUser(ctx);
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'manage_subscription'
    );
    const business = await ctx.db.get(businessId);
    if (!business) {
      throw new Error('BUSINESS_NOT_FOUND');
    }
    const account = await ensureBusinessBillingAccount(ctx, {
      businessId,
      ownerUserId: business.ownerUserId ?? user._id,
    });
    return {
      providerAppUserId: account.providerAppUserId,
    };
  },
});
