import { describe, expect, test } from 'bun:test';

import { deleteMyAccountHardImpl } from '../users';

const clone = (value) => JSON.parse(JSON.stringify(value));

class FakeQuery {
  constructor(docs) {
    this.docs = docs;
  }

  withIndex(_name, builder) {
    if (!builder) {
      return new FakeQuery(this.docs);
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
      this.docs.filter((doc) => predicates.every((predicate) => predicate(doc)))
    );
  }

  filter() {
    return new FakeQuery(this.docs);
  }

  order() {
    return this;
  }

  async collect() {
    return this.docs;
  }

  async take(n) {
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
  }

  query(table) {
    return new FakeQuery(this.tables[table] ?? []);
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

  rows(table) {
    return this.tables[table] ?? [];
  }
}

function buildCtx(tables, userId = 'u_customer') {
  const db = new FakeDb(tables);
  return {
    db,
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
});
