import { describe, expect, test } from 'bun:test';

import { isRecommendationCompletionSatisfied } from '../lib/recommendationGuideCompletion';

describe('server-observed recommendation completion predicates', () => {
  test.each([
    ['subscription.action_required', { subscriptionStatus: 'active' }],
    ['subscription.action_required', { subscriptionStatus: 'trialing' }],
    ['setup.address.resolve', { addressComplete: true }],
    ['setup.profile.complete', { profileComplete: true }],
    ['program.publish_first', { activeProgramCount: 1 }],
    ['program.publish_draft', { programLifecycle: 'active' }],
    ['campaign.create_first', { totalNonarchivedCampaigns: 1 }],
    ['campaign.publish_draft', { campaignLifecycle: 'scheduled' }],
    ['campaign.publish_draft', { campaignLifecycle: 'recurring' }],
    ['campaign.publish_draft', { campaignLifecycle: 'completed' }],
    ['campaign.publish_draft', { campaignLifecycle: 'archived' }],
    ['campaign.resume_paused', { campaignLifecycle: 'scheduled' }],
    ['campaign.resume_paused', { campaignLifecycle: 'recurring' }],
    ['campaign.resume_paused', { campaignLifecycle: 'archived' }],
    ['campaign.next_scheduled', { campaignLifecycle: 'completed' }],
    ['campaign.next_scheduled', { campaignLifecycle: 'paused' }],
    ['campaign.next_scheduled', { campaignLifecycle: 'archived' }],
    [
      'campaign.next_scheduled',
      { campaignLifecycle: 'scheduled', scheduledEvidenceChanged: true },
    ],
    ['retention.reengage_inactive', { inactiveCustomerCount: 0 }],
    ['growth.near_reward', { nearRewardCustomerCount: 0 }],
    ['team.pending_invitations', { pendingInvitationCount: 0 }],
    [
      'subscription.quota_near',
      { campaignQuotaUsage: 7, campaignQuotaLimit: 10 },
    ],
    [
      'subscription.quota_near',
      { campaignQuotaUsage: 8, campaignQuotaLimit: 20 },
    ],
  ])('%s completes only from authoritative facts', (stableId, snapshot) => {
    expect(
      isRecommendationCompletionSatisfied(stableId, snapshot)
    ).toBe(true);
  });

  test.each([
    ['subscription.action_required', { subscriptionStatus: 'past_due' }],
    ['setup.address.resolve', { addressComplete: false }],
    ['setup.profile.complete', { profileComplete: false }],
    ['program.publish_first', { activeProgramCount: 0 }],
    ['program.publish_draft', { programLifecycle: 'draft' }],
    ['campaign.create_first', { totalNonarchivedCampaigns: 0 }],
    ['campaign.publish_draft', { campaignLifecycle: 'draft' }],
    ['campaign.resume_paused', { campaignLifecycle: 'paused' }],
    [
      'campaign.next_scheduled',
      { campaignLifecycle: 'scheduled', scheduledEvidenceChanged: false },
    ],
    ['retention.reengage_inactive', { inactiveCustomerCount: 1 }],
    ['growth.near_reward', { nearRewardCustomerCount: 1 }],
    ['team.pending_invitations', { pendingInvitationCount: 1 }],
    [
      'subscription.quota_near',
      { campaignQuotaUsage: 8, campaignQuotaLimit: 10 },
    ],
  ])('%s does not complete from an unfinished state', (stableId, snapshot) => {
    expect(
      isRecommendationCompletionSatisfied(stableId, snapshot)
    ).toBe(false);
  });
});
