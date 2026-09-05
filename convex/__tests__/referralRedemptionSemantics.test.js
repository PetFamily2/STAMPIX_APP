import { describe, expect, test } from 'bun:test';

import { redeemReferralBenefit } from '../referrals';

class FakeQuery {
  constructor(db, table, predicates = []) {
    this.db = db;
    this.table = table;
    this.predicates = predicates;
  }
  withIndex(_index, builder) {
    const predicates = [...this.predicates];
    const q = {
      eq: (field, value) => {
        predicates.push((row) => row[field] === value);
        return q;
      },
    };
    builder(q);
    return new FakeQuery(this.db, this.table, predicates);
  }
  filter(builder) {
    const q = {
      field: (field) => ({ field }),
      eq: (left, right) => ({ left, right }),
    };
    const expression = builder(q);
    return new FakeQuery(this.db, this.table, [
      ...this.predicates,
      (row) => row[expression.left.field] === expression.right,
    ]);
  }
  rows() {
    return this.db.rows(this.table).filter((row) =>
      this.predicates.every((predicate) => predicate(row))
    );
  }
  async first() {
    return this.rows()[0] ?? null;
  }
  async take(limit) {
    return this.rows().slice(0, limit);
  }
  async collect() {
    return this.rows();
  }
}

class FakeDb {
  constructor(tables) {
    this.tables = structuredClone(tables);
    this.nextId = 1;
  }
  rows(table) {
    if (!this.tables[table]) {
      this.tables[table] = [];
    }
    return this.tables[table];
  }
  query(table) {
    return new FakeQuery(this, table);
  }
  async get(id) {
    return Object.values(this.tables).flat().find((row) => row._id === id) ?? null;
  }
  async insert(table, value) {
    const row = { _id: `${table}_${this.nextId++}`, ...structuredClone(value) };
    this.rows(table).push(row);
    return row._id;
  }
  async patch(id, patch) {
    for (const rows of Object.values(this.tables)) {
      const index = rows.findIndex((row) => row._id === id);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...structuredClone(patch) };
        return;
      }
    }
    throw new Error(`PATCH_TARGET_NOT_FOUND:${id}`);
  }
}

function buildContext(programMode) {
  const now = Date.now();
  const program = programMode === 'missing'
    ? []
    : [{
        _id: 'program_1',
        businessId: 'business_1',
        isActive: programMode === 'active',
        title: 'Referral Card',
        rewardName: 'Referral Benefit',
      }];
  const db = new FakeDb({
    users: [{ _id: 'staff_1' }, { _id: 'customer_1' }],
    businesses: [{
      _id: 'business_1',
      ownerUserId: 'staff_1',
      name: 'Business One',
      isActive: true,
    }],
    businessStaff: [{
      _id: 'staff_link_1',
      businessId: 'business_1',
      userId: 'staff_1',
      staffRole: 'owner',
      status: 'active',
      isActive: true,
    }],
    loyaltyPrograms: program,
    customerReferrals: [{
      _id: 'referral_1',
      businessId: 'business_1',
      originProgramId: 'program_1',
    }],
    referralRewards: [{
      _id: 'reward_1',
      businessId: 'business_1',
      customerReferralId: 'referral_1',
      recipientUserId: 'customer_1',
      actualRewardType: 'BENEFIT',
      status: 'granted',
      benefitTitle: 'Free Item',
      targetProgramId: 'program_1',
    }],
    events: [],
    redemptionCelebrationReceipts: [],
    smartManagerRecipientOutcomes: [{
      _id: 'outcome_waiting',
      businessId: 'business_1',
      userId: 'customer_1',
      state: 'awaiting_return',
      contactEvidenceAt: now - 1_000,
    }],
    smartManagerOutcomeDirtyMarkers: [],
    messageLog: [],
    pushTokens: [],
    pushDeliveryLog: [],
  });
  return {
    now,
    db,
    auth: { getUserIdentity: async () => ({ subject: 'staff_1' }) },
  };
}

async function redeem(ctx) {
  return await redeemReferralBenefit._handler(ctx, {
    businessId: 'business_1',
    rewardId: 'reward_1',
  });
}

describe('legacy referral benefit redemption semantics', () => {
  test('active program creates the canonical event and Pass C artifacts', async () => {
    const ctx = buildContext('active');
    const result = await redeem(ctx);
    expect(result.status).toBe('redeemed');
    expect(result.redeemedEventId).not.toBeNull();
    expect(ctx.db.rows('events')).toHaveLength(1);
    expect(ctx.db.rows('redemptionCelebrationReceipts')).toHaveLength(1);
    expect(ctx.db.rows('smartManagerOutcomeDirtyMarkers')).toHaveLength(1);
  });

  test('inactive program still redeems without fabricating an event', async () => {
    const ctx = buildContext('inactive');
    const result = await redeem(ctx);
    expect(result).toMatchObject({ status: 'redeemed', redeemedEventId: null });
    expect(ctx.db.rows('events')).toHaveLength(0);
    expect(ctx.db.rows('redemptionCelebrationReceipts')).toHaveLength(0);
    expect(ctx.db.rows('smartManagerOutcomeDirtyMarkers')).toHaveLength(0);
  });

  test('missing program still redeems without fabricating an event', async () => {
    const ctx = buildContext('missing');
    const result = await redeem(ctx);
    expect(result).toMatchObject({ status: 'redeemed', redeemedEventId: null });
    expect(ctx.db.rows('events')).toHaveLength(0);
    expect(ctx.db.rows('redemptionCelebrationReceipts')).toHaveLength(0);
    expect(ctx.db.rows('smartManagerOutcomeDirtyMarkers')).toHaveLength(0);
  });

  test('repeated active redemption reuses the canonical event and receipt', async () => {
    const ctx = buildContext('active');
    const first = await redeem(ctx);
    const second = await redeem(ctx);
    expect(second).toMatchObject({
      status: 'redeemed',
      redeemedEventId: first.redeemedEventId,
      reused: true,
    });
    expect(ctx.db.rows('events')).toHaveLength(1);
    expect(ctx.db.rows('redemptionCelebrationReceipts')).toHaveLength(1);
  });

  for (const programMode of ['inactive', 'missing']) {
    test(`repeated ${programMode}-program redemption keeps the legacy unavailable result`, async () => {
      const ctx = buildContext(programMode);
      await redeem(ctx);
      await expect(redeem(ctx)).rejects.toThrow('REWARD_NOT_AVAILABLE');
      expect(ctx.db.rows('events')).toHaveLength(0);
      expect(ctx.db.rows('redemptionCelebrationReceipts')).toHaveLength(0);
    });
  }
});
