import { describe, expect, test } from 'bun:test';

import {
  getBusinessRecommendationFacts,
  loadBusinessRecommendationFacts,
} from '../recommendations';
import {
  getBusinessDashboardDay,
  shouldEmitTransitionalCreateFirstCampaign,
} from '../dashboard';
import { getRoleCapabilities } from '../lib/staffPermissions';
import { isDashboardResponseForActiveBusiness } from '../../lib/dashboardBusinessIntegrity';

const NOW = 1_800_000_000_000;

class FakeQuery {
  constructor(rows, failure = null) {
    this.rows = rows;
    this.failure = failure;
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
    if (this.failure) {
      throw this.failure;
    }
    return this.currentRows();
  }

  async first() {
    if (this.failure) {
      throw this.failure;
    }
    return this.currentRows()[0] ?? null;
  }
}

function baseBusiness(overrides = {}) {
  return {
    _id: 'business_1',
    ownerUserId: 'owner_1',
    externalId: 'business-external',
    name: 'Business',
    shortDescription: 'Description',
    businessPhone: '0500000000',
    serviceTypes: ['retail'],
    serviceTags: ['local'],
    onboardingSnapshot: {
      discoverySource: 'other',
      reason: 'other',
      usageAreas: ['loyalty'],
      ownerAgeRange: '25_34',
      businessExample: 'other',
      birthdayCampaignRelevant: false,
      joinAnniversaryCampaignRelevant: false,
      weakTimePromosRelevant: false,
    },
    formattedAddress: 'Main 1, City',
    placeId: 'place_1',
    location: { lat: 32.1, lng: 34.8 },
    city: 'City',
    street: 'Main',
    streetNumber: '1',
    logoUrl: 'https://example.com/logo.png',
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    isActive: true,
    createdAt: NOW - 60 * 24 * 60 * 60 * 1000,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildTables(overrides = {}) {
  return {
    users: [
      { _id: 'owner_1', isActive: true },
      { _id: 'manager_1', isActive: true },
      { _id: 'staff_1', isActive: true },
      { _id: 'customer_1', isActive: true },
    ],
    businesses: [baseBusiness()],
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
        createdAt: NOW - 100_000,
        updatedAt: NOW,
      },
    ],
    memberships: [
      {
        _id: 'membership_1',
        userId: 'customer_1',
        businessId: 'business_1',
        programId: 'program_1',
        currentStamps: 8,
        isActive: true,
        createdAt: NOW - 90_000,
        updatedAt: NOW,
      },
    ],
    campaigns: [],
    campaignRuns: [],
    events: [],
    staffInvites: [],
    referralConfigs: [{ businessId: 'business_1', isEnabled: false }],
    aiUsageLedger: [],
    ...overrides,
  };
}

function buildCtx(tables, actorId = 'owner_1', failures = {}) {
  return {
    auth: {
      getUserIdentity: async () => ({ subject: `${actorId}|session` }),
    },
    db: {
      get: async (id) => {
        for (const rows of Object.values(tables)) {
          if (!Array.isArray(rows)) {
            continue;
          }
          const match = rows.find((row) => row._id === id);
          if (match) {
            return match;
          }
        }
        return null;
      },
      query: (tableName) =>
        new FakeQuery(tables[tableName] ?? [], failures[tableName] ?? null),
    },
  };
}

function authorization(role, capabilityOverrides = {}) {
  return {
    staffRole: role,
    capabilities: {
      ...getRoleCapabilities(role),
      ...capabilityOverrides,
    },
  };
}

describe('server-authoritative business recommendation facts', () => {
  test('owner receives bounded known facts for the requested business', async () => {
    const result = await loadBusinessRecommendationFacts(
      buildCtx(buildTables()),
      'business_1',
      authorization('owner'),
      NOW
    );

    expect(result.businessId).toBe('business_1');
    expect(result.actor.role).toBe('owner');
    expect(result.facts.businessProfile.state).toBe('known');
    expect(result.facts.address.value.isComplete).toBe(true);
    expect(result.facts.logo.value.hasResolvableLogo).toBe(true);
    expect(result.facts.programs.value.activeCount).toBe(1);
    expect(result.facts.customers.value.uniqueActiveCustomerCount).toBe(1);
    expect(result.facts.campaigns.value.totalNonarchivedCampaigns).toBe(0);
    expect(result.facts.campaignQuota.value.campaignDefinitionUsage).toBe(0);
    expect(result.facts.customerLifecycleSegments.nearReward.value.count).toBe(
      1
    );
    expect(result.facts.customerLifecycleSegments.inactive.state).toBe(
      'unknown'
    );
    expect(result.facts.customerLifecycleSegments.inactive).not.toHaveProperty(
      'value'
    );
  });

  test('restricted quota, team, subscription, and customer facts never expose zero values', async () => {
    const result = await loadBusinessRecommendationFacts(
      buildCtx(buildTables()),
      'business_1',
      authorization('staff', {
        access_dashboard: true,
        access_customers: false,
        access_campaigns: false,
      }),
      NOW
    );

    expect(result.facts.customers).toEqual({
      state: 'restricted',
      requiredCapability: 'access_customers',
    });
    expect(result.facts.campaigns.state).toBe('restricted');
    expect(result.facts.campaignQuota.state).toBe('restricted');
    expect(result.facts.team.state).toBe('restricted');
    expect(result.facts.subscription.state).toBe('restricted');
    expect(result.facts.customerLifecycleSegments.inactive.state).toBe(
      'restricted'
    );
    for (const fact of [
      result.facts.customers,
      result.facts.campaigns,
      result.facts.campaignQuota,
      result.facts.team,
      result.facts.subscription,
    ]) {
      expect(fact).not.toHaveProperty('value');
    }
  });

  test('owner and manager with dashboard access receive the requested business facts', async () => {
    const tables = buildTables();
    const ownerResult = await getBusinessRecommendationFacts._handler(
      buildCtx(tables, 'owner_1'),
      { businessId: 'business_1' }
    );
    const result = await getBusinessRecommendationFacts._handler(
      buildCtx(tables, 'manager_1'),
      { businessId: 'business_1' }
    );

    expect(ownerResult.businessId).toBe('business_1');
    expect(result.businessId).toBe('business_1');
    expect(result.facts.campaignQuota.state).toBe('known');
    expect(result.facts.team.state).toBe('known');
    expect(result.facts.subscription).toEqual({
      state: 'restricted',
      requiredCapability: 'view_billing_state',
    });
  });

  test('campaign lifecycle truth remains known when campaign quota is restricted', async () => {
    const tables = buildTables({
      campaigns: [
        {
          _id: 'scheduled_1',
          businessId: 'business_1',
          type: 'promo',
          status: 'active',
          activationStatus: 'active',
          automationEnabled: false,
          schedule: { mode: 'one_time', sendAt: NOW + 60_000 },
          isActive: true,
          createdAt: NOW - 10_000,
          updatedAt: NOW - 5_000,
        },
        {
          _id: 'recurring_1',
          businessId: 'business_1',
          type: 'promo',
          status: 'active',
          activationStatus: 'active',
          automationEnabled: true,
          schedule: { mode: 'recurring' },
          isActive: true,
          createdAt: NOW - 20_000,
          updatedAt: NOW - 4_000,
        },
      ],
    });
    const result = await loadBusinessRecommendationFacts(
      buildCtx(tables),
      'business_1',
      authorization('manager', { view_usage_quota: false }),
      NOW
    );
    const campaignFacts = result.facts.campaigns.value;

    expect(result.facts.campaignQuota).toEqual({
      state: 'restricted',
      requiredCapability: 'view_usage_quota',
    });
    expect(campaignFacts.scheduledCount).toBe(1);
    expect(campaignFacts.recurringCount).toBe(1);
    expect(campaignFacts.meaningfullyActiveCount).toBe(2);
    expect(
      shouldEmitTransitionalCreateFirstCampaign({
        campaignFacts,
        activeProgramsCount: 1,
        activeCustomerCount: 1,
        canCreateCampaigns: true,
      })
    ).toBe(false);
  });

  test('campaign definition usage is a separate fact from lifecycle counts', async () => {
    const result = await loadBusinessRecommendationFacts(
      buildCtx(buildTables()),
      'business_1',
      authorization('owner'),
      NOW
    );

    expect(result.facts.campaigns.value).not.toHaveProperty(
      'campaignDefinitionUsage'
    );
    expect(result.facts.campaignQuota.value).toHaveProperty(
      'campaignDefinitionUsage'
    );
  });

  test('a required campaign read failure rejects instead of producing zero campaigns', async () => {
    await expect(
      loadBusinessRecommendationFacts(
        buildCtx(buildTables(), 'owner_1', {
          campaigns: new Error('internal campaign read failure'),
        }),
        'business_1',
        authorization('owner'),
        NOW
      )
    ).rejects.toThrow();
  });

  test('ordinary staff and unrelated actors cannot invoke the dashboard facts query', async () => {
    await expect(
      getBusinessRecommendationFacts._handler(
        buildCtx(buildTables(), 'staff_1'),
        { businessId: 'business_1' }
      )
    ).rejects.toThrow('NOT_AUTHORIZED');

    await expect(
      getBusinessRecommendationFacts._handler(
        buildCtx(buildTables(), 'customer_1'),
        { businessId: 'business_1' }
      )
    ).rejects.toThrow('NOT_AUTHORIZED');
  });
});

describe('transitional create-first campaign eligibility', () => {
  const emptyCampaignFacts = {
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
    firstScheduledCampaignId: null,
    firstRecurringCampaignId: null,
    nextScheduled: null,
    lifecycleSourceVersion: 'campaign-state-v1',
  };

  test('allows the action only for known empty campaigns with valid prerequisites', () => {
    expect(
      shouldEmitTransitionalCreateFirstCampaign({
        campaignFacts: emptyCampaignFacts,
        activeProgramsCount: 1,
        activeCustomerCount: 1,
        canCreateCampaigns: true,
      })
    ).toBe(true);
  });

  test('unknown campaigns and unknown or missing prerequisites suppress the action', () => {
    for (const input of [
      {
        campaignFacts: null,
        activeProgramsCount: 1,
        activeCustomerCount: 1,
        canCreateCampaigns: true,
      },
      {
        campaignFacts: emptyCampaignFacts,
        activeProgramsCount: 0,
        activeCustomerCount: 1,
        canCreateCampaigns: true,
      },
      {
        campaignFacts: emptyCampaignFacts,
        activeProgramsCount: 1,
        activeCustomerCount: null,
        canCreateCampaigns: true,
      },
      {
        campaignFacts: emptyCampaignFacts,
        activeProgramsCount: 1,
        activeCustomerCount: 0,
        canCreateCampaigns: true,
      },
      {
        campaignFacts: emptyCampaignFacts,
        activeProgramsCount: 1,
        activeCustomerCount: 1,
        canCreateCampaigns: false,
      },
    ]) {
      expect(shouldEmitTransitionalCreateFirstCampaign(input)).toBe(false);
    }
  });

  test('draft, paused, scheduled, recurring, completed, and inconsistent rows suppress create-first', () => {
    for (const field of [
      'draftCount',
      'pausedCount',
      'scheduledCount',
      'recurringCount',
      'completedCount',
      'inconsistentCount',
    ]) {
      expect(
        shouldEmitTransitionalCreateFirstCampaign({
          campaignFacts: {
            ...emptyCampaignFacts,
            totalNonarchivedCampaigns: 1,
            [field]: 1,
          },
          activeProgramsCount: 1,
          activeCustomerCount: 1,
          canCreateCampaigns: true,
        })
      ).toBe(false);
    }
  });
});

describe('active-business recommendation integrity', () => {
  test('A-business facts cannot be presented for active business B', () => {
    expect(
      isDashboardResponseForActiveBusiness({
        responseBusinessId: 'business_a',
        activeBusinessId: 'business_b',
        isSwitchingBusiness: false,
      })
    ).toBe(false);
  });

  test('recommendations are withheld during a switch and allowed after IDs match', () => {
    expect(
      isDashboardResponseForActiveBusiness({
        responseBusinessId: 'business_a',
        activeBusinessId: 'business_a',
        isSwitchingBusiness: true,
      })
    ).toBe(false);
    expect(
      isDashboardResponseForActiveBusiness({
        responseBusinessId: 'business_a',
        activeBusinessId: 'business_a',
        isSwitchingBusiness: false,
      })
    ).toBe(true);
  });
});

describe('dashboard day business identity contract', () => {
  test('returns the exact requested authorized businessId', async () => {
    const result = await getBusinessDashboardDay._handler(
      buildCtx(buildTables(), 'owner_1'),
      {
        businessId: 'business_1',
        dayStart: NOW,
        rangeDays: 1,
      }
    );

    expect(result.businessId).toBe('business_1');
    expect(result.businessId).not.toBe('business_2');
  });

  test('rejects an actor unauthorized for the requested business', async () => {
    await expect(
      getBusinessDashboardDay._handler(
        buildCtx(buildTables(), 'customer_1'),
        {
          businessId: 'business_1',
          dayStart: NOW,
          rangeDays: 1,
        }
      )
    ).rejects.toThrow('NOT_AUTHORIZED');
  });
});
