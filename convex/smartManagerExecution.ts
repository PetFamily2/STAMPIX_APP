import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from './_generated/server';
import { isCustomerAtRiskForReferenceNow } from './customerLifecycle';
import {
  buildCanonicalBusinessEntitlementsFromBusiness,
  countsTowardCampaignDefinitions,
  countsTowardReferralCampaignQuota,
} from './entitlements';
import {
  getBusinessStaffStatus,
  requireCurrentUser,
} from './guards';
import {
  resolveSmartManagerDecisionAuthority,
} from './lib/smartManagerAuthority';
import {
  buildPreparedActionCopyContentHash,
  evaluatePreparedActionCurrentness,
  SMART_MANAGER_AUDIENCE_DEFINITION_VERSION,
  SMART_MANAGER_CHANNEL_STRATEGY_VERSION,
} from './lib/smartManagerPreparedActions';
import {
  addSmartManagerRecipientBindingToAccumulator,
  buildSmartManagerApprovalKey,
  buildSmartManagerEligibilityBindingHash,
  buildSmartManagerRecipientBindingHash,
  buildSmartManagerRecipientKey,
  emptySmartManagerRecipientHashAccumulator,
  finalizeSmartManagerRecipientSetHash,
  SMART_MANAGER_EXECUTION_KIND,
  SMART_MANAGER_MATERIALIZATION_BATCH_SIZE,
  SMART_MANAGER_RECIPIENT_EVENT_LIMIT,
  SMART_MANAGER_RECIPIENT_ELIGIBILITY_VERSION,
  SMART_MANAGER_RECIPIENT_FINALIZATION_BATCH_SIZE,
  SMART_MANAGER_RECIPIENT_MEMBERSHIP_LIMIT,
  type SmartManagerResolvedChannel,
} from './lib/smartManagerExecution';
import { SMART_MANAGER_SOURCE_LIMITS } from './lib/smartManagerSourceLimits';
import { getRoleCapabilities } from './lib/staffPermissions';
import { resolveProgramLifecycle } from './loyaltyPrograms';
import {
  buildCustomerSegmentFacts,
  isCanonicalRecommendationEventEffective,
} from './recommendations';

const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const APPROVAL_SINGLETON_LIMIT = 2;

type MaterializationFailureCode =
  | 'SOURCE_LIMIT_EXCEEDED'
  | 'RECIPIENT_LIMIT_EXCEEDED'
  | 'RECIPIENT_BINDING_INVALID'
  | 'MATERIALIZATION_INVARIANT_FAILED';

type MaterializationWorkerResult =
  | { status: 'stale' }
  | { status: 'continued'; phase: string; checkpoint: number }
  | { status: 'ready'; recipientSetHash: string }
  | { status: 'failed'; failureCode: MaterializationFailureCode };

type SmartManagerExecutionAuditEvent =
  | {
      eventType: 'action_approved';
      detail: {
        actionKind: 'winback_campaign';
        approvalKey: string;
        selectedCopyRevision: number;
        contentHash: string;
      };
    }
  | {
      eventType: 'materialization_started';
      detail: {
        actionKind: 'winback_campaign';
        approvalKey: string;
        materializationGeneration: number;
      };
    }
  | {
      eventType: 'materialization_finalized';
      detail: {
        actionKind: 'winback_campaign';
        recipientSetHash: string;
        totalExecutionRecipients: number;
        pushEligible: number;
        inAppFallbackEligible: number;
        notContactable: number;
        excluded: number;
      };
    }
  | {
      eventType: 'materialization_failed';
      detail: {
        actionKind: 'winback_campaign';
        failureCode: MaterializationFailureCode;
        materializationGeneration: number;
      };
    };

type WriteExecutionAuditArgs = SmartManagerExecutionAuditEvent & {
  run: Doc<'campaignRuns'>;
  actorUserId?: Id<'users'>;
  now: number;
};

type CanonicalActiveMembershipResult =
  | { overflow: true; membership: null }
  | { overflow: false; membership: Doc<'memberships'> | null };

type CanonicalRecipientStampHistoryResult =
  | { overflow: true; stampTimestamps: number[] }
  | { overflow: false; stampTimestamps: number[] };

const materializationWorkerRef = makeFunctionReference<
  'mutation',
  {
    campaignRunId: Id<'campaignRuns'>;
    materializationGeneration: number;
    expectedCheckpoint: number;
  },
  MaterializationWorkerResult
>('smartManagerExecution:materializeApprovedRunInternal');

const startDeliveryRef = makeFunctionReference<
  'mutation',
  { campaignRunId: Id<'campaignRuns'> },
  {
    status: 'started' | 'reused' | 'stale' | 'invalidated';
    deliveryGeneration?: number;
    failureCode?: string;
  }
>('smartManagerDelivery:startSmartManagerDeliveryInternal');

function throwRefreshRequired(): never {
  throw new Error('SMART_MANAGER_APPROVAL_REFRESH_REQUIRED');
}

function throwNotEligible(): never {
  throw new Error('SMART_MANAGER_APPROVAL_NOT_ELIGIBLE');
}

function throwCapacityReached(): never {
  throw new Error('SMART_MANAGER_CAMPAIGN_CAPACITY_REACHED');
}

function hasExactApprovalCapabilities(staffRole: string) {
  if (staffRole !== 'owner' && staffRole !== 'manager') {
    return false;
  }
  const capabilities = getRoleCapabilities(staffRole);
  return (
    capabilities.access_customers === true &&
    capabilities.access_campaigns === true &&
    capabilities.create_campaigns === true &&
    capabilities.activate_send_campaigns === true
  );
}

async function authorizeApprovalActor(
  ctx: MutationCtx,
  action: Doc<'smartManagerPreparedActions'>
) {
  const actor = await requireCurrentUser(ctx);
  const relationships = await ctx.db
    .query('businessStaff')
    .withIndex('by_businessId_userId', (q) =>
      q.eq('businessId', action.businessId).eq('userId', actor._id)
    )
    .take(APPROVAL_SINGLETON_LIMIT);
  if (
    relationships.length !== 1 ||
    getBusinessStaffStatus(relationships[0]) !== 'active'
  ) {
    throwRefreshRequired();
  }
  const relationship = relationships[0];
  if (!hasExactApprovalCapabilities(relationship.staffRole)) {
    throwNotEligible();
  }
  const business = (await ctx.db.get(action.businessId)) as
    | Doc<'businesses'>
    | null;
  if (!business || business.isActive !== true) {
    throwRefreshRequired();
  }
  return { actor, relationship, business };
}

async function loadBoundedCurrentExecutionEntitlements(
  ctx: MutationCtx,
  business: Doc<'businesses'>
) {
  const campaigns = await ctx.db
    .query('campaigns')
    .withIndex('by_businessId', (q) => q.eq('businessId', business._id))
    .take(SMART_MANAGER_SOURCE_LIMITS.campaigns + 1);
  if (campaigns.length > SMART_MANAGER_SOURCE_LIMITS.campaigns) {
    throwRefreshRequired();
  }
  const referralConfigs = await ctx.db
    .query('referralConfigs')
    .withIndex('by_businessId', (q) => q.eq('businessId', business._id))
    .take(SMART_MANAGER_SOURCE_LIMITS.referralConfigs);
  if (referralConfigs.length > 1) {
    throwRefreshRequired();
  }
  const activeCampaigns =
    campaigns.filter(countsTowardCampaignDefinitions).length +
    (countsTowardReferralCampaignQuota(referralConfigs[0]) ? 1 : 0);
  const entitlements = await buildCanonicalBusinessEntitlementsFromBusiness(
    ctx,
    business,
    Date.now(),
    { activeCampaigns }
  );
  if (
    entitlements.isSubscriptionActive !== true ||
    entitlements.features.smartRetentionManager !== true
  ) {
    throwNotEligible();
  }
  return entitlements;
}

async function recomputeCanonicalLifecycleEvidence(
  ctx: MutationCtx,
  business: Doc<'businesses'>,
  now: number
) {
  const [programs, memberships, events] = await Promise.all([
    ctx.db
      .query('loyaltyPrograms')
      .withIndex('by_businessId', (q) => q.eq('businessId', business._id))
      .take(SMART_MANAGER_SOURCE_LIMITS.programs + 1),
    ctx.db
      .query('memberships')
      .withIndex('by_businessId', (q) => q.eq('businessId', business._id))
      .take(SMART_MANAGER_SOURCE_LIMITS.memberships + 1),
    ctx.db
      .query('events')
      .withIndex('by_businessId', (q) => q.eq('businessId', business._id))
      .take(SMART_MANAGER_SOURCE_LIMITS.events + 1),
  ]);
  if (
    programs.length > SMART_MANAGER_SOURCE_LIMITS.programs ||
    memberships.length > SMART_MANAGER_SOURCE_LIMITS.memberships ||
    events.length > SMART_MANAGER_SOURCE_LIMITS.events
  ) {
    throwRefreshRequired();
  }
  const inactive = buildCustomerSegmentFacts({
    business,
    programs,
    memberships,
    events,
    now,
    excludeReversedEvents: true,
  }).inactive;
  if (inactive.state !== 'known') {
    throwRefreshRequired();
  }
  return {
    count: inactive.value.count,
    fingerprint: inactive.value.evidenceFingerprint,
  };
}

async function loadReviewedCopy(
  ctx: MutationCtx,
  action: Doc<'smartManagerPreparedActions'>,
  args: {
    selectedCopyId: Id<'smartManagerPreparedActionCopies'>;
    selectedCopyRevision: number;
    contentHash: string;
  }
) {
  const copy = (await ctx.db.get(args.selectedCopyId)) as
    | Doc<'smartManagerPreparedActionCopies'>
    | null;
  if (
    !copy ||
    String(copy.businessId) !== String(action.businessId) ||
    String(copy.preparedActionId) !== String(action._id) ||
    String(action.selectedCopyId ?? '') !== String(copy._id) ||
    action.selectedCopyRevision !== args.selectedCopyRevision ||
    copy.revision !== args.selectedCopyRevision ||
    copy.contentHash !== args.contentHash ||
    copy.contentHash !==
      buildPreparedActionCopyContentHash({ title: copy.title, body: copy.body })
  ) {
    throwRefreshRequired();
  }
  return copy;
}

function approvalKeyFor(
  action: Doc<'smartManagerPreparedActions'>,
  copy: Doc<'smartManagerPreparedActionCopies'>
) {
  return buildSmartManagerApprovalKey({
    preparedActionId: String(action._id),
    selectedCopyId: String(copy._id),
    selectedCopyRevision: copy.revision,
    selectedCopyContentHash: copy.contentHash,
    authorityMode: action.authorityMode,
    authorityBindingHash: action.authorityBindingHash,
    decisionHash: action.decisionHash,
    evidenceFingerprint: action.evidenceFingerprint,
    factHash: action.factHash,
    policyVersion: action.policyVersion,
    policyHash: action.policyHash,
    comparisonHash: action.comparisonHash,
    sourceGeneration: action.sourceGeneration,
    audienceDefinitionVersion: action.audienceDefinitionVersion,
    lifecycleSourceFingerprint: action.lifecycleSourceFingerprint,
    approvedAudienceObservedCount: action.audienceCount,
    channelStrategyVersion: action.channelStrategy.channelStrategyVersion,
  });
}

function exactRunMatchesApproval(
  run: Doc<'campaignRuns'>,
  action: Doc<'smartManagerPreparedActions'>,
  copy: Doc<'smartManagerPreparedActionCopies'>,
  approvalKey: string
) {
  return (
    run.executionKind === SMART_MANAGER_EXECUTION_KIND &&
    String(run.businessId) === String(action.businessId) &&
    String(run.preparedActionId ?? '') === String(action._id) &&
    String(run.selectedCopyId ?? '') === String(copy._id) &&
    run.selectedCopyRevision === copy.revision &&
    run.selectedCopyContentHash === copy.contentHash &&
    run.approvalKey === approvalKey &&
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
    run.recipientCeiling === action.recipientCeiling &&
    Number.isFinite(run.recipientContactCooldownDays) &&
    run.channelStrategyVersion ===
      action.channelStrategy.channelStrategyVersion
  );
}

async function writeExecutionAudit(
  ctx: MutationCtx,
  args: WriteExecutionAuditArgs
) {
  await ctx.db.insert('smartManagerAuditEvents', {
    businessId: args.run.businessId,
    eventType: args.eventType,
    sourceGeneration: args.run.sourceGeneration ?? 0,
    factHash: args.run.factHash,
    policyVersion: args.run.policyVersion ?? 'unknown',
    policyHash: args.run.policyHash ?? 'unknown',
    actorUserId: args.actorUserId,
    preparedActionId: args.run.preparedActionId,
    campaignRunId: args.run._id,
    detail: args.detail,
    expiresAt: args.now + AUDIT_RETENTION_MS,
    createdAt: args.now,
  });
}

export const approvePreparedWinbackAction = mutation({
  args: {
    preparedActionId: v.id('smartManagerPreparedActions'),
    selectedCopyId: v.id('smartManagerPreparedActionCopies'),
    selectedCopyRevision: v.number(),
    contentHash: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx);
    const action = (await ctx.db.get(args.preparedActionId)) as
      | Doc<'smartManagerPreparedActions'>
      | null;
    if (!action) {
      throwRefreshRequired();
    }
    const { actor, business } = await authorizeApprovalActor(ctx, action);
    const copy = await loadReviewedCopy(ctx, action, args);
    const approvalKey = approvalKeyFor(action, copy);
    const exactRuns = await ctx.db
      .query('campaignRuns')
      .withIndex('by_preparedActionId_approvalKey', (q) =>
        q
          .eq('preparedActionId', action._id)
          .eq('approvalKey', approvalKey)
      )
      .take(APPROVAL_SINGLETON_LIMIT);
    if (exactRuns.length > 1) {
      throwRefreshRequired();
    }
    const currentEntitlements =
      await loadBoundedCurrentExecutionEntitlements(ctx, business);
    const existingRun = exactRuns[0];
    if (existingRun) {
      if (
        !exactRunMatchesApproval(existingRun, action, copy, approvalKey) ||
        String(action.approvedCampaignRunId ?? '') !== String(existingRun._id)
      ) {
        throwRefreshRequired();
      }
      return {
        campaignId: existingRun.campaignId,
        campaignRunId: existingRun._id,
        executionState: existingRun.executionState,
        reused: true,
      };
    }
    if (action.state !== 'reviewable') {
      throwRefreshRequired();
    }
    const anyApprovedRun = await ctx.db
      .query('campaignRuns')
      .withIndex('by_preparedActionId_approvalKey', (q) =>
        q.eq('preparedActionId', action._id)
      )
      .first();
    if (anyApprovedRun) {
      throwRefreshRequired();
    }

    const now = Date.now();
    const authority = await resolveSmartManagerDecisionAuthority(ctx, {
      businessId: action.businessId,
      expectedEvidenceFingerprint: action.evidenceFingerprint,
      now,
    });
    const currentness = evaluatePreparedActionCurrentness({
      action,
      authority,
      now,
    });
    if (
      currentness.currentness !== 'current' ||
      currentness.blockers.length > 0 ||
      !authority.business ||
      !authority.decision ||
      !authority.comparison ||
      !authority.lifecycleEvidence ||
      authority.authorityBindingHash !== action.authorityBindingHash ||
      String(authority.decision._id) !== String(action.decisionId) ||
      authority.decision.decisionHash !== action.decisionHash ||
      authority.comparison.comparisonHash !== action.comparisonHash
    ) {
      throwRefreshRequired();
    }
    const lifecycle = await recomputeCanonicalLifecycleEvidence(
      ctx,
      business,
      now
    );
    if (
      lifecycle.count !== action.audienceCount ||
      lifecycle.fingerprint !== action.lifecycleSourceFingerprint
    ) {
      throwRefreshRequired();
    }
    if (
      currentEntitlements.usage.activeManagementCampaigns >=
      currentEntitlements.limits.maxCampaigns
    ) {
      throwCapacityReached();
    }

    const campaignId = await ctx.db.insert('campaigns', {
      businessId: action.businessId,
      type: 'winback',
      title: action.campaignDraft.internalTitle,
      messageTitle: copy.title,
      messageBody: copy.body,
      rules: { audience: 'inactive_days', authority: 'smart_manager_v1' },
      channels: ['push', 'in_app'],
      status: 'draft',
      activationStatus: 'draft',
      automationEnabled: false,
      family: 'lifecycle',
      opportunityType: 'winback',
      audienceSource: 'automatic',
      schedule: { mode: 'send_now' },
      source: 'smart_manager',
      smartManagerPreparedActionId: action._id,
      smartManagerSelectedCopyId: copy._id,
      smartManagerSelectedCopyRevision: copy.revision,
      smartManagerSelectedCopyContentHash: copy.contentHash,
      smartManagerApprovalKey: approvalKey,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const campaignRunId = await ctx.db.insert('campaignRuns', {
      businessId: action.businessId,
      campaignId,
      campaignType: 'winback',
      family: 'lifecycle',
      opportunityType: 'winback',
      audienceSource: 'automatic',
      scheduleMode: 'send_now',
      targetedCount: 0,
      deliveredCount: 0,
      summaryStatus: 'pending',
      executionKind: SMART_MANAGER_EXECUTION_KIND,
      executionState: 'materializing',
      preparedActionId: action._id,
      selectedCopyId: copy._id,
      selectedCopyRevision: copy.revision,
      selectedCopyContentHash: copy.contentHash,
      stableDecisionId: action.decisionId,
      authorityMode: action.authorityMode,
      authorityBindingHash: action.authorityBindingHash,
      decisionHash: action.decisionHash,
      evidenceFingerprint: action.evidenceFingerprint,
      factHash: action.factHash,
      policyVersion: action.policyVersion,
      policyHash: action.policyHash,
      comparisonHash: action.comparisonHash,
      sourceGeneration: action.sourceGeneration,
      audienceDefinitionVersion: SMART_MANAGER_AUDIENCE_DEFINITION_VERSION,
      lifecycleSourceFingerprint: action.lifecycleSourceFingerprint,
      approvedAudienceObservedCount: action.audienceCount,
      recipientCeiling: action.recipientCeiling,
      recipientContactCooldownDays:
        authority.policy?.config.recipientContactCooldownDays,
      channelStrategyVersion: SMART_MANAGER_CHANNEL_STRATEGY_VERSION,
      approvalKey,
      approvedByUserId: actor._id,
      approvedAt: now,
      eligibilityReferenceAt: now,
      materializationGeneration: 1,
      materializationCheckpoint: 0,
      materializationPhase: 'scan_events',
      materializedEligible: 0,
      pushEligible: 0,
      inAppFallbackEligible: 0,
      notContactable: 0,
      materializedExcluded: 0,
      recipientHashAccumulator:
        emptySmartManagerRecipientHashAccumulator().chainHash,
      recipientHashCount: 0,
      recipientHashPushCount: 0,
      recipientHashInAppCount: 0,
      recipientHashNotContactableCount: 0,
      outcomeCounters: {
        awaitingReturnCount: 0,
        returnedAfterCampaignCount: 0,
        windowExpiredCount: 0,
        supersededCount: 0,
        notEligibleCount: 0,
      },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(campaignId, {
      smartManagerCampaignRunId: campaignRunId,
      updatedAt: now,
    });
    await ctx.db.patch(action._id, {
      state: 'approved',
      materializationState: 'materializing',
      approvedCampaignRunId: campaignRunId,
      approvalKey,
      approvedAt: now,
      updatedAt: now,
    });
    const run = await ctx.db.get(campaignRunId);
    if (!run) {
      throwRefreshRequired();
    }
    await writeExecutionAudit(ctx, {
      eventType: 'action_approved',
      run,
      actorUserId: actor._id,
      detail: {
        actionKind: 'winback_campaign',
        approvalKey,
        selectedCopyRevision: copy.revision,
        contentHash: copy.contentHash,
      },
      now,
    });
    await writeExecutionAudit(ctx, {
      eventType: 'materialization_started',
      run,
      actorUserId: actor._id,
      detail: {
        actionKind: 'winback_campaign',
        approvalKey,
        materializationGeneration: 1,
      },
      now,
    });
    await ctx.scheduler.runAfter(0, materializationWorkerRef, {
      campaignRunId,
      materializationGeneration: 1,
      expectedCheckpoint: 0,
    });
    return {
      campaignId,
      campaignRunId,
      executionState: 'materializing' as const,
      reused: false,
    };
  },
});

async function loadWorkerRun(
  ctx: MutationCtx,
  args: {
    campaignRunId: Id<'campaignRuns'>;
    materializationGeneration: number;
    expectedCheckpoint: number;
  }
) {
  const run = (await ctx.db.get(args.campaignRunId)) as
    | Doc<'campaignRuns'>
    | null;
  if (
    !run ||
    run.executionKind !== SMART_MANAGER_EXECUTION_KIND ||
    run.executionState !== 'materializing' ||
    run.materializationGeneration !== args.materializationGeneration ||
    run.materializationCheckpoint !== args.expectedCheckpoint
  ) {
    return null;
  }
  return run;
}

async function scheduleContinuation(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>,
  checkpoint: number
) {
  await ctx.scheduler.runAfter(0, materializationWorkerRef, {
    campaignRunId: run._id,
    materializationGeneration: run.materializationGeneration ?? 0,
    expectedCheckpoint: checkpoint,
  });
}

async function workerBindingsRemainImmutable(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>
) {
  if (!run.preparedActionId || !run.selectedCopyId || !run.approvalKey) {
    return false;
  }
  const [action, copy, campaign] = await Promise.all([
    ctx.db.get(run.preparedActionId),
    ctx.db.get(run.selectedCopyId),
    ctx.db.get(run.campaignId),
  ]);
  if (
    !action ||
    !copy ||
    !campaign ||
    action.state !== 'approved' ||
    action.materializationState !== 'materializing' ||
    String(action.approvedCampaignRunId ?? '') !== String(run._id) ||
    action.approvalKey !== run.approvalKey ||
    copy.contentHash !==
      buildPreparedActionCopyContentHash({ title: copy.title, body: copy.body }) ||
    !exactRunMatchesApproval(run, action, copy, run.approvalKey) ||
    campaign.source !== 'smart_manager' ||
    String(campaign.smartManagerCampaignRunId ?? '') !== String(run._id) ||
    String(campaign.smartManagerPreparedActionId ?? '') !== String(action._id) ||
    String(campaign.smartManagerSelectedCopyId ?? '') !== String(copy._id) ||
    campaign.smartManagerSelectedCopyRevision !== copy.revision ||
    campaign.smartManagerSelectedCopyContentHash !== copy.contentHash ||
    campaign.smartManagerApprovalKey !== run.approvalKey ||
    campaign.messageTitle !== copy.title ||
    campaign.messageBody !== copy.body
  ) {
    return false;
  }
  return true;
}

async function failMaterialization(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>,
  failureCode: MaterializationFailureCode,
  now: number
): Promise<MaterializationWorkerResult> {
  await ctx.db.patch(run._id, {
    executionState: 'failed',
    materializationFailureCode: failureCode,
    materializationCursor: undefined,
    updatedAt: now,
  });
  if (run.preparedActionId) {
    await ctx.db.patch(run.preparedActionId, {
      materializationState: 'failed',
      updatedAt: now,
    });
  }
  await writeExecutionAudit(ctx, {
    eventType: 'materialization_failed',
    run,
    detail: {
      actionKind: 'winback_campaign',
      failureCode,
      materializationGeneration: run.materializationGeneration ?? 0,
    },
    now,
  });
  return { status: 'failed', failureCode };
}

async function scanEventPage(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>,
  now: number
): Promise<MaterializationWorkerResult> {
  const page = await ctx.db
    .query('events')
    .withIndex('by_businessId_createdAt', (q) =>
      q
        .eq('businessId', run.businessId)
        .lte('createdAt', run.eligibilityReferenceAt ?? run.approvedAt ?? now)
    )
    .paginate({
      cursor: run.materializationCursor ?? null,
      numItems: SMART_MANAGER_MATERIALIZATION_BATCH_SIZE,
    });
  const grouped = new Map<string, { userId: Id<'users'>; stamps: number[] }>();
  for (const event of page.page) {
    if (
      event.type !== 'STAMP_ADDED' ||
      event.revertsEventId !== undefined ||
      event.reversalEventId !== undefined ||
      !event.customerUserId ||
      !Number.isFinite(event.createdAt)
    ) {
      continue;
    }
    const recipientKey = buildSmartManagerRecipientKey({
      businessId: String(run.businessId),
      userId: String(event.customerUserId),
    });
    const group = grouped.get(recipientKey) ?? {
      userId: event.customerUserId,
      stamps: [],
    };
    group.stamps.push(event.createdAt);
    grouped.set(recipientKey, group);
  }
  for (const [recipientKey, group] of grouped) {
    group.stamps.sort((left, right) => left - right);
    const existingRows = await ctx.db
      .query('campaignRunRecipients')
      .withIndex('by_campaignRunId_recipientKey', (q) =>
        q.eq('campaignRunId', run._id).eq('recipientKey', recipientKey)
      )
      .take(APPROVAL_SINGLETON_LIMIT);
    if (existingRows.length > 1) {
      return await failMaterialization(
        ctx,
        run,
        'MATERIALIZATION_INVARIANT_FAILED',
        now
      );
    }
    const existing = existingRows[0];
    const firstGroupStamp = group.stamps[0];
    if (firstGroupStamp === undefined) {
      return await failMaterialization(
        ctx,
        run,
        'MATERIALIZATION_INVARIANT_FAILED',
        now
      );
    }
    let firstStampAt = existing?.firstStampAt ?? firstGroupStamp;
    let lastStampAt = existing?.lastStampAt ?? firstGroupStamp;
    let positiveIntervalCount = existing?.positiveIntervalCount ?? 0;
    for (const stampAt of group.stamps) {
      if (stampAt < lastStampAt) {
        return await failMaterialization(
          ctx,
          run,
          'MATERIALIZATION_INVARIANT_FAILED',
          now
        );
      }
      firstStampAt = Math.min(firstStampAt, stampAt);
      if (stampAt > lastStampAt) {
        positiveIntervalCount += 1;
        lastStampAt = stampAt;
      }
    }
    if (existing) {
      if (existing.executionState !== 'candidate') {
        return await failMaterialization(
          ctx,
          run,
          'MATERIALIZATION_INVARIANT_FAILED',
          now
        );
      }
      await ctx.db.patch(existing._id, {
        firstStampAt,
        lastStampAt,
        positiveIntervalCount,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('campaignRunRecipients', {
        businessId: run.businessId,
        campaignId: run.campaignId,
        campaignRunId: run._id,
        userId: group.userId,
        recipientKey,
        firstStampAt,
        lastStampAt,
        positiveIntervalCount,
        eligibilityVersion: SMART_MANAGER_RECIPIENT_ELIGIBILITY_VERSION,
        executionState: 'candidate',
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  const checkpoint = (run.materializationCheckpoint ?? 0) + 1;
  const nextPhase = page.isDone ? 'finalize_recipients' : 'scan_events';
  await ctx.db.patch(run._id, {
    materializationPhase: nextPhase,
    materializationCursor: page.isDone ? undefined : page.continueCursor,
    materializationCheckpoint: checkpoint,
    updatedAt: now,
  });
  await scheduleContinuation(ctx, run, checkpoint);
  return { status: 'continued', phase: nextPhase, checkpoint };
}

async function loadCanonicalActiveMembership(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>,
  recipient: Doc<'campaignRunRecipients'>
): Promise<CanonicalActiveMembershipResult> {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_userId_businessId', (q) =>
      q.eq('userId', recipient.userId).eq('businessId', run.businessId)
    )
    .take(SMART_MANAGER_RECIPIENT_MEMBERSHIP_LIMIT + 1);
  if (memberships.length > SMART_MANAGER_RECIPIENT_MEMBERSHIP_LIMIT) {
    return { overflow: true, membership: null };
  }
  const active: Doc<'memberships'>[] = [];
  for (const membership of memberships) {
    if (membership.isActive !== true) {
      continue;
    }
    const program = await ctx.db.get(membership.programId);
    if (
      program &&
      String(program.businessId) === String(run.businessId) &&
      program.isActive === true &&
      resolveProgramLifecycle(program) === 'active'
    ) {
      active.push(membership);
    }
  }
  active.sort((left, right) => String(left._id).localeCompare(String(right._id)));
  return { overflow: false, membership: active[0] ?? null };
}

async function loadCanonicalRecipientStampHistory(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>,
  recipient: Doc<'campaignRunRecipients'>,
  referenceAt: number
): Promise<CanonicalRecipientStampHistoryResult> {
  const events = await ctx.db
    .query('events')
    .withIndex('by_businessId_customerUserId_createdAt', (q) =>
      q
        .eq('businessId', run.businessId)
        .eq('customerUserId', recipient.userId)
        .lte('createdAt', referenceAt)
    )
    .take(SMART_MANAGER_RECIPIENT_EVENT_LIMIT + 1);
  if (events.length > SMART_MANAGER_RECIPIENT_EVENT_LIMIT) {
    return { overflow: true, stampTimestamps: [] };
  }
  const stampTimestamps = events
    .filter(
      (event) =>
        event.type === 'STAMP_ADDED' &&
        isCanonicalRecommendationEventEffective(event) &&
        Number.isFinite(event.createdAt)
    )
    .map((event) => event.createdAt)
    .sort((left, right) => left - right);
  return { overflow: false, stampTimestamps };
}

function summarizeCanonicalStampHistory(stampTimestamps: number[]) {
  const firstStampAt = stampTimestamps[0];
  if (firstStampAt === undefined) {
    return null;
  }
  let lastStampAt = firstStampAt;
  let positiveIntervalCount = 0;
  for (const stampAt of stampTimestamps) {
    if (stampAt > lastStampAt) {
      lastStampAt = stampAt;
      positiveIntervalCount += 1;
    }
  }
  return { firstStampAt, lastStampAt, positiveIntervalCount };
}

async function finalizeRecipientPage(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>,
  now: number
): Promise<MaterializationWorkerResult> {
  const page = await ctx.db
    .query('campaignRunRecipients')
    .withIndex('by_campaignRunId_recipientKey', (q) =>
      q.eq('campaignRunId', run._id)
    )
    .paginate({
      cursor: run.materializationCursor ?? null,
      numItems: SMART_MANAGER_RECIPIENT_FINALIZATION_BATCH_SIZE,
    });
  let eligible = run.materializedEligible ?? 0;
  let pushEligible = run.pushEligible ?? 0;
  let inAppEligible = run.inAppFallbackEligible ?? 0;
  let notContactable = run.notContactable ?? 0;
  let excluded = run.materializedExcluded ?? 0;
  for (const recipient of page.page) {
    if (
      recipient.executionState !== 'candidate' ||
      recipient.eligibilityVersion !==
        SMART_MANAGER_RECIPIENT_ELIGIBILITY_VERSION
    ) {
      return await failMaterialization(
        ctx,
        run,
        'RECIPIENT_BINDING_INVALID',
        now
      );
    }
    const cooldownStart =
      now - (run.recipientContactCooldownDays ?? 0) * 24 * 60 * 60 * 1000;
    const [user, membershipResult, stampHistoryResult, recentContact] =
      await Promise.all([
        ctx.db.get(recipient.userId),
        loadCanonicalActiveMembership(ctx, run, recipient),
        loadCanonicalRecipientStampHistory(ctx, run, recipient, now),
        ctx.db
          .query('messageLog')
          .withIndex('by_toUserId_createdAt', (q) =>
            q.eq('toUserId', recipient.userId).gte('createdAt', cooldownStart)
          )
          .filter((q) => q.eq(q.field('businessId'), run.businessId))
          .order('desc')
          .first(),
      ]);
    if (membershipResult.overflow || stampHistoryResult.overflow) {
      return await failMaterialization(
        ctx,
        run,
        'SOURCE_LIMIT_EXCEEDED',
        now
      );
    }
    const membership = membershipResult.membership;
    const stampSummary = summarizeCanonicalStampHistory(
      stampHistoryResult.stampTimestamps
    );
    const atRisk = isCustomerAtRiskForReferenceNow(
      stampHistoryResult.stampTimestamps,
      now
    );
    if (
      !user ||
      user.isActive !== true ||
      !membership ||
      !stampSummary ||
      !atRisk ||
      recentContact
    ) {
      await ctx.db.delete(recipient._id);
      excluded += 1;
      continue;
    }
    const pushToken =
      user.marketingOptIn === true
        ? await ctx.db
            .query('pushTokens')
            .withIndex('by_userId', (q) => q.eq('userId', recipient.userId))
            .filter((q) => q.eq(q.field('isActive'), true))
            .order('desc')
            .first()
        : null;
    const channel: SmartManagerResolvedChannel =
      user.marketingOptIn !== true
        ? 'not_contactable'
        : pushToken
          ? 'push'
          : 'in_app';
    const eligibilityBindingHash = buildSmartManagerEligibilityBindingHash({
      recipientKey: recipient.recipientKey,
      primaryMembershipId: String(membership._id),
      firstStampAt: stampSummary.firstStampAt,
      lastStampAt: stampSummary.lastStampAt,
      positiveIntervalCount: stampSummary.positiveIntervalCount,
    });
    const recipientBindingHash = buildSmartManagerRecipientBindingHash({
      recipientKey: recipient.recipientKey,
      eligibilityBindingHash,
      channel,
    });
    await ctx.db.patch(recipient._id, {
      primaryMembershipId: membership._id,
      firstStampAt: stampSummary.firstStampAt,
      lastStampAt: stampSummary.lastStampAt,
      positiveIntervalCount: stampSummary.positiveIntervalCount,
      eligibilityEvaluatedAt: now,
      channel,
      pushTokenId: pushToken?._id,
      eligibilityBindingHash,
      recipientBindingHash,
      executionState:
        channel === 'not_contactable' ? 'not_contactable' : 'pending',
      materializedAt: now,
      updatedAt: now,
    });
    eligible += 1;
    if (channel === 'push') {
      pushEligible += 1;
    } else if (channel === 'in_app') {
      inAppEligible += 1;
    } else {
      notContactable += 1;
    }
  }
  const checkpoint = (run.materializationCheckpoint ?? 0) + 1;
  const nextPhase = page.isDone ? 'hash_recipients' : 'finalize_recipients';
  await ctx.db.patch(run._id, {
    materializationPhase: nextPhase,
    materializationCursor: page.isDone ? undefined : page.continueCursor,
    materializationCheckpoint: checkpoint,
    materializedEligible: eligible,
    pushEligible,
    inAppFallbackEligible: inAppEligible,
    notContactable,
    materializedExcluded: excluded,
    recipientHashAccumulator: page.isDone
      ? emptySmartManagerRecipientHashAccumulator().chainHash
      : run.recipientHashAccumulator,
    recipientHashCount: page.isDone ? 0 : run.recipientHashCount,
    recipientHashPushCount: page.isDone ? 0 : run.recipientHashPushCount,
    recipientHashInAppCount: page.isDone ? 0 : run.recipientHashInAppCount,
    recipientHashNotContactableCount: page.isDone
      ? 0
      : run.recipientHashNotContactableCount,
    updatedAt: now,
  });
  await scheduleContinuation(ctx, run, checkpoint);
  return { status: 'continued', phase: nextPhase, checkpoint };
}

async function hashRecipientPage(
  ctx: MutationCtx,
  run: Doc<'campaignRuns'>,
  now: number
): Promise<MaterializationWorkerResult> {
  const page = await ctx.db
    .query('campaignRunRecipients')
    .withIndex('by_campaignRunId_recipientBindingHash', (q) =>
      q.eq('campaignRunId', run._id)
    )
    .paginate({
      cursor: run.materializationCursor ?? null,
      numItems: SMART_MANAGER_MATERIALIZATION_BATCH_SIZE,
    });
  let accumulator = {
    chainHash:
      run.recipientHashAccumulator ??
      emptySmartManagerRecipientHashAccumulator().chainHash,
    count: run.recipientHashCount ?? 0,
  };
  let pushCount = run.recipientHashPushCount ?? 0;
  let inAppCount = run.recipientHashInAppCount ?? 0;
  let notContactableCount = run.recipientHashNotContactableCount ?? 0;
  for (const recipient of page.page) {
    if (
      !recipient.recipientBindingHash ||
      !recipient.eligibilityBindingHash ||
      !recipient.channel ||
      (recipient.executionState !== 'pending' &&
        recipient.executionState !== 'not_contactable')
    ) {
      return await failMaterialization(
        ctx,
        run,
        'RECIPIENT_BINDING_INVALID',
        now
      );
    }
    accumulator = addSmartManagerRecipientBindingToAccumulator(
      accumulator,
      recipient.recipientBindingHash
    );
    if (recipient.channel === 'push') {
      pushCount += 1;
    } else if (recipient.channel === 'in_app') {
      inAppCount += 1;
    } else {
      notContactableCount += 1;
    }
  }
  const checkpoint = (run.materializationCheckpoint ?? 0) + 1;
  if (!page.isDone) {
    await ctx.db.patch(run._id, {
      materializationCursor: page.continueCursor,
      materializationCheckpoint: checkpoint,
      recipientHashAccumulator: accumulator.chainHash,
      recipientHashCount: accumulator.count,
      recipientHashPushCount: pushCount,
      recipientHashInAppCount: inAppCount,
      recipientHashNotContactableCount: notContactableCount,
      updatedAt: now,
    });
    await scheduleContinuation(ctx, run, checkpoint);
    return { status: 'continued', phase: 'hash_recipients', checkpoint };
  }
  const expectedTotal = run.materializedEligible ?? 0;
  if (
    accumulator.count !== expectedTotal ||
    expectedTotal > (run.recipientCeiling ?? 0) ||
    (run.pushEligible ?? 0) +
        (run.inAppFallbackEligible ?? 0) +
        (run.notContactable ?? 0) !==
      expectedTotal ||
    pushCount !== (run.pushEligible ?? 0) ||
    inAppCount !== (run.inAppFallbackEligible ?? 0) ||
    notContactableCount !== (run.notContactable ?? 0)
  ) {
    return await failMaterialization(
      ctx,
      run,
      expectedTotal > (run.recipientCeiling ?? 0)
        ? 'RECIPIENT_LIMIT_EXCEEDED'
        : 'MATERIALIZATION_INVARIANT_FAILED',
      now
    );
  }
  if (!run.preparedActionId) {
    return await failMaterialization(
      ctx,
      run,
      'MATERIALIZATION_INVARIANT_FAILED',
      now
    );
  }
  const recipientSetHash = finalizeSmartManagerRecipientSetHash(accumulator);
  await ctx.db.patch(run._id, {
    executionState: 'ready_for_delivery',
    materializationCursor: undefined,
    materializationCheckpoint: checkpoint,
    recipientHashAccumulator: undefined,
    recipientHashCount: undefined,
    recipientHashPushCount: undefined,
    recipientHashInAppCount: undefined,
    recipientHashNotContactableCount: undefined,
    recipientSetHash,
    totalExecutionRecipients: accumulator.count,
    materializationFinalizedAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(run.preparedActionId, {
    materializationState: 'ready_for_delivery',
    updatedAt: now,
  });
  const finalizedRun: Doc<'campaignRuns'> = {
    ...run,
    executionState: 'ready_for_delivery',
    recipientSetHash,
    totalExecutionRecipients: accumulator.count,
  };
  await writeExecutionAudit(ctx, {
    eventType: 'materialization_finalized',
    run: finalizedRun,
    detail: {
      actionKind: 'winback_campaign',
      recipientSetHash,
      totalExecutionRecipients: accumulator.count,
      pushEligible: run.pushEligible ?? 0,
      inAppFallbackEligible: run.inAppFallbackEligible ?? 0,
      notContactable: run.notContactable ?? 0,
      excluded: run.materializedExcluded ?? 0,
    },
    now,
  });
  await ctx.scheduler.runAfter(0, startDeliveryRef, {
    campaignRunId: run._id,
  });
  return { status: 'ready', recipientSetHash };
}

export const materializeApprovedRunInternal = internalMutation({
  args: {
    campaignRunId: v.id('campaignRuns'),
    materializationGeneration: v.number(),
    expectedCheckpoint: v.number(),
  },
  handler: async (ctx, args): Promise<MaterializationWorkerResult> => {
    const run = await loadWorkerRun(ctx, args);
    if (!run) {
      return { status: 'stale' };
    }
    const now = Date.now();
    if (!(await workerBindingsRemainImmutable(ctx, run))) {
      return await failMaterialization(
        ctx,
        run,
        'RECIPIENT_BINDING_INVALID',
        now
      );
    }
    if (run.materializationPhase === 'scan_events') {
      return await scanEventPage(ctx, run, now);
    }
    if (run.materializationPhase === 'finalize_recipients') {
      return await finalizeRecipientPage(ctx, run, now);
    }
    if (run.materializationPhase === 'hash_recipients') {
      return await hashRecipientPage(ctx, run, now);
    }
    return await failMaterialization(
      ctx,
      run,
      'MATERIALIZATION_INVARIANT_FAILED',
      now
    );
  },
});
