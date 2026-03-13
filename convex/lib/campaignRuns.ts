import type { Id } from '../_generated/dataModel';

const DAY_MS = 24 * 60 * 60 * 1000;
const SUMMARY_READY_DAYS = 3;
const SUMMARY_WINDOW_DAYS = 14;

export type CampaignRunInput = {
  businessId: Id<'businesses'>;
  campaignId: Id<'campaigns'>;
  programId?: Id<'loyaltyPrograms'>;
  campaignType: string;
  sentAt: number;
  targetedCount: number;
  deliveredCount: number;
  lastDeliveryAt?: number;
};

export async function recordCampaignRun(ctx: any, input: CampaignRunInput) {
  if (!Number.isFinite(input.deliveredCount) || input.deliveredCount <= 0) {
    return null;
  }

  const summaryReadyAt = input.sentAt + SUMMARY_READY_DAYS * DAY_MS;
  const summaryWindowEndsAt = input.sentAt + SUMMARY_WINDOW_DAYS * DAY_MS;
  const now = Date.now();

  const runId = await ctx.db.insert('campaignRuns', {
    businessId: input.businessId,
    campaignId: input.campaignId,
    programId: input.programId,
    campaignType: input.campaignType,
    sentAt: input.sentAt,
    targetedCount: Math.max(0, Math.floor(input.targetedCount)),
    deliveredCount: Math.max(0, Math.floor(input.deliveredCount)),
    lastDeliveryAt: input.lastDeliveryAt ?? input.sentAt,
    summaryReadyAt,
    summaryWindowEndsAt,
    summaryStatus: 'pending' as const,
    createdAt: now,
    updatedAt: now,
  });

  return runId;
}
