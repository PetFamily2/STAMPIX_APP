import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from './_generated/server';
import {
  buildBusinessRecommendationCatalog,
  getRecommendationAccessDecision,
  getRecommendationRequiredCapabilities,
  type BusinessRecommendation,
  type RecommendationCatalogInput,
} from './lib/recommendationCatalog';
import {
  buildBusinessEntitlementsFromBusiness,
  countsTowardCampaignDefinitions,
  countsTowardReferralCampaignQuota,
} from './entitlements';
import { getRoleCapabilities } from './lib/staffPermissions';
import {
  hashSmartManagerValue,
  SMART_MANAGER_POLICY_SCHEMA_VERSION,
  SMART_MANAGER_POLICY_V1,
  SMART_MANAGER_POLICY_V1_HASH,
  SMART_MANAGER_POLICY_V1_VERSION,
  loadActiveSmartManagerPolicy,
  type SmartManagerPolicyConfig,
} from './lib/smartManagerPolicy';
import {
  loadBusinessRecommendationFacts,
  type BusinessRecommendationFactSourceBundle,
} from './recommendations';
import {
  markSmartManagerDirty,
  scheduleSmartManagerEvaluation,
  type SmartManagerDirtyDomain,
} from './lib/smartManagerDirty';
import { resolveSmartManagerDecisionAuthority } from './lib/smartManagerAuthority';
import {
  evaluatePreparedActionCurrentness,
  type PreparedActionCurrentnessBlocker,
} from './lib/smartManagerPreparedActions';
import {
  type SmartManagerFactEnvelope,
  smartManagerWorkerEvaluationValidator,
} from './lib/smartManagerValidators';

const MAX_RECONCILIATION_STATES = 25;
export const SMART_MANAGER_SOURCE_LIMITS = {
  programs: 100,
  memberships: 3_000,
  events: 5_000,
  campaigns: 1_000,
  campaignRuns: 1_500,
  staff: 100,
  pendingInvites: 100,
  referralConfigs: 2,
} as const;
export const SMART_MANAGER_AGGREGATE_SOURCE_READ_BUDGET = 10_900;
export const SMART_MANAGER_FIXED_EVALUATION_READ_ALLOWANCE = 60;
const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PARKED_NEXT_EVALUATION_AT = Number.MAX_SAFE_INTEGER;
const SMART_MANAGER_SINGLETON_RECONCILIATION_LIMIT = 25;
const SMART_MANAGER_DECISION_DEACTIVATION_PAGE_SIZE = 50;
const SMART_MANAGER_AUDIT_CLEANUP_PAGE_SIZE = 100;

type ActiveSmartManagerPolicy = {
  version: string;
  schemaVersion: number;
  policyHash: string;
  config: SmartManagerPolicyConfig;
};

type EvaluationClaim =
  | { claimed: false }
  | {
      claimed: true;
      generation: number;
      leaseToken: string;
    };

function ownsUnexpiredEvaluationLease(
  state: any,
  args: { generation: number; leaseToken: string },
  now: number
) {
  return (
    state?.leaseToken === args.leaseToken &&
    state?.leaseGeneration === args.generation &&
    Number.isFinite(state?.leaseExpiresAt) &&
    Number(state.leaseExpiresAt) > now
  );
}

function matchesEvaluationLeaseIdentity(
  state: any,
  args: { generation: number; leaseToken: string }
) {
  return (
    state?.leaseToken === args.leaseToken &&
    state?.leaseGeneration === args.generation
  );
}

async function recoverExpiredEvaluationLease(
  ctx: any,
  state: any,
  now: number
) {
  const isNewGeneration = state.attemptGeneration !== state.generation;
  await ctx.db.patch(state._id, {
    nextEvaluationAt: now,
    evaluationScheduledAt: now,
    leaseToken: undefined,
    leaseGeneration: undefined,
    leaseExpiresAt: undefined,
    leasePolicyVersion: undefined,
    leasePolicyHash: undefined,
    attemptCount: isNewGeneration ? 0 : state.attemptCount,
    attemptGeneration: state.generation,
    updatedAt: now,
  });
  await scheduleSmartManagerEvaluation(ctx, state.businessId);
}

async function requeueNewerGeneration(
  ctx: any,
  state: any,
  now: number
) {
  await ctx.db.patch(state._id, {
    nextEvaluationAt: now,
    evaluationScheduledAt: now,
    leaseToken: undefined,
    leaseGeneration: undefined,
    leaseExpiresAt: undefined,
    leasePolicyVersion: undefined,
    leasePolicyHash: undefined,
    attemptCount: 0,
    attemptGeneration: state.generation,
    failureCode: undefined,
    failureDetail: undefined,
    updatedAt: now,
  });
  await scheduleSmartManagerEvaluation(ctx, state.businessId);
}

const internalSmartManagerApi = {
  ensurePolicyV1Internal: makeFunctionReference<'mutation', Record<string, never>, any>(
    'smartManager:ensurePolicyV1Internal'
  ),
  claimEvaluationInternal: makeFunctionReference<
    'mutation',
    { businessId: Id<'businesses'>; leaseToken: string },
    EvaluationClaim
  >('smartManager:claimEvaluationInternal'),
  loadEvaluationInternal: makeFunctionReference<
    'query',
    { businessId: Id<'businesses'>; generation: number },
    any
  >('smartManager:loadEvaluationInternal'),
  completeEvaluationInternal: makeFunctionReference<
    'mutation',
    {
      businessId: Id<'businesses'>;
      generation: number;
      leaseToken: string;
      evaluation: any;
    },
    any
  >('smartManager:completeEvaluationInternal'),
  failEvaluationInternal: makeFunctionReference<
    'mutation',
    {
      businessId: Id<'businesses'>;
      generation: number;
      leaseToken: string;
      failureCode: string;
      failureDetail: string;
    },
    any
  >('smartManager:failEvaluationInternal'),
} as const;

const reconcileDueEvaluationsRef = makeFunctionReference<
  'mutation',
  { cursor?: string | null; limit?: number },
  any
>('smartManager:reconcileDueEvaluationsInternal');

const deactivateStaleDecisionsRef = makeFunctionReference<
  'mutation',
  {
    businessId: Id<'businesses'>;
    generation: number;
    activeStableIds: string[];
    cursor: string | null;
  },
  any
>('smartManager:deactivateStaleDecisionsInternal');

const purgeExpiredAuditEventsRef = makeFunctionReference<
  'mutation',
  { limit?: number },
  any
>('smartManager:purgeExpiredAuditEventsInternal');

function nextPolicyRefreshAt(
  policy: ActiveSmartManagerPolicy,
  now: number
) {
  return now + policy.config.evaluationRefreshHours * 60 * 60 * 1000;
}

export function getSeedSmartManagerPolicy(): ActiveSmartManagerPolicy {
  return {
    version: SMART_MANAGER_POLICY_V1_VERSION,
    schemaVersion: SMART_MANAGER_POLICY_SCHEMA_VERSION,
    policyHash: SMART_MANAGER_POLICY_V1_HASH,
    config: SMART_MANAGER_POLICY_V1,
  };
}

export const ensurePolicyV1Internal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingRows = await ctx.db
      .query('smartManagerPolicyVersions')
      .withIndex('by_version', (q) =>
        q.eq('version', SMART_MANAGER_POLICY_V1_VERSION)
      )
      .take(SMART_MANAGER_SINGLETON_RECONCILIATION_LIMIT);
    const existing = selectDeterministicSmartManagerSingleton(existingRows);
    if (existing) {
      if (
        existingRows.some(
          (row) => row.policyHash !== SMART_MANAGER_POLICY_V1_HASH
        )
      ) {
        throw new Error('SMART_MANAGER_POLICY_IMMUTABILITY_VIOLATION');
      }
      return { policyId: existing._id, created: false };
    }
    const now = Date.now();
    const policyId = await ctx.db.insert('smartManagerPolicyVersions', {
      version: SMART_MANAGER_POLICY_V1_VERSION,
      schemaVersion: SMART_MANAGER_POLICY_SCHEMA_VERSION,
      policyHash: SMART_MANAGER_POLICY_V1_HASH,
      config: SMART_MANAGER_POLICY_V1,
      effectiveFrom: 0,
      reason: 'Canonical Batch 1 seed policy',
      createdAt: now,
    });
    return { policyId, created: true };
  },
});

function stripVolatileFactMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripVolatileFactMetadata);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      key === 'generatedAt' ||
      key === 'observedAt' ||
      key === 'evidenceObservedAt'
    ) {
      continue;
    }
    normalized[key] = stripVolatileFactMetadata(child);
  }
  return normalized;
}

export function buildCanonicalFactHash(facts: unknown) {
  return hashSmartManagerValue(stripVolatileFactMetadata(facts));
}

export function buildSmartManagerComparisonHash(args: {
  factHash: string;
  policyHash: string;
  status: string;
  canonicalSummary: unknown;
  liveSummary: unknown;
  differences: string[];
}) {
  return hashSmartManagerValue(stripVolatileFactMetadata(args));
}

function assertWorkerEvaluationBinding(args: {
  businessId: Id<'businesses'>;
  generation: number;
  state: any;
  evaluation: any;
}) {
  const { businessId, generation, state, evaluation } = args;
  if (
    !evaluation ||
    typeof evaluation !== 'object' ||
    !evaluation.facts ||
    typeof evaluation.facts !== 'object' ||
    !evaluation.policy ||
    typeof evaluation.policy !== 'object' ||
    !Array.isArray(evaluation.canonicalDecisions) ||
    !evaluation.canonicalSummary ||
    !evaluation.liveSummary ||
    !Array.isArray(evaluation.differences)
  ) {
    throw new Error('SMART_MANAGER_EVALUATION_MALFORMED');
  }
  if (String(evaluation.facts.businessId) !== String(businessId)) {
    throw new Error('SMART_MANAGER_EVALUATION_BUSINESS_MISMATCH');
  }
  if (
    evaluation.sourceGeneration !== generation ||
    evaluation.sourceWatermark !== `generation:${generation}`
  ) {
    throw new Error('SMART_MANAGER_EVALUATION_GENERATION_MISMATCH');
  }
  if (
    state.leasePolicyVersion === undefined ||
    state.leasePolicyHash === undefined ||
    evaluation.policy.version !== state.leasePolicyVersion ||
    evaluation.policy.policyHash !== state.leasePolicyHash
  ) {
    throw new Error('SMART_MANAGER_EVALUATION_POLICY_MISMATCH');
  }
  const recomputedPolicyHash = hashSmartManagerValue({
    schemaVersion: evaluation.policy.schemaVersion,
    version: evaluation.policy.version,
    config: evaluation.policy.config,
  });
  if (recomputedPolicyHash !== evaluation.policy.policyHash) {
    throw new Error('SMART_MANAGER_EVALUATION_POLICY_HASH_MISMATCH');
  }
  const recomputedFactHash = buildCanonicalFactHash(evaluation.facts);
  if (recomputedFactHash !== evaluation.factHash) {
    throw new Error('SMART_MANAGER_EVALUATION_FACT_HASH_MISMATCH');
  }
  if (evaluation.facts.generatedAt !== evaluation.observedAt) {
    throw new Error('SMART_MANAGER_EVALUATION_OBSERVED_AT_MISMATCH');
  }
  if (
    hashSmartManagerValue(evaluation.canonicalDecisions) !==
    hashSmartManagerValue(evaluation.canonicalSummary.recommendations)
  ) {
    throw new Error('SMART_MANAGER_EVALUATION_DECISION_SUMMARY_MISMATCH');
  }
  const recomputedComparisonHash = buildSmartManagerComparisonHash({
    factHash: evaluation.factHash,
    policyHash: evaluation.policy.policyHash,
    status: evaluation.status,
    canonicalSummary: evaluation.canonicalSummary,
    liveSummary: evaluation.liveSummary,
    differences: evaluation.differences,
  });
  if (recomputedComparisonHash !== evaluation.comparisonHash) {
    throw new Error('SMART_MANAGER_EVALUATION_COMPARISON_HASH_MISMATCH');
  }
}

function summarizeRecommendation(
  recommendation: BusinessRecommendation,
  input: RecommendationCatalogInput
) {
  const entityType = recommendation.action.type === 'open_program'
    ? 'program'
    : recommendation.action.type === 'open_campaign'
      ? 'campaign'
      : null;
  return {
    stableId: recommendation.stableId,
    category: recommendation.category,
    priority: recommendation.priority,
    placement: recommendation.placement,
    title: recommendation.title,
    reason: recommendation.reason,
    ctaLabel: recommendation.ctaLabel,
    action: recommendation.action,
    entityType,
    entityId: recommendation.entityId ?? null,
    guideId: recommendation.guideId,
    tone: recommendation.tone,
    evidenceFingerprint: recommendation.evidenceFingerprint,
    evidenceObservedAt: recommendation.evidenceObservedAt,
    count: recommendation.count ?? null,
    requiredCapabilities: getRecommendationRequiredCapabilities(
      recommendation.stableId
    ),
    access: getRecommendationAccessDecision(input, recommendation.stableId),
  };
}

function catalogRecommendations(catalog: unknown) {
  if (
    catalog &&
    typeof catalog === 'object' &&
    'allEligible' in catalog &&
    Array.isArray((catalog as { allEligible?: unknown }).allEligible)
  ) {
    return (catalog as { allEligible: BusinessRecommendation[] }).allEligible;
  }
  return [];
}

export function compareSmartManagerShadowSummaries(
  canonical: any[],
  live: any[]
) {
  const canonicalById = new Map(canonical.map((item) => [item.stableId, item]));
  const liveById = new Map(live.map((item) => [item.stableId, item]));
  const differences: string[] = [];
  if (
    canonical.map((item) => item.stableId).join('|') !==
    live.map((item) => item.stableId).join('|')
  ) {
    differences.push('recommendation_order');
  }
  for (const stableId of [...new Set([...canonicalById.keys(), ...liveById.keys()])].sort()) {
    const canonicalItem = canonicalById.get(stableId);
    const liveItem = liveById.get(stableId);
    if (!canonicalItem || !liveItem) {
      differences.push(`${stableId}:identity`);
      continue;
    }
    for (const field of [
      'category',
      'priority',
      'placement',
      'title',
      'reason',
      'ctaLabel',
      'entityType',
      'entityId',
      'guideId',
      'tone',
      'evidenceFingerprint',
      'count',
    ]) {
      if (canonicalItem[field] !== liveItem[field]) {
        differences.push(`${stableId}:${field}`);
      }
    }
    for (const field of ['action', 'requiredCapabilities', 'access']) {
      if (
        hashSmartManagerValue(canonicalItem[field]) !==
        hashSmartManagerValue(liveItem[field])
      ) {
        differences.push(`${stableId}:${field}`);
      }
    }
  }
  return differences.slice(0, 50);
}

function summarizeRepresentativeFacts(facts: any) {
  const summarize = (fact: any, fields: string[]) => {
    if (!fact || fact.state !== 'known') {
      return {
        state: fact?.state ?? 'unknown',
        reasonCode: fact?.reasonCode ?? null,
        requiredCapability: fact?.requiredCapability ?? null,
      };
    }
    return {
      state: 'known',
      ...Object.fromEntries(
        fields.map((field) => [field, fact.value?.[field] ?? null])
      ),
    };
  };
  return {
    businessProfile: summarize(facts.facts.businessProfile, [
      'isComplete',
      'missingFieldIds',
    ]),
    address: summarize(facts.facts.address, ['isComplete']),
    logo: summarize(facts.facts.logo, ['hasResolvableLogo']),
    programs: summarize(facts.facts.programs, [
      'activeCount',
      'draftCount',
      'archivedCount',
    ]),
    customers: summarize(facts.facts.customers, ['uniqueActiveCustomerCount']),
    inactive: summarize(facts.facts.customerLifecycleSegments.inactive, [
      'count',
      'evidenceFingerprint',
    ]),
    nearReward: summarize(facts.facts.customerLifecycleSegments.nearReward, [
      'count',
      'evidenceFingerprint',
    ]),
    campaigns: summarize(facts.facts.campaigns, [
      'totalNonarchivedCampaigns',
      'draftCount',
      'scheduledCount',
      'recurringCount',
      'pausedCount',
      'inconsistentCount',
      'meaningfullyActiveCount',
      'lifecycleSourceVersion',
    ]),
    campaignQuota: summarize(facts.facts.campaignQuota, [
      'campaignDefinitionUsage',
      'campaignDefinitionLimit',
      'isAtOrAboveLimit',
    ]),
    team: summarize(facts.facts.team, [
      'activeNonOwnerStaffCount',
      'unexpiredPendingInvitationCount',
    ]),
    subscription: summarize(facts.facts.subscription, ['plan', 'status']),
    capabilities: facts.actor.capabilities,
  };
}

type BoundedSourceRows = {
  loaded: boolean;
  rows: any[] | null;
  reasonCode?: string;
};

type SourceReadBudget = {
  consumed: number;
  readsBySource: Record<string, number>;
};

const ALL_SMART_MANAGER_DIRTY_DOMAINS: SmartManagerDirtyDomain[] = [
  'business',
  'profile',
  'programs',
  'memberships',
  'events',
  'campaigns',
  'team',
  'entitlements',
];

export function getSmartManagerSourceLimitTotal() {
  return Object.values(SMART_MANAGER_SOURCE_LIMITS).reduce(
    (sum, limit) => sum + limit + 1,
    0
  );
}

export function expandSmartManagerRefreshDomains(
  dirtyDomains: SmartManagerDirtyDomain[],
  hasCompatiblePriorSnapshot: boolean
) {
  const refresh = new Set<SmartManagerDirtyDomain>(
    hasCompatiblePriorSnapshot
      ? dirtyDomains
      : ALL_SMART_MANAGER_DIRTY_DOMAINS
  );
  if (refresh.has('business') || refresh.has('profile')) {
    refresh.add('business');
    refresh.add('profile');
  }
  if (
    refresh.has('programs') ||
    refresh.has('memberships') ||
    refresh.has('events')
  ) {
    // Lifecycle facts join all three sources; refreshing only one would mix
    // incompatible source generations.
    refresh.add('programs');
    refresh.add('memberships');
    refresh.add('events');
  }
  if (refresh.has('campaigns') || refresh.has('entitlements')) {
    // Campaign quota is derived from campaign definitions plus referral state.
    refresh.add('campaigns');
    refresh.add('entitlements');
  }
  return refresh;
}

export function selectDeterministicSmartManagerSingleton<T extends {
  _id: unknown;
  _creationTime?: number;
}>(rows: T[]): T | null {
  return [...rows].sort(
    (left, right) =>
      Number(left._creationTime ?? 0) - Number(right._creationTime ?? 0) ||
      String(left._id).localeCompare(String(right._id))
  )[0] ?? null;
}

function selectFreshestSmartManagerBusinessSingleton(rows: any[]) {
  return [...rows].sort(
    (left, right) =>
      Number(right.sourceGeneration ?? 0) -
        Number(left.sourceGeneration ?? 0) ||
      Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0) ||
      Number(right._creationTime ?? 0) - Number(left._creationTime ?? 0) ||
      String(left._id).localeCompare(String(right._id))
  )[0] ?? null;
}

async function loadAndReconcileEvaluationState(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const rows = await ctx.db
    .query('smartManagerEvaluationStates')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .take(SMART_MANAGER_SINGLETON_RECONCILIATION_LIMIT);
  const canonical = selectFreshestSmartManagerBusinessSingleton(rows);
  if (!canonical || rows.length === 1) {
    return canonical;
  }
  const duplicates = rows.filter(
    (row: any) => String(row._id) !== String(canonical._id)
  );
  const mergedGeneration = Math.max(
    Number(canonical.generation),
    ...duplicates.map((row: any) => Number(row.generation ?? 0))
  );
  const merged = {
    ...canonical,
    dirtyAt: Math.min(
      Number(canonical.dirtyAt),
      ...duplicates.map((row: any) => Number(row.dirtyAt ?? canonical.dirtyAt))
    ),
    dirtyDomains: [
      ...new Set(
        rows.flatMap((row: any) => row.dirtyDomains ?? [])
      ),
    ].sort(),
    dirtyReasons: [
      ...new Set(
        rows.flatMap((row: any) => row.dirtyReasons ?? [])
      ),
    ].sort().slice(-20),
    generation: mergedGeneration,
    nextEvaluationAt: Math.min(
      ...rows.map((row: any) => Number(row.nextEvaluationAt))
    ),
    evaluationScheduledAt: undefined,
    leaseToken: undefined,
    leaseGeneration: undefined,
    leaseExpiresAt: undefined,
    leasePolicyVersion: undefined,
    leasePolicyHash: undefined,
    attemptCount: 0,
    attemptGeneration: mergedGeneration,
  };
  await ctx.db.patch(canonical._id, {
    dirtyAt: merged.dirtyAt,
    dirtyDomains: merged.dirtyDomains,
    dirtyReasons: merged.dirtyReasons,
    generation: merged.generation,
    nextEvaluationAt: merged.nextEvaluationAt,
    evaluationScheduledAt: undefined,
    leaseToken: undefined,
    leaseGeneration: undefined,
    leaseExpiresAt: undefined,
    leasePolicyVersion: undefined,
    leasePolicyHash: undefined,
    attemptCount: 0,
    attemptGeneration: mergedGeneration,
    updatedAt: Date.now(),
  });
  for (const duplicate of duplicates) {
    await ctx.db.delete(duplicate._id);
  }
  return merged;
}

async function loadAndCollapseBusinessSingleton(
  ctx: any,
  table: 'smartManagerFactSnapshots' | 'smartManagerShadowComparisons',
  businessId: Id<'businesses'>
) {
  const rows = await ctx.db
    .query(table)
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .take(SMART_MANAGER_SINGLETON_RECONCILIATION_LIMIT);
  const canonical = selectFreshestSmartManagerBusinessSingleton(rows);
  for (const duplicate of rows) {
    if (canonical && String(duplicate._id) !== String(canonical._id)) {
      await ctx.db.delete(duplicate._id);
    }
  }
  return canonical;
}

async function loadBoundedSourceRows(
  query: any,
  sourceName: keyof typeof SMART_MANAGER_SOURCE_LIMITS,
  budget: SourceReadBudget
): Promise<BoundedSourceRows> {
  const limit = SMART_MANAGER_SOURCE_LIMITS[sourceName];
  if (
    budget.consumed + limit + 1 +
      SMART_MANAGER_FIXED_EVALUATION_READ_ALLOWANCE >
    SMART_MANAGER_AGGREGATE_SOURCE_READ_BUDGET
  ) {
    return {
      loaded: true,
      rows: null,
      reasonCode: `BOUNDED_AGGREGATE_READ_BUDGET_EXCEEDED:${sourceName}`,
    };
  }
  const rows = await query.take(limit + 1);
  budget.consumed += rows.length;
  budget.readsBySource[sourceName] =
    (budget.readsBySource[sourceName] ?? 0) + 1;
  if (rows.length > limit) {
    return {
      loaded: true,
      rows: null,
      reasonCode: `BOUNDED_SOURCE_LIMIT_EXCEEDED:${sourceName}`,
    };
  }
  return { loaded: true, rows };
}

function skippedSource(): BoundedSourceRows {
  return { loaded: false, rows: null };
}

async function loadSmartManagerSourceBundle(
  ctx: any,
  args: {
    business: any;
    businessId: Id<'businesses'>;
    refreshDomains: Set<SmartManagerDirtyDomain>;
    observedAt: number;
  }
) {
  if (
    getSmartManagerSourceLimitTotal() +
      SMART_MANAGER_FIXED_EVALUATION_READ_ALLOWANCE >
    SMART_MANAGER_AGGREGATE_SOURCE_READ_BUDGET
  ) {
    throw new Error('SMART_MANAGER_SOURCE_BUDGET_CONFIGURATION_INVALID');
  }
  const budget: SourceReadBudget = { consumed: 0, readsBySource: {} };
  const refreshLifecycle =
    args.refreshDomains.has('programs') ||
    args.refreshDomains.has('memberships') ||
    args.refreshDomains.has('events');
  const refreshCampaigns = args.refreshDomains.has('campaigns');
  const refreshTeam = args.refreshDomains.has('team');
  const refreshEntitlements = args.refreshDomains.has('entitlements');

  const programs = refreshLifecycle
    ? await loadBoundedSourceRows(
        ctx.db
          .query('loyaltyPrograms')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', args.businessId)
          ),
        'programs',
        budget
      )
    : skippedSource();
  const memberships = refreshLifecycle
    ? await loadBoundedSourceRows(
        ctx.db
          .query('memberships')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', args.businessId)
          ),
        'memberships',
        budget
      )
    : skippedSource();
  const events = refreshLifecycle
    ? await loadBoundedSourceRows(
        ctx.db
          .query('events')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', args.businessId)
          ),
        'events',
        budget
      )
    : skippedSource();
  const campaigns = refreshCampaigns || refreshEntitlements
    ? await loadBoundedSourceRows(
        ctx.db
          .query('campaigns')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', args.businessId)
          ),
        'campaigns',
        budget
      )
    : skippedSource();
  const campaignRuns = refreshCampaigns
    ? await loadBoundedSourceRows(
        ctx.db
          .query('campaignRuns')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', args.businessId)
          ),
        'campaignRuns',
        budget
      )
    : skippedSource();
  const staffRows = refreshTeam
    ? await loadBoundedSourceRows(
        ctx.db
          .query('businessStaff')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', args.businessId)
          ),
        'staff',
        budget
      )
    : skippedSource();
  const pendingInvites = refreshTeam
    ? await loadBoundedSourceRows(
        ctx.db
          .query('staffInvites')
          .withIndex('by_businessId_status', (q: any) =>
            q.eq('businessId', args.businessId).eq('status', 'pending')
          ),
        'pendingInvites',
        budget
      )
    : skippedSource();
  const referralConfigs = refreshEntitlements
    ? await loadBoundedSourceRows(
        ctx.db
          .query('referralConfigs')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', args.businessId)
          ),
        'referralConfigs',
        budget
      )
    : skippedSource();

  const entitlementSourcesKnown =
    refreshEntitlements &&
    campaigns.rows !== null &&
    referralConfigs.rows !== null;
  const fullEntitlements = entitlementSourcesKnown
    ? buildBusinessEntitlementsFromBusiness(args.business, args.observedAt, {
        activeCampaigns:
          campaigns.rows!.filter(countsTowardCampaignDefinitions).length +
          (countsTowardReferralCampaignQuota(referralConfigs.rows![0]) ? 1 : 0),
      })
    : null;
  const entitlements = fullEntitlements
    ? {
        plan: fullEntitlements.plan,
        subscriptionStatus: fullEntitlements.subscriptionStatus,
        limits: { maxCampaigns: fullEntitlements.limits.maxCampaigns },
        usage: {
          activeManagementCampaigns:
            fullEntitlements.usage.activeManagementCampaigns,
        },
      }
    : null;

  const unavailableReasons = [
    programs,
    memberships,
    events,
    campaigns,
    campaignRuns,
    staffRows,
    pendingInvites,
    referralConfigs,
  ].flatMap((source) => source.reasonCode ? [source.reasonCode] : []);

  const sourceBundle: BusinessRecommendationFactSourceBundle = {
    business: args.business,
    programs: programs.rows,
    memberships: memberships.rows,
    campaigns: campaigns.rows,
    campaignRuns: campaignRuns.rows,
    events: events.rows,
    staffRows: staffRows.rows,
    pendingInvites: pendingInvites.rows,
    entitlements,
  };
  return {
    sourceBundle,
    sources: {
      programs,
      memberships,
      events,
      campaigns,
      campaignRuns,
      staffRows,
      pendingInvites,
      referralConfigs,
    },
    unavailableReasons,
    readCount: budget.consumed,
    readsBySource: budget.readsBySource,
  };
}

function unavailableSourceFact(reasonCode?: string) {
  return {
    state: 'unknown' as const,
    reasonCode: reasonCode ?? 'BOUNDED_SOURCE_UNAVAILABLE',
  };
}

type LoadedRecommendationFacts = Awaited<
  ReturnType<typeof loadBusinessRecommendationFacts>
>;

function applySmartManagerSourceAvailabilityToFacts(
  loadedFacts: LoadedRecommendationFacts,
  args: {
    ownerCapabilities: ReturnType<typeof getRoleCapabilities>;
    refreshDomains: Set<SmartManagerDirtyDomain>;
    priorFacts: SmartManagerFactEnvelope['facts'] | null;
    programSourceAvailable: boolean;
    customerSourceAvailable: boolean;
    customerLifecycleSourceAvailable: boolean;
    campaignSourceAvailable: boolean;
    teamSourceAvailable: boolean;
    entitlementSourceAvailable: boolean;
    programReason?: string;
    membershipReason?: string;
    campaignReason?: string;
    teamReason?: string;
    entitlementReason?: string;
    lifecycleReason?: string;
  }
): SmartManagerFactEnvelope {
  return {
    ...loadedFacts,
    actor: {
      ...loadedFacts.actor,
      capabilities: {
        ...loadedFacts.actor.capabilities,
        accessCustomers: args.ownerCapabilities.access_customers,
        accessCampaigns: args.ownerCapabilities.access_campaigns,
        createCampaigns: args.ownerCapabilities.create_campaigns,
        editCampaigns: args.ownerCapabilities.edit_campaigns,
        activateSendCampaigns: args.ownerCapabilities.activate_send_campaigns,
        manageTeam: args.ownerCapabilities.manage_team,
        viewUsageQuota: args.ownerCapabilities.view_usage_quota,
        viewBillingState: args.ownerCapabilities.view_billing_state,
      },
    },
    facts: {
      ...loadedFacts.facts,
      programs: args.refreshDomains.has('programs')
        ? args.programSourceAvailable
          ? loadedFacts.facts.programs
          : unavailableSourceFact(args.programReason)
        : args.priorFacts!.programs,
      customers: args.refreshDomains.has('memberships')
        ? args.customerSourceAvailable
          ? loadedFacts.facts.customers
          : unavailableSourceFact(args.membershipReason)
        : args.priorFacts!.customers,
      campaigns: args.refreshDomains.has('campaigns')
        ? args.campaignSourceAvailable
          ? loadedFacts.facts.campaigns
          : unavailableSourceFact(args.campaignReason)
        : args.priorFacts!.campaigns,
      campaignQuota: args.refreshDomains.has('entitlements')
        ? args.entitlementSourceAvailable
          ? loadedFacts.facts.campaignQuota
          : unavailableSourceFact(args.entitlementReason)
        : args.priorFacts!.campaignQuota,
      team: args.refreshDomains.has('team')
        ? args.teamSourceAvailable
          ? loadedFacts.facts.team
          : unavailableSourceFact(args.teamReason)
        : args.priorFacts!.team,
      subscription: args.refreshDomains.has('entitlements')
        ? args.entitlementSourceAvailable
          ? loadedFacts.facts.subscription
          : unavailableSourceFact(args.entitlementReason)
        : args.priorFacts!.subscription,
      customerLifecycleSegments: args.refreshDomains.has('events')
        ? args.customerLifecycleSourceAvailable
          ? loadedFacts.facts.customerLifecycleSegments
          : {
              nearReward: unavailableSourceFact(args.lifecycleReason),
              inactive: unavailableSourceFact(args.lifecycleReason),
            }
        : args.priorFacts!.customerLifecycleSegments,
    },
  };
}

function isCompatiblePriorFactSnapshot(snapshot: any, businessId: Id<'businesses'>) {
  return (
    snapshot?.facts?.schemaVersion === 1 &&
    String(snapshot?.facts?.businessId) === String(businessId) &&
    snapshot?.facts?.facts &&
    typeof snapshot.facts.facts === 'object' &&
    snapshot?.capabilityAvailability &&
    typeof snapshot.capabilityAvailability === 'object'
  );
}

export const loadEvaluationInternal = internalQuery({
  args: {
    businessId: v.id('businesses'),
    generation: v.number(),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_INACTIVE');
    }
    const [stateRows, snapshotRows] = await Promise.all([
      ctx.db
        .query('smartManagerEvaluationStates')
        .withIndex('by_businessId', (q: any) =>
          q.eq('businessId', args.businessId)
        )
        .take(SMART_MANAGER_SINGLETON_RECONCILIATION_LIMIT),
      ctx.db
        .query('smartManagerFactSnapshots')
        .withIndex('by_businessId', (q: any) =>
          q.eq('businessId', args.businessId)
        )
        .take(SMART_MANAGER_SINGLETON_RECONCILIATION_LIMIT),
    ]);
    const state = selectDeterministicSmartManagerSingleton(stateRows);
    const priorSnapshot = selectFreshestSmartManagerBusinessSingleton(
      snapshotRows
    );
    const hasCompatiblePriorSnapshot = isCompatiblePriorFactSnapshot(
      priorSnapshot,
      args.businessId
    );
    const dirtyDomains =
      state?.generation === args.generation && Array.isArray(state.dirtyDomains)
        ? state.dirtyDomains
        : ALL_SMART_MANAGER_DIRTY_DOMAINS;
    const refreshDomains = expandSmartManagerRefreshDomains(
      dirtyDomains,
      hasCompatiblePriorSnapshot
    );
    const observedAt = Date.now();
    const boundedSources = await loadSmartManagerSourceBundle(ctx, {
      business,
      businessId: args.businessId,
      refreshDomains,
      observedAt,
    });
    const programSourceAvailable =
      !refreshDomains.has('programs') || boundedSources.sources.programs.rows !== null;
    const customerSourceAvailable =
      !refreshDomains.has('memberships') ||
      boundedSources.sources.memberships.rows !== null;
    const customerLifecycleSourceAvailable =
      !refreshDomains.has('events') ||
      (boundedSources.sources.programs.rows !== null &&
        boundedSources.sources.memberships.rows !== null &&
        boundedSources.sources.events.rows !== null);
    const campaignSourceAvailable =
      !refreshDomains.has('campaigns') ||
      (boundedSources.sources.campaigns.rows !== null &&
        boundedSources.sources.campaignRuns.rows !== null);
    const teamSourceAvailable =
      !refreshDomains.has('team') ||
      (boundedSources.sources.staffRows.rows !== null &&
        boundedSources.sources.pendingInvites.rows !== null);
    const entitlementSourceAvailable =
      !refreshDomains.has('entitlements') ||
      boundedSources.sourceBundle.entitlements !== null;
    const ownerCapabilities = getRoleCapabilities('owner');
    const boundedCapabilities = {
      ...ownerCapabilities,
      access_customers:
        ownerCapabilities.access_customers && customerSourceAvailable,
      access_campaigns:
        ownerCapabilities.access_campaigns && campaignSourceAvailable,
      create_campaigns:
        ownerCapabilities.create_campaigns && campaignSourceAvailable,
      edit_campaigns:
        ownerCapabilities.edit_campaigns && campaignSourceAvailable,
      activate_send_campaigns:
        ownerCapabilities.activate_send_campaigns && campaignSourceAvailable,
      manage_team: ownerCapabilities.manage_team && teamSourceAvailable,
      view_usage_quota:
        ownerCapabilities.view_usage_quota && entitlementSourceAvailable,
      view_billing_state:
        ownerCapabilities.view_billing_state && entitlementSourceAvailable,
    };
    const priorFacts = hasCompatiblePriorSnapshot
      ? priorSnapshot.facts.facts
      : null;
    const reasonFor = (source: keyof typeof boundedSources.sources) =>
      boundedSources.sources[source].reasonCode;
    const lifecycleReason =
      reasonFor('programs') ?? reasonFor('memberships') ?? reasonFor('events');
    const campaignReason =
      reasonFor('campaigns') ?? reasonFor('campaignRuns');
    const teamReason =
      reasonFor('staffRows') ?? reasonFor('pendingInvites');
    const entitlementReason =
      reasonFor('campaigns') ?? reasonFor('referralConfigs');
    const authorization = {
      staffRole: 'owner' as const,
      capabilities: boundedCapabilities,
    };
    const sourceLoadOptions = {
      programsSourceAvailable: programSourceAvailable,
      sourceBundle: boundedSources.sourceBundle,
    };
    const availabilityOverlay = {
      ownerCapabilities,
      refreshDomains,
      priorFacts,
      programSourceAvailable,
      customerSourceAvailable,
      customerLifecycleSourceAvailable,
      campaignSourceAvailable,
      teamSourceAvailable,
      entitlementSourceAvailable,
      programReason: reasonFor('programs'),
      membershipReason: reasonFor('memberships'),
      campaignReason,
      teamReason,
      entitlementReason,
      lifecycleReason,
    };
    // Same already-bounded raw bundle; canonical and live-compat facts are
    // derived independently so shadow comparison is not a self-comparison.
    const loadedCanonicalFacts = await loadBusinessRecommendationFacts(
      ctx,
      args.businessId,
      authorization,
      observedAt,
      {
        ...sourceLoadOptions,
        excludeReversedEvents: true,
      }
    );
    const loadedLiveFacts = await loadBusinessRecommendationFacts(
      ctx,
      args.businessId,
      authorization,
      observedAt,
      {
        ...sourceLoadOptions,
        excludeReversedEvents: false,
      }
    );
    const canonicalFacts = applySmartManagerSourceAvailabilityToFacts(
      loadedCanonicalFacts,
      availabilityOverlay
    );
    const liveFacts = applySmartManagerSourceAvailabilityToFacts(
      loadedLiveFacts,
      availabilityOverlay
    );
    const canonicalInput: RecommendationCatalogInput = {
      ...canonicalFacts,
      businessId: String(args.businessId),
    };
    const liveInput: RecommendationCatalogInput = {
      ...liveFacts,
      businessId: String(args.businessId),
    };
    const canonicalCatalog = buildBusinessRecommendationCatalog(canonicalInput, {
      includeAllEligible: true,
    });
    const canonicalRecommendations = catalogRecommendations(canonicalCatalog).map(
      (recommendation) => summarizeRecommendation(recommendation, canonicalInput)
    );
    const canonicalFactSummary = summarizeRepresentativeFacts(canonicalFacts);
    const liveCatalog = buildBusinessRecommendationCatalog(liveInput, {
      includeAllEligible: true,
    });
    const liveRecommendations = catalogRecommendations(liveCatalog).map(
      (recommendation) => summarizeRecommendation(recommendation, liveInput)
    );
    const liveFactSummary = summarizeRepresentativeFacts(liveFacts);
    let differences = compareSmartManagerShadowSummaries(
      canonicalRecommendations,
      liveRecommendations
    );
    if (
      hashSmartManagerValue(canonicalFactSummary) !==
      hashSmartManagerValue(liveFactSummary)
    ) {
      differences.push('representative_facts');
    }
    differences = differences.slice(0, 50);
    const availability = {
      customerFacts: refreshDomains.has('memberships')
        ? customerSourceAvailable ? 'known' as const : 'unknown' as const
        : priorSnapshot.capabilityAvailability.customerFacts,
      customerLifecycleFacts: refreshDomains.has('events')
        ? customerLifecycleSourceAvailable ? 'known' as const : 'unknown' as const
        : priorSnapshot.capabilityAvailability.customerLifecycleFacts,
      campaignFacts: refreshDomains.has('campaigns')
        ? campaignSourceAvailable ? 'known' as const : 'unknown' as const
        : priorSnapshot.capabilityAvailability.campaignFacts,
      programFacts: refreshDomains.has('programs')
        ? programSourceAvailable ? 'known' as const : 'unknown' as const
        : priorSnapshot.capabilityAvailability.programFacts,
      teamFacts: refreshDomains.has('team')
        ? teamSourceAvailable ? 'known' as const : 'unknown' as const
        : priorSnapshot.capabilityAvailability.teamFacts,
      entitlementFacts: refreshDomains.has('entitlements')
        ? entitlementSourceAvailable ? 'known' as const : 'unknown' as const
        : priorSnapshot.capabilityAvailability.entitlementFacts,
    };
    const hasUnknownSource = Object.values(availability).some(
      (value) => value === 'unknown'
    );
    const persistedOwnerCapabilities = {
      ...ownerCapabilities,
      access_customers:
        ownerCapabilities.access_customers &&
        availability.customerFacts === 'known',
      access_campaigns:
        ownerCapabilities.access_campaigns &&
        availability.campaignFacts === 'known',
      create_campaigns:
        ownerCapabilities.create_campaigns &&
        availability.campaignFacts === 'known',
      edit_campaigns:
        ownerCapabilities.edit_campaigns &&
        availability.campaignFacts === 'known',
      activate_send_campaigns:
        ownerCapabilities.activate_send_campaigns &&
        availability.campaignFacts === 'known',
      manage_team:
        ownerCapabilities.manage_team && availability.teamFacts === 'known',
      view_usage_quota:
        ownerCapabilities.view_usage_quota &&
        availability.entitlementFacts === 'known',
      view_billing_state:
        ownerCapabilities.view_billing_state &&
        availability.entitlementFacts === 'known',
    };
    const status: 'parity' | 'mismatch' | 'bounded_source_unavailable' =
      hasUnknownSource
        ? 'bounded_source_unavailable'
        : differences.length === 0
          ? 'parity'
          : 'mismatch';

    const canonicalSummary = {
      actorScope: {
        role: 'owner' as const,
        capabilityScope: 'owner_unpersonalized_candidate_set' as const,
      },
      recommendations: canonicalRecommendations,
      facts: canonicalFactSummary,
    };
    const liveSummary = {
      actorScope: {
        role: 'owner' as const,
        capabilityScope: 'owner_unpersonalized_candidate_set' as const,
      },
      recommendations: liveRecommendations,
      facts: liveFactSummary,
    };

    const policy = await loadActiveSmartManagerPolicy(ctx, observedAt);
    const factHash = buildCanonicalFactHash(canonicalFacts);
    const comparisonHash = buildSmartManagerComparisonHash({
      factHash,
      policyHash: policy.policyHash,
      status,
      canonicalSummary,
      liveSummary,
      differences,
    });
    return {
      observedAt,
      sourceGeneration: args.generation,
      sourceWatermark: `generation:${args.generation}`,
      factHash,
      policy,
      capabilityAvailability: {
        ...availability,
        ownerCapabilities: persistedOwnerCapabilities,
      },
      facts: canonicalFacts,
      canonicalDecisions: canonicalRecommendations,
      canonicalSummary,
      liveSummary,
      status,
      differences,
      comparisonHash,
    };
  },
});

export const claimEvaluationInternal = internalMutation({
  args: {
    businessId: v.id('businesses'),
    leaseToken: v.string(),
  },
  handler: async (ctx, args): Promise<EvaluationClaim> => {
    const state = await loadAndReconcileEvaluationState(ctx, args.businessId);
    const now = Date.now();
    if (
      !state ||
      state.nextEvaluationAt > now ||
      (state.leaseExpiresAt !== undefined && state.leaseExpiresAt > now)
    ) {
      return { claimed: false };
    }
    const policy = await loadActiveSmartManagerPolicy(ctx, now);
    const attemptCount =
      state.attemptGeneration === state.generation ? state.attemptCount : 0;
    await ctx.db.patch(state._id, {
      leaseToken: args.leaseToken,
      leaseGeneration: state.generation,
      leaseExpiresAt: now + policy.config.delivery.leaseMinutes * 60 * 1000,
      leasePolicyVersion: policy.version,
      leasePolicyHash: policy.policyHash,
      attemptCount,
      attemptGeneration: state.generation,
      evaluationScheduledAt: now,
      updatedAt: now,
    });
    return {
      claimed: true,
      generation: state.generation,
      leaseToken: args.leaseToken,
    };
  },
});

async function deactivateStaleDecisionPage(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    generation: number;
    activeStableIds: string[];
    cursor: string | null;
    now: number;
  }
) {
  const activeStableIds = new Set(args.activeStableIds);
  const page = await ctx.db
    .query('smartManagerDecisions')
    .withIndex('by_businessId', (q: any) =>
      q.eq('businessId', args.businessId)
    )
    .paginate({
      cursor: args.cursor,
      numItems: SMART_MANAGER_DECISION_DEACTIVATION_PAGE_SIZE,
    });
  let deactivated = 0;
  for (const decision of page.page) {
    if (
      decision.state !== 'shadow_active' ||
      activeStableIds.has(decision.stableId) ||
      Number(decision.sourceGeneration) > args.generation
    ) {
      continue;
    }
    await ctx.db.patch(decision._id, {
      state: 'shadow_inactive',
      sourceGeneration: args.generation,
      updatedAt: args.now,
    });
    deactivated += 1;
  }
  if (!page.isDone && ctx.scheduler?.runAfter) {
    await ctx.scheduler.runAfter(0, deactivateStaleDecisionsRef, {
      businessId: args.businessId,
      generation: args.generation,
      activeStableIds: args.activeStableIds,
      cursor: page.continueCursor,
    });
  }
  return {
    examined: page.page.length,
    deactivated,
    continueCursor: page.continueCursor,
    isDone: page.isDone,
  };
}

export const deactivateStaleDecisionsInternal = internalMutation({
  args: {
    businessId: v.id('businesses'),
    generation: v.number(),
    activeStableIds: v.array(v.string()),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const state = await loadAndReconcileEvaluationState(ctx, args.businessId);
    if (!state || Number(state.generation) !== args.generation) {
      return {
        examined: 0,
        deactivated: 0,
        continueCursor: args.cursor,
        isDone: true,
      };
    }
    return await deactivateStaleDecisionPage(ctx, {
      ...args,
      now: Date.now(),
    });
  },
});

async function upsertShadowDecisions(ctx: any, args: any) {
  const activeStableIds = new Set<string>();
  for (const summary of args.canonicalSummary) {
    activeStableIds.add(summary.stableId);
    const decisionHash = hashSmartManagerValue(
      stripVolatileFactMetadata(summary)
    );
    const existingRows: Doc<'smartManagerDecisions'>[] = await ctx.db
      .query('smartManagerDecisions')
      .withIndex('by_businessId_stableId', (q: any) =>
        q.eq('businessId', args.businessId).eq('stableId', summary.stableId)
      )
      .take(SMART_MANAGER_SINGLETON_RECONCILIATION_LIMIT);
    const existing = selectDeterministicSmartManagerSingleton(existingRows);
    for (const duplicate of existingRows) {
      if (existing && String(duplicate._id) !== String(existing._id)) {
        await ctx.db.delete(duplicate._id);
      }
    }
    const values = {
      category: summary.category,
      priority: summary.priority,
      evidenceFingerprint: summary.evidenceFingerprint,
      evidenceObservedAt: summary.evidenceObservedAt,
      factHash: args.factHash,
      decisionHash,
      policyVersion: args.policy.version,
      policyHash: args.policy.policyHash,
      sourceGeneration: args.generation,
      state: 'shadow_active' as const,
      decision: summary,
      updatedAt: args.now,
    };
    if (!existing) {
      await ctx.db.insert('smartManagerDecisions', {
        businessId: args.businessId,
        stableId: summary.stableId,
        createdAt: args.now,
        ...values,
      });
    } else if (
      existing.category !== values.category ||
      existing.priority !== values.priority ||
      existing.evidenceFingerprint !== values.evidenceFingerprint ||
      existing.evidenceObservedAt !== values.evidenceObservedAt ||
      existing.factHash !== values.factHash ||
      existing.decisionHash !== decisionHash ||
      existing.policyVersion !== values.policyVersion ||
      existing.policyHash !== values.policyHash ||
      existing.sourceGeneration !== values.sourceGeneration ||
      existing.state !== values.state ||
      hashSmartManagerValue(existing.decision) !==
        hashSmartManagerValue(values.decision)
    ) {
      await ctx.db.patch(existing._id, values);
    }
  }
  await deactivateStaleDecisionPage(ctx, {
    businessId: args.businessId,
    generation: args.generation,
    activeStableIds: [...activeStableIds],
    cursor: null,
    now: args.now,
  });
}

type PreparedActionStaleReasonCode =
  | 'ACTIVE_POLICY_INVALID'
  | 'BUSINESS_DELETION_IN_PROGRESS'
  | 'BUSINESS_INACTIVE'
  | 'BUSINESS_NOT_FOUND'
  | 'COMPARISON_AMBIGUOUS'
  | 'COMPARISON_BINDING_MISMATCH'
  | 'COMPARISON_HASH_MISMATCH'
  | 'COMPARISON_NOT_FOUND'
  | 'COMPARISON_NOT_PARITY'
  | 'DECISION_AMBIGUOUS'
  | 'DECISION_BINDING_MISMATCH'
  | 'DECISION_EVIDENCE_MISMATCH'
  | 'DECISION_HASH_MISMATCH'
  | 'DECISION_INACTIVE'
  | 'DECISION_NOT_FOUND'
  | 'EVALUATION_AMBIGUOUS'
  | 'EVALUATION_GENERATION_MISMATCH'
  | 'EVALUATION_NOT_FOUND'
  | 'EVIDENCE_EXPIRED'
  | 'EVIDENCE_FINGERPRINT_MISMATCH'
  | 'FACT_SNAPSHOT_AMBIGUOUS'
  | 'FACT_SNAPSHOT_BINDING_MISMATCH'
  | 'FACT_SNAPSHOT_NOT_FOUND'
  | 'LIFECYCLE_AUDIENCE_INVALID'
  | 'LIFECYCLE_EVIDENCE_UNAVAILABLE'
  | 'POLICY_BINDING_MISMATCH'
  | 'ACTION_AUDIENCE_BINDING_CHANGED'
  | 'ACTION_AUTHORITY_BINDING_CHANGED'
  | 'ACTION_AUTHORITY_MODE_CHANGED'
  | 'ACTION_CONTRACT_INVALID'
  | 'ACTION_DECISION_BINDING_CHANGED'
  | 'ACTION_PREPARATION_KEY_CHANGED';

function toPreparedActionStaleReasonCode(
  blocker: PreparedActionCurrentnessBlocker
): PreparedActionStaleReasonCode | undefined {
  switch (blocker) {
    case 'ACTIVE_POLICY_INVALID':
    case 'BUSINESS_DELETION_IN_PROGRESS':
    case 'BUSINESS_INACTIVE':
    case 'BUSINESS_NOT_FOUND':
    case 'COMPARISON_AMBIGUOUS':
    case 'COMPARISON_BINDING_MISMATCH':
    case 'COMPARISON_HASH_MISMATCH':
    case 'COMPARISON_NOT_FOUND':
    case 'COMPARISON_NOT_PARITY':
    case 'DECISION_AMBIGUOUS':
    case 'DECISION_BINDING_MISMATCH':
    case 'DECISION_EVIDENCE_MISMATCH':
    case 'DECISION_HASH_MISMATCH':
    case 'DECISION_INACTIVE':
    case 'DECISION_NOT_FOUND':
    case 'EVALUATION_AMBIGUOUS':
    case 'EVALUATION_GENERATION_MISMATCH':
    case 'EVALUATION_NOT_FOUND':
    case 'EVIDENCE_EXPIRED':
    case 'EVIDENCE_FINGERPRINT_MISMATCH':
    case 'FACT_SNAPSHOT_AMBIGUOUS':
    case 'FACT_SNAPSHOT_BINDING_MISMATCH':
    case 'FACT_SNAPSHOT_NOT_FOUND':
    case 'LIFECYCLE_AUDIENCE_INVALID':
    case 'LIFECYCLE_EVIDENCE_UNAVAILABLE':
    case 'POLICY_BINDING_MISMATCH':
    case 'ACTION_AUDIENCE_BINDING_CHANGED':
    case 'ACTION_AUTHORITY_BINDING_CHANGED':
    case 'ACTION_AUTHORITY_MODE_CHANGED':
    case 'ACTION_CONTRACT_INVALID':
    case 'ACTION_DECISION_BINDING_CHANGED':
    case 'ACTION_PREPARATION_KEY_CHANGED':
      return blocker;
    case 'ACTION_EXPIRED':
    case 'ACTION_NOT_REVIEWABLE':
    case 'REEVALUATION_PENDING':
      return undefined;
  }
}

const PREPARED_ACTION_STALE_REASON_PRIORITY: PreparedActionStaleReasonCode[] = [
  'ACTION_AUTHORITY_MODE_CHANGED',
  'ACTION_AUTHORITY_BINDING_CHANGED',
  'ACTION_DECISION_BINDING_CHANGED',
  'ACTION_AUDIENCE_BINDING_CHANGED',
  'ACTION_PREPARATION_KEY_CHANGED',
  'ACTION_CONTRACT_INVALID',
];

export async function reconcileCurrentPreparedWinbackAfterEvaluation(
  ctx: MutationCtx,
  args: { businessId: Id<'businesses'>; now: number }
) {
  const currentActions = (await ctx.db
    .query('smartManagerPreparedActions')
    .withIndex('by_businessId_stableId_state', (q) =>
      q
        .eq('businessId', args.businessId)
        .eq('stableId', 'retention.reengage_inactive')
        .eq('state', 'reviewable')
    )
    .take(2)) as Doc<'smartManagerPreparedActions'>[];
  if (currentActions.length !== 1) {
    return { status: 'no_current_singleton' as const };
  }

  const action = currentActions[0];
  const authority = await resolveSmartManagerDecisionAuthority(ctx, {
    businessId: args.businessId,
    now: args.now,
  });
  const currentness = evaluatePreparedActionCurrentness({
    action,
    authority,
    now: args.now,
  });
  const staleReasons: PreparedActionStaleReasonCode[] = [];
  for (const blocker of currentness.blockers) {
    const staleReason = toPreparedActionStaleReasonCode(blocker);
    if (staleReason) {
      staleReasons.push(staleReason);
    }
  }
  const staleReason =
    PREPARED_ACTION_STALE_REASON_PRIORITY.find((blocker) =>
      staleReasons.includes(blocker)
    ) ?? staleReasons[0];
  if (!staleReason) {
    return { status: 'current' as const };
  }

  const generationRequestDiscarded =
    (action.generationState === 'queued' ||
      action.generationState === 'running') &&
    Boolean(
      action.generationRequestToken &&
        action.generationRequestBindingHash &&
        action.generationActorUserId &&
        action.generationRequestKind &&
        action.generationExpectedCopyId &&
        action.generationExpectedCopyRevision !== undefined &&
        action.generationReservedCopyRevision !== undefined
    );
  await ctx.db.patch(action._id, {
    state: 'stale',
    staleReason,
    staleAt: args.now,
    ...(generationRequestDiscarded
      ? {
          generationState: 'stale_discarded' as const,
          generationFailureCode: 'ACTION_STALE' as const,
          generationCompletedAt: args.now,
        }
      : {}),
    updatedAt: args.now,
  });
  await ctx.db.insert('smartManagerAuditEvents', {
    businessId: action.businessId,
    eventType: 'prepared_action_stale',
    sourceGeneration:
      authority.evaluationState?.lastSuccessfulGeneration ??
      action.sourceGeneration,
    factHash: authority.factSnapshot?.factHash ?? action.factHash,
    policyVersion: authority.policy?.version ?? action.policyVersion,
    policyHash: authority.policy?.policyHash ?? action.policyHash,
    preparedActionId: action._id,
    detail: {
      actionKind: 'winback_campaign',
      reasonCode: staleReason,
      authorityBindingHash: authority.authorityBindingHash ?? undefined,
      decisionHash: action.decisionHash,
      evidenceFingerprint: action.evidenceFingerprint,
      comparisonHash: action.comparisonHash,
      lifecycleSourceFingerprint: action.lifecycleSourceFingerprint,
      audienceCount: action.audienceCount,
      generationRequestDiscarded,
    },
    expiresAt: args.now + AUDIT_RETENTION_MS,
    createdAt: args.now,
  });
  return {
    status: 'staled' as const,
    reason: staleReason,
    generationRequestDiscarded,
  };
}

export const completeEvaluationInternal = internalMutation({
  args: {
    businessId: v.id('businesses'),
    generation: v.number(),
    leaseToken: v.string(),
    evaluation: smartManagerWorkerEvaluationValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const state = await loadAndReconcileEvaluationState(ctx, args.businessId);
    if (!state) {
      return { status: 'stale_lease' as const };
    }
    if (!ownsUnexpiredEvaluationLease(state, args, now)) {
      if (matchesEvaluationLeaseIdentity(state, args)) {
        await recoverExpiredEvaluationLease(ctx, state, now);
        return { status: 'expired_lease_requeued' as const };
      }
      return { status: 'stale_lease' as const };
    }
    if (state.generation !== args.generation) {
      if (state.generation > args.generation) {
        await requeueNewerGeneration(ctx, state, now);
        return { status: 'newer_generation_requeued' as const };
      }
      return { status: 'stale_generation' as const };
    }
    const evaluation = args.evaluation;
    assertWorkerEvaluationBinding({
      businessId: args.businessId,
      generation: args.generation,
      state,
      evaluation,
    });
    const factSnapshot = await loadAndCollapseBusinessSingleton(
      ctx,
      'smartManagerFactSnapshots',
      args.businessId
    );
    const comparison = await loadAndCollapseBusinessSingleton(
      ctx,
      'smartManagerShadowComparisons',
      args.businessId
    );
    const factChanged = !factSnapshot || factSnapshot.factHash !== evaluation.factHash;
    const comparisonChanged =
      !comparison || comparison.comparisonHash !== evaluation.comparisonHash;
    const paritySemanticsChanged = Boolean(
      comparison &&
      hashSmartManagerValue(
        stripVolatileFactMetadata({
          status: comparison.status,
          differences: comparison.differences,
          canonical: comparison.canonicalSummary?.recommendations,
          live: comparison.liveSummary?.recommendations,
        })
      ) !==
        hashSmartManagerValue(
          stripVolatileFactMetadata({
            status: evaluation.status,
            differences: evaluation.differences,
            canonical: evaluation.canonicalSummary.recommendations,
            live: evaluation.liveSummary.recommendations,
          })
        )
    );

    const factSnapshotValues = {
      schemaVersion: Number(evaluation.facts.schemaVersion ?? 1),
      observedAt: evaluation.observedAt,
      sourceGeneration: args.generation,
      sourceWatermark: evaluation.sourceWatermark,
      factHash: evaluation.factHash,
      capabilityAvailability: evaluation.capabilityAvailability,
      facts: evaluation.facts,
      updatedAt: now,
    };
    if (factSnapshot) {
      await ctx.db.patch(factSnapshot._id, factSnapshotValues);
    } else {
      await ctx.db.insert('smartManagerFactSnapshots', {
        businessId: args.businessId,
        createdAt: now,
        ...factSnapshotValues,
      });
    }

    await upsertShadowDecisions(ctx, {
      businessId: args.businessId,
      canonicalSummary: evaluation.canonicalDecisions,
      factHash: evaluation.factHash,
      policy: evaluation.policy,
      generation: args.generation,
      now,
    });

    const comparisonValues = {
      sourceGeneration: args.generation,
      factHash: evaluation.factHash,
      policyVersion: evaluation.policy.version,
      policyHash: evaluation.policy.policyHash,
      comparisonHash: evaluation.comparisonHash,
      status: evaluation.status,
      canonicalSummary: evaluation.canonicalSummary,
      liveSummary: evaluation.liveSummary,
      differences: evaluation.differences,
      comparedAt: evaluation.observedAt,
      updatedAt: now,
    };
    if (comparison) {
      await ctx.db.patch(comparison._id, comparisonValues);
    } else {
      await ctx.db.insert('smartManagerShadowComparisons', {
        businessId: args.businessId,
        createdAt: now,
        ...comparisonValues,
      });
    }

    if (factChanged || comparisonChanged) {
      await ctx.db.insert('smartManagerAuditEvents', {
        businessId: args.businessId,
        eventType:
          paritySemanticsChanged
            ? 'parity_changed'
            : 'evaluation_succeeded',
        sourceGeneration: args.generation,
        factHash: evaluation.factHash,
        policyVersion: evaluation.policy.version,
        policyHash: evaluation.policy.policyHash,
        detail: {
          factChanged,
          comparisonChanged,
          shadowStatus: evaluation.status,
          differenceCount: evaluation.differences.length,
        },
        expiresAt: now + AUDIT_RETENTION_MS,
        createdAt: now,
      });
    }

    await ctx.db.patch(state._id, {
      dirtyDomains: [],
      dirtyReasons: [],
      nextEvaluationAt: nextPolicyRefreshAt(evaluation.policy, now),
      evaluationScheduledAt: undefined,
      leaseToken: undefined,
      leaseGeneration: undefined,
      leaseExpiresAt: undefined,
      leasePolicyVersion: undefined,
      leasePolicyHash: undefined,
      attemptCount: 0,
      attemptGeneration: args.generation,
      lastFactHash: evaluation.factHash,
      lastSuccessfulGeneration: args.generation,
      lastSuccessfulEvaluationAt: now,
      failureCode: undefined,
      failureDetail: undefined,
      updatedAt: now,
    });
    await reconcileCurrentPreparedWinbackAfterEvaluation(ctx, {
      businessId: args.businessId,
      now,
    });
    return {
      status: 'completed' as const,
      factChanged,
      comparisonChanged,
    };
  },
});

export const failEvaluationInternal = internalMutation({
  args: {
    businessId: v.id('businesses'),
    generation: v.number(),
    leaseToken: v.string(),
    failureCode: v.string(),
    failureDetail: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const state = await loadAndReconcileEvaluationState(ctx, args.businessId);
    if (!state) {
      return { status: 'stale_lease' as const };
    }
    if (!ownsUnexpiredEvaluationLease(state, args, now)) {
      if (matchesEvaluationLeaseIdentity(state, args)) {
        await recoverExpiredEvaluationLease(ctx, state, now);
        return { status: 'expired_lease_requeued' as const };
      }
      return { status: 'stale_lease' as const };
    }
    if (state.generation !== args.generation) {
      if (state.generation > args.generation) {
        await requeueNewerGeneration(ctx, state, now);
        return { status: 'newer_generation_requeued' as const };
      }
      return { status: 'stale_generation' as const };
    }
    const policy = await loadActiveSmartManagerPolicy(ctx, now);
    const currentAttemptCount =
      state.attemptGeneration === args.generation ? state.attemptCount : 0;
    const nextAttempt = Number(currentAttemptCount) + 1;
    const businessInactive = args.failureDetail === 'BUSINESS_INACTIVE';
    const canRetry =
      !businessInactive &&
      nextAttempt < policy.config.delivery.maximumAttempts;
    const backoffMinutes =
      policy.config.delivery.retryBackoffMinutes[
        Math.min(
          nextAttempt - 1,
          policy.config.delivery.retryBackoffMinutes.length - 1
        )
      ] ?? 1;
    const nextEvaluationAt = canRetry
      ? now + backoffMinutes * 60 * 1000
      : businessInactive
        ? PARKED_NEXT_EVALUATION_AT
        : nextPolicyRefreshAt(policy, now);
    await ctx.db.patch(state._id, {
      dirtyDomains: canRetry ? state.dirtyDomains : [],
      dirtyReasons: canRetry ? state.dirtyReasons : [],
      attemptCount: nextAttempt,
      nextEvaluationAt,
      evaluationScheduledAt: canRetry ? now : undefined,
      leaseToken: undefined,
      leaseGeneration: undefined,
      leaseExpiresAt: undefined,
      leasePolicyVersion: undefined,
      leasePolicyHash: undefined,
      attemptGeneration: args.generation,
      failureCode: args.failureCode.slice(0, 80),
      failureDetail: args.failureDetail.slice(0, 500),
      updatedAt: now,
    });
    await ctx.db.insert('smartManagerAuditEvents', {
      businessId: args.businessId,
      eventType: 'evaluation_failed',
      sourceGeneration: args.generation,
      factHash: state.lastFactHash,
      policyVersion: policy.version,
      policyHash: policy.policyHash,
      detail: { attempt: nextAttempt, retryScheduled: canRetry },
      expiresAt: now + AUDIT_RETENTION_MS,
      createdAt: now,
    });
    if (canRetry) {
      await scheduleSmartManagerEvaluation(
        ctx,
        args.businessId,
        nextEvaluationAt - now
      );
    }
    return {
      status: canRetry ? ('retry_scheduled' as const) : ('failed' as const),
    };
  },
});

export const evaluateDirtyBusinessInternal = internalAction({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, args) => {
    await ctx.runMutation(internalSmartManagerApi.ensurePolicyV1Internal, {});
    const leaseToken = globalThis.crypto.randomUUID();
    const claim = await ctx.runMutation(
      internalSmartManagerApi.claimEvaluationInternal,
      { businessId: args.businessId, leaseToken }
    );
    if (!claim.claimed) {
      return { status: 'not_claimed' as const };
    }
    try {
      const evaluation = await ctx.runQuery(
        internalSmartManagerApi.loadEvaluationInternal,
        { businessId: args.businessId, generation: claim.generation }
      );
      return await ctx.runMutation(
        internalSmartManagerApi.completeEvaluationInternal,
        {
          businessId: args.businessId,
          generation: claim.generation,
          leaseToken,
          evaluation,
        }
      );
    } catch (error) {
      const failureDetail =
        error instanceof Error ? error.message : 'UNKNOWN_EVALUATION_FAILURE';
      return await ctx.runMutation(internalSmartManagerApi.failEvaluationInternal, {
        businessId: args.businessId,
        generation: claim.generation,
        leaseToken,
        failureCode: 'SMART_MANAGER_EVALUATION_FAILED',
        failureDetail,
      });
    }
  },
});

export const reconcileDueEvaluationsInternal = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = Math.max(
      1,
      Math.min(MAX_RECONCILIATION_STATES, Math.floor(args.limit ?? 10))
    );
    const policy = await loadActiveSmartManagerPolicy(ctx, now);
    const page = await ctx.db
      .query('smartManagerEvaluationStates')
      .withIndex('by_nextEvaluationAt', (q) => q.lte('nextEvaluationAt', now))
      .paginate({ cursor: args.cursor ?? null, numItems: limit });
    let scheduled = 0;
    const scheduleGraceMs = policy.config.delivery.leaseMinutes * 60 * 1000;
    for (const state of page.page) {
      const hasActiveLease =
        Number.isFinite(state.leaseExpiresAt) &&
        Number(state.leaseExpiresAt) > now;
      if (hasActiveLease) {
        continue;
      }
      const hasExpiredLease =
        state.leaseToken !== undefined ||
        state.leaseGeneration !== undefined ||
        state.leaseExpiresAt !== undefined;
      const hasRecentViableSchedule =
        !hasExpiredLease &&
        Number.isFinite(state.evaluationScheduledAt) &&
        Number(state.evaluationScheduledAt) > now - scheduleGraceMs;
      if (hasRecentViableSchedule) {
        continue;
      }
      const isTimeRefresh = state.dirtyDomains.length === 0;
      const generation = isTimeRefresh
        ? Number(state.generation) + 1
        : state.generation;
      await ctx.db.patch(state._id, {
        dirtyAt: isTimeRefresh ? now : state.dirtyAt,
        dirtyDomains: isTimeRefresh
          ? [
              'business',
              'profile',
              'programs',
              'memberships',
              'events',
              'campaigns',
              'team',
              'entitlements',
            ]
          : state.dirtyDomains,
        dirtyReasons: isTimeRefresh
          ? ['policy_time_refresh']
          : state.dirtyReasons,
        generation,
        evaluationScheduledAt: now,
        leaseToken: undefined,
        leaseGeneration: undefined,
        leaseExpiresAt: undefined,
        leasePolicyVersion: undefined,
        leasePolicyHash: undefined,
        attemptCount: isTimeRefresh ? 0 : state.attemptCount,
        attemptGeneration: isTimeRefresh
          ? generation
          : state.attemptGeneration,
        updatedAt: now,
      });
      await scheduleSmartManagerEvaluation(ctx, state.businessId);
      scheduled += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, reconcileDueEvaluationsRef, {
        cursor: page.continueCursor,
        limit,
      });
    }
    return {
      examined: page.page.length,
      scheduled,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const purgeExpiredAuditEventsInternal = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(
      1,
      Math.min(
        SMART_MANAGER_AUDIT_CLEANUP_PAGE_SIZE,
        Math.floor(args.limit ?? SMART_MANAGER_AUDIT_CLEANUP_PAGE_SIZE)
      )
    );
    const cutoff = Date.now();
    const expired = await ctx.db
      .query('smartManagerAuditEvents')
      .withIndex('by_expiresAt', (q) => q.lte('expiresAt', cutoff))
      .take(limit);
    for (const event of expired) {
      await ctx.db.delete(event._id);
    }
    const continuationScheduled =
      expired.length === limit && Boolean(ctx.scheduler?.runAfter);
    if (continuationScheduled) {
      await ctx.scheduler.runAfter(0, purgeExpiredAuditEventsRef, { limit });
    }
    return { deleted: expired.length, continuationScheduled };
  },
});

export const debugSeedPolicyInternal = internalQuery({
  args: {},
  handler: async () => getSeedSmartManagerPolicy(),
});
