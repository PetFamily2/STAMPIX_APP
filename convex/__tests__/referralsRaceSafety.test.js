import { describe, expect, test } from 'bun:test';

import {
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
        conditions.push({ field, value });
        return q;
      },
    };
    builder(q);
    this.predicates.push((doc) =>
      conditions.every((condition) => doc[condition.field] === condition.value)
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

  async collect() {
    return this.docs();
  }
}

class FakeDb {
  constructor(tables) {
    this.tables = tables;
    this.counter = 0;
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

function buildCtx(tables) {
  return {
    db: new FakeDb(tables),
    auth: {
      getUserIdentity: async () => ({ subject: 'test_user' }),
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
        email: 'referrer@stampix.test',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: 'u_referred',
        isActive: true,
        fullName: 'Referred',
        email: 'referred@stampix.test',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: 'u_owner',
        isActive: true,
        fullName: 'Owner',
        email: 'owner@stampix.test',
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
