import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { mutation } from '../_generated/server';
import { normalizeSegmentRules } from '../segments';

/**
 * Segment migration:
 * Converts legacy `customerStatus` conditions into canonical
 * `customerState` / `customerValueTier` conditions.
 *
 * Run with:
 *   bunx convex run migrations/migrateLegacySegmentCustomerStatus
 *   bunx convex run migrations/migrateLegacySegmentCustomerStatus '{"dryRun":true}'
 *   bunx convex run migrations/migrateLegacySegmentCustomerStatus '{"businessId":"<id>"}'
 */

function hasLegacyCustomerStatusField(rules: unknown): boolean {
  if (!rules || typeof rules !== 'object') {
    return false;
  }
  const rawConditions = (rules as Record<string, unknown>).conditions;
  if (!Array.isArray(rawConditions)) {
    return false;
  }
  return rawConditions.some((condition) => {
    if (!condition || typeof condition !== 'object') {
      return false;
    }
    return (condition as Record<string, unknown>).field === 'customerStatus';
  });
}

export default mutation({
  args: {
    businessId: v.optional(v.id('businesses')),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { businessId, dryRun }) => {
    const isDryRun = dryRun === true;
    const now = Date.now();

    const segments = businessId
      ? await ctx.db
          .query('segments')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .collect()
      : await ctx.db.query('segments').collect();

    let scanned = 0;
    let converted = 0;
    const sampleSegmentIds: Array<Id<'segments'>> = [];

    for (const segment of segments) {
      scanned += 1;
      if (!hasLegacyCustomerStatusField(segment.rules)) {
        continue;
      }

      const normalizedRules = normalizeSegmentRules(segment.rules);
      converted += 1;
      if (sampleSegmentIds.length < 50) {
        sampleSegmentIds.push(segment._id);
      }

      if (isDryRun) {
        continue;
      }

      await ctx.db.patch(segment._id, {
        rules: normalizedRules,
        updatedAt: now,
      });
    }

    return {
      businessId: businessId ?? null,
      dryRun: isDryRun,
      scanned,
      converted,
      sampleSegmentIds,
    };
  },
});
