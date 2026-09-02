import { makeFunctionReference } from 'convex/server';
import type { Id } from '../_generated/dataModel';

const MAX_DIRTY_REASONS = 20;
const MAX_SINGLETON_RECONCILIATION_ROWS = 25;

export type SmartManagerDirtyDomain =
  | 'business'
  | 'profile'
  | 'programs'
  | 'memberships'
  | 'events'
  | 'campaigns'
  | 'team'
  | 'entitlements';

const evaluateDirtyBusinessRef = makeFunctionReference<
  'action',
  { businessId: Id<'businesses'> },
  any
>('smartManager:evaluateDirtyBusinessInternal');

function normalizeDirtyReasons(existing: string[], incoming: string[]) {
  return [
    ...new Set(
      [...existing, ...incoming].map((reason) => reason.slice(0, 80))
    ),
  ]
    .sort()
    .slice(-MAX_DIRTY_REASONS);
}

function normalizeDirtyDomains(
  existing: SmartManagerDirtyDomain[],
  incoming: SmartManagerDirtyDomain[]
) {
  return [...new Set([...existing, ...incoming])].sort();
}

function selectDeterministicState(rows: any[]) {
  return [...rows].sort(
    (left, right) =>
      Number(left._creationTime ?? 0) - Number(right._creationTime ?? 0) ||
      String(left._id).localeCompare(String(right._id))
  )[0] ?? null;
}

export async function scheduleSmartManagerEvaluation(
  ctx: any,
  businessId: Id<'businesses'>,
  delayMs = 0
) {
  if (!ctx.scheduler?.runAfter) {
    return;
  }
  await ctx.scheduler.runAfter(Math.max(0, delayMs), evaluateDirtyBusinessRef, {
    businessId,
  });
}

export async function markSmartManagerDirty(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    domains: SmartManagerDirtyDomain[];
    reasons: string[];
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  // Convex mutation contexts always provide the scheduler. The guard keeps
  // pure unit-test contexts and offline source tooling backward-compatible.
  if (!ctx.scheduler?.runAfter) {
    return { generation: null, scheduled: false, created: false } as const;
  }
  const existingRows = await ctx.db
    .query('smartManagerEvaluationStates')
    .withIndex('by_businessId', (q: any) =>
      q.eq('businessId', args.businessId)
    )
    .take(MAX_SINGLETON_RECONCILIATION_ROWS);
  const existing = selectDeterministicState(existingRows);

  if (!existing) {
    await ctx.db.insert('smartManagerEvaluationStates', {
      businessId: args.businessId,
      dirtyAt: now,
      dirtyDomains: normalizeDirtyDomains([], args.domains),
      dirtyReasons: normalizeDirtyReasons([], args.reasons),
      generation: 1,
      nextEvaluationAt: now,
      evaluationScheduledAt: now,
      leaseToken: undefined,
      leaseGeneration: undefined,
      leaseExpiresAt: undefined,
      attemptCount: 0,
      attemptGeneration: 1,
      lastFactHash: undefined,
      lastSuccessfulGeneration: undefined,
      lastSuccessfulEvaluationAt: undefined,
      failureCode: undefined,
      failureDetail: undefined,
      createdAt: now,
      updatedAt: now,
    });
    await scheduleSmartManagerEvaluation(ctx, args.businessId);
    return { generation: 1, scheduled: true, created: true } as const;
  }

  const duplicateRows = existingRows.filter(
    (row: any) => String(row._id) !== String(existing._id)
  );
  const mergedExistingDomains = normalizeDirtyDomains(
    existing.dirtyDomains,
    duplicateRows.flatMap((row: any) => row.dirtyDomains ?? [])
  );
  const mergedExistingReasons = normalizeDirtyReasons(
    existing.dirtyReasons,
    duplicateRows.flatMap((row: any) => row.dirtyReasons ?? [])
  );
  const highestExistingGeneration = Math.max(
    Number(existing.generation),
    ...duplicateRows.map((row: any) => Number(row.generation ?? 0))
  );
  for (const duplicate of duplicateRows) {
    await ctx.db.delete(duplicate._id);
  }

  const shouldScheduleImmediately =
    existing.evaluationScheduledAt === undefined ||
    existing.nextEvaluationAt > now;
  const nextGeneration = highestExistingGeneration + 1;
  await ctx.db.patch(existing._id, {
    dirtyAt: now,
    dirtyDomains: normalizeDirtyDomains(mergedExistingDomains, args.domains),
    dirtyReasons: normalizeDirtyReasons(mergedExistingReasons, args.reasons),
    generation: nextGeneration,
    attemptCount: 0,
    attemptGeneration: nextGeneration,
    nextEvaluationAt: now,
    evaluationScheduledAt: shouldScheduleImmediately
      ? now
      : existing.evaluationScheduledAt,
    failureCode: undefined,
    failureDetail: undefined,
    updatedAt: now,
  });
  if (shouldScheduleImmediately) {
    await scheduleSmartManagerEvaluation(ctx, args.businessId);
  }
  return {
    generation: nextGeneration,
    scheduled: shouldScheduleImmediately,
    created: false,
  } as const;
}
