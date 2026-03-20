import { describe, expect, test } from 'bun:test';

import {
  getBusinessesNearby,
  getBusinessSettings,
  saveBusinessOnboardingSnapshot,
  updateBusinessAddress,
  updateBusinessProfile,
} from '../business';

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
} = {}) {
  const state = {
    users: new Map(users.map((entry) => [entry._id, { ...entry }])),
    businesses: new Map(businesses.map((entry) => [entry._id, { ...entry }])),
    businessStaff: new Map(
      businessStaff.map((entry) => [entry._id, { ...entry }])
    ),
  };

  const ctx = {
    auth: {
      getUserIdentity: async () =>
        currentUserId ? { subject: `${currentUserId}|session_1` } : null,
    },
    db: {
      get: async (id) =>
        state.users.get(id) ??
        state.businesses.get(id) ??
        state.businessStaff.get(id) ??
        null,
      patch: async (id, patch) => {
        if (state.businesses.has(id)) {
          const current = state.businesses.get(id);
          state.businesses.set(id, {
            ...current,
            ...patch,
          });
          return;
        }

        if (state.businessStaff.has(id)) {
          const current = state.businessStaff.get(id);
          state.businessStaff.set(id, {
            ...current,
            ...patch,
          });
          return;
        }

        throw new Error(`UNKNOWN_PATCH_TARGET:${id}`);
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
                : [];

          const filteredRows = rows.filter((row) =>
            filters.every(([field, value]) => row[field] === value)
          );

          return {
            first: async () => filteredRows[0] ?? null,
            collect: async () => filteredRows,
          };
        },
      }),
    },
  };

  return { ctx, state };
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
