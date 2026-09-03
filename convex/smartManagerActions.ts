import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { planConfig } from './entitlements';
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
  mutation,
  query,
} from './_generated/server';
import {
  requireActorIsActiveStaffForBusiness,
  requireCurrentUser,
} from './guards';
import {
  resolveSmartManagerDecisionAuthority,
  SMART_MANAGER_WINBACK_STABLE_ID,
} from './lib/smartManagerAuthority';
import {
  buildSmartManagerAiCacheKey,
  buildSmartManagerGenerationRequestBinding,
  buildSmartManagerStructuredInputHash,
  buildSmartManagerWinbackPrompt,
  buildSmartManagerWinbackStructuredInput,
  buildBoundedSmartManagerAccessContext,
  buildPreparedActionCopyContentHash,
  buildPreparedWinbackDetectionExplanation,
  buildPreparedWinbackPreparationKey,
  evaluatePreparedActionCurrentness,
  requirePreparedWinbackAuthorization,
  selectSmartManagerAccessCurrentnessBlockers,
  SMART_MANAGER_AI_CACHE_TTL_MS,
  SMART_MANAGER_AI_GENERATION_VERSION,
  SMART_MANAGER_AI_PROMPT_VERSION,
  SMART_MANAGER_AUDIENCE_DEFINITION_VERSION,
  SMART_MANAGER_FALLBACK_GENERATION_VERSION,
  SMART_MANAGER_MAX_COPY_REVISION_SLOTS,
  SMART_MANAGER_PREPARED_ACTION_RETENTION_MS,
  SMART_MANAGER_PREPARED_ACTION_SCHEMA_VERSION,
  SMART_MANAGER_WINBACK_ACTION_CONTRACT_VERSION,
  SMART_MANAGER_WINBACK_CAMPAIGN_DRAFT,
  SMART_MANAGER_WINBACK_CHANNEL_STRATEGY,
  SMART_MANAGER_WINBACK_FALLBACK_COPY,
  isBelowSmartManagerFreshAiMinimum,
  type SmartManagerAiFailureCode,
  validateSmartManagerWinbackOutput,
} from './lib/smartManagerPreparedActions';
import {
  generateOpenRouterJson,
  OPENROUTER_JSON_MODEL,
} from './lib/aiJsonGeneration';
import { monthKeyFromTimestamp } from './lib/recommendationUtils';
import { hashSmartManagerValue } from './lib/smartManagerPolicy';
import { getRoleCapabilities } from './lib/staffPermissions';
import { consumeSmartManagerGenerationRateLimits } from './smartManagerRateLimits';
import { smartManagerAiFailureCodeValidator } from './lib/smartManagerValidators';

const BOUNDED_SINGLETON_LIMIT = 2;
const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_SUPPORTED_MONTHLY_AI_LIMIT = Math.max(
  ...Object.values(planConfig).map(
    (plan) => plan.limits.maxAiExecutionsPerMonth
  )
);
const BOUNDED_AI_USAGE_SENTINEL_LIMIT =
  MAX_SUPPORTED_MONTHLY_AI_LIMIT + 1;
const SMART_MANAGER_AI_MAX_OUTPUT_TOKENS = 120;
const SMART_MANAGER_PREPARED_RETENTION_CLEANUP_MAX_PAGE = 100;
const SMART_MANAGER_PREPARED_RETENTION_CONTINUATION_DELAY_MS = 5_000;

type SmartManagerPreparedRetentionCleanupPhase = 'copies' | 'actions';
type SmartManagerPreparedRetentionCleanupResult = {
  phase: SmartManagerPreparedRetentionCleanupPhase;
  examined: number;
  copiesDeleted: number;
  actionsDeleted: number;
  retainedCopies: number;
  retainedParents: number;
  continueCursor: string | null;
  nextPhase: SmartManagerPreparedRetentionCleanupPhase | null;
  continuationScheduled: boolean;
};

type GenerationRequestArgs = {
  preparedActionId: Id<'smartManagerPreparedActions'>;
  requestToken: string;
  requestBindingHash: string;
  reservedResultRevision: number;
  actorUserId: Id<'users'>;
};

type GenerationPreflightResult =
  | { ok: false; code: SmartManagerAiFailureCode }
  | {
      ok: true;
      source: 'cache';
      businessId: Id<'businesses'>;
      actorUserId: Id<'users'> | undefined;
      explicitRegeneration: boolean;
      cacheKey: string;
      cacheId: Id<'aiGenerationCache'>;
      output: { type: 'winback_copy'; title: string; body: string };
    }
  | {
      ok: true;
      source: 'fresh';
      businessId: Id<'businesses'>;
      actorUserId: Id<'users'> | undefined;
      explicitRegeneration: boolean;
      cacheKey: string;
      prompt: string;
    };

type GenerationFinalizeArgs = GenerationRequestArgs & {
  outcome: 'ai_cache' | 'ai_fresh' | 'failed';
  title?: string;
  body?: string;
  cacheId?: Id<'aiGenerationCache'>;
  failureCode?: SmartManagerAiFailureCode;
  providerAttempted: boolean;
  inputTokens?: number;
  outputTokens?: number;
};

type GenerationFinalizeResult =
  | { status: 'stale_discarded' }
  | { status: 'failed'; reason: SmartManagerAiFailureCode }
  | {
      status: 'selected';
      copyId: Id<'smartManagerPreparedActionCopies'>;
      revision: number;
      provenance: 'ai_cache' | 'ai_fresh';
    };

const runGenerationRef = makeFunctionReference<
  'action',
  GenerationRequestArgs,
  GenerationFinalizeResult
>('smartManagerActions:runPreparedWinbackGenerationInternal');

const generationPreflightRef = makeFunctionReference<
  'query',
  GenerationRequestArgs,
  GenerationPreflightResult
>('smartManagerActions:loadPreparedWinbackGenerationPreflightInternal');

const finalizeGenerationRef = makeFunctionReference<
  'mutation',
  GenerationFinalizeArgs,
  GenerationFinalizeResult
>('smartManagerActions:finalizePreparedWinbackGenerationInternal');

const cleanupPreparedRetentionRef = makeFunctionReference<
  'mutation',
  {
    limit?: number;
    phase?: SmartManagerPreparedRetentionCleanupPhase;
    cursor?: string | null;
  },
  SmartManagerPreparedRetentionCleanupResult
>('smartManagerActions:cleanupPreparedActionRetentionInternal');

async function authorizePreparedWinbackActor(
  ctx: QueryCtx,
  businessId: Id<'businesses'>
) {
  const authorization = await requireActorIsActiveStaffForBusiness(
    ctx,
    businessId
  );
  requirePreparedWinbackAuthorization(authorization);
  return authorization;
}

function throwNotPreparable(): never {
  throw new Error('SMART_MANAGER_WINBACK_NOT_PREPARABLE');
}

function throwMalformedPreparedAction(): never {
  throw new Error('SMART_MANAGER_PREPARED_ACTION_MALFORMED');
}

async function loadSelectedCopyOrThrow(
  ctx: QueryCtx,
  action: Doc<'smartManagerPreparedActions'>
) {
  if (!action.selectedCopyId || action.selectedCopyRevision === undefined) {
    throwMalformedPreparedAction();
  }
  const copy = (await ctx.db.get(action.selectedCopyId)) as
    | Doc<'smartManagerPreparedActionCopies'>
    | null;
  if (
    !copy ||
    String(copy.preparedActionId) !== String(action._id) ||
    String(copy.businessId) !== String(action.businessId) ||
    !Number.isInteger(copy.revision) ||
    copy.revision < 1 ||
    copy.revision > action.copyRevisionLimit ||
    copy.revision !== action.selectedCopyRevision ||
    action.nextCopyRevision <= copy.revision ||
    copy.contentHash !==
      buildPreparedActionCopyContentHash({
        title: copy.title,
        body: copy.body,
      })
  ) {
    throwMalformedPreparedAction();
  }
  return copy;
}

async function writePreparedActionAudit(
  ctx: MutationCtx,
  args: {
    eventType: 'prepared_action_created' | 'prepared_action_superseded';
    action: Doc<'smartManagerPreparedActions'>;
    actorUserId: Id<'users'>;
    now: number;
    detail:
      | {
          actionKind: 'winback_campaign';
          preparationKey: string;
          selectedCopyRevision: number;
        }
      | {
          actionKind: 'winback_campaign';
          reasonCode: 'NEW_CURRENT_PREPARATION';
        };
  }
) {
  await ctx.db.insert('smartManagerAuditEvents', {
    businessId: args.action.businessId,
    eventType: args.eventType,
    sourceGeneration: args.action.sourceGeneration,
    factHash: args.action.factHash,
    policyVersion: args.action.policyVersion,
    policyHash: args.action.policyHash,
    actorUserId: args.actorUserId,
    preparedActionId: args.action._id,
    detail: args.detail,
    expiresAt: args.now + AUDIT_RETENTION_MS,
    createdAt: args.now,
  });
}

async function loadExactPreparationRows(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  preparationKey: string
) {
  return (await ctx.db
    .query('smartManagerPreparedActions')
    .withIndex('by_businessId_preparationKey', (q) =>
      q.eq('businessId', businessId).eq('preparationKey', preparationKey)
    )
    .take(BOUNDED_SINGLETON_LIMIT)) as Doc<'smartManagerPreparedActions'>[];
}

async function loadCurrentPreparedActions(
  ctx: QueryCtx,
  businessId: Id<'businesses'>
) {
  return (await ctx.db
    .query('smartManagerPreparedActions')
    .withIndex('by_businessId_stableId_state', (q) =>
      q
        .eq('businessId', businessId)
        .eq('stableId', SMART_MANAGER_WINBACK_STABLE_ID)
        .eq('state', 'reviewable')
    )
    .take(BOUNDED_SINGLETON_LIMIT)) as Doc<'smartManagerPreparedActions'>[];
}

type SmartManagerAiAuditEvent =
  | 'ai_generation_requested'
  | 'ai_cache_hit'
  | 'ai_generation_succeeded'
  | 'ai_generation_failed'
  | 'ai_generation_stale_discarded';

async function writeAiGenerationAudit(
  ctx: MutationCtx,
  args: {
    eventType: SmartManagerAiAuditEvent;
    action: Doc<'smartManagerPreparedActions'>;
    requestToken: string;
    requestBindingHash: string;
    reservedResultRevision: number;
    actorUserId: Id<'users'>;
    generationVersion: string;
    promptVersion: string;
    model?: string;
    provenance?: 'deterministic' | 'ai_cache' | 'ai_fresh';
    failureCode?: SmartManagerAiFailureCode;
    copyId?: Id<'smartManagerPreparedActionCopies'>;
    selectedCopyRevision?: number;
    now: number;
  }
) {
  await ctx.db.insert('smartManagerAuditEvents', {
    businessId: args.action.businessId,
    eventType: args.eventType,
    sourceGeneration: args.action.sourceGeneration,
    factHash: args.action.factHash,
    policyVersion: args.action.policyVersion,
    policyHash: args.action.policyHash,
    actorUserId: args.actorUserId,
    preparedActionId: args.action._id,
    detail: {
      actionKind: 'winback_campaign',
      requestToken: args.requestToken,
      requestBindingHash: args.requestBindingHash,
      reservedResultRevision: args.reservedResultRevision,
      generationVersion: args.generationVersion,
      promptVersion: args.promptVersion,
      model: args.model,
      provenance: args.provenance,
      failureCode: args.failureCode,
      copyId: args.copyId,
      selectedCopyRevision: args.selectedCopyRevision,
    },
    expiresAt: args.now + AUDIT_RETENTION_MS,
    createdAt: args.now,
  });
}

async function writePreparedCopySelectedAudit(
  ctx: MutationCtx,
  args: {
    action: Doc<'smartManagerPreparedActions'>;
    actorUserId?: Id<'users'>;
    copyId: Id<'smartManagerPreparedActionCopies'>;
    selectedCopyRevision: number;
    provenance: 'deterministic' | 'ai_cache' | 'ai_fresh';
    now: number;
  }
) {
  await ctx.db.insert('smartManagerAuditEvents', {
    businessId: args.action.businessId,
    eventType: 'prepared_copy_selected',
    sourceGeneration: args.action.sourceGeneration,
    factHash: args.action.factHash,
    policyVersion: args.action.policyVersion,
    policyHash: args.action.policyHash,
    actorUserId: args.actorUserId,
    preparedActionId: args.action._id,
    detail: {
      actionKind: 'winback_campaign',
      copyId: args.copyId,
      selectedCopyRevision: args.selectedCopyRevision,
      provenance: args.provenance,
    },
    expiresAt: args.now + AUDIT_RETENTION_MS,
    createdAt: args.now,
  });
}

export function hashSmartManagerWinbackPrompt(prompt: string) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-winback-prompt-content-v1',
    prompt,
  });
}

export function buildGenerationReservation(args: {
  action: Doc<'smartManagerPreparedActions'>;
  actorUserId: Id<'users'>;
  requestKind: 'initial_prepare' | 'explicit_regeneration';
  expectedSelectedCopyId: Id<'smartManagerPreparedActionCopies'>;
  expectedSelectedCopyRevision: number;
  reservedResultRevision: number;
  requestedAt: number;
}) {
  const structuredInput = buildSmartManagerWinbackStructuredInput({
    audienceCount: args.action.audienceCount,
    recipientCeiling: args.action.recipientCeiling,
  });
  const structuredInputHash =
    buildSmartManagerStructuredInputHash(structuredInput);
  const prompt = buildSmartManagerWinbackPrompt(structuredInput);
  const promptHash = hashSmartManagerWinbackPrompt(prompt);
  const requestToken = hashSmartManagerValue({
    namespace: 'smart-manager-winback-generation-request-token-v1',
    preparedActionId: String(args.action._id),
    actorUserId: String(args.actorUserId),
    requestKind: args.requestKind,
    expectedSelectedCopyId: String(args.expectedSelectedCopyId),
    expectedSelectedCopyRevision: args.expectedSelectedCopyRevision,
    reservedResultRevision: args.reservedResultRevision,
    requestedAt: args.requestedAt,
  });
  const requestBindingHash = buildSmartManagerGenerationRequestBinding({
    preparedActionId: String(args.action._id),
    businessId: String(args.action.businessId),
    actorUserId: String(args.actorUserId),
    requestKind: args.requestKind,
    authorityMode: args.action.authorityMode,
    authorityBindingHash: args.action.authorityBindingHash,
    decisionHash: args.action.decisionHash,
    evidenceFingerprint: args.action.evidenceFingerprint,
    factHash: args.action.factHash,
    policyVersion: args.action.policyVersion,
    policyHash: args.action.policyHash,
    sourceGeneration: args.action.sourceGeneration,
    expectedSelectedCopyId: String(args.expectedSelectedCopyId),
    expectedSelectedCopyRevision: args.expectedSelectedCopyRevision,
    requestToken,
    reservedResultRevision: args.reservedResultRevision,
    generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
    promptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
    structuredInputHash,
    requestedAt: args.requestedAt,
    expiresAt: args.action.expiresAt,
    state: args.action.state,
  });
  return {
    structuredInput,
    structuredInputHash,
    prompt,
    promptHash,
    requestToken,
    requestBindingHash,
  };
}

export function generationRequestMatches(
  action: Doc<'smartManagerPreparedActions'>,
  expected: {
    requestToken: string;
    requestBindingHash: string;
  }
) {
  if (
    (action.generationState !== 'queued' &&
      action.generationState !== 'running') ||
    action.generationRequestToken !== expected.requestToken ||
    action.generationRequestBindingHash !== expected.requestBindingHash ||
    !action.generationActorUserId ||
    !action.generationRequestKind ||
    !action.generationExpectedCopyId ||
    action.generationExpectedCopyRevision === undefined ||
    action.generationReservedCopyRevision === undefined ||
    !action.generationRequestedAt ||
    action.generationVersion !== SMART_MANAGER_AI_GENERATION_VERSION ||
    action.generationPromptVersion !== SMART_MANAGER_AI_PROMPT_VERSION ||
    !action.generationInputHash
  ) {
    return false;
  }
  const recomputed = buildSmartManagerGenerationRequestBinding({
    preparedActionId: String(action._id),
    businessId: String(action.businessId),
    actorUserId: String(action.generationActorUserId),
    requestKind: action.generationRequestKind,
    authorityMode: action.authorityMode,
    authorityBindingHash: action.authorityBindingHash,
    decisionHash: action.decisionHash,
    evidenceFingerprint: action.evidenceFingerprint,
    factHash: action.factHash,
    policyVersion: action.policyVersion,
    policyHash: action.policyHash,
    sourceGeneration: action.sourceGeneration,
    expectedSelectedCopyId: String(action.generationExpectedCopyId),
    expectedSelectedCopyRevision: action.generationExpectedCopyRevision,
    requestToken: action.generationRequestToken,
    reservedResultRevision: action.generationReservedCopyRevision,
    generationVersion: action.generationVersion,
    promptVersion: action.generationPromptVersion,
    structuredInputHash: action.generationInputHash,
    requestedAt: action.generationRequestedAt,
    expiresAt: action.expiresAt,
    state: action.state,
  });
  return recomputed === expected.requestBindingHash;
}

export function generationSelectionMatches(
  action: Doc<'smartManagerPreparedActions'>
) {
  return (
    Boolean(action.selectedCopyId) &&
    action.selectedCopyId === action.generationExpectedCopyId &&
    action.selectedCopyRevision === action.generationExpectedCopyRevision
  );
}

export function generationRequestIdentityMatches(
  action: Doc<'smartManagerPreparedActions'>,
  expected: {
    requestToken: string;
    requestBindingHash: string;
    reservedResultRevision: number;
    actorUserId: Id<'users'>;
  }
) {
  return (
    (action.generationState === 'queued' ||
      action.generationState === 'running') &&
    action.generationRequestToken === expected.requestToken &&
    action.generationRequestBindingHash === expected.requestBindingHash &&
    action.generationReservedCopyRevision === expected.reservedResultRevision &&
    action.generationActorUserId === expected.actorUserId &&
    Boolean(action.generationRequestKind)
  );
}

export function hasActiveSmartManagerGenerationRequest(
  action: Doc<'smartManagerPreparedActions'>,
  now: number
) {
  if (
    action.generationState !== 'queued' &&
    action.generationState !== 'running'
  ) {
    return false;
  }
  if (action.state !== 'reviewable' || now >= action.expiresAt) {
    return false;
  }
  return Boolean(
    action.generationRequestToken &&
      action.generationRequestBindingHash &&
      action.generationReservedCopyRevision !== undefined
  );
}

function isSmartManagerRateLimitError(error: unknown) {
  const data = (error as { data?: { code?: unknown } } | null)?.data;
  return data?.code === 'AI_RATE_LIMITED';
}

function sanitizedUsageCount(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function cacheRowMatchesSmartManagerIdentity(
  row: Doc<'aiGenerationCache'>,
  args: {
    promptHash: string;
    structuredInputHash: string;
  }
) {
  return (
    row.model === OPENROUTER_JSON_MODEL &&
    row.promptHash === args.promptHash &&
    row.inputSignature === args.structuredInputHash &&
    row.goal === 'winback_copy'
  );
}

async function loadGenerationAuthorization(
  ctx: QueryCtx,
  action: Doc<'smartManagerPreparedActions'>
) {
  if (!action.generationActorUserId) {
    return null;
  }
  const rows = (await ctx.db
    .query('businessStaff')
    .withIndex('by_businessId_userId', (q) =>
      q
        .eq('businessId', action.businessId)
        .eq('userId', action.generationActorUserId as Id<'users'>)
    )
    .take(BOUNDED_SINGLETON_LIMIT)) as Doc<'businessStaff'>[];
  if (rows.length !== 1) {
    return null;
  }
  const membership = rows[0];
  const status = membership.status ??
    (membership.isActive === true ? 'active' : 'suspended');
  if (status !== 'active') {
    return null;
  }
  const staffRole = membership.staffRole as 'owner' | 'manager' | 'staff';
  const authorization = {
    staffRole,
    capabilities: getRoleCapabilities(staffRole),
  };
  try {
    requirePreparedWinbackAuthorization(authorization);
    return authorization;
  } catch {
    return null;
  }
}

async function revalidateGenerationRequest(
  ctx: QueryCtx,
  args: {
    preparedActionId: Id<'smartManagerPreparedActions'>;
    requestToken: string;
    requestBindingHash: string;
    reservedResultRevision: number;
    actorUserId: Id<'users'>;
    now: number;
  }
) {
  const action = (await ctx.db.get(args.preparedActionId)) as
    | Doc<'smartManagerPreparedActions'>
    | null;
  if (!action || !generationRequestIdentityMatches(action, args)) {
    return {
      ok: false as const,
      code: 'ACTION_STALE' as const,
      action,
      requestMatches: false as const,
    };
  }
  if (!generationRequestMatches(action, args)) {
    return {
      ok: false as const,
      code: 'ACTION_STALE' as const,
      action,
      requestMatches: true as const,
    };
  }
  const authority = await resolveSmartManagerDecisionAuthority(ctx, {
    businessId: action.businessId,
    expectedEvidenceFingerprint: action.evidenceFingerprint,
    now: args.now,
  });
  const authorization = await loadGenerationAuthorization(ctx, action);
  if (!authority.business || !authorization) {
    return {
      ok: false as const,
      code: 'ACTION_STALE' as const,
      action,
      requestMatches: true as const,
    };
  }
  const access = buildBoundedSmartManagerAccessContext({
    business: authority.business,
    authorization,
    authority,
    now: args.now,
  });
  if (!access.hasAiAssist) {
    return {
      ok: false as const,
      code: access.aiAssistReason ?? 'AI_ASSIST_NOT_AVAILABLE',
      action,
      requestMatches: true as const,
    };
  }
  const currentness = evaluatePreparedActionCurrentness({
    action,
    authority,
    now: args.now,
  });
  if (currentness.currentness !== 'current' || currentness.blockers.length) {
    return {
      ok: false as const,
      code:
        currentness.currentness === 'expired'
          ? ('ACTION_EXPIRED' as const)
          : currentness.currentness === 'reevaluation_pending'
            ? ('REEVALUATION_PENDING' as const)
            : ('ACTION_STALE' as const),
      action,
      requestMatches: true as const,
    };
  }
  if (!generationSelectionMatches(action)) {
    return {
      ok: false as const,
      code: 'ACTION_STALE' as const,
      action,
      requestMatches: true as const,
    };
  }
  const selectedCopy = await loadSelectedCopyOrThrow(ctx, action);
  const structuredInput = buildSmartManagerWinbackStructuredInput({
    audienceCount: action.audienceCount,
    recipientCeiling: action.recipientCeiling,
  });
  const structuredInputHash =
    buildSmartManagerStructuredInputHash(structuredInput);
  const prompt = buildSmartManagerWinbackPrompt(structuredInput);
  const promptHash = hashSmartManagerWinbackPrompt(prompt);
  if (
    structuredInputHash !== action.generationInputHash ||
    promptHash !== action.generationPromptHash
  ) {
    return {
      ok: false as const,
      code: 'ACTION_STALE' as const,
      action,
      requestMatches: true as const,
    };
  }
  return {
    ok: true as const,
    action,
    authority,
    authorization,
    access,
    selectedCopy,
    structuredInput,
    structuredInputHash,
    prompt,
    promptHash,
    requestMatches: true as const,
  };
}

export async function loadBoundedSmartManagerFreshUsage(args: {
  ctx: QueryCtx;
  businessId: Id<'businesses'>;
  now: number;
}) {
  const rows = await args.ctx.db
    .query('aiUsageLedger')
    .withIndex('by_businessId_monthKey_status_cacheHit', (q) =>
      q
        .eq('businessId', args.businessId)
        .eq('monthKey', monthKeyFromTimestamp(args.now))
        .eq('status', 'success')
        .eq('cacheHit', false)
    )
    .take(BOUNDED_AI_USAGE_SENTINEL_LIMIT);
  if (rows.length >= BOUNDED_AI_USAGE_SENTINEL_LIMIT) {
    return { available: false as const, used: null };
  }
  return { available: true as const, used: rows.length };
}

export async function loadSmartManagerCacheCandidate(args: {
  ctx: QueryCtx;
  cacheKey: string;
  promptHash: string;
  structuredInputHash: string;
  now: number;
}) {
  const rows = (await args.ctx.db
    .query('aiGenerationCache')
    .withIndex('by_cacheKey', (q) => q.eq('cacheKey', args.cacheKey))
    .take(BOUNDED_SINGLETON_LIMIT)) as Doc<'aiGenerationCache'>[];
  if (rows.length > 1) {
    return { state: 'unavailable' as const };
  }
  const row = rows[0];
  if (!row) {
    return { state: 'miss' as const };
  }
  if (row.expiresAt <= args.now) {
    return { state: 'miss' as const, expiredRow: row };
  }
  if (!cacheRowMatchesSmartManagerIdentity(row, args)) {
    return { state: 'unavailable' as const };
  }
  const validated = validateSmartManagerWinbackOutput({
    type: row.responseJson.type,
    title: row.responseJson.title,
    body: row.responseJson.message,
  });
  return validated.ok
    ? { state: 'hit' as const, row, output: validated.value }
    : { state: 'unavailable' as const };
}

async function persistSmartManagerCacheResult(
  ctx: MutationCtx,
  args: {
    cacheKey: string;
    promptHash: string;
    structuredInputHash: string;
    title: string;
    body: string;
    now: number;
  }
) {
  const rows = (await ctx.db
    .query('aiGenerationCache')
    .withIndex('by_cacheKey', (q) => q.eq('cacheKey', args.cacheKey))
    .take(BOUNDED_SINGLETON_LIMIT)) as Doc<'aiGenerationCache'>[];
  if (rows.length > 1) {
    return { ok: false as const, code: 'AI_CACHE_UNAVAILABLE' as const };
  }
  const payload = {
    promptHash: args.promptHash,
    goal: 'winback_copy' as const,
    model: OPENROUTER_JSON_MODEL,
    responseJson: {
      type: 'winback_copy',
      title: args.title,
      message: args.body,
    },
    inputSignature: args.structuredInputHash,
    expiresAt: args.now + SMART_MANAGER_AI_CACHE_TTL_MS,
    lastUsedAt: args.now,
  };
  const row = rows[0];
  if (!row) {
    await ctx.db.insert('aiGenerationCache', {
      cacheKey: args.cacheKey,
      createdAt: args.now,
      ...payload,
    });
    return { ok: true as const };
  }
  const identityMatches = cacheRowMatchesSmartManagerIdentity(row, args);
  if (row.expiresAt > args.now && identityMatches) {
    await ctx.db.patch(row._id, { lastUsedAt: args.now });
    return { ok: true as const };
  }
  if (row.expiresAt <= args.now && identityMatches) {
    await ctx.db.patch(row._id, {
      createdAt: args.now,
      ...payload,
    });
    return { ok: true as const };
  }
  return { ok: false as const, code: 'AI_CACHE_UNAVAILABLE' as const };
}

export const prepareWinbackAction = mutation({
  args: {
    businessId: v.id('businesses'),
    expectedEvidenceFingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const authorization = await authorizePreparedWinbackActor(
      ctx,
      args.businessId
    );
    const authority = await resolveSmartManagerDecisionAuthority(ctx, {
      businessId: args.businessId,
      expectedEvidenceFingerprint: args.expectedEvidenceFingerprint,
      now,
    });
    if (
      authority.currentness !== 'current' ||
      authority.blockers.length > 0 ||
      !authority.authorityBindingHash ||
      !authority.business ||
      !authority.decision ||
      !authority.comparison ||
      !authority.factSnapshot ||
      !authority.policy ||
      !authority.lifecycleEvidence ||
      authority.evidenceExpiresAt === null
    ) {
      throwNotPreparable();
    }

    const access = buildBoundedSmartManagerAccessContext({
      business: authority.business,
      authorization,
      authority,
      now,
    });
    if (!access.hasSmartManagerAccess || !access.campaignQuotaCurrent) {
      throwNotPreparable();
    }
    if (
      authority.lifecycleEvidence.audienceCount < 1 ||
      authority.lifecycleEvidence.audienceCount >
        authority.policy.config.recipientCeiling
    ) {
      throwNotPreparable();
    }

    const preparationKey = buildPreparedWinbackPreparationKey({
      businessId: String(args.businessId),
      authorityMode: authority.authorityMode,
      authorityBindingHash: authority.authorityBindingHash,
      decisionHash: authority.decision.decisionHash,
      policyHash: authority.decision.policyHash,
    });
    const exactRows = await loadExactPreparationRows(
      ctx,
      args.businessId,
      preparationKey
    );
    if (exactRows.length > 1) {
      throwMalformedPreparedAction();
    }
    const exact = exactRows[0] ?? null;
    if (exact) {
      if (exact.state !== 'reviewable' || now >= exact.expiresAt) {
        // The authority observation includes observedAt and expires with the
        // action. A fresh evaluation yields a new authority hash/key; this old
        // key is never resurrected or duplicated.
        throw new Error('SMART_MANAGER_PREPARED_ACTION_EXPIRED');
      }
      const exactCurrentness = evaluatePreparedActionCurrentness({
        action: exact,
        authority,
        now,
      });
      if (
        exactCurrentness.currentness !== 'current' ||
        exactCurrentness.blockers.length > 0
      ) {
        throwMalformedPreparedAction();
      }
      const selectedCopy = await loadSelectedCopyOrThrow(ctx, exact);
      return {
        preparedActionId: exact._id,
        reused: true,
        copyRevision: selectedCopy.revision,
        contentHash: selectedCopy.contentHash,
      };
    }

    const currentRows = await loadCurrentPreparedActions(ctx, args.businessId);
    if (currentRows.length > 1) {
      throwMalformedPreparedAction();
    }
    const previousCurrent = currentRows[0] ?? null;
    if (previousCurrent) {
      await ctx.db.patch(previousCurrent._id, {
        state: 'superseded',
        supersededAt: now,
        updatedAt: now,
      });
      await writePreparedActionAudit(ctx, {
        eventType: 'prepared_action_superseded',
        action: previousCurrent,
        actorUserId: authorization.actor._id,
        now,
        detail: {
          actionKind: 'winback_campaign',
          reasonCode: 'NEW_CURRENT_PREPARATION',
        },
      });
    }

    const retentionExpiresAt =
      authority.evidenceExpiresAt + SMART_MANAGER_PREPARED_ACTION_RETENTION_MS;
    const preparedActionId = (await ctx.db.insert(
      'smartManagerPreparedActions',
      {
        businessId: args.businessId,
        stableId: SMART_MANAGER_WINBACK_STABLE_ID,
        actionKind: 'winback_campaign',
        schemaVersion: SMART_MANAGER_PREPARED_ACTION_SCHEMA_VERSION,
        actionContractVersion:
          SMART_MANAGER_WINBACK_ACTION_CONTRACT_VERSION,
        preparationKey,
        authorityMode: authority.authorityMode,
        authorityBindingHash: authority.authorityBindingHash,
        decisionId: authority.decision._id,
        decisionHash: authority.decision.decisionHash,
        evidenceFingerprint: authority.decision.evidenceFingerprint,
        factHash: authority.decision.factHash,
        sourceGeneration: authority.decision.sourceGeneration,
        policyVersion: authority.decision.policyVersion,
        policyHash: authority.decision.policyHash,
        comparisonHash: authority.comparison.comparisonHash,
        audienceDefinitionVersion:
          SMART_MANAGER_AUDIENCE_DEFINITION_VERSION,
        segment: 'at_risk',
        audienceCount: authority.lifecycleEvidence.audienceCount,
        lifecycleSourceFingerprint:
          authority.lifecycleEvidence.lifecycleSourceFingerprint,
        observedAt: authority.lifecycleEvidence.observedAt,
        recipientCeiling: authority.policy.config.recipientCeiling,
        materializationState: 'not_materialized',
        channelStrategy: SMART_MANAGER_WINBACK_CHANNEL_STRATEGY,
        campaignDraft: SMART_MANAGER_WINBACK_CAMPAIGN_DRAFT,
        nextCopyRevision: 2,
        copyRevisionLimit: SMART_MANAGER_MAX_COPY_REVISION_SLOTS,
        generationState: 'not_requested',
        state: 'reviewable',
        preparedByUserId: authorization.actor._id,
        expiresAt: authority.evidenceExpiresAt,
        retentionExpiresAt,
        createdAt: now,
        updatedAt: now,
      }
    )) as Id<'smartManagerPreparedActions'>;

    const contentHash = buildPreparedActionCopyContentHash(
      SMART_MANAGER_WINBACK_FALLBACK_COPY
    );
    const selectedCopyId = (await ctx.db.insert(
      'smartManagerPreparedActionCopies',
      {
        preparedActionId,
        businessId: args.businessId,
        revision: 1,
        title: SMART_MANAGER_WINBACK_FALLBACK_COPY.title,
        body: SMART_MANAGER_WINBACK_FALLBACK_COPY.body,
        contentHash,
        provenance: 'deterministic',
        generationVersion: SMART_MANAGER_FALLBACK_GENERATION_VERSION,
        createdAt: now,
        retentionExpiresAt,
      }
    )) as Id<'smartManagerPreparedActionCopies'>;
    await ctx.db.patch(preparedActionId, {
      selectedCopyId,
      selectedCopyRevision: 1,
      updatedAt: now,
    });

    const committedAction = (await ctx.db.get(preparedActionId)) as
      | Doc<'smartManagerPreparedActions'>
      | null;
    if (!committedAction) {
      throwMalformedPreparedAction();
    }
    await writePreparedActionAudit(ctx, {
      eventType: 'prepared_action_created',
      action: committedAction,
      actorUserId: authorization.actor._id,
      now,
      detail: {
        actionKind: 'winback_campaign',
        preparationKey,
        selectedCopyRevision: 1,
      },
    });

    const scheduler = ctx.scheduler;
    if (
      access.hasAiAssist &&
      scheduler?.runAfter &&
      !hasActiveSmartManagerGenerationRequest(committedAction, now)
    ) {
      const structuredInput = buildSmartManagerWinbackStructuredInput({
        audienceCount: committedAction.audienceCount,
        recipientCeiling: committedAction.recipientCeiling,
      });
      const structuredInputHash =
        buildSmartManagerStructuredInputHash(structuredInput);
      const promptHash = hashSmartManagerWinbackPrompt(
        buildSmartManagerWinbackPrompt(structuredInput)
      );
      const cache = await loadSmartManagerCacheCandidate({
        ctx,
        cacheKey: buildSmartManagerAiCacheKey({ structuredInputHash }),
        promptHash,
        structuredInputHash,
        now,
      });
      let canSchedule = cache.state === 'hit';
      if (cache.state === 'miss') {
        canSchedule =
          !isBelowSmartManagerFreshAiMinimum(
            committedAction.audienceCount,
            authority.policy
          );
        if (canSchedule) {
          const usage = await loadBoundedSmartManagerFreshUsage({
            ctx,
            businessId: committedAction.businessId,
            now,
          });
          canSchedule =
            usage.available && usage.used < access.aiMonthlyLimit;
        }
      }
      if (canSchedule) {
        try {
          await consumeSmartManagerGenerationRateLimits(ctx, {
            businessId: String(committedAction.businessId),
            actorUserId: String(authorization.actor._id),
            explicitRegeneration: false,
          });
        } catch (error) {
          if (!isSmartManagerRateLimitError(error)) {
            throw error;
          }
          canSchedule = false;
        }
      }
      if (canSchedule) {
        const reservation = buildGenerationReservation({
          action: committedAction,
          actorUserId: authorization.actor._id,
          requestKind: 'initial_prepare',
          expectedSelectedCopyId: selectedCopyId,
          expectedSelectedCopyRevision: 1,
          reservedResultRevision: 2,
          requestedAt: now,
        });
        await ctx.db.patch(preparedActionId, {
          nextCopyRevision: 3,
          generationState: 'queued',
          generationActorUserId: authorization.actor._id,
          generationRequestKind: 'initial_prepare',
          generationRequestToken: reservation.requestToken,
          generationRequestBindingHash: reservation.requestBindingHash,
          generationExpectedCopyId: selectedCopyId,
          generationExpectedCopyRevision: 1,
          generationReservedCopyRevision: 2,
          generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
          generationPromptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
          generationPromptHash: reservation.promptHash,
          generationInputHash: reservation.structuredInputHash,
          generationFailureCode: undefined,
          generationRequestedAt: now,
          generationCompletedAt: undefined,
          updatedAt: now,
        });
        const requestedAction = {
          ...committedAction,
          nextCopyRevision: 3,
          generationState: 'queued' as const,
          generationActorUserId: authorization.actor._id,
          generationRequestKind: 'initial_prepare' as const,
          generationRequestToken: reservation.requestToken,
          generationRequestBindingHash: reservation.requestBindingHash,
          generationExpectedCopyId: selectedCopyId,
          generationExpectedCopyRevision: 1,
          generationReservedCopyRevision: 2,
          generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
          generationPromptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
          generationPromptHash: reservation.promptHash,
          generationInputHash: reservation.structuredInputHash,
          generationRequestedAt: now,
          updatedAt: now,
        } as Doc<'smartManagerPreparedActions'>;
        await writeAiGenerationAudit(ctx, {
          eventType: 'ai_generation_requested',
          action: requestedAction,
          actorUserId: authorization.actor._id,
          requestToken: reservation.requestToken,
          requestBindingHash: reservation.requestBindingHash,
          reservedResultRevision: 2,
          generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
          promptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
          model: OPENROUTER_JSON_MODEL,
          now,
        });
        try {
          await scheduler.runAfter(0, runGenerationRef, {
            preparedActionId,
            requestToken: reservation.requestToken,
            requestBindingHash: reservation.requestBindingHash,
            reservedResultRevision: 2,
            actorUserId: authorization.actor._id,
          });
        } catch {
          await ctx.db.patch(preparedActionId, {
            generationState: 'failed',
            generationFailureCode: 'AI_GENERATION_SCHEDULING_FAILED',
            generationCompletedAt: now,
            updatedAt: now,
          });
          await writeAiGenerationAudit(ctx, {
            eventType: 'ai_generation_failed',
            action: requestedAction,
            actorUserId: authorization.actor._id,
            requestToken: reservation.requestToken,
            requestBindingHash: reservation.requestBindingHash,
            reservedResultRevision: 2,
            generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
            promptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
            model: OPENROUTER_JSON_MODEL,
            failureCode: 'AI_GENERATION_SCHEDULING_FAILED',
            now,
          });
        }
      }
    }

    return {
      preparedActionId,
      reused: false,
      copyRevision: 1,
      contentHash,
    };
  },
});

export const regeneratePreparedWinbackCopy = mutation({
  args: {
    preparedActionId: v.id('smartManagerPreparedActions'),
    expectedCopyRevision: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx);
    const action = (await ctx.db.get(args.preparedActionId)) as
      | Doc<'smartManagerPreparedActions'>
      | null;
    if (!action) {
      throw new Error('SMART_MANAGER_PREPARED_ACTION_NOT_FOUND');
    }
    let authorization: Awaited<
      ReturnType<typeof authorizePreparedWinbackActor>
    >;
    try {
      authorization = await authorizePreparedWinbackActor(
        ctx,
        action.businessId
      );
    } catch {
      throw new Error('SMART_MANAGER_PREPARED_ACTION_NOT_FOUND');
    }
    const now = Date.now();
    const authority = await resolveSmartManagerDecisionAuthority(ctx, {
      businessId: action.businessId,
      expectedEvidenceFingerprint: action.evidenceFingerprint,
      now,
    });
    if (!authority.business) {
      throw new Error('ACTION_STALE');
    }
    const access = buildBoundedSmartManagerAccessContext({
      business: authority.business,
      authorization,
      authority,
      now,
    });
    if (!access.hasSmartManagerAccess) {
      throw new Error(access.aiAssistReason ?? 'AI_ASSIST_NOT_AVAILABLE');
    }
    if (!access.hasAiAssist) {
      throw new Error(access.aiAssistReason ?? 'AI_ASSIST_NOT_AVAILABLE');
    }
    if (!access.campaignQuotaCurrent) {
      throw new Error('REEVALUATION_PENDING');
    }
    const currentness = evaluatePreparedActionCurrentness({
      action,
      authority,
      now,
    });
    if (currentness.currentness !== 'current' || currentness.blockers.length) {
      throw new Error(
        currentness.currentness === 'expired'
          ? 'ACTION_EXPIRED'
          : currentness.currentness === 'reevaluation_pending'
            ? 'REEVALUATION_PENDING'
            : 'ACTION_STALE'
      );
    }
    const selectedCopy = await loadSelectedCopyOrThrow(ctx, action);
    if (
      !Number.isInteger(args.expectedCopyRevision) ||
      args.expectedCopyRevision !== action.selectedCopyRevision ||
      args.expectedCopyRevision !== selectedCopy.revision
    ) {
      throw new Error('COPY_REVISION_CONFLICT');
    }
    const fallbackRevision = action.nextCopyRevision;
    const reservedResultRevision = fallbackRevision + 1;
    if (
      fallbackRevision < 2 ||
      reservedResultRevision > action.copyRevisionLimit
    ) {
      throw new Error('COPY_REVISION_LIMIT_REACHED');
    }
    if (hasActiveSmartManagerGenerationRequest(action, now)) {
      throw new Error('AI_GENERATION_IN_PROGRESS');
    }
    const structuredInput = buildSmartManagerWinbackStructuredInput({
      audienceCount: action.audienceCount,
      recipientCeiling: action.recipientCeiling,
    });
    const structuredInputHash =
      buildSmartManagerStructuredInputHash(structuredInput);
    const promptHash = hashSmartManagerWinbackPrompt(
      buildSmartManagerWinbackPrompt(structuredInput)
    );
    const cache = await loadSmartManagerCacheCandidate({
      ctx,
      cacheKey: buildSmartManagerAiCacheKey({ structuredInputHash }),
      promptHash,
      structuredInputHash,
      now,
    });
    if (cache.state === 'unavailable') {
      throw new Error('AI_CACHE_UNAVAILABLE');
    }
    if (cache.state !== 'hit') {
      if (
        isBelowSmartManagerFreshAiMinimum(
          action.audienceCount,
          authority.policy
        )
      ) {
        throw new Error('AI_FRESH_AUDIENCE_BELOW_MINIMUM');
      }
      const usage = await loadBoundedSmartManagerFreshUsage({
        ctx,
        businessId: action.businessId,
        now,
      });
      if (!usage.available) {
        throw new Error('AI_USAGE_EVIDENCE_UNAVAILABLE');
      }
      if (usage.used >= access.aiMonthlyLimit) {
        throw new Error('AI_MONTHLY_QUOTA_EXHAUSTED');
      }
    }
    try {
      await consumeSmartManagerGenerationRateLimits(ctx, {
        businessId: String(action.businessId),
        actorUserId: String(authorization.actor._id),
        explicitRegeneration: true,
      });
    } catch (error) {
      if (isSmartManagerRateLimitError(error)) {
        throw new Error('AI_RATE_LIMITED');
      }
      throw error;
    }

    const contentHash = buildPreparedActionCopyContentHash(
      SMART_MANAGER_WINBACK_FALLBACK_COPY
    );
    const fallbackCopyId = (await ctx.db.insert(
      'smartManagerPreparedActionCopies',
      {
        preparedActionId: action._id,
        businessId: action.businessId,
        revision: fallbackRevision,
        title: SMART_MANAGER_WINBACK_FALLBACK_COPY.title,
        body: SMART_MANAGER_WINBACK_FALLBACK_COPY.body,
        contentHash,
        provenance: 'deterministic',
        generationVersion: SMART_MANAGER_FALLBACK_GENERATION_VERSION,
        createdAt: now,
        retentionExpiresAt: action.retentionExpiresAt,
      }
    )) as Id<'smartManagerPreparedActionCopies'>;
    const reservation = buildGenerationReservation({
      action,
      actorUserId: authorization.actor._id,
      requestKind: 'explicit_regeneration',
      expectedSelectedCopyId: fallbackCopyId,
      expectedSelectedCopyRevision: fallbackRevision,
      reservedResultRevision,
      requestedAt: now,
    });
    await ctx.db.patch(action._id, {
      selectedCopyId: fallbackCopyId,
      selectedCopyRevision: fallbackRevision,
      nextCopyRevision: reservedResultRevision + 1,
      generationState: 'queued',
      generationActorUserId: authorization.actor._id,
      generationRequestKind: 'explicit_regeneration',
      generationRequestToken: reservation.requestToken,
      generationRequestBindingHash: reservation.requestBindingHash,
      generationExpectedCopyId: fallbackCopyId,
      generationExpectedCopyRevision: fallbackRevision,
      generationReservedCopyRevision: reservedResultRevision,
      generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
      generationPromptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
      generationPromptHash: reservation.promptHash,
      generationInputHash: reservation.structuredInputHash,
      generationFailureCode: undefined,
      generationRequestedAt: now,
      generationCompletedAt: undefined,
      updatedAt: now,
    });
    const requestedAction = {
      ...action,
      selectedCopyId: fallbackCopyId,
      selectedCopyRevision: fallbackRevision,
      nextCopyRevision: reservedResultRevision + 1,
      generationState: 'queued' as const,
      generationActorUserId: authorization.actor._id,
      generationRequestKind: 'explicit_regeneration' as const,
      generationRequestToken: reservation.requestToken,
      generationRequestBindingHash: reservation.requestBindingHash,
      generationExpectedCopyId: fallbackCopyId,
      generationExpectedCopyRevision: fallbackRevision,
      generationReservedCopyRevision: reservedResultRevision,
      generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
      generationPromptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
      generationPromptHash: reservation.promptHash,
      generationInputHash: reservation.structuredInputHash,
      generationRequestedAt: now,
      updatedAt: now,
    } as Doc<'smartManagerPreparedActions'>;
    await writePreparedCopySelectedAudit(ctx, {
      action: requestedAction,
      actorUserId: authorization.actor._id,
      copyId: fallbackCopyId,
      selectedCopyRevision: fallbackRevision,
      provenance: 'deterministic',
      now,
    });
    await writeAiGenerationAudit(ctx, {
      eventType: 'ai_generation_requested',
      action: requestedAction,
      actorUserId: authorization.actor._id,
      requestToken: reservation.requestToken,
      requestBindingHash: reservation.requestBindingHash,
      reservedResultRevision,
      generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
      promptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
      model: OPENROUTER_JSON_MODEL,
      now,
    });
    let generationScheduled = false;
    if (ctx.scheduler?.runAfter) {
      try {
        await ctx.scheduler.runAfter(0, runGenerationRef, {
          preparedActionId: action._id,
          requestToken: reservation.requestToken,
          requestBindingHash: reservation.requestBindingHash,
          reservedResultRevision,
          actorUserId: authorization.actor._id,
        });
        generationScheduled = true;
      } catch {
        await ctx.db.patch(action._id, {
          generationState: 'failed',
          generationFailureCode: 'AI_GENERATION_SCHEDULING_FAILED',
          generationCompletedAt: now,
          updatedAt: now,
        });
        await writeAiGenerationAudit(ctx, {
          eventType: 'ai_generation_failed',
          action: requestedAction,
          actorUserId: authorization.actor._id,
          requestToken: reservation.requestToken,
          requestBindingHash: reservation.requestBindingHash,
          reservedResultRevision,
          generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
          promptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
          model: OPENROUTER_JSON_MODEL,
          failureCode: 'AI_GENERATION_SCHEDULING_FAILED',
          now,
        });
      }
    }
    return {
      preparedActionId: action._id,
      copyRevision: fallbackRevision,
      contentHash,
      generationRequested: generationScheduled,
      reason: generationScheduled
        ? null
        : 'AI_GENERATION_SCHEDULING_FAILED',
    };
  },
});

export const loadPreparedWinbackGenerationPreflightInternal = internalQuery({
  args: {
    preparedActionId: v.id('smartManagerPreparedActions'),
    requestToken: v.string(),
    requestBindingHash: v.string(),
    reservedResultRevision: v.number(),
    actorUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const validated = await revalidateGenerationRequest(ctx, {
      ...args,
      now,
    });
    if (!validated.ok) {
      return { ok: false as const, code: validated.code };
    }
    const cacheKey = buildSmartManagerAiCacheKey({
      structuredInputHash: validated.structuredInputHash,
    });
    const cache = await loadSmartManagerCacheCandidate({
      ctx,
      cacheKey,
      promptHash: validated.promptHash,
      structuredInputHash: validated.structuredInputHash,
      now,
    });
    if (cache.state === 'unavailable') {
      return { ok: false as const, code: 'AI_CACHE_UNAVAILABLE' as const };
    }
    if (cache.state === 'hit') {
      return {
        ok: true as const,
        source: 'cache' as const,
        businessId: validated.action.businessId,
        actorUserId: validated.action.generationActorUserId,
        explicitRegeneration:
          validated.action.generationRequestKind === 'explicit_regeneration',
        cacheKey,
        cacheId: cache.row._id,
        output: cache.output,
      };
    }
    if (
      isBelowSmartManagerFreshAiMinimum(
        validated.action.audienceCount,
        validated.authority.policy
      )
    ) {
      return {
        ok: false as const,
        code: 'AI_FRESH_AUDIENCE_BELOW_MINIMUM' as const,
      };
    }
    const usage = await loadBoundedSmartManagerFreshUsage({
      ctx,
      businessId: validated.action.businessId,
      now,
    });
    if (!usage.available) {
      return {
        ok: false as const,
        code: 'AI_USAGE_EVIDENCE_UNAVAILABLE' as const,
      };
    }
    if (usage.used >= validated.access.aiMonthlyLimit) {
      return {
        ok: false as const,
        code: 'AI_MONTHLY_QUOTA_EXHAUSTED' as const,
      };
    }
    return {
      ok: true as const,
      source: 'fresh' as const,
      businessId: validated.action.businessId,
      actorUserId: validated.action.generationActorUserId,
      explicitRegeneration:
        validated.action.generationRequestKind === 'explicit_regeneration',
      cacheKey,
      prompt: validated.prompt,
    };
  },
});

async function insertSmartManagerUsageLedger(
  ctx: MutationCtx,
  args: {
    action: Doc<'smartManagerPreparedActions'>;
    status: 'success' | 'failed';
    inputTokens?: number;
    outputTokens?: number;
    now: number;
  }
) {
  await ctx.db.insert('aiUsageLedger', {
    businessId: args.action.businessId,
    preparedActionId: args.action._id,
    monthKey: monthKeyFromTimestamp(args.now),
    requestType: 'smart_manager_copy_generation',
    model: OPENROUTER_JSON_MODEL,
    cacheHit: false,
    status: args.status,
    inputTokens: sanitizedUsageCount(args.inputTokens),
    outputTokens: sanitizedUsageCount(args.outputTokens),
    createdAt: args.now,
  });
}

export const finalizePreparedWinbackGenerationInternal = internalMutation({
  args: {
    preparedActionId: v.id('smartManagerPreparedActions'),
    requestToken: v.string(),
    requestBindingHash: v.string(),
    reservedResultRevision: v.number(),
    actorUserId: v.id('users'),
    outcome: v.union(
      v.literal('ai_cache'),
      v.literal('ai_fresh'),
      v.literal('failed')
    ),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    cacheId: v.optional(v.id('aiGenerationCache')),
    failureCode: v.optional(smartManagerAiFailureCodeValidator),
    providerAttempted: v.boolean(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const validated = await revalidateGenerationRequest(ctx, {
      preparedActionId: args.preparedActionId,
      requestToken: args.requestToken,
      requestBindingHash: args.requestBindingHash,
      reservedResultRevision: args.reservedResultRevision,
      actorUserId: args.actorUserId,
      now,
    });
    if (!validated.ok) {
      if (validated.action && validated.requestMatches) {
        await ctx.db.patch(validated.action._id, {
          generationState: 'stale_discarded',
          generationFailureCode: validated.code,
          generationCompletedAt: now,
          updatedAt: now,
        });
        await writeAiGenerationAudit(ctx, {
          eventType: 'ai_generation_stale_discarded',
          action: validated.action,
          actorUserId: args.actorUserId,
          requestToken: args.requestToken,
          requestBindingHash: args.requestBindingHash,
          reservedResultRevision: args.reservedResultRevision,
          generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
          promptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
          model: OPENROUTER_JSON_MODEL,
          failureCode: validated.code,
          now,
        });
      }
      if (validated.action && args.providerAttempted) {
        await insertSmartManagerUsageLedger(ctx, {
          action: validated.action,
          status: 'failed',
          inputTokens: args.inputTokens,
          outputTokens: args.outputTokens,
          now,
        });
      }
      return { status: 'stale_discarded' as const };
    }
    const action = validated.action;
    const reservedResultRevision = action.generationReservedCopyRevision;
    if (
      reservedResultRevision === undefined ||
      reservedResultRevision < 2 ||
      reservedResultRevision > action.copyRevisionLimit ||
      action.nextCopyRevision <= reservedResultRevision
    ) {
      throwMalformedPreparedAction();
    }

    const failCurrentRequest = async (
      failureCode: SmartManagerAiFailureCode
    ) => {
      await ctx.db.patch(action._id, {
        generationState: 'failed',
        generationFailureCode: failureCode,
        generationCompletedAt: now,
        updatedAt: now,
      });
      if (args.providerAttempted) {
        await insertSmartManagerUsageLedger(ctx, {
          action,
          status: 'failed',
          inputTokens: args.inputTokens,
          outputTokens: args.outputTokens,
          now,
        });
      }
      await writeAiGenerationAudit(ctx, {
        eventType: 'ai_generation_failed',
        action,
        actorUserId: args.actorUserId,
        requestToken: args.requestToken,
        requestBindingHash: args.requestBindingHash,
        reservedResultRevision,
        generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
        promptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
        model: OPENROUTER_JSON_MODEL,
        failureCode,
        now,
      });
      return { status: 'failed' as const, reason: failureCode };
    };

    if (args.outcome === 'failed') {
      return await failCurrentRequest(
        args.failureCode ?? 'AI_PROVIDER_CONTENT_INVALID'
      );
    }
    const output = validateSmartManagerWinbackOutput({
      type: 'winback_copy',
      title: args.title,
      body: args.body,
    });
    if (!output.ok) {
      return await failCurrentRequest(output.code);
    }
    const cacheKey = buildSmartManagerAiCacheKey({
      structuredInputHash: validated.structuredInputHash,
    });
    if (args.outcome === 'ai_cache') {
      const cache = await loadSmartManagerCacheCandidate({
        ctx,
        cacheKey,
        promptHash: validated.promptHash,
        structuredInputHash: validated.structuredInputHash,
        now,
      });
      if (
        cache.state !== 'hit' ||
        !args.cacheId ||
        String(cache.row._id) !== String(args.cacheId) ||
        cache.output.title !== output.value.title ||
        cache.output.body !== output.value.body
      ) {
        return await failCurrentRequest('AI_CACHE_UNAVAILABLE');
      }
    } else {
      const usage = await loadBoundedSmartManagerFreshUsage({
        ctx,
        businessId: action.businessId,
        now,
      });
      if (!usage.available) {
        return await failCurrentRequest('AI_USAGE_EVIDENCE_UNAVAILABLE');
      }
      if (usage.used >= validated.access.aiMonthlyLimit) {
        return await failCurrentRequest('AI_MONTHLY_QUOTA_EXHAUSTED');
      }
      const cacheAtFinalization = await loadSmartManagerCacheCandidate({
        ctx,
        cacheKey,
        promptHash: validated.promptHash,
        structuredInputHash: validated.structuredInputHash,
        now,
      });
      if (cacheAtFinalization.state === 'unavailable') {
        return await failCurrentRequest('AI_CACHE_UNAVAILABLE');
      }
      const persisted = await persistSmartManagerCacheResult(ctx, {
        cacheKey,
        promptHash: validated.promptHash,
        structuredInputHash: validated.structuredInputHash,
        title: output.value.title,
        body: output.value.body,
        now,
      });
      if (!persisted.ok) {
        return await failCurrentRequest(persisted.code);
      }
    }

    const existingRevisionRows = await ctx.db
      .query('smartManagerPreparedActionCopies')
      .withIndex('by_preparedActionId_revision', (q) =>
        q
          .eq('preparedActionId', action._id)
          .eq('revision', reservedResultRevision)
      )
      .take(BOUNDED_SINGLETON_LIMIT);
    if (existingRevisionRows.length !== 0) {
      return await failCurrentRequest('COPY_REVISION_CONFLICT');
    }
    const provenance = args.outcome;
    const contentHash = buildPreparedActionCopyContentHash(output.value);
    const copyId = (await ctx.db.insert('smartManagerPreparedActionCopies', {
      preparedActionId: action._id,
      businessId: action.businessId,
      revision: reservedResultRevision,
      title: output.value.title,
      body: output.value.body,
      contentHash,
      provenance,
      generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
      promptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
      promptHash: validated.promptHash,
      inputHash: validated.structuredInputHash,
      providerModel: OPENROUTER_JSON_MODEL,
      requestBindingHash: args.requestBindingHash,
      createdAt: now,
      retentionExpiresAt: action.retentionExpiresAt,
    })) as Id<'smartManagerPreparedActionCopies'>;
    await ctx.db.patch(action._id, {
      selectedCopyId: copyId,
      selectedCopyRevision: reservedResultRevision,
      generationState: 'succeeded',
      generationFailureCode: undefined,
      generationCompletedAt: now,
      updatedAt: now,
    });

    if (args.outcome === 'ai_cache' && args.cacheId) {
      await ctx.db.patch(args.cacheId, { lastUsedAt: now });
    } else {
      await insertSmartManagerUsageLedger(ctx, {
        action,
        status: 'success',
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        now,
      });
    }
    await writeAiGenerationAudit(ctx, {
      eventType:
        args.outcome === 'ai_cache'
          ? 'ai_cache_hit'
          : 'ai_generation_succeeded',
      action,
      actorUserId: args.actorUserId,
      requestToken: args.requestToken,
      requestBindingHash: args.requestBindingHash,
      reservedResultRevision,
      generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
      promptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
      model: OPENROUTER_JSON_MODEL,
      provenance,
      copyId,
      selectedCopyRevision: reservedResultRevision,
      now,
    });
    await writePreparedCopySelectedAudit(ctx, {
      action,
      actorUserId: action.generationActorUserId,
      copyId,
      selectedCopyRevision: reservedResultRevision,
      provenance,
      now,
    });
    return {
      status: 'selected' as const,
      copyId,
      revision: reservedResultRevision,
      provenance,
    };
  },
});

export const runPreparedWinbackGenerationInternal = internalAction({
  args: {
    preparedActionId: v.id('smartManagerPreparedActions'),
    requestToken: v.string(),
    requestBindingHash: v.string(),
    reservedResultRevision: v.number(),
    actorUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const preflight = await ctx.runQuery(generationPreflightRef, args);
    if (!preflight.ok) {
      return await ctx.runMutation(finalizeGenerationRef, {
        ...args,
        outcome: 'failed',
        failureCode: preflight.code,
        providerAttempted: false,
      });
    }
    if (preflight.source === 'cache') {
      return await ctx.runMutation(finalizeGenerationRef, {
        ...args,
        outcome: 'ai_cache',
        title: preflight.output.title,
        body: preflight.output.body,
        cacheId: preflight.cacheId,
        providerAttempted: false,
      });
    }
    const generated = await generateOpenRouterJson({
      prompt: preflight.prompt,
      model: OPENROUTER_JSON_MODEL,
      maxOutputTokens: SMART_MANAGER_AI_MAX_OUTPUT_TOKENS,
      validate: validateSmartManagerWinbackOutput,
    });
    if (!generated.ok) {
      return await ctx.runMutation(finalizeGenerationRef, {
        ...args,
        outcome: 'failed',
        failureCode: generated.code,
        providerAttempted: true,
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
      });
    }
    return await ctx.runMutation(finalizeGenerationRef, {
      ...args,
      outcome: 'ai_fresh',
      title: generated.output.title,
      body: generated.output.body,
      providerAttempted: true,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
    });
  },
});

export const cleanupPreparedActionRetentionInternal = internalMutation({
  args: {
    limit: v.optional(v.number()),
    phase: v.optional(v.union(v.literal('copies'), v.literal('actions'))),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const requestedLimit = Number(args.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(
          1,
          Math.min(
            SMART_MANAGER_PREPARED_RETENTION_CLEANUP_MAX_PAGE,
            Math.floor(requestedLimit)
          )
        )
      : SMART_MANAGER_PREPARED_RETENTION_CLEANUP_MAX_PAGE;
    const phase = args.phase ?? 'copies';
    const cutoff = Date.now();

    if (phase === 'copies') {
      const page = await ctx.db
        .query('smartManagerPreparedActionCopies')
        .withIndex('by_retentionExpiresAt', (q) =>
          q.lte('retentionExpiresAt', cutoff)
        )
        .paginate({ cursor: args.cursor ?? null, numItems: limit });
      let copiesDeleted = 0;
      let retainedCopies = 0;
      for (const copy of page.page) {
        const parent = await ctx.db.get(copy.preparedActionId);
        const parentStillRetained =
          parent && Number(parent.retentionExpiresAt) > cutoff;
        const copyIsStillReferenced =
          parent &&
          (String(parent.selectedCopyId ?? '') === String(copy._id) ||
            String(parent.generationExpectedCopyId ?? '') === String(copy._id));
        if (parentStillRetained || copyIsStillReferenced) {
          retainedCopies += 1;
          continue;
        }
        await ctx.db.delete(copy._id);
        copiesDeleted += 1;
      }
      const nextArgs = page.isDone
        ? { limit, phase: 'actions' as const, cursor: null }
        : {
            limit,
            phase: 'copies' as const,
            cursor: page.continueCursor,
          };
      const continuationScheduled = Boolean(ctx.scheduler?.runAfter);
      if (continuationScheduled) {
        await ctx.scheduler.runAfter(
          SMART_MANAGER_PREPARED_RETENTION_CONTINUATION_DELAY_MS,
          cleanupPreparedRetentionRef,
          nextArgs
        );
      }
      return {
        phase,
        examined: page.page.length,
        copiesDeleted,
        actionsDeleted: 0,
        retainedCopies,
        retainedParents: 0,
        continueCursor: nextArgs.cursor,
        nextPhase: nextArgs.phase,
        continuationScheduled,
      };
    }

    const page = await ctx.db
      .query('smartManagerPreparedActions')
      .withIndex('by_retentionExpiresAt', (q) =>
        q.lte('retentionExpiresAt', cutoff)
      )
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    let actionsDeleted = 0;
    let copiesDeleted = 0;
    let retainedParents = 0;
    for (const action of page.page) {
      const children = await ctx.db
        .query('smartManagerPreparedActionCopies')
        .withIndex('by_preparedActionId_revision', (q) =>
          q.eq('preparedActionId', action._id)
        )
        .take(SMART_MANAGER_MAX_COPY_REVISION_SLOTS + 1);
      const childrenAreBounded =
        children.length <= SMART_MANAGER_MAX_COPY_REVISION_SLOTS;
      const everyChildRetentionExpired = children.every(
        (child) => Number(child.retentionExpiresAt) <= cutoff
      );
      if (!childrenAreBounded || !everyChildRetentionExpired) {
        retainedParents += 1;
        continue;
      }
      for (const child of children) {
        await ctx.db.delete(child._id);
        copiesDeleted += 1;
      }
      await ctx.db.delete(action._id);
      actionsDeleted += 1;
    }
    const continuationScheduled =
      !page.isDone && Boolean(ctx.scheduler?.runAfter);
    if (continuationScheduled) {
      await ctx.scheduler.runAfter(
        SMART_MANAGER_PREPARED_RETENTION_CONTINUATION_DELAY_MS,
        cleanupPreparedRetentionRef,
        {
          limit,
          phase: 'actions',
          cursor: page.continueCursor,
        }
      );
    }
    return {
      phase,
      examined: page.page.length,
      copiesDeleted,
      actionsDeleted,
      retainedCopies: 0,
      retainedParents,
      continueCursor: page.continueCursor,
      nextPhase: page.isDone ? null : ('actions' as const),
      continuationScheduled,
    };
  },
});

async function buildPreparedWinbackReview(
  ctx: QueryCtx,
  action: Doc<'smartManagerPreparedActions'>,
  authorization: Awaited<ReturnType<typeof authorizePreparedWinbackActor>>,
  now: number
) {
  const authority = await resolveSmartManagerDecisionAuthority(ctx, {
    businessId: action.businessId,
    now,
  });
  if (!authority.business) {
    throw new Error('SMART_MANAGER_PREPARED_ACTION_NOT_FOUND');
  }
  const access = buildBoundedSmartManagerAccessContext({
    business: authority.business,
    authorization,
    authority,
    now,
  });
  const actionCurrentness = evaluatePreparedActionCurrentness({
    action,
    authority,
    now,
  });
  const selectedCopy = await loadSelectedCopyOrThrow(ctx, action);
  const quotaCurrentnessBlockers =
    selectSmartManagerAccessCurrentnessBlockers(access.blockers);
  const quotaNeedsEvaluation = quotaCurrentnessBlockers.length > 0;
  const currentness =
    actionCurrentness.currentness === 'current' && quotaNeedsEvaluation
      ? ('reevaluation_pending' as const)
      : actionCurrentness.currentness;
  const currentnessBlockers = [
    ...actionCurrentness.blockers,
    ...quotaCurrentnessBlockers,
  ].filter(
    (blocker, index, values) => values.indexOf(blocker) === index
  );
  currentnessBlockers.sort();

  const approvalBlockers = [
    ...currentnessBlockers,
    ...access.blockers,
    ...(action.audienceCount > action.recipientCeiling
      ? ['RECIPIENT_CEILING_EXCEEDED' as const]
      : []),
  ].filter((blocker, index, values) => values.indexOf(blocker) === index);
  approvalBlockers.sort();
  const eligibleForApproval =
    currentness === 'current' &&
    access.hasSmartManagerAccess &&
    access.campaignQuotaCurrent &&
    access.campaignCapacityAvailable &&
    access.hasApprovalCapabilities &&
    action.audienceCount <= action.recipientCeiling &&
    approvalBlockers.length === 0;

  let regenerationReason: string | null = null;
  if (currentness === 'expired') {
    regenerationReason = 'ACTION_EXPIRED';
  } else if (currentness === 'reevaluation_pending') {
    regenerationReason = 'REEVALUATION_PENDING';
  } else if (currentness !== 'current') {
    regenerationReason = 'ACTION_STALE';
  } else if (!access.hasAiAssist) {
    regenerationReason =
      access.aiAssistReason ?? 'AI_ASSIST_NOT_AVAILABLE';
  } else if (action.nextCopyRevision + 1 > action.copyRevisionLimit) {
    regenerationReason = 'COPY_REVISION_LIMIT_REACHED';
  } else if (
    action.generationState === 'queued' ||
    action.generationState === 'running'
  ) {
    regenerationReason = 'AI_GENERATION_IN_PROGRESS';
  } else {
    const structuredInput = buildSmartManagerWinbackStructuredInput({
      audienceCount: action.audienceCount,
      recipientCeiling: action.recipientCeiling,
    });
    const structuredInputHash =
      buildSmartManagerStructuredInputHash(structuredInput);
    const promptHash = hashSmartManagerWinbackPrompt(
      buildSmartManagerWinbackPrompt(structuredInput)
    );
    const cache = await loadSmartManagerCacheCandidate({
      ctx,
      cacheKey: buildSmartManagerAiCacheKey({ structuredInputHash }),
      promptHash,
      structuredInputHash,
      now,
    });
    if (cache.state === 'unavailable') {
      regenerationReason = 'AI_CACHE_UNAVAILABLE';
    } else if (
      cache.state !== 'hit' &&
      isBelowSmartManagerFreshAiMinimum(
        action.audienceCount,
        authority.policy
      )
    ) {
      regenerationReason = 'AI_FRESH_AUDIENCE_BELOW_MINIMUM';
    } else if (cache.state !== 'hit') {
      const usage = await loadBoundedSmartManagerFreshUsage({
        ctx,
        businessId: action.businessId,
        now,
      });
      if (!usage.available) {
        regenerationReason = 'AI_USAGE_EVIDENCE_UNAVAILABLE';
      } else if (usage.used >= access.aiMonthlyLimit) {
        regenerationReason = 'AI_MONTHLY_QUOTA_EXHAUSTED';
      }
    }
  }

  return {
    preparedActionId: action._id,
    detection: {
      stableId: action.stableId,
      explanation: buildPreparedWinbackDetectionExplanation(
        action.audienceCount
      ),
      audienceCount: action.audienceCount,
      observedAt: action.observedAt,
      lifecycleSourceFingerprint: action.lifecycleSourceFingerprint,
      evidenceFingerprint: action.evidenceFingerprint,
      policyVersion: action.policyVersion,
      authorityMode: action.authorityMode,
    },
    proposal: action.campaignDraft,
    channelStrategy: action.channelStrategy,
    audience: {
      audienceDefinitionVersion: action.audienceDefinitionVersion,
      segment: action.segment,
      observedCount: action.audienceCount,
      observedAt: action.observedAt,
      lifecycleSourceFingerprint: action.lifecycleSourceFingerprint,
      recipientMaterialization: 'not_started' as const,
    },
    message: {
      copyId: selectedCopy._id,
      revision: selectedCopy.revision,
      contentHash: selectedCopy.contentHash,
      title: selectedCopy.title,
      body: selectedCopy.body,
      provenance: selectedCopy.provenance,
      generationVersion: selectedCopy.generationVersion,
      promptVersion: selectedCopy.promptVersion,
    },
    regeneration: {
      available: regenerationReason === null,
      reason: regenerationReason,
      reasons: regenerationReason ? [regenerationReason] : [],
    },
    currentness: {
      state: currentness,
      blockers: currentnessBlockers,
      checkedAt: now,
      expiresAt: action.expiresAt,
    },
    approval: {
      eligibleForApproval,
      requiredRole: 'owner_or_manager' as const,
      blockers: approvalBlockers,
      binding: {
        preparedActionId: action._id,
        copyRevision: selectedCopy.revision,
        contentHash: selectedCopy.contentHash,
      },
    },
    execution: {
      state: 'not_implemented' as const,
      campaignId: null,
      recipientsMaterialized: false,
      deliveryStarted: false,
    },
  };
}

export const getPreparedWinbackReview = query({
  args: {
    preparedActionId: v.id('smartManagerPreparedActions'),
  },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx);
    const action = (await ctx.db.get(args.preparedActionId)) as
      | Doc<'smartManagerPreparedActions'>
      | null;
    if (!action) {
      throw new Error('SMART_MANAGER_PREPARED_ACTION_NOT_FOUND');
    }
    let authorization: Awaited<
      ReturnType<typeof authorizePreparedWinbackActor>
    >;
    try {
      authorization = await authorizePreparedWinbackActor(
        ctx,
        action.businessId
      );
    } catch {
      throw new Error('SMART_MANAGER_PREPARED_ACTION_NOT_FOUND');
    }
    return await buildPreparedWinbackReview(
      ctx,
      action,
      authorization,
      Date.now()
    );
  },
});

export const getCurrentPreparedWinbackReview = query({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, args) => {
    const authorization = await authorizePreparedWinbackActor(
      ctx,
      args.businessId
    );
    const currentRows = await loadCurrentPreparedActions(ctx, args.businessId);
    if (currentRows.length > 1) {
      throwMalformedPreparedAction();
    }
    const action = currentRows[0] ?? null;
    if (!action) {
      return null;
    }
    if (String(action.businessId) !== String(args.businessId)) {
      throw new Error('SMART_MANAGER_PREPARED_ACTION_NOT_FOUND');
    }
    return await buildPreparedWinbackReview(
      ctx,
      action,
      authorization,
      Date.now()
    );
  },
});
