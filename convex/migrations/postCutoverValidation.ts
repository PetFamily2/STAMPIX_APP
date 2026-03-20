import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { query } from '../_generated/server';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function hasLegacySegmentStatusField(rules: unknown): boolean {
  const source = asRecord(rules);
  const conditions = Array.isArray(source.conditions) ? source.conditions : [];
  return conditions.some((condition) => {
    const conditionRecord = asRecord(condition);
    return conditionRecord.field === 'customerStatus';
  });
}

/**
 * Post-cutover validation snapshot.
 *
 * Run with:
 *   bunx convex run migrations/postCutoverValidation
 *   bunx convex run migrations/postCutoverValidation '{"businessId":"<id>"}'
 */
export default query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    const campaigns = businessId
      ? await ctx.db
          .query('campaigns')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .collect()
      : await ctx.db.query('campaigns').collect();
    const segments = businessId
      ? await ctx.db
          .query('segments')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .collect()
      : await ctx.db.query('segments').collect();

    let legacyRetentionActionsActive = 0;
    let legacyRetentionActionsDisabled = 0;
    let legacySegmentRules = 0;
    const sampleRetentionActionIds: Array<Id<'campaigns'>> = [];
    const sampleLegacySegmentIds: Array<Id<'segments'>> = [];

    for (const campaign of campaigns) {
      if (campaign.type !== 'retention_action') {
        continue;
      }
      const sourceContext = asRecord(campaign.sourceContext);
      const disabled = sourceContext.legacyAutomationDisabled === true;
      if (disabled) {
        legacyRetentionActionsDisabled += 1;
      }
      if (campaign.status === 'active' && campaign.automationEnabled === true) {
        legacyRetentionActionsActive += 1;
        if (sampleRetentionActionIds.length < 25) {
          sampleRetentionActionIds.push(campaign._id);
        }
      }
    }

    for (const segment of segments) {
      if (!hasLegacySegmentStatusField(segment.rules)) {
        continue;
      }
      legacySegmentRules += 1;
      if (sampleLegacySegmentIds.length < 25) {
        sampleLegacySegmentIds.push(segment._id);
      }
    }

    return {
      businessId: businessId ?? null,
      totals: {
        campaigns: campaigns.length,
        segments: segments.length,
      },
      legacy: {
        legacyRetentionActionsActive,
        legacyRetentionActionsDisabled,
        legacySegmentRules,
      },
      readyForCleanup:
        legacyRetentionActionsActive === 0 && legacySegmentRules === 0,
      samples: {
        retentionActionIds: sampleRetentionActionIds,
        segmentIds: sampleLegacySegmentIds,
      },
    };
  },
});
