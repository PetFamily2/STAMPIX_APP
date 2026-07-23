import { describe, expect, test } from 'bun:test';

import {
  acknowledgeBusinessRecommendationGuideStatus,
  dismissBusinessRecommendation,
  getBusinessRecommendationGuideStatus,
  getBusinessRecommendations,
  loadBusinessRecommendationFacts,
  snoozeBusinessRecommendation,
  startBusinessRecommendationGuide,
} from '../recommendations';
import { getRoleCapabilities } from '../lib/staffPermissions';

const NOW = 1_800_000_000_000;
const EXPECTED_GUIDE_IDS = {
  'subscription.action_required': 'subscription-recover',
  'setup.address.resolve': 'address-resolve',
  'setup.profile.complete': 'profile-complete',
  'program.publish_first': 'program-create',
  'program.publish_draft': 'program-publish',
  'campaign.create_first': 'campaign-create',
  'campaign.publish_draft': 'campaign-publish',
  'campaign.resume_paused': 'campaign-resume',
  'campaign.next_scheduled': 'campaign-schedule-review',
  'retention.reengage_inactive': 'inactive-review',
  'growth.near_reward': 'near-reward',
  'team.pending_invitations': 'team-pending',
  'subscription.quota_near': 'quota-review',
};

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
    recommendationInteractions: [],
    recommendationGuideSessions: [],
  };
}

function ctx(actorId, customize) {
  const data = tables();
  customize?.(data);
  let nextId = 1;
  const context = {
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
      normalizeId: (tableName, id) =>
        typeof id === 'string' && Array.isArray(data[tableName])
          ? id
          : null,
      insert: async (tableName, value) => {
        const id = `${tableName}_${nextId}`;
        nextId += 1;
        data[tableName] ??= [];
        data[tableName].push({ _id: id, ...value });
        return id;
      },
      patch: async (id, patch) => {
        for (const rows of Object.values(data)) {
          if (!Array.isArray(rows)) {
            continue;
          }
          const row = rows.find((item) => item._id === id);
          if (row) {
            for (const [key, value] of Object.entries(patch)) {
              if (value === undefined) {
                delete row[key];
              } else {
                row[key] = value;
              }
            }
            return;
          }
        }
        throw new Error('ROW_NOT_FOUND');
      },
    },
  };
  context.data = data;
  return context;
}

function setActor(context, actorId) {
  context.auth.getUserIdentity = async () => ({
    subject: `${actorId}|session`,
  });
}

function visibleRecommendation(result, stableId) {
  return [result.primary, ...result.secondary].find(
    (recommendation) => recommendation?.stableId === stableId
  );
}

function managementCampaign(id, overrides = {}) {
  return {
    _id: id,
    businessId: 'business_1',
    status: 'draft',
    activationStatus: 'draft',
    isActive: true,
    automationEnabled: false,
    createdAt: NOW - 10_000,
    updatedAt: NOW,
    ...overrides,
  };
}

function scheduledCampaign(id, sendAt) {
  return managementCampaign(id, {
    status: 'active',
    activationStatus: 'active',
    schedule: { mode: 'one_time', sendAt },
  });
}

async function issueGuideSession(context, recommendation) {
  const session = await startBusinessRecommendationGuide._handler(context, {
    businessId: 'business_1',
    stableId: recommendation.stableId,
    guideId: recommendation.guideId,
  });
  return {
    session,
    args: {
      guideSessionId: session.guideSessionId,
      businessId: session.businessId,
      stableId: session.stableId,
      guideId: session.guideId,
      evidenceFingerprint: session.evidenceFingerprint,
      ...(session.entityId ? { entityId: session.entityId } : {}),
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
    expect(result.primary?.guideId).toBe('campaign-create');
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
      'guideId',
    ]);
    for (const recommendation of visibleRecommendations) {
      const unexpectedFields = Object.keys(recommendation).filter(
        (field) => !allowedRecommendationFields.has(field)
      );
      expect(unexpectedFields).toEqual([]);
      expect(typeof recommendation.guideId).toBe('string');
      expect(recommendation.guideId.length).toBeGreaterThan(0);
      expect(
        Object.prototype.hasOwnProperty.call(
          EXPECTED_GUIDE_IDS,
          recommendation.stableId
        )
      ).toBe(true);
      expect(recommendation.guideId).toBe(
        EXPECTED_GUIDE_IDS[recommendation.stableId]
      );
      expect(Object.values(EXPECTED_GUIDE_IDS)).toContain(
        recommendation.guideId
      );
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

describe('recommendation interaction handlers', () => {
  test('dismiss derives the actor and upserts only exact current evidence', async () => {
    const ownerCtx = ctx('owner_1');
    const response = await getBusinessRecommendations._handler(ownerCtx, {
      businessId: 'business_1',
    });
    const recommendation = visibleRecommendation(
      response,
      'campaign.create_first'
    );

    await dismissBusinessRecommendation._handler(ownerCtx, {
      businessId: 'business_1',
      stableId: recommendation.stableId,
      evidenceFingerprint: recommendation.evidenceFingerprint,
      actorUserId: 'owner_2',
      hiddenUntil: 1,
      duration: 1,
    });
    await dismissBusinessRecommendation._handler(ownerCtx, {
      businessId: 'business_1',
      stableId: recommendation.stableId,
      evidenceFingerprint: recommendation.evidenceFingerprint,
    });

    expect(ownerCtx.data.recommendationInteractions).toHaveLength(1);
    expect(ownerCtx.data.recommendationInteractions[0].actorUserId).toBe(
      'owner_1'
    );
    expect(
      ownerCtx.data.recommendationInteractions[0].hiddenUntil
    ).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });

  test('snooze uses the server duration and another actor remains unaffected', async () => {
    const sharedCtx = ctx('owner_1');
    const response = await getBusinessRecommendations._handler(sharedCtx, {
      businessId: 'business_1',
    });
    const recommendation = visibleRecommendation(
      response,
      'campaign.create_first'
    );
    const before = Date.now();
    const result = await snoozeBusinessRecommendation._handler(sharedCtx, {
      businessId: 'business_1',
      stableId: recommendation.stableId,
      evidenceFingerprint: recommendation.evidenceFingerprint,
      hiddenUntil: before + 1,
    });

    expect(result.hiddenUntil).toBeGreaterThanOrEqual(
      before + 7 * 24 * 60 * 60 * 1000
    );
    setActor(sharedCtx, 'manager_1');
    const managerResponse = await getBusinessRecommendations._handler(
      sharedCtx,
      { businessId: 'business_1' }
    );
    expect(
      visibleRecommendation(managerResponse, 'campaign.create_first')
    ).toBeDefined();
  });

  test('stale, missing, unauthorized, and cross-business interactions are rejected', async () => {
    const ownerCtx = ctx('owner_1');
    await expect(
      dismissBusinessRecommendation._handler(ownerCtx, {
        businessId: 'business_1',
        stableId: 'campaign.create_first',
        evidenceFingerprint: 'stale',
      })
    ).rejects.toThrow();
    await expect(
      dismissBusinessRecommendation._handler(ownerCtx, {
        businessId: 'business_1',
        stableId: 'growth.near_reward',
        evidenceFingerprint: 'missing',
      })
    ).rejects.toThrow();
    await expect(
      dismissBusinessRecommendation._handler(ctx('staff_1'), {
        businessId: 'business_1',
        stableId: 'campaign.create_first',
        evidenceFingerprint: 'missing',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
    await expect(
      dismissBusinessRecommendation._handler(ownerCtx, {
        businessId: 'business_2',
        stableId: 'campaign.create_first',
        evidenceFingerprint: 'missing',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  test('capability or entitlement loss before mutation rejects old evidence', async () => {
    const capabilityCtx = ctx('owner_1', (data) => {
      data.businesses[0].subscriptionStatus = 'past_due';
    });
    const subscriptionResponse =
      await getBusinessRecommendations._handler(capabilityCtx, {
        businessId: 'business_1',
      });
    const subscriptionRecommendation = visibleRecommendation(
      subscriptionResponse,
      'subscription.action_required'
    );
    setActor(capabilityCtx, 'manager_1');
    await expect(
      dismissBusinessRecommendation._handler(capabilityCtx, {
        businessId: 'business_1',
        stableId: subscriptionRecommendation.stableId,
        evidenceFingerprint:
          subscriptionRecommendation.evidenceFingerprint,
      })
    ).rejects.toThrow();

    const entitlementCtx = ctx('owner_1');
    const createResponse = await getBusinessRecommendations._handler(
      entitlementCtx,
      { businessId: 'business_1' }
    );
    const createRecommendation = visibleRecommendation(
      createResponse,
      'campaign.create_first'
    );
    entitlementCtx.data.campaigns.push(
      managementCampaign('campaign_limit')
    );
    await expect(
      dismissBusinessRecommendation._handler(entitlementCtx, {
        businessId: 'business_1',
        stableId: createRecommendation.stableId,
        evidenceFingerprint: createRecommendation.evidenceFingerprint,
      })
    ).rejects.toThrow();
  });
});

describe('server-issued recommendation guide sessions', () => {
  test('visible recommendation receives an idempotent server-derived session', async () => {
    const ownerCtx = ctx('owner_1', (data) => {
      data.loyaltyPrograms[0].status = 'draft';
    });
    const response = await getBusinessRecommendations._handler(ownerCtx, {
      businessId: 'business_1',
    });
    const recommendation = visibleRecommendation(
      response,
      'program.publish_draft'
    );
    const beforeIssue = Date.now();
    const first = await startBusinessRecommendationGuide._handler(ownerCtx, {
      businessId: 'business_1',
      stableId: recommendation.stableId,
      guideId: recommendation.guideId,
      actorUserId: 'owner_2',
      evidenceFingerprint: 'client_fingerprint',
      entityId: 'program_2',
      expiresAt: 1,
    });
    const second = await startBusinessRecommendationGuide._handler(ownerCtx, {
      businessId: 'business_1',
      stableId: recommendation.stableId,
      guideId: recommendation.guideId,
    });
    const afterIssue = Date.now();

    expect(first.guideSessionId).toBe(second.guideSessionId);
    expect(Object.keys(first).sort()).toEqual(
      [
        'businessId',
        'entityId',
        'evidenceFingerprint',
        'expiresAt',
        'guideId',
        'guideSessionId',
        'stableId',
      ].sort()
    );
    expect(first.evidenceFingerprint).toBe(
      recommendation.evidenceFingerprint
    );
    expect(first.entityId).toBe(recommendation.entityId);
    expect(first.expiresAt).toBeGreaterThanOrEqual(
      beforeIssue + 24 * 60 * 60 * 1000
    );
    expect(first.expiresAt).toBeLessThanOrEqual(
      afterIssue + 24 * 60 * 60 * 1000
    );
    expect(ownerCtx.data.recommendationGuideSessions).toHaveLength(1);
    expect(ownerCtx.data.recommendationGuideSessions[0]).toMatchObject({
      actorUserId: 'owner_1',
      businessId: 'business_1',
      stableId: recommendation.stableId,
      guideId: recommendation.guideId,
      evidenceFingerprint: recommendation.evidenceFingerprint,
      entityId: recommendation.entityId,
      entityKind: 'program',
    });
  });

  test('hidden, unauthorized, cross-business, and mismatched guide issuance is rejected', async () => {
    const ownerCtx = ctx('owner_1');
    const response = await getBusinessRecommendations._handler(ownerCtx, {
      businessId: 'business_1',
    });
    const recommendation = visibleRecommendation(
      response,
      'campaign.create_first'
    );
    await dismissBusinessRecommendation._handler(ownerCtx, {
      businessId: 'business_1',
      stableId: recommendation.stableId,
      evidenceFingerprint: recommendation.evidenceFingerprint,
    });
    await expect(
      startBusinessRecommendationGuide._handler(ownerCtx, {
        businessId: 'business_1',
        stableId: recommendation.stableId,
        guideId: recommendation.guideId,
      })
    ).rejects.toThrow();
    await expect(
      startBusinessRecommendationGuide._handler(ctx('staff_1'), {
        businessId: 'business_1',
        stableId: recommendation.stableId,
        guideId: recommendation.guideId,
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
    await expect(
      startBusinessRecommendationGuide._handler(ownerCtx, {
        businessId: 'business_2',
        stableId: recommendation.stableId,
        guideId: recommendation.guideId,
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
    await expect(
      startBusinessRecommendationGuide._handler(ctx('owner_1'), {
        businessId: 'business_1',
        stableId: recommendation.stableId,
        guideId: 'near-reward',
      })
    ).rejects.toThrow();
  });

  test('missing, foreign, actor-mismatched, expired, and conflicting sessions are rejected', async () => {
    const ownerCtx = ctx('owner_1', (data) => {
      data.loyaltyPrograms[0].status = 'draft';
    });
    const response = await getBusinessRecommendations._handler(ownerCtx, {
      businessId: 'business_1',
    });
    const recommendation = visibleRecommendation(
      response,
      'program.publish_draft'
    );
    const { session, args } = await issueGuideSession(
      ownerCtx,
      recommendation
    );
    await expect(
      getBusinessRecommendationGuideStatus._handler(ownerCtx, {
        guideSessionId: 'recommendationGuideSessions_missing',
        businessId: 'business_1',
      })
    ).rejects.toThrow();

    setActor(ownerCtx, 'manager_1');
    await expect(
      getBusinessRecommendationGuideStatus._handler(ownerCtx, args)
    ).rejects.toThrow();
    setActor(ownerCtx, 'owner_1');

    const sessionRow = ownerCtx.data.recommendationGuideSessions[0];
    sessionRow.expiresAt = Date.now() - 1;
    await expect(
      getBusinessRecommendationGuideStatus._handler(ownerCtx, args)
    ).rejects.toThrow();
    sessionRow.expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    await expect(
      getBusinessRecommendationGuideStatus._handler(ownerCtx, {
        ...args,
        evidenceFingerprint: 'unissued_fingerprint',
      })
    ).rejects.toThrow();
    await expect(
      acknowledgeBusinessRecommendationGuideStatus._handler(ownerCtx, {
        ...args,
        entityId: 'program_2',
      })
    ).rejects.toThrow();
    expect(ownerCtx.data.recommendationInteractions).toHaveLength(0);

    ownerCtx.data.businessStaff.push({
      _id: 'owner_1_business_2_link',
      businessId: 'business_2',
      userId: 'owner_1',
      staffRole: 'owner',
      status: 'active',
      isActive: true,
    });
    await expect(
      getBusinessRecommendationGuideStatus._handler(ownerCtx, {
        guideSessionId: session.guideSessionId,
        businessId: 'business_2',
      })
    ).rejects.toThrow();
  });
});

describe('recommendation guide status and acknowledgement handlers', () => {
  test('valid guide is active and a mismatched guide is rejected', async () => {
    const ownerCtx = ctx('owner_1');
    const response = await getBusinessRecommendations._handler(ownerCtx, {
      businessId: 'business_1',
    });
    const recommendation = visibleRecommendation(
      response,
      'campaign.create_first'
    );
    const { args } = await issueGuideSession(ownerCtx, recommendation);

    expect(
      await getBusinessRecommendationGuideStatus._handler(ownerCtx, args)
    ).toMatchObject({ state: 'active', reasonCode: 'ACTIONABLE' });
    await expect(
      getBusinessRecommendationGuideStatus._handler(ownerCtx, {
        ...args,
        guideId: 'near-reward',
      })
    ).rejects.toThrow();
  });

  test('missing or foreign exact entity is invalidated', async () => {
    const ownerCtx = ctx('owner_1', (data) => {
      data.loyaltyPrograms[0].status = 'draft';
    });
    const response = await getBusinessRecommendations._handler(ownerCtx, {
      businessId: 'business_1',
    });
    const recommendation = visibleRecommendation(
      response,
      'program.publish_draft'
    );
    const { args: baseArgs } = await issueGuideSession(
      ownerCtx,
      recommendation
    );
    const target = ownerCtx.data.loyaltyPrograms.shift();

    expect(
      await getBusinessRecommendationGuideStatus._handler(
        ownerCtx,
        baseArgs
      )
    ).toMatchObject({ state: 'invalidated' });
    target.businessId = 'business_2';
    ownerCtx.data.loyaltyPrograms.push(target);
    expect(
      await getBusinessRecommendationGuideStatus._handler(ownerCtx, {
        ...baseArgs,
      })
    ).toMatchObject({ state: 'invalidated' });
  });

  test('same-business program or campaign substitution is rejected', async () => {
    const programCtx = ctx('owner_1', (data) => {
      data.loyaltyPrograms[0].status = 'draft';
      data.loyaltyPrograms.push({
        ...data.loyaltyPrograms[0],
        _id: 'program_same_business',
        status: 'draft',
      });
    });
    const programResponse =
      await getBusinessRecommendations._handler(programCtx, {
        businessId: 'business_1',
      });
    const programRecommendation = visibleRecommendation(
      programResponse,
      'program.publish_draft'
    );
    const { args: programArgs } = await issueGuideSession(
      programCtx,
      programRecommendation
    );
    programCtx.data.loyaltyPrograms[1].status = 'active';
    await expect(
      acknowledgeBusinessRecommendationGuideStatus._handler(programCtx, {
        ...programArgs,
        entityId: 'program_same_business',
      })
    ).rejects.toThrow();
    expect(programCtx.data.recommendationInteractions).toHaveLength(0);

    const firstSendAt = Date.now() + 24 * 60 * 60 * 1000;
    const campaignCtx = ctx('owner_1', (data) => {
      data.campaigns.push(
        scheduledCampaign('campaign_a', firstSendAt),
        scheduledCampaign(
          'campaign_b',
          firstSendAt + 24 * 60 * 60 * 1000
        )
      );
    });
    const campaignResponse =
      await getBusinessRecommendations._handler(campaignCtx, {
        businessId: 'business_1',
      });
    const campaignRecommendation = visibleRecommendation(
      campaignResponse,
      'campaign.next_scheduled'
    );
    const { args: campaignArgs } = await issueGuideSession(
      campaignCtx,
      campaignRecommendation
    );
    await expect(
      acknowledgeBusinessRecommendationGuideStatus._handler(campaignCtx, {
        ...campaignArgs,
        entityId: 'campaign_b',
      })
    ).rejects.toThrow();
    expect(campaignCtx.data.recommendationInteractions).toHaveLength(0);
  });

  test('exact entity validation precedes guide capability revalidation', async () => {
    const managerCapabilities = getRoleCapabilities('manager');
    const originalEditPrograms =
      managerCapabilities.edit_loyalty_cards;
    try {
      const missingCtx = ctx('manager_1', (data) => {
        data.loyaltyPrograms[0].status = 'draft';
      });
      const missingResponse =
        await getBusinessRecommendations._handler(missingCtx, {
          businessId: 'business_1',
        });
      const missingRecommendation = visibleRecommendation(
        missingResponse,
        'program.publish_draft'
      );
      const { args: missingArgs } = await issueGuideSession(
        missingCtx,
        missingRecommendation
      );
      missingCtx.data.loyaltyPrograms.shift();
      managerCapabilities.edit_loyalty_cards = false;
      expect(
        await getBusinessRecommendationGuideStatus._handler(
          missingCtx,
          missingArgs
        )
      ).toMatchObject({
        state: 'invalidated',
        reasonCode: 'TARGET_MISSING',
      });

      managerCapabilities.edit_loyalty_cards = originalEditPrograms;
      const restrictedCtx = ctx('manager_1', (data) => {
        data.loyaltyPrograms[0].status = 'draft';
      });
      const restrictedResponse =
        await getBusinessRecommendations._handler(restrictedCtx, {
          businessId: 'business_1',
        });
      const restrictedRecommendation = visibleRecommendation(
        restrictedResponse,
        'program.publish_draft'
      );
      const { args: restrictedArgs } = await issueGuideSession(
        restrictedCtx,
        restrictedRecommendation
      );
      managerCapabilities.edit_loyalty_cards = false;
      expect(
        await getBusinessRecommendationGuideStatus._handler(
          restrictedCtx,
          restrictedArgs
        )
      ).toMatchObject({ state: 'restricted' });
      await expect(
        acknowledgeBusinessRecommendationGuideStatus._handler(
          restrictedCtx,
          restrictedArgs
        )
      ).rejects.toThrow();
      expect(
        restrictedCtx.data.recommendationInteractions
      ).toHaveLength(0);
    } finally {
      managerCapabilities.edit_loyalty_cards = originalEditPrograms;
    }
  });

  test('invalidated issued session persists only its original fingerprint', async () => {
    const ownerCtx = ctx('owner_1', (data) => {
      data.loyaltyPrograms[0].status = 'draft';
    });
    const response = await getBusinessRecommendations._handler(ownerCtx, {
      businessId: 'business_1',
    });
    const recommendation = visibleRecommendation(
      response,
      'program.publish_draft'
    );
    const { session, args } = await issueGuideSession(
      ownerCtx,
      recommendation
    );
    ownerCtx.data.loyaltyPrograms.shift();

    const result =
      await acknowledgeBusinessRecommendationGuideStatus._handler(
        ownerCtx,
        args
      );
    expect(result.state).toBe('invalidated');
    expect(ownerCtx.data.recommendationInteractions).toHaveLength(1);
    expect(ownerCtx.data.recommendationInteractions[0]).toMatchObject({
      interactionState: 'invalidated',
      stableId: session.stableId,
      evidenceFingerprint: session.evidenceFingerprint,
    });
  });

  test('capability and entitlement loss return restricted and cannot be acknowledged', async () => {
    const capabilityCtx = ctx('owner_1', (data) => {
      data.businesses[0].subscriptionStatus = 'past_due';
    });
    const capabilityResponse =
      await getBusinessRecommendations._handler(capabilityCtx, {
        businessId: 'business_1',
      });
    const capabilityRecommendation = visibleRecommendation(
      capabilityResponse,
      'subscription.action_required'
    );
    const { args: capabilityArgs } = await issueGuideSession(
      capabilityCtx,
      capabilityRecommendation
    );
    capabilityCtx.data.businessStaff[0].staffRole = 'manager';
    expect(
      await getBusinessRecommendationGuideStatus._handler(
        capabilityCtx,
        capabilityArgs
      )
    ).toMatchObject({ state: 'restricted' });
    await expect(
      acknowledgeBusinessRecommendationGuideStatus._handler(
        capabilityCtx,
        capabilityArgs
      )
    ).rejects.toThrow();
    expect(capabilityCtx.data.recommendationInteractions).toHaveLength(0);

    const entitlementCtx = ctx('owner_1');
    const createResponse = await getBusinessRecommendations._handler(
      entitlementCtx,
      { businessId: 'business_1' }
    );
    const createRecommendation = visibleRecommendation(
      createResponse,
      'campaign.create_first'
    );
    const { args: entitlementArgs } = await issueGuideSession(
      entitlementCtx,
      createRecommendation
    );
    entitlementCtx.data.campaigns.push(
      managementCampaign('campaign_limit')
    );
    expect(
      await getBusinessRecommendationGuideStatus._handler(
        entitlementCtx,
        entitlementArgs
      )
    ).toMatchObject({ state: 'restricted' });
    await expect(
      acknowledgeBusinessRecommendationGuideStatus._handler(
        entitlementCtx,
        entitlementArgs
      )
    ).rejects.toThrow();
    expect(entitlementCtx.data.recommendationInteractions).toHaveLength(0);
  });

  test('unavailable quota visibility does not fabricate a hard-limit restriction', async () => {
    const managerCapabilities = getRoleCapabilities('manager');
    const originalViewUsageQuota = managerCapabilities.view_usage_quota;
    try {
      const managerCtx = ctx('manager_1');
      const response = await getBusinessRecommendations._handler(
        managerCtx,
        { businessId: 'business_1' }
      );
      const recommendation = visibleRecommendation(
        response,
        'campaign.create_first'
      );
      const { args } = await issueGuideSession(
        managerCtx,
        recommendation
      );

      managerCapabilities.view_usage_quota = false;
      const facts = await loadBusinessRecommendationFacts(
        managerCtx,
        'business_1',
        {
          staffRole: 'manager',
          capabilities: managerCapabilities,
        }
      );
      expect(facts.facts.campaignQuota).toEqual({
        state: 'restricted',
        requiredCapability: 'view_usage_quota',
      });
      expect(facts.facts.campaignQuota).not.toHaveProperty('value');
      expect(
        await getBusinessRecommendationGuideStatus._handler(
          managerCtx,
          args
        )
      ).toMatchObject({ state: 'active', reasonCode: 'ACTIONABLE' });
    } finally {
      managerCapabilities.view_usage_quota = originalViewUsageQuota;
    }
  });

  test('issued create-first guide remains restricted after create capability loss', async () => {
    const managerCapabilities = getRoleCapabilities('manager');
    const originalCreateCampaigns = managerCapabilities.create_campaigns;
    try {
      const managerCtx = ctx('manager_1');
      const response = await getBusinessRecommendations._handler(
        managerCtx,
        { businessId: 'business_1' }
      );
      const recommendation = visibleRecommendation(
        response,
        'campaign.create_first'
      );
      const { args } = await issueGuideSession(
        managerCtx,
        recommendation
      );

      managerCapabilities.create_campaigns = false;
      expect(
        await getBusinessRecommendationGuideStatus._handler(
          managerCtx,
          args
        )
      ).toMatchObject({ state: 'restricted' });
    } finally {
      managerCapabilities.create_campaigns = originalCreateCampaigns;
    }
  });

  test('completion is revalidated and acknowledgement is idempotent', async () => {
    const ownerCtx = ctx('owner_1', (data) => {
      delete data.businesses[0].placeId;
    });
    const response = await getBusinessRecommendations._handler(ownerCtx, {
      businessId: 'business_1',
    });
    const recommendation = visibleRecommendation(
      response,
      'setup.address.resolve'
    );
    const { args } = await issueGuideSession(ownerCtx, recommendation);
    ownerCtx.data.businesses[0].placeId = 'place_business_1';
    expect(
      await getBusinessRecommendationGuideStatus._handler(ownerCtx, args)
    ).toMatchObject({ state: 'completed' });
    ownerCtx.data.businesses[0].placeId = undefined;
    await expect(
      acknowledgeBusinessRecommendationGuideStatus._handler(
        ownerCtx,
        args
      )
    ).rejects.toThrow();

    ownerCtx.data.businesses[0].placeId = 'place_business_1';
    await acknowledgeBusinessRecommendationGuideStatus._handler(
      ownerCtx,
      args
    );
    await acknowledgeBusinessRecommendationGuideStatus._handler(
      ownerCtx,
      args
    );
    expect(ownerCtx.data.recommendationInteractions).toHaveLength(1);
    expect(
      ownerCtx.data.recommendationInteractions[0].interactionState
    ).toBe('completed');
    expect(
      ownerCtx.data.recommendationInteractions[0].evidenceFingerprint
    ).toBe(args.evidenceFingerprint);
  });

  test('exact schedule changes complete even when another campaign becomes earliest', async () => {
    const firstSendAt = Date.now() + 24 * 60 * 60 * 1000;
    const secondSendAt = firstSendAt + 24 * 60 * 60 * 1000;
    const ownerCtx = ctx('owner_1', (data) => {
      data.campaigns.push(
        scheduledCampaign('campaign_first', firstSendAt),
        scheduledCampaign('campaign_second', secondSendAt)
      );
    });
    const response = await getBusinessRecommendations._handler(ownerCtx, {
      businessId: 'business_1',
    });
    const recommendation = visibleRecommendation(
      response,
      'campaign.next_scheduled'
    );
    const { args } = await issueGuideSession(ownerCtx, recommendation);

    expect(
      await getBusinessRecommendationGuideStatus._handler(ownerCtx, args)
    ).toMatchObject({ state: 'active' });
    ownerCtx.data.campaigns[0].schedule.sendAt =
      secondSendAt + 24 * 60 * 60 * 1000;
    expect(
      await getBusinessRecommendationGuideStatus._handler(ownerCtx, args)
    ).toMatchObject({
      state: 'completed',
      reasonCode: 'EVIDENCE_CHANGED',
    });
    await acknowledgeBusinessRecommendationGuideStatus._handler(
      ownerCtx,
      args
    );
    expect(ownerCtx.data.recommendationInteractions[0]).toMatchObject({
      interactionState: 'completed',
      evidenceFingerprint: args.evidenceFingerprint,
    });
  });

  test('inactive legacy program cannot complete but canonical active program does', async () => {
    const ownerCtx = ctx('owner_1', (data) => {
      data.loyaltyPrograms[0].status = 'draft';
    });
    const response = await getBusinessRecommendations._handler(ownerCtx, {
      businessId: 'business_1',
    });
    const recommendation = visibleRecommendation(
      response,
      'program.publish_draft'
    );
    const { args } = await issueGuideSession(ownerCtx, recommendation);

    ownerCtx.data.loyaltyPrograms[0].status = 'active';
    ownerCtx.data.loyaltyPrograms[0].isActive = false;
    expect(
      await getBusinessRecommendationGuideStatus._handler(ownerCtx, args)
    ).toMatchObject({ state: 'invalidated' });

    ownerCtx.data.loyaltyPrograms[0].isActive = true;
    ownerCtx.data.loyaltyPrograms[0].status = 'archived';
    ownerCtx.data.loyaltyPrograms[0].isArchived = true;
    expect(
      await getBusinessRecommendationGuideStatus._handler(ownerCtx, args)
    ).toMatchObject({ state: 'invalidated' });

    ownerCtx.data.loyaltyPrograms[0].status = 'active';
    ownerCtx.data.loyaltyPrograms[0].isArchived = false;
    expect(
      await getBusinessRecommendationGuideStatus._handler(ownerCtx, args)
    ).toMatchObject({ state: 'completed' });
  });
});
