import { describe, expect, test } from 'bun:test';
import {
  commitRedeem,
  commitStamp,
  resolveScan,
  undoLastScannerAction,
} from '../scanner';
import { buildScanToken } from '../scanTokens';

process.env.SCAN_TOKEN_SECRET = process.env.SCAN_TOKEN_SECRET || 'test-secret';
process.env.SCAN_TOKEN_KID = process.env.SCAN_TOKEN_KID || 'test-kid';

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
    if (
      this.tableName === 'scanTokenEvents' &&
      this.db.failNextScanTokenLookup === true
    ) {
      this.db.failNextScanTokenLookup = false;
      throw new Error('TRANSIENT_DB_ERROR');
    }
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
    this.counter = 0;
    this.failNextScanTokenLookup = false;
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

function buildBusiness(overrides = {}) {
  const now = Date.now();
  return {
    _id: 'business_1',
    ownerUserId: 'owner_1',
    externalId: 'biz-1',
    name: 'Business',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    subscriptionStartAt: now,
    subscriptionEndAt: null,
    billingPeriod: null,
    ...overrides,
  };
}

function buildProgram(overrides = {}) {
  const now = Date.now();
  return {
    _id: 'program_1',
    businessId: 'business_1',
    status: 'active',
    isArchived: false,
    isActive: true,
    title: 'Main Card',
    rewardName: 'Free Coffee',
    maxStamps: 10,
    stampIcon: '☕',
    allowPosEnroll: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
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

function baseTables(overrides = {}) {
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
    businesses: [buildBusiness()],
    businessStaff: [
      {
        _id: 'staff_link_1',
        businessId: 'business_1',
        userId: 'staff_1',
        staffRole: 'owner',
        isActive: true,
        createdAt: now,
      },
    ],
    loyaltyPrograms: [buildProgram()],
    memberships: [],
    events: [],
    campaigns: [],
    aiUsageLedger: [],
    scanTokenEvents: [],
    scanSessions: [],
    ...overrides,
  };
}

async function createToken() {
  const { scanToken } = await buildScanToken('customer_1');
  return scanToken;
}

describe('scanner flow', () => {
  test('resolve does not consume token, commit consumes and is idempotent on retry', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);
    const qrData = await createToken();

    const resolved = await resolveScan._handler(ctx, {
      qrData,
      businessId: 'business_1',
      programId: 'program_1',
      actionType: 'stamp',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });

    expect(typeof resolved.scanSessionId).toBe('string');
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(0);

    const committed = await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(committed.currentStamps).toBe(3);
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(1);

    const committedAgain = await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(committedAgain).toEqual(committed);
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(1);

    const session = ctx.db.rows('scanSessions')[0];
    expect(session.status).toBe('committed');
  });

  test('technical commit failure keeps session ready and supports retry on same session', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 4,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);
    const qrData = await createToken();

    const resolved = await resolveScan._handler(ctx, {
      qrData,
      businessId: 'business_1',
      programId: 'program_1',
      actionType: 'stamp',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });

    ctx.db.failNextScanTokenLookup = true;
    await expect(
      commitStamp._handler(ctx, {
        scanSessionId: resolved.scanSessionId,
      })
    ).rejects.toThrow('TRANSIENT_DB_ERROR');

    const sessionAfterFailure = ctx.db.rows('scanSessions')[0];
    expect(sessionAfterFailure.status).toBe('ready');
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(0);

    const committed = await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(committed.currentStamps).toBe(5);
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(1);
    expect(ctx.db.rows('scanSessions')[0].status).toBe('committed');
  });

  test('business failure marks session failed_business and blocks retry on same session', async () => {
    const tables = baseTables({
      loyaltyPrograms: [buildProgram({ allowPosEnroll: false })],
    });
    const ctx = buildCtx(tables);
    const qrData = await createToken();

    const resolved = await resolveScan._handler(ctx, {
      qrData,
      businessId: 'business_1',
      programId: 'program_1',
      actionType: 'stamp',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });

    await expect(
      commitStamp._handler(ctx, {
        scanSessionId: resolved.scanSessionId,
      })
    ).rejects.toThrow('POS_ENROLL_DISABLED');

    const session = ctx.db.rows('scanSessions')[0];
    expect(session.status).toBe('failed_business');
    expect(session.failedCode).toBe('POS_ENROLL_DISABLED');
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(0);

    await expect(
      commitStamp._handler(ctx, {
        scanSessionId: resolved.scanSessionId,
      })
    ).rejects.toThrow('POS_ENROLL_DISABLED');
  });

  test('entitlement failure is terminal business failure and does not consume token', async () => {
    const now = Date.now();
    const membershipsAtLimit = Array.from({ length: 30 }, (_, index) => ({
      _id: `membership_limit_${index + 1}`,
      userId: `customer_limit_${index + 1}`,
      businessId: 'business_1',
      programId: 'program_1',
      currentStamps: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));

    const tables = baseTables({
      memberships: membershipsAtLimit,
    });
    const ctx = buildCtx(tables);
    const qrData = await createToken();

    const resolved = await resolveScan._handler(ctx, {
      qrData,
      businessId: 'business_1',
      programId: 'program_1',
      actionType: 'stamp',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });

    await expect(
      commitStamp._handler(ctx, {
        scanSessionId: resolved.scanSessionId,
      })
    ).rejects.toThrow();

    const session = ctx.db.rows('scanSessions')[0];
    expect(session.status).toBe('failed_business');
    expect(session.failedCode).toBe('PLAN_LIMIT_REACHED');
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(0);
  });

  test('undo within 30s reverts exactly once and duplicate undo is idempotent', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);

    const resolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      actionType: 'stamp',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    const commitResult = await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(commitResult.currentStamps).toBe(3);

    const targetEvent = ctx.db
      .rows('events')
      .find((event) => event.type === 'STAMP_ADDED');
    expect(targetEvent).toBeDefined();

    const undoResult = await undoLastScannerAction._handler(ctx, {
      eventId: targetEvent._id,
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    expect(undoResult.status).toBe('reverted');
    expect(undoResult.membership.currentStamps).toBe(2);

    const duplicateUndo = await undoLastScannerAction._handler(ctx, {
      eventId: targetEvent._id,
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    expect(duplicateUndo.status).toBe('already_reverted');
    expect(
      ctx.db
        .rows('events')
        .filter((event) => event.revertsEventId === targetEvent._id)
    ).toHaveLength(1);
  });

  test('undo after 30s fails', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);

    const resolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      actionType: 'stamp',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });

    const targetEvent = ctx.db
      .rows('events')
      .find((event) => event.type === 'STAMP_ADDED');
    targetEvent.createdAt = Date.now() - 31_000;

    await expect(
      undoLastScannerAction._handler(ctx, {
        eventId: targetEvent._id,
        scannerRuntimeSessionId: 'runtime_1',
        deviceId: 'device_1',
      })
    ).rejects.toThrow('UNDO_EXPIRED');
  });

  test('undo after a new scan starts fails', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);

    const resolvedFirst = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      actionType: 'stamp',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    await commitStamp._handler(ctx, {
      scanSessionId: resolvedFirst.scanSessionId,
    });
    const targetEvent = ctx.db
      .rows('events')
      .find((event) => event.type === 'STAMP_ADDED');

    await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      actionType: 'stamp',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });

    await expect(
      undoLastScannerAction._handler(ctx, {
        eventId: targetEvent._id,
        scannerRuntimeSessionId: 'runtime_1',
        deviceId: 'device_1',
      })
    ).rejects.toThrow('UNDO_SESSION_CONTINUITY_BROKEN');
  });

  test('undo fails when a newer membership balance event exists', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);

    const firstResolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      actionType: 'stamp',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    await commitStamp._handler(ctx, {
      scanSessionId: firstResolved.scanSessionId,
    });
    const firstEvent = ctx.db
      .rows('events')
      .find((event) => event.type === 'STAMP_ADDED');
    const membershipRow = ctx.db
      .rows('memberships')
      .find((membership) => membership._id === 'membership_1');
    membershipRow.lastStampAt = Date.now() - 61_000;

    const secondResolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      actionType: 'stamp',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    await commitStamp._handler(ctx, {
      scanSessionId: secondResolved.scanSessionId,
    });

    await expect(
      undoLastScannerAction._handler(ctx, {
        eventId: firstEvent._id,
        scannerRuntimeSessionId: 'runtime_1',
        deviceId: 'device_1',
      })
    ).rejects.toThrow('UNDO_NOT_LAST_MEMBERSHIP_EVENT');
  });

  test('undo supports redeem events', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 10,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          lastStampAt: now - 60_000,
        },
      ],
    });
    const ctx = buildCtx(tables);

    const resolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      actionType: 'redeem',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    const committed = await commitRedeem._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(committed.currentStamps).toBe(0);

    const redeemEvent = ctx.db
      .rows('events')
      .find((event) => event.type === 'REWARD_REDEEMED');
    const undo = await undoLastScannerAction._handler(ctx, {
      eventId: redeemEvent._id,
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    expect(undo.status).toBe('reverted');
    expect(undo.membership.currentStamps).toBe(10);
  });
});
