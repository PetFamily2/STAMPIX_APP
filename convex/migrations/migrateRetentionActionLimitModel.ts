import { mutation } from '../_generated/server';

/**
 * Migration for concurrent retention-action limits.
 *
 * Run with:
 *   bunx convex run migrations/migrateRetentionActionLimitModel
 */
export default mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const businesses = await ctx.db.query('businesses').collect();
    const campaigns = await ctx.db.query('campaigns').collect();

    let businessesPatched = 0;
    let campaignsPatched = 0;

    for (const business of businesses) {
      const hasMonthlyFields =
        Object.hasOwn(business, 'aiCampaignsUsedThisMonth') ||
        Object.hasOwn(business, 'aiCampaignsMonthKey');

      if (!hasMonthlyFields) {
        continue;
      }

      const cleanupPatch: Record<string, unknown> = {
        updatedAt: now,
      };
      cleanupPatch.aiCampaignsUsedThisMonth = undefined;
      cleanupPatch.aiCampaignsMonthKey = undefined;
      await ctx.db.patch(business._id, cleanupPatch as any);
      businessesPatched += 1;
    }

    for (const campaign of campaigns) {
      if ((campaign.status as unknown) !== 'sent') {
        continue;
      }

      await ctx.db.patch(campaign._id, {
        status: 'completed',
        updatedAt: now,
      });
      campaignsPatched += 1;
    }

    return {
      totalBusinesses: businesses.length,
      businessesPatched,
      totalCampaigns: campaigns.length,
      campaignsPatched,
    };
  },
});
