import { v } from 'convex/values';

import { internalMutation, type MutationCtx } from './_generated/server';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SUPPORT_RETENTION_MS = 730 * DAY_MS;
export const TECHNICAL_LOG_RETENTION_MS = 730 * DAY_MS;
export const AI_AUDIT_RETENTION_MS = 365 * DAY_MS;
export const COMPLETED_ONBOARDING_DRAFT_RETENTION_MS = 30 * DAY_MS;
export const INACTIVE_ONBOARDING_DRAFT_RETENTION_MS = 90 * DAY_MS;
export const ONBOARDING_RESEARCH_RETENTION_MS = 90 * DAY_MS;
export const RETENTION_CLEANUP_BATCH_SIZE = 100;

function boundedLimit(value: number | undefined) {
  return Math.max(
    1,
    Math.min(
      RETENTION_CLEANUP_BATCH_SIZE,
      Math.floor(value ?? RETENTION_CLEANUP_BATCH_SIZE)
    )
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function purgeExpiredSupportRequestsImpl(
  ctx: MutationCtx,
  now = Date.now(),
  limit = RETENTION_CLEANUP_BATCH_SIZE
) {
  const rows = await ctx.db
    .query('supportRequests')
    .withIndex('by_purgeAfter', (q) =>
      q.gte('purgeAfter', 0).lte('purgeAfter', now)
    )
    .take(boundedLimit(limit));
  let deleted = 0;
  let retainedForLegalHold = 0;
  for (const row of rows) {
    if (row.legalHold === true) {
      // Remove held rows from the expiry index so a large hold set cannot
      // starve later eligible records. Releasing the hold restores the date.
      await ctx.db.patch(row._id, { purgeAfter: undefined });
      retainedForLegalHold += 1;
      continue;
    }
    if (row.status !== 'handled') {
      continue;
    }
    await ctx.db.delete(row._id);
    deleted += 1;
  }
  return { examined: rows.length, deleted, retainedForLegalHold };
}

export async function purgeExpiredAiCacheImpl(
  ctx: MutationCtx,
  now = Date.now(),
  limit = RETENTION_CLEANUP_BATCH_SIZE
) {
  const rows = await ctx.db
    .query('aiGenerationCache')
    .withIndex('by_expiresAt', (q) => q.lte('expiresAt', now))
    .take(boundedLimit(limit));
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return { examined: rows.length, deleted: rows.length };
}

export async function purgeExpiredAiAuditMetadataImpl(
  ctx: MutationCtx,
  now = Date.now(),
  limit = RETENTION_CLEANUP_BATCH_SIZE
) {
  const cutoff = now - AI_AUDIT_RETENTION_MS;
  const rows = await ctx.db
    .query('aiUsageLedger')
    .withIndex('by_createdAt', (q) => q.lte('createdAt', cutoff))
    .take(boundedLimit(limit));
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return { examined: rows.length, deleted: rows.length, cutoff };
}

export async function purgeExpiredTechnicalLogsImpl(
  ctx: MutationCtx,
  now = Date.now(),
  limit = RETENTION_CLEANUP_BATCH_SIZE
) {
  const cutoff = now - TECHNICAL_LOG_RETENTION_MS;
  const rows = await ctx.db
    .query('pushDeliveryLog')
    .withIndex('by_createdAt', (q) => q.lte('createdAt', cutoff))
    .take(boundedLimit(limit));
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return { examined: rows.length, deleted: rows.length, cutoff };
}

export async function minimizeExpiredOnboardingDraftsImpl(
  ctx: MutationCtx,
  now = Date.now(),
  limit = RETENTION_CLEANUP_BATCH_SIZE
) {
  const rows = await ctx.db
    .query('businessOnboardingDrafts')
    .withIndex('by_rawPayloadPurgeAfter', (q) =>
      q.gte('rawPayloadPurgeAfter', 0).lte('rawPayloadPurgeAfter', now)
    )
    .take(boundedLimit(limit));
  for (const row of rows) {
    await ctx.db.patch(row._id, {
      businessDraft: undefined,
      programDraft: undefined,
      businessOnboardingDraft: undefined,
      rawPayloadPurgeAfter: undefined,
      minimizedAt: now,
      updatedAt: now,
    });
  }
  return { examined: rows.length, minimized: rows.length };
}

export async function minimizeExpiredOnboardingResearchImpl(
  ctx: MutationCtx,
  now = Date.now(),
  limit = RETENTION_CLEANUP_BATCH_SIZE
) {
  const rows = await ctx.db
    .query('businesses')
    .withIndex('by_onboardingResearchPurgeAfter', (q) =>
      q
        .gte('onboardingResearchPurgeAfter', 0)
        .lte('onboardingResearchPurgeAfter', now)
    )
    .take(boundedLimit(limit));

  for (const row of rows) {
    const {
      discoverySource: _discoverySource,
      ownerAgeRange: _ownerAgeRange,
      businessExample: _businessExample,
      ...operationalSnapshot
    } = asRecord(row.onboardingSnapshot);
    const retentionProfile = asRecord(row.businessRetentionProfile);
    const {
      discoverySource: _profileDiscoverySource,
      adoptionReason: _adoptionReason,
      onboardingMeta,
      ...operationalRetentionProfile
    } = retentionProfile;
    const {
      ownerAgeRange: _profileOwnerAgeRange,
      businessExample: _profileBusinessExample,
      ...operationalOnboardingMeta
    } = asRecord(onboardingMeta);

    await ctx.db.patch(row._id, {
      onboardingSnapshot: operationalSnapshot,
      businessRetentionProfile: {
        ...operationalRetentionProfile,
        onboardingMeta: operationalOnboardingMeta,
      },
      onboardingResearchPurgeAfter: undefined,
      onboardingResearchMinimizedAt: now,
      updatedAt: now,
    });
  }
  return { examined: rows.length, minimized: rows.length };
}

const cleanupArgs = { limit: v.optional(v.number()) };

export const purgeExpiredSupportRequestsInternal = internalMutation({
  args: cleanupArgs,
  handler: async (ctx, { limit }) =>
    await purgeExpiredSupportRequestsImpl(ctx, Date.now(), limit),
});

export const purgeExpiredAiCacheInternal = internalMutation({
  args: cleanupArgs,
  handler: async (ctx, { limit }) =>
    await purgeExpiredAiCacheImpl(ctx, Date.now(), limit),
});

export const purgeExpiredAiAuditMetadataInternal = internalMutation({
  args: cleanupArgs,
  handler: async (ctx, { limit }) =>
    await purgeExpiredAiAuditMetadataImpl(ctx, Date.now(), limit),
});

export const purgeExpiredTechnicalLogsInternal = internalMutation({
  args: cleanupArgs,
  handler: async (ctx, { limit }) =>
    await purgeExpiredTechnicalLogsImpl(ctx, Date.now(), limit),
});

export const minimizeExpiredOnboardingDraftsInternal = internalMutation({
  args: cleanupArgs,
  handler: async (ctx, { limit }) =>
    await minimizeExpiredOnboardingDraftsImpl(ctx, Date.now(), limit),
});

export const minimizeExpiredOnboardingResearchInternal = internalMutation({
  args: cleanupArgs,
  handler: async (ctx, { limit }) =>
    await minimizeExpiredOnboardingResearchImpl(ctx, Date.now(), limit),
});
