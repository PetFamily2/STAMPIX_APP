import { describe, expect, test } from 'bun:test';

import { buildBusinessRecommendationCatalog } from '../lib/recommendationCatalog';

const NOW = 1_800_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const known = (value, observedAt = NOW) => ({
  state: 'known',
  value,
  observedAt,
});
const restricted = () => ({
  state: 'restricted',
  requiredCapability: 'access_customers',
});
const unknown = () => ({
  state: 'unknown',
  reasonCode: 'INSUFFICIENT_EVIDENCE',
});

function baseInput() {
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
        isComplete: true,
        missingFieldIds: [],
      }),
      address: known({ isComplete: true }),
      programs: known({
        activeCount: 1,
        draftCount: 0,
        firstDraftProgramId: null,
      }),
      customers: known({ uniqueActiveCustomerCount: 5 }),
      campaigns: known({
        totalNonarchivedCampaigns: 1,
        draftCount: 0,
        scheduledCount: 0,
        recurringCount: 0,
        pausedCount: 0,
        completedCount: 1,
        inconsistentCount: 0,
        meaningfullyActiveCount: 0,
        firstDraftCampaignId: null,
        firstPausedCampaignId: null,
        nextScheduled: null,
        lifecycleSourceVersion: 'campaign_lifecycle_v1',
      }),
      campaignQuota: known({
        campaignDefinitionUsage: 1,
        campaignDefinitionLimit: 10,
        isAtOrAboveLimit: false,
      }),
      team: known({
        activeNonOwnerStaffCount: 0,
        unexpiredPendingInvitationCount: 0,
      }),
      subscription: known({
        plan: 'starter',
        status: 'active',
      }),
      customerLifecycleSegments: {
        nearReward: known({
          count: 0,
          evidenceFingerprint: 'segment_near_0',
        }),
        inactive: known({
          count: 0,
          evidenceFingerprint: 'segment_inactive_0',
        }),
      },
    },
  };
}

function visibleIds(result) {
  return [
    ...(result.primary ? [result.primary.stableId] : []),
    ...result.secondary.map((item) => item.stableId),
  ];
}

function campaignCreateInput() {
  const input = baseInput();
  input.facts.campaigns = known({
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
  });
  return input;
}

describe('deterministic business recommendation catalog', () => {
  test('subscription blocker outranks setup and growth', () => {
    const input = baseInput();
    input.facts.subscription = known({ plan: 'pro', status: 'past_due' });
    input.facts.address = known({ isComplete: false });
    input.facts.customerLifecycleSegments.inactive = known({
      count: 9,
      evidenceFingerprint: 'inactive_9',
    });

    const result = buildBusinessRecommendationCatalog(input);

    expect(result.primary?.stableId).toBe(
      'subscription.action_required'
    );
    expect(result.primary?.priority).toBe(0);
    expect(result.primary?.placement).toBe('primary');
  });

  test('address outranks profile and profile excludes address duplication', () => {
    const input = baseInput();
    input.facts.address = known({ isComplete: false });
    input.facts.businessProfile = known({
      isComplete: false,
      missingFieldIds: ['address', 'name'],
    });

    const result = buildBusinessRecommendationCatalog(input);

    expect(result.primary?.stableId).toBe('setup.address.resolve');
    expect(result.secondary[0]?.stableId).toBe(
      'setup.profile.complete'
    );
    expect(result.secondary[0]?.count).toBe(1);
    expect(result.secondary[0]?.action.fieldId).toBe('name');
  });

  test('address-only profile incompleteness does not duplicate profile guidance', () => {
    const input = baseInput();
    input.facts.address = known({ isComplete: false });
    input.facts.businessProfile = known({
      isComplete: false,
      missingFieldIds: ['address'],
    });

    const result = buildBusinessRecommendationCatalog(input);

    expect(visibleIds(result)).toEqual(['setup.address.resolve']);
  });

  test('no active or draft program emits publish-first and suppresses campaign and customer growth', () => {
    const input = baseInput();
    input.facts.programs = known({
      activeCount: 0,
      draftCount: 0,
      firstDraftProgramId: null,
    });
    input.facts.campaigns.value.totalNonarchivedCampaigns = 0;
    input.facts.customerLifecycleSegments.inactive = known({
      count: 8,
      evidenceFingerprint: 'inactive_8',
    });
    input.facts.customerLifecycleSegments.nearReward = known({
      count: 4,
      evidenceFingerprint: 'near_4',
    });

    const result = buildBusinessRecommendationCatalog(input);

    expect(result.primary?.stableId).toBe('program.publish_first');
    expect(visibleIds(result)).not.toContain('campaign.create_first');
    expect(visibleIds(result)).not.toContain(
      'retention.reengage_inactive'
    );
    expect(visibleIds(result)).not.toContain('growth.near_reward');
  });

  test('a draft program emits publish-draft with the exact program ID', () => {
    const input = baseInput();
    input.facts.programs = known({
      activeCount: 0,
      draftCount: 2,
      firstDraftProgramId: 'program_draft_1',
    });

    const result = buildBusinessRecommendationCatalog(input);

    expect(result.primary?.stableId).toBe('program.publish_draft');
    expect(result.primary?.entityId).toBe('program_draft_1');
    expect(result.primary?.action).toEqual({
      type: 'open_program',
      programId: 'program_draft_1',
    });
    expect(visibleIds(result)).not.toContain('program.publish_first');
  });

  test('a genuinely empty campaign set may emit create-first', () => {
    const input = baseInput();
    input.facts.campaigns.value.totalNonarchivedCampaigns = 0;
    input.facts.campaigns.value.completedCount = 0;

    const result = buildBusinessRecommendationCatalog(input);

    expect(result.primary?.stableId).toBe('campaign.create_first');
  });

  test.each([
    ['draft', { draftCount: 1, firstDraftCampaignId: 'draft_1' }],
    ['paused', { pausedCount: 1, firstPausedCampaignId: 'paused_1' }],
    [
      'scheduled',
      {
        totalNonarchivedCampaigns: 1,
        scheduledCount: 1,
        meaningfullyActiveCount: 1,
        nextScheduled: {
          campaignId: 'scheduled_1',
          timestamp: NOW + DAY_MS,
        },
      },
    ],
    [
      'recurring',
      {
        totalNonarchivedCampaigns: 1,
        recurringCount: 1,
        meaningfullyActiveCount: 1,
      },
    ],
    [
      'inconsistent',
      {
        totalNonarchivedCampaigns: 1,
        inconsistentCount: 1,
      },
    ],
  ])('%s campaign posture suppresses create-first', (_name, patch) => {
    const input = baseInput();
    Object.assign(input.facts.campaigns.value, {
      totalNonarchivedCampaigns: 1,
      completedCount: 0,
      ...patch,
    });

    const result = buildBusinessRecommendationCatalog(input);

    expect(visibleIds(result)).not.toContain('campaign.create_first');
  });

  test('paused posture precedes drafts', () => {
    const input = baseInput();
    Object.assign(input.facts.campaigns.value, {
      totalNonarchivedCampaigns: 2,
      completedCount: 0,
      pausedCount: 1,
      firstPausedCampaignId: 'paused_1',
      draftCount: 1,
      firstDraftCampaignId: 'draft_1',
    });

    const result = buildBusinessRecommendationCatalog(input);

    expect(result.primary?.stableId).toBe('campaign.resume_paused');
    expect(visibleIds(result)).not.toContain('campaign.publish_draft');
  });

  test('scheduled work within seven days emits only a secondary scheduled item', () => {
    const input = baseInput();
    Object.assign(input.facts.campaigns.value, {
      scheduledCount: 1,
      completedCount: 0,
      meaningfullyActiveCount: 1,
      nextScheduled: {
        campaignId: 'scheduled_1',
        timestamp: NOW + 7 * DAY_MS,
      },
    });

    const result = buildBusinessRecommendationCatalog(input);

    expect(result.primary).toBeNull();
    expect(result.secondary[0]?.stableId).toBe(
      'campaign.next_scheduled'
    );
    expect(result.secondary[0]?.entityId).toBe('scheduled_1');
  });

  test('scheduled work outside seven days is not recommended', () => {
    const input = baseInput();
    Object.assign(input.facts.campaigns.value, {
      scheduledCount: 1,
      completedCount: 0,
      meaningfullyActiveCount: 1,
      nextScheduled: {
        campaignId: 'scheduled_1',
        timestamp: NOW + 7 * DAY_MS + 1,
      },
    });

    expect(
      visibleIds(buildBusinessRecommendationCatalog(input))
    ).not.toContain('campaign.next_scheduled');
  });

  test('reliable inactive customers may emit retention while unknown evidence suppresses it', () => {
    const reliableInput = baseInput();
    reliableInput.facts.customerLifecycleSegments.inactive = known({
      count: 3,
      evidenceFingerprint: 'inactive_3',
    });
    const unknownInput = baseInput();
    unknownInput.facts.customerLifecycleSegments.inactive = unknown();

    expect(
      visibleIds(buildBusinessRecommendationCatalog(reliableInput))
    ).toContain('retention.reengage_inactive');
    expect(
      visibleIds(buildBusinessRecommendationCatalog(unknownInput))
    ).not.toContain('retention.reengage_inactive');
  });

  test('near-reward requires an active program and customer access', () => {
    const allowed = baseInput();
    allowed.facts.customerLifecycleSegments.nearReward = known({
      count: 2,
      evidenceFingerprint: 'near_2',
    });
    const denied = baseInput();
    denied.facts.customerLifecycleSegments.nearReward =
      allowed.facts.customerLifecycleSegments.nearReward;
    denied.actor.capabilities.accessCustomers = false;

    expect(
      visibleIds(buildBusinessRecommendationCatalog(allowed))
    ).toContain('growth.near_reward');
    expect(
      visibleIds(buildBusinessRecommendationCatalog(denied))
    ).not.toContain('growth.near_reward');
  });

  test('pending invitations require team permission', () => {
    const allowed = baseInput();
    allowed.facts.team.value.unexpiredPendingInvitationCount = 2;
    const denied = baseInput();
    denied.facts.team.value.unexpiredPendingInvitationCount = 2;
    denied.actor.capabilities.manageTeam = false;

    expect(
      visibleIds(buildBusinessRecommendationCatalog(allowed))
    ).toContain('team.pending_invitations');
    expect(
      visibleIds(buildBusinessRecommendationCatalog(denied))
    ).not.toContain('team.pending_invitations');
  });

  test.each([
    [8, 10, 3],
    [10, 10, 2],
  ])('quota emits at usage %i of %i with P%i', (usage, limit, priority) => {
    const input = baseInput();
    input.facts.campaignQuota = known({
      campaignDefinitionUsage: usage,
      campaignDefinitionLimit: limit,
      isAtOrAboveLimit: usage >= limit,
    });

    const result = buildBusinessRecommendationCatalog(input);
    const quotaRecommendation = [
      result.primary,
      ...result.secondary,
    ].find((item) => item?.stableId === 'subscription.quota_near');

    expect(quotaRecommendation?.priority).toBe(priority);
    expect(quotaRecommendation?.action).toEqual({
      type: 'open_subscription',
      limitKey: 'campaigns',
    });
  });

  test('quota is hidden without subscription-management permission', () => {
    const input = baseInput();
    input.facts.campaignQuota.value.campaignDefinitionUsage = 10;
    input.facts.campaignQuota.value.isAtOrAboveLimit = true;
    input.actor.capabilities.manageSubscription = false;

    expect(
      visibleIds(buildBusinessRecommendationCatalog(input))
    ).not.toContain('subscription.quota_near');
  });

  test('known below-limit quota allows campaign.create_first', () => {
    const input = campaignCreateInput();
    input.facts.campaignQuota = known({
      campaignDefinitionUsage: 0,
      campaignDefinitionLimit: 10,
      isAtOrAboveLimit: false,
    });

    expect(
      visibleIds(buildBusinessRecommendationCatalog(input))
    ).toContain('campaign.create_first');
  });

  test('known hard-limit quota suppresses campaign.create_first', () => {
    const input = campaignCreateInput();
    input.facts.campaignQuota = known({
      campaignDefinitionUsage: 10,
      campaignDefinitionLimit: 10,
      isAtOrAboveLimit: true,
    });

    expect(
      visibleIds(buildBusinessRecommendationCatalog(input))
    ).not.toContain('campaign.create_first');
  });

  test.each([
    ['unknown', unknown()],
    ['restricted', restricted()],
  ])(
    '%s quota does not suppress campaign.create_first by itself',
    (_label, quotaFact) => {
      const input = campaignCreateInput();
      input.facts.campaignQuota = quotaFact;
      const ids = visibleIds(buildBusinessRecommendationCatalog(input));

      expect(ids).toContain('campaign.create_first');
      expect(ids).not.toContain('subscription.quota_near');
    }
  );

  test('unknown and restricted facts never become zero-based eligibility', () => {
    const input = baseInput();
    input.facts.campaigns = restricted();
    input.facts.customers = unknown();
    input.facts.team = restricted();
    input.facts.subscription = unknown();
    input.facts.customerLifecycleSegments.nearReward = restricted();
    input.facts.customerLifecycleSegments.inactive = unknown();

    const result = buildBusinessRecommendationCatalog(input);

    expect(result.primary).toBeNull();
    expect(result.secondary).toEqual([]);
    expect(result.totalEligibleCount).toBe(0);
  });

  test('ranking returns at most one primary, two secondary, and three visible', () => {
    const input = baseInput();
    input.facts.address = known({ isComplete: false });
    input.facts.businessProfile = known({
      isComplete: false,
      missingFieldIds: ['name', 'serviceTypes'],
    });
    input.facts.customerLifecycleSegments.inactive = known({
      count: 5,
      evidenceFingerprint: 'inactive_5',
    });
    input.facts.customerLifecycleSegments.nearReward = known({
      count: 4,
      evidenceFingerprint: 'near_4',
    });
    input.facts.team.value.unexpiredPendingInvitationCount = 2;
    input.facts.campaignQuota.value.campaignDefinitionUsage = 8;

    const result = buildBusinessRecommendationCatalog(input);

    expect(result.primary).not.toBeNull();
    expect(result.secondary.length).toBeLessThanOrEqual(2);
    expect(visibleIds(result).length).toBeLessThanOrEqual(3);
    expect(result.totalEligibleCount).toBeGreaterThan(3);
  });

  test('no eligible evidence produces no fake fallback', () => {
    const result = buildBusinessRecommendationCatalog(baseInput());

    expect(result.primary).toBeNull();
    expect(result.secondary).toEqual([]);
    expect(result.totalEligibleCount).toBe(0);
    expect(JSON.stringify(result)).not.toContain('fallback');
  });

  test('evidence fingerprints are stable, opaque, and exclude private source values', () => {
    const first = baseInput();
    first.facts.businessProfile = known({
      isComplete: false,
      missingFieldIds: ['name'],
    });
    const second = structuredClone(first);
    second.generatedAt = NOW + 60_000;

    const firstResult = buildBusinessRecommendationCatalog(first);
    const secondResult = buildBusinessRecommendationCatalog(second);
    const fingerprint = firstResult.primary?.evidenceFingerprint;

    expect(fingerprint).toBe(
      secondResult.primary?.evidenceFingerprint
    );
    expect(fingerprint).toMatch(/^rec_v1_[a-f0-9]{8}$/);
    expect(fingerprint).not.toContain('name');
    expect(JSON.stringify(firstResult)).not.toContain('0500000000');
  });
});
