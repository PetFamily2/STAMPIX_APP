import { v } from 'convex/values';
import { query } from '../_generated/server';
import {
  buildManualSegmentRemovalPatch,
  preparedAudienceHasManualSegmentReference,
} from './removeManualSegments';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

async function collectTable(
  ctx: any,
  tableName: string,
  businessId: unknown | undefined
) {
  const queryBuilder = ctx.db.query(tableName as any);
  if (!businessId) {
    return await queryBuilder.collect();
  }
  return await queryBuilder
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .collect();
}

/**
 * Read-only audit before removing the manual segment system.
 */
export default query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    const [campaigns, campaignRuns, segments] = await Promise.all([
      collectTable(ctx, 'campaigns', businessId),
      collectTable(ctx, 'campaignRuns', businessId),
      collectTable(ctx, 'segments', businessId),
    ]);

    let campaignsWithSavedSegmentRules = 0;
    let campaignsWithAdvancedSegmentAudienceSource = 0;
    let campaignsWithPreparedAudienceSegmentRefs = 0;
    let campaignsRequiringArchiveOrNormalization = 0;
    let campaignRunsWithAdvancedSegmentAudienceSource = 0;
    const sampleCampaignIds: string[] = [];
    const sampleCampaignRunIds: string[] = [];
    const sampleSegmentIds: string[] = [];

    for (const campaign of campaigns) {
      const rules = asRecord(campaign.rules);
      if (rules.targetType === 'saved_segment' || 'segmentId' in rules) {
        campaignsWithSavedSegmentRules += 1;
      }
      if (campaign.audienceSource === 'advanced_segment') {
        campaignsWithAdvancedSegmentAudienceSource += 1;
      }
      if (
        preparedAudienceHasManualSegmentReference(campaign.preparedAudience)
      ) {
        campaignsWithPreparedAudienceSegmentRefs += 1;
      }
      if (buildManualSegmentRemovalPatch(campaign, Date.now())) {
        campaignsRequiringArchiveOrNormalization += 1;
        if (sampleCampaignIds.length < 25) {
          sampleCampaignIds.push(String(campaign._id));
        }
      }
    }

    for (const campaignRun of campaignRuns) {
      if (campaignRun.audienceSource !== 'advanced_segment') {
        continue;
      }
      campaignRunsWithAdvancedSegmentAudienceSource += 1;
      if (sampleCampaignRunIds.length < 25) {
        sampleCampaignRunIds.push(String(campaignRun._id));
      }
    }

    for (const segment of segments.slice(0, 25)) {
      sampleSegmentIds.push(String(segment._id));
    }

    return {
      businessId: businessId ?? null,
      totals: {
        segments: segments.length,
        campaigns: campaigns.length,
        campaignRuns: campaignRuns.length,
      },
      manualSegmentDependencies: {
        campaignsWithSavedSegmentRules,
        campaignsWithAdvancedSegmentAudienceSource,
        campaignsWithPreparedAudienceSegmentRefs,
        campaignsRequiringArchiveOrNormalization,
        campaignRunsWithAdvancedSegmentAudienceSource,
      },
      samples: {
        campaignIds: sampleCampaignIds,
        campaignRunIds: sampleCampaignRunIds,
        segmentIds: sampleSegmentIds,
      },
      readyForBackendDependencyRemoval:
        campaignsRequiringArchiveOrNormalization === 0 &&
        campaignsWithPreparedAudienceSegmentRefs === 0 &&
        campaignRunsWithAdvancedSegmentAudienceSource === 0 &&
        segments.length === 0,
    };
  },
});
