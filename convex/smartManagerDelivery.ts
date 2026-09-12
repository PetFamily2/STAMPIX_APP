import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from './_generated/server';
import {
  buildCanonicalBusinessEntitlementsFromBusiness,
  countsTowardCampaignDefinitions,
  countsTowardReferralCampaignQuota,
} from './entitlements';
import { isBusinessPermanentDeletionInProgress } from './guards';
import {
  buildPreparedActionCopyContentHash,
  SMART_MANAGER_CHANNEL_STRATEGY_VERSION,
} from './lib/smartManagerPreparedActions';
import {
  buildSmartManagerDeliveryAttemptId,
  buildSmartManagerDeliveryLeaseToken,
  buildSmartManagerInboxDedupeKey,
  classifySmartManagerExpoTicket,
  getSmartManagerPushBackoffMs,
  isSmartManagerRecipientTerminal,
  sanitizeSmartManagerProviderTicketId,
  SMART_MANAGER_DELIVERY_BATCH_SIZE,
  SMART_MANAGER_DELIVERY_LEASE_MS,
  SMART_MANAGER_DELIVERY_SWEEP_LIMIT,
  SMART_MANAGER_DELIVERING_RECOVERY_LIMIT,
  SMART_MANAGER_MAX_PUSH_ATTEMPTS,
  SMART_MANAGER_READY_RECOVERY_LIMIT,
  type SmartManagerDeliveryFailureCode,
  type SmartManagerPushResult,
} from './lib/smartManagerDelivery';
import {
  SMART_MANAGER_EXECUTION_KIND,
  SMART_MANAGER_RECIPIENT_MEMBERSHIP_LIMIT,
} from './lib/smartManagerExecution';
import {
  emptySmartManagerOutcomeCounters,
  ensureSmartManagerOutcomeForContact,
  normalizeSmartManagerOutcomeCounters,
} from './lib/smartManagerOutcomes';
import { SMART_MANAGER_SOURCE_LIMITS } from './lib/smartManagerSourceLimits';
import { sendExpoPushMessages } from './pushNotifications';

const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const DELIVERY_SINGLETON_LIMIT = 2;

type DeliveryCounters = {
  totalFinalizedRecipients: number;
  completedExecutionCount: number;
  pendingCount: number;
  notContactableCount: number;
  pushAcceptedCount: number;
  inAppAvailableCount: number;
  fallbackToInAppCount: number;
  terminalFailureCount: number;
};

type StartDeliveryResult =
  | { status: 'started'; deliveryGeneration: number }
  | { status: 'reused'; deliveryGeneration: number }
  | { status: 'stale' }
  | { status: 'invalidated'; failureCode: SmartManagerDeliveryFailureCode };

type ClaimedPushRecipient = {
  recipientId: Id<'campaignRunRecipients'>;
  campaignId: Id<'campaigns'>;
  campaignRunId: Id<'campaignRuns'>;
  userId: Id<'users'>;
  pushTokenId: Id<'pushTokens'>;
  token: string;
  attemptId: string;
  leaseToken: string;
  leaseGeneration: number;
  attemptNumber: number;
  title: string;
  body: string;
};

type DeliveryClaimResult =
  | { status: 'stale' | 'complete' }
  | { status: 'continued' }
  | { status: 'waiting'; delayMs: number }
  | { status: 'claimed'; recipients: ClaimedPushRecipient[] };

type PushFinalization = {
  recipientId: Id<'campaignRunRecipients'>;
  pushTokenId: Id<'pushTokens'>;
  attemptId: string;
  leaseToken: string;
  leaseGeneration: number;
  result: SmartManagerPushResult;
};

type FinalizeBatchResult =
  | { status: 'stale' | 'complete' }
  | { status: 'continued'; delayMs: number };

const deliveryWorkerRef = makeFunctionReference<
  'action',
  { campaignRunId: Id<'campaignRuns'>; deliveryGeneration: number },
  { status: 'stale' | 'complete' | 'continued' }
>('smartManagerDelivery:runSmartManagerDeliveryInternal');

const startDeliveryRef = makeFunctionReference<
  'mutation',
  { campaignRunId: Id<'campaignRuns'> },
  StartDeliveryResult
>('smartManagerDelivery:startSmartManagerDeliveryInternal');

const claimDeliveryRef = makeFunctionReference<
  'mutation',
  { campaignRunId: Id<'campaignRuns'>; deliveryGeneration: number },
  DeliveryClaimResult
>('smartManagerDelivery:claimSmartManagerDeliveryBatchInternal');

const finalizeDeliveryRef = makeFunctionReference<
  'mutation',
  {
    campaignRunId: Id<'campaignRuns'>;
    deliveryGeneration: number;
    results: PushFinalization[];
  },
  FinalizeBatchResult
>('smartManagerDelivery:finalizeSmartManagerDeliveryBatchInternal');

const outcomeSweepRef = makeFunctionReference<
  'mutation',
  Record<string, never>,
  { processedMarkers: number; expiredWindows: number }
>('smartManagerOutcomes:sweepSmartManagerOutcomesInternal');

function emptyDeliveryCounters(totalFinalizedRecipients: number): DeliveryCounters {
  return {
    totalFinalizedRecipients,
    completedExecutionCount: 0,
    pendingCount: totalFinalizedRecipients,
    notContactableCount: 0,
    pushAcceptedCount: 0,
    inAppAvailableCount: 0,
    fallbackToInAppCount: 0,
    terminalFailureCount: 0,
  };
}

function immutableBindingsAreComplete(run: Doc<'campaignRuns'>) {
  return (
    run.executionKind === SMART_MANAGER_EXECUTION_KIND &&
    Boolean(run.preparedActionId) &&
    Boolean(run.selectedCopyId) &&
    Number.isFinite(run.selectedCopyRevision) &&
    Boolean(run.selectedCopyContentHash) &&
    Boolean(run.stableDecisionId) &&
    Boolean(run.authorityMode) &&
    Boolean(run.authorityBindingHash) &&
    Boolean(run.decisionHash) &&
    Boolean(run.evidenceFingerprint) &&
    Boolean(run.factHash) &&
    Boolean(run.policyVersion) &&
    Boolean(run.policyHash) &&
    Boolean(run.comparisonHash) &&
    Number.isFinite(run.sourceGeneration) &&
    Boolean(run.lifecycleSourceFingerprint) &&
    Boolean(run.approvalKey) &&
    Boolean(run.recipientSetHash) &&
    Number.isFinite(run.totalExecutionRecipients) &&
    run.channelStrategyVersion === SMART_MANAGER_CHANNEL_STRATEGY_VERSION
  );
}

async function immutableBindingsRemainExact(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>
) {
  if (
    !immutableBindingsAreComplete(run) ||
    !run.preparedActionId ||
    !run.selectedCopyId
  ) {
    return false;
  }
  const [campaign, action, copy] = await Promise.all([
    ctx.db.get(run.campaignId),
    ctx.db.get(run.preparedActionId),
    ctx.db.get(run.selectedCopyId),
  ]);
  if (!campaign || !action || !copy) {
    return false;
  }
  return (
    campaign.source === 'smart_manager' &&
    campaign.isActive === true &&
    campaign.automationEnabled === false &&
    String(campaign.businessId) === String(run.businessId) &&
    String(campaign.smartManagerCampaignRunId ?? '') === String(run._id) &&
    String(campaign.smartManagerPreparedActionId ?? '') === String(action._id) &&
    String(campaign.smartManagerSelectedCopyId ?? '') === String(copy._id) &&
    campaign.smartManagerSelectedCopyRevision === copy.revision &&
    campaign.smartManagerSelectedCopyContentHash === copy.contentHash &&
    campaign.smartManagerApprovalKey === run.approvalKey &&
    campaign.messageTitle === copy.title &&
    campaign.messageBody === copy.body &&
    copy.contentHash === buildPreparedActionCopyContentHash(copy) &&
    String(copy.businessId) === String(run.businessId) &&
    String(copy.preparedActionId) === String(action._id) &&
    action.state === 'approved' &&
    action.materializationState === 'ready_for_delivery' &&
    String(action.approvedCampaignRunId ?? '') === String(run._id) &&
    action.approvalKey === run.approvalKey &&
    String(action.selectedCopyId ?? '') === String(copy._id) &&
    action.selectedCopyRevision === copy.revision &&
    String(run.selectedCopyId) === String(copy._id) &&
    run.selectedCopyRevision === copy.revision &&
    run.selectedCopyContentHash === copy.contentHash &&
    String(run.stableDecisionId ?? '') === String(action.decisionId) &&
    run.authorityMode === action.authorityMode &&
    run.authorityBindingHash === action.authorityBindingHash &&
    run.decisionHash === action.decisionHash &&
    run.evidenceFingerprint === action.evidenceFingerprint &&
    run.factHash === action.factHash &&
    run.policyVersion === action.policyVersion &&
    run.policyHash === action.policyHash &&
    run.comparisonHash === action.comparisonHash &&
    run.sourceGeneration === action.sourceGeneration &&
    run.audienceDefinitionVersion === action.audienceDefinitionVersion &&
    run.lifecycleSourceFingerprint === action.lifecycleSourceFingerprint &&
    run.approvedAudienceObservedCount === action.audienceCount &&
    run.recipientCeiling === action.recipientCeiling
  );
}

async function currentExecutionAuthorityFailure(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>,
  now: number
): Promise<SmartManagerDeliveryFailureCode | null> {
  const business = await ctx.db.get(run.businessId);
  if (!business) {
    return 'BUSINESS_NOT_FOUND';
  }
  if (isBusinessPermanentDeletionInProgress(business)) {
    return 'BUSINESS_DELETION_IN_PROGRESS';
  }
  if (business.isActive !== true) {
    return 'BUSINESS_INACTIVE';
  }
  const [campaigns, referralConfigs] = await Promise.all([
    ctx.db
      .query('campaigns')
      .withIndex('by_businessId', (q) => q.eq('businessId', business._id))
      .take(SMART_MANAGER_SOURCE_LIMITS.campaigns + 1),
    ctx.db
      .query('referralConfigs')
      .withIndex('by_businessId', (q) => q.eq('businessId', business._id))
      .take(SMART_MANAGER_SOURCE_LIMITS.referralConfigs),
  ]);
  if (
    campaigns.length > SMART_MANAGER_SOURCE_LIMITS.campaigns ||
    referralConfigs.length > 1
  ) {
    return 'CAMPAIGN_SEND_ENTITLEMENT_UNAVAILABLE';
  }
  const activeCampaigns =
    campaigns.filter(countsTowardCampaignDefinitions).length +
    (countsTowardReferralCampaignQuota(referralConfigs[0]) ? 1 : 0);
  const entitlements = await buildCanonicalBusinessEntitlementsFromBusiness(
    ctx,
    business,
    now,
    {
      activeCampaigns,
    }
  );
  if (entitlements.isSubscriptionActive !== true) {
    return 'SUBSCRIPTION_INACTIVE';
  }
  if (entitlements.features.smartRetentionManager !== true) {
    return 'SMART_MANAGER_CAPABILITY_UNAVAILABLE';
  }
  if (
    entitlements.features.marketingHub !== true ||
    entitlements.usage.activeManagementCampaignsOverLimit
  ) {
    return 'CAMPAIGN_SEND_ENTITLEMENT_UNAVAILABLE';
  }
  return null;
}

async function loadBoundedRecipients(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>
) {
  return await ctx.db
    .query('campaignRunRecipients')
    .withIndex('by_campaignRunId_recipientKey', (q) =>
      q.eq('campaignRunId', run._id)
    )
    .take(SMART_MANAGER_RECIPIENT_MEMBERSHIP_LIMIT + 1);
}

function recipientSetStructureIsValid(
  run: Doc<'campaignRuns'>,
  recipients: Doc<'campaignRunRecipients'>[]
) {
  const expected = run.totalExecutionRecipients ?? -1;
  if (
    recipients.length !== expected ||
    recipients.length > SMART_MANAGER_RECIPIENT_MEMBERSHIP_LIMIT ||
    expected > (run.recipientCeiling ?? -1)
  ) {
    return false;
  }
  const recipientKeys = new Set<string>();
  for (const recipient of recipients) {
    if (
      String(recipient.businessId) !== String(run.businessId) ||
      String(recipient.campaignId) !== String(run.campaignId) ||
      !recipient.recipientBindingHash ||
      !recipient.eligibilityBindingHash ||
      !recipient.channel ||
      (recipient.executionState !== 'pending' &&
        recipient.executionState !== 'not_contactable') ||
      recipientKeys.has(recipient.recipientKey)
    ) {
      return false;
    }
    recipientKeys.add(recipient.recipientKey);
  }
  return true;
}

function computeDeliveryCounters(
  run: Doc<'campaignRuns'>,
  recipients: Doc<'campaignRunRecipients'>[]
): DeliveryCounters {
  const counters = emptyDeliveryCounters(run.totalExecutionRecipients ?? 0);
  counters.pendingCount = 0;
  for (const recipient of recipients) {
    if (isSmartManagerRecipientTerminal(recipient.executionState)) {
      counters.completedExecutionCount += 1;
    } else {
      counters.pendingCount += 1;
    }
    if (recipient.executionState === 'not_contactable') {
      counters.notContactableCount += 1;
    } else if (recipient.executionState === 'push_accepted') {
      counters.pushAcceptedCount += 1;
    } else if (recipient.executionState === 'in_app_available') {
      counters.inAppAvailableCount += 1;
    } else if (
      recipient.executionState === 'failed_terminal' ||
      recipient.executionState === 'invalidated'
    ) {
      counters.terminalFailureCount += 1;
    }
    if (recipient.fallbackToInApp === true) {
      counters.fallbackToInAppCount += 1;
    }
  }
  return counters;
}

function getExecutionEvidenceTimestamps(
  recipients: Doc<'campaignRunRecipients'>[]
) {
  const evidenceTimestamps = recipients
    .filter(
      (recipient) =>
        recipient.executionState === 'push_accepted' ||
        recipient.executionState === 'in_app_available'
    )
    .map((recipient) => recipient.terminalAt)
    .filter((value): value is number => Number.isFinite(value))
    .sort((left, right) => left - right);
  return {
    firstExecutionAt: evidenceTimestamps[0],
    lastExecutionAt: evidenceTimestamps[evidenceTimestamps.length - 1],
  };
}

function latestExecutionEvidence(
  existingLastDeliveryAt: number | undefined,
  lastExecutionAt: number | undefined
) {
  if (typeof lastExecutionAt !== 'number' || !Number.isFinite(lastExecutionAt)) {
    return existingLastDeliveryAt;
  }
  if (
    typeof existingLastDeliveryAt !== 'number' ||
    !Number.isFinite(existingLastDeliveryAt)
  ) {
    return lastExecutionAt;
  }
  return Math.max(existingLastDeliveryAt, lastExecutionAt);
}

function allowsLateProviderEvidence(
  failureCode: SmartManagerDeliveryFailureCode | undefined
) {
  return (
    failureCode === 'BUSINESS_NOT_FOUND' ||
    failureCode === 'BUSINESS_INACTIVE' ||
    failureCode === 'BUSINESS_DELETION_IN_PROGRESS' ||
    failureCode === 'SUBSCRIPTION_INACTIVE' ||
    failureCode === 'SMART_MANAGER_CAPABILITY_UNAVAILABLE' ||
    failureCode === 'CAMPAIGN_SEND_ENTITLEMENT_UNAVAILABLE' ||
    failureCode === 'IMMUTABLE_BINDING_INVALID'
  );
}

async function writeDeliveryAudit(
  ctx: MutationCtx,
  args: {
    run: Doc<'campaignRuns'>;
    eventType:
      | 'delivery_started'
      | 'delivery_completed'
      | 'delivery_completed_with_failures'
      | 'delivery_failed'
      | 'delivery_invalidated';
    state:
      | 'delivering'
      | 'delivery_completed'
      | 'delivery_completed_with_failures'
      | 'failed'
      | 'invalidated';
    counters: DeliveryCounters;
    now: number;
    failureCode?: SmartManagerDeliveryFailureCode;
  }
) {
  if (!args.run.recipientSetHash) {
    return;
  }
  await ctx.db.insert('smartManagerAuditEvents', {
    businessId: args.run.businessId,
    eventType: args.eventType,
    sourceGeneration: args.run.sourceGeneration ?? 0,
    factHash: args.run.factHash,
    policyVersion: args.run.policyVersion ?? 'unknown',
    policyHash: args.run.policyHash ?? 'unknown',
    preparedActionId: args.run.preparedActionId,
    campaignRunId: args.run._id,
    detail: {
      actionKind: 'winback_campaign',
      campaignId: args.run.campaignId,
      recipientSetHash: args.run.recipientSetHash,
      deliveryGeneration: args.run.deliveryGeneration ?? 0,
      state: args.state,
      counters: args.counters,
      failureCode: args.failureCode,
    },
    expiresAt: args.now + AUDIT_RETENTION_MS,
    createdAt: args.now,
  });
}

async function invalidateDeliveryRun(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>,
  failureCode: SmartManagerDeliveryFailureCode,
  now: number,
  preserveClaimedAttempts = false
) {
  const recipients = await loadBoundedRecipients(ctx, run);
  const counters = computeDeliveryCounters(run, recipients);
  const { firstExecutionAt, lastExecutionAt } =
    getExecutionEvidenceTimestamps(recipients);
  const nextGeneration = preserveClaimedAttempts
    ? (run.deliveryGeneration ?? 0)
    : (run.deliveryGeneration ?? 0) + 1;
  await ctx.db.patch(run._id, {
    executionState: 'invalidated',
    deliveryGeneration: nextGeneration,
    deliveryFailureCode: failureCode,
    deliveryCompletedAt: now,
    deliveryCounters: counters,
    sentAt: run.sentAt ?? firstExecutionAt,
    lastDeliveryAt: latestExecutionEvidence(
      run.lastDeliveryAt,
      lastExecutionAt
    ),
    updatedAt: now,
  });
  if (run.preparedActionId) {
    const action = await ctx.db.get(run.preparedActionId);
    if (action && String(action.approvedCampaignRunId ?? '') === String(run._id)) {
      await ctx.db.patch(action._id, {
        materializationState: 'invalidated',
        updatedAt: now,
      });
    }
  }
  await writeDeliveryAudit(ctx, {
    run: { ...run, deliveryGeneration: nextGeneration },
    eventType: 'delivery_invalidated',
    state: 'invalidated',
    counters,
    failureCode,
    now,
  });
}

async function refreshInvalidatedRunEvidence(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>,
  now: number
) {
  const recipients = await loadBoundedRecipients(ctx, run);
  const counters = computeDeliveryCounters(run, recipients);
  const { firstExecutionAt, lastExecutionAt } =
    getExecutionEvidenceTimestamps(recipients);
  await ctx.db.patch(run._id, {
    deliveryCounters: counters,
    sentAt: run.sentAt ?? firstExecutionAt,
    lastDeliveryAt: latestExecutionEvidence(
      run.lastDeliveryAt,
      lastExecutionAt
    ),
    updatedAt: now,
  });
}

async function persistInAppExactlyOnce(
  ctx: MutationCtx,
  args: {
    run: Doc<'campaignRuns'>;
    campaign: Doc<'campaigns'>;
    recipient: Doc<'campaignRunRecipients'>;
    now: number;
  }
) {
  const dedupeKey = buildSmartManagerInboxDedupeKey({
    campaignRunId: String(args.run._id),
    recipientKey: args.recipient.recipientKey,
  });
  const existing = await ctx.db
    .query('messageLog')
    .withIndex('by_campaignRunId_toUserId_dedupeKey', (q) =>
      q
        .eq('campaignRunId', args.run._id)
        .eq('toUserId', args.recipient.userId)
        .eq('dedupeKey', dedupeKey)
    )
    .take(DELIVERY_SINGLETON_LIMIT);
  if (existing.length > 1) {
    return { ok: false as const };
  }
  if (existing.length === 0) {
    if (!args.campaign.messageTitle || !args.campaign.messageBody) {
      return { ok: false as const };
    }
    await ctx.db.insert('messageLog', {
      businessId: args.run.businessId,
      campaignId: args.run.campaignId,
      campaignRunId: args.run._id,
      campaignFamily: args.run.family,
      opportunityType: args.run.opportunityType,
      toUserId: args.recipient.userId,
      channel: 'in_app',
      notificationType: 'smart_manager_winback',
      smartManagerSource: 'smart_manager_delivery_v1',
      dedupeKey,
      status: 'available',
      deliveryStatus: 'persisted_available',
      inboxPayload: {
        title: args.campaign.messageTitle,
        body: args.campaign.messageBody,
      },
      createdAt: args.now,
    });
  }
  return { ok: true as const };
}

async function reconcileRunAndSchedule(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>,
  deliveryGeneration: number,
  now: number
): Promise<FinalizeBatchResult> {
  const current = await ctx.db.get(run._id);
  if (
    !current ||
    current.executionState !== 'delivering' ||
    current.deliveryGeneration !== deliveryGeneration
  ) {
    return { status: 'stale' };
  }
  const recipients = await loadBoundedRecipients(ctx, current);
  if (recipients.length !== (current.totalExecutionRecipients ?? -1)) {
    await invalidateDeliveryRun(ctx, current, 'RECIPIENT_SET_INVALID', now);
    return { status: 'stale' };
  }
  const counters = computeDeliveryCounters(current, recipients);
  const { firstExecutionAt, lastExecutionAt } =
    getExecutionEvidenceTimestamps(recipients);
  if (counters.completedExecutionCount === counters.totalFinalizedRecipients) {
    const hasFailures = counters.terminalFailureCount > 0;
    const executionState = hasFailures
      ? ('delivery_completed_with_failures' as const)
      : ('delivery_completed' as const);
    await ctx.db.patch(current._id, {
      executionState,
      deliveryCounters: counters,
      deliveryCompletedAt: now,
      sentAt: current.sentAt ?? firstExecutionAt,
      lastDeliveryAt: latestExecutionEvidence(
        current.lastDeliveryAt,
        lastExecutionAt
      ),
      updatedAt: now,
    });
    await writeDeliveryAudit(ctx, {
      run: current,
      eventType: hasFailures
        ? 'delivery_completed_with_failures'
        : 'delivery_completed',
      state: executionState,
      counters,
      now,
    });
    return { status: 'complete' };
  }
  await ctx.db.patch(current._id, {
    deliveryCounters: counters,
    sentAt: current.sentAt ?? firstExecutionAt,
    lastDeliveryAt: latestExecutionEvidence(
      current.lastDeliveryAt,
      lastExecutionAt
    ),
    updatedAt: now,
  });
  const futureTimes = recipients
    .map((recipient) =>
      recipient.executionState === 'retryable'
        ? recipient.nextAttemptAt
        : recipient.executionState === 'dispatching'
          ? recipient.leaseExpiresAt
          : undefined
    )
    .filter((value): value is number => Number.isFinite(value));
  const nextAt = futureTimes.length > 0 ? Math.min(...futureTimes) : now;
  const delayMs = Math.max(0, nextAt - now);
  await ctx.scheduler.runAfter(delayMs, deliveryWorkerRef, {
    campaignRunId: current._id,
    deliveryGeneration,
  });
  return { status: 'continued', delayMs };
}

export const startSmartManagerDeliveryInternal = internalMutation({
  args: { campaignRunId: v.id('campaignRuns') },
  handler: async (ctx, args): Promise<StartDeliveryResult> => {
    const run = await ctx.db.get(args.campaignRunId);
    if (!run || run.executionKind !== SMART_MANAGER_EXECUTION_KIND) {
      return { status: 'stale' };
    }
    if (run.executionState === 'delivering' && run.deliveryGeneration) {
      await ctx.scheduler.runAfter(0, deliveryWorkerRef, {
        campaignRunId: run._id,
        deliveryGeneration: run.deliveryGeneration,
      });
      return { status: 'reused', deliveryGeneration: run.deliveryGeneration };
    }
    if (run.executionState !== 'ready_for_delivery') {
      return { status: 'stale' };
    }
    const now = Date.now();
    if (!(await immutableBindingsRemainExact(ctx, run))) {
      await invalidateDeliveryRun(ctx, run, 'IMMUTABLE_BINDING_INVALID', now);
      return { status: 'invalidated', failureCode: 'IMMUTABLE_BINDING_INVALID' };
    }
    const authorityFailure = await currentExecutionAuthorityFailure(
      ctx,
      run,
      now
    );
    if (authorityFailure) {
      await invalidateDeliveryRun(ctx, run, authorityFailure, now);
      return { status: 'invalidated', failureCode: authorityFailure };
    }
    const recipients = await loadBoundedRecipients(ctx, run);
    if (!recipientSetStructureIsValid(run, recipients)) {
      await invalidateDeliveryRun(ctx, run, 'RECIPIENT_SET_INVALID', now);
      return { status: 'invalidated', failureCode: 'RECIPIENT_SET_INVALID' };
    }
    const deliveryGeneration = (run.deliveryGeneration ?? 0) + 1;
    const counters = computeDeliveryCounters(run, recipients);
    const existingOutcomeCounters = (run as any).outcomeCounters;
    const outcomeCounters = existingOutcomeCounters
      ? normalizeSmartManagerOutcomeCounters(existingOutcomeCounters)
      : emptySmartManagerOutcomeCounters();
    await ctx.db.patch(run._id, {
      executionState: 'delivering',
      deliveryGeneration,
      deliveryStartedAt: now,
      deliveryFailureCode: undefined,
      deliveryCounters: counters,
      outcomeCounters,
      updatedAt: now,
    });
    const deliveringRun: Doc<'campaignRuns'> = {
      ...run,
      executionState: 'delivering',
      deliveryGeneration,
      deliveryStartedAt: now,
      deliveryCounters: counters,
    };
    await writeDeliveryAudit(ctx, {
      run: deliveringRun,
      eventType: 'delivery_started',
      state: 'delivering',
      counters,
      now,
    });
    await ctx.scheduler.runAfter(0, deliveryWorkerRef, {
      campaignRunId: run._id,
      deliveryGeneration,
    });
    return { status: 'started', deliveryGeneration };
  },
});

async function terminalizeWithInApp(
  ctx: MutationCtx,
  args: {
    run: Doc<'campaignRuns'>;
    campaign: Doc<'campaigns'>;
    recipient: Doc<'campaignRunRecipients'>;
    now: number;
    fallbackReason?: SmartManagerDeliveryFailureCode;
    providerStatus?: 'rejected' | 'ambiguous';
  }
) {
  const persisted = await persistInAppExactlyOnce(ctx, args);
  if (!persisted.ok) {
    await ctx.db.patch(args.recipient._id, {
      executionState: 'failed_terminal',
      lastFailureCode: 'IN_APP_PERSISTENCE_FAILED',
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      nextAttemptAt: undefined,
      terminalAt: args.now,
      updatedAt: args.now,
    });
    return;
  }
  await ctx.db.patch(args.recipient._id, {
    executionState: 'in_app_available',
    lastFailureCode: args.fallbackReason,
    provider: args.providerStatus ? 'expo' : undefined,
    providerStatus: args.providerStatus,
    fallbackToInApp: Boolean(args.fallbackReason),
    fallbackReason: args.fallbackReason,
    leaseToken: undefined,
    leaseExpiresAt: undefined,
    nextAttemptAt: undefined,
    terminalAt: args.now,
    updatedAt: args.now,
  });
  await ensureSmartManagerOutcomeForContact(ctx, {
    run: args.run,
    recipient: args.recipient,
    contactEvidenceKind: 'in_app_available',
    contactEvidenceAt: args.now,
  });
}

export const claimSmartManagerDeliveryBatchInternal = internalMutation({
  args: {
    campaignRunId: v.id('campaignRuns'),
    deliveryGeneration: v.number(),
  },
  handler: async (ctx, args): Promise<DeliveryClaimResult> => {
    const run = await ctx.db.get(args.campaignRunId);
    if (
      !run ||
      run.executionState !== 'delivering' ||
      run.deliveryGeneration !== args.deliveryGeneration
    ) {
      return { status: 'stale' };
    }
    const now = Date.now();
    if (!(await immutableBindingsRemainExact(ctx, run))) {
      await invalidateDeliveryRun(
        ctx,
        run,
        'IMMUTABLE_BINDING_INVALID',
        now,
        true
      );
      return { status: 'stale' };
    }
    const authorityFailure = await currentExecutionAuthorityFailure(
      ctx,
      run,
      now
    );
    if (authorityFailure) {
      await invalidateDeliveryRun(ctx, run, authorityFailure, now, true);
      return { status: 'stale' };
    }
    const campaign = await ctx.db.get(run.campaignId);
    if (!campaign || !campaign.messageTitle || !campaign.messageBody) {
      await invalidateDeliveryRun(
        ctx,
        run,
        'IMMUTABLE_BINDING_INVALID',
        now,
        true
      );
      return { status: 'stale' };
    }

    const expiredClaims = await ctx.db
      .query('campaignRunRecipients')
      .withIndex('by_campaignRunId_executionState', (q) =>
        q.eq('campaignRunId', run._id).eq('executionState', 'dispatching')
      )
      .filter((q) => q.lte(q.field('leaseExpiresAt'), now))
      .take(SMART_MANAGER_DELIVERY_BATCH_SIZE);
    if (expiredClaims.length > 0) {
      for (const recipient of expiredClaims) {
        await terminalizeWithInApp(ctx, {
          run,
          campaign,
          recipient,
          now,
          fallbackReason: 'PUSH_OUTCOME_AMBIGUOUS',
          providerStatus: 'ambiguous',
        });
      }
      await reconcileRunAndSchedule(ctx, run, args.deliveryGeneration, now);
      return { status: 'continued' };
    }

    const pending = await ctx.db
      .query('campaignRunRecipients')
      .withIndex('by_campaignRunId_executionState', (q) =>
        q.eq('campaignRunId', run._id).eq('executionState', 'pending')
      )
      .take(SMART_MANAGER_DELIVERY_BATCH_SIZE);
    const dueRetryable =
      pending.length < SMART_MANAGER_DELIVERY_BATCH_SIZE
        ? await ctx.db
            .query('campaignRunRecipients')
            .withIndex('by_campaignRunId_executionState', (q) =>
              q.eq('campaignRunId', run._id).eq('executionState', 'retryable')
            )
            .filter((q) => q.lte(q.field('nextAttemptAt'), now))
            .take(SMART_MANAGER_DELIVERY_BATCH_SIZE - pending.length)
        : [];
    const candidates = [...pending, ...dueRetryable];
    const claimed: ClaimedPushRecipient[] = [];
    for (const recipient of candidates) {
      const user = await ctx.db.get(recipient.userId);
      if (!user || user.isActive !== true || user.marketingOptIn !== true) {
        await ctx.db.patch(recipient._id, {
          executionState: 'failed_terminal',
          lastFailureCode: 'RECIPIENT_ACCOUNT_UNAVAILABLE',
          nextAttemptAt: undefined,
          terminalAt: now,
          updatedAt: now,
        });
        continue;
      }
      if (recipient.channel === 'in_app') {
        await terminalizeWithInApp(ctx, { run, campaign, recipient, now });
        continue;
      }
      if (recipient.channel !== 'push') {
        await ctx.db.patch(recipient._id, {
          executionState: 'failed_terminal',
          lastFailureCode: 'RECIPIENT_SET_INVALID',
          terminalAt: now,
          updatedAt: now,
        });
        continue;
      }
      const activeTokens = await ctx.db
        .query('pushTokens')
        .withIndex('by_userId', (q) => q.eq('userId', recipient.userId))
        .filter((q) => q.eq(q.field('isActive'), true))
        .order('desc')
        .take(1);
      const pushToken = activeTokens[0];
      if (!pushToken) {
        await terminalizeWithInApp(ctx, {
          run,
          campaign,
          recipient,
          now,
          fallbackReason: 'PUSH_TOKEN_MISSING',
        });
        continue;
      }
      const attemptNumber = (recipient.attemptCount ?? 0) + 1;
      const leaseGeneration = (recipient.leaseGeneration ?? 0) + 1;
      const attemptId = buildSmartManagerDeliveryAttemptId({
        campaignRunId: String(run._id),
        recipientKey: recipient.recipientKey,
        deliveryGeneration: args.deliveryGeneration,
        attemptNumber,
        leaseGeneration,
      });
      const leaseToken = buildSmartManagerDeliveryLeaseToken({
        attemptId,
        claimedAt: now,
      });
      await ctx.db.patch(recipient._id, {
        executionState: 'dispatching',
        attemptCount: attemptNumber,
        attemptId,
        leaseToken,
        leaseGeneration,
        leaseExpiresAt: now + SMART_MANAGER_DELIVERY_LEASE_MS,
        nextAttemptAt: undefined,
        updatedAt: now,
      });
      claimed.push({
        recipientId: recipient._id,
        campaignId: run.campaignId,
        campaignRunId: run._id,
        userId: recipient.userId,
        pushTokenId: pushToken._id,
        token: pushToken.token,
        attemptId,
        leaseToken,
        leaseGeneration,
        attemptNumber,
        title: campaign.messageTitle,
        body: campaign.messageBody,
      });
    }
    if (claimed.length > 0) {
      return { status: 'claimed', recipients: claimed };
    }
    const reconciliation = await reconcileRunAndSchedule(
      ctx,
      run,
      args.deliveryGeneration,
      now
    );
    if (reconciliation.status === 'complete') {
      return { status: 'complete' };
    }
    if (reconciliation.status === 'continued') {
      return { status: 'waiting', delayMs: reconciliation.delayMs };
    }
    return { status: 'stale' };
  },
});

export async function sendSmartManagerPushBatch(
  recipients: ClaimedPushRecipient[]
): Promise<SmartManagerPushResult[]> {
  if (recipients.length > SMART_MANAGER_DELIVERY_BATCH_SIZE) {
    throw new Error('SMART_MANAGER_DELIVERY_BATCH_LIMIT_EXCEEDED');
  }
  const transport = await sendExpoPushMessages(
    recipients.map((recipient) => ({
      to: recipient.token,
      title: recipient.title,
      body: recipient.body,
      sound: 'default',
      channelId: 'default',
      data: {
        campaignId: String(recipient.campaignId),
        campaignRunId: String(recipient.campaignRunId),
        notificationType: 'smart_manager_winback',
      },
    }))
  );
  if (!transport.ok) {
    if (transport.failureKind !== 'http_rejected') {
      return recipients.map(() => ({
        status: 'ambiguous_failure' as const,
        code: 'PUSH_OUTCOME_AMBIGUOUS' as const,
      }));
    }
    if (
      transport.statusCode === 429 ||
      transport.statusCode >= 500
    ) {
      return recipients.map(() => ({
        status: 'transient_failure' as const,
        code: 'PUSH_PROVIDER_TRANSIENT' as const,
      }));
    }
    return recipients.map(() => ({
      status: 'permanent_failure' as const,
      code: 'PUSH_PROVIDER_REJECTED' as const,
    }));
  }
  return recipients.map((_, index) =>
    classifySmartManagerExpoTicket(transport.tickets[index] ?? {})
  );
}

export const finalizeSmartManagerDeliveryBatchInternal = internalMutation({
  args: {
    campaignRunId: v.id('campaignRuns'),
    deliveryGeneration: v.number(),
    results: v.array(
      v.object({
        recipientId: v.id('campaignRunRecipients'),
        pushTokenId: v.id('pushTokens'),
        attemptId: v.string(),
        leaseToken: v.string(),
        leaseGeneration: v.number(),
        result: v.union(
          v.object({
            status: v.literal('accepted'),
            providerTicketId: v.optional(v.string()),
          }),
          v.object({
            status: v.literal('permanent_token_failure'),
            code: v.literal('PUSH_TOKEN_INVALID'),
          }),
          v.object({
            status: v.literal('permanent_failure'),
            code: v.literal('PUSH_PROVIDER_REJECTED'),
          }),
          v.object({
            status: v.literal('ambiguous_failure'),
            code: v.literal('PUSH_OUTCOME_AMBIGUOUS'),
          }),
          v.object({
            status: v.literal('transient_failure'),
            code: v.union(
              v.literal('PUSH_PROVIDER_TRANSIENT'),
              v.literal('PUSH_PROVIDER_REJECTED')
            ),
          })
        ),
      })
    ),
  },
  handler: async (ctx, args): Promise<FinalizeBatchResult> => {
    const run = await ctx.db.get(args.campaignRunId);
    const finalizingActiveRun = run?.executionState === 'delivering';
    const finalizingRevokedRun =
      run?.executionState === 'invalidated' &&
      allowsLateProviderEvidence(run.deliveryFailureCode);
    if (
      !run ||
      (!finalizingActiveRun && !finalizingRevokedRun) ||
      run.deliveryGeneration !== args.deliveryGeneration
    ) {
      return { status: 'stale' };
    }
    const now = Date.now();
    const immutableBindingsValid = finalizingRevokedRun
      ? false
      : await immutableBindingsRemainExact(ctx, run);
    const authorityFailure = finalizingRevokedRun
      ? (run.deliveryFailureCode ?? 'IMMUTABLE_BINDING_INVALID')
      : await currentExecutionAuthorityFailure(ctx, run, now);
    let postCallFailure: SmartManagerDeliveryFailureCode | null =
      authorityFailure ??
      (immutableBindingsValid ? null : 'IMMUTABLE_BINDING_INVALID');
    const campaign = postCallFailure ? null : await ctx.db.get(run.campaignId);
    if (!campaign && !postCallFailure) {
      postCallFailure = 'IMMUTABLE_BINDING_INVALID';
    }
    for (const finalized of args.results.slice(0, SMART_MANAGER_DELIVERY_BATCH_SIZE)) {
      const recipient = await ctx.db.get(finalized.recipientId);
      if (
        !recipient ||
        String(recipient.campaignRunId) !== String(run._id) ||
        recipient.executionState !== 'dispatching' ||
        recipient.attemptId !== finalized.attemptId ||
        recipient.leaseToken !== finalized.leaseToken ||
        recipient.leaseGeneration !== finalized.leaseGeneration
      ) {
        continue;
      }
      if (finalized.result.status === 'accepted') {
        await ctx.db.patch(recipient._id, {
          executionState: 'push_accepted',
          provider: 'expo',
          providerStatus: 'accepted',
          providerTicketId: sanitizeSmartManagerProviderTicketId(
            finalized.result.providerTicketId
          ),
          lastFailureCode: undefined,
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          terminalAt: now,
          updatedAt: now,
        });
        await ensureSmartManagerOutcomeForContact(ctx, {
          run,
          recipient,
          contactEvidenceKind: 'push_accepted',
          contactEvidenceAt: now,
        });
        continue;
      }
      if (postCallFailure) {
        await ctx.db.patch(recipient._id, {
          executionState: 'invalidated',
          provider: 'expo',
          providerStatus:
            finalized.result.status === 'ambiguous_failure'
              ? 'ambiguous'
              : 'rejected',
          lastFailureCode: finalized.result.code,
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          nextAttemptAt: undefined,
          terminalAt: now,
          updatedAt: now,
        });
        continue;
      }
      if (!campaign) {
        continue;
      }
      if (finalized.result.status === 'permanent_token_failure') {
        const token = await ctx.db.get(finalized.pushTokenId);
        if (token && String(token.userId) === String(recipient.userId)) {
          await ctx.db.patch(token._id, { isActive: false, updatedAt: now });
        }
        await terminalizeWithInApp(ctx, {
          run,
          campaign,
          recipient,
          now,
          fallbackReason: 'PUSH_TOKEN_INVALID',
          providerStatus: 'rejected',
        });
        continue;
      }
      if (
        finalized.result.status === 'ambiguous_failure' ||
        finalized.result.status === 'permanent_failure'
      ) {
        await terminalizeWithInApp(ctx, {
          run,
          campaign,
          recipient,
          now,
          fallbackReason: finalized.result.code,
          providerStatus:
            finalized.result.status === 'ambiguous_failure'
              ? 'ambiguous'
              : 'rejected',
        });
        continue;
      }
      if ((recipient.attemptCount ?? 0) >= SMART_MANAGER_MAX_PUSH_ATTEMPTS) {
        await terminalizeWithInApp(ctx, {
          run,
          campaign,
          recipient,
          now,
          fallbackReason: finalized.result.code,
          providerStatus: 'rejected',
        });
        continue;
      }
      await ctx.db.patch(recipient._id, {
        executionState: 'retryable',
        provider: 'expo',
        providerStatus: 'rejected',
        lastFailureCode: finalized.result.code,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        nextAttemptAt:
          now + getSmartManagerPushBackoffMs(recipient.attemptCount ?? 1),
        updatedAt: now,
      });
    }
    if (postCallFailure) {
      if (finalizingRevokedRun) {
        await refreshInvalidatedRunEvidence(ctx, run, now);
      } else {
        await invalidateDeliveryRun(ctx, run, postCallFailure, now, true);
      }
      return { status: 'stale' };
    }
    return await reconcileRunAndSchedule(
      ctx,
      run,
      args.deliveryGeneration,
      now
    );
  },
});

export const runSmartManagerDeliveryInternal = internalAction({
  args: {
    campaignRunId: v.id('campaignRuns'),
    deliveryGeneration: v.number(),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(claimDeliveryRef, args);
    if (claim.status !== 'claimed') {
      if (claim.status === 'stale') {
        return { status: 'stale' as const };
      }
      if (claim.status === 'complete') {
        return { status: 'complete' as const };
      }
      return { status: 'continued' as const };
    }
    const results = await sendSmartManagerPushBatch(claim.recipients);
    const finalized = await ctx.runMutation(finalizeDeliveryRef, {
      campaignRunId: args.campaignRunId,
      deliveryGeneration: args.deliveryGeneration,
      results: claim.recipients.map((recipient, index) => ({
        recipientId: recipient.recipientId,
        pushTokenId: recipient.pushTokenId,
        attemptId: recipient.attemptId,
        leaseToken: recipient.leaseToken,
        leaseGeneration: recipient.leaseGeneration,
        result: results[index] ?? {
          status: 'ambiguous_failure',
          code: 'PUSH_OUTCOME_AMBIGUOUS',
        },
      })),
    });
    return {
      status:
        finalized.status === 'complete'
          ? ('complete' as const)
          : finalized.status === 'stale'
            ? ('stale' as const)
            : ('continued' as const),
    };
  },
});

export const sweepSmartManagerDeliveriesInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ready = await ctx.db
      .query('campaignRuns')
      .withIndex('by_executionKind_executionState', (q) =>
        q
          .eq('executionKind', SMART_MANAGER_EXECUTION_KIND)
          .eq('executionState', 'ready_for_delivery')
      )
      .take(SMART_MANAGER_READY_RECOVERY_LIMIT);
    const delivering = await ctx.db
      .query('campaignRuns')
      .withIndex('by_executionKind_executionState', (q) =>
        q
          .eq('executionKind', SMART_MANAGER_EXECUTION_KIND)
          .eq('executionState', 'delivering')
      )
      .take(SMART_MANAGER_DELIVERING_RECOVERY_LIMIT);
    for (const run of ready) {
      await ctx.scheduler.runAfter(0, startDeliveryRef, { campaignRunId: run._id });
    }
    for (const run of delivering) {
      if (run.deliveryGeneration) {
        await ctx.scheduler.runAfter(0, deliveryWorkerRef, {
          campaignRunId: run._id,
          deliveryGeneration: run.deliveryGeneration,
        });
      }
    }
    await ctx.scheduler.runAfter(0, outcomeSweepRef, {});
    return {
      scheduled: Math.min(
        SMART_MANAGER_DELIVERY_SWEEP_LIMIT,
        ready.length + delivering.length
      ),
    };
  },
});
