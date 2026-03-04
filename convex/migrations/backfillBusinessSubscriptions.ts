import { mutation } from '../_generated/server';
import { getCurrentMonthKey } from '../entitlements';

/**
 * Backfill missing business subscription defaults.
 *
 * Run with:
 *   bunx convex run migrations/backfillBusinessSubscriptions
 */
export default mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const monthKey = getCurrentMonthKey(now);
    const businesses = await ctx.db.query('businesses').collect();
    let patched = 0;

    for (const business of businesses) {
      const patch: Record<string, unknown> = {};

      if (
        business.subscriptionPlan !== 'starter' &&
        business.subscriptionPlan !== 'pro' &&
        business.subscriptionPlan !== 'unlimited'
      ) {
        patch.subscriptionPlan = 'starter';
      }

      if (
        business.subscriptionStatus !== 'active' &&
        business.subscriptionStatus !== 'trialing' &&
        business.subscriptionStatus !== 'past_due' &&
        business.subscriptionStatus !== 'canceled'
      ) {
        patch.subscriptionStatus = 'active';
      }

      if (typeof business.subscriptionStartAt !== 'number') {
        patch.subscriptionStartAt = now;
      }

      if (
        business.subscriptionEndAt !== null &&
        typeof business.subscriptionEndAt !== 'number'
      ) {
        patch.subscriptionEndAt = null;
      }

      if (
        business.billingPeriod !== 'monthly' &&
        business.billingPeriod !== 'yearly' &&
        business.billingPeriod !== null
      ) {
        patch.billingPeriod = null;
      }

      if (!Number.isFinite(business.aiCampaignsUsedThisMonth)) {
        patch.aiCampaignsUsedThisMonth = 0;
      }

      if (
        typeof business.aiCampaignsMonthKey !== 'string' ||
        business.aiCampaignsMonthKey.trim().length === 0
      ) {
        patch.aiCampaignsMonthKey = monthKey;
      }

      if (Object.keys(patch).length > 0) {
        patch.updatedAt = now;
        await ctx.db.patch(business._id, patch);
        patched += 1;
      }
    }

    return {
      total: businesses.length,
      patched,
    };
  },
});
