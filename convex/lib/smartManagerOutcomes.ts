import type { Doc, Id } from '../_generated/dataModel';
import {
  buildSmartManagerRecipientBindingHash,
  SMART_MANAGER_EXECUTION_KIND,
} from './smartManagerExecution';
import {
  SMART_MANAGER_POLICY_V1,
  SMART_MANAGER_POLICY_V1_HASH,
  SMART_MANAGER_POLICY_V1_VERSION,
} from './smartManagerPolicy';

export const SMART_MANAGER_ATTRIBUTION_POLICY_VERSION =
  'smart-manager-last-touch-v1' as const;
export const SMART_MANAGER_OUTCOME_EVENT_BATCH_SIZE = 10;
export const SMART_MANAGER_OUTCOME_DIRTY_BATCH_SIZE = 5;
export const SMART_MANAGER_OUTCOME_REVERSAL_BATCH_SIZE = 5;
export const SMART_MANAGER_OUTCOME_EXPIRY_BATCH_SIZE = 25;
export const SMART_MANAGER_OVERLAP_LIMIT = 50;
export const SMART_MANAGER_BINDING_VALIDATION_LIMIT = 5;
export const SMART_MANAGER_OUTCOME_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const SMART_MANAGER_OUTCOME_CLEANUP_BATCH_SIZE = 25;
export const SMART_MANAGER_OUTCOME_CONTINUATION_DELAY_MS = 100;

const SINGLETON_LIMIT = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

type ContactEvidenceKind = 'push_accepted' | 'in_app_available';
export type SmartManagerOutcomeState =
  | 'awaiting_return'
  | 'returned_after_campaign'
  | 'window_expired'
  | 'superseded'
  | 'not_eligible';

export type SmartManagerOutcomeCounters = {
  awaitingReturnCount: number;
  returnedAfterCampaignCount: number;
  windowExpiredCount: number;
  supersededCount: number;
  notEligibleCount: number;
};

const OUTCOME_COUNTER_KEY_BY_STATE: Record<
  SmartManagerOutcomeState,
  keyof SmartManagerOutcomeCounters
> = {
  awaiting_return: 'awaitingReturnCount',
  returned_after_campaign: 'returnedAfterCampaignCount',
  window_expired: 'windowExpiredCount',
  superseded: 'supersededCount',
  not_eligible: 'notEligibleCount',
};

export function emptySmartManagerOutcomeCounters(): SmartManagerOutcomeCounters {
  return {
    awaitingReturnCount: 0,
    returnedAfterCampaignCount: 0,
    windowExpiredCount: 0,
    supersededCount: 0,
    notEligibleCount: 0,
  };
}

export function normalizeSmartManagerOutcomeCounters(
  counters: Partial<SmartManagerOutcomeCounters> | undefined
): SmartManagerOutcomeCounters {
  const empty = emptySmartManagerOutcomeCounters();
  return {
    awaitingReturnCount: Math.max(
      0,
      Number(counters?.awaitingReturnCount ?? empty.awaitingReturnCount)
    ),
    returnedAfterCampaignCount: Math.max(
      0,
      Number(
        counters?.returnedAfterCampaignCount ??
          empty.returnedAfterCampaignCount
      )
    ),
    windowExpiredCount: Math.max(
      0,
      Number(counters?.windowExpiredCount ?? empty.windowExpiredCount)
    ),
    supersededCount: Math.max(
      0,
      Number(counters?.supersededCount ?? empty.supersededCount)
    ),
    notEligibleCount: Math.max(
      0,
      Number(counters?.notEligibleCount ?? empty.notEligibleCount)
    ),
  };
}

export function shouldContinueSmartManagerOutcomeSweep(args: {
  reversalMarkerCount: number;
  dirtyMarkerCount: number;
  expiredOutcomeCount: number;
  purgeableOutcomeCount: number;
  hasUnfinishedDirtyMarker: boolean;
}) {
  return (
    args.hasUnfinishedDirtyMarker ||
    args.reversalMarkerCount >= SMART_MANAGER_OUTCOME_REVERSAL_BATCH_SIZE ||
    args.dirtyMarkerCount >= SMART_MANAGER_OUTCOME_DIRTY_BATCH_SIZE ||
    args.expiredOutcomeCount >= SMART_MANAGER_OUTCOME_EXPIRY_BATCH_SIZE ||
    args.purgeableOutcomeCount >= SMART_MANAGER_OUTCOME_CLEANUP_BATCH_SIZE
  );
}

function moveCounter(
  counters: SmartManagerOutcomeCounters,
  fromState: SmartManagerOutcomeState | null,
  toState: SmartManagerOutcomeState
) {
  const next = { ...counters };
  if (fromState) {
    const fromKey = OUTCOME_COUNTER_KEY_BY_STATE[fromState];
    next[fromKey] = Math.max(0, next[fromKey] - 1);
  }
  const toKey = OUTCOME_COUNTER_KEY_BY_STATE[toState];
  next[toKey] += 1;
  return next;
}

export async function transitionSmartManagerOutcomeState(
  ctx: any,
  outcome: any,
  nextState: SmartManagerOutcomeState,
  patch: Record<string, unknown>
) {
  const currentOutcome = await ctx.db.get(outcome._id);
  if (!currentOutcome) {
    throw new Error('SMART_MANAGER_OUTCOME_NOT_FOUND');
  }
  if (currentOutcome.state === nextState) {
    await ctx.db.patch(currentOutcome._id, patch);
    return false;
  }
  const run = await ctx.db.get(currentOutcome.campaignRunId);
  if (!run || run.executionKind !== SMART_MANAGER_EXECUTION_KIND) {
    throw new Error('SMART_MANAGER_OUTCOME_RUN_NOT_FOUND');
  }
  const counters = moveCounter(
    normalizeSmartManagerOutcomeCounters(run.outcomeCounters),
    currentOutcome.state as SmartManagerOutcomeState,
    nextState
  );
  await ctx.db.patch(currentOutcome._id, { ...patch, state: nextState });
  await ctx.db.patch(run._id, { outcomeCounters: counters });
  return true;
}

async function loadOutcomeWindowDaysForRun(
  ctx: any,
  run: Doc<'campaignRuns'>
) {
  if (!run.policyVersion || !run.policyHash) {
    return null;
  }
  if (
    run.policyVersion === SMART_MANAGER_POLICY_V1_VERSION &&
    run.policyHash === SMART_MANAGER_POLICY_V1_HASH
  ) {
    return SMART_MANAGER_POLICY_V1.outcomeWindowDays;
  }
  const policies = await ctx.db
    .query('smartManagerPolicyVersions')
    .withIndex('by_version', (q: any) => q.eq('version', run.policyVersion))
    .take(SINGLETON_LIMIT);
  if (
    policies.length !== 1 ||
    policies[0].policyHash !== run.policyHash ||
    !Number.isFinite(policies[0].config?.outcomeWindowDays)
  ) {
    return null;
  }
  return Number(policies[0].config.outcomeWindowDays);
}

export function smartManagerRecipientBindingsAreStructurallyValid(args: {
  run: Doc<'campaignRuns'>;
  recipient: Doc<'campaignRunRecipients'>;
}) {
  const { run, recipient } = args;
  if (
    run.executionKind !== SMART_MANAGER_EXECUTION_KIND ||
    String(recipient.businessId) !== String(run.businessId) ||
    String(recipient.campaignId) !== String(run.campaignId) ||
    String(recipient.campaignRunId) !== String(run._id) ||
    !recipient.primaryMembershipId ||
    !recipient.eligibilityBindingHash ||
    !recipient.recipientBindingHash ||
    !recipient.channel ||
    (recipient.channel !== 'push' && recipient.channel !== 'in_app')
  ) {
    return false;
  }
  return (
    recipient.recipientBindingHash ===
    buildSmartManagerRecipientBindingHash({
      recipientKey: recipient.recipientKey,
      eligibilityBindingHash: recipient.eligibilityBindingHash,
      channel: recipient.channel,
    })
  );
}

export async function ensureSmartManagerOutcomeForContact(
  ctx: any,
  args: {
    run: Doc<'campaignRuns'>;
    recipient: Doc<'campaignRunRecipients'>;
    contactEvidenceKind: ContactEvidenceKind;
    contactEvidenceAt: number;
  }
) {
  const existing = await ctx.db
    .query('smartManagerRecipientOutcomes')
    .withIndex('by_campaignRunRecipientId', (q: any) =>
      q.eq('campaignRunRecipientId', args.recipient._id)
    )
    .take(SINGLETON_LIMIT);
  if (existing.length > 1) {
    throw new Error('SMART_MANAGER_OUTCOME_BINDING_CONFLICT');
  }
  if (existing.length === 1) {
    const outcome = existing[0];
    if (
      String(outcome.businessId) !== String(args.run.businessId) ||
      String(outcome.campaignId) !== String(args.run.campaignId) ||
      String(outcome.campaignRunId) !== String(args.run._id) ||
      String(outcome.userId) !== String(args.recipient.userId) ||
      outcome.recipientKey !== args.recipient.recipientKey ||
      outcome.recipientBindingHash !== args.recipient.recipientBindingHash ||
      outcome.contactEvidenceKind !== args.contactEvidenceKind ||
      outcome.contactEvidenceAt !== args.contactEvidenceAt ||
      outcome.policyVersion !== args.run.policyVersion ||
      outcome.policyHash !== args.run.policyHash
    ) {
      throw new Error('SMART_MANAGER_OUTCOME_BINDING_CONFLICT');
    }
    return outcome._id;
  }
  if (
    !smartManagerRecipientBindingsAreStructurallyValid(args) ||
    !Number.isFinite(args.contactEvidenceAt)
  ) {
    return null;
  }
  const outcomeWindowDays = await loadOutcomeWindowDaysForRun(ctx, args.run);
  if (outcomeWindowDays === null || outcomeWindowDays <= 0) {
    return null;
  }
  const now = Date.now();
  const outcomeId = await ctx.db.insert('smartManagerRecipientOutcomes', {
    businessId: args.run.businessId,
    campaignId: args.run.campaignId,
    campaignRunId: args.run._id,
    campaignRunRecipientId: args.recipient._id,
    userId: args.recipient.userId,
    recipientKey: args.recipient.recipientKey,
    recipientBindingHash: args.recipient.recipientBindingHash as string,
    outcomeKind: 'returned_after_campaign',
    state: 'awaiting_return',
    contactEvidenceKind: args.contactEvidenceKind,
    contactEvidenceAt: args.contactEvidenceAt,
    attributionTieBreaker: String(args.run._id),
    outcomeWindowEndsAt:
      args.contactEvidenceAt + outcomeWindowDays * DAY_MS,
    attributionPolicyVersion: SMART_MANAGER_ATTRIBUTION_POLICY_VERSION,
    policyVersion: args.run.policyVersion as string,
    policyHash: args.run.policyHash as string,
    createdAt: now,
    updatedAt: now,
  });
  const currentRun = await ctx.db.get(args.run._id);
  if (!currentRun || currentRun.executionKind !== SMART_MANAGER_EXECUTION_KIND) {
    throw new Error('SMART_MANAGER_OUTCOME_RUN_NOT_FOUND');
  }
  const counters = moveCounter(
    normalizeSmartManagerOutcomeCounters(currentRun.outcomeCounters),
    null,
    'awaiting_return'
  );
  await ctx.db.patch(args.run._id, { outcomeCounters: counters });
  return outcomeId;
}

export async function markSmartManagerOutcomeDirty(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    userId: Id<'users'>;
    activityAt: number;
    includeExpiredOutcomes?: boolean;
  }
) {
  if (args.includeExpiredOutcomes !== true) {
    const awaitingOutcome = await ctx.db
      .query('smartManagerRecipientOutcomes')
      .withIndex(
        'by_businessId_userId_state_contactEvidenceAt',
        (q: any) =>
          q
            .eq('businessId', args.businessId)
            .eq('userId', args.userId)
            .eq('state', 'awaiting_return')
      )
      .first();
    if (!awaitingOutcome) {
      return { marked: false as const, created: false as const };
    }
  }
  const markers = await ctx.db
    .query('smartManagerOutcomeDirtyMarkers')
    .withIndex('by_businessId_userId', (q: any) =>
      q.eq('businessId', args.businessId).eq('userId', args.userId)
    )
    .take(SINGLETON_LIMIT);
  if (markers.length > 1) {
    throw new Error('SMART_MANAGER_OUTCOME_DIRTY_CONFLICT');
  }
  const now = Date.now();
  const marker = markers[0];
  if (!marker) {
    await ctx.db.insert('smartManagerOutcomeDirtyMarkers', {
      businessId: args.businessId,
      userId: args.userId,
      earliestActivityAt: args.activityAt,
      latestActivityAt: args.activityAt,
      includeExpiredOutcomes: args.includeExpiredOutcomes || undefined,
      generation: 1,
      createdAt: now,
      updatedAt: now,
    });
    return { marked: true as const, created: true as const };
  }
  await ctx.db.patch(marker._id, {
    earliestActivityAt: Math.min(marker.earliestActivityAt, args.activityAt),
    latestActivityAt: Math.max(marker.latestActivityAt, args.activityAt),
    eventCursor: undefined,
    includeExpiredOutcomes:
      marker.includeExpiredOutcomes === true ||
      args.includeExpiredOutcomes === true ||
      undefined,
    generation: marker.generation + 1,
    updatedAt: now,
  });
  return { marked: true as const, created: false as const };
}

export async function markSmartManagerOutcomeReversalDirty(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    userId: Id<'users'>;
    originalEventId: Id<'events'>;
    originalActivityAt: number;
    reversalAt: number;
  }
) {
  const markers = await ctx.db
    .query('smartManagerOutcomeReversalMarkers')
    .withIndex('by_originalEventId', (q: any) =>
      q.eq('originalEventId', args.originalEventId)
    )
    .take(SINGLETON_LIMIT);
  if (markers.length > 1) {
    throw new Error('SMART_MANAGER_OUTCOME_REVERSAL_CONFLICT');
  }
  const existing = markers[0];
  if (existing) {
    if (
      String(existing.businessId) !== String(args.businessId) ||
      String(existing.userId) !== String(args.userId) ||
      existing.originalActivityAt !== args.originalActivityAt
    ) {
      throw new Error('SMART_MANAGER_OUTCOME_REVERSAL_CONFLICT');
    }
    return existing._id;
  }
  const now = Date.now();
  return await ctx.db.insert('smartManagerOutcomeReversalMarkers', {
    businessId: args.businessId,
    userId: args.userId,
    originalEventId: args.originalEventId,
    originalActivityAt: args.originalActivityAt,
    reversalAt: args.reversalAt,
    createdAt: now,
    updatedAt: now,
  });
}

export function isQualifyingSmartManagerReturnEvent(
  event: Doc<'events'>
) {
  return (
    (event.type === 'STAMP_ADDED' ||
      event.type === 'REWARD_REDEEMED' ||
      event.type === 'REFERRAL_BENEFIT_REDEEMED') &&
    Boolean(event.customerUserId) &&
    !event.reversalEventId
  );
}

export function sortEligibleLastTouchOutcomes<
  T extends {
    state: string;
    contactEvidenceAt: number;
    outcomeWindowEndsAt: number;
    attributionTieBreaker: string;
  },
>(candidates: T[], activityAt: number) {
  return candidates
    .filter(
      (candidate) =>
        (candidate.state === 'awaiting_return' ||
          candidate.state === 'window_expired') &&
        candidate.contactEvidenceAt < activityAt &&
        candidate.outcomeWindowEndsAt >= activityAt
    )
    .sort(
      (left, right) =>
        right.contactEvidenceAt - left.contactEvidenceAt ||
        right.attributionTieBreaker.localeCompare(left.attributionTieBreaker)
    );
}
