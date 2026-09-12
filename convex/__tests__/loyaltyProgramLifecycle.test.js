import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  archiveProgram,
  countNonArchivedPrograms,
  hasLoyaltyThemeConflict,
  publishProgram,
  unarchiveProgram,
  updateProgramForManagement,
} from '../loyaltyPrograms';

function buildUser(overrides = {}) {
  return {
    _id: 'user_owner',
    customerOnboardedAt: 1,
    isActive: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function buildBusiness(overrides = {}) {
  return {
    _id: 'business_1',
    ownerUserId: 'user_owner',
    externalId: 'business-one',
    name: 'Business One',
    shortDescription: 'Complete business profile',
    businessPhone: '+972 50-123-4567',
    serviceTypes: ['beauty'],
    serviceTags: ['nails'],
    placeId: 'place_1',
    formattedAddress: 'Test Address 10',
    location: { lat: 32.08, lng: 34.78 },
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    isActive: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function buildStaff(overrides = {}) {
  return {
    _id: 'staff_business_1',
    businessId: 'business_1',
    userId: 'user_owner',
    staffRole: 'owner',
    status: 'active',
    isActive: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function buildBillingAccount(overrides = {}) {
  return {
    _id: 'billing_1',
    businessId: 'business_1',
    ownerUserId: 'user_owner',
    providerAppUserId: 'ba_testidentitytoken1234',
    plan: 'starter',
    lastPlan: 'starter',
    status: 'active',
    hasProviderEvidence: true,
    currentPeriodEndAt: Date.now() + 86_400_000,
    ...overrides,
  };
}

function buildProgram(overrides = {}) {
  return {
    _id: 'program_1',
    businessId: 'business_1',
    status: 'active',
    publishedAt: 2,
    title: 'First card',
    description: 'Keep me',
    imageUrl: 'https://example.test/card.png',
    rewardName: 'Free reward',
    maxStamps: 10,
    cardTerms: 'Original terms',
    rewardConditions: 'Original conditions',
    stampIcon: 'star',
    stampShape: 'circle',
    cardThemeId: 'midnight-luxe',
    structureSignature: 'signature',
    posSortOrder: 0,
    allowPosEnroll: true,
    isArchived: false,
    isActive: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function buildMembership(overrides = {}) {
  return {
    _id: 'membership_1',
    businessId: 'business_1',
    programId: 'program_1',
    userId: 'user_customer',
    currentStamps: 4,
    isActive: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createMockCtx({
  currentUserId = 'user_owner',
  users = [buildUser()],
  businesses = [buildBusiness()],
  businessStaff = [buildStaff()],
  loyaltyPrograms = [],
  businessBillingAccounts = [buildBillingAccount()],
  memberships = [],
} = {}) {
  const state = {
    users: new Map(users.map((row) => [row._id, { ...row }])),
    businesses: new Map(businesses.map((row) => [row._id, { ...row }])),
    businessStaff: new Map(businessStaff.map((row) => [row._id, { ...row }])),
    loyaltyPrograms: new Map(
      loyaltyPrograms.map((row) => [row._id, { ...row }])
    ),
    businessBillingAccounts: new Map(
      businessBillingAccounts.map((row) => [row._id, { ...row }])
    ),
    memberships: new Map(memberships.map((row) => [row._id, { ...row }])),
    businessUsageCounters: new Map(),
    campaigns: new Map(),
    referralConfigs: new Map(),
    aiUsageLedger: new Map(),
  };

  const rowsForTable = (tableName) =>
    state[tableName] ? Array.from(state[tableName].values()) : [];

  const createQuery = (tableName) => {
    let rows = rowsForTable(tableName);
    const query = {
      withIndex(_indexName, buildIndex) {
        const filters = [];
        const indexQuery = {
          eq(field, value) {
            filters.push([field, value]);
            return indexQuery;
          },
        };
        if (typeof buildIndex === 'function') {
          buildIndex(indexQuery);
        }
        rows = rows.filter((row) =>
          filters.every(([field, value]) => row[field] === value)
        );
        return query;
      },
      filter(builder) {
        const q = {
          field: (name) => ({ __field: name }),
          eq(left, right) {
            if (left && typeof left.__field === 'string') {
              rows = rows.filter((row) => row[left.__field] === right);
            }
            return { op: 'eq', left, right };
          },
        };
        if (typeof builder === 'function') {
          builder(q);
        }
        return query;
      },
      order() {
        return query;
      },
      first: async () => rows[0] ?? null,
      unique: async () => rows[0] ?? null,
      collect: async () => rows,
      take: async (count) => rows.slice(0, count),
    };
    return query;
  };

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
            table.set(id, { ...table.get(id), ...patch });
            return;
          }
        }
        throw new Error(`UNKNOWN_PATCH_TARGET:${id}`);
      },
      insert: async (tableName, value) => {
        if (!state[tableName]) {
          state[tableName] = new Map();
        }
        const id = `${tableName}_${state[tableName].size + 1}`;
        state[tableName].set(id, { _id: id, ...value });
        return id;
      },
      delete: async (id) => {
        for (const table of Object.values(state)) {
          if (table.has(id)) {
            table.delete(id);
            return;
          }
        }
      },
      query: createQuery,
      system: {
        normalizeId: (_tableName, id) => id ?? null,
      },
    },
  };

  return { ctx, state };
}

async function getErrorData(work) {
  try {
    await work();
    return null;
  } catch (error) {
    return error?.data ?? error?.message ?? null;
  }
}

function usageCounter(state) {
  return Array.from(state.businessUsageCounters.values())[0] ?? null;
}

describe('archive and reactivation lifecycle', () => {
  test('archived card releases maxCards slot and theme', async () => {
    const { ctx, state } = createMockCtx({
      loyaltyPrograms: [buildProgram()],
    });

    await archiveProgram._handler(ctx, {
      businessId: 'business_1',
      programId: 'program_1',
    });

    const archived = state.loyaltyPrograms.get('program_1');
    expect(archived.status).toBe('archived');
    expect(archived.isArchived).toBe(true);
    expect(countNonArchivedPrograms(Array.from(state.loyaltyPrograms.values()))).toBe(
      0
    );
    expect(
      hasLoyaltyThemeConflict(
        Array.from(state.loyaltyPrograms.values()),
        'business_1',
        'midnight-luxe'
      )
    ).toBe(false);
    expect(usageCounter(state)?.nonArchivedCards ?? 0).toBe(0);
  });

  test('reactivation succeeds when slot and theme are available and preserves identity', async () => {
    const { ctx, state } = createMockCtx({
      loyaltyPrograms: [
        buildProgram({
          status: 'archived',
          isArchived: true,
          archivedAt: 9,
          archivedByUserId: 'user_owner',
        }),
      ],
      memberships: [buildMembership()],
    });

    const result = await unarchiveProgram._handler(ctx, {
      businessId: 'business_1',
      programId: 'program_1',
    });

    const restored = state.loyaltyPrograms.get('program_1');
    expect(result.ok).toBe(true);
    expect(restored._id).toBe('program_1');
    expect(restored.status).toBe('active');
    expect(restored.isArchived).toBe(false);
    expect(restored.title).toBe('First card');
    expect(restored.description).toBe('Keep me');
    expect(restored.imageUrl).toBe('https://example.test/card.png');
    expect(restored.rewardName).toBe('Free reward');
    expect(restored.maxStamps).toBe(10);
    expect(restored.cardTerms).toBe('Original terms');
    expect(restored.rewardConditions).toBe('Original conditions');
    expect(restored.cardThemeId).toBe('midnight-luxe');
    expect(restored.stampIcon).toBe('star');
    expect(restored.publishedAt).toBe(2);
    expect(state.memberships.get('membership_1')).toMatchObject({
      programId: 'program_1',
      currentStamps: 4,
    });
    expect(usageCounter(state)?.nonArchivedCards).toBe(1);
  });

  test('reactivation is denied when maxCards is full', async () => {
    const { ctx, state } = createMockCtx({
      loyaltyPrograms: [
        buildProgram({ cardThemeId: 'sunset-pop' }),
        buildProgram({
          _id: 'program_archived',
          status: 'archived',
          isArchived: true,
          cardThemeId: 'midnight-luxe',
        }),
      ],
    });

    const error = await getErrorData(() =>
      unarchiveProgram._handler(ctx, {
        businessId: 'business_1',
        programId: 'program_archived',
      })
    );
    expect(error).toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
      limitKey: 'maxCards',
      limitValue: 1,
    });
    expect(state.loyaltyPrograms.get('program_archived').status).toBe(
      'archived'
    );
  });

  test('reactivation is denied when another non-archived card owns the theme', async () => {
    const { ctx, state } = createMockCtx({
      businesses: [buildBusiness({ subscriptionPlan: 'pro' })],
      businessBillingAccounts: [buildBillingAccount({ plan: 'pro', lastPlan: 'pro' })],
      loyaltyPrograms: [
        buildProgram({
          _id: 'program_live',
          cardThemeId: 'forest-club',
        }),
        buildProgram({
          _id: 'program_archived',
          status: 'archived',
          isArchived: true,
          cardThemeId: 'forest-club',
        }),
      ],
    });

    await expect(
      unarchiveProgram._handler(ctx, {
        businessId: 'business_1',
        programId: 'program_archived',
      })
    ).rejects.toThrow('LOYALTY_THEME_CONFLICT');
    expect(state.loyaltyPrograms.get('program_archived').status).toBe(
      'archived'
    );
    expect(state.loyaltyPrograms.get('program_archived').cardThemeId).toBe(
      'forest-club'
    );
  });

  test('draft and active reserve theme while archived does not', () => {
    const draft = buildProgram({ _id: 'draft', status: 'draft' });
    const active = buildProgram({ _id: 'active', status: 'active' });
    const archived = buildProgram({
      _id: 'archived',
      status: 'archived',
      isArchived: true,
    });

    expect(
      hasLoyaltyThemeConflict([draft], 'business_1', 'midnight-luxe')
    ).toBe(true);
    expect(
      hasLoyaltyThemeConflict([active], 'business_1', 'midnight-luxe')
    ).toBe(true);
    expect(
      hasLoyaltyThemeConflict([archived], 'business_1', 'midnight-luxe')
    ).toBe(false);
    expect(countNonArchivedPrograms([draft, active, archived])).toBe(2);
  });

  test('concurrent reactivation cannot produce duplicate theme ownership', async () => {
    const { ctx, state } = createMockCtx({
      businesses: [buildBusiness({ subscriptionPlan: 'pro' })],
      businessBillingAccounts: [buildBillingAccount({ plan: 'pro', lastPlan: 'pro' })],
      loyaltyPrograms: [
        buildProgram({
          _id: 'program_a',
          status: 'archived',
          isArchived: true,
          cardThemeId: 'royal-plum',
        }),
        buildProgram({
          _id: 'program_b',
          status: 'archived',
          isArchived: true,
          cardThemeId: 'royal-plum',
        }),
      ],
    });

    await unarchiveProgram._handler(ctx, {
      businessId: 'business_1',
      programId: 'program_a',
    });
    await expect(
      unarchiveProgram._handler(ctx, {
        businessId: 'business_1',
        programId: 'program_b',
      })
    ).rejects.toThrow('LOYALTY_THEME_CONFLICT');

    const programs = Array.from(state.loyaltyPrograms.values());
    expect(programs.filter((program) => program.status === 'active')).toHaveLength(
      1
    );
    expect(state.loyaltyPrograms.get('program_a').status).toBe('active');
    expect(state.loyaltyPrograms.get('program_b').status).toBe('archived');

    const source = readFileSync('convex/loyaltyPrograms.ts', 'utf8');
    const helperStart = source.indexOf(
      'async function assertCanReactivateArchivedProgram'
    );
    const helperEnd = source.indexOf(
      'export function resolveProgramLifecycle',
      helperStart
    );
    const helper = source.slice(helperStart, helperEnd);
    expect(helper.indexOf('assertCardSlotAvailable')).toBeGreaterThan(-1);
    expect(helper.indexOf('assertCardSlotAvailable')).toBeLessThan(
      helper.lastIndexOf('assertThemeAvailable')
    );
    expect(helper).toContain('releaseUsageSlot');
  });

  test('unauthorized staff cannot reactivate while manager can', async () => {
    const users = [
      buildUser(),
      buildUser({ _id: 'user_manager' }),
      buildUser({ _id: 'user_staff' }),
    ];
    const businessStaff = [
      buildStaff(),
      buildStaff({
        _id: 'staff_manager',
        userId: 'user_manager',
        staffRole: 'manager',
      }),
      buildStaff({
        _id: 'staff_staff',
        userId: 'user_staff',
        staffRole: 'staff',
      }),
    ];
    const archived = [
      buildProgram({
        status: 'archived',
        isArchived: true,
        cardThemeId: 'ocean-deep',
      }),
    ];

    const staffCtx = createMockCtx({
      currentUserId: 'user_staff',
      users,
      businessStaff,
      loyaltyPrograms: archived,
    });
    await expect(
      unarchiveProgram._handler(staffCtx.ctx, {
        businessId: 'business_1',
        programId: 'program_1',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
    expect(staffCtx.state.loyaltyPrograms.get('program_1').status).toBe(
      'archived'
    );

    const managerCtx = createMockCtx({
      currentUserId: 'user_manager',
      users,
      businessStaff,
      loyaltyPrograms: archived,
    });
    await unarchiveProgram._handler(managerCtx.ctx, {
      businessId: 'business_1',
      programId: 'program_1',
    });
    expect(managerCtx.state.loyaltyPrograms.get('program_1').status).toBe(
      'active'
    );
  });

  test('unpaid business cannot bypass the operational billing gate', async () => {
    const { ctx, state } = createMockCtx({
      businesses: [
        buildBusiness({
          subscriptionPlan: 'pro',
          subscriptionStatus: 'inactive',
        }),
      ],
      businessBillingAccounts: [],
      loyaltyPrograms: [
        buildProgram({
          status: 'archived',
          isArchived: true,
        }),
      ],
    });

    const error = await getErrorData(() =>
      unarchiveProgram._handler(ctx, {
        businessId: 'business_1',
        programId: 'program_1',
      })
    );
    expect(error).toMatchObject({
      code: 'SUBSCRIPTION_INACTIVE',
    });
    expect(state.loyaltyPrograms.get('program_1').status).toBe('archived');
  });

  test('publish and update are not reactivation paths', async () => {
    const { ctx, state } = createMockCtx({
      loyaltyPrograms: [
        buildProgram({
          status: 'archived',
          isArchived: true,
        }),
      ],
    });

    await expect(
      publishProgram._handler(ctx, {
        businessId: 'business_1',
        programId: 'program_1',
      })
    ).rejects.toThrow('PROGRAM_PUBLISH_REQUIRES_DRAFT');
    await expect(
      updateProgramForManagement._handler(ctx, {
        businessId: 'business_1',
        programId: 'program_1',
        title: 'Hijack',
        rewardName: 'Changed',
        maxStamps: 8,
        stampIcon: 'coffee',
        cardThemeId: 'sunset-pop',
      })
    ).rejects.toThrow('PROGRAM_ARCHIVED_READONLY');
    expect(state.loyaltyPrograms.get('program_1')).toMatchObject({
      status: 'archived',
      title: 'First card',
      cardThemeId: 'midnight-luxe',
      rewardName: 'Free reward',
    });
  });
});
