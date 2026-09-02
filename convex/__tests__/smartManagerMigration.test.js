import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  getSmartManagerBatch1MigrationStatusInternal,
  processSmartManagerBatch1MigrationPageInternal,
  recordSmartManagerBatch1MigrationFailureInternal,
  SMART_MANAGER_BATCH_1_MIGRATION_KEY,
  SMART_MANAGER_MIGRATION_MAX_BUSINESSES_PER_PAGE,
  startSmartManagerBatch1MigrationInternal,
} from '../smartManagerMigration';
import {
  SMART_MANAGER_POLICY_SCHEMA_VERSION,
  SMART_MANAGER_POLICY_V1,
  SMART_MANAGER_POLICY_V1_HASH,
  SMART_MANAGER_POLICY_V1_VERSION,
} from '../lib/smartManagerPolicy';

const NOW = 1_900_000_000_000;

class FakeQuery {
  constructor(db, tableName, predicates = []) {
    this.db = db;
    this.tableName = tableName;
    this.predicates = predicates;
  }

  withIndex(_name, builder) {
    const predicates = [];
    const q = {
      eq: (field, value) => {
        predicates.push((row) => row[field] === value);
        return q;
      },
      gt: (field, value) => {
        predicates.push((row) => row[field] > value);
        return q;
      },
    };
    builder(q);
    return new FakeQuery(this.db, this.tableName, [
      ...this.predicates,
      (row) => predicates.every((predicate) => predicate(row)),
    ]);
  }

  rows() {
    const rows = (this.db.tables[this.tableName] ?? []).filter((row) =>
      this.predicates.every((predicate) => predicate(row))
    );
    if (this.tableName === 'smartManagerDecisions') {
      return [...rows].sort(
        (left, right) =>
          String(left.stableId).localeCompare(String(right.stableId)) ||
          String(left._id).localeCompare(String(right._id))
      );
    }
    return rows;
  }

  async first() {
    return this.rows()[0] ?? null;
  }

  async take(limit) {
    return this.rows().slice(0, limit);
  }

  async paginate({ cursor, numItems }) {
    this.db.paginations.push({
      tableName: this.tableName,
      cursor,
      numItems,
    });
    const rows = this.rows();
    const start = cursor === null ? 0 : Number(cursor);
    const end = Math.min(rows.length, start + numItems);
    return {
      page: rows.slice(start, end),
      continueCursor: String(end),
      isDone: end >= rows.length,
    };
  }
}

function buildCtx(seed = {}) {
  const tables = {
    businesses: [],
    smartManagerMigrations: [],
    smartManagerPolicyVersions: [],
    smartManagerEvaluationStates: [],
    smartManagerFactSnapshots: [],
    smartManagerShadowComparisons: [],
    smartManagerDecisions: [],
    smartManagerAuditEvents: [],
    ...seed,
  };
  let id = 0;
  const scheduled = [];
  const queried = [];
  const paginations = [];
  const db = {
    tables,
    paginations,
    query(tableName) {
      queried.push(tableName);
      return new FakeQuery(db, tableName);
    },
    async get(rowId) {
      for (const rows of Object.values(tables)) {
        const row = rows.find((candidate) => candidate._id === rowId);
        if (row) return row;
      }
      return null;
    },
    async insert(tableName, value) {
      const rowId = `${tableName}_${++id}`;
      tables[tableName] ??= [];
      tables[tableName].push({ _id: rowId, ...value });
      return rowId;
    },
    async patch(rowId, patch) {
      const row = await this.get(rowId);
      if (!row) throw new Error(`PATCH_TARGET_NOT_FOUND:${rowId}`);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete row[key];
        else row[key] = value;
      }
    },
    async delete(rowId) {
      for (const rows of Object.values(tables)) {
        const index = rows.findIndex((candidate) => candidate._id === rowId);
        if (index >= 0) {
          rows.splice(index, 1);
          return;
        }
      }
      throw new Error(`DELETE_TARGET_NOT_FOUND:${rowId}`);
    },
  };
  return {
    db,
    scheduler: {
      runAfter: async (delay, _reference, args) => {
        scheduled.push({ delay, args });
      },
    },
    tables,
    scheduled,
    queried,
    paginations,
  };
}

function migrationState(overrides = {}) {
  return {
    _id: 'migration_1',
    migrationKey: SMART_MANAGER_BATCH_1_MIGRATION_KEY,
    migrationVersion: 1,
    status: 'running',
    phase: 'load_business_page',
    businessCursor: null,
    pendingBusinessIds: [],
    pendingBusinessIndex: 0,
    pendingPageCursor: null,
    pendingPageIsDone: false,
    currentBusinessHadEvaluationState: false,
    pageSize: 10,
    checkpointVersion: 4,
    processedCount: 0,
    initializedCount: 0,
    reconciledCount: 0,
    leaseToken: 'lease_current',
    leaseExpiresAt: NOW + 60_000,
    failureCount: 0,
    startedAt: NOW - 1_000,
    updatedAt: NOW - 1_000,
    ...overrides,
  };
}

function evaluationState(overrides = {}) {
  return {
    _id: 'evaluation_1',
    businessId: 'business_1',
    dirtyAt: NOW - 1_000,
    dirtyDomains: ['business'],
    dirtyReasons: ['existing'],
    generation: 1,
    nextEvaluationAt: NOW + 1_000,
    attemptCount: 0,
    attemptGeneration: 1,
    createdAt: NOW - 1_000,
    updatedAt: NOW - 1_000,
    ...overrides,
  };
}

function policyRow(overrides = {}) {
  return {
    _id: 'policy_1',
    version: SMART_MANAGER_POLICY_V1_VERSION,
    schemaVersion: SMART_MANAGER_POLICY_SCHEMA_VERSION,
    policyHash: SMART_MANAGER_POLICY_V1_HASH,
    config: SMART_MANAGER_POLICY_V1,
    effectiveFrom: 0,
    reason: 'Canonical Batch 1 seed policy',
    createdAt: NOW - 1_000,
    ...overrides,
  };
}

async function fixedNow(callback) {
  const original = Date.now;
  Date.now = () => NOW;
  try {
    return await callback();
  } finally {
    Date.now = original;
  }
}

function runnerArgs(state) {
  return {
    leaseToken: state.leaseToken,
    checkpointVersion: state.checkpointVersion,
  };
}

function migrationContinuations(ctx) {
  return ctx.scheduled.filter(
    (entry) => entry.args.checkpointVersion !== undefined
  );
}

describe('Smart Manager Batch 1 migration orchestration', () => {
  test('start is idempotent and clamps the fleet page to the hard maximum', async () => {
    const ctx = buildCtx();
    await fixedNow(() =>
      startSmartManagerBatch1MigrationInternal._handler(ctx, { pageSize: 500 })
    );
    await fixedNow(() =>
      startSmartManagerBatch1MigrationInternal._handler(ctx, { pageSize: 1 })
    );

    expect(ctx.tables.smartManagerMigrations).toHaveLength(1);
    expect(ctx.tables.smartManagerMigrations[0].pageSize).toBe(
      SMART_MANAGER_MIGRATION_MAX_BUSINESSES_PER_PAGE
    );
    expect(migrationContinuations(ctx)).toHaveLength(1);
  });

  test(
    'loads an indexed bounded business page and rejects a replayed continuation',
    async () => {
      const state = migrationState({ pageSize: 25 });
      const businesses = Array.from({ length: 40 }, (_, index) => ({
        _id: `business_${index}`,
        isActive: true,
      }));
      const ctx = buildCtx({
        businesses,
        smartManagerMigrations: [state],
      });
      const args = runnerArgs(state);
      const first = await fixedNow(() =>
        processSmartManagerBatch1MigrationPageInternal._handler(ctx, args)
      );
      const replay = await fixedNow(() =>
        processSmartManagerBatch1MigrationPageInternal._handler(ctx, args)
      );

      expect(first).toMatchObject({ status: 'continued', loaded: 25 });
      expect(replay).toEqual({ status: 'stale_runner' });
      expect(ctx.paginations).toEqual([
        { tableName: 'businesses', cursor: null, numItems: 25 },
      ]);
      expect(
        ctx.tables.smartManagerMigrations[0].pendingBusinessIds
      ).toHaveLength(25);
      expect(migrationContinuations(ctx)).toHaveLength(1);
    }
  );

  test(
    'advances the cursor only after committed business work and schedules one continuation',
    async () => {
      const state = migrationState({
        phase: 'initialize_business',
        pendingBusinessIds: ['business_1'],
        pendingPageCursor: '25',
        pendingPageIsDone: false,
      });
      const ctx = buildCtx({
        businesses: [{ _id: 'business_1', isActive: true }],
        smartManagerMigrations: [state],
        smartManagerEvaluationStates: [evaluationState()],
      });
      await fixedNow(() =>
        processSmartManagerBatch1MigrationPageInternal._handler(
          ctx,
          runnerArgs(state)
        )
      );

      expect(ctx.tables.smartManagerMigrations[0]).toMatchObject({
        phase: 'load_business_page',
        businessCursor: '25',
        processedCount: 1,
      });
      expect(migrationContinuations(ctx)).toHaveLength(1);
    }
  );

  test('recovers a stale lease with a new claim and rejects the old worker', async () => {
    const state = migrationState({ leaseExpiresAt: NOW - 1 });
    const ctx = buildCtx({ smartManagerMigrations: [state] });
    await fixedNow(() =>
      startSmartManagerBatch1MigrationInternal._handler(ctx, {})
    );
    const current = ctx.tables.smartManagerMigrations[0];
    expect(current.leaseToken).not.toBe('lease_current');
    expect(current.checkpointVersion).toBe(5);
    const stale = await fixedNow(() =>
      processSmartManagerBatch1MigrationPageInternal._handler(ctx, {
        leaseToken: 'lease_current',
        checkpointVersion: 4,
      })
    );
    expect(stale).toEqual({ status: 'stale_runner' });
  });

  test(
    'resumes a failed checkpoint without resetting counters or accepting the failed worker',
    async () => {
      const state = migrationState({
        processedCount: 7,
        initializedCount: 3,
        reconciledCount: 9,
      });
      const supersededRunnerArgs = runnerArgs(state);
      const ctx = buildCtx({ smartManagerMigrations: [state] });
      await fixedNow(() =>
        recordSmartManagerBatch1MigrationFailureInternal._handler(ctx, {
          ...supersededRunnerArgs,
          failureCode: 'INJECTED',
          failureDetail: 'interrupted after the previous committed page',
        })
      );
      await fixedNow(() =>
        startSmartManagerBatch1MigrationInternal._handler(ctx, {})
      );
      const resumed = ctx.tables.smartManagerMigrations[0];
      expect(resumed).toMatchObject({
        status: 'running',
        processedCount: 7,
        initializedCount: 3,
        reconciledCount: 9,
        failureCount: 1,
        checkpointVersion: 5,
      });
      expect(migrationContinuations(ctx)).toHaveLength(1);
      const writesBeforeStaleFailure = ctx.tables.smartManagerMigrations[0].updatedAt;
      const staleFailure = await fixedNow(() =>
        recordSmartManagerBatch1MigrationFailureInternal._handler(ctx, {
          ...supersededRunnerArgs,
          failureCode: 'LATE_FAILURE',
          failureDetail: 'stale worker response',
        })
      );
      expect(staleFailure).toEqual({ status: 'stale_runner' });
      expect(resumed.failureCount).toBe(1);
      expect(resumed.checkpointVersion).toBe(5);
      expect(resumed.updatedAt).toBe(writesBeforeStaleFailure);
    }
  );

  test(
    'initializes and audits a new business exactly once without loading fact sources',
    async () => {
      const state = migrationState({
        phase: 'initialize_business',
        pendingBusinessIds: ['business_1'],
        pendingPageCursor: '1',
        pendingPageIsDone: true,
      });
      const ctx = buildCtx({
        businesses: [{ _id: 'business_1', isActive: true }],
        smartManagerMigrations: [state],
      });
      const args = runnerArgs(state);
      const result = await fixedNow(() =>
        processSmartManagerBatch1MigrationPageInternal._handler(ctx, args)
      );
      const replay = await fixedNow(() =>
        processSmartManagerBatch1MigrationPageInternal._handler(ctx, args)
      );

      expect(result).toEqual({ status: 'completed' });
      expect(replay).toEqual({ status: 'stale_runner' });
      expect(ctx.tables.smartManagerEvaluationStates).toHaveLength(1);
      expect(ctx.tables.smartManagerAuditEvents).toHaveLength(1);
      expect(ctx.tables.smartManagerAuditEvents[0]).toMatchObject({
        businessId: 'business_1',
        eventType: 'migration_initialized',
        detail: {
          migrationKey: SMART_MANAGER_BATCH_1_MIGRATION_KEY,
          migrationVersion: 1,
        },
      });
      expect(ctx.tables.smartManagerMigrations[0]).toMatchObject({
        status: 'completed',
        processedCount: 1,
        initializedCount: 1,
      });
      expect(ctx.queried).not.toEqual(
        expect.arrayContaining([
          'loyaltyPrograms',
          'memberships',
          'events',
          'campaigns',
        ])
      );
    }
  );

  test('dirties an already initialized business without a migration audit', async () => {
    const state = migrationState({
      phase: 'initialize_business',
      pendingBusinessIds: ['business_1'],
      pendingPageIsDone: true,
    });
    const ctx = buildCtx({
      businesses: [{ _id: 'business_1', isActive: true }],
      smartManagerMigrations: [state],
      smartManagerEvaluationStates: [evaluationState()],
    });
    await fixedNow(() =>
      processSmartManagerBatch1MigrationPageInternal._handler(
        ctx,
        runnerArgs(state)
      )
    );
    expect(ctx.tables.smartManagerEvaluationStates[0].generation).toBe(2);
    expect(ctx.tables.smartManagerAuditEvents).toHaveLength(0);
    expect(ctx.tables.smartManagerMigrations[0].initializedCount).toBe(0);
  });

  test('converges duplicate evaluation state on the newest generation', async () => {
    const state = migrationState({
      phase: 'evaluation_state',
      pendingBusinessIds: ['business_1'],
    });
    const ctx = buildCtx({
      businesses: [{ _id: 'business_1', isActive: true }],
      smartManagerMigrations: [state],
      smartManagerEvaluationStates: [
        evaluationState({ _id: 'old', generation: 1 }),
        evaluationState({ _id: 'new', generation: 4, updatedAt: NOW - 10 }),
      ],
    });
    await fixedNow(() =>
      processSmartManagerBatch1MigrationPageInternal._handler(
        ctx,
        runnerArgs(state)
      )
    );
    expect(ctx.tables.smartManagerEvaluationStates).toHaveLength(1);
    expect(ctx.tables.smartManagerEvaluationStates[0]).toMatchObject({
      _id: 'new',
      generation: 4,
    });
    expect(ctx.tables.smartManagerMigrations[0].reconciledCount).toBe(1);
  });

  test('continues duplicate convergence beyond one 25-row chunk', async () => {
    const state = migrationState({
      phase: 'evaluation_state',
      pendingBusinessIds: ['business_1'],
    });
    const ctx = buildCtx({
      businesses: [{ _id: 'business_1', isActive: true }],
      smartManagerMigrations: [state],
      smartManagerEvaluationStates: Array.from({ length: 30 }, (_, index) =>
        evaluationState({
          _id: `evaluation_${index}`,
          generation: index + 1,
          updatedAt: NOW - (30 - index),
        })
      ),
    });
    await fixedNow(() =>
      processSmartManagerBatch1MigrationPageInternal._handler(
        ctx,
        runnerArgs(state)
      )
    );
    const continuation = migrationContinuations(ctx)[0].args;
    expect(ctx.tables.smartManagerEvaluationStates).toHaveLength(6);
    expect(ctx.tables.smartManagerMigrations[0].phase).toBe('evaluation_state');
    await fixedNow(() =>
      processSmartManagerBatch1MigrationPageInternal._handler(
        ctx,
        continuation
      )
    );
    expect(ctx.tables.smartManagerEvaluationStates).toEqual([
      expect.objectContaining({ generation: 30 }),
    ]);
    expect(ctx.tables.smartManagerMigrations[0]).toMatchObject({
      phase: 'fact_snapshot',
      reconciledCount: 29,
    });
  });

  test.each([
    ['fact_snapshot', 'smartManagerFactSnapshots'],
    ['shadow_comparison', 'smartManagerShadowComparisons'],
  ])(
    'converges duplicate %s rows on freshest semantic state',
    async (phase, table) => {
      const state = migrationState({
        phase,
        pendingBusinessIds: ['business_1'],
      });
      const ctx = buildCtx({
        businesses: [{ _id: 'business_1', isActive: true }],
        smartManagerMigrations: [state],
        [table]: [
          {
            _id: 'old',
            businessId: 'business_1',
            sourceGeneration: 2,
            updatedAt: NOW - 100,
          },
          {
            _id: 'new',
            businessId: 'business_1',
            sourceGeneration: 5,
            updatedAt: NOW - 10,
          },
        ],
      });
      await fixedNow(() =>
        processSmartManagerBatch1MigrationPageInternal._handler(
          ctx,
          runnerArgs(state)
        )
      );
      expect(ctx.tables[table]).toEqual([
        expect.objectContaining({ _id: 'new', sourceGeneration: 5 }),
      ]);
    }
  );

  test('converges duplicate decisions per business and stableId', async () => {
    const state = migrationState({
      phase: 'decisions',
      pendingBusinessIds: ['business_1'],
    });
    const ctx = buildCtx({
      businesses: [{ _id: 'business_1', isActive: true }],
      smartManagerMigrations: [state],
      smartManagerDecisions: [
        {
          _id: 'old',
          businessId: 'business_1',
          stableId: 'setup.profile.complete',
          sourceGeneration: 1,
          updatedAt: NOW - 100,
        },
        {
          _id: 'new',
          businessId: 'business_1',
          stableId: 'setup.profile.complete',
          sourceGeneration: 3,
          updatedAt: NOW - 10,
        },
      ],
    });
    await fixedNow(() =>
      processSmartManagerBatch1MigrationPageInternal._handler(
        ctx,
        runnerArgs(state)
      )
    );
    expect(ctx.tables.smartManagerDecisions).toEqual([
      expect.objectContaining({ _id: 'new', sourceGeneration: 3 }),
    ]);
    expect(ctx.tables.smartManagerMigrations[0].decisionAfterStableId).toBe(
      'setup.profile.complete'
    );
  });

  test('converges immutable V1 policy duplicates deterministically', async () => {
    const state = migrationState({ phase: 'policy' });
    const ctx = buildCtx({
      smartManagerMigrations: [state],
      smartManagerPolicyVersions: [
        policyRow({ _id: 'policy_old', createdAt: NOW - 1_000 }),
        policyRow({ _id: 'policy_new', createdAt: NOW - 100 }),
      ],
    });
    await fixedNow(() =>
      processSmartManagerBatch1MigrationPageInternal._handler(
        ctx,
        runnerArgs(state)
      )
    );
    expect(ctx.tables.smartManagerPolicyVersions).toEqual([
      expect.objectContaining({ _id: 'policy_old' }),
    ]);
    expect(ctx.tables.smartManagerMigrations[0]).toMatchObject({
      phase: 'load_business_page',
      reconciledCount: 1,
    });
  });

  test('final completion and operational status never move backward', async () => {
    const state = migrationState({
      phase: 'load_business_page',
      businessCursor: '1',
      processedCount: 1,
    });
    const ctx = buildCtx({ smartManagerMigrations: [state] });
    const args = runnerArgs(state);
    await fixedNow(() =>
      processSmartManagerBatch1MigrationPageInternal._handler(ctx, args)
    );
    await fixedNow(() =>
      processSmartManagerBatch1MigrationPageInternal._handler(ctx, args)
    );
    const status = await getSmartManagerBatch1MigrationStatusInternal._handler(
      ctx,
      {}
    );
    expect(status).toMatchObject({
      status: 'completed',
      processedCount: 1,
      completedAt: NOW,
    });
    expect(ctx.tables.smartManagerMigrations[0].businessCursor).toBe('1');
    expect(migrationContinuations(ctx)).toHaveLength(0);
  });

  test('status reports not_started without creating migration state', async () => {
    const ctx = buildCtx();
    const status = await getSmartManagerBatch1MigrationStatusInternal._handler(
      ctx,
      {}
    );
    expect(status).toMatchObject({
      migrationKey: SMART_MANAGER_BATCH_1_MIGRATION_KEY,
      status: 'not_started',
      processedCount: 0,
    });
    expect(ctx.tables.smartManagerMigrations).toHaveLength(0);
  });

  test(
    'runner source has no unbounded fleet collect and does not cut over live recommendations',
    () => {
      const migrationSource = readFileSync(
        new URL('../smartManagerMigration.ts', import.meta.url),
        'utf8'
      );
      const recommendationSource = readFileSync(
        new URL('../recommendations.ts', import.meta.url),
        'utf8'
      );
      expect(migrationSource).not.toContain("query('businesses').collect(");
      expect(migrationSource).not.toContain('loadBusinessRecommendationFacts');
      expect(migrationSource).not.toContain("from './recommendations'");
      expect(recommendationSource).toContain(
        'loadBusinessRecommendationFacts'
      );
    }
  );
});
