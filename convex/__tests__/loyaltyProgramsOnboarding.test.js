import { describe, expect, test } from 'bun:test';

import {
  createOrResumeBusinessOnboardingProgram,
  publishProgram,
} from '../loyaltyPrograms';
import { completeBusinessOnboarding } from '../users';

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
    onboardingSnapshot: {
      discoverySource: 'search',
      reason: 'insights',
      usageAreas: ['citywide'],
      ownerAgeRange: '25-34',
      businessExample: 'hair_salon',
      birthdayCampaignRelevant: true,
      joinAnniversaryCampaignRelevant: true,
      weakTimePromosRelevant: true,
      collectedAt: 1,
    },
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    isActive: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function buildOwnerStaff(businessId = 'business_1', overrides = {}) {
  return {
    _id: `staff_${businessId}`,
    businessId,
    userId: 'user_owner',
    staffRole: 'owner',
    status: 'active',
    isActive: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function buildProgram(overrides = {}) {
  return {
    _id: 'program_1',
    businessId: 'business_1',
    status: 'draft',
    title: 'First card',
    rewardName: 'Free reward',
    maxStamps: 10,
    stampIcon: 'star',
    stampShape: 'circle',
    cardThemeId: 'midnight-luxe',
    structureSignature: 'signature',
    isArchived: false,
    isActive: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function buildDraft(overrides = {}) {
  return {
    _id: 'draft_default',
    userId: 'user_owner',
    flow: 'default',
    status: 'in_progress',
    currentStep: 'previewCard',
    farthestStep: 'previewCard',
    farthestStepOrder: 5,
    businessId: 'business_1',
    programId: 'program_1',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createMockCtx({
  currentUserId = 'user_owner',
  users = [buildUser()],
  businesses = [buildBusiness()],
  businessStaff = [buildOwnerStaff()],
  loyaltyPrograms = [],
  businessOnboardingDrafts = [],
} = {}) {
  const state = {
    users: new Map(users.map((row) => [row._id, { ...row }])),
    businesses: new Map(businesses.map((row) => [row._id, { ...row }])),
    businessStaff: new Map(
      businessStaff.map((row) => [row._id, { ...row }])
    ),
    loyaltyPrograms: new Map(
      loyaltyPrograms.map((row) => [row._id, { ...row }])
    ),
    businessOnboardingDrafts: new Map(
      businessOnboardingDrafts.map((row) => [row._id, { ...row }])
    ),
  };
  const patchLog = [];
  let programInsertCount = 0;
  let draftInsertCount = 0;

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
          gte() {
            return indexQuery;
          },
        };
        buildIndex(indexQuery);
        rows = rows.filter((row) =>
          filters.every(([field, value]) => row[field] === value)
        );
        return query;
      },
      filter() {
        return query;
      },
      order() {
        return query;
      },
      first: async () => rows[0] ?? null,
      unique: async () => {
        if (rows.length > 1) {
          throw new Error('NOT_UNIQUE');
        }
        return rows[0] ?? null;
      },
      collect: async () => rows,
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
        for (const [tableName, table] of Object.entries(state)) {
          if (table.has(id)) {
            table.set(id, { ...table.get(id), ...patch });
            patchLog.push({ tableName, id, patch });
            return;
          }
        }
        throw new Error(`UNKNOWN_PATCH_TARGET:${id}`);
      },
      insert: async (tableName, value) => {
        if (tableName === 'loyaltyPrograms') {
          programInsertCount += 1;
          const id = `program_inserted_${programInsertCount}`;
          state.loyaltyPrograms.set(id, { _id: id, ...value });
          return id;
        }
        if (tableName === 'businessOnboardingDrafts') {
          draftInsertCount += 1;
          const id = `draft_inserted_${draftInsertCount}`;
          state.businessOnboardingDrafts.set(id, { _id: id, ...value });
          return id;
        }
        throw new Error(`UNKNOWN_INSERT_TABLE:${tableName}`);
      },
      query: createQuery,
      system: {
        normalizeId: (_tableName, id) => id ?? null,
      },
    },
  };

  return { ctx, state, patchLog };
}

function programArgs(overrides = {}) {
  return {
    flow: 'default',
    businessId: 'business_1',
    title: 'First card',
    rewardName: 'Free reward',
    maxStamps: 10,
    cardTerms: 'Card terms',
    rewardConditions: 'Reward conditions',
    stampIcon: 'star',
    stampShape: 'circle',
    cardThemeId: 'midnight-luxe',
    ...overrides,
  };
}

describe('business onboarding program idempotency', () => {
  test('first submit creates and links one program; lost-response retry reuses it', async () => {
    const { ctx, state } = createMockCtx();

    const first = await createOrResumeBusinessOnboardingProgram._handler(
      ctx,
      programArgs()
    );
    const retry = await createOrResumeBusinessOnboardingProgram._handler(
      ctx,
      programArgs()
    );

    expect(first.reused).toBe(false);
    expect(retry).toEqual({
      loyaltyProgramId: first.loyaltyProgramId,
      reused: true,
    });
    expect(state.loyaltyPrograms.size).toBe(1);
    expect(state.businessOnboardingDrafts.size).toBe(1);
    expect(
      Array.from(state.businessOnboardingDrafts.values())[0]
    ).toMatchObject({
      flow: 'default',
      businessId: 'business_1',
      programId: first.loyaltyProgramId,
      currentStep: 'previewCard',
      status: 'in_progress',
    });
  });

  test('explicit edit and restart from the server draft update the same program', async () => {
    const { ctx, state } = createMockCtx();
    const first = await createOrResumeBusinessOnboardingProgram._handler(
      ctx,
      programArgs()
    );

    const edited = await createOrResumeBusinessOnboardingProgram._handler(
      ctx,
      programArgs({
        programId: first.loyaltyProgramId,
        title: 'Edited card',
      })
    );
    const restarted = await createOrResumeBusinessOnboardingProgram._handler(
      ctx,
      programArgs({ title: 'Restarted card' })
    );

    expect(edited.reused).toBe(true);
    expect(restarted.loyaltyProgramId).toBe(first.loyaltyProgramId);
    expect(state.loyaltyPrograms.size).toBe(1);
    expect(state.loyaltyPrograms.get(first.loyaltyProgramId).title).toBe(
      'Restarted card'
    );
  });

  test('explicit program from another business is rejected without replacement', async () => {
    const foreignProgram = buildProgram({
      _id: 'program_foreign',
      businessId: 'business_2',
    });
    const { ctx, state } = createMockCtx({
      loyaltyPrograms: [foreignProgram],
    });

    await expect(
      createOrResumeBusinessOnboardingProgram._handler(
        ctx,
        programArgs({ programId: 'program_foreign' })
      )
    ).rejects.toThrow('PROGRAM_BUSINESS_MISMATCH');
    expect(state.loyaltyPrograms.size).toBe(1);
    expect(state.businessOnboardingDrafts.size).toBe(0);
  });

  test('default and additional flows keep separate program links', async () => {
    const business2 = buildBusiness({
      _id: 'business_2',
      externalId: 'business-two',
      name: 'Business Two',
    });
    const { ctx, state } = createMockCtx({
      users: [buildUser({ businessOnboardedAt: 1 })],
      businesses: [buildBusiness(), business2],
      businessStaff: [buildOwnerStaff(), buildOwnerStaff('business_2')],
    });

    const defaultResult =
      await createOrResumeBusinessOnboardingProgram._handler(
        ctx,
        programArgs()
      );
    const additionalResult =
      await createOrResumeBusinessOnboardingProgram._handler(
        ctx,
        programArgs({ flow: 'additional', businessId: 'business_2' })
      );

    expect(additionalResult.loyaltyProgramId).not.toBe(
      defaultResult.loyaltyProgramId
    );
    expect(state.loyaltyPrograms.size).toBe(2);
    expect(
      Array.from(state.businessOnboardingDrafts.values()).map((draft) => ({
        flow: draft.flow,
        businessId: draft.businessId,
        programId: draft.programId,
      }))
    ).toEqual([
      {
        flow: 'default',
        businessId: 'business_1',
        programId: defaultResult.loyaltyProgramId,
      },
      {
        flow: 'additional',
        businessId: 'business_2',
        programId: additionalResult.loyaltyProgramId,
      },
    ]);
  });

  test('a program linked to the default flow cannot be explicitly reused by additional flow', async () => {
    const { ctx, state } = createMockCtx({
      users: [buildUser({ businessOnboardedAt: 1 })],
      loyaltyPrograms: [buildProgram()],
      businessOnboardingDrafts: [buildDraft()],
    });

    await expect(
      createOrResumeBusinessOnboardingProgram._handler(
        ctx,
        programArgs({ flow: 'additional', programId: 'program_1' })
      )
    ).rejects.toThrow('PROGRAM_ONBOARDING_FLOW_MISMATCH');
    expect(state.loyaltyPrograms.size).toBe(1);
    expect(state.businessOnboardingDrafts.size).toBe(1);
  });

  test('a completed prior additional draft is relinked without reusing its other-business program', async () => {
    const priorProgram = buildProgram({
      _id: 'program_prior',
      businessId: 'business_prior',
      status: 'active',
    });
    const priorDraft = buildDraft({
      _id: 'draft_additional',
      flow: 'additional',
      status: 'completed',
      businessId: 'business_prior',
      programId: 'program_prior',
    });
    const { ctx, state } = createMockCtx({
      users: [buildUser({ businessOnboardedAt: 1 })],
      loyaltyPrograms: [priorProgram],
      businessOnboardingDrafts: [priorDraft],
    });

    const result = await createOrResumeBusinessOnboardingProgram._handler(
      ctx,
      programArgs({ flow: 'additional' })
    );

    expect(result.reused).toBe(false);
    expect(result.loyaltyProgramId).not.toBe('program_prior');
    expect(state.businessOnboardingDrafts.get('draft_additional')).toMatchObject(
      {
        status: 'in_progress',
        businessId: 'business_1',
        programId: result.loyaltyProgramId,
      }
    );
  });
});

describe('onboarding publish retry', () => {
  test('draft publish becomes active and a same-program retry is a no-op success', async () => {
    const { ctx, state } = createMockCtx({
      loyaltyPrograms: [buildProgram()],
    });

    const first = await publishProgram._handler(ctx, {
      businessId: 'business_1',
      programId: 'program_1',
    });
    const publishedUpdatedAt = first.updatedAt;
    const retry = await publishProgram._handler(ctx, {
      businessId: 'business_1',
      programId: 'program_1',
      expectedUpdatedAt: 1,
    });

    expect(state.loyaltyPrograms.get('program_1').status).toBe('active');
    expect(retry).toEqual({ ok: true, updatedAt: publishedUpdatedAt });
  });

  test('archived and wrong-business programs remain rejected', async () => {
    const business2 = buildBusiness({
      _id: 'business_2',
      externalId: 'business-two',
    });
    const { ctx } = createMockCtx({
      businesses: [buildBusiness(), business2],
      businessStaff: [buildOwnerStaff(), buildOwnerStaff('business_2')],
      loyaltyPrograms: [
        buildProgram({ status: 'archived', isArchived: true }),
      ],
    });

    await expect(
      publishProgram._handler(ctx, {
        businessId: 'business_1',
        programId: 'program_1',
      })
    ).rejects.toThrow('PROGRAM_REACTIVATION_FORBIDDEN');
    await expect(
      publishProgram._handler(ctx, {
        businessId: 'business_2',
        programId: 'program_1',
      })
    ).rejects.toThrow('PROGRAM_NOT_FOUND');
  });
});

describe('atomic business onboarding completion', () => {
  test('valid active matching program commits user and matching draft final state', async () => {
    const { ctx, state } = createMockCtx({
      loyaltyPrograms: [buildProgram({ status: 'active', publishedAt: 2 })],
      businessOnboardingDrafts: [buildDraft()],
    });

    await completeBusinessOnboarding._handler(ctx, {
      businessId: 'business_1',
      programId: 'program_1',
      flow: 'default',
    });

    expect(state.users.get('user_owner')).toMatchObject({
      activeBusinessId: 'business_1',
      activeMode: 'business',
    });
    expect(typeof state.users.get('user_owner').businessOnboardedAt).toBe(
      'number'
    );
    expect(state.businessOnboardingDrafts.get('draft_default')).toMatchObject({
      status: 'completed',
      currentStep: 'previewCard',
      farthestStep: 'previewCard',
      farthestStepOrder: 5,
      businessId: 'business_1',
      programId: 'program_1',
    });
  });

  test.each([
    ['missing program', [], buildDraft(), 'PROGRAM_NOT_FOUND'],
    [
      'wrong-business program',
      [buildProgram({ businessId: 'business_2' })],
      buildDraft(),
      'PROGRAM_BUSINESS_MISMATCH',
    ],
    [
      'unpublished program',
      [buildProgram({ status: 'draft' })],
      buildDraft(),
      'PROGRAM_NOT_PUBLISHED',
    ],
    [
      'mismatched draft program',
      [buildProgram({ status: 'active' })],
      buildDraft({ programId: 'program_other' }),
      'ONBOARDING_DRAFT_PROGRAM_MISMATCH',
    ],
  ])('%s rejects before any final-state write', async (
    _label,
    loyaltyPrograms,
    draft,
    expectedError
  ) => {
    const { ctx, state, patchLog } = createMockCtx({
      loyaltyPrograms,
      businessOnboardingDrafts: [draft],
    });

    await expect(
      completeBusinessOnboarding._handler(ctx, {
        businessId: 'business_1',
        programId: 'program_1',
        flow: 'default',
      })
    ).rejects.toThrow(expectedError);

    expect(state.users.get('user_owner').businessOnboardedAt).toBeUndefined();
    expect(state.users.get('user_owner').activeBusinessId).toBeUndefined();
    expect(state.users.get('user_owner').activeMode).toBeUndefined();
    expect(state.businessOnboardingDrafts.get(draft._id).status).toBe(
      'in_progress'
    );
    expect(patchLog).toHaveLength(0);
  });

  test('incomplete profile rejects before final-state writes', async () => {
    const { ctx, state, patchLog } = createMockCtx({
      businesses: [buildBusiness({ shortDescription: '' })],
      loyaltyPrograms: [buildProgram({ status: 'active' })],
      businessOnboardingDrafts: [buildDraft()],
    });

    await expect(
      completeBusinessOnboarding._handler(ctx, {
        businessId: 'business_1',
        programId: 'program_1',
        flow: 'default',
      })
    ).rejects.toThrow('BUSINESS_PROFILE_INCOMPLETE');
    expect(state.users.get('user_owner').businessOnboardedAt).toBeUndefined();
    expect(state.businessOnboardingDrafts.get('draft_default').status).toBe(
      'in_progress'
    );
    expect(patchLog).toHaveLength(0);
  });

  test('additional flow preserves prior onboarding timestamp and completes its own draft', async () => {
    const originalCompletedAt = 100;
    const business2 = buildBusiness({
      _id: 'business_2',
      externalId: 'business-two',
    });
    const program2 = buildProgram({
      _id: 'program_2',
      businessId: 'business_2',
      status: 'active',
    });
    const additionalDraft = buildDraft({
      _id: 'draft_additional',
      flow: 'additional',
      farthestStepOrder: 4,
      businessId: 'business_2',
      programId: 'program_2',
    });
    const { ctx, state } = createMockCtx({
      users: [buildUser({ businessOnboardedAt: originalCompletedAt })],
      businesses: [buildBusiness(), business2],
      businessStaff: [buildOwnerStaff(), buildOwnerStaff('business_2')],
      loyaltyPrograms: [program2],
      businessOnboardingDrafts: [additionalDraft],
    });

    await completeBusinessOnboarding._handler(ctx, {
      businessId: 'business_2',
      programId: 'program_2',
      flow: 'additional',
    });

    expect(state.users.get('user_owner')).toMatchObject({
      businessOnboardedAt: originalCompletedAt,
      activeBusinessId: 'business_2',
      activeMode: 'business',
    });
    expect(
      state.businessOnboardingDrafts.get('draft_additional')
    ).toMatchObject({
      status: 'completed',
      farthestStepOrder: 4,
      businessId: 'business_2',
      programId: 'program_2',
    });
  });

  test('manager cannot create or complete owner onboarding', async () => {
    const manager = buildOwnerStaff('business_1', {
      _id: 'staff_manager',
      userId: 'user_manager',
      staffRole: 'manager',
    });
    const { ctx, patchLog } = createMockCtx({
      currentUserId: 'user_manager',
      users: [buildUser({ _id: 'user_manager' })],
      businessStaff: [buildOwnerStaff(), manager],
      loyaltyPrograms: [buildProgram({ status: 'active' })],
      businessOnboardingDrafts: [
        buildDraft({ userId: 'user_manager' }),
      ],
    });

    await expect(
      createOrResumeBusinessOnboardingProgram._handler(ctx, programArgs())
    ).rejects.toThrow('NOT_AUTHORIZED');
    await expect(
      completeBusinessOnboarding._handler(ctx, {
        businessId: 'business_1',
        programId: 'program_1',
        flow: 'default',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
    expect(patchLog).toHaveLength(0);
  });
});
