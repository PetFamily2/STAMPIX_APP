import { describe, expect, test } from 'bun:test';
import { reverseCustomerCardEvent } from '../customerCards';

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

function buildTables({ staffRole = 'owner', extraEvents = [] } = {}) {
  const now = Date.now();
  return {
    users: [
      {
        _id: 'staff_1',
        isActive: true,
        fullName: 'Staff User',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: 'customer_1',
        isActive: true,
        fullName: 'Customer User',
        createdAt: now,
        updatedAt: now,
      },
    ],
    businesses: [
      {
        _id: 'business_1',
        ownerUserId: 'staff_1',
        externalId: 'biz-1',
        name: 'Business',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    businessStaff: [
      {
        _id: 'staff_link_1',
        businessId: 'business_1',
        userId: 'staff_1',
        staffRole,
        isActive: true,
        createdAt: now,
      },
    ],
    loyaltyPrograms: [
      {
        _id: 'program_1',
        businessId: 'business_1',
        title: 'Main Card',
        rewardName: 'Free Coffee',
        maxStamps: 10,
        stampIcon: '☕',
        isActive: true,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ],
    memberships: [
      {
        _id: 'membership_1',
        userId: 'customer_1',
        businessId: 'business_1',
        programId: 'program_1',
        currentStamps: 3,
        lastStampAt: now - 1_000,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    events: [
      {
        _id: 'event_stamp_1',
        type: 'STAMP_ADDED',
        businessId: 'business_1',
        programId: 'program_1',
        membershipId: 'membership_1',
        actorUserId: 'staff_1',
        customerUserId: 'customer_1',
        source: 'scanner_commit',
        membershipStateBefore: {
          currentStamps: 2,
          lastStampAt: now - 30_000,
          isActive: true,
        },
        membershipStateAfter: {
          currentStamps: 3,
          lastStampAt: now - 1_000,
          isActive: true,
        },
        createdAt: now - 1_000,
      },
      ...extraEvents,
    ],
  };
}

function buildCtx(tables, subject = 'staff_1') {
  return {
    db: new FakeDb(tables),
    auth: {
      getUserIdentity: async () => (subject ? { subject } : null),
    },
  };
}

describe('customer card manual adjustments', () => {
  test('owner can reverse latest event and state is restored', async () => {
    const tables = buildTables({ staffRole: 'owner' });
    const ctx = buildCtx(tables);

    const result = await reverseCustomerCardEvent._handler(ctx, {
      eventId: 'event_stamp_1',
      reasonCode: 'mistake',
    });

    expect(result.status).toBe('reverted');
    expect(result.membership.currentStamps).toBe(2);

    const reversalEvents = ctx.db
      .rows('events')
      .filter((event) => event.revertsEventId === 'event_stamp_1');
    expect(reversalEvents).toHaveLength(1);
    expect(reversalEvents[0].type).toBe('STAMP_REVERTED');
    expect(reversalEvents[0].source).toBe('manual_adjustment');
    expect(reversalEvents[0].reasonCode).toBe('mistake');
  });

  test('manager can reverse latest event', async () => {
    const tables = buildTables({ staffRole: 'manager' });
    const ctx = buildCtx(tables);

    const result = await reverseCustomerCardEvent._handler(ctx, {
      eventId: 'event_stamp_1',
      reasonCode: 'customer_service',
    });

    expect(result.status).toBe('reverted');
  });

  test('duplicate manual adjustment is idempotent and creates one reversal', async () => {
    const tables = buildTables({ staffRole: 'owner' });
    const ctx = buildCtx(tables);

    const first = await reverseCustomerCardEvent._handler(ctx, {
      eventId: 'event_stamp_1',
      reasonCode: 'duplicate',
    });
    expect(first.status).toBe('reverted');

    const second = await reverseCustomerCardEvent._handler(ctx, {
      eventId: 'event_stamp_1',
      reasonCode: 'duplicate',
    });
    expect(second.status).toBe('already_reverted');

    const reversalEvents = ctx.db
      .rows('events')
      .filter((event) => event.revertsEventId === 'event_stamp_1');
    expect(reversalEvents).toHaveLength(1);
  });

  test('staff cannot perform manual adjustment', async () => {
    const tables = buildTables({ staffRole: 'staff' });
    const ctx = buildCtx(tables);

    await expect(
      reverseCustomerCardEvent._handler(ctx, {
        eventId: 'event_stamp_1',
        reasonCode: 'mistake',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  test('manual adjustment is blocked for non-tail events', async () => {
    const now = Date.now();
    const tables = buildTables({
      staffRole: 'owner',
      extraEvents: [
        {
          _id: 'event_stamp_2',
          type: 'STAMP_ADDED',
          businessId: 'business_1',
          programId: 'program_1',
          membershipId: 'membership_1',
          actorUserId: 'staff_1',
          customerUserId: 'customer_1',
          source: 'scanner_commit',
          membershipStateBefore: {
            currentStamps: 3,
            lastStampAt: now - 1_000,
            isActive: true,
          },
          membershipStateAfter: {
            currentStamps: 4,
            lastStampAt: now,
            isActive: true,
          },
          createdAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);

    await expect(
      reverseCustomerCardEvent._handler(ctx, {
        eventId: 'event_stamp_1',
        reasonCode: 'duplicate',
      })
    ).rejects.toThrow('MANUAL_ADJUSTMENT_NOT_LAST_EVENT');
  });
});
