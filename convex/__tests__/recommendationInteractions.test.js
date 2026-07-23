import { describe, expect, test } from 'bun:test';

import { buildBusinessRecommendationCatalog } from '../lib/recommendationCatalog';
import { getRecommendationInteractionPolicy } from '../recommendations';

const NOW = 1_800_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const known = (value) => ({ state: 'known', value, observedAt: NOW });

function input() {
  return {
    schemaVersion: 1,
    businessId: 'business_1',
    generatedAt: NOW,
    actor: {
      capabilities: {
        accessCustomers: true,
        accessCampaigns: true,
        createCampaigns: true,
        editCampaigns: true,
        activateSendCampaigns: true,
        manageSubscription: true,
        manageTeam: true,
        editLoyaltyCards: true,
        editBusinessProfile: true,
      },
    },
    facts: {
      businessProfile: known({
        isComplete: false,
        missingFieldIds: ['name'],
      }),
      address: known({ isComplete: false }),
      programs: known({
        activeCount: 0,
        draftCount: 0,
        firstDraftProgramId: null,
      }),
      customers: known({ uniqueActiveCustomerCount: 0 }),
      campaigns: known({
        totalNonarchivedCampaigns: 0,
        draftCount: 0,
        scheduledCount: 0,
        recurringCount: 0,
        pausedCount: 0,
        completedCount: 0,
        inconsistentCount: 0,
        meaningfullyActiveCount: 0,
        firstDraftCampaignId: null,
        firstPausedCampaignId: null,
        nextScheduled: null,
        lifecycleSourceVersion: 'campaign_lifecycle_v1',
      }),
      campaignQuota: known({
        campaignDefinitionUsage: 0,
        campaignDefinitionLimit: 10,
        isAtOrAboveLimit: false,
      }),
      team: known({ unexpiredPendingInvitationCount: 0 }),
      subscription: known({ status: 'active' }),
      customerLifecycleSegments: {
        nearReward: known({
          count: 0,
          evidenceFingerprint: 'near_0',
        }),
        inactive: known({
          count: 0,
          evidenceFingerprint: 'inactive_0',
        }),
      },
    },
  };
}

describe('recommendation interaction filtering', () => {
  test('suppresses only the exact evidence and promotes the next candidate', () => {
    const first = buildBusinessRecommendationCatalog(input());
    const suppressed = buildBusinessRecommendationCatalog(input(), {
      suppressEvidence: new Set([
        `${first.primary.stableId}|${first.primary.evidenceFingerprint}`,
      ]),
    });

    expect(suppressed.primary.stableId).not.toBe(first.primary.stableId);
    expect(suppressed.totalEligibleCount).toBe(
      first.totalEligibleCount - 1
    );
    expect(
      suppressed.secondary.length + (suppressed.primary ? 1 : 0)
    ).toBeLessThanOrEqual(3);
  });

  test('a changed fingerprint is not suppressed by an older interaction', () => {
    const first = buildBusinessRecommendationCatalog(input());
    const changed = input();
    changed.schemaVersion = 2;
    const result = buildBusinessRecommendationCatalog(changed, {
      suppressEvidence: new Set([
        `${first.primary.stableId}|${first.primary.evidenceFingerprint}`,
      ]),
    });

    expect(result.primary.stableId).toBe(first.primary.stableId);
    expect(result.primary.evidenceFingerprint).not.toBe(
      first.primary.evidenceFingerprint
    );
  });
});

describe('server-owned recommendation timing policies', () => {
  test.each([
    ['setup.address.resolve', 'dismiss', 30],
    ['setup.address.resolve', 'snooze', 7],
    ['campaign.resume_paused', 'snooze', 1],
    ['growth.near_reward', 'dismiss', 30],
    ['growth.near_reward', 'snooze', 7],
    ['subscription.quota_near', 'dismiss', 14],
    ['subscription.quota_near', 'snooze', 7],
  ])('%s %s uses %d server days', (stableId, action, days) => {
    const policy = getRecommendationInteractionPolicy(
      stableId,
      action,
      NOW
    );
    expect(policy.hiddenUntil).toBe(NOW + days * DAY_MS);
  });

  test('operational dismiss lasts until evidence changes', () => {
    expect(
      getRecommendationInteractionPolicy(
        'campaign.resume_paused',
        'dismiss',
        NOW
      ).hiddenUntil
    ).toBeUndefined();
  });
});
