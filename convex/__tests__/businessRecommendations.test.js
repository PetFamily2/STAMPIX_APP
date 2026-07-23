import { describe, expect, test } from 'bun:test';

import {
  getBusinessRecommendations,
  loadBusinessRecommendationFacts,
} from '../recommendations';
import { getRoleCapabilities } from '../lib/staffPermissions';

const NOW = 1_800_000_000_000;

class FakeQuery {
  constructor(rows) {
    this.rows = rows;
    this.predicates = [];
  }

  withIndex(_name, builder) {
    const predicates = [];
    const q = {
      eq: (field, value) => {
        predicates.push((row) => row[field] === value);
        return q;
      },
      lte: (field, value) => {
        predicates.push((row) => row[field] <= value);
        return q;
      },
    };
    builder(q);
    this.predicates.push((row) =>
      predicates.every((predicate) => predicate(row))
    );
    return this;
  }

  filter(builder) {
    const resolve = (operand, row) =>
      typeof operand === 'function' ? operand(row) : operand;
    const q = {
      field: (field) => (row) => row[field],
      eq: (left, right) => (row) =>
        resolve(left, row) === resolve(right, row),
    };
    this.predicates.push(builder(q));
    return this;
  }

  currentRows() {
    return this.rows.filter((row) =>
      this.predicates.every((predicate) => predicate(row))
    );
  }

  async collect() {
    return this.currentRows();
  }

  async first() {
    return this.currentRows()[0] ?? null;
  }
}

function business(id, ownerUserId) {
  return {
    _id: id,
    ownerUserId,
    externalId: `external_${id}`,
    name: 'Business',
    shortDescription: 'Description',
    businessPhone: '0500000000',
    serviceTypes: ['retail'],
    serviceTags: ['local'],
    onboardingSnapshot: {
      discoverySource: 'other',
      reason: 'other',
      usageAreas: ['nearby'],
      ownerAgeRange: '25-34',
      businessExample: 'other',
      birthdayCampaignRelevant: false,
      joinAnniversaryCampaignRelevant: false,
      weakTimePromosRelevant: false,
    },
    formattedAddress: 'Main 1, City',
    placeId: `place_${id}`,
    location: { lat: 32.1, lng: 34.8 },
    city: 'City',
    street: 'Main',
    streetNumber: '1',
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    isActive: true,
    createdAt: NOW - 100_000,
    updatedAt: NOW,
  };
}

function tables() {
  return {
    users: [
      { _id: 'owner_1', isActive: true },
      { _id: 'manager_1', isActive: true },
      { _id: 'staff_1', isActive: true },
      { _id: 'owner_2', isActive: true },
      { _id: 'customer_1', isActive: true },
    ],
    businesses: [
      business('business_1', 'owner_1'),
      business('business_2', 'owner_2'),
    ],
    businessStaff: [
      {
        _id: 'owner_link',
        businessId: 'business_1',
        userId: 'owner_1',
        staffRole: 'owner',
        status: 'active',
        isActive: true,
      },
      {
        _id: 'manager_link',
        businessId: 'business_1',
        userId: 'manager_1',
        staffRole: 'manager',
        status: 'active',
        isActive: true,
      },
      {
        _id: 'staff_link',
        businessId: 'business_1',
        userId: 'staff_1',
        staffRole: 'staff',
        status: 'active',
        isActive: true,
      },
      {
        _id: 'owner_2_link',
        businessId: 'business_2',
        userId: 'owner_2',
        staffRole: 'owner',
        status: 'active',
        isActive: true,
      },
    ],
    loyaltyPrograms: [
      {
        _id: 'program_1',
        businessId: 'business_1',
        status: 'active',
        title: 'Program',
        rewardName: 'Reward',
        maxStamps: 10,
        stampIcon: 'star',
        isActive: true,
        createdAt: NOW - 90_000,
        updatedAt: NOW,
      },
      {
        _id: 'program_2',
        businessId: 'business_2',
        status: 'active',
        title: 'Program',
        rewardName: 'Reward',
        maxStamps: 10,
        stampIcon: 'star',
        isActive: true,
        createdAt: NOW - 80_000,
        updatedAt: NOW,
      },
    ],
    memberships: [
      {
        _id: 'membership_1',
        userId: 'customer_1',
        businessId: 'business_1',
        programId: 'program_1',
        currentStamps: 1,
        isActive: true,
        createdAt: NOW - 70_000,
        updatedAt: NOW,
      },
    ],
    campaigns: [],
    campaignRuns: [],
    events: [],
    staffInvites: [],
    subscriptions: [],
    referralConfigs: [
      {
        _id: 'referral_config_1',
        businessId: 'business_1',
        isEnabled: false,
        configVersion: 1,
        rewardType: 'STAMP',
        rewardValue: 1,
        rewardRecipients: 'both',
        monthlyLimit: 10,
        createdByUserId: 'owner_1',
        updatedByUserId: 'owner_1',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    aiUsageLedger: [],
  };
}

function ctx(actorId) {
  const data = tables();
  return {
    auth: {
      getUserIdentity: async () => ({
        subject: `${actorId}|session`,
      }),
    },
    db: {
      get: async (id) => {
        for (const rows of Object.values(data)) {
          if (!Array.isArray(rows)) {
            continue;
          }
          const row = rows.find((item) => item._id === id);
          if (row) {
            return row;
          }
        }
        return null;
      },
      query: (tableName) => new FakeQuery(data[tableName] ?? []),
    },
  };
}

describe('getBusinessRecommendations authorization and identity', () => {
  test('owner receives a bounded response for the exact requested business', async () => {
    const ownerCtx = ctx('owner_1');
    const recommendationFacts = await loadBusinessRecommendationFacts(
      ownerCtx,
      'business_1',
      {
        staffRole: 'owner',
        capabilities: getRoleCapabilities('owner'),
      }
    );
    const result = await getBusinessRecommendations._handler(
      ownerCtx,
      { businessId: 'business_1' }
    );

    expect(recommendationFacts.facts.campaignQuota.state).toBe('known');
    const campaignQuota = recommendationFacts.facts.campaignQuota.value;
    expect(campaignQuota.campaignDefinitionUsage).toBe(0);
    expect(campaignQuota.campaignDefinitionLimit).toBe(1);
    expect(
      campaignQuota.campaignDefinitionUsage /
        campaignQuota.campaignDefinitionLimit
    ).toBeLessThan(0.8);
    expect(campaignQuota.isAtOrAboveLimit).toBe(false);
    expect(result.businessId).toBe('business_1');
    expect(result.schemaVersion).toBe(1);
    expect(typeof result.generatedAt).toBe('number');
    expect(result.primary?.stableId).toBe('campaign.create_first');
    expect(result.primary?.priority).toBe(2);
    expect(result.primary?.action).toEqual({ type: 'open_campaigns' });
    expect(Object.keys(result).sort()).toEqual(
      [
        'businessId',
        'generatedAt',
        'primary',
        'schemaVersion',
        'secondary',
        'totalEligibleCount',
      ].sort()
    );
    const visibleRecommendations = [
      ...(result.primary ? [result.primary] : []),
      ...result.secondary,
    ];
    const visibleStableIds = visibleRecommendations.map(
      (recommendation) => recommendation.stableId
    );
    expect(visibleStableIds).not.toContain('setup.address.resolve');
    expect(visibleStableIds).not.toContain('setup.profile.complete');
    expect(visibleStableIds).not.toContain('program.publish_first');
    expect(visibleStableIds).not.toContain('program.publish_draft');
    expect(visibleStableIds).not.toContain(
      'subscription.action_required'
    );
    expect(visibleStableIds).not.toContain('subscription.quota_near');
    expect(
      visibleRecommendations.filter(
        (recommendation) => recommendation.placement === 'primary'
      ).length
    ).toBeLessThanOrEqual(1);
    expect(result.secondary.length).toBeLessThanOrEqual(2);
    expect(visibleRecommendations.length).toBeLessThanOrEqual(3);
    const allowedRecommendationFields = new Set([
      'stableId',
      'category',
      'priority',
      'placement',
      'title',
      'reason',
      'ctaLabel',
      'action',
      'evidenceFingerprint',
      'evidenceObservedAt',
      'entityId',
      'count',
      'tone',
    ]);
    for (const recommendation of visibleRecommendations) {
      expect(
        Object.keys(recommendation).every((field) =>
          allowedRecommendationFields.has(field)
        )
      ).toBe(true);
    }
    expect(
      visibleRecommendations.map((recommendation) => recommendation.priority)
    ).toEqual(
      visibleRecommendations
        .map((recommendation) => recommendation.priority)
        .sort((left, right) => left - right)
    );
    const serializedResult = JSON.stringify(result);
    expect(serializedResult).not.toContain('0500000000');
    expect(serializedResult).not.toContain('Main 1, City');
    expect(serializedResult).not.toContain('customer_1');
  });

  test('manager with dashboard access receives restricted-safe recommendations', async () => {
    const result = await getBusinessRecommendations._handler(
      ctx('manager_1'),
      { businessId: 'business_1' }
    );

    expect(result.businessId).toBe('business_1');
    expect(
      [result.primary, ...result.secondary].some(
        (item) => item?.stableId === 'subscription.action_required'
      )
    ).toBe(false);
  });

  test('ordinary staff without access_dashboard is rejected', async () => {
    await expect(
      getBusinessRecommendations._handler(ctx('staff_1'), {
        businessId: 'business_1',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  test('an actor from business A cannot request business B', async () => {
    await expect(
      getBusinessRecommendations._handler(ctx('owner_1'), {
        businessId: 'business_2',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });
});
