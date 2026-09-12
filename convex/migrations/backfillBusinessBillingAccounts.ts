import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { ensureBusinessBillingAccount } from '../lib/billing/accounts';
import { resolveCanonicalBillingState } from '../lib/billing/lifecycle';

/**
 * Idempotent write-back for canonical business billing accounts.
 * Does NOT grant paid access without provider evidence.
 * Do not run on production from this task.
 */
export const backfillBusinessBillingAccounts = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const now = Date.now();
    const businesses = await ctx.db.query('businesses').collect();
    let created = 0;
    let skipped = 0;
    let inactivatedUnpaid = 0;
    for (const business of businesses) {
      const subscriptions = await ctx.db
        .query('subscriptions')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', business._id))
        .collect();
      const hasProviderEvidence = subscriptions.some(
        (row: any) => row.provider === 'revenuecat'
      );
      const existing = await ctx.db
        .query('businessBillingAccounts')
        .withIndex('by_businessId', (q: any) =>
          q.eq('businessId', business._id)
        )
        .first();
      if (existing) {
        skipped += 1;
        continue;
      }
      const state = resolveCanonicalBillingState({
        plan: business.subscriptionPlan,
        status: business.subscriptionStatus,
        currentPeriodEndAt: business.subscriptionEndAt,
        hasProviderEvidence,
      });
      if (dryRun === true) {
        created += 1;
        continue;
      }
      const account = await ensureBusinessBillingAccount(ctx, {
        businessId: business._id,
        ownerUserId: business.ownerUserId,
        now,
      });
      await ctx.db.patch(account._id, {
        plan: state.lastPlan ?? undefined,
        lastPlan: state.lastPlan ?? undefined,
        status: hasProviderEvidence && state.operationalAccess ? state.status : 'inactive',
        billingPeriod: state.billingPeriod,
        hasProviderEvidence,
        currentPeriodEndAt: business.subscriptionEndAt ?? null,
        updatedAt: now,
      });
      if (!hasProviderEvidence && business.subscriptionStatus !== 'inactive') {
        await ctx.db.patch(business._id, {
          subscriptionStatus: 'inactive',
          updatedAt: now,
        });
        inactivatedUnpaid += 1;
      }
      created += 1;
    }
    return { created, skipped, inactivatedUnpaid, dryRun: dryRun === true };
  },
});
