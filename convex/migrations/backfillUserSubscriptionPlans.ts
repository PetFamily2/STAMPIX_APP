import { mutation } from '../_generated/server';

/**
 * Backfill legacy user subscription plans to canonical values.
 *
 * Run with:
 *   bunx convex run migrations/backfillUserSubscriptionPlans
 */
export default mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const now = Date.now();
    let patched = 0;

    for (const user of users) {
      const currentPlan = user.subscriptionPlan as unknown;
      let nextPlan: 'starter' | 'pro' | 'premium' | null = null;

      if (currentPlan === 'free') {
        nextPlan = 'starter';
      } else if (currentPlan === 'unlimited') {
        nextPlan = 'premium';
      } else if (
        currentPlan !== undefined &&
        currentPlan !== 'starter' &&
        currentPlan !== 'pro' &&
        currentPlan !== 'premium'
      ) {
        nextPlan = 'starter';
      }

      if (!nextPlan) {
        continue;
      }

      await ctx.db.patch(user._id, {
        subscriptionPlan: nextPlan,
        userType: nextPlan === 'starter' ? 'free' : 'paid',
        subscriptionUpdatedAt: now,
        updatedAt: now,
      });

      patched += 1;
    }

    return {
      total: users.length,
      patched,
    };
  },
});
