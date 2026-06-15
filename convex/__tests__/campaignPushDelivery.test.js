import { afterEach, describe, expect, test } from 'bun:test';

import { sendCampaignNow } from '../campaigns';
import {
  processReferralAfterJoin,
  qualifyCustomerReferralAfterStamp,
} from '../referrals';

const BUSINESS_ID = 'biz_push_campaign';
const CAMPAIGN_ID = 'campaign_push_1';
const OWNER_ID = 'user_owner';
const CUSTOMER_ID = 'user_customer';
const REFERRER_ID = 'user_referrer';
const PROGRAM_ID = 'program_1';
const MEMBERSHIP_ID = 'membership_1';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

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
    const q = {
      field: (fieldName) => ({ __field: fieldName }),
      eq: (left, right) => ({ op: 'eq', left, right }),
      neq: (left, right) => ({ op: 'neq', left, right }),
      and: (...conditions) => ({ op: 'and', conditions }),
    };
    const predicate = this.buildPredicate(builder(q));
    if (predicate) {
      this.predicates.push(predicate);
    }
    return this;
  }

  buildPredicate(expression) {
    if (
      expression?.op === 'eq' &&
      expression.left &&
      typeof expression.left.__field === 'string'
    ) {
      return (doc) => doc[expression.left.__field] === expression.right;
    }
    if (
      expression?.op === 'neq' &&
      expression.left &&
      typeof expression.left.__field === 'string'
    ) {
      return (doc) => doc[expression.left.__field] !== expression.right;
    }
    if (expression?.op === 'and' && Array.isArray(expression.conditions)) {
      const predicates = expression.conditions
        .map((condition) => this.buildPredicate(condition))
        .filter(Boolean);
      return (doc) => predicates.every((predicate) => predicate(doc));
    }
    return null;
  }

  docs() {
    return this.db
      .rows(this.tableName)
      .filter((doc) => this.predicates.every((predicate) => predicate(doc)));
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

function buildCtx(tables, currentUserId = OWNER_ID) {
  return {
    db: new FakeDb(tables),
    auth: {
      getUserIdentity: async () => ({ subject: `${currentUserId}|session` }),
    },
  };
}

function baseTables({ campaignChannels = ['in_app', 'push'] } = {}) {
  const now = Date.now();
  return {
    users: [
      {
        _id: OWNER_ID,
        isActive: true,
        fullName: 'Owner',
        email: 'owner@stampix.test',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: CUSTOMER_ID,
        isActive: true,
        marketingOptIn: true,
        fullName: 'Customer',
        email: 'customer@stampix.test',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: REFERRER_ID,
        isActive: true,
        fullName: 'Referrer',
        email: 'referrer@stampix.test',
        createdAt: now,
        updatedAt: now,
      },
    ],
    businesses: [
      {
        _id: BUSINESS_ID,
        ownerUserId: OWNER_ID,
        externalId: 'biz_ext_push',
        name: 'Push Biz',
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
        _id: 'staff_owner',
        businessId: BUSINESS_ID,
        userId: OWNER_ID,
        staffRole: 'owner',
        status: 'active',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    loyaltyPrograms: [
      {
        _id: PROGRAM_ID,
        businessId: BUSINESS_ID,
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
    memberships: [
      {
        _id: MEMBERSHIP_ID,
        userId: CUSTOMER_ID,
        businessId: BUSINESS_ID,
        programId: PROGRAM_ID,
        currentStamps: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    campaigns: [
      {
        _id: CAMPAIGN_ID,
        businessId: BUSINESS_ID,
        type: 'promo',
        title: 'Campaign',
        messageTitle: 'Campaign title',
        messageBody: 'Campaign body',
        rules: { audience: 'all_active_members' },
        channels: campaignChannels,
        status: 'draft',
        activationStatus: 'draft',
        automationEnabled: false,
        schedule: { mode: 'send_now' },
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    referralConfigs: [
      {
        _id: 'ref_cfg',
        businessId: BUSINESS_ID,
        isEnabled: true,
        configVersion: 1,
        rewardType: 'STAMP',
        rewardValue: 1,
        rewardRecipients: 'referred',
        monthlyLimit: 10,
        createdByUserId: OWNER_ID,
        updatedByUserId: OWNER_ID,
        createdAt: now,
        updatedAt: now,
      },
    ],
    customerReferralLinks: [
      {
        _id: 'ref_link',
        code: 'PUSHREF1',
        businessId: BUSINESS_ID,
        referrerUserId: REFERRER_ID,
        originProgramId: PROGRAM_ID,
        membershipId: MEMBERSHIP_ID,
        shareSurface: 'card_screen',
        status: 'active',
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
        openCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    customerReferrals: [],
    referralRewards: [],
    events: [],
    messageLog: [],
    pushTokens: [
      {
        _id: 'push_customer',
        userId: CUSTOMER_ID,
        token: 'ExponentPushToken[customer]',
        platform: 'ios',
        isActive: true,
        createdAt: now,
        updatedAt: now,
        lastRegisteredAt: now,
      },
      {
        _id: 'push_referrer',
        userId: REFERRER_ID,
        token: 'ExponentPushToken[referrer]',
        platform: 'ios',
        isActive: true,
        createdAt: now,
        updatedAt: now,
        lastRegisteredAt: now,
      },
    ],
    pushDeliveryLog: [],
    campaignRuns: [],
    aiUsageLedger: [],
    subscriptions: [],
  };
}

describe('campaign push delivery', () => {
  test('push-channel campaign creates inbox log and attempts push delivery', async () => {
    const tables = baseTables();
    const ctx = buildCtx(tables);
    let sentPayload = null;
    globalThis.fetch = async (_url, init) => {
      sentPayload = JSON.parse(init.body);
      return new Response(JSON.stringify({ data: [{ status: 'ok' }] }), {
        status: 200,
      });
    };

    const result = await sendCampaignNow._handler(ctx, {
      businessId: BUSINESS_ID,
      campaignId: CAMPAIGN_ID,
    });

    expect(result.sentCount).toBe(1);
    expect(ctx.db.rows('messageLog')).toContainEqual(
      expect.objectContaining({
        businessId: BUSINESS_ID,
        campaignId: CAMPAIGN_ID,
        toUserId: CUSTOMER_ID,
        channel: 'in_app',
        status: 'sent',
      })
    );
    expect(sentPayload).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[customer]',
        title: 'Campaign title',
        body: 'Campaign body',
        channelId: 'default',
      }),
    ]);
    expect(ctx.db.rows('pushDeliveryLog')).toContainEqual(
      expect.objectContaining({
        businessId: BUSINESS_ID,
        campaignId: CAMPAIGN_ID,
        toUserId: CUSTOMER_ID,
        token: 'ExponentPushToken[customer]',
        status: 'sent',
      })
    );
  });

  test('push failure does not fail campaign send or inbox delivery', async () => {
    const tables = baseTables();
    const ctx = buildCtx(tables);
    globalThis.fetch = async () => {
      throw new Error('expo temporarily unavailable');
    };

    const result = await sendCampaignNow._handler(ctx, {
      businessId: BUSINESS_ID,
      campaignId: CAMPAIGN_ID,
    });

    expect(result.sentCount).toBe(1);
    expect(ctx.db.rows('messageLog')).toHaveLength(1);
    expect(ctx.db.rows('pushDeliveryLog')).toContainEqual(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'expo temporarily unavailable',
      })
    );
  });

  test('in-app-only campaign does not attempt push', async () => {
    const tables = baseTables({ campaignChannels: ['in_app'] });
    const ctx = buildCtx(tables);
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ data: [{ status: 'ok' }] }), {
        status: 200,
      });
    };

    const result = await sendCampaignNow._handler(ctx, {
      businessId: BUSINESS_ID,
      campaignId: CAMPAIGN_ID,
    });

    expect(result.sentCount).toBe(1);
    expect(ctx.db.rows('messageLog')).toHaveLength(1);
    expect(fetchCalls).toBe(0);
    expect(ctx.db.rows('pushDeliveryLog')).toHaveLength(0);
  });
});

describe('referral push delivery coverage', () => {
  test('reward notification keeps referral logic successful while attempting push', async () => {
    const now = Date.now();
    const tables = baseTables();
    const ctx = buildCtx(tables);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok' }] }), {
        status: 200,
      });

    const joinResult = await processReferralAfterJoin(ctx, {
      businessId: BUSINESS_ID,
      referredUserId: CUSTOMER_ID,
      referralCode: 'PUSHREF1',
      joinedMembershipIds: [MEMBERSHIP_ID],
      joinedProgramStatuses: ['created'],
      hadAnyBusinessMembershipBeforeJoin: false,
    });
    expect(joinResult.ok).toBe(true);

    await ctx.db.insert('events', {
      _id: 'stamp_event_1',
      type: 'STAMP_ADDED',
      businessId: BUSINESS_ID,
      programId: PROGRAM_ID,
      membershipId: MEMBERSHIP_ID,
      actorUserId: OWNER_ID,
      customerUserId: CUSTOMER_ID,
      source: 'scanner_commit',
      createdAt: now,
    });

    const qualifyResult = await qualifyCustomerReferralAfterStamp(ctx, {
      businessId: BUSINESS_ID,
      referredUserId: CUSTOMER_ID,
      stampEventId: 'stamp_event_1',
      stampCreatedAt: now,
      stampProgramId: PROGRAM_ID,
      stampMembershipId: MEMBERSHIP_ID,
      actorUserId: OWNER_ID,
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });

    expect(qualifyResult.reason).toBe('granted');
    expect(ctx.db.rows('referralRewards')).toHaveLength(1);
    expect(ctx.db.rows('messageLog').length).toBeGreaterThan(0);
    expect(ctx.db.rows('pushDeliveryLog')).toContainEqual(
      expect.objectContaining({
        businessId: BUSINESS_ID,
        toUserId: CUSTOMER_ID,
        status: 'sent',
      })
    );
  });
});
