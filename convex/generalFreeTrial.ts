import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

const DEFAULT_EXPIRY_LIMIT = 25;
const MAX_EXPIRY_LIMIT = 100;

export const expireGeneralFreeTrialsInternal = internalMutation({
  args: { limit: v.optional(v.number()), now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const limit = Math.max(
      1,
      Math.min(Math.floor(args.limit ?? DEFAULT_EXPIRY_LIMIT), MAX_EXPIRY_LIMIT)
    );
    const due = await ctx.db
      .query('businessBillingAccounts')
      .withIndex('by_trialSource_trialEndsAt', (q) =>
        q.eq('trialSource', 'stampaix').lte('trialEndsAt', now)
      )
      .take(limit);

    let expired = 0;
    for (const account of due) {
      if (account.status !== 'trialing') {
        continue;
      }
      const trialEndsAt = account.trialEndsAt;
      if (typeof trialEndsAt !== 'number' || trialEndsAt > now) {
        continue;
      }

      await ctx.db.patch(account._id, {
        status: 'inactive',
        currentPeriodEndAt: trialEndsAt,
        updatedAt: now,
      });

      const business = await ctx.db.get(account.businessId);
      if (business && business.subscriptionStatus === 'trialing') {
        await ctx.db.patch(business._id, {
          subscriptionStatus: 'inactive',
          subscriptionEndAt: trialEndsAt,
          updatedAt: now,
        });
      }
      expired += 1;
    }

    return { scanned: due.length, expired };
  },
});
