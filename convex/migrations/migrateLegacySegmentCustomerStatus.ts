import { v } from 'convex/values';
import { mutation } from '../_generated/server';

/**
 * Historical migration retained for auditability.
 *
 * This migration converted legacy `customerStatus` segment rules into
 * canonical `customerState` / `customerValueTier` rules while the manual
 * segment system still existed.
 *
 * The manual segment system has since been removed from the MVP, so this file
 * remains only as an archived artifact and no longer mutates data.
 */
export default mutation({
  args: {
    businessId: v.optional(v.id('businesses')),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (_ctx, { businessId, dryRun }) => {
    return {
      businessId: businessId ?? null,
      dryRun: dryRun === true,
      archived: true,
      migratedAtRuntime: false,
      message:
        'Historical migration retained for reference only. Manual segments are no longer supported.',
    };
  },
});
