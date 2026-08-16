import { v } from 'convex/values';

import { internalMutation } from '../_generated/server';
import { getProgramImageStorageIdCandidate } from '../onboarding';

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;
const BUSINESS_SCOPED_CACHE_TYPES: ReadonlySet<string> = new Set([
  'business_insight',
  'campaign_summary',
  'recommendation_explanation',
]);
const CACHE_GOALS: ReadonlySet<string> = new Set([
  'bring_back_customers',
  'push_to_reward',
  'general_engagement',
  'campaign_summary',
  'business_insight',
]);

type BusinessScopedCacheType =
  | 'business_insight'
  | 'campaign_summary'
  | 'recommendation_explanation';

function normalizeBatchSize(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(value)));
}

function getCanonicalSegment(segment: string, prefix: string) {
  if (!segment.startsWith(prefix)) {
    return undefined;
  }

  const value = segment.slice(prefix.length);
  if (!value || value.trim() !== value || value.includes(':')) {
    return undefined;
  }
  return value;
}

function parseBusinessScopedCacheKey(cacheKey: unknown) {
  if (typeof cacheKey !== 'string') {
    return undefined;
  }

  const parts = cacheKey.split('|');
  if (
    parts.length !== 6 ||
    parts[0] !== 'v1'
  ) {
    return undefined;
  }

  const businessIdCandidate = getCanonicalSegment(parts[1], 'biz:');
  const goal = getCanonicalSegment(parts[2], 'goal:');
  const cacheType = getCanonicalSegment(parts[3], 'type:');
  const state = getCanonicalSegment(parts[4], 'state:');
  const stateHash = getCanonicalSegment(parts[5], 'hash:');
  if (
    !businessIdCandidate ||
    !goal ||
    !CACHE_GOALS.has(goal) ||
    !cacheType ||
    !BUSINESS_SCOPED_CACHE_TYPES.has(cacheType) ||
    !state ||
    !stateHash
  ) {
    return undefined;
  }

  return {
    businessIdCandidate,
    cacheType: cacheType as BusinessScopedCacheType,
  };
}

export function getBusinessIdCandidateFromCacheKey(cacheKey: unknown) {
  return parseBusinessScopedCacheKey(cacheKey)?.businessIdCandidate;
}

export const backfillBusinessOnboardingDraftImageStorageIds =
  internalMutation({
    args: {
      cursor: v.optional(v.union(v.string(), v.null())),
      batchSize: v.optional(v.number()),
    },
    handler: async (ctx, { cursor, batchSize }) => {
      const page = await ctx.db.query('businessOnboardingDrafts').paginate({
        cursor: cursor ?? null,
        numItems: normalizeBatchSize(batchSize),
      });
      let patched = 0;
      let skipped = 0;

      for (const draft of page.page) {
        const candidate = getProgramImageStorageIdCandidate(
          draft.programDraft
        );
        const storageId = candidate
          ? ctx.db.normalizeId('_storage', candidate)
          : null;
        if (!storageId) {
          skipped += 1;
          continue;
        }
        if (draft.programImageStorageId === storageId) {
          continue;
        }

        await ctx.db.patch(draft._id, {
          programImageStorageId: storageId,
        });
        patched += 1;
      }

      return {
        isDone: page.isDone,
        continueCursor: page.continueCursor,
        scanned: page.page.length,
        patched,
        skipped,
      };
    },
  });

export const backfillAiGenerationCacheBusinessIds = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { cursor, batchSize }) => {
    const page = await ctx.db.query('aiGenerationCache').paginate({
      cursor: cursor ?? null,
      numItems: normalizeBatchSize(batchSize),
    });
    let patched = 0;
    let skipped = 0;

    for (const cacheRow of page.page) {
      if (cacheRow.businessId) {
        continue;
      }
      const parsedCacheKey = parseBusinessScopedCacheKey(cacheRow.cacheKey);
      if (
        !parsedCacheKey ||
        cacheRow.responseJson?.type !== parsedCacheKey.cacheType
      ) {
        skipped += 1;
        continue;
      }
      const businessId = parsedCacheKey.businessIdCandidate
        ? ctx.db.normalizeId(
            'businesses',
            parsedCacheKey.businessIdCandidate
          )
        : null;
      const business = businessId ? await ctx.db.get(businessId) : null;
      if (!businessId || !business) {
        skipped += 1;
        continue;
      }

      await ctx.db.patch(cacheRow._id, { businessId });
      patched += 1;
    }

    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      scanned: page.page.length,
      patched,
      skipped,
    };
  },
});
