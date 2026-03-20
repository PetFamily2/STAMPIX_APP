import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { mutation } from '../_generated/server';

/**
 * Cutover migration:
 * Marks legacy `retention_action` campaigns as disabled for legacy cron sweep.
 *
 * Optional behavior:
 * - `pauseActive`: also pauses currently active recurring retention actions.
 * - `dryRun`: no writes, only returns what would change.
 *
 * Run with:
 *   bunx convex run migrations/cutoverLegacyRetentionActions
 *   bunx convex run migrations/cutoverLegacyRetentionActions '{"pauseActive":true}'
 *   bunx convex run migrations/cutoverLegacyRetentionActions '{"businessId":"<id>","pauseActive":true}'
 */

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

type LegacyRetentionCampaign = {
  type: string;
  status?: string;
  automationEnabled?: boolean;
  sourceContext?: unknown;
  schedule?: unknown;
};

export function buildLegacyRetentionCutoverPatch(
  campaign: LegacyRetentionCampaign,
  now: number,
  shouldPauseActive: boolean
) {
  if (campaign.type !== 'retention_action') {
    return {
      isRetentionAction: false,
      isAlreadyDisabled: false,
      shouldPause: false,
      patch: null as Record<string, unknown> | null,
    };
  }

  const sourceContext = asRecord(campaign.sourceContext);
  const isAlreadyDisabled = sourceContext.legacyAutomationDisabled === true;
  const shouldPause =
    shouldPauseActive &&
    campaign.status === 'active' &&
    campaign.automationEnabled === true;

  if (isAlreadyDisabled && !shouldPause) {
    return {
      isRetentionAction: true,
      isAlreadyDisabled,
      shouldPause,
      patch: null as Record<string, unknown> | null,
    };
  }

  const patchPayload: Record<string, unknown> = {
    sourceContext: {
      ...sourceContext,
      legacyAutomationDisabled: true,
      legacyAutomationDisabledAt: now,
      cutoverReason: 'unified_campaign_engine_v2',
    },
    updatedAt: now,
  };

  if (shouldPause) {
    const existingSchedule = asRecord(campaign.schedule);
    patchPayload.status = 'paused';
    patchPayload.activationStatus = 'paused';
    patchPayload.automationEnabled = false;
    patchPayload.schedule = {
      ...existingSchedule,
      mode: 'send_now',
      nextRunAt: undefined,
    };
  }

  return {
    isRetentionAction: true,
    isAlreadyDisabled,
    shouldPause,
    patch: patchPayload,
  };
}

export default mutation({
  args: {
    businessId: v.optional(v.id('businesses')),
    dryRun: v.optional(v.boolean()),
    pauseActive: v.optional(v.boolean()),
  },
  handler: async (ctx, { businessId, dryRun, pauseActive }) => {
    const now = Date.now();
    const shouldPauseActive = pauseActive !== false;
    const isDryRun = dryRun === true;

    const campaigns = businessId
      ? await ctx.db
          .query('campaigns')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .collect()
      : await ctx.db.query('campaigns').collect();

    let scanned = 0;
    let alreadyDisabled = 0;
    let markedDisabled = 0;
    let pausedActive = 0;
    const affectedByBusiness = new Map<string, number>();
    const sampleCampaignIds: Array<Id<'campaigns'>> = [];

    for (const campaign of campaigns) {
      const patchResult = buildLegacyRetentionCutoverPatch(
        campaign,
        now,
        shouldPauseActive
      );
      if (!patchResult.isRetentionAction) {
        continue;
      }
      scanned += 1;

      if (patchResult.isAlreadyDisabled) {
        alreadyDisabled += 1;
      }

      if (!patchResult.patch) {
        continue;
      }

      const businessKey = String(campaign.businessId);
      affectedByBusiness.set(
        businessKey,
        (affectedByBusiness.get(businessKey) ?? 0) + 1
      );
      if (sampleCampaignIds.length < 50) {
        sampleCampaignIds.push(campaign._id);
      }

      if (isDryRun) {
        if (!patchResult.isAlreadyDisabled) {
          markedDisabled += 1;
        }
        if (patchResult.shouldPause) {
          pausedActive += 1;
        }
        continue;
      }

      if (!patchResult.isAlreadyDisabled) {
        markedDisabled += 1;
      }

      if (patchResult.shouldPause) {
        pausedActive += 1;
      }

      await ctx.db.patch(campaign._id, patchResult.patch);
    }

    return {
      businessId: businessId ?? null,
      dryRun: isDryRun,
      pauseActive: shouldPauseActive,
      scannedRetentionActions: scanned,
      alreadyDisabled,
      markedDisabled,
      pausedActive,
      affectedBusinesses: Array.from(affectedByBusiness.entries()).map(
        ([businessIdKey, count]) => ({
          businessId: businessIdKey,
          campaigns: count,
        })
      ),
      sampleCampaignIds,
    };
  },
});
