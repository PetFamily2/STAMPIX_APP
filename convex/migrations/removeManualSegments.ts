import { v } from 'convex/values';
import { mutation } from '../_generated/server';

const MANUAL_SEGMENT_REMOVAL_REASON = 'manual_segment_system_removed';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function stringifyForTokenScan(value: unknown) {
  if (value === undefined) {
    return '';
  }
  try {
    return JSON.stringify(value).toLowerCase();
  } catch {
    return '';
  }
}

export function preparedAudienceHasManualSegmentReference(
  preparedAudience: unknown
) {
  const serialized = stringifyForTokenScan(preparedAudience);
  return (
    serialized.includes('advanced_segment') ||
    serialized.includes('saved_segment') ||
    serialized.includes('segmentid')
  );
}

function rulesTargetManualSegment(rules: unknown) {
  const source = asRecord(rules);
  return source.targetType === 'saved_segment' || 'segmentId' in source;
}

function sourceContextHasManualSegmentReference(sourceContext: unknown) {
  const serialized = stringifyForTokenScan(sourceContext);
  return (
    serialized.includes('advanced_segment') ||
    serialized.includes('saved_segment') ||
    serialized.includes('segmentid')
  );
}

function campaignDependsOnManualSegments(campaign: Record<string, unknown>) {
  const audienceSource = campaign.audienceSource;
  return (
    audienceSource === 'advanced_segment' ||
    rulesTargetManualSegment(campaign.rules) ||
    preparedAudienceHasManualSegmentReference(campaign.preparedAudience) ||
    sourceContextHasManualSegmentReference(campaign.sourceContext)
  );
}

export function buildManualSegmentRemovalPatch(
  campaign: Record<string, unknown>,
  now: number
) {
  if (!campaignDependsOnManualSegments(campaign)) {
    return null;
  }

  const sourceContext = asRecord(campaign.sourceContext);
  const patch: Record<string, unknown> = {
    updatedAt: now,
    audienceSource:
      campaign.audienceSource === 'advanced_segment'
        ? 'manual_override'
        : campaign.audienceSource,
    preparedAudience: preparedAudienceHasManualSegmentReference(
      campaign.preparedAudience
    )
      ? undefined
      : campaign.preparedAudience,
    sourceContext: {
      ...sourceContext,
      manualSegmentsRemoved: true,
      manualSegmentsRemovedAt: now,
      manualSegmentsRemovedReason: MANUAL_SEGMENT_REMOVAL_REASON,
    },
  };

  patch.isActive = false;
  patch.automationEnabled = false;

  if (
    campaign.status === 'draft' ||
    campaign.status === 'active' ||
    campaign.status === 'paused' ||
    campaign.status === 'completed' ||
    campaign.status === 'archived'
  ) {
    patch.status = 'archived';
  }
  if (
    campaign.activationStatus === 'draft' ||
    campaign.activationStatus === 'active' ||
    campaign.activationStatus === 'paused' ||
    campaign.activationStatus === 'completed' ||
    campaign.activationStatus === 'archived'
  ) {
    patch.activationStatus = 'archived';
  }

  const existingSchedule = asRecord(campaign.schedule);
  if (Object.keys(existingSchedule).length > 0) {
    patch.schedule = {
      ...existingSchedule,
      mode: 'send_now',
      sendAt: undefined,
      nextRunAt: undefined,
    };
  }

  if (campaign.type === 'retention_action') {
    patch.sourceContext = {
      ...asRecord(patch.sourceContext),
      legacyAutomationDisabled: true,
      legacyAutomationDisabledAt: now,
    };
  }

  if (typeof campaign.archivedAt !== 'number') {
    patch.archivedAt = now;
  }

  return patch;
}

async function collectTable(
  ctx: any,
  tableName: string,
  businessId: unknown | undefined
) {
  const query = ctx.db.query(tableName as any);
  if (!businessId) {
    return await query.collect();
  }
  return await query
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .collect();
}

/**
 * Manual segment retirement migration.
 *
 * Order:
 * 1. auditManualSegmentDependencies
 * 2. removeManualSegments {"dryRun":true}
 * 3. removeManualSegments
 * 4. schema cleanup and module deletion
 */
export default mutation({
  args: {
    businessId: v.optional(v.id('businesses')),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { businessId, dryRun }) => {
    const now = Date.now();
    const isDryRun = dryRun === true;
    const [campaigns, campaignRuns, segments] = await Promise.all([
      collectTable(ctx, 'campaigns', businessId),
      collectTable(ctx, 'campaignRuns', businessId),
      collectTable(ctx, 'segments', businessId),
    ]);

    let archivedCampaigns = 0;
    let normalizedCampaigns = 0;
    let normalizedCampaignRuns = 0;
    let deletedSegments = 0;
    const sampleCampaignIds: string[] = [];
    const sampleCampaignRunIds: string[] = [];
    const sampleSegmentIds: string[] = [];

    for (const campaign of campaigns) {
      const patch = buildManualSegmentRemovalPatch(campaign, now);
      if (!patch) {
        continue;
      }
      normalizedCampaigns += 1;
      archivedCampaigns += 1;
      if (sampleCampaignIds.length < 50) {
        sampleCampaignIds.push(String(campaign._id));
      }
      if (isDryRun) {
        continue;
      }
      await ctx.db.patch(campaign._id, patch);
    }

    for (const campaignRun of campaignRuns) {
      if (campaignRun.audienceSource !== 'advanced_segment') {
        continue;
      }
      normalizedCampaignRuns += 1;
      if (sampleCampaignRunIds.length < 50) {
        sampleCampaignRunIds.push(String(campaignRun._id));
      }
      if (isDryRun) {
        continue;
      }
      await ctx.db.patch(campaignRun._id, {
        audienceSource: 'manual_override',
        updatedAt: now,
      });
    }

    for (const segment of segments) {
      deletedSegments += 1;
      if (sampleSegmentIds.length < 50) {
        sampleSegmentIds.push(String(segment._id));
      }
      if (isDryRun) {
        continue;
      }
      await ctx.db.delete(segment._id);
    }

    return {
      businessId: businessId ?? null,
      dryRun: isDryRun,
      archivedCampaigns,
      normalizedCampaigns,
      normalizedCampaignRuns,
      deletedSegments,
      sampleCampaignIds,
      sampleCampaignRunIds,
      sampleSegmentIds,
    };
  },
});
