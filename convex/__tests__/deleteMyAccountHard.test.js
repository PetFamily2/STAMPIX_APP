import { describe, expect, test } from 'bun:test';
import { deleteMyAccountHardImpl } from '../users';

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

  filter(_builder) {
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

  async unique() {
    const docs = this.docs();
    if (docs.length === 0) return null;
    if (docs.length > 1) {
      throw new Error(`Expected unique result in ${this.tableName}`);
    }
    return docs[0];
  }

  async take(count) {
    return this.docs().slice(0, count);
  }

  async collect() {
    return this.docs();
  }
}

class FakeDb {
  constructor(tables) {
    this.tables = tables;
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
      if (row) return row;
    }
    return null;
  }

  async delete(id) {
    for (const tableName of Object.keys(this.tables)) {
      const rows = this.rows(tableName);
      const index = rows.findIndex((doc) => doc._id === id);
      if (index >= 0) {
        rows.splice(index, 1);
        return;
      }
    }
  }
}

function buildCtx(tables, subject) {
  return {
    db: new FakeDb(tables),
    auth: {
      getUserIdentity: async () => (subject ? { subject } : null),
    },
  };
}

describe('deleteMyAccountHardImpl', () => {
  test('customer deletion removes all user-scoped rows and auth mappings', async () => {
    const tables = {
      users: [
        {
          _id: 'u_customer',
          externalId: 'ext_customer',
          email: 'customer@example.com',
        },
        { _id: 'u_owner', externalId: 'ext_owner', email: 'owner@example.com' },
      ],
      businesses: [{ _id: 'b_owner', ownerUserId: 'u_owner' }],
      businessStaff: [
        {
          _id: 'bs_owner',
          businessId: 'b_owner',
          userId: 'u_owner',
          staffRole: 'owner',
          isActive: true,
        },
        {
          _id: 'bs_customer_other',
          businessId: 'b_owner',
          userId: 'u_customer',
          staffRole: 'staff',
          isActive: true,
        },
      ],
      loyaltyPrograms: [{ _id: 'p_owner', businessId: 'b_owner' }],
      memberships: [
        {
          _id: 'm_customer',
          userId: 'u_customer',
          businessId: 'b_owner',
          programId: 'p_owner',
        },
        {
          _id: 'm_owner',
          userId: 'u_owner',
          businessId: 'b_owner',
          programId: 'p_owner',
        },
      ],
      events: [
        {
          _id: 'e_customer',
          businessId: 'b_owner',
          programId: 'p_owner',
          customerUserId: 'u_customer',
          actorUserId: 'u_owner',
        },
        {
          _id: 'e_actor',
          businessId: 'b_owner',
          programId: 'p_owner',
          customerUserId: 'u_owner',
          actorUserId: 'u_customer',
        },
      ],
      scanTokenEvents: [
        {
          _id: 'ste_customer',
          businessId: 'b_owner',
          programId: 'p_owner',
          customerId: 'u_customer',
        },
        {
          _id: 'ste_owner',
          businessId: 'b_owner',
          programId: 'p_owner',
          customerId: 'u_owner',
        },
      ],
      scanSessions: [
        {
          _id: 'ss_customer',
          businessId: 'b_owner',
          programId: 'p_owner',
          customerId: 'u_customer',
          actorUserId: 'u_owner',
        },
        {
          _id: 'ss_actor_customer',
          businessId: 'b_owner',
          programId: 'p_owner',
          customerId: 'u_owner',
          actorUserId: 'u_customer',
        },
      ],
      messageLog: [
        { _id: 'ml_customer', businessId: 'b_owner', toUserId: 'u_customer' },
        { _id: 'ml_owner', businessId: 'b_owner', toUserId: 'u_owner' },
      ],
      authAccounts: [
        { _id: 'aa_customer', userId: 'u_customer', provider: 'password' },
      ],
      authVerificationCodes: [
        { _id: 'avc_customer', accountId: 'aa_customer' },
      ],
      authSessions: [{ _id: 'as_customer', userId: 'u_customer' }],
      authRefreshTokens: [{ _id: 'art_customer', sessionId: 'as_customer' }],
      authVerifiers: [{ _id: 'aver_customer', sessionId: 'as_customer' }],
      emailOtps: [
        { _id: 'otp_customer', email: 'customer@example.com' },
        { _id: 'otp_other', email: 'someone-else@example.com' },
      ],
    };

    const ctx = buildCtx(tables, 'u_customer');
    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.deletedBusinessIds).toHaveLength(0);
    expect(
      ctx.db.rows('users').find((row) => row._id === 'u_customer')
    ).toBeUndefined();
    expect(
      ctx.db.rows('users').find((row) => row._id === 'u_owner')
    ).toBeDefined();

    expect(
      ctx.db.rows('memberships').some((row) => row.userId === 'u_customer')
    ).toBe(false);
    expect(
      ctx.db.rows('businessStaff').some((row) => row.userId === 'u_customer')
    ).toBe(false);
    expect(
      ctx.db
        .rows('events')
        .some(
          (row) =>
            row.customerUserId === 'u_customer' ||
            row.actorUserId === 'u_customer'
        )
    ).toBe(false);
    expect(
      ctx.db
        .rows('scanTokenEvents')
        .some((row) => row.customerId === 'u_customer')
    ).toBe(false);
    expect(
      ctx.db
        .rows('scanSessions')
        .some(
          (row) =>
            row.customerId === 'u_customer' || row.actorUserId === 'u_customer'
        )
    ).toBe(false);
    expect(
      ctx.db.rows('messageLog').some((row) => row.toUserId === 'u_customer')
    ).toBe(false);

    expect(ctx.db.rows('authAccounts')).toHaveLength(0);
    expect(ctx.db.rows('authVerificationCodes')).toHaveLength(0);
    expect(ctx.db.rows('authSessions')).toHaveLength(0);
    expect(ctx.db.rows('authRefreshTokens')).toHaveLength(0);
    expect(ctx.db.rows('authVerifiers')).toHaveLength(0);
    expect(
      ctx.db
        .rows('emailOtps')
        .some((row) => row.email === 'customer@example.com')
    ).toBe(false);
    expect(
      ctx.db
        .rows('emailOtps')
        .some((row) => row.email === 'someone-else@example.com')
    ).toBe(true);
  });

  test('owner deletion removes owned business graph and user-scoped rows', async () => {
    const tables = {
      users: [
        { _id: 'u_owner', externalId: 'ext_owner', email: 'owner@example.com' },
        { _id: 'u_staff', externalId: 'ext_staff', email: 'staff@example.com' },
        {
          _id: 'u_customer',
          externalId: 'ext_customer',
          email: 'customer@example.com',
        },
        {
          _id: 'u_other_owner',
          externalId: 'ext_other_owner',
          email: 'other@example.com',
        },
      ],
      businesses: [
        { _id: 'b_owned', ownerUserId: 'u_owner' },
        { _id: 'b_other', ownerUserId: 'u_other_owner' },
      ],
      businessStaff: [
        {
          _id: 'bs_owned_owner',
          businessId: 'b_owned',
          userId: 'u_owner',
          staffRole: 'owner',
          isActive: true,
        },
        {
          _id: 'bs_owned_staff',
          businessId: 'b_owned',
          userId: 'u_staff',
          staffRole: 'staff',
          isActive: true,
        },
        {
          _id: 'bs_other_owner_is_staff',
          businessId: 'b_other',
          userId: 'u_owner',
          staffRole: 'staff',
          isActive: true,
        },
      ],
      loyaltyPrograms: [
        { _id: 'p_owned_1', businessId: 'b_owned' },
        { _id: 'p_other', businessId: 'b_other' },
      ],
      memberships: [
        {
          _id: 'm_owned_customer',
          userId: 'u_customer',
          businessId: 'b_owned',
          programId: 'p_owned_1',
        },
        {
          _id: 'm_owner_other_business',
          userId: 'u_owner',
          businessId: 'b_other',
          programId: 'p_other',
        },
      ],
      events: [
        {
          _id: 'e_owned',
          businessId: 'b_owned',
          programId: 'p_owned_1',
          customerUserId: 'u_customer',
          actorUserId: 'u_owner',
        },
        {
          _id: 'e_other_actor_owner',
          businessId: 'b_other',
          programId: 'p_other',
          customerUserId: 'u_customer',
          actorUserId: 'u_owner',
        },
      ],
      scanTokenEvents: [
        {
          _id: 'ste_owned',
          businessId: 'b_owned',
          programId: 'p_owned_1',
          customerId: 'u_customer',
        },
        {
          _id: 'ste_other_owner',
          businessId: 'b_other',
          programId: 'p_other',
          customerId: 'u_owner',
        },
      ],
      scanSessions: [
        {
          _id: 'ss_owned',
          businessId: 'b_owned',
          programId: 'p_owned_1',
          customerId: 'u_customer',
          actorUserId: 'u_owner',
        },
        {
          _id: 'ss_other_owner',
          businessId: 'b_other',
          programId: 'p_other',
          customerId: 'u_owner',
          actorUserId: 'u_staff',
        },
      ],
      campaigns: [
        { _id: 'camp_owned', businessId: 'b_owned' },
        { _id: 'camp_other', businessId: 'b_other' },
      ],
      messageLog: [
        { _id: 'ml_owned', businessId: 'b_owned', toUserId: 'u_customer' },
        {
          _id: 'ml_other_to_owner',
          businessId: 'b_other',
          toUserId: 'u_owner',
        },
      ],
      apiClients: [
        { _id: 'ac_owned', businessId: 'b_owned' },
        { _id: 'ac_other', businessId: 'b_other' },
      ],
      apiKeys: [
        { _id: 'ak_owned', clientId: 'ac_owned' },
        { _id: 'ak_other', clientId: 'ac_other' },
      ],
      authAccounts: [
        { _id: 'aa_owner', userId: 'u_owner', provider: 'password' },
      ],
      authVerificationCodes: [{ _id: 'avc_owner', accountId: 'aa_owner' }],
      authSessions: [{ _id: 'as_owner', userId: 'u_owner' }],
      authRefreshTokens: [{ _id: 'art_owner', sessionId: 'as_owner' }],
      authVerifiers: [{ _id: 'aver_owner', sessionId: 'as_owner' }],
      emailOtps: [{ _id: 'otp_owner', email: 'owner@example.com' }],
    };

    const ctx = buildCtx(tables, 'u_owner');
    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.deletedBusinessIds).toEqual(['b_owned']);
    expect(
      ctx.db.rows('users').find((row) => row._id === 'u_owner')
    ).toBeUndefined();
    expect(
      ctx.db.rows('users').find((row) => row._id === 'u_staff')
    ).toBeDefined();
    expect(
      ctx.db.rows('users').find((row) => row._id === 'u_customer')
    ).toBeDefined();

    expect(ctx.db.rows('businesses').some((row) => row._id === 'b_owned')).toBe(
      false
    );
    expect(ctx.db.rows('businesses').some((row) => row._id === 'b_other')).toBe(
      true
    );

    expect(
      ctx.db.rows('businessStaff').some((row) => row.businessId === 'b_owned')
    ).toBe(false);
    expect(
      ctx.db.rows('loyaltyPrograms').some((row) => row.businessId === 'b_owned')
    ).toBe(false);
    expect(
      ctx.db.rows('memberships').some((row) => row.businessId === 'b_owned')
    ).toBe(false);
    expect(
      ctx.db.rows('events').some((row) => row.businessId === 'b_owned')
    ).toBe(false);
    expect(
      ctx.db.rows('scanTokenEvents').some((row) => row.businessId === 'b_owned')
    ).toBe(false);
    expect(
      ctx.db.rows('scanSessions').some((row) => row.businessId === 'b_owned')
    ).toBe(false);
    expect(
      ctx.db.rows('campaigns').some((row) => row.businessId === 'b_owned')
    ).toBe(false);
    expect(
      ctx.db.rows('messageLog').some((row) => row.businessId === 'b_owned')
    ).toBe(false);
    expect(
      ctx.db.rows('apiClients').some((row) => row.businessId === 'b_owned')
    ).toBe(false);
    expect(
      ctx.db.rows('apiKeys').some((row) => row.clientId === 'ac_owned')
    ).toBe(false);

    expect(
      ctx.db.rows('memberships').some((row) => row.userId === 'u_owner')
    ).toBe(false);
    expect(
      ctx.db.rows('businessStaff').some((row) => row.userId === 'u_owner')
    ).toBe(false);
    expect(
      ctx.db
        .rows('events')
        .some(
          (row) =>
            row.customerUserId === 'u_owner' || row.actorUserId === 'u_owner'
        )
    ).toBe(false);
    expect(
      ctx.db.rows('scanTokenEvents').some((row) => row.customerId === 'u_owner')
    ).toBe(false);
    expect(
      ctx.db
        .rows('scanSessions')
        .some(
          (row) => row.customerId === 'u_owner' || row.actorUserId === 'u_owner'
        )
    ).toBe(false);
    expect(
      ctx.db.rows('messageLog').some((row) => row.toUserId === 'u_owner')
    ).toBe(false);

    expect(ctx.db.rows('authAccounts')).toHaveLength(0);
    expect(ctx.db.rows('authVerificationCodes')).toHaveLength(0);
    expect(ctx.db.rows('authSessions')).toHaveLength(0);
    expect(ctx.db.rows('authRefreshTokens')).toHaveLength(0);
    expect(ctx.db.rows('authVerifiers')).toHaveLength(0);
  });
});
