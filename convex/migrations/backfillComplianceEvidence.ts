import { v } from 'convex/values';
import {
  MARKETING_CONSENT_CHANNELS,
  MARKETING_CONSENT_SCOPE,
  MARKETING_CONSENT_VERSION,
} from '../../lib/legalContract';
import { internalMutation } from '../_generated/server';
import {
  AI_AUDIT_RETENTION_MS,
  COMPLETED_ONBOARDING_DRAFT_RETENTION_MS,
  INACTIVE_ONBOARDING_DRAFT_RETENTION_MS,
  ONBOARDING_RESEARCH_RETENTION_MS,
  SUPPORT_RETENTION_MS,
} from '../dataRetention';

const PHASE = v.union(
  v.literal('support'),
  v.literal('onboarding_drafts'),
  v.literal('onboarding_research'),
  v.literal('ai_audit'),
  v.literal('legacy_marketing_state')
);

const MAX_PAGE_SIZE = 100;

export const backfillComplianceEvidence = internalMutation({
  args: {
    phase: PHASE,
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { phase, cursor, limit, dryRun }) => {
    const isDryRun = dryRun !== false;
    const numItems = Math.max(
      1,
      Math.min(MAX_PAGE_SIZE, Math.floor(limit ?? MAX_PAGE_SIZE))
    );
    const table =
      phase === 'support'
        ? 'supportRequests'
        : phase === 'onboarding_drafts'
          ? 'businessOnboardingDrafts'
          : phase === 'onboarding_research'
            ? 'businesses'
            : phase === 'ai_audit'
              ? 'smartManagerAuditEvents'
              : 'users';
    const page = await ctx.db.query(table).paginate({ cursor, numItems });
    let examined = 0;
    let patched = 0;
    let inserted = 0;

    for (const row of page.page as any[]) {
      examined += 1;
      if (phase === 'support') {
        if (row.status !== 'handled' || row.purgeAfter !== undefined) {
          continue;
        }
        const closedAt = row.closedAt ?? row.updatedAt ?? row.createdAt;
        if (!isDryRun) {
          await ctx.db.patch(row._id, {
            closedAt,
            purgeAfter: closedAt + SUPPORT_RETENTION_MS,
          });
        }
        patched += 1;
        continue;
      }

      if (phase === 'onboarding_drafts') {
        if (
          row.rawPayloadPurgeAfter !== undefined ||
          row.minimizedAt !== undefined
        ) {
          continue;
        }
        const basis = row.completedAt ?? row.updatedAt ?? row.createdAt;
        const retention =
          row.status === 'completed'
            ? COMPLETED_ONBOARDING_DRAFT_RETENTION_MS
            : INACTIVE_ONBOARDING_DRAFT_RETENTION_MS;
        if (!isDryRun) {
          await ctx.db.patch(row._id, {
            rawPayloadPurgeAfter: basis + retention,
          });
        }
        patched += 1;
        continue;
      }

      if (phase === 'onboarding_research') {
        if (
          !row.onboardingSnapshot ||
          row.onboardingResearchPurgeAfter !== undefined ||
          row.onboardingResearchMinimizedAt !== undefined
        ) {
          continue;
        }
        const collectedAt =
          row.onboardingSnapshot.collectedAt ?? row.updatedAt ?? row.createdAt;
        if (!isDryRun) {
          await ctx.db.patch(row._id, {
            onboardingResearchPurgeAfter:
              collectedAt + ONBOARDING_RESEARCH_RETENTION_MS,
          });
        }
        patched += 1;
        continue;
      }

      if (phase === 'ai_audit') {
        if (!Number.isFinite(row.createdAt)) {
          continue;
        }
        const targetExpiry = row.createdAt + AI_AUDIT_RETENTION_MS;
        if (row.expiresAt >= targetExpiry) {
          continue;
        }
        if (!isDryRun) {
          await ctx.db.patch(row._id, { expiresAt: targetExpiry });
        }
        patched += 1;
        continue;
      }

      if (row.marketingOptIn === undefined) {
        continue;
      }
      const existing = await ctx.db
        .query('marketingConsentEvents')
        .withIndex('by_userId', (q: any) => q.eq('userId', row._id))
        .filter((q: any) => q.eq(q.field('eventType'), 'legacy_state_observed'))
        .first();
      if (existing) {
        continue;
      }
      if (!isDryRun) {
        const observedAt = Date.now();
        await ctx.db.insert('marketingConsentEvents', {
          userId: row._id,
          eventType: 'legacy_state_observed',
          effectiveOptIn: row.marketingOptIn === true,
          version: MARKETING_CONSENT_VERSION,
          scope: MARKETING_CONSENT_SCOPE,
          channels: [...MARKETING_CONSENT_CHANNELS],
          source: 'legacy_backfill',
          observedAt,
          createdAt: observedAt,
        });
      }
      inserted += 1;
    }

    return {
      phase,
      dryRun: isDryRun,
      examined,
      patched,
      inserted,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
