import { describe, expect, test } from 'bun:test';

import {
  assertBusinessOnboardingReady,
  closeBusinessAccount,
  createOrResumeBusinessOnboarding,
  getBusinessesNearby,
  getBusinessSettings,
  listMyClosedBusinesses,
  restoreBusinessAccount,
  saveBusinessOnboardingSnapshot,
  updateBusinessAddress,
  updateBusinessProfile,
} from '../business';
import { completeBusinessOnboarding } from '../users';

function buildUser(overrides = {}) {
  return {
    _id: 'user_owner',
    isActive: true,
    ...overrides,
  };
}

function buildBusiness(overrides = {}) {
  const now = Date.now();
  return {
    _id: 'business_1',
    ownerUserId: 'user_owner',
    externalId: 'biz-ext-1',
    name: 'Test Business',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    location: {
      lat: 0,
      lng: 0,
    },
    formattedAddress: 'Test Address',
    ...overrides,
  };
}

function buildStaff(overrides = {}) {
  const now = Date.now();
  return {
    _id: 'staff_owner_1',
    businessId: 'business_1',
    userId: 'user_owner',
    staffRole: 'owner',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockCtx({
  currentUserId = 'user_owner',
  users = [buildUser()],
  businesses = [buildBusiness()],
  businessStaff = [buildStaff()],
  loyaltyPrograms = [],
  businessOnboardingDrafts = [],
  memberships = [],
  events = [],
  campaigns = [],
  smartManagerEvaluationStates = [],
} = {}) {
  const state = {
    users: new Map(users.map((entry) => [entry._id, { ...entry }])),
    businesses: new Map(businesses.map((entry) => [entry._id, { ...entry }])),
    businessStaff: new Map(
      businessStaff.map((entry) => [entry._id, { ...entry }])
    ),
    loyaltyPrograms: new Map(
      loyaltyPrograms.map((entry) => [entry._id, { ...entry }])
    ),
    businessOnboardingDrafts: new Map(
      businessOnboardingDrafts.map((entry) => [entry._id, { ...entry }])
    ),
    memberships: new Map(
      memberships.map((entry) => [entry._id, { ...entry }])
    ),
    events: new Map(events.map((entry) => [entry._id, { ...entry }])),
    campaigns: new Map(campaigns.map((entry) => [entry._id, { ...entry }])),
    smartManagerEvaluationStates: new Map(
      smartManagerEvaluationStates.map((entry) => [entry._id, { ...entry }])
    ),
  };
  let businessInsertCount = 0;
  let staffInsertCount = 0;
  let smartManagerEvaluationStateInsertCount = 0;
  const scheduled = [];

  const ctx = {
    auth: {
      getUserIdentity: async () =>
        currentUserId ? { subject: `${currentUserId}|session_1` } : null,
    },
    db: {
      get: async (id) => {
        for (const table of Object.values(state)) {
          if (table.has(id)) {
            return table.get(id);
          }
        }
        return null;
      },
      patch: async (id, patch) => {
        for (const table of Object.values(state)) {
          if (table.has(id)) {
            const current = table.get(id);
            table.set(id, { ...current, ...patch });
            return;
          }
        }

        throw new Error(`UNKNOWN_PATCH_TARGET:${id}`);
      },
      insert: async (tableName, value) => {
        if (tableName === 'businesses') {
          businessInsertCount += 1;
          const id = `business_inserted_${businessInsertCount}`;
          state.businesses.set(id, { _id: id, ...value });
          return id;
        }

        if (tableName === 'businessStaff') {
          staffInsertCount += 1;
          const id = `staff_inserted_${staffInsertCount}`;
          state.businessStaff.set(id, { _id: id, ...value });
          return id;
        }

        if (tableName === 'smartManagerEvaluationStates') {
          smartManagerEvaluationStateInsertCount += 1;
          const id = `smart_manager_evaluation_state_inserted_${smartManagerEvaluationStateInsertCount}`;
          state.smartManagerEvaluationStates.set(id, { _id: id, ...value });
          return id;
        }

        throw new Error(`UNKNOWN_INSERT_TABLE:${tableName}`);
      },
      delete: async (id) => {
        if (state.smartManagerEvaluationStates.has(id)) {
          state.smartManagerEvaluationStates.delete(id);
          return;
        }
        throw new Error(`UNKNOWN_DELETE_TARGET:${id}`);
      },
      query: (tableName) => ({
        withIndex: (_indexName, buildIndex) => {
          const filters = [];
          const q = {
            eq(field, value) {
              filters.push([field, value]);
              return q;
            },
          };

          buildIndex(q);

          const rows =
            tableName === 'businesses'
              ? Array.from(state.businesses.values())
              : tableName === 'businessStaff'
                ? Array.from(state.businessStaff.values())
                : tableName === 'loyaltyPrograms'
                  ? Array.from(state.loyaltyPrograms.values())
                  : tableName === 'businessOnboardingDrafts'
                    ? Array.from(state.businessOnboardingDrafts.values())
                    : tableName === 'smartManagerEvaluationStates'
                      ? Array.from(
                          state.smartManagerEvaluationStates.values()
                        )
                    : [];

          const filteredRows = rows.filter((row) =>
            filters.every(([field, value]) => row[field] === value)
          );

          return {
            first: async () => filteredRows[0] ?? null,
            unique: async () => {
              if (filteredRows.length > 1) {
                throw new Error('NOT_UNIQUE');
              }
              return filteredRows[0] ?? null;
            },
            collect: async () => filteredRows,
            take: async (limit) => filteredRows.slice(0, limit),
          };
        },
      }),
    },
    runMutation: async () => null,
    scheduler: {
      runAfter: async (delayMs, functionReference, args) => {
        scheduled.push({ delayMs, functionReference, args });
        return `_scheduled_${scheduled.length}`;
      },
    },
  };

  return { ctx, state, scheduled };
}

describe('business closure and restoration lifecycle', () => {
  const manager = buildStaff({
    _id: 'staff_manager_1',
    userId: 'user_manager',
    staffRole: 'manager',
  });
  const staff = buildStaff({
    _id: 'staff_member_1',
    userId: 'user_staff',
    staffRole: 'staff',
  });
  const program = {
    _id: 'program_1',
    businessId: 'business_1',
    title: 'Original Program',
    maxStamps: 8,
    isActive: true,
  };
  const membership = {
    _id: 'membership_1',
    businessId: 'business_1',
    programId: 'program_1',
    userId: 'customer_1',
    currentStamps: 6,
    isActive: true,
  };
  const event = {
    _id: 'event_1',
    businessId: 'business_1',
    membershipId: 'membership_1',
    type: 'STAMP_ADDED',
    createdAt: 100,
  };
  const campaign = {
    _id: 'campaign_1',
    businessId: 'business_1',
    title: 'Original Campaign',
    automationEnabled: true,
    isActive: true,
  };

  test('canonical owner closes the business without changing preserved state', async () => {
    const { ctx, state, scheduled } = createMockCtx({
      users: [
        buildUser({
          activeBusinessId: 'business_1',
          activeMode: 'business',
        }),
        buildUser({ _id: 'user_manager' }),
        buildUser({ _id: 'user_staff' }),
      ],
      businessStaff: [buildStaff(), manager, staff],
      loyaltyPrograms: [program],
      memberships: [membership],
      events: [event],
      campaigns: [campaign],
    });
    const preserved = {
      staff: structuredClone(Array.from(state.businessStaff.values())),
      programs: structuredClone(Array.from(state.loyaltyPrograms.values())),
      memberships: structuredClone(Array.from(state.memberships.values())),
      events: structuredClone(Array.from(state.events.values())),
      campaigns: structuredClone(Array.from(state.campaigns.values())),
    };

    const result = await closeBusinessAccount._handler(ctx, {
      businessId: 'business_1',
    });

    const closed = state.businesses.get('business_1');
    expect(closed.isActive).toBe(false);
    expect(closed.closedAt).toBe(result.closedAt);
    expect(closed.lastClosedAt).toBe(result.closedAt);
    expect(closed.closedByUserId).toBe('user_owner');
    expect(closed.updatedAt).toBe(result.closedAt);
    expect(state.users.get('user_owner').activeBusinessId).toBeUndefined();
    expect(state.users.get('user_owner').activeMode).toBe('customer');
    expect(Array.from(state.businessStaff.values())).toEqual(preserved.staff);
    expect(Array.from(state.loyaltyPrograms.values())).toEqual(
      preserved.programs
    );
    expect(Array.from(state.memberships.values())).toEqual(
      preserved.memberships
    );
    expect(Array.from(state.events.values())).toEqual(preserved.events);
    expect(Array.from(state.campaigns.values())).toEqual(preserved.campaigns);
    expect(scheduled).toHaveLength(2);
    expect(scheduled.map((job) => job.delayMs)).toEqual([0, 0]);
    expect(scheduled.map((job) => job.args)).toEqual([
      {
        businessId: 'business_1',
        closedAt: result.closedAt,
        cursor: null,
      },
      {
        businessId: 'business_1',
        closedAt: result.closedAt,
        cursor: null,
      },
    ]);
  });

  test.each([
    ['manager', 'user_manager', manager],
    ['staff', 'user_staff', staff],
    [
      'noncanonical owner row',
      'user_other_owner',
      buildStaff({
        _id: 'staff_other_owner',
        userId: 'user_other_owner',
        staffRole: 'owner',
      }),
    ],
    ['unrelated user', 'user_unrelated', null],
  ])('%s cannot close the business', async (_label, userId, staffRow) => {
    const { ctx } = createMockCtx({
      currentUserId: userId,
      users: [buildUser(), buildUser({ _id: userId })],
      businessStaff: [buildStaff(), ...(staffRow ? [staffRow] : [])],
    });

    await expect(
      closeBusinessAccount._handler(ctx, { businessId: 'business_1' })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  test('close rejects an already closed business', async () => {
    const { ctx } = createMockCtx({
      businesses: [buildBusiness({ isActive: false })],
    });

    await expect(
      closeBusinessAccount._handler(ctx, { businessId: 'business_1' })
    ).rejects.toThrow('BUSINESS_ALREADY_CLOSED');
  });

  test('only the canonical owner lists the closed business', async () => {
    const closedBusiness = buildBusiness({
      isActive: false,
      logoUrl: 'https://example.test/logo.png',
      closedAt: 200,
      lastClosedAt: 200,
    });
    const owner = createMockCtx({ businesses: [closedBusiness] });
    const other = createMockCtx({
      currentUserId: 'user_other',
      users: [buildUser({ _id: 'user_other' })],
      businesses: [closedBusiness],
      businessStaff: [],
    });

    expect(await listMyClosedBusinesses._handler(owner.ctx, {})).toEqual([
      {
        businessId: 'business_1',
        name: 'Test Business',
        logoUrl: 'https://example.test/logo.png',
        closedAt: 200,
        lastClosedAt: 200,
        createdAt: closedBusiness.createdAt,
      },
    ]);
    expect(await listMyClosedBusinesses._handler(other.ctx, {})).toEqual([]);
  });

  test('permanent-deletion businesses are excluded from recovery and cannot restore', async () => {
    const { ctx } = createMockCtx({
      businesses: [
        buildBusiness({
          isActive: false,
          permanentDeletionStatus: 'in_progress',
        }),
      ],
    });

    expect(await listMyClosedBusinesses._handler(ctx, {})).toEqual([]);
    await expect(
      restoreBusinessAccount._handler(ctx, { businessId: 'business_1' })
    ).rejects.toThrow('BUSINESS_PERMANENT_DELETION_IN_PROGRESS');
  });

  test('canonical owner restores the exact preserved business state', async () => {
    const closedAt = 200;
    const { ctx, state } = createMockCtx({
      businesses: [
        buildBusiness({
          isActive: false,
          closedAt,
          lastClosedAt: closedAt,
          closedByUserId: 'user_owner',
        }),
      ],
      businessStaff: [buildStaff(), manager, staff],
      loyaltyPrograms: [program],
      memberships: [membership],
      events: [event],
      campaigns: [campaign],
    });
    const preserved = {
      staff: structuredClone(Array.from(state.businessStaff.values())),
      programs: structuredClone(Array.from(state.loyaltyPrograms.values())),
      memberships: structuredClone(Array.from(state.memberships.values())),
      events: structuredClone(Array.from(state.events.values())),
      campaigns: structuredClone(Array.from(state.campaigns.values())),
    };

    const result = await restoreBusinessAccount._handler(ctx, {
      businessId: 'business_1',
    });

    const restored = state.businesses.get('business_1');
    expect(restored.isActive).toBe(true);
    expect(restored.closedAt).toBeUndefined();
    expect(restored.closedByUserId).toBeUndefined();
    expect(restored.lastClosedAt).toBe(closedAt);
    expect(restored.lastRestoredAt).toBe(result.lastRestoredAt);
    expect(Array.from(state.businessStaff.values())).toEqual(preserved.staff);
    expect(Array.from(state.loyaltyPrograms.values())).toEqual(
      preserved.programs
    );
    expect(Array.from(state.memberships.values())).toEqual(
      preserved.memberships
    );
    expect(Array.from(state.events.values())).toEqual(preserved.events);
    expect(Array.from(state.campaigns.values())).toEqual(preserved.campaigns);
  });

  test.each([
    ['manager', 'user_manager', manager],
    ['staff', 'user_staff', staff],
  ])('%s cannot restore the business', async (_label, userId, staffRow) => {
    const { ctx } = createMockCtx({
      currentUserId: userId,
      users: [buildUser(), buildUser({ _id: userId })],
      businesses: [buildBusiness({ isActive: false })],
      businessStaff: [buildStaff(), staffRow],
    });

    await expect(
      restoreBusinessAccount._handler(ctx, { businessId: 'business_1' })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  test('restore rejects a business that is not closed', async () => {
    const { ctx } = createMockCtx();

    await expect(
      restoreBusinessAccount._handler(ctx, { businessId: 'business_1' })
    ).rejects.toThrow('BUSINESS_NOT_CLOSED');
  });

  test('closed business management writes fail with BUSINESS_CLOSED', async () => {
    const { ctx } = createMockCtx({
      businesses: [buildBusiness({ isActive: false })],
    });

    await expect(
      updateBusinessProfile._handler(ctx, {
        businessId: 'business_1',
        name: 'Changed Name',
        shortDescription: '',
        businessPhone: '',
        serviceTypes: [],
        serviceTags: [],
      })
    ).rejects.toThrow('BUSINESS_CLOSED');
  });
});

function onboardingCreateArgs(overrides = {}) {
  return {
    name: 'Cafe Test',
    externalId: 'onboarding-cafe-user-owner',
    shortDescription: 'Neighborhood cafe',
    businessPhone: '+972 50-123-4567',
    serviceTypes: ['food_drink'],
    serviceTags: ['coffee'],
    discoverySource: 'search',
    reason: 'repeat',
    usageAreas: ['nearby'],
    ownerAgeRange: '25-34',
    businessExample: 'cafe_restaurant',
    cadenceBand: 'weekly',
    birthdayCampaignRelevant: true,
    joinAnniversaryCampaignRelevant: true,
    weakTimePromosRelevant: false,
    formattedAddress: 'Dizengoff 100, Tel Aviv',
    placeId: 'place_1',
    lat: 32.0801,
    lng: 34.7742,
    city: 'Tel Aviv',
    street: 'Dizengoff',
    streetNumber: '100',
    ...overrides,
  };
}

describe('business profile settings and discovery filters', () => {
  test('updateBusinessProfile stores validated business fields', async () => {
    const { ctx, state } = createMockCtx();

    await updateBusinessProfile._handler(ctx, {
      businessId: 'business_1',
      name: '  Test   New   Name  ',
      shortDescription: '  עסק מוביל  בעיר ',
      businessPhone: ' +972 (50) 123-4567 ',
      serviceTypes: ['beauty', 'retail'],
      serviceTags: ['  טיפוח  ', 'שיער', 'טיפוח'],
    });

    const updatedBusiness = state.businesses.get('business_1');
    expect(updatedBusiness.name).toBe('Test New Name');
    expect(updatedBusiness.shortDescription).toBe('עסק מוביל בעיר');
    expect(updatedBusiness.businessPhone).toBe('+972 (50) 123-4567');
    expect(updatedBusiness.serviceTypes).toEqual(['beauty', 'retail']);
    expect(updatedBusiness.serviceTags).toEqual(['טיפוח', 'שיער']);
  });

  test('updateBusinessProfile rejects invalid input', async () => {
    const { ctx } = createMockCtx();

    await expect(
      updateBusinessProfile._handler(ctx, {
        businessId: 'business_1',
        name: 'Business',
        shortDescription: 'ok',
        businessPhone: 'abc123',
        serviceTypes: ['beauty'],
        serviceTags: [],
      })
    ).rejects.toThrow('BUSINESS_PHONE_INVALID');

    await expect(
      updateBusinessProfile._handler(ctx, {
        businessId: 'business_1',
        name: 'Business',
        shortDescription: 'ok',
        businessPhone: '+9721234567',
        serviceTypes: ['invalid_service'],
        serviceTags: [],
      })
    ).rejects.toThrow('BUSINESS_SERVICE_TYPE_INVALID');
  });

  test('getBusinessSettings returns strict profile completion missing fields', async () => {
    const { ctx } = createMockCtx({
      businesses: [
        buildBusiness({
          shortDescription: '',
          businessPhone: '',
          serviceTypes: [],
          serviceTags: [],
          placeId: '',
          location: null,
          onboardingSnapshot: {},
        }),
      ],
    });

    const settings = await getBusinessSettings._handler(ctx, {
      businessId: 'business_1',
    });

    expect(settings.profileCompletion.isComplete).toBe(false);
    expect(settings.profileCompletion.missingFields).toEqual([
      'shortDescription',
      'businessPhone',
      'address',
      'serviceTypes',
      'serviceTags',
      'discoverySource',
      'reason',
      'usageAreas',
      'ownerAgeRange',
      'businessExample',
      'birthdayCampaignRelevant',
      'joinAnniversaryCampaignRelevant',
      'weakTimePromosRelevant',
    ]);
  });

  test('getBusinessSettings returns complete when all strict fields exist', async () => {
    const { ctx } = createMockCtx({
      businesses: [
        buildBusiness({
          shortDescription: 'Business short description',
          businessPhone: '+972 50-123-4567',
          serviceTypes: ['beauty'],
          serviceTags: ['nails'],
          placeId: 'place_1',
          formattedAddress: 'Test Address 10',
          location: { lat: 32.08, lng: 34.78 },
          onboardingSnapshot: {
            discoverySource: 'search',
            reason: 'insights',
            usageAreas: ['citywide'],
            ownerAgeRange: '25-34',
            businessExample: 'hair_salon',
            birthdayCampaignRelevant: true,
            joinAnniversaryCampaignRelevant: true,
            weakTimePromosRelevant: true,
            collectedAt: Date.now(),
          },
        }),
      ],
    });

    const settings = await getBusinessSettings._handler(ctx, {
      businessId: 'business_1',
    });

    expect(settings.profileCompletion.isComplete).toBe(true);
    expect(settings.profileCompletion.missingFields).toEqual([]);
  });

  test('assertBusinessOnboardingReady blocks incomplete business profiles', async () => {
    const { ctx } = createMockCtx({
      businesses: [
        buildBusiness({
          shortDescription: '',
          businessPhone: '',
          serviceTypes: [],
          serviceTags: [],
          placeId: 'place_1',
          formattedAddress: 'Test Address 10',
          location: { lat: 32.08, lng: 34.78 },
          onboardingSnapshot: {
            discoverySource: 'search',
            reason: 'insights',
            usageAreas: ['citywide'],
            ownerAgeRange: '25-34',
            businessExample: 'hair_salon',
            birthdayCampaignRelevant: true,
            joinAnniversaryCampaignRelevant: true,
            weakTimePromosRelevant: true,
            collectedAt: Date.now(),
          },
        }),
      ],
    });

    await expect(
      assertBusinessOnboardingReady._handler(ctx, {
        businessId: 'business_1',
      })
    ).rejects.toThrow('BUSINESS_PROFILE_INCOMPLETE');
  });

  test('assertBusinessOnboardingReady allows complete business profiles', async () => {
    const { ctx } = createMockCtx({
      businesses: [
        buildBusiness({
          shortDescription: 'Business short description',
          businessPhone: '+972 50-123-4567',
          serviceTypes: ['beauty'],
          serviceTags: ['nails'],
          placeId: 'place_1',
          formattedAddress: 'Test Address 10',
          location: { lat: 32.08, lng: 34.78 },
          onboardingSnapshot: {
            discoverySource: 'search',
            reason: 'insights',
            usageAreas: ['citywide'],
            ownerAgeRange: '25-34',
            businessExample: 'hair_salon',
            birthdayCampaignRelevant: true,
            joinAnniversaryCampaignRelevant: true,
            weakTimePromosRelevant: true,
            collectedAt: Date.now(),
          },
        }),
      ],
    });

    const result = await assertBusinessOnboardingReady._handler(ctx, {
      businessId: 'business_1',
    });

    expect(result.profileCompletion.isComplete).toBe(true);
  });

  test('completeBusinessOnboarding rejects incomplete profile without patching onboarding flag', async () => {
    const { ctx, state } = createMockCtx({
      businesses: [
        buildBusiness({
          shortDescription: '',
          businessPhone: '',
          serviceTypes: [],
          serviceTags: [],
          placeId: 'place_1',
          formattedAddress: 'Test Address 10',
          location: { lat: 32.08, lng: 34.78 },
          onboardingSnapshot: {
            discoverySource: 'search',
            reason: 'insights',
            usageAreas: ['citywide'],
            ownerAgeRange: '25-34',
            businessExample: 'hair_salon',
            birthdayCampaignRelevant: true,
            joinAnniversaryCampaignRelevant: true,
            weakTimePromosRelevant: true,
            collectedAt: Date.now(),
          },
        }),
      ],
    });

    await expect(
      completeBusinessOnboarding._handler(ctx, {
        businessId: 'business_1',
        programId: 'program_1',
        flow: 'default',
      })
    ).rejects.toThrow('BUSINESS_PROFILE_INCOMPLETE');

    expect(state.users.get('user_owner').businessOnboardedAt).toBeUndefined();
  });

  test('completeBusinessOnboarding patches onboarding flag for complete profile', async () => {
    const { ctx, state } = createMockCtx({
      businesses: [
        buildBusiness({
          shortDescription: 'Business short description',
          businessPhone: '+972 50-123-4567',
          serviceTypes: ['beauty'],
          serviceTags: ['nails'],
          placeId: 'place_1',
          formattedAddress: 'Test Address 10',
          location: { lat: 32.08, lng: 34.78 },
          onboardingSnapshot: {
            discoverySource: 'search',
            reason: 'insights',
            usageAreas: ['citywide'],
            ownerAgeRange: '25-34',
            businessExample: 'hair_salon',
            birthdayCampaignRelevant: true,
            joinAnniversaryCampaignRelevant: true,
            weakTimePromosRelevant: true,
            collectedAt: Date.now(),
          },
        }),
      ],
      loyaltyPrograms: [
        {
          _id: 'program_1',
          businessId: 'business_1',
          status: 'active',
          isActive: true,
          title: 'First card',
          rewardName: 'Reward',
          maxStamps: 10,
          stampIcon: 'star',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      businessOnboardingDrafts: [
        {
          _id: 'draft_1',
          userId: 'user_owner',
          flow: 'default',
          status: 'in_progress',
          currentStep: 'previewCard',
          farthestStep: 'previewCard',
          farthestStepOrder: 5,
          businessId: 'business_1',
          programId: 'program_1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    });

    await completeBusinessOnboarding._handler(ctx, {
      businessId: 'business_1',
      programId: 'program_1',
      flow: 'default',
    });

    const updatedUser = state.users.get('user_owner');
    expect(typeof updatedUser.businessOnboardedAt).toBe('number');
    expect(updatedUser.activeBusinessId).toBe('business_1');
    expect(updatedUser.activeMode).toBe('business');
    expect(typeof updatedUser.updatedAt).toBe('number');
    expect(state.businessOnboardingDrafts.get('draft_1')).toMatchObject({
      status: 'completed',
      currentStep: 'previewCard',
      farthestStep: 'previewCard',
      farthestStepOrder: 5,
      businessId: 'business_1',
      programId: 'program_1',
    });
  });

  test('staff role cannot update business profile', async () => {
    const { ctx } = createMockCtx({
      currentUserId: 'user_staff',
      users: [buildUser({ _id: 'user_staff' })],
      businessStaff: [
        buildStaff({
          _id: 'staff_1',
          userId: 'user_staff',
          staffRole: 'staff',
        }),
      ],
    });

    await expect(
      updateBusinessProfile._handler(ctx, {
        businessId: 'business_1',
        name: 'New Name',
        shortDescription: '',
        businessPhone: '',
        serviceTypes: [],
        serviceTags: [],
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  test('saveBusinessOnboardingSnapshot stores snapshot for manager', async () => {
    const { ctx, state } = createMockCtx({
      currentUserId: 'user_manager',
      users: [buildUser({ _id: 'user_manager' })],
      businesses: [
        buildBusiness({
          onboardingSnapshot: {
            reason: 'insights',
          },
        }),
      ],
      businessStaff: [
        buildStaff({
          _id: 'staff_manager',
          userId: 'user_manager',
          staffRole: 'manager',
        }),
      ],
    });

    await saveBusinessOnboardingSnapshot._handler(ctx, {
      businessId: 'business_1',
      discoverySource: 'social',
      usageAreas: ['nearby', 'citywide'],
      ownerAgeRange: '25-34',
    });

    const updatedBusiness = state.businesses.get('business_1');
    expect(updatedBusiness.onboardingSnapshot.discoverySource).toBe('social');
    expect(updatedBusiness.onboardingSnapshot.reason).toBe('insights');
    expect(updatedBusiness.onboardingSnapshot.usageAreas).toEqual([
      'nearby',
      'citywide',
    ]);
    expect(updatedBusiness.onboardingSnapshot.ownerAgeRange).toBe('25-34');
    expect(typeof updatedBusiness.onboardingSnapshot.collectedAt).toBe(
      'number'
    );
  });

  test('saveBusinessOnboardingSnapshot rejects invalid onboarding values', async () => {
    const { ctx } = createMockCtx();

    await expect(
      saveBusinessOnboardingSnapshot._handler(ctx, {
        businessId: 'business_1',
        discoverySource: 'invalid_source',
      })
    ).rejects.toThrow('BUSINESS_DISCOVERY_SOURCE_INVALID');

    await expect(
      saveBusinessOnboardingSnapshot._handler(ctx, {
        businessId: 'business_1',
        usageAreas: [],
      })
    ).rejects.toThrow('BUSINESS_USAGE_AREAS_REQUIRED');
  });

  test('updateBusinessAddress allows manager and blocks staff', async () => {
    const manager = createMockCtx({
      currentUserId: 'user_manager',
      users: [buildUser({ _id: 'user_manager' })],
      businessStaff: [
        buildStaff({
          _id: 'staff_manager',
          userId: 'user_manager',
          staffRole: 'manager',
        }),
      ],
    });

    await updateBusinessAddress._handler(manager.ctx, {
      businessId: 'business_1',
      formattedAddress: 'Herzl 1, Tel Aviv',
      placeId: 'place_2',
      lat: 32.0853,
      lng: 34.7818,
      city: 'Tel Aviv',
      street: 'Herzl',
      streetNumber: '1',
    });

    const updated = manager.state.businesses.get('business_1');
    expect(updated.formattedAddress).toBe('Herzl 1, Tel Aviv');
    expect(updated.placeId).toBe('place_2');
    expect(updated.location).toEqual({ lat: 32.0853, lng: 34.7818 });

    const staff = createMockCtx({
      currentUserId: 'user_staff',
      users: [buildUser({ _id: 'user_staff' })],
      businessStaff: [
        buildStaff({
          _id: 'staff_2',
          userId: 'user_staff',
          staffRole: 'staff',
        }),
      ],
    });

    await expect(
      updateBusinessAddress._handler(staff.ctx, {
        businessId: 'business_1',
        formattedAddress: 'Herzl 1, Tel Aviv',
        placeId: 'place_2',
        lat: 32.0853,
        lng: 34.7818,
        city: 'Tel Aviv',
        street: 'Herzl',
        streetNumber: '1',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  test('updateBusinessAddress rejects incomplete components and invalid coordinates', async () => {
    const manager = createMockCtx({
      currentUserId: 'user_manager',
      users: [buildUser({ _id: 'user_manager' })],
      businessStaff: [
        buildStaff({
          _id: 'staff_manager_validation',
          userId: 'user_manager',
          staffRole: 'manager',
        }),
      ],
    });
    const valid = {
      businessId: 'business_1',
      formattedAddress: 'Herzl 1, Tel Aviv',
      placeId: 'place_2',
      lat: 32.0853,
      lng: 34.7818,
      city: 'Tel Aviv',
      street: 'Herzl',
      streetNumber: '1',
    };

    for (const [field, error] of [
      ['city', 'CITY_REQUIRED'],
      ['street', 'STREET_REQUIRED'],
      ['streetNumber', 'STREET_NUMBER_REQUIRED'],
    ]) {
      await expect(
        updateBusinessAddress._handler(manager.ctx, {
          ...valid,
          [field]: '',
        })
      ).rejects.toThrow(error);
    }
    await expect(
      updateBusinessAddress._handler(manager.ctx, { ...valid, lat: 91 })
    ).rejects.toThrow('LOCATION_REQUIRED');
  });

  test('createOrResumeBusinessOnboarding creates a complete draft business', async () => {
    const { ctx, state } = createMockCtx({
      businesses: [],
      businessStaff: [],
    });

    const result = await createOrResumeBusinessOnboarding._handler(
      ctx,
      onboardingCreateArgs()
    );

    const created = state.businesses.get(result.businessId);
    expect(created.name).toBe('Cafe Test');
    expect(created.externalId).toBe('onboarding-cafe-user-owner');
    expect(created.shortDescription).toBe('Neighborhood cafe');
    expect(created.businessPhone).toBe('+972 50-123-4567');
    expect(created.serviceTypes).toEqual(['food_drink']);
    expect(created.serviceTags).toEqual(['coffee']);
    expect(created.formattedAddress).toBe('Dizengoff 100, Tel Aviv');
    expect(created.placeId).toBe('place_1');
    expect(created.location).toEqual({ lat: 32.0801, lng: 34.7742 });
    expect(created.onboardingSnapshot.discoverySource).toBe('search');
    expect(created.onboardingSnapshot.reason).toBe('repeat');
    expect(created.onboardingSnapshot.usageAreas).toEqual(['nearby']);
    expect(result.reused).toBe(false);
    expect(Array.from(state.businessStaff.values())).toHaveLength(1);
  });

  test('createOrResumeBusinessOnboarding reuses same owner externalId on retry', async () => {
    const { ctx, state } = createMockCtx({
      businesses: [],
      businessStaff: [],
    });

    const first = await createOrResumeBusinessOnboarding._handler(
      ctx,
      onboardingCreateArgs()
    );
    const second = await createOrResumeBusinessOnboarding._handler(
      ctx,
      onboardingCreateArgs({
        name: 'Cafe Test Updated',
        streetNumber: '101',
      })
    );

    expect(second.businessId).toBe(first.businessId);
    expect(second.reused).toBe(true);
    expect(state.businesses.size).toBe(1);
    const updated = state.businesses.get(first.businessId);
    expect(updated.name).toBe('Cafe Test Updated');
    expect(updated.streetNumber).toBe('101');
  });

  test('new business address writes reject missing canonical components', async () => {
    const { ctx } = createMockCtx({ businesses: [], businessStaff: [] });

    for (const [field, error] of [
      ['city', 'CITY_REQUIRED'],
      ['street', 'STREET_REQUIRED'],
      ['streetNumber', 'STREET_NUMBER_REQUIRED'],
    ]) {
      await expect(
        createOrResumeBusinessOnboarding._handler(
          ctx,
          onboardingCreateArgs({
            externalId: `missing-${field}`,
            [field]: '',
          })
        )
      ).rejects.toThrow(error);
    }
  });

  test('createOrResumeBusinessOnboarding blocks another owner externalId reuse', async () => {
    const { ctx } = createMockCtx({
      currentUserId: 'user_other',
      users: [buildUser({ _id: 'user_other' })],
      businesses: [
        buildBusiness({
          _id: 'business_existing',
          ownerUserId: 'user_owner',
          externalId: 'onboarding-cafe-user-owner',
        }),
      ],
      businessStaff: [],
    });

    await expect(
      createOrResumeBusinessOnboarding._handler(ctx, onboardingCreateArgs())
    ).rejects.toThrow('EXTERNAL_ID_TAKEN');
  });

  test('getBusinessesNearby filters by serviceTypeFilters', async () => {
    const { ctx } = createMockCtx({
      users: [buildUser()],
      businesses: [
        buildBusiness({
          _id: 'business_1',
          name: 'Beauty Place',
          serviceTypes: ['beauty'],
          serviceTags: ['איפור'],
          location: { lat: 0, lng: 0.001 },
        }),
        buildBusiness({
          _id: 'business_2',
          name: 'Cafe Point',
          serviceTypes: ['food_drink'],
          serviceTags: ['קפה'],
          location: { lat: 0, lng: 0.002 },
        }),
      ],
      businessStaff: [],
    });

    const result = await getBusinessesNearby._handler(ctx, {
      userLat: 0,
      userLng: 0,
      radiusKm: 10,
      serviceTypeFilters: ['beauty'],
      sortBy: 'distance',
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Beauty Place');
    expect(result[0].serviceTypes).toEqual(['beauty']);
    expect(result[0].serviceTags).toEqual(['איפור']);
  });

  test('getBusinessesNearby sorts by service type when requested', async () => {
    const { ctx } = createMockCtx({
      users: [buildUser()],
      businesses: [
        buildBusiness({
          _id: 'business_food',
          name: 'Food Alpha',
          serviceTypes: ['food_drink'],
          location: { lat: 0, lng: 0.005 },
        }),
        buildBusiness({
          _id: 'business_beauty',
          name: 'Beauty Beta',
          serviceTypes: ['beauty'],
          location: { lat: 0, lng: 0.001 },
        }),
        buildBusiness({
          _id: 'business_unclassified',
          name: 'No Type',
          serviceTypes: [],
          location: { lat: 0, lng: 0.0005 },
        }),
      ],
      businessStaff: [],
    });

    const result = await getBusinessesNearby._handler(ctx, {
      userLat: 0,
      userLng: 0,
      radiusKm: 10,
      sortBy: 'service_type',
    });

    expect(result.map((item) => item.name)).toEqual([
      'Food Alpha',
      'Beauty Beta',
      'No Type',
    ]);
  });
});
