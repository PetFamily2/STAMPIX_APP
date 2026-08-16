import { describe, expect, test } from 'bun:test';

import {
  claimPermanentDeletionPushAttemptInternal,
  deleteBusinessPermanently,
  deliverPermanentDeletionPushInternal,
  finalizePermanentDeletionPushAttemptInternal,
  getPermanentBusinessDeletionStatus,
  listMyBusinessesForPermanentDeletion,
  markBusinessDeletionFailedInternal,
  processBusinessDeletionBatchInternal,
  purgePermanentDeletionRetentionInternal,
  retryPermanentBusinessDeletion,
} from '../businessDeletion';

const BUSINESS_ID = 'business_1';
const OWNER_ID = 'user_owner';
const ALL_TABLES = [
  'users',
  'businesses',
  'businessDeletionJobs',
  'businessDeletionRecipients',
  'businessDeletionAssets',
  'businessOnboardingDrafts',
  'businessStaff',
  'recommendationInteractions',
  'recommendationGuideSessions',
  'loyaltyPrograms',
  'memberships',
  'referralConfigs',
  'customerReferralLinks',
  'customerReferrals',
  'referralRewards',
  'businessReferralLinks',
  'businessReferrals',
  'referralAdminAuditLog',
  'events',
  'scanSessions',
  'scanTokenEvents',
  'campaigns',
  'campaignRuns',
  'subscriptions',
  'revenueCatWebhookEvents',
  'messageLog',
  'aiBusinessSnapshots',
  'aiRecommendations',
  'aiGenerationCache',
  'aiUsageLedger',
  'pushTokens',
  'pushDeliveryLog',
  'supportRequests',
  'apiClients',
  'apiKeys',
  'staffInvites',
  'staffEvents',
  'authAccounts',
  'authSessions',
  'authRefreshTokens',
  'authVerificationCodes',
  'authVerifiers',
  'authRateLimits',
];

class FakeQuery {
  constructor(db, tableName, predicates = [], direction = 'asc') {
    this.db = db;
    this.tableName = tableName;
    this.predicates = predicates;
    this.direction = direction;
  }

  withIndex(name, builder) {
    this.db.indexUses.push({ table: this.tableName, index: name });
    const predicates = [...this.predicates];
    const q = {
      eq: (field, value) => {
        predicates.push((row) => row[field] === value);
        return q;
      },
      lte: (field, value) => {
        predicates.push(
          (row) => row[field] !== undefined && row[field] <= value
        );
        return q;
      },
    };
    builder(q);
    return new FakeQuery(this.db, this.tableName, predicates, this.direction);
  }

  filter(builder) {
    const q = {
      field: (field) => field,
      eq: (field, value) => (row) => row[field] === value,
    };
    const predicate = builder(q);
    return new FakeQuery(
      this.db,
      this.tableName,
      [...this.predicates, predicate],
      this.direction
    );
  }

  order(direction) {
    return new FakeQuery(this.db, this.tableName, this.predicates, direction);
  }

  docs() {
    const rows = this.db
      .rows(this.tableName)
      .filter((row) => this.predicates.every((predicate) => predicate(row)));
    return this.direction === 'desc' ? [...rows].reverse() : rows;
  }

  async first() {
    return this.docs()[0] ?? null;
  }

  async collect() {
    return this.docs();
  }

  async take(count) {
    return this.docs().slice(0, count);
  }

  async paginate({ cursor, numItems }) {
    const rows = this.docs();
    const start = cursor == null ? 0 : Number(cursor);
    const end = Math.min(start + numItems, rows.length);
    return {
      page: rows.slice(start, end),
      isDone: end >= rows.length,
      continueCursor: String(end),
    };
  }
}

class FakeDb {
  constructor(initial) {
    this.tables = Object.fromEntries(
      ALL_TABLES.map((table) => [
        table,
        (initial[table] ?? []).map((row) => ({ ...row })),
      ])
    );
    this.knownIds = Object.fromEntries(
      ALL_TABLES.map((table) => [
        table,
        new Set(this.tables[table].map((row) => row._id)),
      ])
    );
    this.knownIds._storage = new Set(initial.storageIds ?? []);
    this.counter = 0;
    this.deletionOrder = [];
    this.indexUses = [];
  }

  rows(table) {
    if (!this.tables[table]) this.tables[table] = [];
    return this.tables[table];
  }

  query(table) {
    return new FakeQuery(this, table);
  }

  normalizeId(table, id) {
    return this.knownIds[table]?.has(id) ? id : null;
  }

  async get(id) {
    for (const rows of Object.values(this.tables)) {
      const row = rows.find((candidate) => candidate._id === id);
      if (row) return row;
    }
    return null;
  }

  async insert(table, value) {
    const id = value._id ?? `${table}_${++this.counter}`;
    this.rows(table).push({ _id: id, ...value });
    if (!this.knownIds[table]) this.knownIds[table] = new Set();
    this.knownIds[table].add(id);
    return id;
  }

  async patch(id, patch) {
    const row = await this.get(id);
    if (!row) throw new Error(`PATCH_TARGET_NOT_FOUND:${id}`);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete row[key];
      else row[key] = value;
    }
  }

  async delete(id) {
    for (const [table, rows] of Object.entries(this.tables)) {
      const index = rows.findIndex((row) => row._id === id);
      if (index >= 0) {
        rows.splice(index, 1);
        this.deletionOrder.push({ table, id });
        return;
      }
    }
    throw new Error(`DELETE_TARGET_NOT_FOUND:${id}`);
  }
}

function baseBusiness(overrides = {}) {
  const now = Date.now();
  return {
    _id: BUSINESS_ID,
    ownerUserId: OWNER_ID,
    externalId: 'business_external_1',
    name: 'Café Central',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseOwner(overrides = {}) {
  const now = Date.now();
  return {
    _id: OWNER_ID,
    isActive: true,
    activeMode: 'business',
    activeBusinessId: BUSINESS_ID,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseOwnerStaff(overrides = {}) {
  return {
    _id: 'staff_owner',
    businessId: BUSINESS_ID,
    userId: OWNER_ID,
    staffRole: 'owner',
    status: 'active',
    isActive: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

function buildCtx(initial = {}, currentUserId = OWNER_ID) {
  const db = new FakeDb({
    users: [baseOwner(), ...(initial.users ?? [])],
    businesses: [baseBusiness(), ...(initial.businesses ?? [])],
    businessStaff: [baseOwnerStaff(), ...(initial.businessStaff ?? [])],
    ...initial,
  });
  const scheduled = [];
  const deletedStorage = [];
  return {
    db,
    scheduled,
    deletedStorage,
    auth: {
      getUserIdentity: async () => ({ subject: `${currentUserId}|session` }),
    },
    scheduler: {
      runAfter: async (delay, fn, args) => scheduled.push({ delay, fn, args }),
    },
    storage: {
      delete: async (storageId) => deletedStorage.push(storageId),
    },
  };
}

async function requestDeletion(ctx) {
  return await deleteBusinessPermanently._handler(ctx, {
    businessId: BUSINESS_ID,
    confirmationBusinessName: '  CAFÉ   CENTRAL ',
  });
}

async function processUntil(ctx, predicate, limit = 250) {
  for (let index = 0; index < limit; index += 1) {
    const job = ctx.db.rows('businessDeletionJobs')[0];
    if (predicate(job)) return job;
    await processBusinessDeletionBatchInternal._handler(ctx, {
      jobId: job._id,
    });
  }
  throw new Error('PROCESS_LIMIT_EXCEEDED');
}

describe('permanent business deletion request', () => {
  test('active and closed canonical owners can freeze exactly one job', async () => {
    for (const isActive of [true, false]) {
      const ctx = buildCtx({ businesses: [baseBusiness({ isActive })] });
      const first = await requestDeletion(ctx);
      const second = await requestDeletion(ctx);

      expect(first.reused).toBe(false);
      expect(second).toMatchObject({ jobId: first.jobId, reused: true });
      expect(ctx.db.rows('businessDeletionJobs')).toHaveLength(1);
      expect(ctx.db.rows('businesses')[0]).toMatchObject({
        isActive: false,
        permanentDeletionStatus: 'in_progress',
      });
      expect(ctx.db.rows('businesses')[0].closedAt).toBeUndefined();
      expect(ctx.db.rows('businesses')[0].lastClosedAt).toBeUndefined();
      expect(ctx.db.rows('users')[0]).toMatchObject({ activeMode: 'customer' });
      expect(ctx.db.rows('users')[0].activeBusinessId).toBeUndefined();
    }
  });

  test('lost-response retry reuses the started job after owner staff purge without rerunning name or billing gates', async () => {
    const ctx = buildCtx();
    const first = await requestDeletion(ctx);
    ctx.db.rows('businessStaff').splice(0);
    ctx.db.rows('subscriptions').push({
      _id: 'subscription_added_after_start',
      businessId: BUSINESS_ID,
      provider: 'revenuecat',
      status: 'active',
    });

    const repeated = await deleteBusinessPermanently._handler(ctx, {
      businessId: BUSINESS_ID,
      confirmationBusinessName: 'intentionally wrong after authorization',
    });

    expect(repeated).toMatchObject({ jobId: first.jobId, reused: true });
    expect(ctx.db.rows('businessDeletionJobs')).toHaveLength(1);
    expect(await listMyBusinessesForPermanentDeletion._handler(ctx, {})).toEqual([
      expect.objectContaining({
        businessId: BUSINESS_ID,
        permanentDeletionStatus: 'in_progress',
        permanentDeletionJobId: first.jobId,
        permanentDeletionJobStatus: 'queued',
        permanentDeletionPhase: 'capture_customers',
      }),
    ]);
  });

  test('failed job remains discoverable and reusable by its requester after owner staff purge', async () => {
    const ctx = buildCtx();
    const first = await requestDeletion(ctx);
    ctx.db.rows('businessStaff').splice(0);
    await markBusinessDeletionFailedInternal._handler(ctx, {
      jobId: first.jobId,
      failureCode: 'INJECTED',
      failureDetail: 'injected',
    });

    const repeated = await deleteBusinessPermanently._handler(ctx, {
      businessId: BUSINESS_ID,
      confirmationBusinessName: 'not checked for existing job reuse',
    });

    expect(repeated).toMatchObject({
      jobId: first.jobId,
      status: 'failed',
      reused: true,
    });
    expect(ctx.db.rows('businessDeletionJobs')).toHaveLength(1);
    expect(await listMyBusinessesForPermanentDeletion._handler(ctx, {})).toEqual([
      expect.objectContaining({
        permanentDeletionJobId: first.jobId,
        permanentDeletionJobStatus: 'failed',
        permanentDeletionFailureCode: 'INJECTED',
      }),
    ]);
  });

  test.each(['manager', 'staff'])(
    '%s cannot see or reuse another owner deletion job after staff purge',
    async (staffRole) => {
      const ctx = buildCtx();
      await requestDeletion(ctx);
      ctx.db.rows('businessStaff').splice(0);
      ctx.db.rows('users').push(baseOwner({ _id: 'user_other' }));
      ctx.db.rows('businessStaff').push({
        _id: `stale_${staffRole}`,
        businessId: BUSINESS_ID,
        userId: 'user_other',
        staffRole,
        status: 'active',
      });
      const unauthorizedCtx = {
        ...ctx,
        auth: {
          getUserIdentity: async () => ({ subject: 'user_other|session' }),
        },
      };

      expect(
        await listMyBusinessesForPermanentDeletion._handler(unauthorizedCtx, {})
      ).toEqual([]);
      await expect(
        deleteBusinessPermanently._handler(unauthorizedCtx, {
          businessId: BUSINESS_ID,
          confirmationBusinessName: 'Café Central',
        })
      ).rejects.toThrow('NOT_AUTHORIZED');
    }
  );

  test('unrelated user cannot see or reuse another owner deletion job after staff purge', async () => {
    const ctx = buildCtx();
    await requestDeletion(ctx);
    ctx.db.rows('businessStaff').splice(0);
    ctx.db.rows('users').push(baseOwner({ _id: 'user_unrelated' }));
    const unauthorizedCtx = {
      ...ctx,
      auth: {
        getUserIdentity: async () => ({ subject: 'user_unrelated|session' }),
      },
    };

    expect(
      await listMyBusinessesForPermanentDeletion._handler(unauthorizedCtx, {})
    ).toEqual([]);
    await expect(
      deleteBusinessPermanently._handler(unauthorizedCtx, {
        businessId: BUSINESS_ID,
        confirmationBusinessName: 'Café Central',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  test('original requester cannot reuse or list the job after canonical ownership changes', async () => {
    const ctx = buildCtx();
    await requestDeletion(ctx);
    ctx.db.rows('businessStaff').splice(0);
    ctx.db.rows('businesses')[0].ownerUserId = 'user_new_owner';

    expect(await listMyBusinessesForPermanentDeletion._handler(ctx, {})).toEqual(
      []
    );
    await expect(
      deleteBusinessPermanently._handler(ctx, {
        businessId: BUSINESS_ID,
        confirmationBusinessName: 'Café Central',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  test.each([
    ['manager', 'manager', 'active'],
    ['staff', 'staff', 'active'],
    ['inactive owner', 'owner', 'suspended'],
  ])('%s is rejected', async (_label, role, status) => {
    const userId = 'user_other';
    const ctx = buildCtx(
      {
        users: [baseOwner({ _id: userId })],
        businesses: [baseBusiness({ ownerUserId: userId })],
        businessStaff: [
          baseOwnerStaff({
            _id: 'other_staff',
            userId,
            staffRole: role,
            status,
            isActive: status === 'active',
          }),
        ],
      },
      userId
    );
    await expect(requestDeletion(ctx)).rejects.toThrow('NOT_AUTHORIZED');
  });

  test('unrelated users and canonical owners without an owner row are rejected', async () => {
    const unrelated = buildCtx(
      { users: [baseOwner({ _id: 'user_other' })], businessStaff: [] },
      'user_other'
    );
    await expect(requestDeletion(unrelated)).rejects.toThrow('NOT_AUTHORIZED');

    const missingOwnerRow = buildCtx({ businessStaff: [] });
    await expect(requestDeletion(missingOwnerRow)).rejects.toThrow(
      'NOT_AUTHORIZED'
    );
  });

  test('server rejects a mismatched confirmation name', async () => {
    const ctx = buildCtx();
    await expect(
      deleteBusinessPermanently._handler(ctx, {
        businessId: BUSINESS_ID,
        confirmationBusinessName: 'Different',
      })
    ).rejects.toThrow('BUSINESS_NAME_CONFIRMATION_MISMATCH');
  });

  test.each(['active', 'trialing', 'past_due'])(
    'blocks RevenueCat %s',
    async (status) => {
      const ctx = buildCtx({
        subscriptions: [
          {
            _id: `sub_${status}`,
            businessId: BUSINESS_ID,
            provider: 'revenuecat',
            status,
          },
        ],
      });
      await expect(requestDeletion(ctx)).rejects.toThrow(
        'BUSINESS_SUBSCRIPTION_RENEWAL_ACTIVE'
      );
    }
  );

  test.each(['canceled', 'inactive'])(
    'allows RevenueCat %s',
    async (status) => {
      const ctx = buildCtx({
        subscriptions: [
          {
            _id: `sub_${status}`,
            businessId: BUSINESS_ID,
            provider: 'revenuecat',
            status,
          },
        ],
      });
      expect((await requestDeletion(ctx)).reused).toBe(false);
    }
  );

  test('owner listing includes active and closed canonical businesses with billing eligibility', async () => {
    const ctx = buildCtx({
      businesses: [
        baseBusiness(),
        baseBusiness({
          _id: 'business_closed',
          name: 'Closed',
          isActive: false,
          closedAt: 100,
        }),
        baseBusiness({
          _id: 'business_unrelated',
          ownerUserId: 'user_other',
          name: 'Unrelated',
        }),
      ],
      businessStaff: [
        baseOwnerStaff(),
        baseOwnerStaff({
          _id: 'staff_closed_owner',
          businessId: 'business_closed',
        }),
        baseOwnerStaff({
          _id: 'staff_unrelated',
          businessId: 'business_unrelated',
          staffRole: 'manager',
        }),
      ],
      subscriptions: [
        {
          _id: 'closed_subscription',
          businessId: 'business_closed',
          provider: 'revenuecat',
          status: 'canceled',
          endAt: 200,
        },
      ],
    });

    const result = await listMyBusinessesForPermanentDeletion._handler(ctx, {});
    expect(result.map((row) => row.businessId)).toEqual([
      BUSINESS_ID,
      'business_closed',
    ]);
    expect(result[1]).toMatchObject({
      isActive: false,
      closedAt: 100,
      deletionEligible: true,
      billing: { status: 'canceled', endAt: 200, renewalActive: false },
    });
  });

  test('requester sees a root-missing running job from its snapshot without a duplicate or billing data', async () => {
    const ctx = buildCtx();
    const request = await requestDeletion(ctx);
    await ctx.db.patch(request.jobId, {
      status: 'running',
      phase: 'finalize',
      updatedAt: Date.now() + 1,
    });
    ctx.db.rows('businesses').splice(0);
    ctx.db.indexUses.length = 0;

    const result = await listMyBusinessesForPermanentDeletion._handler(ctx, {});

    expect(result).toEqual([
      expect.objectContaining({
        businessExists: false,
        businessId: BUSINESS_ID,
        name: 'Café Central',
        permanentDeletionJobId: request.jobId,
        permanentDeletionJobStatus: 'running',
        permanentDeletionPhase: 'finalize',
      }),
    ]);
    expect(result[0]).not.toHaveProperty('billing');
    expect(
      ctx.db.indexUses.filter(({ table }) => table === 'businessDeletionJobs')
    ).toEqual([
      {
        table: 'businessDeletionJobs',
        index: 'by_requestedByUserId_status',
      },
      {
        table: 'businessDeletionJobs',
        index: 'by_requestedByUserId_status',
      },
      {
        table: 'businessDeletionJobs',
        index: 'by_requestedByUserId_status',
      },
    ]);
  });

  test('requester sees and can retry a failed finalization job after its business root is gone', async () => {
    const ctx = buildCtx();
    const request = await requestDeletion(ctx);
    await ctx.db.patch(request.jobId, { phase: 'finalize' });
    await markBusinessDeletionFailedInternal._handler(ctx, {
      jobId: request.jobId,
      failureCode: 'FINALIZATION_FAILED',
      failureDetail: 'injected',
    });
    ctx.db.rows('businesses').splice(0);

    const result = await listMyBusinessesForPermanentDeletion._handler(ctx, {});

    expect(result).toEqual([
      expect.objectContaining({
        businessExists: false,
        businessId: BUSINESS_ID,
        name: 'Café Central',
        permanentDeletionJobId: request.jobId,
        permanentDeletionJobStatus: 'failed',
        permanentDeletionPhase: 'finalize',
        permanentDeletionFailureCode: 'FINALIZATION_FAILED',
      }),
    ]);
    await expect(
      retryPermanentBusinessDeletion._handler(ctx, { jobId: request.jobId })
    ).resolves.toMatchObject({ status: 'running', phase: 'finalize' });
  });

  test('completed root-missing jobs are not unresolved listing entries', async () => {
    const ctx = buildCtx();
    const request = await requestDeletion(ctx);
    await ctx.db.patch(request.jobId, {
      status: 'completed',
      phase: 'completed',
      completedAt: Date.now(),
    });
    ctx.db.rows('businesses').splice(0);

    expect(await listMyBusinessesForPermanentDeletion._handler(ctx, {})).toEqual(
      []
    );
  });

  test('another user cannot see a requester synthetic entry after the business root is gone', async () => {
    const ctx = buildCtx();
    const request = await requestDeletion(ctx);
    await ctx.db.patch(request.jobId, {
      status: 'running',
      phase: 'finalize',
    });
    ctx.db.rows('businesses').splice(0);
    ctx.db.rows('users').push(baseOwner({ _id: 'user_other' }));
    const unauthorizedCtx = {
      ...ctx,
      auth: {
        getUserIdentity: async () => ({ subject: 'user_other|session' }),
      },
    };

    expect(
      await listMyBusinessesForPermanentDeletion._handler(unauthorizedCtx, {})
    ).toEqual([]);
  });

  test('an unfinished job with a surviving root uses one normal business entry', async () => {
    const ctx = buildCtx();
    const request = await requestDeletion(ctx);

    const result = await listMyBusinessesForPermanentDeletion._handler(ctx, {});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      businessExists: true,
      businessId: BUSINESS_ID,
      name: 'Café Central',
      permanentDeletionJobId: request.jobId,
      permanentDeletionJobStatus: 'queued',
    });
    expect(result[0]).toHaveProperty('billing');
  });

  test('job status is visible only to its original requester', async () => {
    const ctx = buildCtx();
    const request = await requestDeletion(ctx);
    expect(
      await getPermanentBusinessDeletionStatus._handler(ctx, {
        jobId: request.jobId,
      })
    ).toMatchObject({ jobId: request.jobId, status: 'queued' });

    const unauthorizedCtx = {
      ...ctx,
      auth: {
        getUserIdentity: async () => ({ subject: 'user_other|session' }),
      },
    };
    ctx.db.rows('users').push(baseOwner({ _id: 'user_other' }));
    await expect(
      getPermanentBusinessDeletionStatus._handler(unauthorizedCtx, {
        jobId: request.jobId,
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });
});

describe('bounded recipients and ephemeral push state', () => {
  test('captures at most 50 memberships per invocation and dedupes users', async () => {
    const memberships = Array.from({ length: 61 }, (_, index) => ({
      _id: `membership_${index}`,
      businessId: BUSINESS_ID,
      userId: `customer_${Math.floor(index / 2)}`,
      isActive: true,
    }));
    const ctx = buildCtx({ memberships });
    const request = await requestDeletion(ctx);
    await processBusinessDeletionBatchInternal._handler(ctx, {
      jobId: request.jobId,
    });

    expect(ctx.db.rows('businessDeletionJobs')[0].phase).toBe(
      'capture_customers'
    );
    expect(ctx.db.rows('businessDeletionRecipients')).toHaveLength(25);
    await processBusinessDeletionBatchInternal._handler(ctx, {
      jobId: request.jobId,
    });
    expect(ctx.db.rows('businessDeletionRecipients')).toHaveLength(31);
  });

  test('captures active non-owner staff once and excludes owners and inactive staff', async () => {
    const now = Date.now();
    const ctx = buildCtx({
      businessDeletionJobs: [
        {
          _id: 'job_staff',
          businessId: BUSINESS_ID,
          requestedByUserId: OWNER_ID,
          businessNameSnapshot: 'Café Central',
          status: 'running',
          phase: 'capture_staff',
          createdAt: now,
          updatedAt: now,
        },
      ],
      businessStaff: [
        baseOwnerStaff(),
        {
          _id: 'manager',
          businessId: BUSINESS_ID,
          userId: 'manager_user',
          staffRole: 'manager',
          status: 'active',
        },
        {
          _id: 'staff',
          businessId: BUSINESS_ID,
          userId: 'staff_user',
          staffRole: 'staff',
          status: 'active',
        },
        {
          _id: 'inactive',
          businessId: BUSINESS_ID,
          userId: 'inactive_user',
          staffRole: 'staff',
          status: 'suspended',
        },
      ],
    });

    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_staff' });
    expect(
      ctx.db.rows('businessDeletionRecipients').map((row) => row.userId).sort()
    ).toEqual(['manager_user', 'staff_user']);
  });

  test('clears target active-business references in bounded passes and preserves unrelated references', async () => {
    const now = Date.now();
    const users = Array.from({ length: 51 }, (_, index) => ({
      _id: `target_user_${index}`,
      activeBusinessId: BUSINESS_ID,
      activeMode: 'business',
    }));
    users.push({
      _id: 'unrelated_user',
      activeBusinessId: 'business_other',
      activeMode: 'business',
    });
    const ctx = buildCtx({
      users,
      businessDeletionJobs: [
        {
          _id: 'job_active_refs',
          businessId: BUSINESS_ID,
          requestedByUserId: OWNER_ID,
          businessNameSnapshot: 'Café Central',
          status: 'running',
          phase: 'clear_active_user_refs',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_active_refs' });
    expect(
      ctx.db
        .rows('users')
        .filter((row) => row.activeBusinessId === BUSINESS_ID)
    ).toHaveLength(1);
    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_active_refs' });
    expect(
      ctx.db
        .rows('users')
        .filter((row) => row.activeBusinessId === BUSINESS_ID)
    ).toHaveLength(0);
    expect(ctx.db.rows('users').find((row) => row._id === 'unrelated_user')).toMatchObject({
      activeBusinessId: 'business_other',
      activeMode: 'business',
    });
  });

  test('one claimed attempt creates no business log and stale claims no-op', async () => {
    const now = Date.now();
    const ctx = buildCtx({
      businessDeletionJobs: [
        {
          _id: 'job_push',
          businessId: BUSINESS_ID,
          requestedByUserId: OWNER_ID,
          businessNameSnapshot: 'Café Central',
          status: 'running',
          phase: 'schedule_notifications',
          createdAt: now,
          updatedAt: now,
        },
      ],
      businessDeletionRecipients: [
        {
          _id: 'recipient_push',
          jobId: 'job_push',
          userId: 'customer_1',
          audience: 'customer',
          pushStatus: 'scheduled',
          createdAt: now,
          updatedAt: now,
        },
      ],
      pushTokens: [
        {
          _id: 'token_1',
          userId: 'customer_1',
          token: 'ExponentPushToken[test]',
          isActive: true,
        },
        {
          _id: 'token_2',
          userId: 'customer_1',
          token: 'ExponentPushToken[test-2]',
          isActive: true,
        },
      ],
    });
    const claim = await claimPermanentDeletionPushAttemptInternal._handler(ctx, {
      recipientId: 'recipient_push',
    });
    expect(claim.claimed).toBe(true);
    expect(claim.tokens).toHaveLength(2);
    expect(
      (
        await claimPermanentDeletionPushAttemptInternal._handler(ctx, {
          recipientId: 'recipient_push',
        })
      ).claimed
    ).toBe(false);
    await finalizePermanentDeletionPushAttemptInternal._handler(ctx, {
      recipientId: 'recipient_push',
      status: 'failed',
      failureDetail: 'DeviceNotRegistered',
      deviceNotRegisteredTokenIds: ['token_1'],
    });
    expect(ctx.db.rows('pushTokens')[0].isActive).toBe(false);
    expect(ctx.db.rows('messageLog')).toHaveLength(0);
    expect(ctx.db.rows('pushDeliveryLog')).toHaveLength(0);
  });

  test('provider failure is terminal for the recipient and never creates persistent logs', async () => {
    const now = Date.now();
    const ctx = buildCtx({
      businessDeletionJobs: [
        {
          _id: 'job_push_failure',
          businessId: BUSINESS_ID,
          requestedByUserId: OWNER_ID,
          businessNameSnapshot: 'Café Central',
          status: 'running',
          phase: 'schedule_notifications',
          createdAt: now,
          updatedAt: now,
        },
      ],
      businessDeletionRecipients: [
        {
          _id: 'recipient_push_failure',
          jobId: 'job_push_failure',
          userId: 'customer_1',
          audience: 'customer',
          pushStatus: 'scheduled',
          createdAt: now,
          updatedAt: now,
        },
      ],
      pushTokens: [
        {
          _id: 'token_failure',
          userId: 'customer_1',
          token: 'ExponentPushToken[failure]',
          isActive: true,
        },
      ],
    });
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error('provider unavailable');
    };
    const actionCtx = {
      runMutation: async (_reference, args) => {
        if ('status' in args) {
          return await finalizePermanentDeletionPushAttemptInternal._handler(
            ctx,
            args
          );
        }
        return await claimPermanentDeletionPushAttemptInternal._handler(
          ctx,
          args
        );
      },
    };
    try {
      const result = await deliverPermanentDeletionPushInternal._handler(
        actionCtx,
        { recipientId: 'recipient_push_failure' }
      );
      expect(result.status).toBe('failed');
      expect(
        await deliverPermanentDeletionPushInternal._handler(actionCtx, {
          recipientId: 'recipient_push_failure',
        })
      ).toEqual({ status: 'stale_or_skipped' });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(fetchCalls).toBe(1);
    expect(
      ctx.db.rows('businessDeletionRecipients')[0].pushStatus
    ).toBe('failed');
    expect(ctx.db.rows('messageLog')).toHaveLength(0);
    expect(ctx.db.rows('pushDeliveryLog')).toHaveLength(0);
    await processBusinessDeletionBatchInternal._handler(ctx, {
      jobId: 'job_push_failure',
    });
    expect(ctx.db.rows('businessDeletionJobs')[0].phase).toBe(
      'clear_active_user_refs'
    );
  });
});

describe('B2B and audit safety', () => {
  test('deleting a referrer removes only its referral graph and does not change the surviving referred business', async () => {
    const now = Date.now();
    const survivor = baseBusiness({
      _id: 'business_survivor',
      ownerUserId: 'survivor_owner',
      b2bCreditMonthsEarned: 3,
      subscriptionEndAt: now + 500000,
    });
    const ctx = buildCtx({
      businesses: [baseBusiness(), survivor],
      businessDeletionJobs: [
        {
          _id: 'job_referrer',
          businessId: BUSINESS_ID,
          requestedByUserId: OWNER_ID,
          businessNameSnapshot: 'Café Central',
          status: 'running',
          phase: 'reconcile_b2b',
          createdAt: now,
          updatedAt: now,
        },
      ],
      businessReferralLinks: [
        { _id: 'b2b_link', referrerBusinessId: BUSINESS_ID },
      ],
      businessReferrals: [
        {
          _id: 'b2b_referral',
          businessReferralLinkId: 'b2b_link',
          referrerBusinessId: BUSINESS_ID,
          referredBusinessId: 'business_survivor',
          status: 'credited',
          creditMonths: 1,
        },
      ],
    });

    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_referrer' });
    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_referrer' });
    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_referrer' });
    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_referrer' });
    expect(ctx.db.rows('businessReferrals')).toHaveLength(0);
    expect(ctx.db.rows('businessReferralLinks')).toHaveLength(0);
    expect(ctx.db.rows('businesses').find((row) => row._id === 'business_survivor')).toMatchObject({
      b2bCreditMonthsEarned: 3,
      subscriptionEndAt: now + 500000,
    });
  });

  test('preserves credited surviving value and skips pending deleted-side rows', async () => {
    const now = Date.now();
    const ctx = buildCtx({
      businessDeletionJobs: [
        {
          _id: 'job_b2b',
          businessId: BUSINESS_ID,
          requestedByUserId: OWNER_ID,
          businessNameSnapshot: 'Café Central',
          status: 'running',
          phase: 'reconcile_b2b',
          progress: { step: 'referred_rows' },
          createdAt: now,
          updatedAt: now,
        },
      ],
      businessReferrals: [
        {
          _id: 'credited',
          referrerBusinessId: 'business_survivor',
          referredBusinessId: BUSINESS_ID,
          status: 'credited',
          creditMonths: 2,
          creditAppliedAt: now - 100,
        },
        {
          _id: 'pending',
          referrerBusinessId: 'business_survivor',
          referredBusinessId: BUSINESS_ID,
          status: 'waiting_30_days',
          creditMonths: 1,
        },
      ],
      businesses: [
        baseBusiness(),
        baseBusiness({
          _id: 'business_survivor',
          ownerUserId: 'survivor_owner',
          b2bCreditMonthsEarned: 4,
          subscriptionEndAt: now + 100000,
        }),
      ],
    });
    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_b2b' });
    expect(ctx.db.rows('businessReferrals')[0]).toMatchObject({
      status: 'credited',
      creditMonths: 2,
      creditAppliedAt: now - 100,
    });
    expect(ctx.db.rows('businessReferrals')[0].referredBusinessId).toBeUndefined();
    expect(ctx.db.rows('businessReferrals')[1]).toMatchObject({
      status: 'skipped',
      skipReason: 'referred_business_deleted',
    });
    expect(ctx.db.rows('businesses')[1]).toMatchObject({
      b2bCreditMonthsEarned: 4,
      subscriptionEndAt: now + 100000,
    });
    const deletedAt = ctx.db.rows('businessReferrals')[0].referredBusinessDeletedAt;
    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_b2b' });
    expect(ctx.db.rows('businessReferrals')[0]).toMatchObject({
      status: 'credited',
      creditMonths: 2,
      referredBusinessDeletedAt: deletedAt,
    });
  });

  test('redacts audit skeletons once and purges only expired redacted rows', async () => {
    const now = Date.now();
    const ctx = buildCtx({
      businessDeletionJobs: [
        {
          _id: 'job_audit',
          businessId: BUSINESS_ID,
          requestedByUserId: OWNER_ID,
          businessNameSnapshot: 'Café Central',
          status: 'running',
          phase: 'redact_audit',
          createdAt: now,
          updatedAt: now,
        },
      ],
      referralAdminAuditLog: [
        {
          _id: 'audit_referral',
          businessId: BUSINESS_ID,
          targetId: 'private_target',
          reasonNote: 'private note',
          reasonCode: 'manual',
          beforeSnapshot: { private: true },
        },
      ],
      revenueCatWebhookEvents: [
        {
          _id: 'audit_rc',
          eventId: 'event_keep',
          eventType: 'RENEWAL',
          appUserId: `business:${BUSINESS_ID}`,
          businessId: BUSINESS_ID,
          status: 'processed',
          rawEvent: { private: true },
        },
        {
          _id: 'audit_non_redacted',
          eventId: 'event_other',
          purgeAfter: now - 1,
          status: 'processed',
        },
      ],
    });
    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_audit' });
    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_audit' });
    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_audit' });
    const referral = ctx.db.rows('referralAdminAuditLog')[0];
    const revenue = ctx.db.rows('revenueCatWebhookEvents')[0];
    expect(referral).toMatchObject({
      targetId: 'redacted',
      reasonNote: '[redacted]',
    });
    expect(referral.businessId).toBeUndefined();
    expect(revenue).toMatchObject({
      eventId: 'event_keep',
      appUserId: 'redacted',
      rawEvent: { redacted: true },
    });
    const originalPurgeAfter = revenue.purgeAfter;
    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_audit' });
    expect(revenue.purgeAfter).toBe(originalPurgeAfter);

    referral.purgeAfter = now - 1;
    revenue.purgeAfter = now - 1;
    await purgePermanentDeletionRetentionInternal._handler(ctx, {});
    expect(ctx.db.rows('referralAdminAuditLog')).toHaveLength(0);
    expect(ctx.db.rows('revenueCatWebhookEvents').map((row) => row._id)).toEqual([
      'audit_non_redacted',
    ]);
  });
});

describe('graph purge, assets, finalization, and retry', () => {
  test('deletes at most 50 high-volume history rows per worker invocation', async () => {
    const now = Date.now();
    const ctx = buildCtx({
      events: Array.from({ length: 61 }, (_, index) => ({
        _id: `event_${index}`,
        businessId: BUSINESS_ID,
      })),
      businessDeletionJobs: [
        {
          _id: 'job_history_batch',
          businessId: BUSINESS_ID,
          requestedByUserId: OWNER_ID,
          businessNameSnapshot: 'Café Central',
          status: 'running',
          phase: 'purge_scans_events',
          progress: { step: 'events' },
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_history_batch' });
    expect(ctx.db.rows('events')).toHaveLength(11);
    expect(ctx.db.rows('businessDeletionJobs')[0].phase).toBe('purge_scans_events');
    await processBusinessDeletionBatchInternal._handler(ctx, { jobId: 'job_history_batch' });
    expect(ctx.db.rows('events')).toHaveLength(0);
  });

  test('deletes the business graph, preserves global/shared data, and deletes root last', async () => {
    const now = Date.now();
    const direct = { businessId: BUSINESS_ID };
    const ctx = buildCtx({
      storageIds: ['asset_unique', 'asset_shared'],
      users: [
        baseOwner(),
        { _id: 'customer_1', isActive: true },
        { _id: 'staff_user', isActive: true },
      ],
      businessStaff: [
        baseOwnerStaff(),
        {
          _id: 'staff_relation',
          businessId: BUSINESS_ID,
          userId: 'staff_user',
          staffRole: 'staff',
          status: 'suspended',
        },
      ],
      memberships: [
        { _id: 'membership_1', ...direct, userId: 'customer_1', isActive: false },
      ],
      referralConfigs: [{ _id: 'referral_config_1', ...direct }],
      customerReferralLinks: [{ _id: 'customer_link_1', ...direct }],
      customerReferrals: [{ _id: 'customer_referral_1', ...direct }],
      referralRewards: [{ _id: 'customer_reward_1', ...direct }],
      loyaltyPrograms: [
        { _id: 'program_unique', ...direct, imageStorageId: 'asset_unique' },
        { _id: 'program_shared_target', ...direct, imageStorageId: 'asset_shared' },
        {
          _id: 'program_shared_survivor',
          businessId: 'business_other',
          imageStorageId: 'asset_shared',
        },
      ],
      events: [{ _id: 'event_1', ...direct }],
      scanSessions: [{ _id: 'scan_1', ...direct }],
      scanTokenEvents: [{ _id: 'token_event_1', ...direct }],
      campaigns: [{ _id: 'campaign_1', ...direct }],
      campaignRuns: [{ _id: 'run_1', ...direct }],
      messageLog: [{ _id: 'message_1', ...direct }],
      pushDeliveryLog: [{ _id: 'push_log_1', ...direct }],
      aiUsageLedger: [{ _id: 'usage_1', ...direct }],
      aiBusinessSnapshots: [{ _id: 'snapshot_1', ...direct }],
      aiRecommendations: [{ _id: 'recommendation_1', ...direct }],
      recommendationInteractions: [{ _id: 'interaction_1', ...direct }],
      recommendationGuideSessions: [{ _id: 'guide_1', ...direct }],
      aiGenerationCache: [
        { _id: 'owned_cache', ...direct },
        { _id: 'shared_cache' },
      ],
      staffEvents: [{ _id: 'staff_event_1', ...direct }],
      staffInvites: [{ _id: 'invite_1', ...direct }],
      apiClients: [{ _id: 'client_1', ...direct }],
      apiKeys: [{ _id: 'key_1', clientId: 'client_1' }],
      businessOnboardingDrafts: [
        { _id: 'draft_1', ...direct, programImageStorageId: 'asset_unique' },
      ],
      subscriptions: [{ _id: 'subscription_1', ...direct, provider: 'manual' }],
      supportRequests: [{ _id: 'support_1', userId: OWNER_ID }],
      pushTokens: [{ _id: 'global_token', userId: OWNER_ID, isActive: true }],
      authAccounts: [{ _id: 'auth_account', userId: OWNER_ID }],
      authSessions: [{ _id: 'auth_session', userId: OWNER_ID }],
      businesses: [
        baseBusiness(),
        baseBusiness({ _id: 'business_other', ownerUserId: 'other_owner' }),
      ],
    });
    const request = await requestDeletion(ctx);
    await processUntil(ctx, (job) => job?.status === 'completed');

    expect(ctx.db.rows('businesses').map((row) => row._id)).toEqual([
      'business_other',
    ]);
    expect(ctx.db.rows('users').map((row) => row._id)).toEqual(
      expect.arrayContaining([OWNER_ID, 'customer_1', 'staff_user'])
    );
    expect(ctx.db.rows('pushTokens')).toHaveLength(1);
    expect(ctx.db.rows('authAccounts')).toHaveLength(1);
    expect(ctx.db.rows('authSessions')).toHaveLength(1);
    expect(ctx.db.rows('supportRequests')).toHaveLength(1);
    expect(ctx.db.rows('apiClients')).toHaveLength(0);
    expect(ctx.db.rows('apiKeys')).toHaveLength(0);
    expect(ctx.db.rows('memberships')).toHaveLength(0);
    expect(ctx.db.rows('businessStaff')).toHaveLength(0);
    expect(ctx.db.rows('aiGenerationCache').map((row) => row._id)).toEqual([
      'shared_cache',
    ]);
    expect(ctx.deletedStorage).toEqual(['asset_unique']);
    expect(ctx.db.rows('loyaltyPrograms').map((row) => row._id)).toEqual([
      'program_shared_survivor',
    ]);
    const rootDeleteIndex = ctx.db.deletionOrder.findIndex(
      (entry) => entry.table === 'businesses' && entry.id === BUSINESS_ID
    );
    expect(rootDeleteIndex).toBeGreaterThan(0);
    expect(
      ctx.db.deletionOrder.slice(rootDeleteIndex + 1).every((entry) =>
        ['businessDeletionRecipients', 'businessDeletionAssets'].includes(
          entry.table
        )
      )
    ).toBe(true);
    expect(ctx.db.rows('businessDeletionJobs')[0]).toMatchObject({
      _id: request.jobId,
      status: 'completed',
      phase: 'completed',
    });
  });

  test('failed jobs keep the root and retry without requiring deleted staff', async () => {
    const ctx = buildCtx({
      businessDeletionJobs: [
        {
          _id: 'job_retry',
          businessId: BUSINESS_ID,
          requestedByUserId: OWNER_ID,
          businessNameSnapshot: 'Café Central',
          status: 'running',
          phase: 'purge_memberships',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      businessStaff: [],
    });
    await markBusinessDeletionFailedInternal._handler(ctx, {
      jobId: 'job_retry',
      failureCode: 'INJECTED',
      failureDetail: 'injected',
    });
    expect(ctx.db.rows('businesses')).toHaveLength(1);
    expect(ctx.db.rows('businesses')[0].isActive).toBe(false);
    expect(
      (await retryPermanentBusinessDeletion._handler(ctx, {
        jobId: 'job_retry',
      })).status
    ).toBe('running');
    expect(ctx.db.rows('businessDeletionJobs')[0].phase).toBe(
      'purge_memberships'
    );
  });

  test('failed and completed stale workers no-op, and another user cannot retry', async () => {
    const now = Date.now();
    const ctx = buildCtx({
      users: [baseOwner(), baseOwner({ _id: 'user_other' })],
      businessDeletionJobs: [
        {
          _id: 'job_stale',
          businessId: BUSINESS_ID,
          requestedByUserId: OWNER_ID,
          businessNameSnapshot: 'Café Central',
          status: 'failed',
          phase: 'purge_memberships',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    expect(
      await processBusinessDeletionBatchInternal._handler(ctx, {
        jobId: 'job_stale',
      })
    ).toEqual({ status: 'stale' });

    const unauthorizedCtx = {
      ...ctx,
      auth: {
        getUserIdentity: async () => ({ subject: 'user_other|session' }),
      },
    };
    await expect(
      retryPermanentBusinessDeletion._handler(unauthorizedCtx, {
        jobId: 'job_stale',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');

    ctx.db.rows('businessDeletionJobs')[0].status = 'completed';
    expect(
      await processBusinessDeletionBatchInternal._handler(ctx, {
        jobId: 'job_stale',
      })
    ).toEqual({ status: 'stale' });
  });

  test('completed receipt retention cleanup is bounded and preserves incomplete jobs', async () => {
    const now = Date.now();
    const expiredJobs = Array.from({ length: 51 }, (_, index) => ({
      _id: `completed_${index}`,
      businessId: BUSINESS_ID,
      requestedByUserId: OWNER_ID,
      businessNameSnapshot: 'redacted',
      status: 'completed',
      phase: 'completed',
      completedAt: now - 8 * 24 * 60 * 60 * 1000,
      createdAt: now - 9 * 24 * 60 * 60 * 1000,
      updatedAt: now,
    }));
    const ctx = buildCtx({
      businessDeletionJobs: [
        ...expiredJobs,
        {
          _id: 'incomplete_job',
          businessId: BUSINESS_ID,
          requestedByUserId: OWNER_ID,
          businessNameSnapshot: 'Café Central',
          status: 'failed',
          phase: 'purge_memberships',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const first = await purgePermanentDeletionRetentionInternal._handler(ctx, {});
    expect(first.completedJobsDeleted).toBe(50);
    expect(ctx.db.rows('businessDeletionJobs')).toHaveLength(2);
    await purgePermanentDeletionRetentionInternal._handler(ctx, {});
    expect(ctx.db.rows('businessDeletionJobs').map((row) => row._id)).toEqual([
      'incomplete_job',
    ]);
  });
});
