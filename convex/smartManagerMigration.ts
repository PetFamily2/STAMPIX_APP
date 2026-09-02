import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { markSmartManagerDirty } from './lib/smartManagerDirty';
import {
  hashSmartManagerValue,
  SMART_MANAGER_POLICY_SCHEMA_VERSION,
  SMART_MANAGER_POLICY_V1,
  SMART_MANAGER_POLICY_V1_HASH,
  SMART_MANAGER_POLICY_V1_VERSION,
} from './lib/smartManagerPolicy';

export const SMART_MANAGER_BATCH_1_MIGRATION_KEY =
  'smart_manager_batch_1_v1' as const;
export const SMART_MANAGER_BATCH_1_MIGRATION_VERSION = 1 as const;
export const SMART_MANAGER_MIGRATION_MAX_BUSINESSES_PER_PAGE = 25;
const SMART_MANAGER_MIGRATION_DEFAULT_PAGE_SIZE = 10;
const SMART_MANAGER_MIGRATION_DUPLICATE_CHUNK_SIZE = 25;
const SMART_MANAGER_MIGRATION_LEASE_MS = 5 * 60 * 1000;
const SMART_MANAGER_MIGRATION_AUDIT_RETENTION_MS =
  90 * 24 * 60 * 60 * 1000;
const SMART_MANAGER_MIGRATION_FAILURE_DETAIL_LIMIT = 300;
const ALL_DIRTY_DOMAINS = [
  'business',
  'profile',
  'programs',
  'memberships',
  'events',
  'campaigns',
  'team',
  'entitlements',
] as const;

type MigrationState = Doc<'smartManagerMigrations'>;
type MigrationPhase = MigrationState['phase'];
type RunnerArgs = { leaseToken: string; checkpointVersion: number };

const runMigrationPageRef = makeFunctionReference<
  'action',
  RunnerArgs,
  unknown
>('smartManagerMigration:runSmartManagerBatch1MigrationPageInternal');
const processMigrationPageRef = makeFunctionReference<
  'mutation',
  RunnerArgs,
  unknown
>('smartManagerMigration:processSmartManagerBatch1MigrationPageInternal');
const recordMigrationFailureRef = makeFunctionReference<
  'mutation',
  RunnerArgs & { failureCode: string; failureDetail: string },
  unknown
>('smartManagerMigration:recordSmartManagerBatch1MigrationFailureInternal');

function boundedPageSize(value: number | undefined) {
  const requested = Number.isFinite(value)
    ? Math.floor(value as number)
    : SMART_MANAGER_MIGRATION_DEFAULT_PAGE_SIZE;
  return Math.max(
    1,
    Math.min(
      SMART_MANAGER_MIGRATION_MAX_BUSINESSES_PER_PAGE,
      requested
    )
  );
}

function selectMigrationState(rows: MigrationState[]) {
  return [...rows].sort(
    (left, right) =>
      Number(right.checkpointVersion) - Number(left.checkpointVersion) ||
      Number(right.updatedAt) - Number(left.updatedAt) ||
      String(left._id).localeCompare(String(right._id))
  )[0] ?? null;
}

function ownsActiveMigrationRunnerIdentity(
  state: MigrationState,
  args: RunnerArgs
) {
  return (
    state.status === 'running' &&
    state.leaseToken !== undefined &&
    state.leaseToken === args.leaseToken &&
    state.checkpointVersion === args.checkpointVersion
  );
}

async function loadMigrationState(ctx: any, reconcileDuplicates = false) {
  const rows: MigrationState[] = await ctx.db
    .query('smartManagerMigrations')
    .withIndex('by_migrationKey', (q: any) =>
      q.eq('migrationKey', SMART_MANAGER_BATCH_1_MIGRATION_KEY)
    )
    .take(SMART_MANAGER_MIGRATION_DUPLICATE_CHUNK_SIZE);
  const state = selectMigrationState(rows);
  if (reconcileDuplicates && state) {
    for (const duplicate of rows) {
      if (String(duplicate._id) !== String(state._id)) {
        await ctx.db.delete(duplicate._id);
      }
    }
  }
  return state;
}

function selectFreshestGenerationRow(rows: any[]) {
  return [...rows].sort(
    (left, right) =>
      Number(right.sourceGeneration ?? right.generation ?? 0) -
        Number(left.sourceGeneration ?? left.generation ?? 0) ||
      Number(right.lastSuccessfulGeneration ?? 0) -
        Number(left.lastSuccessfulGeneration ?? 0) ||
      Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0) ||
      Number(right._creationTime ?? 0) - Number(left._creationTime ?? 0) ||
      String(left._id).localeCompare(String(right._id))
  )[0] ?? null;
}

function normalizedStrings(rows: any[], field: string, limit?: number) {
  const values = [
    ...new Set(
      rows.flatMap((row) =>
        Array.isArray(row[field]) ? row[field].map(String) : []
      )
    ),
  ].sort();
  return limit === undefined ? values : values.slice(-limit);
}

async function reconcileEvaluationStateChunk(
  ctx: any,
  businessId: Id<'businesses'>,
  now: number
) {
  const rows = await ctx.db
    .query('smartManagerEvaluationStates')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .take(SMART_MANAGER_MIGRATION_DUPLICATE_CHUNK_SIZE);
  const survivor = selectFreshestGenerationRow(rows);
  if (!survivor) {
    return { found: false, deleted: 0, done: true };
  }

  const generation = Math.max(
    ...rows.map((row: any) => Number(row.generation ?? 0))
  );
  const successfulRow = [...rows].sort(
    (left: any, right: any) =>
      Number(right.lastSuccessfulGeneration ?? 0) -
        Number(left.lastSuccessfulGeneration ?? 0) ||
      Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0)
  )[0];
  const leaseRow = [...rows]
    .filter(
      (row: any) =>
        row.leaseToken !== undefined &&
        Number(row.leaseGeneration) === generation
    )
    .sort(
      (left: any, right: any) =>
        Number(right.leaseExpiresAt ?? 0) - Number(left.leaseExpiresAt ?? 0)
    )[0];

  await ctx.db.patch(survivor._id, {
    dirtyAt: Math.min(...rows.map((row: any) => Number(row.dirtyAt ?? now))),
    dirtyDomains: normalizedStrings(rows, 'dirtyDomains'),
    dirtyReasons: normalizedStrings(rows, 'dirtyReasons', 20),
    generation,
    nextEvaluationAt: Math.min(
      ...rows.map((row: any) => Number(row.nextEvaluationAt ?? now))
    ),
    evaluationScheduledAt: rows.some(
      (row: any) => row.evaluationScheduledAt !== undefined
    )
      ? Math.min(
          ...rows
            .filter((row: any) => row.evaluationScheduledAt !== undefined)
            .map((row: any) => Number(row.evaluationScheduledAt))
        )
      : undefined,
    leaseToken: leaseRow?.leaseToken,
    leaseGeneration: leaseRow?.leaseGeneration,
    leaseExpiresAt: leaseRow?.leaseExpiresAt,
    leasePolicyVersion: leaseRow?.leasePolicyVersion,
    leasePolicyHash: leaseRow?.leasePolicyHash,
    attemptCount: Number(survivor.attemptCount ?? 0),
    attemptGeneration: generation,
    lastFactHash: successfulRow?.lastFactHash,
    lastSuccessfulGeneration: successfulRow?.lastSuccessfulGeneration,
    lastSuccessfulEvaluationAt: successfulRow?.lastSuccessfulEvaluationAt,
    failureCode: survivor.failureCode,
    failureDetail: survivor.failureDetail,
    // Keep semantic freshness comparable with rows that may be beyond this
    // chunk. The merged row will meet those rows again on the next bounded
    // pass, so stamping migration wall-clock time here could hide a fresher
    // same-generation historical row.
    updatedAt: Math.max(
      ...rows.map((row: any) => Number(row.updatedAt ?? 0))
    ),
  });

  let deleted = 0;
  for (const row of rows) {
    if (String(row._id) !== String(survivor._id)) {
      await ctx.db.delete(row._id);
      deleted += 1;
    }
  }
  return {
    found: true,
    deleted,
    done: rows.length < SMART_MANAGER_MIGRATION_DUPLICATE_CHUNK_SIZE,
  };
}

async function reconcileBusinessSingletonChunk(
  ctx: any,
  table: 'smartManagerFactSnapshots' | 'smartManagerShadowComparisons',
  businessId: Id<'businesses'>
) {
  const rows = await ctx.db
    .query(table)
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .take(SMART_MANAGER_MIGRATION_DUPLICATE_CHUNK_SIZE);
  const survivor = selectFreshestGenerationRow(rows);
  let deleted = 0;
  for (const row of rows) {
    if (survivor && String(row._id) !== String(survivor._id)) {
      await ctx.db.delete(row._id);
      deleted += 1;
    }
  }
  return {
    deleted,
    done: rows.length < SMART_MANAGER_MIGRATION_DUPLICATE_CHUNK_SIZE,
  };
}

async function reconcileDecisionStableIdChunk(
  ctx: any,
  businessId: Id<'businesses'>,
  stableId: string
) {
  const rows = await ctx.db
    .query('smartManagerDecisions')
    .withIndex('by_businessId_stableId', (q: any) =>
      q.eq('businessId', businessId).eq('stableId', stableId)
    )
    .take(SMART_MANAGER_MIGRATION_DUPLICATE_CHUNK_SIZE);
  const survivor = selectFreshestGenerationRow(rows);
  let deleted = 0;
  for (const row of rows) {
    if (survivor && String(row._id) !== String(survivor._id)) {
      await ctx.db.delete(row._id);
      deleted += 1;
    }
  }
  return {
    deleted,
    done: rows.length < SMART_MANAGER_MIGRATION_DUPLICATE_CHUNK_SIZE,
  };
}

async function reconcilePolicyChunk(ctx: any, now: number) {
  const rows = await ctx.db
    .query('smartManagerPolicyVersions')
    .withIndex('by_version', (q: any) =>
      q.eq('version', SMART_MANAGER_POLICY_V1_VERSION)
    )
    .take(SMART_MANAGER_MIGRATION_DUPLICATE_CHUNK_SIZE);
  if (rows.length === 0) {
    await ctx.db.insert('smartManagerPolicyVersions', {
      version: SMART_MANAGER_POLICY_V1_VERSION,
      schemaVersion: SMART_MANAGER_POLICY_SCHEMA_VERSION,
      policyHash: SMART_MANAGER_POLICY_V1_HASH,
      config: SMART_MANAGER_POLICY_V1,
      effectiveFrom: 0,
      reason: 'Canonical Batch 1 seed policy',
      createdAt: now,
    });
    return { deleted: 0, done: true };
  }
  for (const row of rows) {
    const computedHash = hashSmartManagerValue({
      schemaVersion: row.schemaVersion,
      version: row.version,
      config: row.config,
    });
    if (
      row.policyHash !== SMART_MANAGER_POLICY_V1_HASH ||
      computedHash !== SMART_MANAGER_POLICY_V1_HASH
    ) {
      throw new Error('SMART_MANAGER_POLICY_IMMUTABILITY_VIOLATION');
    }
  }
  const survivor = [...rows].sort(
    (left: any, right: any) =>
      Number(left.createdAt ?? left._creationTime ?? 0) -
        Number(right.createdAt ?? right._creationTime ?? 0) ||
      String(left._id).localeCompare(String(right._id))
  )[0];
  let deleted = 0;
  for (const row of rows) {
    if (String(row._id) !== String(survivor._id)) {
      await ctx.db.delete(row._id);
      deleted += 1;
    }
  }
  return {
    deleted,
    done: rows.length < SMART_MANAGER_MIGRATION_DUPLICATE_CHUNK_SIZE,
  };
}

function currentBusinessId(state: MigrationState) {
  return state.pendingBusinessIds[state.pendingBusinessIndex] ?? null;
}

function nextPhase(phase: MigrationPhase): MigrationPhase {
  switch (phase) {
    case 'evaluation_state':
      return 'fact_snapshot';
    case 'fact_snapshot':
      return 'shadow_comparison';
    case 'shadow_comparison':
      return 'decisions';
    case 'decisions':
      return 'initialize_business';
    default:
      return phase;
  }
}

function baseProgressPatch(state: MigrationState, now: number) {
  return {
    checkpointVersion: state.checkpointVersion + 1,
    leaseExpiresAt: now + SMART_MANAGER_MIGRATION_LEASE_MS,
    updatedAt: now,
  };
}

async function scheduleNextPage(
  ctx: any,
  leaseToken: string,
  checkpointVersion: number
) {
  await ctx.scheduler.runAfter(0, runMigrationPageRef, {
    leaseToken,
    checkpointVersion,
  });
}

async function completeOrAdvanceBusiness(
  ctx: any,
  state: MigrationState,
  args: RunnerArgs,
  now: number,
  deltas: { initialized: number; reconciled: number }
) {
  const nextIndex = state.pendingBusinessIndex + 1;
  const processedCount = state.processedCount + 1;
  const initializedCount = state.initializedCount + deltas.initialized;
  const reconciledCount = state.reconciledCount + deltas.reconciled;
  const base = baseProgressPatch(state, now);

  if (nextIndex < state.pendingBusinessIds.length) {
    await ctx.db.patch(state._id, {
      ...base,
      phase: 'evaluation_state',
      pendingBusinessIndex: nextIndex,
      currentBusinessHadEvaluationState: false,
      decisionAfterStableId: undefined,
      decisionStableId: undefined,
      processedCount,
      initializedCount,
      reconciledCount,
    });
    await scheduleNextPage(ctx, args.leaseToken, base.checkpointVersion);
    return { status: 'continued' as const };
  }

  if (state.pendingPageIsDone) {
    await ctx.db.patch(state._id, {
      ...base,
      status: 'completed',
      phase: 'load_business_page',
      businessCursor: state.pendingPageCursor,
      pendingBusinessIds: [],
      pendingBusinessIndex: 0,
      currentBusinessHadEvaluationState: false,
      decisionAfterStableId: undefined,
      decisionStableId: undefined,
      processedCount,
      initializedCount,
      reconciledCount,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      completedAt: now,
    });
    return { status: 'completed' as const };
  }

  await ctx.db.patch(state._id, {
    ...base,
    phase: 'load_business_page',
    businessCursor: state.pendingPageCursor,
    pendingBusinessIds: [],
    pendingBusinessIndex: 0,
    currentBusinessHadEvaluationState: false,
    decisionAfterStableId: undefined,
    decisionStableId: undefined,
    processedCount,
    initializedCount,
    reconciledCount,
  });
  await scheduleNextPage(ctx, args.leaseToken, base.checkpointVersion);
  return { status: 'continued' as const };
}

export const startSmartManagerBatch1MigrationInternal = internalMutation({
  args: { pageSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    let state = await loadMigrationState(ctx, true);
    if (state?.status === 'completed') {
      return { status: 'completed' as const, scheduled: false };
    }
    if (
      state?.status === 'running' &&
      state.leaseToken !== undefined &&
      Number(state.leaseExpiresAt ?? 0) > now
    ) {
      return { status: 'running' as const, scheduled: false };
    }

    const leaseToken = globalThis.crypto.randomUUID();
    if (!state) {
      const stateId = await ctx.db.insert('smartManagerMigrations', {
        migrationKey: SMART_MANAGER_BATCH_1_MIGRATION_KEY,
        migrationVersion: SMART_MANAGER_BATCH_1_MIGRATION_VERSION,
        status: 'running',
        phase: 'policy',
        businessCursor: null,
        pendingBusinessIds: [],
        pendingBusinessIndex: 0,
        pendingPageCursor: null,
        pendingPageIsDone: false,
        currentBusinessHadEvaluationState: false,
        decisionAfterStableId: undefined,
        decisionStableId: undefined,
        pageSize: boundedPageSize(args.pageSize),
        checkpointVersion: 1,
        processedCount: 0,
        initializedCount: 0,
        reconciledCount: 0,
        leaseToken,
        leaseExpiresAt: now + SMART_MANAGER_MIGRATION_LEASE_MS,
        failureCount: 0,
        lastFailureCode: undefined,
        lastFailureDetail: undefined,
        lastFailedAt: undefined,
        startedAt: now,
        updatedAt: now,
        completedAt: undefined,
      });
      const createdState = await ctx.db.get(stateId);
      if (!createdState) {
        throw new Error('SMART_MANAGER_MIGRATION_STATE_CREATE_FAILED');
      }
      state = createdState;
    } else {
      const checkpointVersion =
        state.status === 'retryable'
          ? state.checkpointVersion
          : state.checkpointVersion + 1;
      await ctx.db.patch(state._id, {
        status: 'running',
        pageSize: boundedPageSize(args.pageSize ?? state.pageSize),
        checkpointVersion,
        leaseToken,
        leaseExpiresAt: now + SMART_MANAGER_MIGRATION_LEASE_MS,
        lastFailureCode: undefined,
        lastFailureDetail: undefined,
        updatedAt: now,
      });
      state = { ...state, checkpointVersion };
    }
    if (!state) {
      throw new Error('SMART_MANAGER_MIGRATION_STATE_CREATE_FAILED');
    }
    await scheduleNextPage(ctx, leaseToken, state.checkpointVersion);
    return { status: 'running' as const, scheduled: true };
  },
});

export const processSmartManagerBatch1MigrationPageInternal = internalMutation({
  args: {
    leaseToken: v.string(),
    checkpointVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const state = await loadMigrationState(ctx, true);
    if (!state || !ownsActiveMigrationRunnerIdentity(state, args)) {
      return { status: 'stale_runner' as const };
    }
    if (Number(state.leaseExpiresAt ?? 0) <= now) {
      return { status: 'expired_lease' as const };
    }

    if (state.phase === 'policy') {
      const result = await reconcilePolicyChunk(ctx, now);
      const base = baseProgressPatch(state, now);
      await ctx.db.patch(state._id, {
        ...base,
        phase: result.done ? 'load_business_page' : 'policy',
        reconciledCount: state.reconciledCount + result.deleted,
      });
      await scheduleNextPage(ctx, args.leaseToken, base.checkpointVersion);
      return { status: 'continued' as const };
    }

    if (state.phase === 'load_business_page') {
      const page = await ctx.db
        .query('businesses')
        .withIndex('by_isActive', (q: any) => q.eq('isActive', true))
        .paginate({
          cursor: state.businessCursor,
          numItems: boundedPageSize(state.pageSize),
        });
      const base = baseProgressPatch(state, now);
      if (page.page.length === 0 && page.isDone) {
        await ctx.db.patch(state._id, {
          ...base,
          status: 'completed',
          businessCursor: state.businessCursor,
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          completedAt: now,
        });
        return { status: 'completed' as const };
      }
      await ctx.db.patch(state._id, {
        ...base,
        phase: page.page.length > 0 ? 'evaluation_state' : 'load_business_page',
        businessCursor:
          page.page.length > 0 ? state.businessCursor : page.continueCursor,
        pendingBusinessIds: page.page.map((business: any) => business._id),
        pendingBusinessIndex: 0,
        pendingPageCursor: page.continueCursor,
        pendingPageIsDone: page.isDone,
        currentBusinessHadEvaluationState: false,
      });
      await scheduleNextPage(ctx, args.leaseToken, base.checkpointVersion);
      return { status: 'continued' as const, loaded: page.page.length };
    }

    const businessId = currentBusinessId(state);
    if (!businessId) {
      throw new Error('SMART_MANAGER_MIGRATION_CHECKPOINT_INVALID');
    }
    const business = await ctx.db.get(businessId);
    if (!business || business.isActive !== true) {
      return await completeOrAdvanceBusiness(ctx, state, args, now, {
        initialized: 0,
        reconciled: 0,
      });
    }

    if (state.phase === 'evaluation_state') {
      const result = await reconcileEvaluationStateChunk(ctx, businessId, now);
      const base = baseProgressPatch(state, now);
      await ctx.db.patch(state._id, {
        ...base,
        phase: result.done ? nextPhase(state.phase) : state.phase,
        currentBusinessHadEvaluationState:
          state.currentBusinessHadEvaluationState || result.found,
        reconciledCount: state.reconciledCount + result.deleted,
      });
      await scheduleNextPage(ctx, args.leaseToken, base.checkpointVersion);
      return { status: 'continued' as const };
    }

    if (
      state.phase === 'fact_snapshot' ||
      state.phase === 'shadow_comparison'
    ) {
      const result = await reconcileBusinessSingletonChunk(
        ctx,
        state.phase === 'fact_snapshot'
          ? 'smartManagerFactSnapshots'
          : 'smartManagerShadowComparisons',
        businessId
      );
      const base = baseProgressPatch(state, now);
      await ctx.db.patch(state._id, {
        ...base,
        phase: result.done ? nextPhase(state.phase) : state.phase,
        reconciledCount: state.reconciledCount + result.deleted,
      });
      await scheduleNextPage(ctx, args.leaseToken, base.checkpointVersion);
      return { status: 'continued' as const };
    }

    if (state.phase === 'decisions') {
      let stableId = state.decisionStableId;
      if (!stableId) {
        const nextDecision = await ctx.db
          .query('smartManagerDecisions')
          .withIndex('by_businessId_stableId', (q: any) => {
            const businessQuery = q.eq('businessId', businessId);
            return state.decisionAfterStableId === undefined
              ? businessQuery
              : businessQuery.gt('stableId', state.decisionAfterStableId);
          })
          .first();
        if (!nextDecision) {
          const base = baseProgressPatch(state, now);
          await ctx.db.patch(state._id, {
            ...base,
            phase: nextPhase(state.phase),
            decisionAfterStableId: undefined,
            decisionStableId: undefined,
          });
          await scheduleNextPage(ctx, args.leaseToken, base.checkpointVersion);
          return { status: 'continued' as const };
        }
        stableId = nextDecision.stableId;
      }
      const result = await reconcileDecisionStableIdChunk(
        ctx,
        businessId,
        stableId
      );
      const base = baseProgressPatch(state, now);
      await ctx.db.patch(state._id, {
        ...base,
        decisionAfterStableId: result.done
          ? stableId
          : state.decisionAfterStableId,
        decisionStableId: result.done ? undefined : stableId,
        reconciledCount: state.reconciledCount + result.deleted,
      });
      await scheduleNextPage(ctx, args.leaseToken, base.checkpointVersion);
      return { status: 'continued' as const };
    }

    const dirtyResult = await markSmartManagerDirty(ctx, {
      businessId,
      domains: [...ALL_DIRTY_DOMAINS],
      reasons: [SMART_MANAGER_BATCH_1_MIGRATION_KEY],
      now,
    });
    let initialized = 0;
    if (dirtyResult.created) {
      initialized = 1;
      const existingAudit = await ctx.db
        .query('smartManagerAuditEvents')
        .withIndex('by_businessId_eventType', (q: any) =>
          q
            .eq('businessId', businessId)
            .eq('eventType', 'migration_initialized')
        )
        .take(2);
      if (existingAudit.length === 0) {
        await ctx.db.insert('smartManagerAuditEvents', {
          businessId,
          eventType: 'migration_initialized',
          sourceGeneration: Number(dirtyResult.generation ?? 1),
          policyVersion: SMART_MANAGER_POLICY_V1_VERSION,
          policyHash: SMART_MANAGER_POLICY_V1_HASH,
          detail: {
            migrationKey: SMART_MANAGER_BATCH_1_MIGRATION_KEY,
            migrationVersion: SMART_MANAGER_BATCH_1_MIGRATION_VERSION,
          },
          expiresAt: now + SMART_MANAGER_MIGRATION_AUDIT_RETENTION_MS,
          createdAt: now,
        });
      }
    }
    return await completeOrAdvanceBusiness(ctx, state, args, now, {
      initialized,
      reconciled: 0,
    });
  },
});

export const runSmartManagerBatch1MigrationPageInternal = internalAction({
  args: {
    leaseToken: v.string(),
    checkpointVersion: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      const result: any = await ctx.runMutation(processMigrationPageRef, args);
      if (result?.status === 'expired_lease') {
        await ctx.runMutation(recordMigrationFailureRef, {
          ...args,
          failureCode: 'MIGRATION_LEASE_EXPIRED',
          failureDetail: 'Migration continuation reached an expired lease.',
        });
      }
      return result;
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'UNKNOWN_MIGRATION_FAILURE';
      await ctx.runMutation(recordMigrationFailureRef, {
        ...args,
        failureCode: 'MIGRATION_PAGE_FAILED',
        failureDetail: detail.slice(
          0,
          SMART_MANAGER_MIGRATION_FAILURE_DETAIL_LIMIT
        ),
      });
      return { status: 'retryable' as const };
    }
  },
});

export const recordSmartManagerBatch1MigrationFailureInternal =
  internalMutation({
    args: {
      leaseToken: v.string(),
      checkpointVersion: v.number(),
      failureCode: v.string(),
      failureDetail: v.string(),
    },
    handler: async (ctx, args) => {
      const state = await loadMigrationState(ctx, true);
      if (!state || state.status === 'completed') {
        return { status: 'stale_runner' as const };
      }
      if (!ownsActiveMigrationRunnerIdentity(state, args)) {
        return { status: 'stale_runner' as const };
      }
      const now = Date.now();
      await ctx.db.patch(state._id, {
        status: 'retryable',
        checkpointVersion: state.checkpointVersion + 1,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        failureCount: state.failureCount + 1,
        lastFailureCode: args.failureCode.slice(0, 80),
        lastFailureDetail: args.failureDetail.slice(
          0,
          SMART_MANAGER_MIGRATION_FAILURE_DETAIL_LIMIT
        ),
        lastFailedAt: now,
        updatedAt: now,
      });
      return { status: 'retryable' as const };
    },
  });

export const getSmartManagerBatch1MigrationStatusInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const state = await loadMigrationState(ctx);
    if (!state) {
      return {
        migrationKey: SMART_MANAGER_BATCH_1_MIGRATION_KEY,
        migrationVersion: SMART_MANAGER_BATCH_1_MIGRATION_VERSION,
        status: 'not_started' as const,
        processedCount: 0,
        initializedCount: 0,
        reconciledCount: 0,
        failureCount: 0,
        startedAt: null,
        updatedAt: null,
        completedAt: null,
        lastFailureCode: null,
        lastFailedAt: null,
      };
    }
    const status =
      state.status === 'running' &&
      Number(state.leaseExpiresAt ?? 0) <= Date.now()
        ? ('retryable' as const)
        : state.status;
    return {
      migrationKey: state.migrationKey,
      migrationVersion: state.migrationVersion,
      status,
      processedCount: state.processedCount,
      initializedCount: state.initializedCount,
      reconciledCount: state.reconciledCount,
      failureCount: state.failureCount,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      completedAt: state.completedAt ?? null,
      lastFailureCode: state.lastFailureCode ?? null,
      lastFailedAt: state.lastFailedAt ?? null,
    };
  },
});
