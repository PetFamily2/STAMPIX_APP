import { describe, expect, test } from 'bun:test';
import { wipeAllDataHardImpl } from '../users';

const WIPE_TABLE_ORDER = [
  'apiKeys',
  'apiClients',
  'messageLog',
  'campaigns',
  'scanTokenEvents',
  'events',
  'memberships',
  'loyaltyPrograms',
  'staffInvites',
  'businessStaff',
  'businesses',
  'userIdentities',
  'emailOtps',
  'authVerificationCodes',
  'authRefreshTokens',
  'authVerifiers',
  'authSessions',
  'authAccounts',
  'authRateLimits',
  'users',
];

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
  constructor(tables, options = {}) {
    this.tables = tables;
    this.throwOnDeleteId = options.throwOnDeleteId ?? null;
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
    if (this.throwOnDeleteId && id === this.throwOnDeleteId) {
      throw new Error('FORCED_DELETE_FAILURE');
    }

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

function buildCtx(tables, subject, options) {
  return {
    db: new FakeDb(tables, options),
    auth: {
      getUserIdentity: async () => (subject ? { subject } : null),
    },
  };
}

describe('wipeAllDataHardImpl', () => {
  test('wipes all tables and returns detailed delete stats', async () => {
    const tables = {
      apiKeys: [{ _id: 'ak_1', clientId: 'ac_1' }],
      apiClients: [{ _id: 'ac_1', businessId: 'b_1' }],
      messageLog: [{ _id: 'ml_1', businessId: 'b_1' }],
      campaigns: [{ _id: 'camp_1', businessId: 'b_1' }],
      scanTokenEvents: [{ _id: 'ste_1', businessId: 'b_1' }],
      events: [{ _id: 'ev_1', businessId: 'b_1' }],
      memberships: [{ _id: 'mem_1', businessId: 'b_1' }],
      loyaltyPrograms: [{ _id: 'lp_1', businessId: 'b_1' }],
      staffInvites: [{ _id: 'si_1', businessId: 'b_1' }],
      businessStaff: [{ _id: 'bs_1', businessId: 'b_1' }],
      businesses: [{ _id: 'b_1', ownerUserId: 'u_admin' }],
      userIdentities: [{ _id: 'ui_1', userId: 'u_admin' }],
      emailOtps: [{ _id: 'otp_1', email: 'admin@example.com' }],
      authVerificationCodes: [{ _id: 'avc_1', accountId: 'aa_1' }],
      authRefreshTokens: [{ _id: 'art_1', sessionId: 'as_1' }],
      authVerifiers: [{ _id: 'aver_1', sessionId: 'as_1' }],
      authSessions: [{ _id: 'as_1', userId: 'u_admin' }],
      authAccounts: [{ _id: 'aa_1', userId: 'u_admin' }],
      authRateLimits: [{ _id: 'arl_1', identifier: '127.0.0.1' }],
      users: [
        {
          _id: 'u_admin',
          externalId: 'ext_admin',
          email: 'admin@example.com',
        },
        {
          _id: 'u_other',
          externalId: 'ext_other',
          email: 'other@example.com',
        },
      ],
    };

    const ctx = buildCtx(tables, 'u_admin');
    const result = await wipeAllDataHardImpl(ctx);

    expect(result.success).toBe(true);
    expect(result.requestedByUserId).toBe('u_admin');
    expect(typeof result.timestamp).toBe('number');
    expect(result.timestamp).toBeGreaterThan(0);

    const expectedCounts = {
      apiKeys: 1,
      apiClients: 1,
      messageLog: 1,
      campaigns: 1,
      scanTokenEvents: 1,
      events: 1,
      memberships: 1,
      loyaltyPrograms: 1,
      staffInvites: 1,
      businessStaff: 1,
      businesses: 1,
      userIdentities: 1,
      emailOtps: 1,
      authVerificationCodes: 1,
      authRefreshTokens: 1,
      authVerifiers: 1,
      authSessions: 1,
      authAccounts: 1,
      authRateLimits: 1,
      users: 2,
    };

    expect(result.counts).toEqual(expectedCounts);

    for (const tableName of WIPE_TABLE_ORDER) {
      expect(ctx.db.rows(tableName)).toHaveLength(0);
    }
  });

  test('throws on delete failure and never returns success payload', async () => {
    const tables = {
      apiKeys: [{ _id: 'ak_1', clientId: 'ac_1' }],
      campaigns: [{ _id: 'camp_fail', businessId: 'b_1' }],
      users: [
        {
          _id: 'u_admin',
          externalId: 'ext_admin',
          email: 'admin@example.com',
        },
      ],
    };

    const ctx = buildCtx(tables, 'u_admin', {
      throwOnDeleteId: 'camp_fail',
    });

    await expect(wipeAllDataHardImpl(ctx)).rejects.toThrow(
      'FORCED_DELETE_FAILURE'
    );
    expect(ctx.db.rows('campaigns')).toHaveLength(1);
  });
});
