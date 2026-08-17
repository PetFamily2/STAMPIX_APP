import { describe, expect, test } from 'bun:test';

import { byCustomer, byCustomerBusinesses } from '../memberships';

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
    this.predicates.push((row) =>
      conditions.every(({ field, value }) => row[field] === value)
    );
    return this;
  }

  filter(builder) {
    const q = {
      field: (field) => ({ field }),
      eq: (left, right) => ({ left, right }),
    };
    const expression = builder(q);
    this.predicates.push(
      (row) => row[expression.left.field] === expression.right
    );
    return this;
  }

  async collect() {
    return this.db
      .rows(this.tableName)
      .filter((row) => this.predicates.every((predicate) => predicate(row)));
  }
}

class FakeDb {
  constructor(tables) {
    this.tables = tables;
  }

  rows(tableName) {
    return this.tables[tableName] ?? [];
  }

  query(tableName) {
    return new FakeQuery(this, tableName);
  }

  async get(id) {
    for (const rows of Object.values(this.tables)) {
      const match = rows.find((row) => row._id === id);
      if (match) {
        return match;
      }
    }
    return null;
  }
}

function buildContext() {
  const now = 1_700_000_000_000;
  const db = new FakeDb({
    users: [{ _id: 'customer_1', isActive: true }],
    businesses: [
      { _id: 'business_open', name: 'עסק פתוח', isActive: true },
      { _id: 'business_closed', name: 'עסק סגור', isActive: false },
    ],
    loyaltyPrograms: [
      {
        _id: 'program_active',
        businessId: 'business_open',
        title: 'פעיל',
        rewardName: 'קפה',
        maxStamps: 10,
        stampIcon: 'star',
        status: 'active',
        isActive: true,
      },
      {
        _id: 'program_archived',
        businessId: 'business_open',
        title: 'ארכיון',
        rewardName: 'מאפה',
        maxStamps: 5,
        stampIcon: 'star',
        status: 'archived',
        isActive: true,
      },
      {
        _id: 'program_closed_business',
        businessId: 'business_closed',
        title: 'סגור',
        rewardName: 'פרס',
        maxStamps: 8,
        stampIcon: 'star',
        status: 'active',
        isActive: true,
      },
    ],
    memberships: [
      {
        _id: 'membership_active',
        userId: 'customer_1',
        businessId: 'business_open',
        programId: 'program_active',
        currentStamps: 4,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: 'membership_archived',
        userId: 'customer_1',
        businessId: 'business_open',
        programId: 'program_archived',
        currentStamps: 5,
        isActive: true,
        createdAt: now - 1,
        updatedAt: now - 1,
      },
      {
        _id: 'membership_closed',
        userId: 'customer_1',
        businessId: 'business_closed',
        programId: 'program_closed_business',
        currentStamps: 8,
        isActive: true,
        createdAt: now - 2,
        updatedAt: now - 2,
      },
      {
        _id: 'membership_inactive',
        userId: 'customer_1',
        businessId: 'business_open',
        programId: 'program_active',
        currentStamps: 10,
        isActive: false,
        createdAt: now - 3,
        updatedAt: now - 3,
      },
    ],
  });

  return {
    db,
    auth: {
      getUserIdentity: async () => ({ subject: 'customer_1|session' }),
    },
    storage: {
      getUrl: async () => null,
    },
  };
}

describe('customer membership presentation lifecycle', () => {
  test('returns active and archived lifecycle while preserving filtering', async () => {
    const result = await byCustomer._handler(buildContext(), {});

    expect(result).toHaveLength(2);
    expect(
      result.map(({ programLifecycle }) => programLifecycle).sort()
    ).toEqual(['active', 'archived']);
    expect(
      result.find((item) => item.programLifecycle === 'archived')?.canRedeem
    ).toBe(false);
    expect(result.some((item) => item.businessName === 'עסק סגור')).toBe(false);
  });

  test('does not count an archived completed card as redeemable', async () => {
    const result = await byCustomerBusinesses._handler(buildContext(), {});

    expect(result).toHaveLength(1);
    expect(result[0].joinedProgramCount).toBe(2);
    expect(result[0].redeemableCount).toBe(0);
    expect(['active', 'archived']).toContain(
      result[0].previewProgramLifecycle
    );
  });
});
