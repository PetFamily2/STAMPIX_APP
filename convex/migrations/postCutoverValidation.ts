import { v } from 'convex/values';
import { query } from '../_generated/server';
import {
  buildManualSegmentRemovalPatch,
  preparedAudienceHasManualSegmentReference,
} from './removeManualSegments';

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
 * Post-cutover validation snapshot.
 *
 * This now validates both the unified campaign cutover and the manual segment
 * retirement state.
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

    let legacyRetentionActionsActive = 0;
    let legacyRetentionActionsDisabled = 0;
    let campaignsWithPreparedAudienceSegmentRefs = 0;
    let campaignsRequiringManualSegmentCleanup = 0;
    let campaignRunsWithAdvancedSegmentAudienceSource = 0;
    const sampleRetentionActionIds: string[] = [];
    const sampleCampaignIds: string[] = [];
    const sampleCampaignRunIds: string[] = [];
    const sampleSegmentIds: string[] = [];

    for (const campaign of campaigns) {
      const sourceContext =
        campaign.sourceContext &&
        typeof campaign.sourceContext === 'object' &&
        !Array.isArray(campaign.sourceContext)
          ? (campaign.sourceContext as Record<string, unknown>)
          : {};
      const disabled = sourceContext.legacyAutomationDisabled === true;

      if (campaign.type === 'retention_action') {
        if (disabled) {
          legacyRetentionActionsDisabled += 1;
        }
        if (
          campaign.status === 'active' &&
          campaign.automationEnabled === true
        ) {
          legacyRetentionActionsActive += 1;
          if (sampleRetentionActionIds.length < 25) {
            sampleRetentionActionIds.push(String(campaign._id));
          }
        }
      }

      if (
        preparedAudienceHasManualSegmentReference(campaign.preparedAudience)
      ) {
        campaignsWithPreparedAudienceSegmentRefs += 1;
      }
      if (buildManualSegmentRemovalPatch(campaign, Date.now())) {
        campaignsRequiringManualSegmentCleanup += 1;
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
        campaigns: campaigns.length,
        campaignRuns: campaignRuns.length,
        segments: segments.length,
      },
      legacy: {
        legacyRetentionActionsActive,
        legacyRetentionActionsDisabled,
        campaignsWithPreparedAudienceSegmentRefs,
        campaignsRequiringManualSegmentCleanup,
        campaignRunsWithAdvancedSegmentAudienceSource,
      },
      readyForCleanup:
        legacyRetentionActionsActive === 0 &&
        campaignsWithPreparedAudienceSegmentRefs === 0 &&
        campaignsRequiringManualSegmentCleanup === 0 &&
        campaignRunsWithAdvancedSegmentAudienceSource === 0 &&
        segments.length === 0,
      samples: {
        retentionActionIds: sampleRetentionActionIds,
        campaignIds: sampleCampaignIds,
        campaignRunIds: sampleCampaignRunIds,
        segmentIds: sampleSegmentIds,
      },
    };
  },
});
