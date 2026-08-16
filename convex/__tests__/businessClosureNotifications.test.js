import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  BUSINESS_CLOSURE_NOTIFICATION_BATCH_SIZE,
  deliverBusinessClosureNotificationInternal,
  processBusinessClosureCustomerBatchInternal,
  processBusinessClosureStaffBatchInternal,
  sendBusinessClosurePushInternal,
} from '../business';

const BUSINESS_ID = 'business_closed_1';
const OWNER_ID = 'user_owner';
const CUSTOMER_ID = 'user_customer';
const CLOSED_AT = 1_700_000_000_000;
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
      field: (fieldName) => ({ fieldName }),
      eq: (left, right) => ({ left, right }),
    };
    const expression = builder(q);
    if (expression?.left?.fieldName) {
      this.predicates.push(
        (doc) => doc[expression.left.fieldName] === expression.right
      );
    }
    return this;
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

  async paginate({ cursor, numItems }) {
    this.db.paginateCalls.push({
      tableName: this.tableName,
      cursor,
      numItems,
    });
    const rows = this.docs();
    const start = cursor == null ? 0 : Number(cursor);
    const end = Math.min(start + numItems, rows.length);
    return {
      page: rows.slice(start, end),
      isDone: end >= rows.length,
      continueCursor: String(end),
    };
  }
}

class FakeDb {
  constructor(tables) {
    this.tables = tables;
    this.counter = 0;
    this.paginateCalls = [];
  }

  rows(tableName) {
    if (!this.tables[tableName]) {
      this.tables[tableName] = [];
    }
    return this.tables[tableName];
  }

  query(tableName) {
    return new FakeQuery(this, tableName);
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
    this.counter += 1;
    const row = { _id: `${tableName}_${this.counter}`, ...value };
    this.rows(tableName).push(row);
    return row._id;
  }

  async patch(id, patch) {
    for (const tableName of Object.keys(this.tables)) {
      const rows = this.rows(tableName);
      const index = rows.findIndex((row) => row._id === id);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...patch };
        return;
      }
    }
    throw new Error(`PATCH_TARGET_NOT_FOUND:${id}`);
  }
}

function buildMembership(overrides = {}) {
  return {
    _id: 'membership_1',
    businessId: BUSINESS_ID,
    programId: 'program_1',
    userId: CUSTOMER_ID,
    currentStamps: 7,
    isActive: true,
    createdAt: CLOSED_AT - 10_000,
    updatedAt: CLOSED_AT - 5_000,
    ...overrides,
  };
}

function buildTables(overrides = {}) {
  return {
    businesses: [
      {
        _id: BUSINESS_ID,
        ownerUserId: OWNER_ID,
        externalId: 'closed-business',
        name: 'עסק הבדיקה',
        isActive: false,
        closedAt: CLOSED_AT,
        lastClosedAt: CLOSED_AT,
        createdAt: CLOSED_AT - 100_000,
        updatedAt: CLOSED_AT,
      },
    ],
    memberships: [buildMembership()],
    businessStaff: [],
    messageLog: [],
    pushTokens: [],
    pushDeliveryLog: [],
    ...overrides,
  };
}

function buildCtx(tables) {
  const scheduled = [];
  return {
    ctx: {
      db: new FakeDb(tables),
      scheduler: {
        runAfter: async (delayMs, functionReference, args) => {
          scheduled.push({ delayMs, functionReference, args });
          return `_scheduled_${scheduled.length}`;
        },
      },
    },
    scheduled,
  };
}

async function runScheduledRecipientDeliveries(ctx, scheduled, startIndex = 0) {
  let index = startIndex;
  while (index < scheduled.length) {
    const job = scheduled[index];
    index += 1;
    if (job.args.toUserId) {
      await deliverBusinessClosureNotificationInternal._handler(
        ctx,
        job.args
      );
      continue;
    }
    if (job.args.messageId) {
      await sendBusinessClosurePushInternal._handler(ctx, job.args);
    }
  }
  return index;
}

describe('business closure notification fan-out', () => {
  test('close mutation only schedules notification work after closure state', () => {
    const source = readFileSync('convex/business.ts', 'utf8');
    const start = source.indexOf('export const closeBusinessAccount');
    const end = source.indexOf('export const listMyClosedBusinesses', start);
    const closeMutation = source.slice(start, end);
    const closedPatchIndex = closeMutation.indexOf('isActive: false');
    const scheduleIndex = closeMutation.indexOf('ctx.scheduler.runAfter');

    expect(closedPatchIndex).toBeGreaterThan(-1);
    expect(scheduleIndex).toBeGreaterThan(closedPatchIndex);
    expect(closeMutation).toContain(
      'processBusinessClosureCustomerBatchInternal'
    );
    expect(closeMutation).toContain('processBusinessClosureStaffBatchInternal');
    expect(closeMutation).not.toContain('sendPushNotificationToUser');
    expect(closeMutation).not.toContain("query('memberships')");

    const restoreStart = source.indexOf(
      'export const restoreBusinessAccount'
    );
    const restoreEnd = source.indexOf(
      'export const createBusiness',
      restoreStart
    );
    const restoreMutation = source.slice(restoreStart, restoreEnd);
    expect(restoreMutation).not.toContain('business_closed');
    expect(restoreMutation).not.toContain('ctx.scheduler.runAfter');
  });

  test('active customers get one authoritative Inbox row while inactive memberships are ignored', async () => {
    const tables = buildTables({
      memberships: [
        buildMembership(),
        buildMembership({ _id: 'membership_2', programId: 'program_2' }),
        buildMembership({
          _id: 'membership_inactive',
          userId: 'inactive_history_only',
          isActive: false,
        }),
      ],
    });
    const membershipsBefore = structuredClone(tables.memberships);
    const { ctx, scheduled } = buildCtx(tables);

    const result = await processBusinessClosureCustomerBatchInternal._handler(
      ctx,
      { businessId: BUSINESS_ID, closedAt: CLOSED_AT, cursor: null }
    );
    await runScheduledRecipientDeliveries(ctx, scheduled);

    expect(result.scheduledRecipientCount).toBe(1);
    expect(tables.messageLog).toHaveLength(1);
    expect(tables.messageLog[0]).toEqual(
      expect.objectContaining({
        businessId: BUSINESS_ID,
        toUserId: CUSTOMER_ID,
        channel: 'in_app',
        notificationType: 'business_closed',
        status: 'sent',
        deliveryStatus: 'inbox_push_attempted',
      })
    );
    expect(tables.messageLog[0].inboxPayload).toEqual(
      expect.objectContaining({
        title: 'עסק הבדיקה אינו פעיל כרגע ב-StampAix',
        body: 'כרטיסיות העסק הוסתרו. הניקובים וההיסטוריה שלך נשמרו ויופיעו שוב אם העסק ישוחזר.',
        destinationHref: null,
      })
    );
    expect(tables.messageLog[0].dedupeKey).toContain(String(CLOSED_AT));
    expect(
      tables.messageLog.some(
        (row) => row.toUserId === 'inactive_history_only'
      )
    ).toBeFalse();
    expect(tables.memberships).toEqual(membershipsBefore);
  });

  test('customer pagination is bounded and persistent dedupe works across pages', async () => {
    const memberships = [buildMembership()];
    for (
      let index = 1;
      index < BUSINESS_CLOSURE_NOTIFICATION_BATCH_SIZE;
      index += 1
    ) {
      memberships.push(
        buildMembership({
          _id: `membership_${index + 1}`,
          userId: `customer_${index}`,
          programId: `program_${index + 1}`,
        })
      );
    }
    memberships.push(
      buildMembership({
        _id: 'membership_duplicate_next_page',
        programId: 'program_duplicate_next_page',
      })
    );
    const tables = buildTables({ memberships });
    const membershipsBefore = structuredClone(tables.memberships);
    const { ctx, scheduled } = buildCtx(tables);

    await processBusinessClosureCustomerBatchInternal._handler(ctx, {
      businessId: BUSINESS_ID,
      closedAt: CLOSED_AT,
      cursor: null,
    });
    const continuation = scheduled.find(
      (job) =>
        job.args.cursor ===
        String(BUSINESS_CLOSURE_NOTIFICATION_BATCH_SIZE)
    );
    expect(continuation).toBeTruthy();
    const firstPageScheduledCount = await runScheduledRecipientDeliveries(
      ctx,
      scheduled
    );
    await processBusinessClosureCustomerBatchInternal._handler(
      ctx,
      continuation.args
    );
    await runScheduledRecipientDeliveries(
      ctx,
      scheduled,
      firstPageScheduledCount
    );

    expect(ctx.db.paginateCalls).toEqual([
      {
        tableName: 'memberships',
        cursor: null,
        numItems: BUSINESS_CLOSURE_NOTIFICATION_BATCH_SIZE,
      },
      {
        tableName: 'memberships',
        cursor: String(BUSINESS_CLOSURE_NOTIFICATION_BATCH_SIZE),
        numItems: BUSINESS_CLOSURE_NOTIFICATION_BATCH_SIZE,
      },
    ]);
    expect(
      tables.messageLog.filter((row) => row.toUserId === CUSTOMER_ID)
    ).toHaveLength(1);
    expect(tables.messageLog).toHaveLength(
      BUSINESS_CLOSURE_NOTIFICATION_BATCH_SIZE
    );
    expect(tables.memberships).toEqual(membershipsBefore);
  });

  test('active managers and staff are notified once while owner and inactive rows are excluded', async () => {
    const businessStaff = [
      {
        _id: 'owner_row',
        businessId: BUSINESS_ID,
        userId: OWNER_ID,
        staffRole: 'owner',
        status: 'active',
        isActive: true,
      },
      {
        _id: 'manager_row',
        businessId: BUSINESS_ID,
        userId: 'user_manager',
        staffRole: 'manager',
        status: 'active',
        isActive: true,
      },
      {
        _id: 'staff_row',
        businessId: BUSINESS_ID,
        userId: 'user_staff',
        staffRole: 'staff',
        status: 'active',
        isActive: true,
      },
      {
        _id: 'inactive_staff_row',
        businessId: BUSINESS_ID,
        userId: 'user_inactive_staff',
        staffRole: 'staff',
        status: 'removed',
        isActive: false,
      },
      {
        _id: 'stale_owner_like_row',
        businessId: BUSINESS_ID,
        userId: 'user_stale_owner',
        staffRole: 'owner',
        status: 'active',
        isActive: true,
      },
    ];
    const tables = buildTables({ businessStaff });
    const staffBefore = structuredClone(tables.businessStaff);
    const { ctx, scheduled } = buildCtx(tables);

    await processBusinessClosureStaffBatchInternal._handler(ctx, {
      businessId: BUSINESS_ID,
      closedAt: CLOSED_AT,
      cursor: null,
    });
    let scheduledCount = await runScheduledRecipientDeliveries(
      ctx,
      scheduled
    );
    await processBusinessClosureStaffBatchInternal._handler(ctx, {
      businessId: BUSINESS_ID,
      closedAt: CLOSED_AT,
      cursor: null,
    });
    scheduledCount = await runScheduledRecipientDeliveries(
      ctx,
      scheduled,
      scheduledCount
    );
    expect(scheduledCount).toBe(scheduled.length);

    expect(tables.messageLog.map((row) => row.toUserId).sort()).toEqual([
      'user_manager',
      'user_staff',
    ]);
    expect(tables.messageLog[0].inboxPayload.body).toBe(
      'הגישה לניהול העסק הופסקה. נתוני העסק נשמרו ויהיו זמינים שוב אם בעל העסק ישחזר אותו.'
    );
    expect(tables.businessStaff).toEqual(staffBefore);
  });

  test('same-closure retries skip Inbox and Push while a later closure creates a fresh occurrence', async () => {
    const tables = buildTables({
      pushTokens: [
        {
          _id: 'push_token_1',
          userId: CUSTOMER_ID,
          token: 'ExponentPushToken[customer]',
          platform: 'android',
          isActive: true,
        },
      ],
    });
    const { ctx, scheduled } = buildCtx(tables);
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ data: [{ status: 'ok' }] }), {
        status: 200,
      });
    };

    const args = {
      businessId: BUSINESS_ID,
      closedAt: CLOSED_AT,
      cursor: null,
    };
    await processBusinessClosureCustomerBatchInternal._handler(ctx, args);
    let scheduledCount = await runScheduledRecipientDeliveries(
      ctx,
      scheduled
    );
    await processBusinessClosureCustomerBatchInternal._handler(ctx, args);
    scheduledCount = await runScheduledRecipientDeliveries(
      ctx,
      scheduled,
      scheduledCount
    );

    expect(tables.messageLog).toHaveLength(1);
    expect(tables.pushDeliveryLog).toHaveLength(1);
    expect(fetchCalls).toBe(1);
    await sendBusinessClosurePushInternal._handler(ctx, {
      messageId: tables.messageLog[0]._id,
    });
    expect(tables.pushDeliveryLog).toHaveLength(1);
    expect(fetchCalls).toBe(1);

    const secondClosedAt = CLOSED_AT + 50_000;
    tables.businesses[0].closedAt = secondClosedAt;
    tables.businesses[0].lastClosedAt = secondClosedAt;
    await processBusinessClosureCustomerBatchInternal._handler(ctx, {
      ...args,
      closedAt: secondClosedAt,
    });
    await runScheduledRecipientDeliveries(ctx, scheduled, scheduledCount);

    expect(tables.messageLog).toHaveLength(2);
    expect(tables.messageLog[0].dedupeKey).not.toBe(
      tables.messageLog[1].dedupeKey
    );
    expect(tables.pushDeliveryLog).toHaveLength(2);
    expect(fetchCalls).toBe(2);
  });

  test('Push failure leaves the authoritative Inbox notification intact', async () => {
    const tables = buildTables({
      pushTokens: [
        {
          _id: 'push_token_1',
          userId: CUSTOMER_ID,
          token: 'ExponentPushToken[customer]',
          platform: 'ios',
          isActive: true,
        },
      ],
    });
    const { ctx, scheduled } = buildCtx(tables);
    globalThis.fetch = async () => {
      throw new Error('expo temporarily unavailable');
    };

    await processBusinessClosureCustomerBatchInternal._handler(ctx, {
      businessId: BUSINESS_ID,
      closedAt: CLOSED_AT,
      cursor: null,
    });
    await runScheduledRecipientDeliveries(ctx, scheduled);

    expect(tables.messageLog).toHaveLength(1);
    expect(tables.messageLog[0].deliveryStatus).toBe(
      'inbox_push_attempted'
    );
    expect(tables.pushDeliveryLog).toContainEqual(
      expect.objectContaining({
        toUserId: CUSTOMER_ID,
        status: 'failed',
        errorMessage: 'expo temporarily unavailable',
      })
    );
  });
});
