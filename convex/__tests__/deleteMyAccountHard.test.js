import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { deleteMyAccountHardImpl } from '../users';

const clone = (value) => JSON.parse(JSON.stringify(value));

class FakeQuery {
  constructor(docs, meta = {}) {
    this.docs = docs;
    this.meta = meta;
  }

  withIndex(_name, builder) {
    if (!builder) {
      return new FakeQuery(this.docs, this.meta);
    }
    const predicates = [];
    const q = {
      eq(field, value) {
        predicates.push((doc) => doc[field] === value);
        return q;
      },
    };
    builder(q);
    return new FakeQuery(
      this.docs.filter((doc) => predicates.every((predicate) => predicate(doc))),
      this.meta
    );
  }

  filter() {
    return new FakeQuery(this.docs, this.meta);
  }

  order() {
    return this;
  }

  async collect() {
    this.meta.onCollect?.(this.meta.tableName);
    return this.docs;
  }

  async take(n) {
    this.meta.onTake?.(this.meta.tableName, n);
    return this.docs.slice(0, n);
  }

  async first() {
    return this.docs[0] ?? null;
  }

  async unique() {
    return this.docs[0] ?? null;
  }
}

class FakeDb {
  constructor(tables) {
    this.tables = clone(tables);
    this.deleted = [];
    this.insertCount = 0;
    this.collectCalls = [];
    this.takeCalls = [];
  }

  query(table) {
    return new FakeQuery(this.tables[table] ?? [], {
      tableName: table,
      onCollect: (tableName) => {
        this.collectCalls.push(tableName);
      },
      onTake: (tableName, n) => {
        this.takeCalls.push({ tableName, n });
      },
    });
  }

  async get(id) {
    for (const docs of Object.values(this.tables)) {
      const doc = docs.find((item) => item._id === id);
      if (doc) {
        return doc;
      }
    }
    return null;
  }

  normalizeId(table, id) {
    return (this.tables[table] ?? []).some((doc) => doc._id === id) ? id : null;
  }

  async patch(id, updates) {
    for (const docs of Object.values(this.tables)) {
      const doc = docs.find((item) => item._id === id);
      if (doc) {
        Object.assign(doc, updates);
        return;
      }
    }
    throw new Error(`Missing doc ${id}`);
  }

  async delete(id) {
    for (const [table, docs] of Object.entries(this.tables)) {
      const index = docs.findIndex((item) => item._id === id);
      if (index >= 0) {
        const [doc] = docs.splice(index, 1);
        this.deleted.push({ table, id, doc });
        return;
      }
    }
    throw new Error(`Missing doc ${id}`);
  }

  async insert(table, value) {
    this.insertCount += 1;
    const id = `${table}_${this.insertCount}`;
    if (!this.tables[table]) {
      this.tables[table] = [];
    }
    this.tables[table].push({ _id: id, ...clone(value) });
    return id;
  }

  rows(table) {
    return this.tables[table] ?? [];
  }
}

function buildCtx(tables, userId = 'u_customer') {
  const db = new FakeDb(tables);
  const scheduled = [];
  return {
    db,
    scheduled,
    scheduler: {
      runAfter: async (delay, fn, args) => scheduled.push({ delay, fn, args }),
    },
    auth: {
      async getUserIdentity() {
        return {
          subject: `${userId}|session`,
          email: `${userId}@example.com`,
        };
      },
    },
  };
}

describe('deleteMyAccountHardImpl', () => {
  test('prepares independent Apple and Google revocation jobs before deleting provider credentials', async () => {
    const ctx = buildCtx({
      users: [{ _id: 'u_customer', email: 'customer@example.com' }],
      userIdentities: [
        {
          _id: 'identity_apple',
          userId: 'u_customer',
          provider: 'apple',
          providerUserId: 'apple_subject',
        },
        {
          _id: 'identity_google',
          userId: 'u_customer',
          provider: 'google',
          providerUserId: 'google_subject',
        },
      ],
      authAccounts: [
        {
          _id: 'account_apple',
          userId: 'u_customer',
          provider: 'apple',
          providerAccountId: 'apple_subject',
        },
        {
          _id: 'account_google',
          userId: 'u_customer',
          provider: 'google',
          providerAccountId: 'google_subject',
        },
      ],
      providerRevocationCredentials: [
        {
          _id: 'credential_apple',
          userId: 'u_customer',
          provider: 'apple',
          providerAccountId: 'apple_subject',
          encryptedAccessToken: 'encrypted-apple-access',
          encryptedRefreshToken: 'encrypted-apple-refresh',
          credentialVersion: 1,
        },
        {
          _id: 'credential_google',
          userId: 'u_customer',
          provider: 'google',
          providerAccountId: 'google_subject',
          encryptedAccessToken: 'encrypted-google-access',
          accessTokenExpiresAt: Date.now() + 60_000,
          credentialVersion: 1,
        },
      ],
    });

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    expect(result.revocationQueuedProviders).toEqual(['apple', 'google']);
    expect(result.manualFallbackProviders).toEqual([]);
    expect(result.deleted.providerRevocationCredentials).toBe(2);
    expect(ctx.db.rows('providerRevocationCredentials')).toEqual([]);
    expect(ctx.db.rows('providerRevocationJobs')).toHaveLength(2);
    expect(ctx.db.rows('providerRevocationJobs').map((job) => job.status)).toEqual([
      'queued',
      'queued',
    ]);
    expect(ctx.db.rows('userIdentities')).toEqual([]);
    expect(ctx.db.rows('authAccounts')).toEqual([]);
    expect(ctx.scheduled).toHaveLength(2);
    expect(ctx.db.rows('users')).toEqual([]);
  });

  test('legacy provider identities without retained tokens remain deletable and become manual receipts', async () => {
    const ctx = buildCtx({
      users: [{ _id: 'u_customer', email: 'customer@example.com' }],
      userIdentities: [
        {
          _id: 'identity_apple',
          userId: 'u_customer',
          provider: 'apple',
          providerUserId: 'apple_subject',
        },
      ],
      authAccounts: [
        {
          _id: 'account_apple',
          userId: 'u_customer',
          provider: 'apple',
          providerAccountId: 'apple_subject',
        },
      ],
    });

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    expect(result.revocationQueuedProviders).toEqual([]);
    expect(result.manualFallbackProviders).toEqual(['apple']);
    expect(ctx.db.rows('providerRevocationJobs')).toEqual([
      expect.objectContaining({
        provider: 'apple',
        status: 'manual_required',
        terminalCode: 'LEGACY_NO_TOKEN',
      }),
    ]);
    expect(ctx.db.rows('providerRevocationJobs')[0]).not.toHaveProperty(
      'encryptedAccessToken'
    );
    expect(ctx.db.rows('providerRevocationJobs')[0]).not.toHaveProperty(
      'encryptedRefreshToken'
    );
    expect(ctx.scheduled).toEqual([]);
    expect(ctx.db.rows('users')).toEqual([]);
  });

  test('email/password accounts prepare no provider revocation work', async () => {
    const ctx = buildCtx({
      users: [{ _id: 'u_customer', email: 'customer@example.com' }],
      userIdentities: [
        {
          _id: 'identity_email',
          userId: 'u_customer',
          provider: 'email',
          providerUserId: 'customer@example.com',
        },
      ],
      authAccounts: [
        {
          _id: 'account_password',
          userId: 'u_customer',
          provider: 'password',
          providerAccountId: 'customer@example.com',
          secret: 'hashed-password',
        },
      ],
    });

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    expect(result.revocationQueuedProviders).toEqual([]);
    expect(result.manualFallbackProviders).toEqual([]);
    expect(ctx.db.rows('providerRevocationJobs')).toEqual([]);
    expect(ctx.db.rows('userIdentities')).toEqual([]);
    expect(ctx.db.rows('authAccounts')).toEqual([]);
    expect(JSON.stringify(ctx.db.tables)).not.toContain('hashed-password');
    expect(ctx.scheduled).toEqual([]);
  });

  for (const provider of ['apple', 'google']) {
    test(`${provider}-only users prepare exactly one provider job`, async () => {
      const providerAccountId = `${provider}_subject`;
      const ctx = buildCtx({
        users: [{ _id: 'u_customer', email: 'customer@example.com' }],
        userIdentities: [
          {
            _id: `identity_${provider}`,
            userId: 'u_customer',
            provider,
            providerUserId: providerAccountId,
          },
        ],
        providerRevocationCredentials: [
          {
            _id: `credential_${provider}`,
            userId: 'u_customer',
            provider,
            providerAccountId,
            encryptedRefreshToken: `encrypted-${provider}-refresh`,
            credentialVersion: 1,
          },
        ],
      });

      const result = await deleteMyAccountHardImpl(ctx);

      expect(result.success).toBe(true);
      expect(result.revocationQueuedProviders).toEqual([provider]);
      expect(ctx.db.rows('providerRevocationJobs')).toHaveLength(1);
      expect(ctx.db.rows('providerRevocationJobs')[0]).toMatchObject({
        provider,
        providerAccountId,
        status: 'queued',
      });
      expect(ctx.scheduled).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain('encrypted-');
    });
  }

  test('sole-owner blockers run before provider revocation work is created', async () => {
    const ctx = buildCtx(
      {
        users: [{ _id: 'u_owner', email: 'owner@example.com', isActive: true }],
        businesses: [{ _id: 'b_owned', ownerUserId: 'u_owner' }],
        businessStaff: [
          {
            _id: 'staff_owner',
            businessId: 'b_owned',
            userId: 'u_owner',
            staffRole: 'owner',
            status: 'active',
          },
        ],
        userIdentities: [
          {
            _id: 'identity_apple',
            userId: 'u_owner',
            provider: 'apple',
            providerUserId: 'apple_subject',
          },
        ],
        providerRevocationCredentials: [
          {
            _id: 'credential_apple',
            userId: 'u_owner',
            provider: 'apple',
            providerAccountId: 'apple_subject',
            encryptedRefreshToken: 'encrypted-refresh',
            credentialVersion: 1,
          },
        ],
      },
      'u_owner'
    );

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'SOLE_OWNER_BUSINESS_BLOCKED',
    });
    expect(ctx.db.rows('providerRevocationJobs')).toEqual([]);
    expect(ctx.db.rows('providerRevocationCredentials')).toHaveLength(1);
    expect(ctx.scheduled).toEqual([]);
  });

  test('authenticated deletion cannot target another user credential', async () => {
    const ctx = buildCtx({
      users: [
        { _id: 'u_customer', email: 'customer@example.com' },
        { _id: 'u_other', email: 'other@example.com' },
      ],
      providerRevocationCredentials: [
        {
          _id: 'credential_other',
          userId: 'u_other',
          provider: 'google',
          providerAccountId: 'other_google_subject',
          encryptedAccessToken: 'other-encrypted-access',
          accessTokenExpiresAt: Date.now() + 60_000,
          credentialVersion: 1,
        },
      ],
    });

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    expect(ctx.db.rows('providerRevocationCredentials')).toEqual([
      expect.objectContaining({ _id: 'credential_other', userId: 'u_other' }),
    ]);
    expect(ctx.db.rows('providerRevocationJobs')).toEqual([]);
    expect(ctx.db.rows('users').map((user) => user._id)).toEqual(['u_other']);
  });

  test('deletes only the authenticated user personal graph', async () => {
    const ctx = buildCtx({
      users: [
        {
          _id: 'u_customer',
          email: 'customer@example.com',
          externalId: 'auth|u_customer',
        },
        {
          _id: 'u_other',
          email: 'other@example.com',
          externalId: 'auth|u_other',
        },
      ],
      businesses: [{ _id: 'b_keep', ownerUserId: 'u_other', name: 'Keep' }],
      businessStaff: [
        {
          _id: 'staff_owner',
          businessId: 'b_keep',
          userId: 'u_other',
          staffRole: 'owner',
          status: 'active',
        },
        {
          _id: 'staff_customer',
          businessId: 'b_keep',
          userId: 'u_customer',
          staffRole: 'staff',
          status: 'active',
        },
      ],
      memberships: [
        { _id: 'm_customer', userId: 'u_customer', businessId: 'b_keep' },
        { _id: 'm_other', userId: 'u_other', businessId: 'b_keep' },
      ],
      businessOnboardingDrafts: [
        { _id: 'draft_customer', userId: 'u_customer' },
        { _id: 'draft_other', userId: 'u_other' },
      ],
      customerReferralLinks: [
        {
          _id: 'crl_customer',
          businessId: 'b_keep',
          referrerUserId: 'u_customer',
        },
        { _id: 'crl_other', businessId: 'b_keep', referrerUserId: 'u_other' },
      ],
      customerReferrals: [
        {
          _id: 'cr_customer',
          linkId: 'crl_customer',
          businessId: 'b_keep',
          referrerUserId: 'u_customer',
          referredUserId: 'u_other',
        },
        {
          _id: 'cr_referred',
          linkId: 'crl_other',
          businessId: 'b_keep',
          referrerUserId: 'u_other',
          referredUserId: 'u_customer',
        },
        {
          _id: 'cr_other',
          linkId: 'crl_other',
          businessId: 'b_keep',
          referrerUserId: 'u_other',
          referredUserId: 'u_someone',
        },
      ],
      referralRewards: [
        {
          _id: 'rr_customer',
          customerReferralId: 'cr_customer',
          recipientUserId: 'u_customer',
        },
        {
          _id: 'rr_referred',
          customerReferralId: 'cr_referred',
          recipientUserId: 'u_other',
        },
        {
          _id: 'rr_other',
          customerReferralId: 'cr_other',
          recipientUserId: 'u_other',
        },
      ],
      businessReferralLinks: [
        {
          _id: 'brl_customer',
          businessId: 'b_keep',
          createdByUserId: 'u_customer',
        },
        { _id: 'brl_other', businessId: 'b_keep', createdByUserId: 'u_other' },
      ],
      businessReferrals: [
        {
          _id: 'br_customer',
          businessId: 'b_keep',
          businessReferralLinkId: 'brl_customer',
          createdByUserId: 'u_customer',
        },
        {
          _id: 'br_other',
          businessId: 'b_keep',
          businessReferralLinkId: 'brl_other',
          createdByUserId: 'u_other',
        },
      ],
      events: [
        {
          _id: 'event_customer',
          actorUserId: 'u_customer',
          customerUserId: 'u_other',
        },
        {
          _id: 'event_other',
          actorUserId: 'u_other',
          customerUserId: 'u_other',
        },
        {
          _id: 'event_deleted_customer',
          actorUserId: 'u_other',
          customerUserId: 'u_customer',
        },
      ],
      scanSessions: [
        {
          _id: 'scan_customer',
          customerId: 'u_customer',
          actorUserId: 'u_other',
        },
        {
          _id: 'scan_actor',
          customerId: 'u_other',
          actorUserId: 'u_customer',
        },
        { _id: 'scan_other', customerId: 'u_other', actorUserId: 'u_other' },
      ],
      supportRequests: [
        { _id: 'support_customer', userId: 'u_customer' },
        { _id: 'support_other', userId: 'u_other' },
      ],
      pushTokens: [
        { _id: 'push_customer', userId: 'u_customer' },
        { _id: 'push_other', userId: 'u_other' },
      ],
      messageLog: [
        { _id: 'msg_customer', toUserId: 'u_customer' },
        { _id: 'msg_other', toUserId: 'u_other' },
      ],
      authAccounts: [{ _id: 'acct_customer', userId: 'u_customer' }],
      authSessions: [{ _id: 'sess_customer', userId: 'u_customer' }],
      authRefreshTokens: [
        { _id: 'refresh_customer', sessionId: 'sess_customer' },
      ],
      authVerificationCodes: [
        { _id: 'verify_customer', accountId: 'acct_customer' },
      ],
      authVerifiers: [{ _id: 'verifier_customer', sessionId: 'sess_customer' }],
      emailOtps: [{ _id: 'otp_customer', email: 'customer@example.com' }],
      businessDeletionJobs: [
        {
          _id: 'completed_deletion_job',
          businessId: 'b_already_deleted',
          requestedByUserId: 'u_customer',
          status: 'completed',
        },
      ],
      businessDeletionRecipients: [
        {
          _id: 'completed_deletion_recipient',
          jobId: 'completed_deletion_job',
          userId: 'u_customer',
        },
      ],
    });

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    expect(result.deletedBusinessIds).toEqual([]);
    expect(ctx.db.rows('users').map((doc) => doc._id)).toEqual(['u_other']);
    expect(ctx.db.rows('businesses').map((doc) => doc._id)).toEqual(['b_keep']);
    expect(ctx.db.rows('businessStaff').map((doc) => doc._id)).toEqual([
      'staff_owner',
    ]);
    expect(ctx.db.rows('memberships').map((doc) => doc._id)).toEqual([
      'm_other',
    ]);
    expect(
      ctx.db.rows('businessOnboardingDrafts').map((doc) => doc._id)
    ).toEqual(['draft_other']);
    expect(
      ctx.db
        .rows('customerReferralLinks')
        .map((doc) => [doc._id, doc.referrerUserId])
    ).toEqual([
      ['crl_customer', undefined],
      ['crl_other', 'u_other'],
    ]);
    expect(
      ctx.db
        .rows('customerReferrals')
        .map((doc) => [doc._id, doc.referrerUserId, doc.referredUserId])
    ).toEqual([
      ['cr_customer', undefined, 'u_other'],
      ['cr_referred', 'u_other', undefined],
      ['cr_other', 'u_other', 'u_someone'],
    ]);
    expect(ctx.db.rows('referralRewards').map((doc) => doc._id)).toEqual([
      'rr_referred',
      'rr_other',
    ]);
    expect(
      ctx.db
        .rows('businessReferralLinks')
        .map((doc) => [doc._id, doc.createdByUserId])
    ).toEqual([
      ['brl_customer', undefined],
      ['brl_other', 'u_other'],
    ]);
    expect(
      ctx.db
        .rows('businessReferrals')
        .map((doc) => [doc._id, doc.createdByUserId])
    ).toEqual([
      ['br_customer', undefined],
      ['br_other', 'u_other'],
    ]);
    expect(
      ctx.db
        .rows('events')
        .map((doc) => [doc._id, doc.actorUserId, doc.customerUserId])
    ).toEqual([
      ['event_customer', undefined, 'u_other'],
      ['event_other', 'u_other', 'u_other'],
      ['event_deleted_customer', 'u_other', undefined],
    ]);
    expect(
      ctx.db
        .rows('scanSessions')
        .map((doc) => [doc._id, doc.customerId, doc.actorUserId])
    ).toEqual([
      ['scan_customer', undefined, 'u_other'],
      ['scan_actor', 'u_other', undefined],
      ['scan_other', 'u_other', 'u_other'],
    ]);
    expect(ctx.db.rows('supportRequests').map((doc) => doc._id)).toEqual([
      'support_other',
    ]);
    expect(ctx.db.rows('pushTokens').map((doc) => doc._id)).toEqual([
      'push_other',
    ]);
    expect(ctx.db.rows('messageLog').map((doc) => doc._id)).toEqual([
      'msg_other',
    ]);
    expect(ctx.db.rows('authAccounts')).toEqual([]);
    expect(ctx.db.rows('authSessions')).toEqual([]);
    expect(ctx.db.rows('authRefreshTokens')).toEqual([]);
    expect(ctx.db.rows('authVerificationCodes')).toEqual([]);
    expect(ctx.db.rows('authVerifiers')).toEqual([]);
    expect(ctx.db.rows('emailOtps')).toEqual([]);
    expect(ctx.db.rows('businessDeletionJobs')).toEqual([]);
    expect(ctx.db.rows('businessDeletionRecipients')).toEqual([]);
  });

  test('blocks deletion for the sole active business owner without deleting data', async () => {
    const ctx = buildCtx(
      {
        users: [
          {
            _id: 'u_owner',
            email: 'owner@example.com',
            externalId: 'auth|u_owner',
          },
        ],
        businesses: [{ _id: 'b_owned', ownerUserId: 'u_owner', name: 'Owned' }],
        businessStaff: [
          {
            _id: 'staff_owner',
            businessId: 'b_owned',
            userId: 'u_owner',
            staffRole: 'owner',
            status: 'active',
          },
        ],
        memberships: [
          { _id: 'm_owner', userId: 'u_owner', businessId: 'b_owned' },
        ],
        authAccounts: [{ _id: 'acct_owner', userId: 'u_owner' }],
        businessDeletionJobs: [
          {
            _id: 'incomplete_deletion_job',
            businessId: 'b_owned',
            requestedByUserId: 'u_owner',
            status: 'running',
          },
        ],
      },
      'u_owner'
    );

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'SOLE_OWNER_BUSINESS_BLOCKED',
      blockedBusinessIds: ['b_owned'],
    });
    expect(ctx.db.rows('users').map((doc) => doc._id)).toEqual(['u_owner']);
    expect(ctx.db.rows('businesses').map((doc) => doc._id)).toEqual([
      'b_owned',
    ]);
    expect(ctx.db.rows('businessStaff').map((doc) => doc._id)).toEqual([
      'staff_owner',
    ]);
    expect(ctx.db.rows('memberships').map((doc) => doc._id)).toEqual([
      'm_owner',
    ]);
    expect(ctx.db.rows('authAccounts').map((doc) => doc._id)).toEqual([
      'acct_owner',
    ]);
    expect(ctx.db.rows('businessDeletionJobs')).toHaveLength(1);
    expect(ctx.db.deleted).toEqual([]);
  });

  test('blocks deletion for a closed business without another active owner', async () => {
    const ctx = buildCtx(
      {
        users: [
          {
            _id: 'u_owner',
            email: 'owner@example.com',
            externalId: 'auth|u_owner',
            isActive: true,
          },
          {
            _id: 'u_manager',
            email: 'manager@example.com',
            externalId: 'auth|u_manager',
            isActive: true,
          },
          {
            _id: 'u_staff',
            email: 'staff@example.com',
            externalId: 'auth|u_staff',
            isActive: true,
          },
        ],
        businesses: [
          {
            _id: 'b_closed',
            ownerUserId: 'u_owner',
            name: 'Closed business',
            isActive: false,
            closedAt: 300,
            lastClosedAt: 300,
            lastRestoredAt: 200,
          },
        ],
        businessStaff: [
          {
            _id: 'staff_owner',
            businessId: 'b_closed',
            userId: 'u_owner',
            staffRole: 'owner',
            status: 'active',
          },
          {
            _id: 'staff_manager',
            businessId: 'b_closed',
            userId: 'u_manager',
            staffRole: 'manager',
            status: 'active',
          },
          {
            _id: 'staff_member',
            businessId: 'b_closed',
            userId: 'u_staff',
            staffRole: 'staff',
            status: 'active',
          },
        ],
        memberships: [
          { _id: 'm_owner', userId: 'u_owner', businessId: 'b_closed' },
        ],
        authAccounts: [{ _id: 'acct_owner', userId: 'u_owner' }],
      },
      'u_owner'
    );

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'SOLE_OWNER_BUSINESS_BLOCKED',
      message:
        'לא ניתן למחוק את החשבון כל עוד קיים עסק בבעלותך ללא בעלים חלופי. ההגבלה חלה גם על עסק סגור, משום שנתוני העסק נשמרים לצורך שחזור.',
      blockedBusinessIds: ['b_closed'],
    });
    expect(ctx.db.rows('businesses')).toEqual([
      {
        _id: 'b_closed',
        ownerUserId: 'u_owner',
        name: 'Closed business',
        isActive: false,
        closedAt: 300,
        lastClosedAt: 300,
        lastRestoredAt: 200,
      },
    ]);
    expect(
      ctx.db
        .rows('users')
        .map((row) => row._id)
        .sort()
    ).toEqual(['u_manager', 'u_owner', 'u_staff']);
    expect(
      ctx.db
        .rows('businessStaff')
        .map((row) => row._id)
        .sort()
    ).toEqual(['staff_manager', 'staff_member', 'staff_owner']);
    expect(ctx.db.rows('memberships').map((row) => row._id)).toEqual([
      'm_owner',
    ]);
    expect(ctx.db.rows('authAccounts').map((row) => row._id)).toEqual([
      'acct_owner',
    ]);
    expect(ctx.db.deleted).toEqual([]);
  });

  test('allows an owner to delete their account and deterministically reassigns to another active owner', async () => {
    const ctx = buildCtx(
      {
        users: [
          {
            _id: 'u_owner',
            email: 'owner@example.com',
            externalId: 'auth|u_owner',
            isActive: true,
          },
          {
            _id: 'u_other_owner',
            email: 'other-owner@example.com',
            externalId: 'auth|u_other_owner',
            isActive: true,
          },
          {
            _id: 'u_late_owner',
            email: 'late-owner@example.com',
            externalId: 'auth|u_late_owner',
            isActive: true,
          },
          {
            _id: 'u_tie_owner',
            email: 'tie-owner@example.com',
            externalId: 'auth|u_tie_owner',
            isActive: true,
          },
          {
            _id: 'u_inactive_owner',
            email: 'inactive-owner@example.com',
            externalId: 'auth|u_inactive_owner',
            isActive: false,
          },
          {
            _id: 'u_customer',
            email: 'customer@example.com',
            externalId: 'auth|u_customer',
            isActive: true,
          },
        ],
        businesses: [{ _id: 'b_owned', ownerUserId: 'u_owner', name: 'Owned' }],
        businessStaff: [
          {
            _id: 'staff_owner',
            businessId: 'b_owned',
            userId: 'u_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 100,
          },
          {
            _id: 'staff_other_owner',
            businessId: 'b_owned',
            userId: 'u_other_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 20,
          },
          {
            _id: 'staff_late_owner',
            businessId: 'b_owned',
            userId: 'u_late_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 40,
          },
          {
            _id: 'staff_tie_owner',
            businessId: 'b_owned',
            userId: 'u_tie_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 20,
          },
          {
            _id: 'staff_inactive_owner',
            businessId: 'b_owned',
            userId: 'u_inactive_owner',
            staffRole: 'owner',
            status: 'inactive',
            createdAt: 1,
          },
          {
            _id: 'staff_customer',
            businessId: 'b_owned',
            userId: 'u_customer',
            staffRole: 'staff',
            status: 'active',
          },
        ],
        loyaltyPrograms: [{ _id: 'lp_keep', businessId: 'b_owned' }],
        campaigns: [{ _id: 'campaign_keep', businessId: 'b_owned' }],
        subscriptions: [{ _id: 'sub_keep', businessId: 'b_owned' }],
        apiClients: [{ _id: 'api_client_keep', businessId: 'b_owned' }],
        apiKeys: [{ _id: 'api_key_keep', businessId: 'b_owned' }],
        memberships: [
          { _id: 'm_owner', userId: 'u_owner', businessId: 'b_owned' },
          { _id: 'm_customer', userId: 'u_customer', businessId: 'b_owned' },
        ],
        scanSessions: [
          {
            _id: 'scan_owner',
            customerId: 'u_owner',
            actorUserId: 'u_customer',
          },
        ],
        authAccounts: [{ _id: 'acct_owner', userId: 'u_owner' }],
      },
      'u_owner'
    );

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    expect(result.deletedBusinessIds).toEqual([]);
    expect(
      ctx.db
        .rows('users')
        .map((doc) => doc._id)
        .sort()
    ).toEqual([
      'u_customer',
      'u_inactive_owner',
      'u_late_owner',
      'u_other_owner',
      'u_tie_owner',
    ]);
    expect(ctx.db.rows('businesses')).toHaveLength(1);
    expect(ctx.db.rows('businesses')[0].ownerUserId).toBe('u_other_owner');
    expect(
      ctx.db
        .rows('businessStaff')
        .map((doc) => doc._id)
        .sort()
    ).toEqual([
      'staff_customer',
      'staff_inactive_owner',
      'staff_late_owner',
      'staff_other_owner',
      'staff_tie_owner',
    ]);
    expect(ctx.db.rows('loyaltyPrograms').map((doc) => doc._id)).toEqual([
      'lp_keep',
    ]);
    expect(ctx.db.rows('campaigns').map((doc) => doc._id)).toEqual([
      'campaign_keep',
    ]);
    expect(ctx.db.rows('subscriptions').map((doc) => doc._id)).toEqual([
      'sub_keep',
    ]);
    expect(ctx.db.rows('apiClients').map((doc) => doc._id)).toEqual([
      'api_client_keep',
    ]);
    expect(ctx.db.rows('apiKeys').map((doc) => doc._id)).toEqual([
      'api_key_keep',
    ]);
    expect(ctx.db.rows('memberships').map((doc) => doc._id)).toEqual([
      'm_customer',
    ]);
    expect(ctx.db.rows('scanSessions')).toEqual([
      {
        _id: 'scan_owner',
        customerId: undefined,
        actorUserId: 'u_customer',
      },
    ]);
    expect(ctx.db.rows('authAccounts')).toEqual([]);
  });

  test('keeps a closed business closed when reassigning it to another active owner', async () => {
    const ctx = buildCtx(
      {
        users: [
          {
            _id: 'u_owner',
            email: 'owner@example.com',
            externalId: 'auth|u_owner',
            isActive: true,
          },
          {
            _id: 'u_other_owner',
            email: 'other-owner@example.com',
            externalId: 'auth|u_other_owner',
            isActive: true,
          },
          {
            _id: 'u_manager',
            email: 'manager@example.com',
            externalId: 'auth|u_manager',
            isActive: true,
          },
        ],
        businesses: [
          {
            _id: 'b_closed',
            ownerUserId: 'u_owner',
            name: 'Closed business',
            isActive: false,
            closedAt: 500,
            lastClosedAt: 500,
            lastRestoredAt: 400,
          },
        ],
        businessStaff: [
          {
            _id: 'staff_owner',
            businessId: 'b_closed',
            userId: 'u_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 10,
          },
          {
            _id: 'staff_other_owner',
            businessId: 'b_closed',
            userId: 'u_other_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 20,
          },
          {
            _id: 'staff_manager',
            businessId: 'b_closed',
            userId: 'u_manager',
            staffRole: 'manager',
            status: 'active',
            createdAt: 1,
          },
        ],
        loyaltyPrograms: [{ _id: 'lp_keep', businessId: 'b_closed' }],
        memberships: [
          { _id: 'm_owner', userId: 'u_owner', businessId: 'b_closed' },
          {
            _id: 'm_other_owner',
            userId: 'u_other_owner',
            businessId: 'b_closed',
          },
        ],
        authAccounts: [{ _id: 'acct_owner', userId: 'u_owner' }],
      },
      'u_owner'
    );

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    expect(result.deletedBusinessIds).toEqual([]);
    expect(ctx.db.rows('businesses')).toHaveLength(1);
    expect(ctx.db.rows('businesses')[0]).toMatchObject({
      _id: 'b_closed',
      ownerUserId: 'u_other_owner',
      name: 'Closed business',
      isActive: false,
      closedAt: 500,
      lastClosedAt: 500,
      lastRestoredAt: 400,
    });
    expect(ctx.db.rows('users').map((row) => row._id).sort()).toEqual([
      'u_manager',
      'u_other_owner',
    ]);
    expect(
      ctx.db
        .rows('businessStaff')
        .map((row) => row._id)
        .sort()
    ).toEqual(['staff_manager', 'staff_other_owner']);
    expect(ctx.db.rows('loyaltyPrograms').map((row) => row._id)).toEqual([
      'lp_keep',
    ]);
    expect(ctx.db.rows('memberships').map((row) => row._id)).toEqual([
      'm_other_owner',
    ]);
    expect(ctx.db.rows('authAccounts')).toEqual([]);
  });

  test('skips missing and inactive owner users before selecting a later valid owner', async () => {
    const ctx = buildCtx(
      {
        users: [
          {
            _id: 'u_owner',
            email: 'owner@example.com',
            externalId: 'auth|u_owner',
            isActive: true,
          },
          {
            _id: 'u_inactive_owner',
            email: 'inactive-owner@example.com',
            externalId: 'auth|u_inactive_owner',
            isActive: false,
          },
          {
            _id: 'u_valid_owner',
            email: 'valid-owner@example.com',
            externalId: 'auth|u_valid_owner',
            isActive: true,
          },
        ],
        businesses: [{ _id: 'b_owned', ownerUserId: 'u_owner', name: 'Owned' }],
        businessStaff: [
          {
            _id: 'staff_owner',
            businessId: 'b_owned',
            userId: 'u_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 1,
          },
          {
            _id: 'staff_missing_owner',
            businessId: 'b_owned',
            userId: 'u_missing_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 2,
          },
          {
            _id: 'staff_inactive_owner',
            businessId: 'b_owned',
            userId: 'u_inactive_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 3,
          },
          {
            _id: 'staff_valid_owner',
            businessId: 'b_owned',
            userId: 'u_valid_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 4,
          },
        ],
      },
      'u_owner'
    );

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    expect(ctx.db.rows('businesses')[0].ownerUserId).toBe('u_valid_owner');
    expect(
      ctx.db
        .rows('businessStaff')
        .map((row) => row._id)
        .sort()
    ).toEqual([
      'staff_inactive_owner',
      'staff_missing_owner',
      'staff_valid_owner',
    ]);
  });

  test('blocks deletion before mutation when all replacement owner users are invalid', async () => {
    const ctx = buildCtx(
      {
        users: [
          {
            _id: 'u_owner',
            email: 'owner@example.com',
            externalId: 'auth|u_owner',
            isActive: true,
          },
          {
            _id: 'u_inactive_owner',
            email: 'inactive-owner@example.com',
            externalId: 'auth|u_inactive_owner',
            isActive: false,
          },
        ],
        businesses: [{ _id: 'b_owned', ownerUserId: 'u_owner', name: 'Owned' }],
        businessStaff: [
          {
            _id: 'staff_owner',
            businessId: 'b_owned',
            userId: 'u_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 1,
          },
          {
            _id: 'staff_missing_owner',
            businessId: 'b_owned',
            userId: 'u_missing_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 2,
          },
          {
            _id: 'staff_inactive_owner',
            businessId: 'b_owned',
            userId: 'u_inactive_owner',
            staffRole: 'owner',
            status: 'active',
            createdAt: 3,
          },
        ],
        memberships: [
          { _id: 'm_owner', userId: 'u_owner', businessId: 'b_owned' },
        ],
      },
      'u_owner'
    );

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'SOLE_OWNER_BUSINESS_BLOCKED',
      blockedBusinessIds: ['b_owned'],
    });
    expect(ctx.db.rows('businesses')[0].ownerUserId).toBe('u_owner');
    expect(
      ctx.db
        .rows('users')
        .map((row) => row._id)
        .sort()
    ).toEqual(['u_inactive_owner', 'u_owner']);
    expect(
      ctx.db
        .rows('businessStaff')
        .map((row) => row._id)
        .sort()
    ).toEqual(['staff_inactive_owner', 'staff_missing_owner', 'staff_owner']);
    expect(ctx.db.rows('memberships').map((row) => row._id)).toEqual([
      'm_owner',
    ]);
    expect(ctx.db.deleted).toEqual([]);
  });

  test('dirties every surviving affected business and removes only actor-owned recommendation state', async () => {
    const ctx = buildCtx({
      users: [
        { _id: 'u_customer', email: 'customer@example.com', isActive: true },
        { _id: 'u_owner', email: 'owner@example.com', isActive: true },
      ],
      businesses: [
        {
          _id: 'b_keep',
          ownerUserId: 'u_owner',
          isActive: true,
          name: 'Keep',
        },
      ],
      businessStaff: [
        {
          _id: 'staff_owner',
          businessId: 'b_keep',
          userId: 'u_owner',
          staffRole: 'owner',
          status: 'active',
        },
        {
          _id: 'staff_customer',
          businessId: 'b_keep',
          userId: 'u_customer',
          staffRole: 'staff',
          status: 'active',
        },
      ],
      memberships: [
        {
          _id: 'membership_customer',
          businessId: 'b_keep',
          userId: 'u_customer',
        },
      ],
      events: [
        {
          _id: 'event_customer',
          businessId: 'b_keep',
          customerUserId: 'u_customer',
          type: 'STAMP_ADDED',
          createdAt: Date.now(),
        },
      ],
      recommendationInteractions: [
        {
          _id: 'interaction_deleted_actor',
          actorUserId: 'u_customer',
          businessId: 'b_keep',
        },
        {
          _id: 'interaction_owner',
          actorUserId: 'u_owner',
          businessId: 'b_keep',
        },
      ],
      recommendationGuideSessions: [
        {
          _id: 'guide_deleted_actor',
          actorUserId: 'u_customer',
          businessId: 'b_keep',
        },
        {
          _id: 'guide_owner',
          actorUserId: 'u_owner',
          businessId: 'b_keep',
        },
      ],
      smartManagerFactSnapshots: [
        { _id: 'snapshot_keep', businessId: 'b_keep', factHash: 'old' },
      ],
    });

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    expect(ctx.db.rows('recommendationInteractions').map((row) => row._id)).toEqual([
      'interaction_owner',
    ]);
    expect(ctx.db.rows('recommendationGuideSessions').map((row) => row._id)).toEqual([
      'guide_owner',
    ]);
    expect(ctx.db.rows('smartManagerFactSnapshots')).toHaveLength(1);
    expect(ctx.db.rows('smartManagerEvaluationStates')[0]).toMatchObject({
      businessId: 'b_keep',
      dirtyDomains: ['events', 'memberships', 'team'],
      dirtyReasons: ['user_account_deleted'],
    });
  });

  test('redacts Smart Manager actors while preserving surviving business action evidence and copy', async () => {
    const ctx = buildCtx({
      users: [
        { _id: 'u_customer', email: 'customer@example.com', isActive: true },
        { _id: 'u_owner', email: 'owner@example.com', isActive: true },
      ],
      businesses: [
        {
          _id: 'b_keep',
          ownerUserId: 'u_owner',
          isActive: true,
          name: 'Keep',
        },
      ],
      businessStaff: [
        {
          _id: 'staff_owner',
          businessId: 'b_keep',
          userId: 'u_owner',
          staffRole: 'owner',
          status: 'active',
        },
        {
          _id: 'staff_deleted',
          businessId: 'b_keep',
          userId: 'u_customer',
          staffRole: 'manager',
          status: 'active',
        },
      ],
      smartManagerPreparedActions: [
        {
          _id: 'prepared_1',
          businessId: 'b_keep',
          preparedByUserId: 'u_customer',
          generationActorUserId: 'u_customer',
          generationState: 'queued',
          generationRequestToken: 'request_token',
          generationRequestBindingHash: 'request_binding',
          generationRequestKind: 'explicit_regeneration',
          generationReservedCopyRevision: 2,
          selectedCopyId: 'copy_1',
          selectedCopyRevision: 1,
          decisionHash: 'decision_hash',
          evidenceFingerprint: 'decision_evidence',
          factHash: 'fact_hash',
          state: 'reviewable',
          updatedAt: 1,
        },
      ],
      smartManagerPreparedActionCopies: [
        {
          _id: 'copy_1',
          preparedActionId: 'prepared_1',
          businessId: 'b_keep',
          revision: 1,
          title: 'immutable title',
          body: 'immutable body',
          contentHash: 'immutable_hash',
        },
      ],
      smartManagerAuditEvents: [
        {
          _id: 'audit_deleted_actor',
          businessId: 'b_keep',
          preparedActionId: 'prepared_1',
          actorUserId: 'u_customer',
          eventType: 'prepared_action_created',
        },
        {
          _id: 'audit_owner',
          businessId: 'b_keep',
          preparedActionId: 'prepared_1',
          actorUserId: 'u_owner',
          eventType: 'prepared_copy_selected',
        },
      ],
    });
    const copyBefore = clone(ctx.db.rows('smartManagerPreparedActionCopies')[0]);

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    expect(ctx.db.rows('businesses')).toHaveLength(1);
    expect(ctx.db.rows('smartManagerPreparedActions')).toHaveLength(1);
    expect(ctx.db.rows('smartManagerPreparedActions')[0]).toMatchObject({
      _id: 'prepared_1',
      preparedByUserId: undefined,
      generationActorUserId: undefined,
      generationState: 'stale_discarded',
      generationFailureCode: 'ACTION_STALE',
      selectedCopyId: 'copy_1',
      selectedCopyRevision: 1,
      decisionHash: 'decision_hash',
      evidenceFingerprint: 'decision_evidence',
      factHash: 'fact_hash',
      state: 'reviewable',
    });
    expect(ctx.db.rows('smartManagerPreparedActionCopies')[0]).toEqual(
      copyBefore
    );
    expect(ctx.db.rows('smartManagerAuditEvents')).toEqual([
      expect.objectContaining({
        _id: 'audit_deleted_actor',
        actorUserId: undefined,
      }),
      expect.objectContaining({
        _id: 'audit_owner',
        actorUserId: 'u_owner',
      }),
    ]);
  });

  test('does not pre-collect a customer event history during account deletion', async () => {
    const source = readFileSync('convex/users.ts', 'utf8');
    const impl = source.slice(
      source.indexOf('export async function deleteMyAccountHardImpl'),
      source.indexOf('export const deleteMyAccountHard')
    );
    expect(impl).not.toContain('.collect()');
    expect(impl).not.toMatch(/query\('events'\)/);
    expect(impl).not.toContain('by_customerUserId');

    const events = Array.from({ length: 250 }, (_, index) => ({
      _id: `event_customer_${index}`,
      businessId: 'b_keep',
      customerUserId: 'u_customer',
      type: 'STAMP_ADDED',
      createdAt: Date.now() - index,
    }));
    const ctx = buildCtx({
      users: [
        {
          _id: 'u_customer',
          email: 'customer@example.com',
          isActive: true,
        },
        {
          _id: 'u_owner',
          email: 'owner@example.com',
          isActive: true,
        },
      ],
      businesses: [
        {
          _id: 'b_keep',
          ownerUserId: 'u_owner',
          isActive: true,
          name: 'Keep',
        },
      ],
      businessStaff: [
        {
          _id: 'staff_owner',
          businessId: 'b_keep',
          userId: 'u_owner',
          staffRole: 'owner',
          status: 'active',
        },
      ],
      events,
    });

    const result = await deleteMyAccountHardImpl(ctx);

    expect(result.success).toBe(true);
    expect(ctx.db.collectCalls.filter((table) => table === 'events')).toEqual(
      []
    );
    expect(
      ctx.db.takeCalls.some(
        (call) => call.tableName === 'events' && call.n <= 100
      )
    ).toBe(true);
    expect(
      ctx.db.rows('events').every((row) => row.customerUserId === undefined)
    ).toBe(true);
    expect(ctx.db.rows('smartManagerEvaluationStates')[0]).toMatchObject({
      businessId: 'b_keep',
      dirtyDomains: ['events'],
      dirtyReasons: ['user_account_deleted'],
    });
  });
});
