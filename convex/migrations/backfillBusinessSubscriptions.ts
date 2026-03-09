import { mutation } from '../_generated/server';
import {
  DEFAULT_CUSTOMER_SEGMENTATION_CONFIG,
  normalizeCustomerSegmentationConfig,
} from '../business';

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
    const businesses = await ctx.db.query('businesses').collect();
    let patched = 0;

    for (const business of businesses) {
      const patch: Record<string, unknown> = {};

      if (
        business.subscriptionPlan !== 'starter' &&
        business.subscriptionPlan !== 'pro' &&
        business.subscriptionPlan !== 'premium'
      ) {
        patch.subscriptionPlan =
          business.subscriptionPlan === 'unlimited' ? 'premium' : 'starter';
      }

      if (
        business.subscriptionStatus !== 'active' &&
        business.subscriptionStatus !== 'trialing' &&
        business.subscriptionStatus !== 'past_due' &&
        business.subscriptionStatus !== 'canceled' &&
        business.subscriptionStatus !== 'inactive'
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

      const normalizedSegmentationConfig = normalizeCustomerSegmentationConfig(
        business.customerSegmentationConfig,
        now
      );
      const currentSegmentationConfig =
        business.customerSegmentationConfig &&
        typeof business.customerSegmentationConfig === 'object'
          ? (business.customerSegmentationConfig as Record<string, unknown>)
          : null;

      const hasSegmentationConfig =
        currentSegmentationConfig &&
        Number.isFinite(currentSegmentationConfig.riskDaysWithoutVisit) &&
        Number.isFinite(currentSegmentationConfig.frequentVisitsLast30Days) &&
        Number.isFinite(currentSegmentationConfig.dropPercentThreshold);

      if (!hasSegmentationConfig) {
        patch.customerSegmentationConfig = {
          ...DEFAULT_CUSTOMER_SEGMENTATION_CONFIG,
          updatedAt: now,
        };
      } else if (
        normalizedSegmentationConfig.riskDaysWithoutVisit !==
          Number(currentSegmentationConfig.riskDaysWithoutVisit) ||
        normalizedSegmentationConfig.frequentVisitsLast30Days !==
          Number(currentSegmentationConfig.frequentVisitsLast30Days) ||
        normalizedSegmentationConfig.dropPercentThreshold !==
          Number(currentSegmentationConfig.dropPercentThreshold)
      ) {
        patch.customerSegmentationConfig = normalizedSegmentationConfig;
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
