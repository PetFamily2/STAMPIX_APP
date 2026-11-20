import { afterEach, describe, expect, test } from 'bun:test';

import {
  estimateCampaignAudiencePaged,
  estimateManagementAudienceBatch,
  getManagementCampaignHistoryPaged,
  managementHistoryBatch,
  processManagementDeliveryBatch,
  recoverManagementDeliveries,
  runAutomationSweepInternal,
  sendCampaignNow,
} from '../campaigns';
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

  withIndex(indexName, builder) {
    this.indexName = indexName;
    const conditions = [];
    const q = {
      eq: (field, value) => {
        conditions.push({ field, value, op: 'eq' });
        return q;
      },
      gte: (field, value) => {
        conditions.push({ field, value, op: 'gte' });
        return q;
      },
      lte: (field, value) => {
        conditions.push({ field, value, op: 'lte' });
        return q;
      },
      lt: (field, value) => {
        conditions.push({ field, value, op: 'lt' });
        return q;
      },
    };
    builder(q);
    this.predicates.push((doc) =>
      conditions.every(({ field, value, op }) => {
        const actual = field.split('.').reduce((obj, key) => obj?.[key], doc);
        if (op === 'gte') return actual >= value;
        if (op === 'lte') return actual <= value;
        if (op === 'lt') return actual < value;
        return actual === value;
      })
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

  async paginate({ cursor, numItems }) {
    const all =
      this.indexName?.endsWith('_userId') && this.tableName === 'memberships'
        ? [...this.db.rows(this.tableName)].sort((a, b) =>
            a.userId.localeCompare(b.userId)
          )
        : this.db.rows(this.tableName);
    const start = cursor ? all.findIndex((row) => row._id === cursor) + 1 : 0;
    let i = start;
    const page = [];
    while (i < all.length && page.length < numItems) {
      const row = all[i++];
      if (this.predicates.every((p) => p(row))) {
        page.push(row);
      }
    }
    return {
      page,
      continueCursor: i ? all[i - 1]._id : '',
      isDone: !all.slice(i).some((row) => this.predicates.every((p) => p(row))),
    };
  }

  async collect() {
    return this.docs();
  }

  async take(limit) {
    return this.docs().slice(0, limit);
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

  async delete(id) {
    for (const tableName of Object.keys(this.tables)) {
      const rows = this.rows(tableName);
      const index = rows.findIndex((doc) => doc._id === id);
      if (index >= 0) {
        rows.splice(index, 1);
        return;
      }
    }
    throw new Error(`DELETE_TARGET_NOT_FOUND:${id}`);
  }
}

function buildCtx(tables, currentUserId = OWNER_ID) {
  const scheduled = [];
  return {
    db: new FakeDb(tables),
    scheduled,
    scheduler: {
      runAfter: async (delay, fn, args) => scheduled.push({ delay, fn, args }),
    },
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
        email: 'owner@stampaix.test',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: CUSTOMER_ID,
        isActive: true,
        marketingOptIn: true,
        fullName: 'Customer',
        email: 'customer@stampaix.test',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: REFERRER_ID,
        isActive: true,
        fullName: 'Referrer',
        email: 'referrer@stampaix.test',
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
  test('Smart Manager campaign cannot use legacy delivery paths', async () => {
    const now = Date.now();
    const tables = baseTables();
    tables.campaigns[0].source = 'smart_manager';
    tables.campaigns[0].status = 'active';
    tables.campaigns[0].activationStatus = 'active';
    tables.campaigns[0].automationEnabled = false;
    tables.campaigns[0].schedule = {
      mode: 'one_time',
      sendAt: now - 1_000,
      nextRunAt: now - 1_000,
    };
    const ctx = buildCtx(tables);

    await expect(
      sendCampaignNow._handler(ctx, {
        businessId: BUSINESS_ID,
        campaignId: CAMPAIGN_ID,
      })
    ).rejects.toThrow('SMART_MANAGER_APPROVED_CAMPAIGN_IMMUTABLE');
    const sweep = await runAutomationSweepInternal._handler(ctx, {
      phase: 'one_time',
      referenceNow: now,
    });

    expect(sweep.processedCampaigns).toBe(0);
    expect(ctx.db.rows('messageLog')).toHaveLength(0);
    expect(ctx.db.rows('campaignRuns')).toHaveLength(0);
  });

  test('closed business rejects manual send and is skipped by scheduled execution', async () => {
    const now = Date.now();
    const tables = baseTables();
    tables.businesses[0].isActive = false;
    tables.businesses[0].closedAt = now;
    tables.campaigns[0].status = 'active';
    tables.campaigns[0].activationStatus = 'active';
    tables.campaigns[0].schedule = {
      mode: 'one_time',
      sendAt: now - 1_000,
      nextRunAt: now - 1_000,
    };
    const ctx = buildCtx(tables);
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ data: [{ status: 'ok' }] }), {
        status: 200,
      });
    };

    await expect(
      sendCampaignNow._handler(ctx, {
        businessId: BUSINESS_ID,
        campaignId: CAMPAIGN_ID,
      })
    ).rejects.toThrow('BUSINESS_CLOSED');

    const sweep = await runAutomationSweepInternal._handler(ctx, {
      phase: 'one_time',
      referenceNow: now,
    });
    expect(sweep.processedCampaigns).toBe(0);
    expect(ctx.db.rows('messageLog')).toHaveLength(0);
    expect(fetchCalls).toBe(0);
  });

  test('restoration does not automatically send a missed one-time campaign', async () => {
    const now = Date.now();
    const tables = baseTables();
    tables.businesses[0].lastRestoredAt = now;
    tables.campaigns[0].status = 'active';
    tables.campaigns[0].activationStatus = 'active';
    tables.campaigns[0].schedule = {
      mode: 'one_time',
      sendAt: now - 1_000,
      nextRunAt: now - 1_000,
    };
    const ctx = buildCtx(tables);

    const sweep = await runAutomationSweepInternal._handler(ctx, {
      phase: 'one_time',
      referenceNow: now,
    });

    expect(sweep.processedCampaigns).toBe(0);
    expect(ctx.db.rows('messageLog')).toHaveLength(0);
    expect(tables.campaigns[0].activationStatus).toBe('active');
  });

  test('automated one-time completion coalesces one Smart Manager dirty mark for the business', async () => {
    const now = Date.now();
    const tables = baseTables({ campaignChannels: ['in_app'] });
    tables.campaigns[0].status = 'active';
    tables.campaigns[0].activationStatus = 'active';
    tables.campaigns[0].automationEnabled = false;
    tables.campaigns[0].schedule = {
      mode: 'one_time',
      sendAt: now - 1_000,
      nextRunAt: now - 1_000,
    };
    const ctx = buildCtx(tables);

    const sweep = await runAutomationSweepInternal._handler(ctx, {
      phase: 'one_time',
      referenceNow: now,
    });

    expect(sweep.oneTimeProcessedCampaigns).toBe(1);
    expect(ctx.db.rows('smartManagerEvaluationStates')).toHaveLength(1);
    expect(ctx.db.rows('smartManagerEvaluationStates')[0]).toMatchObject({
      businessId: BUSINESS_ID,
      dirtyDomains: ['campaigns'],
      dirtyReasons: ['campaign_automation_transition'],
    });
    expect(ctx.scheduled).toHaveLength(1);
  });

  test('push-channel campaign queues durable delivery without external HTTP in mutation', async () => {
    const tables = baseTables();
    const ctx = buildCtx(tables);
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error('HTTP forbidden in mutation');
    };
    const result = await sendCampaignNow._handler(ctx, {
      businessId: BUSINESS_ID,
      campaignId: CAMPAIGN_ID,
    });
    expect(result.sentCount).toBe(1);
    expect(ctx.db.rows('messageLog')).toHaveLength(1);
    expect(ctx.db.rows('pushDeliveryOutbox')).toContainEqual(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        toUserId: CUSTOMER_ID,
        status: 'pending',
      })
    );
    expect(ctx.scheduled.some((task) => task.args.outboxId)).toBeTrue();
    expect(fetchCalls).toBe(0);
  });

  test('in-app delivery is committed independently of external Push outcome', async () => {
    const tables = baseTables();
    const ctx = buildCtx(tables);
    globalThis.fetch = async () => {
      throw new Error('provider unavailable');
    };
    const result = await sendCampaignNow._handler(ctx, {
      businessId: BUSINESS_ID,
      campaignId: CAMPAIGN_ID,
    });
    expect(result.sentCount).toBe(1);
    expect(ctx.db.rows('messageLog')).toHaveLength(1);
    expect(ctx.db.rows('pushDeliveryOutbox')[0].status).toBe('pending');
    expect(ctx.db.rows('pushDeliveryLog')).toHaveLength(0);
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
    expect(ctx.db.rows('pushDeliveryOutbox')).toContainEqual(
      expect.objectContaining({
        businessId: BUSINESS_ID,
        toUserId: CUSTOMER_ID,
        status: 'pending',
      })
    );
  });
});

test('one-time sweep continues through batches and repeat scans do not redeliver', async () => {
  const now = Date.now(),
    tables = baseTables({ campaignChannels: ['in_app'] });
  const baseBusiness = tables.businesses[0];
  const baseMembership = tables.memberships[0];
  tables.businesses = Array.from({ length: 23 }, (_, i) => ({
    ...baseBusiness,
    _id: `biz_batch_${i}`,
  }));
  tables.memberships = Array.from({ length: 23 }, (_, i) => ({
    ...baseMembership,
    _id: `membership_batch_${i}`,
    businessId: `biz_batch_${i}`,
  }));
  tables.campaigns = Array.from({ length: 23 }, (_, i) => ({
    ...tables.campaigns[0],
    _id: `batch_${i}`,
    businessId: `biz_batch_${i}`,
    status: 'active',
    activationStatus: 'active',
    automationEnabled: false,
    schedule: { mode: 'one_time', sendAt: now - 1000, nextRunAt: now - 1000 },
  }));
  const ctx = buildCtx(tables);
  let i = 0;
  const schedule = ctx.scheduler.runAfter;
  let failOnce = true;
  ctx.scheduler.runAfter = async (...params) => {
    if (params[2].phase && failOnce) {
      failOnce = false;
      throw new Error('simulated continuation failure');
    }
    return schedule(...params);
  };
  await expect(
    runAutomationSweepInternal._handler(ctx, {
      phase: 'one_time',
      referenceNow: now,
    })
  ).rejects.toThrow('simulated continuation failure');
  await runAutomationSweepInternal._handler(ctx, {
    phase: 'one_time',
    referenceNow: now,
  });
  while (i < ctx.scheduled.length) {
    const task = ctx.scheduled[i++];
    if (task.args.phase) {
      await runAutomationSweepInternal._handler(ctx, task.args);
    }
  }
  expect(
    tables.campaigns.filter((row) => row.status === 'completed')
  ).toHaveLength(23);
  expect(ctx.db.rows('messageLog')).toHaveLength(23);
  await runAutomationSweepInternal._handler(ctx, {
    phase: 'one_time',
    referenceNow: now,
  });
  expect(ctx.db.rows('messageLog')).toHaveLength(23);
});

test('recurring sweep scans all batches and repeated sweep does not redeliver', async () => {
  const now = Date.UTC(2026, 0, 15, 7),
    tables = baseTables({ campaignChannels: ['in_app'] }),
    baseBusiness = tables.businesses[0],
    baseMembership = tables.memberships[0],
    baseCampaign = tables.campaigns[0];
  tables.businesses = Array.from({ length: 23 }, (_, i) => ({
    ...baseBusiness,
    _id: `rbiz_${i}`,
  }));
  tables.memberships = Array.from({ length: 23 }, (_, i) => ({
    ...baseMembership,
    _id: `rmembership_${i}`,
    businessId: `rbiz_${i}`,
  }));
  tables.campaigns = Array.from({ length: 23 }, (_, i) => ({
    ...baseCampaign,
    _id: `recurring_${i}`,
    businessId: `rbiz_${i}`,
    status: 'active',
    activationStatus: 'active',
    automationEnabled: true,
  }));
  const ctx = buildCtx(tables);
  let cursor = 0,
    total = 0;
  let result = await runAutomationSweepInternal._handler(ctx, {
    phase: 'recurring',
    referenceNow: now,
  });
  total += result.recurringProcessedCampaigns;
  while (cursor < ctx.scheduled.length) {
    const task = ctx.scheduled[cursor++];
    if (task.args.phase) {
      result = await runAutomationSweepInternal._handler(ctx, task.args);
      total += result.recurringProcessedCampaigns;
    }
  }
  expect(total).toBe(23);
  const initial = ctx.db.rows('messageLog').length;
  await runAutomationSweepInternal._handler(ctx, {
    phase: 'recurring',
    referenceNow: now,
  });
  while (cursor < ctx.scheduled.length) {
    const task = ctx.scheduled[cursor++];
    if (task.args.phase) {
      await runAutomationSweepInternal._handler(ctx, task.args);
    }
  }
  expect(ctx.db.rows('messageLog')).toHaveLength(initial);
});

test('program-scoped campaign audience excludes another business and users without marketing consent', async () => {
  const tables = baseTables({ campaignChannels: ['in_app'] });
  tables.campaigns[0].programId = PROGRAM_ID;
  tables.users.push(
    { _id: 'other_customer', isActive: true, marketingOptIn: true },
    { _id: 'no_consent', isActive: true, marketingOptIn: false }
  );
  const base = tables.memberships[0];
  tables.memberships.push(
    {
      ...base,
      _id: 'bad_other_business',
      businessId: 'other_business',
      userId: 'other_customer',
    },
    { ...base, _id: 'no_consent_membership', userId: 'no_consent' }
  );
  const ctx = buildCtx(tables);
  const result = await sendCampaignNow._handler(ctx, {
    businessId: BUSINESS_ID,
    campaignId: CAMPAIGN_ID,
  });
  expect(result.sentCount).toBe(1);
  expect(ctx.db.rows('messageLog').map((row) => row.toUserId)).toEqual([
    CUSTOMER_ID,
  ]);
});

test('annual automation history uses the exact Israel new-year boundary', async () => {
  const now = Date.UTC(2026, 0, 1, 7);
  for (const [when, expected] of [
    [Date.UTC(2025, 11, 31, 21, 59, 59, 999), 1],
    [Date.UTC(2025, 11, 31, 22), 0],
  ]) {
    const tables = baseTables({ campaignChannels: ['in_app'] });
    tables.users.find((user) => user._id === CUSTOMER_ID).birthdayDay = 1;
    tables.users.find((user) => user._id === CUSTOMER_ID).birthdayMonth = 1;
    Object.assign(tables.campaigns[0], {
      type: 'birthday',
      rules: { audience: 'birthday_today' },
      status: 'active',
      activationStatus: 'active',
      automationEnabled: true,
    });
    tables.messageLog.push({
      _id: 'old_log',
      businessId: BUSINESS_ID,
      campaignId: CAMPAIGN_ID,
      toUserId: CUSTOMER_ID,
      createdAt: when,
      status: 'sent',
    });
    const ctx = buildCtx(tables);
    const result = await runAutomationSweepInternal._handler(ctx, {
      phase: 'recurring',
      referenceNow: now,
    });
    expect(result.sentCount).toBe(expected);
  }
});

test('overlapping one-time sweeps recover a dropped continuation and never duplicate opted-in deliveries across 125 businesses', async () => {
  const now = Date.now(),
    tables = baseTables({ campaignChannels: ['in_app'] });
  const originalBusiness = tables.businesses[0],
    originalMembership = tables.memberships[0],
    originalCampaign = tables.campaigns[0];
  const count = 125;
  tables.businesses = Array.from({ length: count }, (_, i) => ({
    ...originalBusiness,
    _id: 'load_business_' + i,
  }));
  tables.users.push(
    ...Array.from({ length: count }, (_, i) => ({
      _id: 'load_user_' + i,
      isActive: true,
      marketingOptIn: i % 4 !== 0,
      createdAt: now,
      updatedAt: now,
    }))
  );
  tables.memberships = Array.from({ length: count }, (_, i) => ({
    ...originalMembership,
    _id: 'load_membership_' + i,
    businessId: 'load_business_' + i,
    userId: 'load_user_' + i,
  }));
  tables.campaigns = Array.from({ length: count }, (_, i) => ({
    ...originalCampaign,
    _id: 'load_campaign_' + i,
    businessId: 'load_business_' + i,
    status: 'active',
    activationStatus: 'active',
    automationEnabled: false,
    schedule: { mode: 'one_time', sendAt: now - 1000, nextRunAt: now - 1000 },
  }));
  const ctx = buildCtx(tables);
  await runAutomationSweepInternal._handler(ctx, {
    phase: 'one_time',
    referenceNow: now,
  });
  // Model a continuation being lost before the next sweep. A later sweep must
  // start at the beginning without repeating already committed deliveries.
  const lost = ctx.scheduled.findIndex(
    (task) => task.args.phase === 'one_time'
  );
  expect(lost).toBeGreaterThanOrEqual(0);
  ctx.scheduled.splice(lost, 1);
  await runAutomationSweepInternal._handler(ctx, {
    phase: 'one_time',
    referenceNow: now,
  });
  await runAutomationSweepInternal._handler(ctx, {
    phase: 'one_time',
    referenceNow: now,
  });
  let cursor = 0,
    continuations = 0;
  while (cursor < ctx.scheduled.length) {
    const task = ctx.scheduled[cursor++];
    if (task.args.phase) {
      continuations++;
      if (continuations > 100) throw Error('CONTINUATION_NOT_TERMINATING');
      await runAutomationSweepInternal._handler(ctx, task.args);
    }
  }
  expect(
    tables.campaigns.filter((row) => row.status === 'completed')
  ).toHaveLength(count);
  const logs = ctx.db.rows('messageLog');
  expect(logs).toHaveLength(count - Math.ceil(count / 4));
  expect(new Set(logs.map((row) => String(row.campaignId))).size).toBe(
    logs.length
  );
  for (const row of logs) {
    const number = Number(String(row.toUserId).replace('load_user_', ''));
    expect(number % 4).not.toBe(0);
    expect(row.businessId).toBe('load_business_' + number);
    expect(row.campaignId).toBe('load_campaign_' + number);
  }
});

test('large scheduled campaign processes 10,001 memberships with bounded pages and recovers without replay', async () => {
  const now = Date.now(),
    tables = baseTables({ campaignChannels: ['in_app'] });
  Object.assign(tables.campaigns[0], {
    status: 'active',
    activationStatus: 'active',
    automationEnabled: false,
    schedule: { mode: 'one_time', sendAt: now - 1000 },
  });
  const original = tables.memberships[0];
  tables.memberships = Array.from({ length: 10001 }, (_, i) => {
    // The first user spans several pages. The remaining users are distinct.
    const id = i < 125 ? 'large_00000' : 'large_' + String(i).padStart(5, '0');
    return { ...original, _id: 'membership_' + i, userId: id };
  });
  for (const id of new Set(tables.memberships.map((m) => m.userId))) {
    tables.users.push({
      _id: id,
      isActive: true,
      marketingOptIn: id !== 'large_00125',
    });
  }
  const ctx = buildCtx(tables),
    query = ctx.db.query.bind(ctx.db);
  ctx.db.query = (table) => {
    const q = query(table);
    if (table === 'memberships')
      q.collect = async () => {
        throw Error('UNBOUNDED_AUDIENCE');
      };
    return q;
  };
  const args = { phase: 'one_time', referenceNow: now };
  await runAutomationSweepInternal._handler(ctx, args);
  await runAutomationSweepInternal._handler(ctx, args);
  const pages = () => ctx.scheduled.filter(({ args }) => 'page' in args);
  expect(pages()).toHaveLength(1);
  const initial = pages()[0].args;
  await processManagementDeliveryBatch._handler(ctx, initial);
  await processManagementDeliveryBatch._handler(ctx, initial);
  expect(ctx.db.rows('messageLog')).toHaveLength(1);
  const campaign = ctx.db.rows('campaigns')[0];
  await ctx.db.patch(campaign._id, {
    managementDelivery: {
      ...campaign.managementDelivery,
      nextAttemptAt: now - 1,
    },
  });
  // Simulate a worker abort before page writes. The last committed checkpoint
  // must still be eligible for the same recovery path as a dropped worker.
  const workingQuery = ctx.db.query;
  ctx.db.query = (table) => {
    const q = workingQuery(table);
    if (table === 'memberships')
      q.paginate = async () => {
        throw Error('SIMULATED_PAGE_ABORT');
      };
    return q;
  };
  try {
    await expect(
      processManagementDeliveryBatch._handler(ctx, pages()[1].args)
    ).rejects.toThrow('SIMULATED_PAGE_ABORT');
    expect(ctx.db.rows('campaigns')[0].managementDelivery.page).toBe(1);
    expect(ctx.db.rows('messageLog')).toHaveLength(1);
  } finally {
    ctx.db.query = workingQuery;
  }
  const lost = ctx.scheduled.findIndex(({ args }) => args.page === 1);
  ctx.scheduled.splice(lost, 1);
  expect(await recoverManagementDeliveries._handler(ctx, {})).toBe(1);
  let index = 1;
  while (index < pages().length) {
    if (index > 201) throw Error('NON_TERMINATING_DELIVERY');
    await processManagementDeliveryBatch._handler(ctx, pages()[index++].args);
  }
  const expected = 10001 - 124 - 1;
  expect(ctx.db.rows('messageLog')).toHaveLength(expected);
  expect(
    new Set(ctx.db.rows('messageLog').map((entry) => entry.toUserId)).size
  ).toBe(expected);
  expect(ctx.db.rows('campaignRuns')).toMatchObject([
    { targetedCount: expected, deliveredCount: expected },
  ]);
  expect(ctx.db.rows('campaigns')[0].activationStatus).toBe('completed');
  expect(ctx.db.rows('campaigns')[0].managementDelivery).toBeUndefined();
}, 30000);

async function drainCampaignPages(ctx) {
  let processed = 0;
  for (const task of ctx.scheduled) {
    if (!Number.isInteger(task.args.page)) continue;
    if (++processed > 25) throw Error('NON_TERMINATING_TEST');
    await processManagementDeliveryBatch._handler(ctx, task.args);
  }
}

function mediumAudience() {
  const tables = baseTables({ campaignChannels: ['in_app'] });
  const membership = tables.memberships[0];
  tables.memberships = Array.from({ length: 101 }, (_, i) => ({
    ...membership,
    _id: 'm_' + i,
    userId: 'batch_user_' + String(i).padStart(3, '0'),
  }));
  for (const row of tables.memberships)
    tables.users.push({
      _id: row.userId,
      isActive: true,
      marketingOptIn: true,
    });
  return tables;
}

test('manual batching is opt-in and consent is checked in each batch', async () => {
  const tables = mediumAudience();
  const ctx = buildCtx(tables);
  const args = { businessId: BUSINESS_ID, campaignId: CAMPAIGN_ID };
  await expect(sendCampaignNow._handler(ctx, args)).rejects.toThrow(
    'CAMPAIGN_CLIENT_UPDATE_REQUIRED'
  );
  expect(ctx.db.rows('messageLog')).toHaveLength(0);
  expect(
    await sendCampaignNow._handler(ctx, { ...args, acceptQueued: true })
  ).toMatchObject({ queued: true });
  expect(
    await sendCampaignNow._handler(ctx, { ...args, acceptQueued: true })
  ).toMatchObject({ queued: true });
  expect(ctx.scheduled).toHaveLength(1);
  await ctx.db.patch('batch_user_099', { marketingOptIn: false });
  await drainCampaignPages(ctx);
  expect(ctx.db.rows('messageLog')).toHaveLength(100);
  expect(
    ctx.db.rows('messageLog').some((row) => row.toUserId === 'batch_user_099')
  ).toBe(false);
  expect(ctx.db.rows('campaignRuns')).toMatchObject([
    { targetedCount: 100, deliveredCount: 100 },
  ]);
});

test('repeated recurring sweeps do not duplicate a batched campaign', async () => {
  const tables = mediumAudience();
  const ctx = buildCtx(tables);
  const now = Date.UTC(2026, 10, 20, 7);
  await ctx.db.patch(CAMPAIGN_ID, {
    status: 'active',
    activationStatus: 'active',
    automationEnabled: true,
    schedule: { mode: 'recurring' },
    isActive: true,
  });
  await runAutomationSweepInternal._handler(ctx, { referenceNow: now });
  await drainCampaignPages(ctx);
  expect(ctx.db.rows('messageLog')).toHaveLength(101);
  ctx.scheduled.length = 0;
  await runAutomationSweepInternal._handler(ctx, { referenceNow: now });
  await drainCampaignPages(ctx);
  expect(ctx.db.rows('messageLog')).toHaveLength(101);
  expect(ctx.db.rows('campaignRuns')).toHaveLength(1);
});

test('paged audience and history aggregate unique users across page boundaries', async () => {
  const tables = mediumAudience();
  const repeat = tables.memberships[0];
  tables.memberships.unshift(
    ...Array.from({ length: 103 }, (_, i) => ({
      ...repeat,
      _id: 'duplicate_' + i,
    }))
  );
  tables.messageLog = Array.from({ length: 160 }, (_, i) => ({
    _id: 'history_' + i,
    campaignId: CAMPAIGN_ID,
    businessId: BUSINESS_ID,
    toUserId: repeat.userId,
    createdAt: i + 1,
  }));
  tables.messageLog.push(
    {
      _id: 'other_user_history',
      campaignId: CAMPAIGN_ID,
      businessId: BUSINESS_ID,
      toUserId: tables.memberships.at(-1).userId,
      createdAt: 999,
    },
    {
      _id: 'foreign_history',
      campaignId: CAMPAIGN_ID,
      businessId: 'foreign',
      toUserId: 'someone_else',
      createdAt: 1000,
    }
  );
  const ctx = buildCtx(tables);
  const args = { businessId: BUSINESS_ID, campaignId: CAMPAIGN_ID };
  expect(
    await estimateCampaignAudiencePaged._handler(
      {
        runQuery: (_ref, input) =>
          estimateManagementAudienceBatch._handler(ctx, input),
      },
      args
    )
  ).toMatchObject({ total: 101, missingBirthdayCount: 101 });
  expect(
    await getManagementCampaignHistoryPaged._handler(
      {
        runQuery: (_ref, input) => managementHistoryBatch._handler(ctx, input),
      },
      { ...args, revision: tables.campaigns[0].updatedAt }
    )
  ).toEqual({
    reachedUniqueAllTime: 2,
    reachedMessagesAllTime: 161,
    lastSentAt: 999,
  });
});
