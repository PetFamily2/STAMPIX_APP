import { describe, expect, test } from 'bun:test';

import {
  adminGetReferralRecord,
  adminListReferralAuditLog,
  adminListReferralAuditLogPage,
  adminSearchReferralRecords,
  adminSearchReferralRecordsPage,
  expireReferralLinksInternal,
  expireReferralRewardsInternal,
  getBusinessReferralCreditSummary,
  getBusinessReferralPerformance,
  getOrCreateBusinessReferralLink,
  listBusinessReferralCustomers,
  listMyCustomerReferrals,
  processDueBusinessReferralCreditsInternal,
  processReferralAfterJoin,
  qualifyCustomerReferralAfterStamp,
} from '../referrals';

class FakeQuery {
  constructor(db, tableName) {
    this.db = db;
    this.tableName = tableName;
    this.predicates = [];
  }

  withIndex(_indexName, builder) {
    const conditions = [];
    const q = {
      eq: (field, value) => {
        conditions.push({ field, value, op: 'eq' });
        return q;
      },
      lte: (field, value) => {
        conditions.push({ field, value, op: 'lte' });
        return q;
      },
      gte: (field, value) => {
        conditions.push({ field, value, op: 'gte' });
        return q;
      },
    };
    if (builder) {
      builder(q);
    }
    this.db.indexCalls.push({
      table: this.tableName,
      index: _indexName,
      conditions: conditions.map(({ op, ...c }) =>
        op === 'eq' ? c : { ...c, op }
      ),
    });
    this.predicates.push((doc) =>
      conditions.every((condition) =>
        condition.op === 'lte'
          ? doc[condition.field] <= condition.value
          : condition.op === 'gte'
            ? doc[condition.field] >= condition.value
            : doc[condition.field] === condition.value
      )
    );
    return this;
  }

  filter(builder) {
    const buildPredicate = (expression) => {
      if (
        expression?.op === 'eq' &&
        expression.left &&
        typeof expression.left.__field === 'string'
      ) {
        return (doc) => doc[expression.left.__field] === expression.right;
      }
      if (expression?.op === 'and' && Array.isArray(expression.conditions)) {
        const predicates = expression.conditions
          .map((condition) => buildPredicate(condition))
          .filter(Boolean);
        return (doc) => predicates.every((predicate) => predicate(doc));
      }
      return null;
    };

    const q = {
      field: (fieldName) => ({ __field: fieldName }),
      eq: (left, right) => ({ op: 'eq', left, right }),
      and: (...conditions) => ({ op: 'and', conditions }),
    };
    const expression = builder(q);
    const predicate = buildPredicate(expression);
    if (predicate) {
      this.predicates.push(predicate);
    }
    return this;
  }

  docs() {
    const docs = this.db.rows(this.tableName);
    return docs.filter((doc) =>
      this.predicates.every((predicate) => predicate(doc))
    );
  }

  async first() {
    return this.docs()[0] ?? null;
  }

  order(direction) {
    this.desc = direction === 'desc';
    return this;
  }

  async paginate({ cursor, numItems }) {
    const all = this.desc
      ? [...this.db.rows(this.tableName)].sort(
          (a, b) => b.createdAt - a.createdAt
        )
      : this.db.rows(this.tableName);
    const start = cursor ? all.findIndex((row) => row._id === cursor) + 1 : 0;
    const page = [];
    let index = start;
    while (index < all.length && page.length < numItems) {
      const row = all[index++];
      if (this.predicates.every((predicate) => predicate(row))) {
        page.push(row);
      }
    }
    const isDone = !all
      .slice(index)
      .some((row) => this.predicates.every((predicate) => predicate(row)));
    return { page, continueCursor: index ? all[index - 1]._id : '', isDone };
  }

  async collect() {
    this.db.collectCalls.push(this.tableName);
    return this.docs();
  }

  async take(limit) {
    const rows = this.docs();
    return (
      this.desc ? [...rows].sort((a, b) => b.createdAt - a.createdAt) : rows
    ).slice(0, limit);
  }
}

class FakeDb {
  constructor(tables) {
    this.tables = tables;
    this.counter = 0;
    this.getCalls = [];
    this.indexCalls = [];
    this.collectCalls = [];
  }

  query(tableName) {
    return new FakeQuery(this, tableName);
  }

  rows(tableName) {
    if (!this.tables[tableName]) {
      this.tables[tableName] = [];
    }
    return this.tables[tableName];
  }

  async get(id) {
    this.getCalls.push(id);
    for (const tableName of Object.keys(this.tables)) {
      const row = this.rows(tableName).find((doc) => doc._id === id);
      if (row) {
        return row;
      }
    }
    return null;
  }

  async insert(tableName, value) {
    const row = { ...value };
    if (!row._id) {
      this.counter += 1;
      row._id = `${tableName}_${this.counter}`;
    }
    this.rows(tableName).push(row);
    return row._id;
  }

  async patch(id, patch) {
    for (const tableName of Object.keys(this.tables)) {
      const rows = this.rows(tableName);
      const index = rows.findIndex((doc) => doc._id === id);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...patch };
        return;
      }
    }
    throw new Error(`PATCH_TARGET_NOT_FOUND:${id}`);
  }
}

function buildCtx(tables, currentUserId = 'u_owner') {
  return {
    db: new FakeDb(tables),
    auth: {
      getUserIdentity: async () => ({ subject: `${currentUserId}|session` }),
    },
  };
}

function baseTables() {
  const now = Date.now();
  return {
    users: [
      {
        _id: 'u_referrer',
        isActive: true,
        fullName: 'Referrer',
        email: 'referrer@stampaix.test',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: 'u_referred',
        isActive: true,
        fullName: 'Referred',
        email: 'referred@stampaix.test',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: 'u_owner',
        isActive: true,
        fullName: 'Owner',
        email: 'owner@stampaix.test',
        createdAt: now,
        updatedAt: now,
      },
    ],
    businesses: [
      {
        _id: 'biz_1',
        ownerUserId: 'u_owner',
        externalId: 'biz_ext_1',
        name: 'Biz',
        isActive: true,
        subscriptionPlan: 'pro',
        subscriptionStatus: 'active',
        billingPeriod: 'monthly',
        createdAt: now,
        updatedAt: now,
      },
    ],
    businessStaff: [
      {
        _id: 'staff_owner_1',
        businessId: 'biz_1',
        userId: 'u_owner',
        staffRole: 'owner',
        status: 'active',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    loyaltyPrograms: [
      {
        _id: 'prog_1',
        businessId: 'biz_1',
        title: 'Coffee Card',
        rewardName: 'Free coffee',
        maxStamps: 10,
        stampIcon: '*',
        status: 'active',
        isArchived: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    referralConfigs: [
      {
        _id: 'cfg_1',
        businessId: 'biz_1',
        isEnabled: true,
        configVersion: 1,
        rewardType: 'STAMP',
        rewardValue: 1,
        rewardRecipients: 'referred',
        monthlyLimit: 10,
        createdByUserId: 'u_owner',
        updatedByUserId: 'u_owner',
        createdAt: now,
        updatedAt: now,
      },
    ],
    customerReferralLinks: [
      {
        _id: 'link_1',
        code: 'REFSAFE1',
        businessId: 'biz_1',
        referrerUserId: 'u_referrer',
        originProgramId: 'prog_1',
        membershipId: 'm_referred',
        shareSurface: 'card_screen',
        status: 'active',
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
        openCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    memberships: [
      {
        _id: 'm_referred',
        userId: 'u_referred',
        businessId: 'biz_1',
        programId: 'prog_1',
        currentStamps: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    customerReferrals: [],
    businessReferrals: [],
    referralRewards: [],
    events: [],
    messageLog: [],
    pushTokens: [],
    pushDeliveryLog: [],
  };
}

describe('referral race safety', () => {
  test('duplicate customer referrals are prevented on practical retry path', async () => {
    const tables = baseTables();
    const ctx = buildCtx(tables);

    const args = {
      businessId: 'biz_1',
      referredUserId: 'u_referred',
      referralCode: 'REFSAFE1',
      joinedMembershipIds: ['m_referred'],
      joinedProgramStatuses: ['created'],
      hadAnyBusinessMembershipBeforeJoin: false,
    };

    const first = await processReferralAfterJoin(ctx, args);
    const second = await processReferralAfterJoin(ctx, args);

    const rows = ctx.db.rows('customerReferrals');
    expect(rows).toHaveLength(1);
    expect(first.ok).toBe(true);
    expect(second.skipped).toBe('first_referral_wins');
  });

  test('duplicate referral rewards are not created for same referral + recipient', async () => {
    const now = Date.now();
    const tables = baseTables();
    const ctx = buildCtx(tables);

    const created = await processReferralAfterJoin(ctx, {
      businessId: 'biz_1',
      referredUserId: 'u_referred',
      referralCode: 'REFSAFE1',
      joinedMembershipIds: ['m_referred'],
      joinedProgramStatuses: ['created'],
      hadAnyBusinessMembershipBeforeJoin: false,
    });
    expect(created.ok).toBe(true);

    await ctx.db.insert('events', {
      _id: 'evt_stamp_1',
      type: 'STAMP_ADDED',
      businessId: 'biz_1',
      programId: 'prog_1',
      membershipId: 'm_referred',
      actorUserId: 'u_owner',
      customerUserId: 'u_referred',
      source: 'scanner_commit',
      createdAt: now,
    });

    const first = await qualifyCustomerReferralAfterStamp(ctx, {
      businessId: 'biz_1',
      referredUserId: 'u_referred',
      stampEventId: 'evt_stamp_1',
      stampCreatedAt: now,
      stampProgramId: 'prog_1',
      stampMembershipId: 'm_referred',
      actorUserId: 'u_owner',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    const second = await qualifyCustomerReferralAfterStamp(ctx, {
      businessId: 'biz_1',
      referredUserId: 'u_referred',
      stampEventId: 'evt_stamp_1',
      stampCreatedAt: now,
      stampProgramId: 'prog_1',
      stampMembershipId: 'm_referred',
      actorUserId: 'u_owner',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });

    const referralRows = ctx.db.rows('customerReferrals');
    const rewardRows = ctx.db.rows('referralRewards');
    expect(referralRows).toHaveLength(1);
    expect(referralRows[0].status).toBe('completed');
    expect(rewardRows).toHaveLength(1);
    expect(first.reason).toBe('granted');
    expect(second.reason).toBe('no_pending_referral');
  });

  test('same referral cannot qualify twice', async () => {
    const now = Date.now();
    const tables = baseTables();
    const ctx = buildCtx(tables);

    const joinResult = await processReferralAfterJoin(ctx, {
      businessId: 'biz_1',
      referredUserId: 'u_referred',
      referralCode: 'REFSAFE1',
      joinedMembershipIds: ['m_referred'],
      joinedProgramStatuses: ['created'],
      hadAnyBusinessMembershipBeforeJoin: false,
    });
    expect(joinResult.ok).toBe(true);

    await ctx.db.insert('events', {
      _id: 'evt_stamp_first',
      type: 'STAMP_ADDED',
      businessId: 'biz_1',
      programId: 'prog_1',
      membershipId: 'm_referred',
      actorUserId: 'u_owner',
      customerUserId: 'u_referred',
      source: 'scanner_commit',
      createdAt: now,
    });
    await ctx.db.insert('events', {
      _id: 'evt_stamp_second',
      type: 'STAMP_ADDED',
      businessId: 'biz_1',
      programId: 'prog_1',
      membershipId: 'm_referred',
      actorUserId: 'u_owner',
      customerUserId: 'u_referred',
      source: 'scanner_commit',
      createdAt: now + 1000,
    });

    const first = await qualifyCustomerReferralAfterStamp(ctx, {
      businessId: 'biz_1',
      referredUserId: 'u_referred',
      stampEventId: 'evt_stamp_first',
      stampCreatedAt: now,
      stampProgramId: 'prog_1',
      stampMembershipId: 'm_referred',
      actorUserId: 'u_owner',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    const second = await qualifyCustomerReferralAfterStamp(ctx, {
      businessId: 'biz_1',
      referredUserId: 'u_referred',
      stampEventId: 'evt_stamp_second',
      stampCreatedAt: now + 1000,
      stampProgramId: 'prog_1',
      stampMembershipId: 'm_referred',
      actorUserId: 'u_owner',
      scannerRuntimeSessionId: 'runtime_2',
      deviceId: 'device_1',
    });

    const referral = ctx.db.rows('customerReferrals')[0];
    expect(first.rewardTriggered).toBe(true);
    expect(second.rewardTriggered).toBe(false);
    expect(second.reason).toBe('no_pending_referral');
    expect(referral.qualificationEventId).toBe('evt_stamp_first');
    expect(ctx.db.rows('referralRewards')).toHaveLength(1);
  });
});

describe('business referral deleted-business compatibility', () => {
  test('owner and manager can use referral APIs while staff remains blocked', async () => {
    const now = Date.now();
    const tables = baseTables();
    tables.users.push(
      {
        _id: 'u_manager',
        isActive: true,
        fullName: 'Manager',
        email: 'manager@stampaix.test',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: 'u_staff',
        isActive: true,
        fullName: 'Staff',
        email: 'staff@stampaix.test',
        createdAt: now,
        updatedAt: now,
      }
    );
    tables.businessStaff.push(
      {
        _id: 'staff_manager_1',
        businessId: 'biz_1',
        userId: 'u_manager',
        staffRole: 'manager',
        status: 'active',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: 'staff_staff_1',
        businessId: 'biz_1',
        userId: 'u_staff',
        staffRole: 'staff',
        status: 'active',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }
    );

    const ownerSummary = await getBusinessReferralCreditSummary._handler(
      buildCtx(tables, 'u_owner'),
      { businessId: 'biz_1' }
    );
    const managerSummary = await getBusinessReferralCreditSummary._handler(
      buildCtx(tables, 'u_manager'),
      { businessId: 'biz_1' }
    );
    const managerLink = await getOrCreateBusinessReferralLink._handler(
      buildCtx(tables, 'u_manager'),
      { businessId: 'biz_1' }
    );

    expect(ownerSummary.totalReferrals).toBe(0);
    expect(managerSummary.totalReferrals).toBe(0);
    expect(managerLink.url).toContain(managerLink.code);
    expect(tables.businessReferralCodes).toHaveLength(1);

    await expect(
      getBusinessReferralCreditSummary._handler(buildCtx(tables, 'u_staff'), {
        businessId: 'biz_1',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
    await expect(
      getOrCreateBusinessReferralLink._handler(buildCtx(tables, 'u_staff'), {
        businessId: 'biz_1',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  test('normal due referral still grants credit to the surviving referrer', async () => {
    const now = Date.now();
    const tables = baseTables();
    tables.businesses.push({
      ...tables.businesses[0],
      _id: 'biz_2',
      ownerUserId: 'u_referred',
      externalId: 'biz_ext_2',
      name: 'Referred Biz',
    });
    tables.businessReferrals.push({
      _id: 'b2b_due_valid',
      businessReferralLinkId: 'b2b_link_1',
      referrerBusinessId: 'biz_1',
      referredBusinessId: 'biz_2',
      status: 'waiting_30_days',
      qualificationDueAt: now - 1,
      creditMonths: 1,
      createdAt: now - 100,
      updatedAt: now - 100,
    });
    const ctx = buildCtx(tables);
    const scheduled = [];
    ctx.scheduler = {
      runAfter: async (delay, fn, args) => scheduled.push({ delay, fn, args }),
    };

    const result = await processDueBusinessReferralCreditsInternal._handler(
      ctx,
      {}
    );

    expect(result).toMatchObject({ credited: 1, skipped: 0 });
    expect(ctx.db.rows('businessReferrals')[0]).toMatchObject({
      status: 'credited',
      creditMonths: 1,
    });
    expect(ctx.db.rows('businesses')[0].b2bCreditMonthsEarned).toBe(1);
    expect(ctx.db.rows('smartManagerEvaluationStates')).toHaveLength(1);
    expect(ctx.db.rows('smartManagerEvaluationStates')[0]).toMatchObject({
      businessId: 'biz_1',
      dirtyDomains: ['entitlements'],
      dirtyReasons: ['business_referral_credit_applied'],
    });
    expect(scheduled).toHaveLength(1);
  });

  test('waiting referral without referred business is terminally skipped', async () => {
    const now = Date.now();
    const tables = baseTables();
    tables.businessReferrals.push({
      _id: 'b2b_due_deleted',
      businessReferralLinkId: 'b2b_link_2',
      referrerBusinessId: 'biz_1',
      referredBusinessId: undefined,
      referredBusinessDeletedAt: now - 10,
      status: 'waiting_30_days',
      qualificationDueAt: undefined,
      creditMonths: 1,
      createdAt: now - 100,
      updatedAt: now - 100,
    });
    const ctx = buildCtx(tables);

    const result = await processDueBusinessReferralCreditsInternal._handler(
      ctx,
      {}
    );

    expect(result).toMatchObject({ credited: 0, skipped: 1 });
    expect(ctx.db.getCalls).not.toContain(undefined);
    expect(ctx.db.rows('businessReferrals')[0]).toMatchObject({
      status: 'skipped',
      skipReason: 'referred_business_deleted',
      qualificationDueAt: undefined,
    });
    expect(ctx.db.rows('businesses')[0].b2bCreditMonthsEarned).toBeUndefined();
  });

  test('credited redacted row remains counted while pending redacted row is hidden', async () => {
    const now = Date.now();
    const tables = baseTables();
    tables.businessReferrals.push(
      {
        _id: 'b2b_credited_deleted',
        businessReferralLinkId: 'b2b_link_3',
        referrerBusinessId: 'biz_1',
        referredBusinessId: undefined,
        referredBusinessDeletedAt: now - 10,
        status: 'credited',
        creditMonths: 2,
        creditAppliedAt: now - 20,
        createdAt: now - 100,
        updatedAt: now - 20,
      },
      {
        _id: 'b2b_pending_deleted',
        businessReferralLinkId: 'b2b_link_4',
        referrerBusinessId: 'biz_1',
        referredBusinessId: undefined,
        referredBusinessDeletedAt: now - 10,
        status: 'pending_subscription',
        creditMonths: 0,
        createdAt: now - 100,
        updatedAt: now - 10,
      }
    );
    const ctx = buildCtx(tables);

    const summary = await getBusinessReferralCreditSummary._handler(ctx, {
      businessId: 'biz_1',
    });

    expect(summary).toMatchObject({
      creditedMonths: 0,
      pendingMonths: 0,
      pendingInvitesCount: 0,
      activeReferralsCount: 0,
    });
  });

  test('admin readers return an explicit deleted marker without fabricating an id', async () => {
    const now = Date.now();
    const tables = baseTables();
    tables.users = tables.users.map((user) =>
      user._id === 'u_owner' ? { ...user, isAdmin: true } : user
    );
    tables.businessReferrals.push({
      _id: 'b2b_admin_deleted',
      businessReferralLinkId: 'b2b_link_5',
      referrerBusinessId: 'biz_1',
      referredBusinessId: undefined,
      referredBusinessDeletedAt: now - 10,
      status: 'credited',
      creditMonths: 1,
      createdAt: now - 100,
      updatedAt: now - 10,
    });
    const ctx = buildCtx(tables);

    const searchRows = await adminSearchReferralRecordsPage._handler(ctx, {
      query: '',
      type: 'businessReferral',
      paginationOpts: { cursor: null, numItems: 10 },
    });
    const record = await adminGetReferralRecord._handler(ctx, {
      targetType: 'businessReferral',
      targetId: 'b2b_admin_deleted',
    });

    expect(searchRows.page[0].payload).toMatchObject({
      referredBusinessId: null,
      referredBusinessDeleted: true,
    });
    expect(record).toMatchObject({
      referredBusinessId: null,
      referredBusinessDeleted: true,
    });
    expect(ctx.db.getCalls).not.toContain(undefined);
  });
});

describe('referral lists tolerate deleted users', () => {
  test('legacy admin audit rejects clients after authorization', async () => {
    const tables = baseTables();
    tables.referralAdminAuditLog = [
      {
        _id: 'one',
        targetType: 'customerReferral',
        targetId: 'target',
        createdAt: 3,
      },
      {
        _id: 'two',
        targetType: 'customerReferral',
        targetId: 'other',
        createdAt: 4,
      },
      {
        _id: 'three',
        targetType: 'referralReward',
        targetId: 'target',
        createdAt: 5,
      },
      {
        _id: 'four',
        targetType: 'customerReferral',
        targetId: 'target',
        createdAt: 9,
      },
    ];
    const regular = buildCtx(tables);
    await expect(
      adminListReferralAuditLog._handler(regular, {
        targetType: 'customerReferral',
        targetId: 'target',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
    tables.users = tables.users.map((user) =>
      user._id === 'u_owner' ? { ...user, isAdmin: true } : user
    );
    const admin = buildCtx(tables);
    const rows = await adminListReferralAuditLog._handler(admin, {
      targetType: 'customerReferral',
      targetId: 'target',
      limit: 1,
    });
    expect(rows.map((row) => row._id)).toEqual(['four']);
    expect(admin.db.indexCalls).toContainEqual({
      table: 'referralAdminAuditLog',
      index: 'by_targetType_targetId_createdAt',
      conditions: [
        { field: 'targetType', value: 'customerReferral' },
        { field: 'targetId', value: 'target' },
      ],
    });
  });
  test('customer referral list suppresses a deleted referrer user', async () => {
    const tables = baseTables();
    tables.users = tables.users.map((user) =>
      user._id === 'u_referrer'
        ? { ...user, isActive: false, fullName: 'Stale Referrer' }
        : user
    );
    tables.customerReferrals.push({
      _id: 'referral_deleted_referrer',
      businessId: 'biz_1',
      referralLinkId: 'link_1',
      referrerUserId: 'u_referrer',
      referredUserId: 'u_referred',
      status: 'pending',
      rewardGrantStatus: 'not_applicable',
      createdAt: Date.now(),
    });
    const ctx = buildCtx(tables, 'u_referrer');

    const rows = await listMyCustomerReferrals._handler(ctx, {});

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      referrerName: null,
      referrerDeleted: true,
      referredName: 'Referred',
      referredDeleted: false,
    });
  });

  test('customer referral list does not fetch a redacted referred user', async () => {
    const tables = baseTables();
    tables.customerReferrals.push({
      _id: 'referral_deleted_referred',
      businessId: 'biz_1',
      referralLinkId: 'link_1',
      referrerUserId: 'u_referrer',
      referredUserId: undefined,
      status: 'pending',
      rewardGrantStatus: 'not_applicable',
      createdAt: Date.now(),
    });
    const ctx = buildCtx(tables, 'u_referrer');

    const rows = await listMyCustomerReferrals._handler(ctx, {});

    expect(rows).toHaveLength(1);
    expect(ctx.db.getCalls).not.toContain(undefined);
    expect(rows[0]).toMatchObject({
      referredUserId: null,
      referredName: null,
      referredDeleted: true,
    });
  });

  test('business referral list does not fetch a redacted referrer user', async () => {
    const tables = baseTables();
    tables.customerReferrals.push({
      _id: 'business_referral_deleted_referrer',
      businessId: 'biz_1',
      referralLinkId: 'link_1',
      referrerUserId: undefined,
      referredUserId: 'u_referred',
      status: 'pending',
      rewardGrantStatus: 'not_applicable',
      createdAt: Date.now(),
    });
    const ctx = buildCtx(tables, 'u_owner');

    const rows = await listBusinessReferralCustomers._handler(ctx, {
      businessId: 'biz_1',
    });

    expect(rows).toHaveLength(1);
    expect(ctx.db.getCalls).not.toContain(undefined);
    expect(rows[0]).toMatchObject({
      referrerUserId: null,
      referrerName: null,
      referrerDeleted: true,
      referredName: 'Referred',
    });
  });

  test('business referral list does not fetch a redacted referred user', async () => {
    const tables = baseTables();
    tables.customerReferrals.push({
      _id: 'business_referral_deleted_referred',
      businessId: 'biz_1',
      referralLinkId: 'link_1',
      referrerUserId: 'u_referrer',
      referredUserId: undefined,
      status: 'pending',
      rewardGrantStatus: 'not_applicable',
      createdAt: Date.now(),
    });
    const ctx = buildCtx(tables, 'u_owner');

    const rows = await listBusinessReferralCustomers._handler(ctx, {
      businessId: 'biz_1',
    });

    expect(rows).toHaveLength(1);
    expect(ctx.db.getCalls).not.toContain(undefined);
    expect(rows[0]).toMatchObject({
      referrerName: 'Referrer',
      referredUserId: null,
      referredName: null,
      referredDeleted: true,
    });
  });

  test('status-filtered referral list scopes both business and status in the index', async () => {
    const tables = baseTables();
    for (const [id, businessId, status] of [
      ['match', 'biz_1', 'pending'],
      ['other-status', 'biz_1', 'completed'],
      ['other-business', 'biz_2', 'pending'],
    ]) {
      tables.customerReferrals.push({
        _id: id,
        businessId,
        referralLinkId: 'link_1',
        referrerUserId: 'u_referrer',
        referredUserId: 'u_referred',
        status,
        rewardGrantStatus: 'not_applicable',
        createdAt: Date.now(),
      });
    }
    const ctx = buildCtx(tables, 'u_owner');
    const rows = await listBusinessReferralCustomers._handler(ctx, {
      businessId: 'biz_1',
      status: 'pending',
    });
    expect(rows.map((row) => row.referralId)).toEqual(['match']);
    expect(ctx.db.indexCalls).toContainEqual({
      table: 'customerReferrals',
      index: 'by_businessId_status_createdAt',
      conditions: [
        { field: 'businessId', value: 'biz_1' },
        { field: 'status', value: 'pending' },
      ],
    });
  });
});

test('paged admin search preserves sparse substring matches across all five record types', async () => {
  const tables = baseTables();
  tables.users = tables.users.map((u) =>
    u._id === 'u_owner' ? { ...u, isAdmin: true } : u
  );
  const pairs = [
    ['customerReferralLink', 'customerReferralLinks'],
    ['businessReferralLink', 'businessReferralLinks'],
    ['customerReferral', 'customerReferrals'],
    ['referralReward', 'referralRewards'],
    ['businessReferral', 'businessReferrals'],
  ];
  for (const [type, table] of pairs) {
    tables[table] = Array.from({ length: 9 }, (_, i) => ({
      _id: i === 8 ? 'late-match' : `row${i}`,
      code: 'code',
      businessId: 'biz_1',
      referrerBusinessId: 'biz_1',
      createdAt: 9 - i,
      updatedAt: 9 - i,
    }));
    const ctx = buildCtx(tables);
    let cursor = null,
      all = [],
      done = false,
      pages = 0;
    while (!done) {
      const result = await adminSearchReferralRecordsPage._handler(ctx, {
        query: 'MATCH',
        type,
        paginationOpts: { cursor, numItems: 2 },
      });
      expect(result.page.length).toBeLessThanOrEqual(2);
      all.push(...result.page);
      cursor = result.continueCursor;
      done = result.isDone;
      pages++;
    }
    expect(pages).toBe(5);
    expect(all.map((r) => r.targetId)).toEqual(['late-match']);
    await expect(
      adminSearchReferralRecords._handler(ctx, { query: 'match', type })
    ).rejects.toThrow('ADMIN_SEARCH_PAGINATION_REQUIRED');
  }
  await expect(
    adminSearchReferralRecordsPage._handler(buildCtx(baseTables()), {
      query: '',
      type: 'referralReward',
      paginationOpts: { cursor: null, numItems: 10 },
    })
  ).rejects.toThrow('NOT_AUTHORIZED');
});

test('expiry processes all overdue links in bounded idempotent batches', async () => {
  const tables = baseTables();
  const now = Date.now();
  tables.customerReferralLinks = Array.from({ length: 205 }, (_, i) => ({
    _id: `customer_${i}`,
    status: 'active',
    expiresAt: now - 100,
  }));
  tables.customerReferralLinks.push({
    _id: 'future',
    status: 'active',
    expiresAt: now + 1000000,
  });
  tables.businessReferralLinks = Array.from({ length: 101 }, (_, i) => ({
    _id: `business_${i}`,
    status: 'active',
    expiresAt: now - 100,
  }));
  const ctx = buildCtx(tables);
  let scheduled = 0;
  ctx.scheduler = {
    runAfter: async () => {
      scheduled++;
    },
  };
  const a = await expireReferralLinksInternal._handler(ctx, {});
  const b = await expireReferralLinksInternal._handler(ctx, {});
  const c = await expireReferralLinksInternal._handler(ctx, {});
  const d = await expireReferralLinksInternal._handler(ctx, {});
  expect([
    a.expiredCustomerLinks,
    b.expiredCustomerLinks,
    c.expiredCustomerLinks,
    d.expiredCustomerLinks,
  ]).toEqual([100, 100, 5, 0]);
  expect([
    a.expiredBusinessLinks,
    b.expiredBusinessLinks,
    c.expiredBusinessLinks,
  ]).toEqual([100, 1, 0]);
  expect(scheduled).toBe(2);
  expect(
    tables.customerReferralLinks.find((row) => row._id === 'future').status
  ).toBe('active');
});

test('reward expiry continues across nonexpiring and stamp rewards without skipping due benefits', async () => {
  const tables = baseTables(),
    now = Date.now();
  tables.referralRewards = Array.from({ length: 220 }, (_, i) => ({
    _id: `reward_${i}`,
    status: 'granted',
    actualRewardType: i % 2 ? 'STAMP' : 'BENEFIT',
    expiresAt: i % 3 === 0 ? undefined : now - 100,
  }));
  tables.referralRewards.push({
    _id: 'future_reward',
    status: 'granted',
    actualRewardType: 'BENEFIT',
    expiresAt: now + 100000,
  });
  const ctx = buildCtx(tables),
    tasks = [];
  ctx.scheduler = { runAfter: async (_delay, _name, args) => tasks.push(args) };
  await expireReferralRewardsInternal._handler(ctx, {});
  while (tasks.length) {
    await expireReferralRewardsInternal._handler(ctx, tasks.shift());
  }
  expect(
    tables.referralRewards.filter((r) => r.status === 'expired')
  ).toHaveLength(73);
  expect(
    tables.referralRewards.find((r) => r._id === 'future_reward').status
  ).toBe('granted');
  expect(
    tables.referralRewards.filter(
      (r) => r.actualRewardType === 'STAMP' && r.status !== 'granted'
    )
  ).toHaveLength(0);
  await expireReferralRewardsInternal._handler(ctx, {});
  expect(
    tables.referralRewards.filter((r) => r.status === 'expired')
  ).toHaveLength(73);
});

test('credit sweep continues across batches and does not credit the same referral twice', async () => {
  const tables = baseTables(),
    now = Date.now();
  tables.businesses.push({ ...tables.businesses[0], _id: 'biz_2' });
  tables.businessReferrals = Array.from({ length: 205 }, (_, i) => ({
    _id: `deleted_${i}`,
    status: 'waiting_30_days',
    referrerBusinessId: 'biz_1',
    qualificationDueAt: undefined,
    creditMonths: 1,
  }));
  tables.businessReferrals.push({
    _id: 'due',
    status: 'waiting_30_days',
    referrerBusinessId: 'biz_1',
    referredBusinessId: 'biz_2',
    qualificationDueAt: now - 1,
    creditMonths: 1,
  });
  tables.businessReferrals.push({
    _id: 'future',
    status: 'waiting_30_days',
    referrerBusinessId: 'biz_1',
    referredBusinessId: 'biz_2',
    qualificationDueAt: now + 100000,
    creditMonths: 1,
  });
  const ctx = buildCtx(tables),
    tasks = [];
  ctx.scheduler = {
    runAfter: async (_delay, _name, args) => {
      if (args.cursor) {
        tasks.push(args);
      }
    },
  };
  await processDueBusinessReferralCreditsInternal._handler(ctx, {});
  while (tasks.length) {
    await processDueBusinessReferralCreditsInternal._handler(
      ctx,
      tasks.shift()
    );
  }
  expect(
    tables.businessReferrals.filter((r) => r.status === 'skipped')
  ).toHaveLength(205);
  expect(tables.businessReferrals.find((r) => r._id === 'due').status).toBe(
    'credited'
  );
  expect(tables.businessReferrals.find((r) => r._id === 'future').status).toBe(
    'waiting_30_days'
  );
  expect(tables.businesses[0].b2bCreditMonthsEarned).toBe(1);
  await processDueBusinessReferralCreditsInternal._handler(ctx, {});
  expect(tables.businesses[0].b2bCreditMonthsEarned).toBe(1);
});

test('paged audit keeps admin authorization, chronological order and sparse matches', async () => {
  const tables = baseTables();
  tables.referralAdminAuditLog = Array.from({ length: 205 }, (_, i) => ({
    _id: `audit_${i}`,
    createdAt: i,
    targetId: i % 100 === 0 ? 'wanted' : 'other',
    targetType: 'referralReward',
  }));
  await expect(
    adminListReferralAuditLogPage._handler(buildCtx(tables), {
      targetId: 'wanted',
      paginationOpts: { cursor: null, numItems: 10 },
    })
  ).rejects.toThrow('NOT_AUTHORIZED');
  tables.users = tables.users.map((u) =>
    u._id === 'u_owner' ? { ...u, isAdmin: true } : u
  );
  const ctx = buildCtx(tables);
  let cursor = null,
    done = false,
    rows = [];
  while (!done) {
    const page = await adminListReferralAuditLogPage._handler(ctx, {
      targetId: 'wanted',
      paginationOpts: { cursor, numItems: 10 },
    });
    rows.push(...page.page);
    cursor = page.continueCursor;
    done = page.isDone;
  }
  expect(rows.map((r) => r.createdAt)).toEqual([200, 100, 0]);
  await expect(
    adminListReferralAuditLog._handler(ctx, { targetId: 'wanted' })
  ).rejects.toThrow('ADMIN_AUDIT_PAGINATION_REQUIRED');
});

test('referral performance bounds historical link reads to requested date', async () => {
  const tables = baseTables();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  tables.customerReferralLinks = Array.from({ length: 1000 }, (_, i) => ({
    _id: `old_${i}`,
    businessId: 'biz_1',
    createdAt: now - 110 * day,
  }));
  tables.customerReferralLinks.push(
    { _id: 'recent_1', businessId: 'biz_1', createdAt: now - 2 * day },
    { _id: 'recent_2', businessId: 'biz_1', createdAt: now - 1 * day },
    { _id: 'other_business', businessId: 'biz_2', createdAt: now - day }
  );
  const ctx = buildCtx(tables);
  const result = await getBusinessReferralPerformance._handler(ctx, {
    businessId: 'biz_1',
    range: '30d',
  });
  expect(result.referralsGenerated).toBe(2);
  const query = ctx.db.indexCalls.find(
    (call) =>
      call.table === 'customerReferralLinks' &&
      call.index === 'by_businessId_createdAt'
  );
  expect(query?.conditions[0]).toEqual({ field: 'businessId', value: 'biz_1' });
  expect(query?.conditions[1]).toMatchObject({
    field: 'createdAt',
    op: 'gte',
  });
  expect(query.conditions[1].value).toBeGreaterThan(now - 31 * day);
});

test('admin audit pages use target and timestamp indexes for scoped search', async () => {
  const tables = baseTables();
  const now = Date.now();
  tables.users = tables.users.map((u) =>
    u._id === 'u_owner' ? { ...u, isAdmin: true } : u
  );
  tables.referralAdminAuditLog = Array.from({ length: 90 }, (_, i) => ({
    _id: `unrelated_${i}`,
    targetType: 'customerReferral',
    targetId: 'unrelated',
    createdAt: now - 1000 + i,
  }));
  for (let i = 0; i < 7; i++) {
    tables.referralAdminAuditLog.push({
      _id: `target_${i}`,
      targetType: 'customerReferralLink',
      targetId: 'specific',
      createdAt: now + i,
    });
  }
  const ctx = buildCtx(tables);
  let cursor = null;
  const received = [];
  let done = false;
  while (!done) {
    const page = await adminListReferralAuditLogPage._handler(ctx, {
      targetType: 'customerReferralLink',
      targetId: 'specific',
      paginationOpts: { cursor, numItems: 3 },
    });
    received.push(...page.page);
    cursor = page.continueCursor;
    done = page.isDone;
  }
  expect(received.map((row) => row._id)).toEqual(
    Array.from({ length: 7 }, (_, i) => `target_${6 - i}`)
  );
  expect(ctx.db.indexCalls).toContainEqual({
    table: 'referralAdminAuditLog',
    index: 'by_targetType_targetId_createdAt',
    conditions: [
      { field: 'targetType', value: 'customerReferralLink' },
      { field: 'targetId', value: 'specific' },
    ],
  });
});

test('legacy admin audit API preserves complete top-N results with bounded index reads', async () => {
  const tables = baseTables();
  const now = Date.now();
  tables.users = tables.users.map((u) =>
    u._id === 'u_owner' ? { ...u, isAdmin: true } : u
  );
  tables.referralAdminAuditLog = Array.from({ length: 210 }, (_, i) => ({
    _id: `audit_${i}`,
    targetType: i % 2 ? 'referralReward' : 'customerReferral',
    targetId: i % 3 ? 'specific' : 'other',
    createdAt: now + i,
  }));
  for (const item of [
    { args: {}, index: 'by_createdAt' },
    {
      args: { targetType: 'referralReward' },
      index: 'by_targetType_createdAt',
    },
    { args: { targetId: 'specific' }, index: 'by_targetId_createdAt' },
    {
      args: { targetType: 'customerReferral', targetId: 'other' },
      index: 'by_targetType_targetId_createdAt',
    },
  ]) {
    const ctx = buildCtx(tables);
    const rows = await adminListReferralAuditLog._handler(ctx, {
      ...item.args,
      limit: 7,
    });
    const expected = tables.referralAdminAuditLog
      .filter(
        (row) =>
          !item.args.targetType || row.targetType === item.args.targetType
      )
      .filter(
        (row) => !item.args.targetId || row.targetId === item.args.targetId
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 7);
    expect(rows.map((row) => row._id)).toEqual(expected.map((row) => row._id));
    expect(ctx.db.collectCalls).not.toContain('referralAdminAuditLog');
    expect(ctx.db.indexCalls).toContainEqual(
      expect.objectContaining({
        table: 'referralAdminAuditLog',
        index: item.index,
      })
    );
  }
});
