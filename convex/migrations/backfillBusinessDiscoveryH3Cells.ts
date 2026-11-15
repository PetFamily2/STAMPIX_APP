import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { getDiscoveryH3Cell } from '../lib/discoveryGeo';

const BATCH_SIZE = 100;
const backfillRef = makeFunctionReference<
  'mutation',
  { cursor?: string },
  { isDone: boolean }
>(
  'migrations/backfillBusinessDiscoveryH3Cells:backfillBusinessDiscoveryH3Cells'
);

/**
 * Deployment creates the optional field/index first. Invoke this internal
 * migration only in an approved isolated environment; it is idempotent and
 * schedules its own continuation after a committed batch.
 */
export const backfillBusinessDiscoveryH3Cells = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('businesses').paginate({
      cursor: cursor ?? null,
      numItems: BATCH_SIZE,
    });
    let patched = 0;
    let skipped = 0;
    for (const business of page.page) {
      const location = business.location;
      const cell = location ? getDiscoveryH3Cell(location) : null;
      if (!cell) {
        skipped += 1;
        continue;
      }
      if (business.discoveryH3R5 !== cell) {
        await ctx.db.patch(business._id, { discoveryH3R5: cell });
        patched += 1;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, backfillRef, {
        cursor: page.continueCursor,
      });
    }
    return {
      scanned: page.page.length,
      patched,
      skipped,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});
