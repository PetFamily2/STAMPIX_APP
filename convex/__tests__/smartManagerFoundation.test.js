import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  buildCustomerSegmentFacts,
  isCanonicalRecommendationEventEffective,
} from '../recommendations';
import {
  claimEvaluationInternal,
  buildCanonicalFactHash,
  buildSmartManagerComparisonHash,
  compareSmartManagerShadowSummaries,
  completeEvaluationInternal,
  deactivateStaleDecisionsInternal,
  expandSmartManagerRefreshDomains,
  failEvaluationInternal,
  getSeedSmartManagerPolicy,
  getSmartManagerSourceLimitTotal,
  loadEvaluationInternal,
  purgeExpiredAuditEventsInternal,
  reconcileDueEvaluationsInternal,
  selectDeterministicSmartManagerSingleton,
  SMART_MANAGER_AGGREGATE_SOURCE_READ_BUDGET,
  SMART_MANAGER_FIXED_EVALUATION_READ_ALLOWANCE,
  SMART_MANAGER_SOURCE_LIMITS,
} from '../smartManager';
import { markSmartManagerDirty } from '../lib/smartManagerDirty';
import {
  resolveSmartManagerDecisionAuthority,
} from '../lib/smartManagerAuthority';
import {
  buildPreparedWinbackPreparationKey,
  SMART_MANAGER_AUDIENCE_DEFINITION_VERSION,
  SMART_MANAGER_MAX_COPY_REVISION_SLOTS,
  SMART_MANAGER_PREPARED_ACTION_RETENTION_MS,
  SMART_MANAGER_PREPARED_ACTION_SCHEMA_VERSION,
  SMART_MANAGER_WINBACK_ACTION_CONTRACT_VERSION,
  SMART_MANAGER_WINBACK_CAMPAIGN_DRAFT,
  SMART_MANAGER_WINBACK_CHANNEL_STRATEGY,
} from '../lib/smartManagerPreparedActions';
import {
  getSmartManagerInteractionPolicy,
  hashSmartManagerValue,
  SMART_MANAGER_POLICY_V1,
  SMART_MANAGER_POLICY_V1_HASH,
} from '../lib/smartManagerPolicy';
import { getRecommendationAccessDecision } from '../lib/recommendationCatalog';
import { REQUIRED_PLAN_BY_FEATURE, planConfig } from '../entitlements';

const NOW = 1_800_000_000_000;

class FakeQuery {
  constructor(db, tableName) {
    this.db = db;
    this.tableName = tableName;
    this.predicates = [];
    this.direction = 'asc';
  }

  withIndex(_indexName, builder) {
    const predicates = [];
    const q = {
      eq: (field, value) => {
        predicates.push((row) => row[field] === value);
        return q;
      },
      lte: (field, value) => {
        predicates.push((row) => row[field] <= value);
        return q;
      },
    };
    builder(q);
    this.predicates.push((row) =>
      predicates.every((predicate) => predicate(row))
    );
    return this;
  }

  order(direction) {
    this.direction = direction;
    return this;
  }

  rows() {
    const rows = (this.db.tables[this.tableName] ?? []).filter((row) =>
      this.predicates.every((predicate) => predicate(row))
    );
    return this.direction === 'desc' ? [...rows].reverse() : rows;
  }

  async first() {
    return this.rows()[0] ?? null;
  }

  async unique() {
    const rows = this.rows();
    if (rows.length > 1) {
      throw new Error('EXPECTED_UNIQUE');
    }
    return rows[0] ?? null;
  }

  async take(limit) {
    return this.rows().slice(0, limit);
  }

  async paginate({ cursor, numItems }) {
    const offset = cursor === null ? 0 : Number(cursor);
    const rows = this.rows();
    const page = rows.slice(offset, offset + numItems);
    const nextOffset = offset + page.length;
    return {
      page,
      continueCursor: String(nextOffset),
      isDone: nextOffset >= rows.length,
    };
  }
}

function buildCtx(seed = {}) {
  const tables = {
    smartManagerPolicyVersions: [],
    smartManagerEvaluationStates: [],
    smartManagerFactSnapshots: [],
    smartManagerShadowComparisons: [],
    smartManagerDecisions: [],
    smartManagerAuditEvents: [],
    recommendationInteractions: [],
    ...seed,
  };
  let nextId = 1;
  const writes = [];
  const scheduled = [];
  const queried = [];
  const db = {
    tables,
    query: (tableName) => {
      queried.push(tableName);
      return new FakeQuery(db, tableName);
    },
    insert: async (tableName, value) => {
      const row = { _id: `${tableName}_${nextId++}`, ...value };
      tables[tableName] ??= [];
      tables[tableName].push(row);
      writes.push({ type: 'insert', tableName, value });
      return row._id;
    },
    patch: async (id, patch) => {
      for (const [tableName, rows] of Object.entries(tables)) {
        const row = rows.find((candidate) => candidate._id === id);
        if (row) {
          Object.assign(row, patch);
          writes.push({ type: 'patch', tableName, patch });
          return;
        }
      }
      throw new Error(`PATCH_TARGET_NOT_FOUND:${id}`);
    },
    get: async (id) => {
      for (const rows of Object.values(tables)) {
        const row = rows.find((candidate) => candidate._id === id);
        if (row) {
          return row;
        }
      }
      return null;
    },
    delete: async (id) => {
      for (const [tableName, rows] of Object.entries(tables)) {
        const index = rows.findIndex((candidate) => candidate._id === id);
        if (index >= 0) {
          rows.splice(index, 1);
          writes.push({ type: 'delete', tableName, id });
          return;
        }
      }
      throw new Error(`DELETE_TARGET_NOT_FOUND:${id}`);
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
    writes,
    scheduled,
    queried,
  };
}

function accessInput(segmentFact) {
  const known = (value) => ({ state: 'known', value, observedAt: NOW });
  return {
    schemaVersion: 1,
    businessId: 'business_1',
    generatedAt: NOW,
    actor: {
      capabilities: {
        accessCustomers: true,
        accessCampaigns: true,
        createCampaigns: true,
        editCampaigns: true,
        activateSendCampaigns: true,
        manageSubscription: true,
        manageTeam: true,
        editLoyaltyCards: true,
        editBusinessProfile: true,
      },
    },
    facts: {
      businessProfile: known({ isComplete: true, missingFieldIds: [] }),
      address: known({ isComplete: true }),
      programs: known({ activeCount: 1, draftCount: 0, firstDraftProgramId: null }),
      customers: known({ uniqueActiveCustomerCount: 1 }),
      campaigns: known({
        totalNonarchivedCampaigns: 0,
        draftCount: 0,
        scheduledCount: 0,
        recurringCount: 0,
        pausedCount: 0,
        inconsistentCount: 0,
        meaningfullyActiveCount: 0,
        firstDraftCampaignId: null,
        firstPausedCampaignId: null,
        nextScheduled: null,
        lifecycleSourceVersion: 'v1',
      }),
      campaignQuota: known({
        campaignDefinitionUsage: 0,
        campaignDefinitionLimit: 1,
        isAtOrAboveLimit: false,
      }),
      team: known({ unexpiredPendingInvitationCount: 0 }),
      subscription: known({ status: 'active' }),
      customerLifecycleSegments: {
        nearReward: segmentFact,
        inactive: segmentFact,
      },
    },
  };
}

function leasedEvaluationState(overrides = {}) {
  const policy = getSeedSmartManagerPolicy();
  return {
    _id: 'state_1',
    businessId: 'business_1',
    dirtyAt: NOW,
    dirtyDomains: ['events'],
    dirtyReasons: ['stamp'],
    generation: 1,
    nextEvaluationAt: 0,
    evaluationScheduledAt: NOW,
    leaseToken: 'lease_1',
    leaseGeneration: 1,
    leaseExpiresAt: NOW + 60_000,
    leasePolicyVersion: policy.version,
    leasePolicyHash: policy.policyHash,
    attemptCount: 0,
    attemptGeneration: 1,
    ...overrides,
  };
}

function buildEvaluation({
  businessId = 'business_1',
  generation = 1,
  factValue = 1,
  decisions = [],
  policy = getSeedSmartManagerPolicy(),
} = {}) {
  const facts = {
    schemaVersion: 1,
    businessId,
    generatedAt: NOW,
    value: factValue,
  };
  const factHash = buildCanonicalFactHash(facts);
  const canonicalSummary = { recommendations: decisions, facts: {} };
  const liveSummary = { recommendations: decisions, facts: {} };
  const evaluation = {
    observedAt: NOW,
    sourceGeneration: generation,
    sourceWatermark: `generation:${generation}`,
    factHash,
    policy,
    capabilityAvailability: {},
    facts,
    canonicalDecisions: decisions,
    canonicalSummary,
    liveSummary,
    status: 'parity',
    differences: [],
    comparisonHash: '',
  };
  evaluation.comparisonHash = buildSmartManagerComparisonHash({
    factHash,
    policyHash: policy.policyHash,
    status: evaluation.status,
    canonicalSummary,
    liveSummary,
    differences: [],
  });
  return evaluation;
}

function buildAuthorityReadyEvaluation({ generation, observedAt }) {
  const known = (value) => ({ state: 'known', value, observedAt });
  const facts = {
    schemaVersion: 1,
    businessId: 'business_1',
    generatedAt: observedAt,
    facts: {
      campaignQuota: known({
        campaignDefinitionUsage: 0,
        campaignDefinitionLimit: 1,
        remainingDefinitions: 1,
        isAtOrAboveLimit: false,
      }),
      customerLifecycleSegments: {
        inactive: known({
          count: 1,
          evidenceFingerprint: 'lifecycle_source_v1',
        }),
      },
    },
  };
  const decision = {
    stableId: 'retention.reengage_inactive',
    category: 'retention',
    priority: 2,
    placement: 'primary',
    title: 'לקוחות שכדאי להזמין שוב',
    reason: 'לקוח אחד לא ביקר לאחרונה.',
    ctaLabel: 'לצפייה בלקוחות',
    action: { type: 'open_customers_segment', segment: 'at_risk' },
    entityType: null,
    entityId: null,
    guideId: 'inactive-review',
    tone: 'retention',
    evidenceFingerprint: 'decision_evidence_v1',
    evidenceObservedAt: observedAt,
    count: 1,
    requiredCapabilities: ['access_customers'],
    access: { state: 'allowed' },
  };
  const policy = getSeedSmartManagerPolicy();
  const factHash = buildCanonicalFactHash(facts);
  const canonicalSummary = { recommendations: [decision], facts: {} };
  const liveSummary = structuredClone(canonicalSummary);
  const comparisonHash = buildSmartManagerComparisonHash({
    factHash,
    policyHash: policy.policyHash,
    status: 'parity',
    canonicalSummary,
    liveSummary,
    differences: [],
  });
  return {
    observedAt,
    sourceGeneration: generation,
    sourceWatermark: `generation:${generation}`,
    factHash,
    policy,
    capabilityAvailability: {},
    facts,
    canonicalDecisions: [decision],
    canonicalSummary,
    liveSummary,
    status: 'parity',
    differences: [],
    comparisonHash,
  };
}

function preparedActionFromAuthority(authority, overrides = {}) {
  const now = authority.lifecycleEvidence.observedAt;
  return {
    _id: 'prepared_action_1',
    businessId: authority.business._id,
    stableId: 'retention.reengage_inactive',
    actionKind: 'winback_campaign',
    schemaVersion: SMART_MANAGER_PREPARED_ACTION_SCHEMA_VERSION,
    actionContractVersion: SMART_MANAGER_WINBACK_ACTION_CONTRACT_VERSION,
    preparationKey: buildPreparedWinbackPreparationKey({
      businessId: String(authority.business._id),
      authorityMode: authority.authorityMode,
      authorityBindingHash: authority.authorityBindingHash,
      decisionHash: authority.decision.decisionHash,
      policyHash: authority.decision.policyHash,
    }),
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
    audienceDefinitionVersion: SMART_MANAGER_AUDIENCE_DEFINITION_VERSION,
    segment: 'at_risk',
    audienceCount: authority.lifecycleEvidence.audienceCount,
    lifecycleSourceFingerprint:
      authority.lifecycleEvidence.lifecycleSourceFingerprint,
    observedAt: authority.lifecycleEvidence.observedAt,
    recipientCeiling: authority.policy.config.recipientCeiling,
    materializationState: 'not_materialized',
    channelStrategy: structuredClone(SMART_MANAGER_WINBACK_CHANNEL_STRATEGY),
    campaignDraft: structuredClone(SMART_MANAGER_WINBACK_CAMPAIGN_DRAFT),
    nextCopyRevision: 2,
    copyRevisionLimit: SMART_MANAGER_MAX_COPY_REVISION_SLOTS,
    generationState: 'not_requested',
    state: 'reviewable',
    expiresAt:
      now + authority.policy.config.actionExpiryHours * 60 * 60 * 1000,
    retentionExpiresAt: now + SMART_MANAGER_PREPARED_ACTION_RETENTION_MS,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function withFixedNow(now, callback) {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    return await callback();
  } finally {
    Date.now = originalNow;
  }
}

describe('Smart Manager policy and entitlement foundation', () => {
  test('has one stable canonical seed version/hash and central interaction durations', () => {
    const seed = getSeedSmartManagerPolicy();
    expect(seed.config).toEqual(SMART_MANAGER_POLICY_V1);
    expect(seed.policyHash).toBe(SMART_MANAGER_POLICY_V1_HASH);
    expect(hashSmartManagerValue(seed.config)).toBe(
      hashSmartManagerValue(SMART_MANAGER_POLICY_V1)
    );
    expect(seed.config.interactions.operational.dismissal).toEqual({
      mode: 'evidence_bound',
    });
    expect(
      getSmartManagerInteractionPolicy(
        'campaign.next_scheduled',
        'snooze',
        NOW
      ).hiddenUntil
    ).toBe(NOW + 24 * 60 * 60 * 1000);
  });

  test('adds server-enforceable core and future AI-assist capabilities without aliases', () => {
    expect(REQUIRED_PLAN_BY_FEATURE.smartRetentionManager).toBe('starter');
    expect(REQUIRED_PLAN_BY_FEATURE.smartRetentionManagerAiAssist).toBe('pro');
    expect(planConfig.starter.features.smartRetentionManager).toBe(true);
    expect(planConfig.starter.features.smartRetentionManagerAiAssist).toBe(false);
    expect(planConfig.pro.features.smartRetentionManagerAiAssist).toBe(true);
  });
});

describe('canonical fact safety', () => {
  test('keeps observation timestamps out of canonical evidence hashes', () => {
    const first = buildCanonicalFactHash({
      observedAt: NOW,
      value: { count: 2 },
    });
    const sameCanonicalValue = buildCanonicalFactHash({
      observedAt: NOW + 1,
      value: { count: 2 },
    });
    const changed = buildCanonicalFactHash({
      observedAt: NOW,
      value: { count: 3 },
    });
    expect(first).toBe(sameCanonicalValue);
    expect(first).not.toBe(changed);
    expect(first).toMatch(/^sm_sha256_[0-9a-f]{64}$/);
  });

  test('compares deterministic shadow identity, priority, counts, capabilities, and evidence', () => {
    const summary = {
      stableId: 'growth.near_reward',
      category: 'growth',
      priority: 2,
      evidenceFingerprint: 'fingerprint_1',
      count: 2,
      access: { state: 'allowed' },
    };
    expect(compareSmartManagerShadowSummaries([summary], [summary])).toEqual(
      []
    );
    expect(
      compareSmartManagerShadowSummaries(
        [summary],
        [
          {
            ...summary,
            count: 3,
            evidenceFingerprint: 'fingerprint_2',
            access: { state: 'restricted' },
          },
        ]
      )
    ).toEqual([
      'growth.near_reward:evidenceFingerprint',
      'growth.near_reward:count',
      'growth.near_reward:access',
    ]);
  });

  test('keeps known zero, unknown, and restricted as distinct access states', () => {
    const knownZero = {
      state: 'known',
      value: { count: 0, evidenceFingerprint: 'zero' },
      observedAt: NOW,
    };
    expect(
      getRecommendationAccessDecision(
        accessInput(knownZero),
        'growth.near_reward'
      ).state
    ).toBe('allowed');
    expect(
      getRecommendationAccessDecision(
        accessInput({ state: 'unknown', reasonCode: 'SOURCE_UNAVAILABLE' }),
        'growth.near_reward'
      ).state
    ).toBe('unavailable');
    expect(
      getRecommendationAccessDecision(
        accessInput({ state: 'restricted', requiredCapability: 'access_customers' }),
        'growth.near_reward'
      ).state
    ).toBe('restricted');
  });

  test('excludes both reversal rows and reversal-linked originals from canonical facts', () => {
    expect(isCanonicalRecommendationEventEffective({})).toBe(true);
    expect(
      isCanonicalRecommendationEventEffective({ reversalEventId: 'reverse_1' })
    ).toBe(false);
    expect(
      isCanonicalRecommendationEventEffective({ revertsEventId: 'event_1' })
    ).toBe(false);

    const common = {
      business: { _id: 'business_1' },
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
        },
      ],
      programs: [
        {
          _id: 'program_1',
          maxStamps: 10,
          status: 'active',
          isActive: true,
        },
      ],
      events: [
        {
          _id: 'event_1',
          type: 'STAMP_ADDED',
          customerUserId: 'customer_1',
          createdAt: NOW - 20 * 24 * 60 * 60 * 1000,
        },
        {
          _id: 'event_2',
          type: 'STAMP_ADDED',
          customerUserId: 'customer_1',
          createdAt: NOW - 10 * 24 * 60 * 60 * 1000,
          reversalEventId: 'reverse_2',
        },
      ],
      now: NOW,
    };
    expect(buildCustomerSegmentFacts(common).inactive.state).toBe('known');
    expect(
      buildCustomerSegmentFacts({
        ...common,
        excludeReversedEvents: true,
      }).inactive.state
    ).toBe('unknown');
  });
});

describe('dirty coalescing and lease safety', () => {
  test('keeps scanner-style dirty marking bounded and coalesces one scheduled job', async () => {
    const ctx = buildCtx();
    await markSmartManagerDirty(ctx, {
      businessId: 'business_1',
      domains: ['events'],
      reasons: ['scanner_stamp_committed'],
      now: NOW,
    });
    await markSmartManagerDirty(ctx, {
      businessId: 'business_1',
      domains: ['memberships'],
      reasons: ['customer_membership_joined'],
      now: NOW + 1,
    });

    expect(ctx.tables.smartManagerEvaluationStates).toHaveLength(1);
    expect(ctx.tables.smartManagerEvaluationStates[0]).toMatchObject({
      businessId: 'business_1',
      generation: 2,
      dirtyDomains: ['events', 'memberships'],
    });
    expect(ctx.scheduled).toHaveLength(1);
    expect([...new Set(ctx.queried)]).toEqual([
      'smartManagerEvaluationStates',
    ]);
    expect(
      ctx.writes
        .filter((write) => write.tableName === 'smartManagerEvaluationStates')
        .every((write) =>
          ['insert', 'patch'].includes(write.type)
        )
    ).toBe(true);
  });

  test('isolates dirty generations by business', async () => {
    const ctx = buildCtx();
    for (const businessId of ['business_1', 'business_2']) {
      await markSmartManagerDirty(ctx, {
        businessId,
        domains: ['events'],
        reasons: ['stamp'],
        now: NOW,
      });
    }
    expect(
      ctx.tables.smartManagerEvaluationStates.map((row) => row.businessId)
    ).toEqual(['business_1', 'business_2']);
  });

  test('claims one lease and rejects concurrent claims', async () => {
    const ctx = buildCtx({
      smartManagerEvaluationStates: [
        {
          _id: 'state_1',
          businessId: 'business_1',
          generation: 3,
          nextEvaluationAt: 0,
          attemptCount: 0,
        },
      ],
    });
    const first = await claimEvaluationInternal._handler(ctx, {
      businessId: 'business_1',
      leaseToken: 'lease_1',
    });
    const second = await claimEvaluationInternal._handler(ctx, {
      businessId: 'business_1',
      leaseToken: 'lease_2',
    });
    expect(first).toMatchObject({ claimed: true, generation: 3 });
    expect(second).toEqual({ claimed: false });
  });

  test('discards materially changed generation N results when N+1 is dirty', async () => {
    const policy = getSeedSmartManagerPolicy();
    const ctx = buildCtx({
      smartManagerEvaluationStates: [
        leasedEvaluationState({
          generation: 2,
          leaseGeneration: 1,
          attemptCount: 4,
          attemptGeneration: 1,
          dirtyReasons: ['newer_event'],
        }),
      ],
      smartManagerFactSnapshots: [
        { _id: 'facts_1', businessId: 'business_1', factHash: 'old_fact' },
      ],
      smartManagerShadowComparisons: [
        {
          _id: 'shadow_1',
          businessId: 'business_1',
          comparisonHash: 'old_comparison',
          status: 'parity',
        },
      ],
    });
    const evaluation = buildEvaluation({ generation: 1, factValue: 99, policy });
    const stale = await completeEvaluationInternal._handler(ctx, {
      businessId: 'business_1',
      generation: 1,
      leaseToken: 'wrong_lease',
      evaluation,
    });
    expect(stale.status).toBe('stale_lease');

    const completed = await withFixedNow(NOW, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        evaluation,
      })
    );
    expect(completed.status).toBe('newer_generation_requeued');
    expect(ctx.tables.smartManagerFactSnapshots[0].factHash).toBe('old_fact');
    expect(ctx.tables.smartManagerShadowComparisons[0].comparisonHash).toBe(
      'old_comparison'
    );
    expect(ctx.tables.smartManagerDecisions).toHaveLength(0);
    expect(ctx.tables.smartManagerAuditEvents).toHaveLength(0);
    expect(ctx.tables.recommendationInteractions).toHaveLength(0);
    expect(ctx.scheduled).toHaveLength(1);
    expect(ctx.tables.smartManagerEvaluationStates[0]).toMatchObject({
      generation: 2,
      attemptCount: 0,
      attemptGeneration: 2,
      nextEvaluationAt: NOW,
    });
  });

  test('refreshes unchanged canonical bindings without semantic audit noise', async () => {
    const evaluation = buildEvaluation();
    const ctx = buildCtx({
      smartManagerEvaluationStates: [leasedEvaluationState()],
      smartManagerFactSnapshots: [
        {
          _id: 'facts_1',
          businessId: 'business_1',
          factHash: evaluation.factHash,
        },
      ],
      smartManagerShadowComparisons: [
        {
          _id: 'shadow_1',
          businessId: 'business_1',
          comparisonHash: evaluation.comparisonHash,
          status: 'parity',
        },
      ],
    });
    const result = await withFixedNow(NOW, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        evaluation,
      })
    );

    expect(result).toMatchObject({
      status: 'completed',
      factChanged: false,
      comparisonChanged: false,
    });
    expect(ctx.tables.smartManagerAuditEvents).toHaveLength(0);
    expect(ctx.tables.smartManagerDecisions).toHaveLength(0);
    expect(
      ctx.writes.filter((write) =>
        [
          'smartManagerFactSnapshots',
          'smartManagerShadowComparisons',
          'smartManagerDecisions',
        ].includes(write.tableName)
      )
    ).toEqual([
      expect.objectContaining({
        type: 'patch',
        tableName: 'smartManagerFactSnapshots',
      }),
      expect.objectContaining({
        type: 'patch',
        tableName: 'smartManagerShadowComparisons',
      }),
    ]);
  });

  test('refreshes identical semantic artifacts into the next successful generation', async () => {
    const refreshedAt = NOW + 60 * 60 * 1000;
    const firstEvaluation = buildAuthorityReadyEvaluation({
      generation: 1,
      observedAt: NOW,
    });
    const secondEvaluation = buildAuthorityReadyEvaluation({
      generation: 2,
      observedAt: refreshedAt,
    });
    expect(secondEvaluation.factHash).toBe(firstEvaluation.factHash);
    expect(secondEvaluation.comparisonHash).toBe(
      firstEvaluation.comparisonHash
    );

    const ctx = buildCtx({
      businesses: [
        {
          _id: 'business_1',
          ownerUserId: 'user_owner',
          externalId: 'business_external_1',
          name: 'Business',
          subscriptionPlan: 'starter',
          subscriptionStatus: 'active',
          isActive: true,
          createdAt: NOW - 10_000,
          updatedAt: NOW,
        },
      ],
      smartManagerEvaluationStates: [leasedEvaluationState()],
    });
    await withFixedNow(NOW, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        evaluation: firstEvaluation,
      })
    );
    const firstDecisionHash =
      ctx.tables.smartManagerDecisions[0].decisionHash;
    const auditCountAfterFirstGeneration =
      ctx.tables.smartManagerAuditEvents.length;
    const policy = getSeedSmartManagerPolicy();
    Object.assign(ctx.tables.smartManagerEvaluationStates[0], {
      dirtyDomains: ['entitlements'],
      dirtyReasons: ['scheduled_refresh'],
      generation: 2,
      nextEvaluationAt: refreshedAt,
      evaluationScheduledAt: refreshedAt,
      leaseToken: 'lease_2',
      leaseGeneration: 2,
      leaseExpiresAt: refreshedAt + 60_000,
      leasePolicyVersion: policy.version,
      leasePolicyHash: policy.policyHash,
      attemptCount: 0,
      attemptGeneration: 2,
    });

    const result = await withFixedNow(refreshedAt, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 2,
        leaseToken: 'lease_2',
        evaluation: secondEvaluation,
      })
    );

    expect(result).toMatchObject({
      status: 'completed',
      factChanged: false,
      comparisonChanged: false,
    });
    expect(ctx.tables.smartManagerAuditEvents).toHaveLength(
      auditCountAfterFirstGeneration
    );
    expect(ctx.tables.smartManagerEvaluationStates[0]).toMatchObject({
      lastSuccessfulGeneration: 2,
      lastFactHash: firstEvaluation.factHash,
    });
    expect(ctx.tables.smartManagerFactSnapshots[0]).toMatchObject({
      sourceGeneration: 2,
      sourceWatermark: 'generation:2',
      observedAt: refreshedAt,
      factHash: firstEvaluation.factHash,
    });
    expect(ctx.tables.smartManagerDecisions[0]).toMatchObject({
      stableId: 'retention.reengage_inactive',
      state: 'shadow_active',
      sourceGeneration: 2,
      evidenceObservedAt: refreshedAt,
      factHash: firstEvaluation.factHash,
      decisionHash: firstDecisionHash,
    });
    expect(ctx.tables.smartManagerShadowComparisons[0]).toMatchObject({
      sourceGeneration: 2,
      comparedAt: refreshedAt,
      comparisonHash: firstEvaluation.comparisonHash,
    });

    const authority = await resolveSmartManagerDecisionAuthority(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
      now: refreshedAt,
    });
    expect(authority.currentness).toBe('current');
    expect(authority.blockers).toEqual([]);
    expect(authority.comparison?.status).toBe('parity');
  });

  test('successful evaluation invalidates an older prepared generation without scheduling provider work', async () => {
    const refreshedAt = NOW + 60 * 60 * 1000;
    const firstEvaluation = buildAuthorityReadyEvaluation({
      generation: 1,
      observedAt: NOW,
    });
    const ctx = buildCtx({
      businesses: [
        {
          _id: 'business_1',
          ownerUserId: 'user_owner',
          externalId: 'business_external_1',
          name: 'Business',
          subscriptionPlan: 'starter',
          subscriptionStatus: 'active',
          isActive: true,
          createdAt: NOW - 10_000,
          updatedAt: NOW,
        },
      ],
      smartManagerEvaluationStates: [leasedEvaluationState()],
      smartManagerPreparedActions: [],
    });
    await withFixedNow(NOW, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        evaluation: firstEvaluation,
      })
    );
    const authority = await resolveSmartManagerDecisionAuthority(ctx, {
      businessId: 'business_1',
      now: NOW,
    });
    ctx.tables.smartManagerPreparedActions.push(
      preparedActionFromAuthority(authority)
    );
    const policy = getSeedSmartManagerPolicy();
    Object.assign(ctx.tables.smartManagerEvaluationStates[0], {
      dirtyDomains: ['entitlements'],
      dirtyReasons: ['scheduled_refresh'],
      generation: 2,
      nextEvaluationAt: refreshedAt,
      evaluationScheduledAt: refreshedAt,
      leaseToken: 'lease_2',
      leaseGeneration: 2,
      leaseExpiresAt: refreshedAt + 60_000,
      leasePolicyVersion: policy.version,
      leasePolicyHash: policy.policyHash,
      attemptCount: 0,
      attemptGeneration: 2,
    });
    ctx.scheduled.length = 0;

    await withFixedNow(refreshedAt, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 2,
        leaseToken: 'lease_2',
        evaluation: buildAuthorityReadyEvaluation({
          generation: 2,
          observedAt: refreshedAt,
        }),
      })
    );

    expect(ctx.tables.smartManagerPreparedActions[0]).toMatchObject({
      state: 'stale',
      staleReason: 'ACTION_AUTHORITY_BINDING_CHANGED',
    });
    expect(
      ctx.tables.smartManagerAuditEvents.filter(
        (event) => event.eventType === 'prepared_action_stale'
      )
    ).toHaveLength(1);
    expect(ctx.scheduled).toEqual([]);
  });

  test('persists changed shadow evidence without mutating live interactions', async () => {
    const ctx = buildCtx({
      smartManagerEvaluationStates: [
        leasedEvaluationState(),
      ],
    });
    const decision = {
      stableId: 'growth.near_reward',
      category: 'growth',
      priority: 2,
      evidenceFingerprint: 'fingerprint_1',
      evidenceObservedAt: NOW,
      count: 2,
      access: { state: 'allowed' },
    };
    const result = await withFixedNow(NOW, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        evaluation: buildEvaluation({ decisions: [decision], factValue: 2 }),
      })
    );

    expect(result.status).toBe('completed');
    expect(ctx.tables.smartManagerFactSnapshots).toHaveLength(1);
    expect(ctx.tables.smartManagerDecisions).toHaveLength(1);
    expect(ctx.tables.smartManagerShadowComparisons).toHaveLength(1);
    expect(ctx.tables.smartManagerAuditEvents).toHaveLength(1);
    expect(ctx.tables.recommendationInteractions).toHaveLength(0);
    expect(ctx.tables.smartManagerEvaluationStates[0].nextEvaluationAt).toBe(
      NOW + SMART_MANAGER_POLICY_V1.evaluationRefreshHours * 60 * 60 * 1000
    );
  });

  test('rejects lease expiry at the boundary and permits a reclaimed worker', async () => {
    const ctx = buildCtx({
      smartManagerEvaluationStates: [
        leasedEvaluationState({ leaseExpiresAt: NOW }),
      ],
    });
    const expired = await withFixedNow(NOW, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        evaluation: buildEvaluation({ factValue: 10 }),
      })
    );
    expect(expired.status).toBe('expired_lease_requeued');
    expect(ctx.tables.smartManagerFactSnapshots).toHaveLength(0);

    const reclaimed = await withFixedNow(NOW, () =>
      claimEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        leaseToken: 'lease_2',
      })
    );
    expect(reclaimed).toMatchObject({ claimed: true, generation: 1 });

    const reclaimedResult = await withFixedNow(NOW + 1, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_2',
        evaluation: buildEvaluation({ factValue: 20 }),
      })
    );
    expect(reclaimedResult.status).toBe('completed');
    const reclaimedFactHash = ctx.tables.smartManagerFactSnapshots[0].factHash;

    const expiredOriginal = await withFixedNow(NOW + 2, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        evaluation: buildEvaluation({ factValue: 30 }),
      })
    );
    expect(expiredOriginal.status).toBe('stale_lease');
    expect(ctx.tables.smartManagerFactSnapshots[0].factHash).toBe(
      reclaimedFactHash
    );
  });

  test('rejects failure after lease expiry without consuming retry budget', async () => {
    const ctx = buildCtx({
      smartManagerEvaluationStates: [
        leasedEvaluationState({
          leaseExpiresAt: NOW - 1,
          attemptCount: 3,
        }),
      ],
    });
    const result = await withFixedNow(NOW, () =>
      failEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        failureCode: 'LATE_FAILURE',
        failureDetail: 'expired worker',
      })
    );
    expect(result.status).toBe('expired_lease_requeued');
    expect(ctx.tables.smartManagerEvaluationStates[0].attemptCount).toBe(3);
    expect(ctx.tables.smartManagerAuditEvents).toHaveLength(0);
  });

  test('gives new dirty generations a fresh retry lifecycle', async () => {
    const exhaustedCtx = buildCtx({
      smartManagerEvaluationStates: [
        leasedEvaluationState({ attemptCount: 4 }),
      ],
    });
    const exhausted = await withFixedNow(NOW, () =>
      failEvaluationInternal._handler(exhaustedCtx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        failureCode: 'TRANSIENT',
        failureDetail: 'last attempt',
      })
    );
    expect(exhausted.status).toBe('failed');
    expect(exhaustedCtx.tables.smartManagerEvaluationStates[0]).toMatchObject({
      attemptCount: 5,
      attemptGeneration: 1,
      dirtyDomains: [],
    });

    await markSmartManagerDirty(exhaustedCtx, {
      businessId: 'business_1',
      domains: ['events'],
      reasons: ['new_stamp'],
      now: NOW + 1,
    });
    expect(exhaustedCtx.tables.smartManagerEvaluationStates[0]).toMatchObject({
      generation: 2,
      attemptCount: 0,
      attemptGeneration: 2,
      nextEvaluationAt: NOW + 1,
    });

    const staleFailureCtx = buildCtx({
      smartManagerEvaluationStates: [
        leasedEvaluationState({
          generation: 2,
          leaseGeneration: 1,
          attemptCount: 4,
          attemptGeneration: 1,
        }),
      ],
    });
    const staleFailure = await withFixedNow(NOW, () =>
      failEvaluationInternal._handler(staleFailureCtx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        failureCode: 'OLD_FAILURE',
        failureDetail: 'old worker failed',
      })
    );
    expect(staleFailure.status).toBe('newer_generation_requeued');
    expect(staleFailureCtx.tables.smartManagerEvaluationStates[0]).toMatchObject({
      generation: 2,
      attemptCount: 0,
      attemptGeneration: 2,
    });
    expect(staleFailureCtx.tables.smartManagerAuditEvents).toHaveLength(0);
  });

  test('reconciles bounded due pages, expired leases, and time refreshes', async () => {
    const dueClean = {
      ...leasedEvaluationState({
        _id: 'state_clean',
        businessId: 'business_1',
        dirtyDomains: [],
        dirtyReasons: [],
        leaseToken: undefined,
        leaseGeneration: undefined,
        leaseExpiresAt: undefined,
        evaluationScheduledAt: undefined,
        nextEvaluationAt: NOW,
      }),
    };
    const expiredLease = leasedEvaluationState({
      _id: 'state_expired',
      businessId: 'business_2',
      leaseExpiresAt: NOW - 1,
      nextEvaluationAt: NOW,
    });
    const dueLostSchedule = leasedEvaluationState({
      _id: 'state_lost',
      businessId: 'business_3',
      leaseToken: undefined,
      leaseGeneration: undefined,
      leaseExpiresAt: undefined,
      evaluationScheduledAt: NOW - 10 * 60 * 1000,
      nextEvaluationAt: NOW,
    });
    const future = leasedEvaluationState({
      _id: 'state_future',
      businessId: 'business_4',
      leaseToken: undefined,
      leaseGeneration: undefined,
      leaseExpiresAt: undefined,
      evaluationScheduledAt: undefined,
      nextEvaluationAt: NOW + 1,
    });
    const ctx = buildCtx({
      smartManagerEvaluationStates: [
        dueClean,
        expiredLease,
        dueLostSchedule,
        future,
      ],
    });

    const firstPage = await withFixedNow(NOW, () =>
      reconcileDueEvaluationsInternal._handler(ctx, {
        cursor: null,
        limit: 2,
      })
    );
    expect(firstPage).toMatchObject({ examined: 2, isDone: false });
    const continuation = ctx.scheduled.find(
      (job) => job.args.cursor !== undefined
    );
    expect(continuation).toBeDefined();

    const secondPage = await withFixedNow(NOW, () =>
      reconcileDueEvaluationsInternal._handler(ctx, continuation.args)
    );
    expect(secondPage).toMatchObject({ examined: 1, isDone: true });
    expect(ctx.tables.smartManagerEvaluationStates[0]).toMatchObject({
      generation: 2,
      dirtyReasons: ['policy_time_refresh'],
      attemptCount: 0,
      attemptGeneration: 2,
    });
    expect(
      ctx.tables.smartManagerEvaluationStates.find(
        (state) => state._id === 'state_future'
      ).nextEvaluationAt
    ).toBe(NOW + 1);
    expect([...new Set(ctx.queried)].sort()).toEqual([
      'smartManagerEvaluationStates',
      'smartManagerPolicyVersions',
    ]);
  });

  test('rejects mismatched business, generation, policy, and fact hashes', async () => {
    const runCompletion = (evaluation) => {
      const ctx = buildCtx({
        smartManagerEvaluationStates: [leasedEvaluationState()],
      });
      return withFixedNow(NOW, () =>
        completeEvaluationInternal._handler(ctx, {
          businessId: 'business_1',
          generation: 1,
          leaseToken: 'lease_1',
          evaluation,
        })
      );
    };

    await expect(
      runCompletion(buildEvaluation({ businessId: 'business_2' }))
    ).rejects.toThrow('SMART_MANAGER_EVALUATION_BUSINESS_MISMATCH');
    await expect(
      runCompletion(buildEvaluation({ generation: 2 }))
    ).rejects.toThrow('SMART_MANAGER_EVALUATION_GENERATION_MISMATCH');

    const wrongPolicy = buildEvaluation();
    wrongPolicy.policy = {
      ...wrongPolicy.policy,
      policyHash: 'sm_sha256_wrong',
    };
    await expect(runCompletion(wrongPolicy)).rejects.toThrow(
      'SMART_MANAGER_EVALUATION_POLICY_MISMATCH'
    );

    const wrongFactHash = buildEvaluation();
    wrongFactHash.factHash = 'sm_sha256_wrong';
    await expect(runCompletion(wrongFactHash)).rejects.toThrow(
      'SMART_MANAGER_EVALUATION_FACT_HASH_MISMATCH'
    );
    await expect(runCompletion({})).rejects.toThrow(
      'SMART_MANAGER_EVALUATION_MALFORMED'
    );
  });

  test('records bounded failure metadata and schedules policy-driven retry', async () => {
    const ctx = buildCtx({
      smartManagerEvaluationStates: [
        leasedEvaluationState(),
      ],
    });
    const result = await withFixedNow(NOW, () =>
      failEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        failureCode: 'TRANSIENT',
        failureDetail: 'temporary source failure',
      })
    );
    expect(result.status).toBe('retry_scheduled');
    expect(ctx.tables.smartManagerEvaluationStates[0]).toMatchObject({
      attemptCount: 1,
      failureCode: 'TRANSIENT',
    });
    expect(ctx.tables.smartManagerAuditEvents).toHaveLength(1);
    expect(ctx.scheduled).toHaveLength(1);
  });
});

function evaluationSourceSeed(overrides = {}) {
  return {
    businesses: [
      {
        _id: 'business_1',
        isActive: true,
        name: 'Business',
        ownerUserId: 'owner_1',
        subscriptionPlan: 'starter',
        createdAt: NOW - 1,
        updatedAt: NOW - 1,
      },
    ],
    smartManagerEvaluationStates: [
      {
        _id: 'state_1',
        businessId: 'business_1',
        dirtyAt: NOW,
        dirtyDomains: [
          'business',
          'profile',
          'programs',
          'memberships',
          'events',
          'campaigns',
          'team',
          'entitlements',
        ],
        dirtyReasons: ['test'],
        generation: 1,
        nextEvaluationAt: NOW,
        attemptCount: 0,
      },
    ],
    loyaltyPrograms: [],
    memberships: [],
    events: [],
    campaigns: [],
    campaignRuns: [],
    businessStaff: [],
    staffInvites: [],
    referralConfigs: [],
    ...overrides,
  };
}

describe('Pass B bounded and incremental evaluation', () => {
  test('loads each growing source once for canonical and live parity', async () => {
    const ctx = buildCtx(evaluationSourceSeed());
    const evaluation = await withFixedNow(NOW, () =>
      loadEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
      })
    );

    for (const table of [
      'loyaltyPrograms',
      'memberships',
      'events',
      'campaigns',
      'campaignRuns',
      'businessStaff',
      'staffInvites',
      'referralConfigs',
    ]) {
      expect(ctx.queried.filter((value) => value === table)).toHaveLength(1);
    }
    expect(evaluation.canonicalSummary.actorScope).toEqual(
      evaluation.liveSummary.actorScope
    );
  });

  test('preserves clean prior domains and expands lifecycle dependencies', async () => {
    const ctx = buildCtx(evaluationSourceSeed());
    const first = await withFixedNow(NOW, () =>
      loadEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
      })
    );
    ctx.tables.smartManagerFactSnapshots.push({
      _id: 'snapshot_1',
      businessId: 'business_1',
      facts: first.facts,
      capabilityAvailability: first.capabilityAvailability,
    });
    Object.assign(ctx.tables.smartManagerEvaluationStates[0], {
      generation: 2,
      dirtyDomains: ['team'],
      dirtyReasons: ['team_change'],
    });
    ctx.tables.businessStaff.push({
      _id: 'staff_1',
      businessId: 'business_1',
      userId: 'staff_user_1',
      staffRole: 'staff',
      status: 'active',
      isActive: true,
    });
    ctx.queried.length = 0;

    const second = await withFixedNow(NOW + 1, () =>
      loadEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 2,
      })
    );
    expect(second.facts.facts.campaigns).toEqual(first.facts.facts.campaigns);
    expect(second.facts.facts.team.value.activeNonOwnerStaffCount).toBe(1);
    for (const cleanTable of [
      'loyaltyPrograms',
      'memberships',
      'events',
      'campaigns',
      'campaignRuns',
      'referralConfigs',
    ]) {
      expect(ctx.queried).not.toContain(cleanTable);
    }
    expect(
      [...expandSmartManagerRefreshDomains(['events'], true)].sort()
    ).toEqual(['events', 'memberships', 'programs']);
    expect(
      [...expandSmartManagerRefreshDomains(['entitlements'], true)].sort()
    ).toEqual(['campaigns', 'entitlements']);
  });

  test('turns oversized sources into explicit unknown facts', async () => {
    const oversizedEvents = Array.from(
      { length: SMART_MANAGER_SOURCE_LIMITS.events + 1 },
      (_, index) => ({
        _id: `event_${index}`,
        businessId: 'business_1',
        type: 'STAMP_ADDED',
        createdAt: NOW - index,
      })
    );
    const ctx = buildCtx(evaluationSourceSeed({ events: oversizedEvents }));
    const evaluation = await withFixedNow(NOW, () =>
      loadEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
      })
    );
    expect(evaluation.status).toBe('bounded_source_unavailable');
    expect(
      evaluation.facts.facts.customerLifecycleSegments.inactive.reasonCode
    ).toBe('BOUNDED_SOURCE_LIMIT_EXCEEDED:events');
    expect(evaluation.facts.facts.programs.state).toBe('known');
  });

  test('ordinary equivalent live and canonical facts produce shadow parity', async () => {
    const ctx = buildCtx(
      evaluationSourceSeed({
        loyaltyPrograms: [
          {
            _id: 'program_1',
            businessId: 'business_1',
            isActive: true,
            status: 'active',
            maxStamps: 10,
            createdAt: NOW - 10,
          },
        ],
        memberships: [
          {
            _id: 'membership_1',
            businessId: 'business_1',
            programId: 'program_1',
            userId: 'customer_1',
            isActive: true,
            currentStamps: 2,
          },
        ],
        events: [
          {
            _id: 'event_1',
            businessId: 'business_1',
            customerUserId: 'customer_1',
            type: 'STAMP_ADDED',
            createdAt: NOW - 20 * 24 * 60 * 60 * 1000,
          },
          {
            _id: 'event_2',
            businessId: 'business_1',
            customerUserId: 'customer_1',
            type: 'STAMP_ADDED',
            createdAt: NOW - 10 * 24 * 60 * 60 * 1000,
          },
        ],
      })
    );
    const evaluation = await withFixedNow(NOW, () =>
      loadEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
      })
    );
    expect(evaluation.status).toBe('parity');
    expect(evaluation.differences).toEqual([]);
    expect(evaluation.canonicalSummary).toEqual(evaluation.liveSummary);
    expect(ctx.queried.filter((value) => value === 'events')).toHaveLength(1);
    expect(ctx.queried.filter((value) => value === 'memberships')).toHaveLength(
      1
    );
  });

  test('canonical reversal semantics mismatch current live recommendation facts', async () => {
    const ctx = buildCtx(
      evaluationSourceSeed({
        loyaltyPrograms: [
          {
            _id: 'program_1',
            businessId: 'business_1',
            isActive: true,
            status: 'active',
            maxStamps: 10,
            createdAt: NOW - 10,
          },
        ],
        memberships: [
          {
            _id: 'membership_1',
            businessId: 'business_1',
            programId: 'program_1',
            userId: 'customer_1',
            isActive: true,
            currentStamps: 2,
          },
        ],
        events: [
          {
            _id: 'event_original',
            businessId: 'business_1',
            customerUserId: 'customer_1',
            type: 'STAMP_ADDED',
            createdAt: NOW - 20 * 24 * 60 * 60 * 1000,
            reversalEventId: 'event_reversal',
          },
          {
            _id: 'event_reversal',
            businessId: 'business_1',
            customerUserId: 'customer_1',
            type: 'STAMP_ADDED',
            createdAt: NOW - 10 * 24 * 60 * 60 * 1000,
            revertsEventId: 'event_original',
          },
        ],
      })
    );
    const evaluation = await withFixedNow(NOW, () =>
      loadEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
      })
    );
    expect(evaluation.status).toBe('mismatch');
    expect(evaluation.differences.length).toBeGreaterThan(0);
    expect(evaluation.canonicalSummary).not.toEqual(evaluation.liveSummary);
    expect(evaluation.canonicalSummary.facts.inactive).not.toEqual(
      evaluation.liveSummary.facts.inactive
    );
    expect(ctx.queried.filter((value) => value === 'events')).toHaveLength(1);
    expect(ctx.queried.filter((value) => value === 'memberships')).toHaveLength(
      1
    );
    expect(ctx.queried.filter((value) => value === 'loyaltyPrograms')).toHaveLength(
      1
    );
  });

  test('keeps configured per-source probes inside the aggregate budget', () => {
    expect(
      getSmartManagerSourceLimitTotal() +
        SMART_MANAGER_FIXED_EVALUATION_READ_ALLOWANCE
    ).toBeLessThanOrEqual(SMART_MANAGER_AGGREGATE_SOURCE_READ_BUDGET);
  });
});

describe('Pass B parity, cleanup, and duplicate safety', () => {
  const fullDecision = (overrides = {}) => ({
    stableId: 'campaign.publish_draft',
    category: 'operational',
    priority: 2,
    placement: 'primary',
    title: 'Draft',
    reason: 'One draft',
    ctaLabel: 'Open',
    action: { type: 'open_campaign', campaignId: 'campaign_1' },
    entityType: 'campaign',
    entityId: 'campaign_1',
    guideId: 'campaign-publish',
    tone: 'operational',
    evidenceFingerprint: 'fingerprint_1',
    evidenceObservedAt: NOW,
    count: 1,
    requiredCapabilities: [
      'access_campaigns',
      'edit_campaigns',
      'activate_send_campaigns',
    ],
    access: { state: 'allowed' },
    ...overrides,
  });

  test('detects every deterministic action-flow parity field', () => {
    const canonical = fullDecision();
    const mutations = {
      action: { action: { type: 'open_campaign', campaignId: 'campaign_2' } },
      entityType: { entityType: 'program' },
      entityId: { entityId: 'campaign_2' },
      guideId: { guideId: 'campaign-resume' },
      ctaLabel: { ctaLabel: 'Resume' },
      access: {
        access: { state: 'restricted', reasonCode: 'CAPABILITY_REQUIRED' },
      },
      placement: { placement: 'secondary' },
      tone: { tone: 'growth' },
    };
    for (const [field, override] of Object.entries(mutations)) {
      expect(
        compareSmartManagerShadowSummaries(
          [canonical],
          [fullDecision(override)]
        )
      ).toContain(`campaign.publish_draft:${field}`);
    }
  });

  test('refreshes an unchanged decision binding for a newer generation', async () => {
    const ctx = buildCtx({
      smartManagerEvaluationStates: [leasedEvaluationState()],
    });
    await withFixedNow(NOW, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        evaluation: buildEvaluation({ decisions: [fullDecision()] }),
      })
    );
    Object.assign(ctx.tables.smartManagerEvaluationStates[0], {
      generation: 2,
      leaseGeneration: 2,
      leaseToken: 'lease_2',
      leaseExpiresAt: NOW + 60_000,
      leasePolicyVersion: getSeedSmartManagerPolicy().version,
      leasePolicyHash: getSeedSmartManagerPolicy().policyHash,
    });
    ctx.writes.length = 0;
    await withFixedNow(NOW, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 2,
        leaseToken: 'lease_2',
        evaluation: buildEvaluation({
          generation: 2,
          factValue: 2,
          decisions: [fullDecision()],
        }),
      })
    );
    expect(
      ctx.writes.filter(
        (write) =>
          write.type === 'patch' &&
          write.tableName === 'smartManagerDecisions'
      )
    ).toHaveLength(1);
    expect(ctx.tables.smartManagerDecisions[0]).toMatchObject({
      sourceGeneration: 2,
      factHash: buildEvaluation({
        generation: 2,
        factValue: 2,
        decisions: [fullDecision()],
      }).factHash,
    });
  });

  test('deactivates more than one decision page through bounded continuations', async () => {
    const decisions = Array.from({ length: 120 }, (_, index) => ({
      _id: `decision_${index}`,
      businessId: 'business_1',
      stableId: `old_${index}`,
      state: 'shadow_active',
      sourceGeneration: 0,
    }));
    const ctx = buildCtx({
      smartManagerEvaluationStates: [leasedEvaluationState()],
      smartManagerDecisions: decisions,
    });
    await withFixedNow(NOW, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        evaluation: buildEvaluation({ factValue: 3 }),
      })
    );
    let jobIndex = 0;
    while (jobIndex < ctx.scheduled.length) {
      const job = ctx.scheduled[jobIndex++];
      if (job.args.businessId && job.args.cursor !== undefined) {
        await withFixedNow(NOW, () =>
          deactivateStaleDecisionsInternal._handler(ctx, job.args)
        );
      }
    }
    expect(
      ctx.tables.smartManagerDecisions.filter(
        (decision) => decision.state === 'shadow_active'
      )
    ).toHaveLength(0);
  });

  test('stale deactivation continuations no-op after a newer generation completes', async () => {
    const keepDecision = fullDecision({ stableId: 'growth.near_reward' });
    const keepHashable = { ...keepDecision };
    delete keepHashable.evidenceObservedAt;
    const keepHash = hashSmartManagerValue(keepHashable);
    const staleDecisions = Array.from({ length: 50 }, (_, index) => ({
      _id: `stale_${index}`,
      businessId: 'business_1',
      stableId: `old_${index}`,
      state: 'shadow_active',
      sourceGeneration: 0,
    }));
    const ctx = buildCtx({
      smartManagerEvaluationStates: [leasedEvaluationState()],
      smartManagerDecisions: [
        ...staleDecisions,
        {
          _id: 'keep_1',
          businessId: 'business_1',
          stableId: keepDecision.stableId,
          state: 'shadow_active',
          sourceGeneration: 0,
          decisionHash: keepHash,
          decision: keepDecision,
        },
      ],
    });
    await withFixedNow(NOW, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        evaluation: buildEvaluation({ factValue: 3 }),
      })
    );
    const staleContinuations = ctx.scheduled.filter(
      (job) =>
        job.args.businessId &&
        job.args.cursor !== undefined &&
        job.args.generation === 1
    );
    expect(staleContinuations.length).toBeGreaterThan(0);
    Object.assign(ctx.tables.smartManagerEvaluationStates[0], {
      generation: 2,
      leaseGeneration: 2,
      leaseToken: 'lease_2',
      leaseExpiresAt: NOW + 60_000,
      leasePolicyVersion: getSeedSmartManagerPolicy().version,
      leasePolicyHash: getSeedSmartManagerPolicy().policyHash,
    });
    await withFixedNow(NOW, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 2,
        leaseToken: 'lease_2',
        evaluation: buildEvaluation({
          generation: 2,
          factValue: 4,
          decisions: [keepDecision],
        }),
      })
    );
    const keepBefore = {
      ...ctx.tables.smartManagerDecisions.find(
        (decision) => decision._id === 'keep_1'
      ),
    };
    expect(keepBefore.state).toBe('shadow_active');
    expect(keepBefore.sourceGeneration).toBe(2);
    ctx.writes.length = 0;
    for (const job of staleContinuations) {
      await withFixedNow(NOW, () =>
        deactivateStaleDecisionsInternal._handler(ctx, job.args)
      );
    }
    const keepAfter = ctx.tables.smartManagerDecisions.find(
      (decision) => decision._id === 'keep_1'
    );
    expect(keepAfter).toEqual(keepBefore);
    expect(keepAfter.state).toBe('shadow_active');
    expect(
      ctx.writes.filter(
        (write) => write.tableName === 'smartManagerDecisions'
      )
    ).toHaveLength(0);
  });

  test('continues expired audit cleanup beyond one bounded page', async () => {
    const audits = Array.from({ length: 205 }, (_, index) => ({
      _id: `audit_${index}`,
      businessId: 'business_1',
      expiresAt: NOW - 1,
    }));
    const ctx = buildCtx({ smartManagerAuditEvents: audits });
    await withFixedNow(NOW, () =>
      purgeExpiredAuditEventsInternal._handler(ctx, {})
    );
    let jobIndex = 0;
    while (jobIndex < ctx.scheduled.length) {
      await withFixedNow(NOW, () =>
        purgeExpiredAuditEventsInternal._handler(
          ctx,
          ctx.scheduled[jobIndex++].args
        )
      );
    }
    expect(ctx.tables.smartManagerAuditEvents).toHaveLength(0);
  });

  test('reconciles duplicate singleton state deterministically without unique()', async () => {
    const ctx = buildCtx({
      smartManagerEvaluationStates: [
        {
          ...leasedEvaluationState({
            _id: 'state_a',
            leaseToken: undefined,
            leaseGeneration: undefined,
            leaseExpiresAt: undefined,
            nextEvaluationAt: 0,
          }),
          _creationTime: 1,
        },
        {
          ...leasedEvaluationState({
            _id: 'state_b',
            generation: 2,
            leaseToken: undefined,
            leaseGeneration: undefined,
            leaseExpiresAt: undefined,
            nextEvaluationAt: 0,
          }),
          _creationTime: 2,
        },
      ],
    });
    expect(
      selectDeterministicSmartManagerSingleton(
        ctx.tables.smartManagerEvaluationStates
      )._id
    ).toBe('state_a');
    const claim = await withFixedNow(NOW, () =>
      claimEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        leaseToken: 'lease_new',
      })
    );
    expect(claim).toMatchObject({ claimed: true, generation: 2 });
    expect(ctx.tables.smartManagerEvaluationStates).toHaveLength(1);
  });

  test('collapses duplicate fact and comparison singletons on completion', async () => {
    const ctx = buildCtx({
      smartManagerEvaluationStates: [leasedEvaluationState()],
      smartManagerFactSnapshots: [
        {
          _id: 'snapshot_old',
          businessId: 'business_1',
          sourceGeneration: 0,
          factHash: 'old',
        },
        {
          _id: 'snapshot_new',
          businessId: 'business_1',
          sourceGeneration: 1,
          factHash: 'newer',
        },
      ],
      smartManagerShadowComparisons: [
        {
          _id: 'comparison_old',
          businessId: 'business_1',
          sourceGeneration: 0,
          comparisonHash: 'old',
          status: 'parity',
        },
        {
          _id: 'comparison_new',
          businessId: 'business_1',
          sourceGeneration: 1,
          comparisonHash: 'newer',
          status: 'mismatch',
        },
      ],
    });
    const result = await withFixedNow(NOW, () =>
      completeEvaluationInternal._handler(ctx, {
        businessId: 'business_1',
        generation: 1,
        leaseToken: 'lease_1',
        evaluation: buildEvaluation({ factValue: 9 }),
      })
    );
    expect(result.status).toBe('completed');
    expect(ctx.tables.smartManagerFactSnapshots).toHaveLength(1);
    expect(ctx.tables.smartManagerShadowComparisons).toHaveLength(1);
  });

  test('contains coalesced invalidation and account-deletion privacy hooks', () => {
    const campaigns = readFileSync('convex/campaigns.ts', 'utf8');
    const referrals = readFileSync('convex/referrals.ts', 'utf8');
    const business = readFileSync('convex/business.ts', 'utf8');
    const retention = readFileSync('convex/retention.ts', 'utf8');
    const aiRecommendations = readFileSync(
      'convex/aiRecommendations.ts',
      'utf8'
    );
    const users = readFileSync('convex/users.ts', 'utf8');
    expect(campaigns).toContain('campaign_automation_transition');
    expect(referrals).toContain('business_referral_credit_applied');
    expect(referrals).toContain('referral_config_changed');
    expect(business).toContain('team_member_self_removed');
    expect(business).toContain('team_invite_expired');
    expect(retention).toContain('ai_retention_suggestion_created');
    expect(aiRecommendations).toContain('ai_recommendation_campaign_created');
    expect(users).toContain("'recommendationInteractions'");
    expect(users).toContain("'recommendationGuideSessions'");
    expect(users).toContain('user_account_deleted');
  });

  test('binds comparison facts and audit details without v.any payloads', () => {
    const validators = readFileSync(
      'convex/lib/smartManagerValidators.ts',
      'utf8'
    );
    const schema = readFileSync('convex/schema.ts', 'utf8');
    expect(validators).not.toContain('v.any()');
    expect(validators).toContain(
      'facts: smartManagerRepresentativeFactSummaryValidator'
    );
    expect(validators).toContain(
      'canonicalSummary: smartManagerComparisonSummaryValidator'
    );
    expect(validators).toContain(
      'liveSummary: smartManagerComparisonSummaryValidator'
    );
    expect(schema).toContain(
      'detail: v.optional(smartManagerAuditEventDetailValidator)'
    );
  });
});
