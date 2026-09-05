import { v } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import type { Doc } from './_generated/dataModel';
import { internalMutation, query } from './_generated/server';
import { requireActorIsActiveStaffForBusiness } from './guards';
import { requirePreparedWinbackAuthorization } from './lib/smartManagerPreparedActions';
import {
  isQualifyingSmartManagerReturnEvent,
  SMART_MANAGER_OUTCOME_DIRTY_BATCH_SIZE,
  SMART_MANAGER_OUTCOME_EVENT_BATCH_SIZE,
  SMART_MANAGER_OUTCOME_EXPIRY_BATCH_SIZE,
  SMART_MANAGER_OUTCOME_CLEANUP_BATCH_SIZE,
  SMART_MANAGER_OUTCOME_CONTINUATION_DELAY_MS,
  SMART_MANAGER_OUTCOME_REVERSAL_BATCH_SIZE,
  SMART_MANAGER_OUTCOME_RETENTION_MS,
  SMART_MANAGER_OVERLAP_LIMIT,
  SMART_MANAGER_BINDING_VALIDATION_LIMIT,
  smartManagerRecipientBindingsAreStructurallyValid,
  sortEligibleLastTouchOutcomes,
  markSmartManagerOutcomeDirty,
  normalizeSmartManagerOutcomeCounters,
  transitionSmartManagerOutcomeState,
  shouldContinueSmartManagerOutcomeSweep,
} from './lib/smartManagerOutcomes';

const OUTCOME_SINGLETON_LIMIT = 2;
const outcomeSweepContinuationRef = makeFunctionReference<
  'mutation',
  Record<string, never>,
  any
>('smartManagerOutcomes:sweepSmartManagerOutcomesInternal');

async function outcomeBindingsRemainExact(ctx: any, outcome: any) {
  const [run, recipient] = await Promise.all([
    ctx.db.get(outcome.campaignRunId),
    ctx.db.get(outcome.campaignRunRecipientId),
  ]);
  if (!run || !recipient) {
    return false;
  }
  return (
    smartManagerRecipientBindingsAreStructurallyValid({ run, recipient }) &&
    String(outcome.businessId) === String(run.businessId) &&
    String(outcome.campaignId) === String(run.campaignId) &&
    String(outcome.campaignRunId) === String(run._id) &&
    String(outcome.campaignRunRecipientId) === String(recipient._id) &&
    String(outcome.userId) === String(recipient.userId) &&
    outcome.recipientKey === recipient.recipientKey &&
    outcome.recipientBindingHash === recipient.recipientBindingHash &&
    outcome.policyVersion === run.policyVersion &&
    outcome.policyHash === run.policyHash &&
    outcome.contactEvidenceAt === recipient.terminalAt &&
    outcome.contactEvidenceKind === recipient.executionState
  );
}

async function loadEligibleOutcomeCandidates(
  ctx: any,
  event: Doc<'events'>,
  includeExpiredOutcomes: boolean
) {
  const states = includeExpiredOutcomes
    ? (['awaiting_return', 'window_expired'] as const)
    : (['awaiting_return'] as const);
  const rows = await Promise.all(
    states.map((state) =>
      ctx.db
        .query('smartManagerRecipientOutcomes')
        .withIndex(
          'by_businessId_userId_state_contactEvidenceAt',
          (q: any) =>
            q
              .eq('businessId', event.businessId)
              .eq('userId', event.customerUserId)
              .eq('state', state)
              .lt('contactEvidenceAt', event.createdAt)
        )
        .order('desc')
        .take(SMART_MANAGER_OVERLAP_LIMIT + 1)
    )
  );
  const candidates = rows.flat();
  if (candidates.length > SMART_MANAGER_OVERLAP_LIMIT) {
    return null;
  }
  return sortEligibleLastTouchOutcomes(candidates, event.createdAt);
}

async function supersedeOlderCandidates(
  ctx: any,
  args: {
    winner: any;
    candidates: any[];
    event: Doc<'events'>;
    invalidCandidateIds?: Set<string>;
  }
) {
  for (const older of args.candidates) {
    if (
      String(older._id) === String(args.winner._id) ||
      args.invalidCandidateIds?.has(String(older._id)) ||
      older.outcomeWindowEndsAt < args.event.createdAt ||
      older.contactEvidenceAt > args.winner.contactEvidenceAt ||
      (older.contactEvidenceAt === args.winner.contactEvidenceAt &&
        older.attributionTieBreaker >= args.winner.attributionTieBreaker)
    ) {
      continue;
    }
    await transitionSmartManagerOutcomeState(ctx, older, 'superseded', {
      supersededAt: args.event.createdAt,
      supersededByOutcomeId: args.winner._id,
      terminalAt: args.event.createdAt,
      purgeAfter:
        args.event.createdAt + SMART_MANAGER_OUTCOME_RETENTION_MS,
      updatedAt: args.event.createdAt,
    });
  }
}

export async function attributeQualifyingEvent(
  ctx: any,
  event: Doc<'events'>,
  options: { includeExpiredOutcomes?: boolean } = {}
) {
  if (!isQualifyingSmartManagerReturnEvent(event) || !event.customerUserId) {
    return;
  }
  const existingAttribution = await ctx.db
    .query('smartManagerRecipientOutcomes')
    .withIndex('by_qualifyingEventId', (q: any) =>
      q.eq('qualifyingEventId', event._id)
    )
    .take(OUTCOME_SINGLETON_LIMIT);
  if (existingAttribution.length > 1) {
    throw new Error('SMART_MANAGER_EVENT_ATTRIBUTION_CONFLICT');
  }

  const eligibleCandidates = await loadEligibleOutcomeCandidates(
    ctx,
    event,
    options.includeExpiredOutcomes === true
  );
  if (!eligibleCandidates) {
    return;
  }

  const existingWinner = existingAttribution[0];
  if (existingWinner) {
    if (
      existingWinner.state === 'returned_after_campaign' &&
      (await outcomeBindingsRemainExact(ctx, existingWinner))
    ) {
      await supersedeOlderCandidates(ctx, {
        winner: existingWinner,
        candidates: eligibleCandidates,
        event,
      });
    }
    return;
  }
  let winner: any = null;
  const invalidCandidateIds = new Set<string>();
  for (const candidate of eligibleCandidates.slice(
    0,
    SMART_MANAGER_BINDING_VALIDATION_LIMIT
  )) {
    if (await outcomeBindingsRemainExact(ctx, candidate)) {
      winner = candidate;
      break;
    }
    await transitionSmartManagerOutcomeState(ctx, candidate, 'not_eligible', {
      terminalAt: event.createdAt,
      purgeAfter: event.createdAt + SMART_MANAGER_OUTCOME_RETENTION_MS,
      updatedAt: event.createdAt,
    });
    invalidCandidateIds.add(String(candidate._id));
  }
  if (!winner) {
    return;
  }

  await transitionSmartManagerOutcomeState(
    ctx,
    winner,
    'returned_after_campaign',
    {
    qualifyingActivityAt: event.createdAt,
    qualifyingEventId: event._id,
    recordedAt: Date.now(),
    terminalAt: event.createdAt,
    purgeAfter: event.createdAt + SMART_MANAGER_OUTCOME_RETENTION_MS,
    updatedAt: Date.now(),
    }
  );

  await supersedeOlderCandidates(ctx, {
    winner,
    candidates: eligibleCandidates,
    event,
    invalidCandidateIds,
  });
}

export async function retractReversedQualifyingEvent(
  ctx: any,
  marker: any,
  now = Date.now()
) {
  const originalEvent = await ctx.db.get(marker.originalEventId);
  if (
    !originalEvent ||
    !originalEvent.reversalEventId ||
    String(originalEvent.businessId) !== String(marker.businessId) ||
    String(originalEvent.customerUserId ?? '') !== String(marker.userId) ||
    originalEvent.createdAt !== marker.originalActivityAt
  ) {
    await ctx.db.delete(marker._id);
    return { retracted: false, restored: 0 };
  }
  const attributed = await ctx.db
    .query('smartManagerRecipientOutcomes')
    .withIndex('by_qualifyingEventId', (q: any) =>
      q.eq('qualifyingEventId', marker.originalEventId)
    )
    .take(OUTCOME_SINGLETON_LIMIT);
  if (attributed.length > 1) {
    throw new Error('SMART_MANAGER_EVENT_ATTRIBUTION_CONFLICT');
  }
  const winner = attributed[0];
  let restored = 0;
  if (winner?.state === 'returned_after_campaign') {
    const superseded = await ctx.db
      .query('smartManagerRecipientOutcomes')
      .withIndex('by_supersededByOutcomeId', (q: any) =>
        q.eq('supersededByOutcomeId', winner._id)
      )
      .take(SMART_MANAGER_OVERLAP_LIMIT + 1);
    if (superseded.length > SMART_MANAGER_OVERLAP_LIMIT) {
      return { retracted: false, restored: 0 };
    }
    const winnerNextState =
      winner.outcomeWindowEndsAt > now
        ? 'awaiting_return'
        : 'window_expired';
    await transitionSmartManagerOutcomeState(ctx, winner, winnerNextState, {
      qualifyingActivityAt: undefined,
      qualifyingEventId: undefined,
      recordedAt: undefined,
      terminalAt:
        winnerNextState === 'window_expired'
          ? winner.outcomeWindowEndsAt
          : undefined,
      purgeAfter:
        winnerNextState === 'window_expired'
          ? winner.outcomeWindowEndsAt + SMART_MANAGER_OUTCOME_RETENTION_MS
          : undefined,
      updatedAt: now,
    });
    for (const older of superseded) {
      if (
        older.state !== 'superseded' ||
        String(older.supersededByOutcomeId ?? '') !== String(winner._id)
      ) {
        continue;
      }
      const nextState =
        older.outcomeWindowEndsAt > now
          ? 'awaiting_return'
          : 'window_expired';
      await transitionSmartManagerOutcomeState(ctx, older, nextState, {
        supersededAt: undefined,
        supersededByOutcomeId: undefined,
        terminalAt:
          nextState === 'window_expired'
            ? older.outcomeWindowEndsAt
            : undefined,
        purgeAfter:
          nextState === 'window_expired'
            ? older.outcomeWindowEndsAt + SMART_MANAGER_OUTCOME_RETENTION_MS
            : undefined,
        updatedAt: now,
      });
      restored += 1;
    }
  }
  await markSmartManagerOutcomeDirty(ctx, {
    businessId: marker.businessId,
    userId: marker.userId,
    activityAt: marker.originalActivityAt,
    includeExpiredOutcomes: true,
  });
  await markSmartManagerOutcomeDirty(ctx, {
    businessId: marker.businessId,
    userId: marker.userId,
    activityAt: marker.reversalAt,
    includeExpiredOutcomes: true,
  });
  await ctx.db.delete(marker._id);
  return { retracted: Boolean(winner), restored };
}

async function processDirtyMarker(ctx: any, marker: any) {
  const snapshotGeneration = marker.generation;
  const page = await ctx.db
    .query('events')
    .withIndex('by_businessId_customerUserId_createdAt', (q: any) =>
      q
        .eq('businessId', marker.businessId)
        .eq('customerUserId', marker.userId)
        .gte('createdAt', marker.earliestActivityAt)
        .lte('createdAt', marker.latestActivityAt)
    )
    .order('asc')
    .paginate({
      cursor: marker.eventCursor ?? null,
      numItems: SMART_MANAGER_OUTCOME_EVENT_BATCH_SIZE,
    });

  for (const event of page.page) {
    await attributeQualifyingEvent(ctx, event, {
      includeExpiredOutcomes: marker.includeExpiredOutcomes === true,
    });
  }

  const current = await ctx.db.get(marker._id);
  if (!current) {
    return { unfinished: false };
  }
  if (current.generation !== snapshotGeneration) {
    await ctx.db.patch(current._id, {
      eventCursor: undefined,
      updatedAt: Date.now(),
    });
    return { unfinished: true };
  }
  if (page.isDone) {
    await ctx.db.delete(current._id);
    return { unfinished: false };
  }
  await ctx.db.patch(current._id, {
    eventCursor: page.continueCursor,
    updatedAt: Date.now(),
  });
  return { unfinished: true };
}

export const sweepSmartManagerOutcomesInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const reversalMarkers = await (ctx.db as any)
      .query('smartManagerOutcomeReversalMarkers')
      .withIndex('by_createdAt')
      .order('asc')
      .take(SMART_MANAGER_OUTCOME_REVERSAL_BATCH_SIZE);
    for (const marker of reversalMarkers) {
      await retractReversedQualifyingEvent(ctx, marker);
    }

    const markers = await (ctx.db as any)
      .query('smartManagerOutcomeDirtyMarkers')
      .withIndex('by_updatedAt')
      .order('asc')
      .take(SMART_MANAGER_OUTCOME_DIRTY_BATCH_SIZE);
    const markerResults = [];
    for (const marker of markers) {
      markerResults.push(await processDirtyMarker(ctx, marker));
    }

    const now = Date.now();
    const expired = await (ctx.db as any)
      .query('smartManagerRecipientOutcomes')
      .withIndex('by_state_outcomeWindowEndsAt', (q: any) =>
        q
          .eq('state', 'awaiting_return')
          .lte('outcomeWindowEndsAt', now)
      )
      .take(SMART_MANAGER_OUTCOME_EXPIRY_BATCH_SIZE);
    for (const outcome of expired) {
      await transitionSmartManagerOutcomeState(
        ctx,
        outcome,
        'window_expired',
        {
        terminalAt: outcome.outcomeWindowEndsAt,
        purgeAfter:
          outcome.outcomeWindowEndsAt + SMART_MANAGER_OUTCOME_RETENTION_MS,
        updatedAt: now,
        }
      );
    }
    const purgeable = await (ctx.db as any)
      .query('smartManagerRecipientOutcomes')
      .withIndex('by_purgeAfter', (q: any) => q.lte('purgeAfter', now))
      .take(SMART_MANAGER_OUTCOME_CLEANUP_BATCH_SIZE);
    let purgedOutcomes = 0;
    for (const outcome of purgeable) {
      if (outcome.state === 'awaiting_return') {
        continue;
      }
      // Run counters are the durable non-PII result record. Purging the
      // recipient-bound evidence row intentionally does not decrement them.
      await ctx.db.delete(outcome._id);
      purgedOutcomes += 1;
    }
    const continuationScheduled = shouldContinueSmartManagerOutcomeSweep({
      reversalMarkerCount: reversalMarkers.length,
      dirtyMarkerCount: markers.length,
      expiredOutcomeCount: expired.length,
      purgeableOutcomeCount: purgeable.length,
      hasUnfinishedDirtyMarker: markerResults.some(
        (result: any) => result.unfinished
      ),
    });
    if (continuationScheduled) {
      await ctx.scheduler.runAfter(
        SMART_MANAGER_OUTCOME_CONTINUATION_DELAY_MS,
        outcomeSweepContinuationRef,
        {}
      );
    }
    return {
      processedMarkers: markers.length,
      processedReversalMarkers: reversalMarkers.length,
      expiredWindows: expired.length,
      purgedOutcomes,
      continuationScheduled,
    };
  },
});

async function buildRunResultSummary(ctx: any, run: Doc<'campaignRuns'>) {
  const counters = run.deliveryCounters;
  const outcomeCounters = normalizeSmartManagerOutcomeCounters(
    (run as any).outcomeCounters
  );
  return {
    contactedOrAvailableCount:
      (counters?.pushAcceptedCount ?? 0) +
      (counters?.inAppAvailableCount ?? 0),
    returnedAfterCampaignCount:
      outcomeCounters.returnedAfterCampaignCount,
    openOutcomeWindowCount: outcomeCounters.awaitingReturnCount,
    expiredOutcomeWindowCount: outcomeCounters.windowExpiredCount,
    supersededOutcomeWindowCount: outcomeCounters.supersededCount,
    notEligibleOutcomeCount: outcomeCounters.notEligibleCount,
  };
}

export const getSmartManagerRunResults = query({
  args: {
    businessId: v.id('businesses'),
    campaignRunId: v.id('campaignRuns'),
  },
  handler: async (ctx, args) => {
    const authorization = await requireActorIsActiveStaffForBusiness(
      ctx,
      args.businessId
    );
    requirePreparedWinbackAuthorization(authorization);
    const run = await ctx.db.get(args.campaignRunId);
    if (
      !run ||
      run.executionKind !== 'smart_manager_v1' ||
      String(run.businessId) !== String(args.businessId)
    ) {
      throw new Error('SMART_MANAGER_RUN_NOT_FOUND');
    }
    return await buildRunResultSummary(ctx, run);
  },
});

export { buildRunResultSummary };
