import { mutation } from '../_generated/server';

/**
 * Backfill loyalty program lifecycle fields for status-based rules.
 *
 * Run with:
 *   bunx convex run migrations/backfillLoyaltyProgramLifecycle
 */
export default mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const programs = await ctx.db.query('loyaltyPrograms').collect();
    let patched = 0;

    for (const program of programs) {
      const patch: Record<string, unknown> = {};

      const status =
        program.status === 'draft' ||
        program.status === 'active' ||
        program.status === 'archived'
          ? program.status
          : program.isArchived === true
            ? 'archived'
            : 'active';

      if (program.status !== status) {
        patch.status = status;
      }

      const shouldBeArchived = status === 'archived';
      if (program.isArchived !== shouldBeArchived) {
        patch.isArchived = shouldBeArchived;
      }

      if (status === 'active' || status === 'archived') {
        if (typeof program.publishedAt !== 'number') {
          patch.publishedAt = program.createdAt ?? now;
        }
      } else if (program.publishedAt !== undefined) {
        patch.publishedAt = undefined;
      }

      if (Object.keys(patch).length > 0) {
        patch.updatedAt = now;
        await ctx.db.patch(program._id, patch);
        patched += 1;
      }
    }

    return {
      total: programs.length,
      patched,
    };
  },
});
