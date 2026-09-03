import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { isBusinessPermanentDeletionInProgress } from '../guards';
import {
  hashSmartManagerValue,
  loadActiveSmartManagerPolicy,
} from './smartManagerPolicy';

export const SMART_MANAGER_ACTIVE_AUTHORITY_MODE =
  'shadow_parity_v1' as const;
export const SMART_MANAGER_WINBACK_STABLE_ID =
  'retention.reengage_inactive' as const;

const HOUR_MS = 60 * 60 * 1000;
const SINGLETON_READ_LIMIT = 2;

export type SmartManagerAuthorityMode =
  typeof SMART_MANAGER_ACTIVE_AUTHORITY_MODE;

export type SmartManagerAuthorityBlocker =
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
  | 'REEVALUATION_PENDING';

export type SmartManagerAuthorityCurrentness =
  | 'current'
  | 'reevaluation_pending'
  | 'stale'
  | 'expired';

type ActivePolicy = Awaited<ReturnType<typeof loadActiveSmartManagerPolicy>>;

export type SmartManagerDecisionAuthorityResult = {
  authorityMode: SmartManagerAuthorityMode;
  authorityBindingHash: string | null;
  currentness: SmartManagerAuthorityCurrentness;
  blockers: SmartManagerAuthorityBlocker[];
  business: Doc<'businesses'> | null;
  decision: Doc<'smartManagerDecisions'> | null;
  factSnapshot: Doc<'smartManagerFactSnapshots'> | null;
  comparison: Doc<'smartManagerShadowComparisons'> | null;
  evaluationState: Doc<'smartManagerEvaluationStates'> | null;
  policy: ActivePolicy | null;
  lifecycleEvidence: {
    audienceCount: number;
    lifecycleSourceFingerprint: string;
    observedAt: number;
  } | null;
  evidenceExpiresAt: number | null;
};

function stripVolatileAuthorityMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripVolatileAuthorityMetadata);
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
    normalized[key] = stripVolatileAuthorityMetadata(child);
  }
  return normalized;
}

export function buildAuthorityComparisonHash(comparison: {
  factHash: string;
  policyHash: string;
  status: string;
  canonicalSummary: unknown;
  liveSummary: unknown;
  differences: string[];
}) {
  return hashSmartManagerValue(stripVolatileAuthorityMetadata(comparison));
}

export function buildAuthorityFactHash(facts: unknown) {
  return hashSmartManagerValue(stripVolatileAuthorityMetadata(facts));
}

export function buildAuthorityDecisionHash(decision: unknown) {
  return hashSmartManagerValue(stripVolatileAuthorityMetadata(decision));
}

function selectFreshest<T extends {
  _id: unknown;
  _creationTime?: number;
  sourceGeneration?: number;
  updatedAt?: number;
}>(rows: T[]) {
  return [...rows].sort(
    (left, right) =>
      Number(right.sourceGeneration ?? 0) -
        Number(left.sourceGeneration ?? 0) ||
      Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0) ||
      Number(right._creationTime ?? 0) - Number(left._creationTime ?? 0) ||
      String(left._id).localeCompare(String(right._id))
  )[0] ?? null;
}

async function loadBoundedEvaluationRows(
  ctx: QueryCtx,
  businessId: Id<'businesses'>
) {
  return await ctx.db
    .query('smartManagerEvaluationStates')
    .withIndex('by_businessId', (q) => q.eq('businessId', businessId))
    .take(SINGLETON_READ_LIMIT);
}

async function loadBoundedFactSnapshotRows(
  ctx: QueryCtx,
  businessId: Id<'businesses'>
) {
  return await ctx.db
    .query('smartManagerFactSnapshots')
    .withIndex('by_businessId', (q) => q.eq('businessId', businessId))
    .take(SINGLETON_READ_LIMIT);
}

async function loadBoundedComparisonRows(
  ctx: QueryCtx,
  businessId: Id<'businesses'>
) {
  return await ctx.db
    .query('smartManagerShadowComparisons')
    .withIndex('by_businessId', (q) => q.eq('businessId', businessId))
    .take(SINGLETON_READ_LIMIT);
}

function pushBlocker(
  blockers: SmartManagerAuthorityBlocker[],
  blocker: SmartManagerAuthorityBlocker
) {
  if (!blockers.includes(blocker)) {
    blockers.push(blocker);
  }
}

function hasDecisionShape(decision: Doc<'smartManagerDecisions'> | null) {
  return (
    decision?.stableId === SMART_MANAGER_WINBACK_STABLE_ID &&
    decision.state === 'shadow_active' &&
    decision.decision?.stableId === SMART_MANAGER_WINBACK_STABLE_ID &&
    decision.decision?.access?.state === 'allowed' &&
    decision.decision?.action?.type === 'open_customers_segment' &&
    decision.decision.action.segment === 'at_risk'
  );
}

function deriveCurrentness(blockers: SmartManagerAuthorityBlocker[]) {
  if (blockers.includes('REEVALUATION_PENDING')) {
    return 'reevaluation_pending' as const;
  }
  if (blockers.includes('EVIDENCE_EXPIRED')) {
    return 'expired' as const;
  }
  return blockers.length === 0 ? ('current' as const) : ('stale' as const);
}

export async function resolveSmartManagerDecisionAuthority(
  ctx: QueryCtx,
  args: {
    businessId: Id<'businesses'>;
    expectedEvidenceFingerprint?: string;
    now?: number;
  }
): Promise<SmartManagerDecisionAuthorityResult> {
  switch (SMART_MANAGER_ACTIVE_AUTHORITY_MODE) {
    case 'shadow_parity_v1':
      return await resolveShadowParityV1(ctx, args);
  }
}

async function resolveShadowParityV1(
  ctx: QueryCtx,
  args: {
    businessId: Id<'businesses'>;
    expectedEvidenceFingerprint?: string;
    now?: number;
  }
): Promise<SmartManagerDecisionAuthorityResult> {
  const now = args.now ?? Date.now();
  const blockers: SmartManagerAuthorityBlocker[] = [];
  const business = (await ctx.db.get(args.businessId)) as
    | Doc<'businesses'>
    | null;

  if (!business) {
    pushBlocker(blockers, 'BUSINESS_NOT_FOUND');
  } else {
    if (business.isActive !== true) {
      pushBlocker(blockers, 'BUSINESS_INACTIVE');
    }
    if (isBusinessPermanentDeletionInProgress(business)) {
      pushBlocker(blockers, 'BUSINESS_DELETION_IN_PROGRESS');
    }
  }

  const [decisionRows, evaluationRows, factSnapshotRows, comparisonRows] =
    await Promise.all([
      ctx.db
        .query('smartManagerDecisions')
        .withIndex('by_businessId_stableId', (q) =>
          q
            .eq('businessId', args.businessId)
            .eq('stableId', SMART_MANAGER_WINBACK_STABLE_ID)
        )
        .take(SINGLETON_READ_LIMIT),
      loadBoundedEvaluationRows(ctx, args.businessId),
      loadBoundedFactSnapshotRows(ctx, args.businessId),
      loadBoundedComparisonRows(ctx, args.businessId),
    ]);

  const decision = selectFreshest(decisionRows) as
    | Doc<'smartManagerDecisions'>
    | null;
  const evaluationState = selectFreshest(evaluationRows) as
    | Doc<'smartManagerEvaluationStates'>
    | null;
  const factSnapshot = selectFreshest(factSnapshotRows) as
    | Doc<'smartManagerFactSnapshots'>
    | null;
  const comparison = selectFreshest(comparisonRows) as
    | Doc<'smartManagerShadowComparisons'>
    | null;

  if (decisionRows.length > 1) {
    pushBlocker(blockers, 'DECISION_AMBIGUOUS');
  }
  if (evaluationRows.length > 1) {
    pushBlocker(blockers, 'EVALUATION_AMBIGUOUS');
  }
  if (factSnapshotRows.length > 1) {
    pushBlocker(blockers, 'FACT_SNAPSHOT_AMBIGUOUS');
  }
  if (comparisonRows.length > 1) {
    pushBlocker(blockers, 'COMPARISON_AMBIGUOUS');
  }

  if (!decision) {
    pushBlocker(blockers, 'DECISION_NOT_FOUND');
  } else {
    if (String(decision.businessId) !== String(args.businessId)) {
      pushBlocker(blockers, 'DECISION_BINDING_MISMATCH');
    }
    if (!hasDecisionShape(decision)) {
      pushBlocker(blockers, 'DECISION_INACTIVE');
    }
    if (
      decision.evidenceFingerprint !==
        decision.decision?.evidenceFingerprint ||
      decision.evidenceObservedAt !== decision.decision?.evidenceObservedAt
    ) {
      pushBlocker(blockers, 'DECISION_EVIDENCE_MISMATCH');
    }
    if (buildAuthorityDecisionHash(decision.decision) !== decision.decisionHash) {
      pushBlocker(blockers, 'DECISION_HASH_MISMATCH');
    }
    if (
      args.expectedEvidenceFingerprint !== undefined &&
      args.expectedEvidenceFingerprint !== decision.evidenceFingerprint
    ) {
      pushBlocker(blockers, 'EVIDENCE_FINGERPRINT_MISMATCH');
    }
  }

  if (!evaluationState) {
    pushBlocker(blockers, 'EVALUATION_NOT_FOUND');
  } else {
    if (evaluationState.dirtyDomains.length > 0) {
      pushBlocker(blockers, 'REEVALUATION_PENDING');
    }
    if (
      evaluationState.lastSuccessfulGeneration === undefined ||
      evaluationState.generation !==
        evaluationState.lastSuccessfulGeneration ||
      decision?.sourceGeneration !==
        evaluationState.lastSuccessfulGeneration
    ) {
      pushBlocker(blockers, 'EVALUATION_GENERATION_MISMATCH');
    }
  }

  if (!factSnapshot) {
    pushBlocker(blockers, 'FACT_SNAPSHOT_NOT_FOUND');
  } else if (
    String(factSnapshot.businessId) !== String(args.businessId) ||
    String(factSnapshot.facts.businessId) !== String(args.businessId) ||
    factSnapshot.sourceGeneration !==
      evaluationState?.lastSuccessfulGeneration ||
    factSnapshot.sourceWatermark !==
      `generation:${factSnapshot.sourceGeneration}` ||
    factSnapshot.factHash !== decision?.factHash ||
    factSnapshot.factHash !== evaluationState?.lastFactHash
  ) {
    pushBlocker(blockers, 'FACT_SNAPSHOT_BINDING_MISMATCH');
  }
  if (
    factSnapshot &&
    buildAuthorityFactHash(factSnapshot.facts) !== factSnapshot.factHash
  ) {
    pushBlocker(blockers, 'FACT_SNAPSHOT_BINDING_MISMATCH');
  }

  let policy: ActivePolicy | null = null;
  try {
    policy = await loadActiveSmartManagerPolicy(ctx, now);
  } catch {
    pushBlocker(blockers, 'ACTIVE_POLICY_INVALID');
  }
  if (
    policy &&
    decision &&
    (decision.policyVersion !== policy.version ||
      decision.policyHash !== policy.policyHash)
  ) {
    pushBlocker(blockers, 'POLICY_BINDING_MISMATCH');
  }

  if (!comparison) {
    pushBlocker(blockers, 'COMPARISON_NOT_FOUND');
  } else {
    if (comparison.status !== 'parity') {
      pushBlocker(blockers, 'COMPARISON_NOT_PARITY');
    }
    if (
      String(comparison.businessId) !== String(args.businessId) ||
      comparison.sourceGeneration !== decision?.sourceGeneration ||
      comparison.factHash !== decision?.factHash ||
      comparison.policyVersion !== decision?.policyVersion ||
      comparison.policyHash !== decision?.policyHash
    ) {
      pushBlocker(blockers, 'COMPARISON_BINDING_MISMATCH');
    }
    const expectedComparisonHash = buildAuthorityComparisonHash({
      factHash: comparison.factHash,
      policyHash: comparison.policyHash,
      status: comparison.status,
      canonicalSummary: comparison.canonicalSummary,
      liveSummary: comparison.liveSummary,
      differences: comparison.differences,
    });
    if (expectedComparisonHash !== comparison.comparisonHash) {
      pushBlocker(blockers, 'COMPARISON_HASH_MISMATCH');
    }
    const canonicalDecisions =
      comparison.canonicalSummary.recommendations.filter(
        (candidate) => candidate.stableId === SMART_MANAGER_WINBACK_STABLE_ID
      );
    const canonicalDecision = canonicalDecisions[0];
    if (
      canonicalDecisions.length !== 1 ||
      !canonicalDecision ||
      !decision ||
      buildAuthorityDecisionHash(canonicalDecision) !== decision.decisionHash
    ) {
      pushBlocker(blockers, 'COMPARISON_BINDING_MISMATCH');
    }
  }

  const inactiveFact =
    factSnapshot?.facts?.facts?.customerLifecycleSegments?.inactive;
  let lifecycleEvidence: SmartManagerDecisionAuthorityResult['lifecycleEvidence'] =
    null;
  if (inactiveFact?.state !== 'known') {
    pushBlocker(blockers, 'LIFECYCLE_EVIDENCE_UNAVAILABLE');
  } else {
    const audienceCount = Number(inactiveFact.value.count);
    const decisionCount = Number(decision?.decision?.count);
    if (
      !Number.isFinite(audienceCount) ||
      audienceCount < 1 ||
      !Number.isInteger(audienceCount) ||
      audienceCount !== decisionCount ||
      inactiveFact.observedAt !== decision?.evidenceObservedAt ||
      !inactiveFact.value.evidenceFingerprint
    ) {
      pushBlocker(blockers, 'LIFECYCLE_AUDIENCE_INVALID');
    } else {
      lifecycleEvidence = {
        audienceCount,
        lifecycleSourceFingerprint: inactiveFact.value.evidenceFingerprint,
        observedAt: inactiveFact.observedAt,
      };
    }
  }

  const evidenceExpiresAt =
    decision && policy
      ? decision.evidenceObservedAt + policy.config.actionExpiryHours * HOUR_MS
      : null;
  if (evidenceExpiresAt !== null && now >= evidenceExpiresAt) {
    pushBlocker(blockers, 'EVIDENCE_EXPIRED');
  }

  const authorityBindingHash =
    decision && factSnapshot && comparison && evaluationState && lifecycleEvidence
      ? hashSmartManagerValue({
          authorityMode: SMART_MANAGER_ACTIVE_AUTHORITY_MODE,
          businessId: String(args.businessId),
          decisionId: String(decision._id),
          decisionHash: decision.decisionHash,
          evidenceFingerprint: decision.evidenceFingerprint,
          factHash: factSnapshot.factHash,
          sourceGeneration: evaluationState.lastSuccessfulGeneration,
          policyVersion: decision.policyVersion,
          policyHash: decision.policyHash,
          comparisonHash: comparison.comparisonHash,
          audienceCount: lifecycleEvidence.audienceCount,
          lifecycleSourceFingerprint:
            lifecycleEvidence.lifecycleSourceFingerprint,
          observedAt: lifecycleEvidence.observedAt,
        })
      : null;

  blockers.sort();
  return {
    authorityMode: SMART_MANAGER_ACTIVE_AUTHORITY_MODE,
    authorityBindingHash,
    currentness: deriveCurrentness(blockers),
    blockers,
    business,
    decision,
    factSnapshot,
    comparison,
    evaluationState,
    policy,
    lifecycleEvidence,
    evidenceExpiresAt,
  };
}
