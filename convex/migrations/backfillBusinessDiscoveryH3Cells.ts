import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';
import { getDiscoveryH3Cell } from '../lib/discoveryGeo';

const BATCH_SIZE = 100;
const READINESS_KEY = 'business_discovery_h3_r5_v1' as const;
const backfillRef = makeFunctionReference<
  'mutation',
  { cursor?: string },
  { isDone: boolean }
>(
  'migrations/backfillBusinessDiscoveryH3Cells:backfillBusinessDiscoveryH3Cells'
);

const verifyRef = makeFunctionReference<
  'mutation',
  { generation: number; cursor?: string },
  { status: string }
>('migrations/backfillBusinessDiscoveryH3Cells:verifyBusinessDiscoveryH3Batch');

/** Operator-initiated only, after all location writers maintain the H3 cell. */
export const startBusinessDiscoveryH3Verification = internalMutation({
  args: {},
  returns: v.object({ generation: v.number() }),
  handler: async (ctx) => {
    const state = await ctx.db
      .query('discoveryH3Readiness')
      .withIndex('by_key', (q) => q.eq('key', READINESS_KEY))
      .unique();
    const generation = (state?.generation ?? 0) + 1;
    const values = {
      generation,
      status: 'checking' as const,
      cursor: undefined,
      scanned: 0,
      mismatched: 0,
      startedAt: Date.now(),
      verifiedAt: undefined,
    };
    if (state) await ctx.db.patch(state._id, values);
    else
      await ctx.db.insert('discoveryH3Readiness', {
        key: READINESS_KEY,
        ...values,
      });
    await ctx.scheduler.runAfter(0, verifyRef, { generation });
    return { generation };
  },
});

/** Cursor and generation make repeated or stale continuation jobs harmless. */
export const verifyBusinessDiscoveryH3Batch = internalMutation({
  args: { generation: v.number(), cursor: v.optional(v.string()) },
  returns: v.object({
    status: v.union(
      v.literal('stale'),
      v.literal('checking'),
      v.literal('ready'),
      v.literal('failed')
    ),
  }),
  handler: async (
    ctx,
    { generation, cursor }
  ): Promise<{ status: 'stale' | 'checking' | 'ready' | 'failed' }> => {
    const state = await ctx.db
      .query('discoveryH3Readiness')
      .withIndex('by_key', (q) => q.eq('key', READINESS_KEY))
      .unique();
    if (
      !state ||
      state.status !== 'checking' ||
      state.generation !== generation ||
      state.cursor !== cursor
    ) {
      return { status: 'stale' };
    }
    const page = await ctx.db
      .query('businesses')
      .paginate({ cursor: cursor ?? null, numItems: BATCH_SIZE });
    let mismatched = state.mismatched;
    for (const business of page.page) {
      const expected = business.location
        ? getDiscoveryH3Cell(business.location)
        : null;
      if (
        business.location &&
        (!expected || business.discoveryH3R5 !== expected)
      )
        mismatched++;
    }
    const scanned = state.scanned + page.page.length;
    if (page.isDone) {
      await ctx.db.patch(state._id, {
        status: mismatched === 0 ? 'ready' : 'failed',
        cursor: undefined,
        scanned,
        mismatched,
        verifiedAt: mismatched === 0 ? Date.now() : undefined,
      });
      return {
        status: mismatched === 0 ? ('ready' as const) : ('failed' as const),
      };
    }
    await ctx.db.patch(state._id, {
      cursor: page.continueCursor,
      scanned,
      mismatched,
    });
    await ctx.scheduler.runAfter(0, verifyRef, {
      generation,
      cursor: page.continueCursor,
    });
    return { status: 'checking' };
  },
});

export const getBusinessDiscoveryH3Readiness = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      generation: v.number(),
      status: v.union(
        v.literal('checking'),
        v.literal('failed'),
        v.literal('ready')
      ),
      scanned: v.number(),
      mismatched: v.number(),
      startedAt: v.number(),
      verifiedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx) => {
    const state = await ctx.db
      .query('discoveryH3Readiness')
      .withIndex('by_key', (q) => q.eq('key', READINESS_KEY))
      .unique();
    if (!state) return null;
    return {
      generation: state.generation,
      status: state.status,
      scanned: state.scanned,
      mismatched: state.mismatched,
      startedAt: state.startedAt,
      verifiedAt: state.verifiedAt,
    };
  },
});

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
