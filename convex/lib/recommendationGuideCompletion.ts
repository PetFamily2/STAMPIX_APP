export type RecommendationCompletionStableId =
  | 'subscription.action_required'
  | 'setup.address.resolve'
  | 'setup.profile.complete'
  | 'program.publish_first'
  | 'program.publish_draft'
  | 'campaign.create_first'
  | 'campaign.publish_draft'
  | 'campaign.resume_paused'
  | 'campaign.next_scheduled'
  | 'retention.reengage_inactive'
  | 'growth.near_reward'
  | 'team.pending_invitations'
  | 'subscription.quota_near';

export type RecommendationCompletionSnapshot = {
  subscriptionStatus?: string;
  addressComplete?: boolean;
  profileComplete?: boolean;
  activeProgramCount?: number;
  programLifecycle?: string;
  totalNonarchivedCampaigns?: number;
  campaignLifecycle?: string;
  scheduledEvidenceChanged?: boolean;
  inactiveCustomerCount?: number;
  nearRewardCustomerCount?: number;
  pendingInvitationCount?: number;
  campaignQuotaUsage?: number;
  campaignQuotaLimit?: number;
};

const CAMPAIGN_DRAFT_COMPLETION = new Set([
  'scheduled',
  'recurring',
  'completed',
  'archived',
]);
const CAMPAIGN_RESUME_COMPLETION = new Set([
  'scheduled',
  'recurring',
  'archived',
]);
const CAMPAIGN_SCHEDULE_COMPLETION = new Set([
  'completed',
  'paused',
  'archived',
]);

export function isRecommendationCompletionSatisfied(
  stableId: RecommendationCompletionStableId,
  snapshot: RecommendationCompletionSnapshot
) {
  switch (stableId) {
    case 'subscription.action_required':
      return (
        snapshot.subscriptionStatus === 'active' ||
        snapshot.subscriptionStatus === 'trialing'
      );
    case 'setup.address.resolve':
      return snapshot.addressComplete === true;
    case 'setup.profile.complete':
      return snapshot.profileComplete === true;
    case 'program.publish_first':
      return Number(snapshot.activeProgramCount ?? 0) > 0;
    case 'program.publish_draft':
      return snapshot.programLifecycle === 'active';
    case 'campaign.create_first':
      return Number(snapshot.totalNonarchivedCampaigns ?? 0) > 0;
    case 'campaign.publish_draft':
      return CAMPAIGN_DRAFT_COMPLETION.has(
        String(snapshot.campaignLifecycle ?? '')
      );
    case 'campaign.resume_paused':
      return CAMPAIGN_RESUME_COMPLETION.has(
        String(snapshot.campaignLifecycle ?? '')
      );
    case 'campaign.next_scheduled':
      return (
        snapshot.scheduledEvidenceChanged === true ||
        CAMPAIGN_SCHEDULE_COMPLETION.has(
          String(snapshot.campaignLifecycle ?? '')
        )
      );
    case 'retention.reengage_inactive':
      return (
        snapshot.inactiveCustomerCount !== undefined &&
        snapshot.inactiveCustomerCount < 1
      );
    case 'growth.near_reward':
      return (
        snapshot.nearRewardCustomerCount !== undefined &&
        snapshot.nearRewardCustomerCount < 1
      );
    case 'team.pending_invitations':
      return snapshot.pendingInvitationCount === 0;
    case 'subscription.quota_near': {
      const limit = Number(snapshot.campaignQuotaLimit ?? 0);
      const usage = Number(snapshot.campaignQuotaUsage ?? 0);
      return (
        Number.isFinite(limit) &&
        Number.isFinite(usage) &&
        limit > 0 &&
        usage / limit < 0.8
      );
    }
  }
}
