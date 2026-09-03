import { describe, expect, test } from 'bun:test';
import { wipeAllDataHardImpl } from '../users';

const WIPE_TABLE_ORDER = [
  'apiKeys',
  'apiClients',
  'providerRevocationJobs',
  'providerRevocationCredentials',
  'businessDeletionRecipients',
  'businessDeletionAssets',
  'businessDeletionJobs',
  'accountDeletionRequests',
  'supportRequests',
  'messageLog',
  'smartManagerMigrations',
  'smartManagerPreparedActionCopies',
  'smartManagerPreparedActions',
  'smartManagerAuditEvents',
  'smartManagerShadowComparisons',
  'smartManagerDecisions',
  'smartManagerFactSnapshots',
  'smartManagerEvaluationStates',
  'smartManagerPolicyVersions',
  'campaigns',
  'subscriptions',
  'scanSessions',
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
    if (docs.length === 0) {
      return null;
    }
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

  async paginate({ cursor, numItems }) {
    const docs = this.docs();
    const start = cursor ? Number(cursor) : 0;
    const end = Math.min(start + numItems, docs.length);
    return {
      page: docs.slice(start, end),
      isDone: end >= docs.length,
      continueCursor: String(end),
    };
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
      if (row) {
        return row;
      }
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
      providerRevocationJobs: [
        {
          _id: 'prj_1',
          provider: 'google',
          status: 'manual_required',
          attemptCount: 0,
        },
      ],
      providerRevocationCredentials: [
        {
          _id: 'prc_1',
          userId: 'u_admin',
          provider: 'google',
          providerAccountId: 'google_subject',
          encryptedRefreshToken: 'encrypted-refresh-token',
          credentialVersion: 1,
        },
      ],
      businessDeletionRecipients: [
        { _id: 'bdr_1', jobId: 'bdj_1', userId: 'u_admin' },
      ],
      businessDeletionAssets: [
        { _id: 'bda_1', jobId: 'bdj_1', storageId: 'storage_1' },
      ],
      businessDeletionJobs: [
        { _id: 'bdj_1', businessId: 'b_1', requestedByUserId: 'u_admin' },
      ],
      accountDeletionRequests: [
        {
          _id: 'adr_1',
          email: 'delete@example.com',
          status: 'new',
          requestReference: 'ADR-0123456789abcdef',
        },
        {
          _id: 'adr_2',
          email: 'delete@example.com',
          status: 'handled',
          requestReference: 'ADR-1123456789abcdef',
        },
        {
          _id: 'adr_3',
          email: 'other-delete@example.com',
          status: 'in_review',
          requestReference: 'ADR-2123456789abcdef',
        },
      ],
      supportRequests: [{ _id: 'sr_1', userId: 'u_admin' }],
      messageLog: [{ _id: 'ml_1', businessId: 'b_1' }],
      smartManagerMigrations: [
        { _id: 'smm_1', migrationKey: 'smart_manager_batch_1_v1' },
      ],
      smartManagerPreparedActionCopies: [
        { _id: 'smpac_1', preparedActionId: 'smpa_1', businessId: 'b_1' },
      ],
      smartManagerPreparedActions: [
        { _id: 'smpa_1', businessId: 'b_1' },
      ],
      smartManagerAuditEvents: [{ _id: 'sma_1', businessId: 'b_1' }],
      smartManagerShadowComparisons: [{ _id: 'sms_1', businessId: 'b_1' }],
      smartManagerDecisions: [{ _id: 'smd_1', businessId: 'b_1' }],
      smartManagerFactSnapshots: [{ _id: 'smf_1', businessId: 'b_1' }],
      smartManagerEvaluationStates: [{ _id: 'sme_1', businessId: 'b_1' }],
      smartManagerPolicyVersions: [{ _id: 'smp_1', version: 'v1' }],
      campaigns: [{ _id: 'camp_1', businessId: 'b_1' }],
      subscriptions: [{ _id: 'sub_1', businessId: 'b_1' }],
      scanSessions: [{ _id: 'ss_1', businessId: 'b_1' }],
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
    const resetEmails = [];
    const result = await wipeAllDataHardImpl(ctx, {
      resetAccountDeletionEmailLimit: async (_ctx, email) => {
        resetEmails.push(email);
      },
    });

    expect(result.success).toBe(true);
    expect(result.requestedByUserId).toBe('u_admin');
    expect(typeof result.timestamp).toBe('number');
    expect(result.timestamp).toBeGreaterThan(0);

    const expectedCounts = {
      apiKeys: 1,
      apiClients: 1,
      providerRevocationJobs: 1,
      providerRevocationCredentials: 1,
      businessDeletionRecipients: 1,
      businessDeletionAssets: 1,
      businessDeletionJobs: 1,
      accountDeletionRequests: 3,
      supportRequests: 1,
      messageLog: 1,
      smartManagerMigrations: 1,
      smartManagerPreparedActionCopies: 1,
      smartManagerPreparedActions: 1,
      smartManagerAuditEvents: 1,
      smartManagerShadowComparisons: 1,
      smartManagerDecisions: 1,
      smartManagerFactSnapshots: 1,
      smartManagerEvaluationStates: 1,
      smartManagerPolicyVersions: 1,
      pushTokens: 0,
      pushDeliveryLog: 0,
      referralAdminAuditLog: 0,
      referralRewards: 0,
      customerReferrals: 0,
      customerReferralLinks: 0,
      referralConfigs: 0,
      businessReferrals: 0,
      businessReferralLinks: 0,
      campaigns: 1,
      subscriptions: 1,
      scanSessions: 1,
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
    expect(resetEmails.sort()).toEqual([
      'delete@example.com',
      'other-delete@example.com',
    ]);
    expect(JSON.stringify(result)).not.toContain('delete@example.com');
    expect(JSON.stringify(result)).not.toContain(
      'other-delete@example.com'
    );

    for (const tableName of WIPE_TABLE_ORDER) {
      expect(ctx.db.rows(tableName)).toHaveLength(0);
    }
  });

  test('throws on delete failure and never returns success payload', async () => {
    const tables = {
      apiKeys: [{ _id: 'ak_1', clientId: 'ac_1' }],
      smartManagerPreparedActionCopies: [
        {
          _id: 'prepared_copy_fail',
          preparedActionId: 'prepared_action_1',
          businessId: 'b_1',
        },
      ],
      users: [
        {
          _id: 'u_admin',
          externalId: 'ext_admin',
          email: 'admin@example.com',
        },
      ],
    };

    const ctx = buildCtx(tables, 'u_admin', {
      throwOnDeleteId: 'prepared_copy_fail',
    });

    await expect(wipeAllDataHardImpl(ctx)).rejects.toThrow(
      'FORCED_DELETE_FAILURE'
    );
    expect(ctx.db.rows('smartManagerPreparedActionCopies')).toHaveLength(1);
  });

  test('limiter reset failure prevents a false successful hard wipe', async () => {
    const email = 'private-delete@example.com';
    const tables = {
      accountDeletionRequests: [
        {
          _id: 'adr_private',
          email,
          status: 'handled',
          requestReference: 'ADR-3123456789abcdef',
        },
      ],
      users: [
        {
          _id: 'u_admin',
          externalId: 'ext_admin',
          email: 'admin@example.com',
        },
      ],
    };
    const ctx = buildCtx(tables, 'u_admin');
    let caught;

    try {
      await wipeAllDataHardImpl(ctx, {
        resetAccountDeletionEmailLimit: async () => {
          throw new Error(`RESET_FAILED ${email}`);
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe(
      'ACCOUNT_DELETION_EMAIL_RATE_LIMIT_RESET_FAILED'
    );
    expect(caught.message).not.toContain(email);
    expect(ctx.db.rows('accountDeletionRequests')).toHaveLength(1);
  });
});
