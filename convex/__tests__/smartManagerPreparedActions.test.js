import { describe, expect, test } from 'bun:test';

import {
  getCurrentPreparedWinbackReview,
  getPreparedWinbackReview,
  cleanupPreparedActionRetentionInternal,
  finalizePreparedWinbackGenerationInternal,
  hashSmartManagerWinbackPrompt,
  prepareWinbackAction,
  regeneratePreparedWinbackCopy,
} from '../smartManagerActions';
import { reconcileCurrentPreparedWinbackAfterEvaluation } from '../smartManager';
import {
  buildAuthorityComparisonHash,
  buildAuthorityDecisionHash,
  buildAuthorityFactHash,
} from '../lib/smartManagerAuthority';
import {
  selectSmartManagerAccessCurrentnessBlockers,
  SMART_MANAGER_FALLBACK_GENERATION_VERSION,
  SMART_MANAGER_MAX_COPY_REVISION_SLOTS,
  SMART_MANAGER_WINBACK_FALLBACK_COPY,
  buildSmartManagerAiCacheKey,
  buildSmartManagerStructuredInputHash,
  buildSmartManagerWinbackPrompt,
  buildSmartManagerWinbackStructuredInput,
} from '../lib/smartManagerPreparedActions';
import { OPENROUTER_JSON_MODEL } from '../lib/aiJsonGeneration';
import { monthKeyFromTimestamp } from '../lib/recommendationUtils';
import {
  hashSmartManagerValue,
  SMART_MANAGER_POLICY_SCHEMA_VERSION,
  SMART_MANAGER_POLICY_V1,
  SMART_MANAGER_POLICY_V1_HASH,
  SMART_MANAGER_POLICY_V1_VERSION,
} from '../lib/smartManagerPolicy';

const OBSERVED_AT = Date.now();

class FakeQuery {
  constructor(tableName, rows, reads) {
    this.tableName = tableName;
    this.sourceRows = rows;
    this.predicates = [];
    this.direction = 'asc';
    this.reads = reads;
  }

  withIndex(name, builder) {
    const predicates = [];
    const q = {
      eq(field, value) {
        predicates.push((row) => row[field] === value);
        return q;
      },
      lte(field, value) {
        predicates.push((row) => row[field] <= value);
        return q;
      },
    };
    builder(q);
    this.reads.push({
      kind: 'index',
      tableName: this.tableName,
      name,
    });
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
    const rows = this.sourceRows.filter((row) =>
      this.predicates.every((predicate) => predicate(row))
    );
    return this.direction === 'desc' ? [...rows].reverse() : rows;
  }

  async first() {
    this.reads.push({ kind: 'first', tableName: this.tableName });
    return this.rows()[0] ?? null;
  }

  async take(limit) {
    this.reads.push({ kind: 'take', tableName: this.tableName, limit });
    return this.rows().slice(0, limit);
  }

  async paginate({ cursor, numItems }) {
    this.reads.push({
      kind: 'paginate',
      tableName: this.tableName,
      limit: numItems,
    });
    const rows = this.rows();
    const start = cursor === null ? 0 : Number(cursor);
    const end = Math.min(start + numItems, rows.length);
    return {
      page: rows.slice(start, end),
      continueCursor: String(end),
      isDone: end >= rows.length,
    };
  }

  async collect() {
    throw new Error('UNBOUNDED_COLLECT_FORBIDDEN');
  }
}

function buildFixture({
  currentUserId = 'user_owner',
  staffRole = 'owner',
  campaignUsage = 0,
  subscriptionPlan = 'starter',
  audienceCount = 1,
  policyConfig,
} = {}) {
  const campaignLimit = subscriptionPlan === 'starter' ? 1 : 5;
  const policyHash = policyConfig
    ? hashSmartManagerValue({
        schemaVersion: SMART_MANAGER_POLICY_SCHEMA_VERSION,
        version: SMART_MANAGER_POLICY_V1_VERSION,
        config: policyConfig,
      })
    : SMART_MANAGER_POLICY_V1_HASH;
  const decisionSummary = {
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
    evidenceObservedAt: OBSERVED_AT,
    count: audienceCount,
    requiredCapabilities: ['access_customers'],
    access: { state: 'allowed' },
  };
  const factEnvelope = {
    schemaVersion: 1,
    businessId: 'business_1',
    generatedAt: OBSERVED_AT,
    facts: {
      campaignQuota: {
        state: 'known',
        observedAt: OBSERVED_AT,
        value: {
          campaignDefinitionUsage: campaignUsage,
          campaignDefinitionLimit: campaignLimit,
          remainingDefinitions: Math.max(0, campaignLimit - campaignUsage),
          isAtOrAboveLimit: campaignUsage >= campaignLimit,
        },
      },
      customerLifecycleSegments: {
        inactive: {
          state: 'known',
          observedAt: OBSERVED_AT,
          value: {
            count: audienceCount,
            evidenceFingerprint: 'lifecycle_source_v1',
          },
        },
      },
    },
  };
  const factHash = buildAuthorityFactHash(factEnvelope);
  const decisionHash = buildAuthorityDecisionHash(decisionSummary);
  const canonicalSummary = {
    recommendations: [decisionSummary],
    facts: {},
  };
  const liveSummary = structuredClone(canonicalSummary);
  const comparisonHash = buildAuthorityComparisonHash({
    factHash,
    policyHash,
    status: 'parity',
    canonicalSummary,
    liveSummary,
    differences: [],
  });
  const tables = {
    users: [
      { _id: currentUserId, isActive: true },
    ],
    businesses: [
      {
        _id: 'business_1',
        ownerUserId: 'user_owner',
        externalId: 'business_external_1',
        name: 'Business',
        subscriptionPlan,
        subscriptionStatus: 'active',
        isActive: true,
        createdAt: OBSERVED_AT - 10_000,
        updatedAt: OBSERVED_AT,
      },
    ],
    businessStaff: [
      {
        _id: `staff_${currentUserId}`,
        businessId: 'business_1',
        userId: currentUserId,
        staffRole,
        status: 'active',
        isActive: true,
        createdAt: OBSERVED_AT - 10_000,
        updatedAt: OBSERVED_AT,
      },
    ],
    smartManagerPolicyVersions: policyConfig
      ? [
          {
            _id: 'policy_1',
            version: SMART_MANAGER_POLICY_V1_VERSION,
            schemaVersion: SMART_MANAGER_POLICY_SCHEMA_VERSION,
            policyHash,
            config: policyConfig,
            effectiveFrom: OBSERVED_AT - 1,
            reason: 'test-policy',
            createdAt: OBSERVED_AT - 1,
          },
        ]
      : [],
    smartManagerEvaluationStates: [
      {
        _id: 'evaluation_1',
        businessId: 'business_1',
        dirtyDomains: [],
        dirtyReasons: [],
        generation: 7,
        lastSuccessfulGeneration: 7,
        lastFactHash: factHash,
        updatedAt: OBSERVED_AT,
      },
    ],
    smartManagerFactSnapshots: [
      {
        _id: 'facts_1',
        businessId: 'business_1',
        sourceGeneration: 7,
        sourceWatermark: 'generation:7',
        factHash,
        facts: factEnvelope,
        updatedAt: OBSERVED_AT,
      },
    ],
    smartManagerDecisions: [
      {
        _id: 'decision_1',
        businessId: 'business_1',
        stableId: 'retention.reengage_inactive',
        state: 'shadow_active',
        sourceGeneration: 7,
        factHash,
        decisionHash,
        evidenceFingerprint: decisionSummary.evidenceFingerprint,
        evidenceObservedAt: OBSERVED_AT,
        policyVersion: SMART_MANAGER_POLICY_V1_VERSION,
        policyHash,
        decision: decisionSummary,
        updatedAt: OBSERVED_AT,
      },
    ],
    smartManagerShadowComparisons: [
      {
        _id: 'comparison_1',
        businessId: 'business_1',
        sourceGeneration: 7,
        factHash,
        policyVersion: SMART_MANAGER_POLICY_V1_VERSION,
        policyHash,
        comparisonHash,
        status: 'parity',
        canonicalSummary,
        liveSummary,
        differences: [],
        updatedAt: OBSERVED_AT,
      },
    ],
    smartManagerPreparedActions: [],
    smartManagerPreparedActionCopies: [],
    smartManagerAuditEvents: [],
    aiGenerationCache: [],
    aiUsageLedger: [],
  };
  return { currentUserId, tables };
}

function buildCtx(fixture, options = {}) {
  const reads = [];
  let currentUserId = fixture.currentUserId;
  const scheduled = options.scheduled ?? [];
  const state = Object.fromEntries(
    Object.entries(fixture.tables).map(([tableName, rows]) => [
      tableName,
      new Map(rows.map((row) => [row._id, { ...row }])),
    ])
  );
  const insertCounts = {};
  const allRows = () =>
    Object.values(state).flatMap((table) => Array.from(table.values()));
  const ctx = {
    runMutation: async () => ({ ok: true }),
    auth: {
      getUserIdentity: async () => ({
        subject: `${currentUserId}|session_1`,
      }),
    },
    db: {
      get: async (id) => allRows().find((row) => row._id === id) ?? null,
      query: (tableName) => {
        reads.push({ kind: 'query', tableName });
        return new FakeQuery(
          tableName,
          Array.from(state[tableName]?.values() ?? []),
          reads
        );
      },
      insert: async (tableName, value) => {
        insertCounts[tableName] = (insertCounts[tableName] ?? 0) + 1;
        const id = `${tableName}_${insertCounts[tableName]}`;
        state[tableName].set(id, { _id: id, ...value });
        return id;
      },
      patch: async (id, patch) => {
        for (const table of Object.values(state)) {
          if (table.has(id)) {
            table.set(id, { ...table.get(id), ...patch });
            return;
          }
        }
        throw new Error(`UNKNOWN_PATCH_TARGET:${id}`);
      },
      delete: async (id) => {
        for (const table of Object.values(state)) {
          if (table.delete(id)) {
            return;
          }
        }
        throw new Error(`UNKNOWN_DELETE_TARGET:${id}`);
      },
    },
    ...(Array.isArray(options.scheduled)
      ? {
          scheduler: {
            runAfter: async (delay, ref, args) => {
              scheduled.push({ delay, ref, args });
            },
          },
        }
      : {}),
  };
  return {
    ctx,
    reads,
    state,
    scheduled,
    setCurrentUserId(userId) {
      currentUserId = userId;
    },
  };
}

describe('Smart Manager prepared win-back actions', () => {
  test('prepares fallback revision one atomically and reuses the exact key', async () => {
    const { ctx, reads, state } = buildCtx(buildFixture());
    const args = {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    };

    const created = await prepareWinbackAction._handler(ctx, args);
    const reused = await prepareWinbackAction._handler(ctx, args);

    expect(created.reused).toBe(false);
    expect(reused).toEqual({ ...created, reused: true });
    expect(state.smartManagerPreparedActions.size).toBe(1);
    expect(state.smartManagerPreparedActionCopies.size).toBe(1);
    const action = state.smartManagerPreparedActions.get(
      created.preparedActionId
    );
    const copy = state.smartManagerPreparedActionCopies.get(
      action.selectedCopyId
    );
    expect(action.selectedCopyRevision).toBe(1);
    expect(action.nextCopyRevision).toBe(2);
    expect(action.copyRevisionLimit).toBe(
      SMART_MANAGER_MAX_COPY_REVISION_SLOTS
    );
    expect(action.generationState).toBe('not_requested');
    expect(copy).toMatchObject({
      preparedActionId: action._id,
      businessId: 'business_1',
      revision: 1,
      provenance: 'deterministic',
      generationVersion: SMART_MANAGER_FALLBACK_GENERATION_VERSION,
      ...SMART_MANAGER_WINBACK_FALLBACK_COPY,
    });
    expect(state.smartManagerAuditEvents.size).toBe(1);
    expect(reads.some((read) => read.kind === 'collect')).toBe(false);
    expect(
      reads
        .filter((read) => read.kind === 'take')
        .every((read) => read.limit === 2)
    ).toBe(true);
    expect(
      reads.some((read) =>
        ['campaigns', 'memberships', 'events', 'pushTokens'].includes(
          read.tableName
        )
      )
    ).toBe(false);
  });

  test('returns a current PII-free review with the exact copy binding', async () => {
    const { ctx } = buildCtx(buildFixture({ staffRole: 'manager' }));
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });

    const review = await getPreparedWinbackReview._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
    });
    const currentReview = await getCurrentPreparedWinbackReview._handler(ctx, {
      businessId: 'business_1',
    });

    expect(currentReview.preparedActionId).toBe(review.preparedActionId);
    expect(currentReview.approval.binding).toEqual(review.approval.binding);
    expect(review.currentness.state).toBe('current');
    expect(review.approval.eligibleForApproval).toBe(true);
    expect(review.approval.binding).toEqual({
      preparedActionId: prepared.preparedActionId,
      copyRevision: 1,
      contentHash: prepared.contentHash,
    });
    expect(review.message).toMatchObject({
      revision: 1,
      provenance: 'deterministic',
      generationVersion: SMART_MANAGER_FALLBACK_GENERATION_VERSION,
      ...SMART_MANAGER_WINBACK_FALLBACK_COPY,
    });
    expect(review.execution).toEqual({
      state: 'not_implemented',
      campaignId: null,
      recipientsMaterialized: false,
      deliveryStarted: false,
    });
    const serialized = JSON.stringify(review);
    for (const forbidden of [
      'customerIds',
      'customerSamples',
      'email',
      'phone',
      'pushToken',
      'reachableCount',
      'rawFacts',
      'provider',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test('supports a redacted prepared actor without invalidating review', async () => {
    const { ctx, state } = buildCtx(buildFixture());
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    const action = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    const redactedAction = { ...action };
    delete redactedAction.preparedByUserId;
    state.smartManagerPreparedActions.set(
      prepared.preparedActionId,
      redactedAction
    );

    const review = await getPreparedWinbackReview._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
    });

    expect(review.preparedActionId).toBe(prepared.preparedActionId);
    expect(review.currentness.state).toBe('current');
  });

  test('does not disclose whether a foreign prepared action ID exists', async () => {
    const owner = buildCtx(buildFixture());
    const prepared = await prepareWinbackAction._handler(owner.ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    owner.state.users.set('user_outsider', {
      _id: 'user_outsider',
      isActive: true,
    });
    owner.setCurrentUserId('user_outsider');

    const readError = async (preparedActionId) => {
      try {
        await getPreparedWinbackReview._handler(owner.ctx, {
          preparedActionId,
        });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    const existingForeignError = await readError(prepared.preparedActionId);
    const nonexistentError = await readError('prepared_action_missing');

    expect(existingForeignError).toBe(
      'SMART_MANAGER_PREPARED_ACTION_NOT_FOUND'
    );
    expect(nonexistentError).toBe(existingForeignError);
  });

  test('dirty evidence immediately makes review reevaluation_pending', async () => {
    const { ctx, state } = buildCtx(buildFixture());
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    const evaluation = state.smartManagerEvaluationStates.get('evaluation_1');
    state.smartManagerEvaluationStates.set('evaluation_1', {
      ...evaluation,
      dirtyDomains: ['campaigns'],
    });

    const review = await getPreparedWinbackReview._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
    });

    expect(review.currentness.state).toBe('reevaluation_pending');
    expect(review.currentness.blockers).toEqual([
      'CAMPAIGN_QUOTA_REEVALUATION_PENDING',
      'REEVALUATION_PENDING',
    ]);
    expect(review.approval.eligibleForApproval).toBe(false);
  });

  test('keeps approval-only access blockers out of currentness', () => {
    expect(
      selectSmartManagerAccessCurrentnessBlockers([
        'CAMPAIGN_QUOTA_REEVALUATION_PENDING',
        'CAMPAIGN_QUOTA_EVIDENCE_INVALID',
        'ACTIVATE_SEND_CAMPAIGNS_REQUIRED',
        'CAMPAIGN_LIMIT_REACHED',
        'CREATE_CAMPAIGNS_REQUIRED',
        'SMART_MANAGER_FEATURE_UNAVAILABLE',
        'SUBSCRIPTION_INACTIVE',
      ])
    ).toEqual([
      'CAMPAIGN_QUOTA_REEVALUATION_PENDING',
      'CAMPAIGN_QUOTA_EVIDENCE_INVALID',
    ]);
  });

  test('supersedes only the indexed current action for a different key', async () => {
    const { ctx, state } = buildCtx(buildFixture());
    const args = {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    };
    const first = await prepareWinbackAction._handler(ctx, args);
    const firstAction = state.smartManagerPreparedActions.get(
      first.preparedActionId
    );
    state.smartManagerPreparedActions.set(first.preparedActionId, {
      ...firstAction,
      preparationKey: 'prior_authority_key',
    });

    const second = await prepareWinbackAction._handler(ctx, args);

    expect(second.preparedActionId).not.toBe(first.preparedActionId);
    expect(
      state.smartManagerPreparedActions.get(first.preparedActionId).state
    ).toBe('superseded');
    expect(
      state.smartManagerPreparedActions.get(second.preparedActionId).state
    ).toBe('reviewable');
    expect(state.smartManagerPreparedActions.size).toBe(2);
    expect(state.smartManagerAuditEvents.size).toBe(3);
  });

  test('never resurrects or duplicates an expired exact key', async () => {
    const { ctx, state } = buildCtx(buildFixture());
    const args = {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    };
    const prepared = await prepareWinbackAction._handler(ctx, args);
    const action = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    state.smartManagerPreparedActions.set(prepared.preparedActionId, {
      ...action,
      expiresAt: Date.now() - 1,
    });

    await expect(prepareWinbackAction._handler(ctx, args)).rejects.toThrow(
      'SMART_MANAGER_PREPARED_ACTION_EXPIRED'
    );
    expect(state.smartManagerPreparedActions.size).toBe(1);
    expect(state.smartManagerPreparedActionCopies.size).toBe(1);
  });

  test('campaign capacity blocks approval but not deterministic preparation', async () => {
    const { ctx } = buildCtx(buildFixture({ campaignUsage: 1 }));
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    const review = await getPreparedWinbackReview._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
    });

    expect(review.currentness.state).toBe('current');
    expect(review.currentness.blockers).toEqual([]);
    expect(review.approval.eligibleForApproval).toBe(false);
    expect(review.approval.blockers).toContain('CAMPAIGN_LIMIT_REACHED');
  });

  test('staff and malformed selected-copy rows fail closed', async () => {
    const staff = buildCtx(
      buildFixture({ currentUserId: 'user_staff', staffRole: 'staff' })
    );
    await expect(
      prepareWinbackAction._handler(staff.ctx, {
        businessId: 'business_1',
        expectedEvidenceFingerprint: 'decision_evidence_v1',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');

    const owner = buildCtx(buildFixture());
    const prepared = await prepareWinbackAction._handler(owner.ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    const action = owner.state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    owner.state.smartManagerPreparedActionCopies.delete(action.selectedCopyId);

    await expect(
      getPreparedWinbackReview._handler(owner.ctx, {
        preparedActionId: prepared.preparedActionId,
      })
    ).rejects.toThrow('SMART_MANAGER_PREPARED_ACTION_MALFORMED');
  });

  test('explicit regeneration selects a fresh fallback before reserving AI and conflicts safely', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });

    const regenerated = await regeneratePreparedWinbackCopy._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
      expectedCopyRevision: 1,
    });
    const action = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    const selected = state.smartManagerPreparedActionCopies.get(
      action.selectedCopyId
    );

    expect(regenerated.copyRevision).toBe(2);
    expect(action.selectedCopyRevision).toBe(2);
    expect(action.generationExpectedCopyRevision).toBe(2);
    expect(action.generationReservedCopyRevision).toBe(3);
    expect(action.nextCopyRevision).toBe(4);
    expect(action.generationState).toBe('queued');
    expect(selected).toMatchObject({
      revision: 2,
      provenance: 'deterministic',
      generationVersion: SMART_MANAGER_FALLBACK_GENERATION_VERSION,
      ...SMART_MANAGER_WINBACK_FALLBACK_COPY,
    });
    expect(
      Array.from(state.smartManagerPreparedActionCopies.values()).some(
        (copy) => copy.revision === 3
      )
    ).toBe(false);

    await expect(
      regeneratePreparedWinbackCopy._handler(ctx, {
        preparedActionId: prepared.preparedActionId,
        expectedCopyRevision: 1,
      })
    ).rejects.toThrow('COPY_REVISION_CONFLICT');
    expect(state.smartManagerPreparedActionCopies.size).toBe(2);
  });

  test('revision cap rejects both-slot regeneration without partial allocation', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    const action = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    state.smartManagerPreparedActions.set(prepared.preparedActionId, {
      ...action,
      nextCopyRevision: 10,
    });

    await expect(
      regeneratePreparedWinbackCopy._handler(ctx, {
        preparedActionId: prepared.preparedActionId,
        expectedCopyRevision: 1,
      })
    ).rejects.toThrow('COPY_REVISION_LIMIT_REACHED');
    expect(state.smartManagerPreparedActionCopies.size).toBe(1);
    expect(
      state.smartManagerPreparedActions.get(prepared.preparedActionId)
        .selectedCopyRevision
    ).toBe(1);
  });

  test('AI entitlement, inactive paid subscription, and small fresh audiences never invalidate fallback', async () => {
    const starter = buildCtx(buildFixture());
    const starterPrepared = await prepareWinbackAction._handler(starter.ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await expect(
      regeneratePreparedWinbackCopy._handler(starter.ctx, {
        preparedActionId: starterPrepared.preparedActionId,
        expectedCopyRevision: 1,
      })
    ).rejects.toThrow('AI_ASSIST_NOT_AVAILABLE');
    expect(
      starter.state.smartManagerPreparedActions.get(
        starterPrepared.preparedActionId
      ).selectedCopyRevision
    ).toBe(1);

    const inactive = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const inactivePrepared = await prepareWinbackAction._handler(
      inactive.ctx,
      {
        businessId: 'business_1',
        expectedEvidenceFingerprint: 'decision_evidence_v1',
      }
    );
    const business = inactive.state.businesses.get('business_1');
    inactive.state.businesses.set('business_1', {
      ...business,
      subscriptionStatus: 'inactive',
    });
    await expect(
      regeneratePreparedWinbackCopy._handler(inactive.ctx, {
        preparedActionId: inactivePrepared.preparedActionId,
        expectedCopyRevision: 1,
      })
    ).rejects.toThrow('AI_SUBSCRIPTION_INACTIVE');
    expect(
      inactive.state.smartManagerPreparedActions.get(
        inactivePrepared.preparedActionId
      ).selectedCopyRevision
    ).toBe(1);

    const small = buildCtx(buildFixture({ subscriptionPlan: 'pro' }));
    const smallPrepared = await prepareWinbackAction._handler(small.ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await expect(
      regeneratePreparedWinbackCopy._handler(small.ctx, {
        preparedActionId: smallPrepared.preparedActionId,
        expectedCopyRevision: 1,
      })
    ).rejects.toThrow('AI_FRESH_AUDIENCE_BELOW_MINIMUM');
    expect(small.state.smartManagerPreparedActionCopies.size).toBe(1);
  });

  test('monthly quota exhaustion blocks only provider regeneration without allocating revisions', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    const monthKey = monthKeyFromTimestamp(Date.now());
    for (let index = 0; index < 100; index += 1) {
      state.aiUsageLedger.set(`usage_${index}`, {
        _id: `usage_${index}`,
        businessId: 'business_1',
        monthKey,
        requestType: 'smart_manager_copy_generation',
        model: OPENROUTER_JSON_MODEL,
        cacheHit: false,
        status: 'success',
        createdAt: Date.now(),
      });
    }

    await expect(
      regeneratePreparedWinbackCopy._handler(ctx, {
        preparedActionId: prepared.preparedActionId,
        expectedCopyRevision: 1,
      })
    ).rejects.toThrow('AI_MONTHLY_QUOTA_EXHAUSTED');
    const action = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    expect(action.selectedCopyRevision).toBe(1);
    expect(action.nextCopyRevision).toBe(2);
    expect(state.smartManagerPreparedActionCopies.size).toBe(1);
  });

  test('fresh AI finalization inserts an immutable revision, selects it by CAS, and records successful fresh usage', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await regeneratePreparedWinbackCopy._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
      expectedCopyRevision: 1,
    });
    const reserved = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    const result = await finalizePreparedWinbackGenerationInternal._handler(
      ctx,
      {
        preparedActionId: reserved._id,
        requestToken: reserved.generationRequestToken,
        requestBindingHash: reserved.generationRequestBindingHash,
        reservedResultRevision: reserved.generationReservedCopyRevision,
        actorUserId: reserved.generationActorUserId,
        outcome: 'ai_fresh',
        title: 'שמחים לראות אתכם',
        body: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
        providerAttempted: true,
        inputTokens: 12,
        outputTokens: 8,
      }
    );

    expect(result).toMatchObject({
      status: 'selected',
      revision: 3,
      provenance: 'ai_fresh',
    });
    const action = state.smartManagerPreparedActions.get(reserved._id);
    expect(action.selectedCopyRevision).toBe(3);
    expect(action.nextCopyRevision).toBe(4);
    expect(
      Array.from(state.smartManagerPreparedActionCopies.values()).map(
        (copy) => copy.revision
      )
    ).toEqual([1, 2, 3]);
    expect(state.aiUsageLedger.size).toBe(1);
    expect(Array.from(state.aiUsageLedger.values())[0]).toMatchObject({
      preparedActionId: reserved._id,
      requestType: 'smart_manager_copy_generation',
      cacheHit: false,
      status: 'success',
      inputTokens: 12,
      outputTokens: 8,
    });
    expect(state.aiGenerationCache.size).toBe(1);

    const review = await getPreparedWinbackReview._handler(ctx, {
      preparedActionId: reserved._id,
    });
    expect(review.message).toMatchObject({
      revision: 3,
      provenance: 'ai_fresh',
      generationVersion: 'smart-manager-winback-copy-v1',
      promptVersion: 'smart-manager-winback-prompt-v1',
    });
    expect(JSON.stringify(review)).not.toMatch(
      /customerIds|customerSamples|email|phone|pushToken/
    );
  });

  test('provider failure consumes no successful quota and leaves the selected fallback intact', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await regeneratePreparedWinbackCopy._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
      expectedCopyRevision: 1,
    });
    const reserved = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    const result = await finalizePreparedWinbackGenerationInternal._handler(
      ctx,
      {
        preparedActionId: reserved._id,
        requestToken: reserved.generationRequestToken,
        requestBindingHash: reserved.generationRequestBindingHash,
        reservedResultRevision: reserved.generationReservedCopyRevision,
        actorUserId: reserved.generationActorUserId,
        outcome: 'failed',
        failureCode: 'AI_PROVIDER_TIMEOUT',
        providerAttempted: true,
      }
    );

    expect(result).toEqual({
      status: 'failed',
      reason: 'AI_PROVIDER_TIMEOUT',
    });
    const action = state.smartManagerPreparedActions.get(reserved._id);
    expect(action.selectedCopyRevision).toBe(2);
    expect(action.nextCopyRevision).toBe(4);
    expect(action.generationState).toBe('failed');
    expect(state.smartManagerPreparedActionCopies.size).toBe(2);
    expect(Array.from(state.aiUsageLedger.values())[0]).toMatchObject({
      status: 'failed',
      cacheHit: false,
    });
  });

  test('valid cache selection uses the reserved immutable revision without fresh usage', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await regeneratePreparedWinbackCopy._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
      expectedCopyRevision: 1,
    });
    const reserved = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    const cacheKey = buildSmartManagerAiCacheKey({
      structuredInputHash: reserved.generationInputHash,
    });
    state.aiGenerationCache.set('cache_1', {
      _id: 'cache_1',
      cacheKey,
      promptHash: reserved.generationPromptHash,
      goal: 'winback_copy',
      model: OPENROUTER_JSON_MODEL,
      responseJson: {
        type: 'winback_copy',
        title: 'שמחים לראות אתכם',
        message: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
      },
      inputSignature: reserved.generationInputHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });

    const result = await finalizePreparedWinbackGenerationInternal._handler(
      ctx,
      {
        preparedActionId: reserved._id,
        requestToken: reserved.generationRequestToken,
        requestBindingHash: reserved.generationRequestBindingHash,
        reservedResultRevision: reserved.generationReservedCopyRevision,
        actorUserId: reserved.generationActorUserId,
        outcome: 'ai_cache',
        title: 'שמחים לראות אתכם',
        body: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
        cacheId: 'cache_1',
        providerAttempted: false,
      }
    );

    expect(result).toMatchObject({
      status: 'selected',
      revision: 3,
      provenance: 'ai_cache',
    });
    expect(state.aiUsageLedger.size).toBe(0);
    expect(state.smartManagerPreparedActionCopies.size).toBe(3);
    expect(
      typeof state.aiGenerationCache.get('cache_1').lastUsedAt
    ).toBe('number');
  });

  test('late selected-copy drift is stale-discarded without inserting the reserved revision', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await regeneratePreparedWinbackCopy._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
      expectedCopyRevision: 1,
    });
    const reserved = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    state.smartManagerPreparedActions.set(reserved._id, {
      ...reserved,
      selectedCopyRevision: 1,
    });

    const result = await finalizePreparedWinbackGenerationInternal._handler(
      ctx,
      {
        preparedActionId: reserved._id,
        requestToken: reserved.generationRequestToken,
        requestBindingHash: reserved.generationRequestBindingHash,
        reservedResultRevision: reserved.generationReservedCopyRevision,
        actorUserId: reserved.generationActorUserId,
        outcome: 'ai_fresh',
        title: 'שמחים לראות אתכם',
        body: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
        providerAttempted: true,
      }
    );

    expect(result).toEqual({ status: 'stale_discarded' });
    expect(
      state.smartManagerPreparedActions.get(reserved._id).generationState
    ).toBe('stale_discarded');
    expect(state.smartManagerPreparedActionCopies.size).toBe(2);
    expect(
      Array.from(state.smartManagerAuditEvents.values()).some(
        (event) => event.eventType === 'ai_generation_stale_discarded'
      )
    ).toBe(true);
  });

  test('late authority, expiry, supersession, or subscription drift cannot select AI', async () => {
    for (const drift of [
      'authority_generation',
      'expired',
      'superseded',
      'subscription',
    ]) {
      const { ctx, state } = buildCtx(
        buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
      );
      const prepared = await prepareWinbackAction._handler(ctx, {
        businessId: 'business_1',
        expectedEvidenceFingerprint: 'decision_evidence_v1',
      });
      await regeneratePreparedWinbackCopy._handler(ctx, {
        preparedActionId: prepared.preparedActionId,
        expectedCopyRevision: 1,
      });
      const reserved = state.smartManagerPreparedActions.get(
        prepared.preparedActionId
      );
      if (drift === 'authority_generation') {
        const evaluation = state.smartManagerEvaluationStates.get(
          'evaluation_1'
        );
        state.smartManagerEvaluationStates.set('evaluation_1', {
          ...evaluation,
          generation: 8,
          dirtyDomains: ['events'],
        });
      } else if (drift === 'subscription') {
        const business = state.businesses.get('business_1');
        state.businesses.set('business_1', {
          ...business,
          subscriptionStatus: 'inactive',
        });
      } else {
        state.smartManagerPreparedActions.set(reserved._id, {
          ...reserved,
          ...(drift === 'expired'
            ? { expiresAt: Date.now() - 1 }
            : { state: 'superseded', supersededAt: Date.now() }),
        });
      }

      const result =
        await finalizePreparedWinbackGenerationInternal._handler(ctx, {
          preparedActionId: reserved._id,
          requestToken: reserved.generationRequestToken,
          requestBindingHash: reserved.generationRequestBindingHash,
          reservedResultRevision: reserved.generationReservedCopyRevision,
          actorUserId: reserved.generationActorUserId,
          outcome: 'ai_fresh',
          title: 'שמחים לראות אתכם',
          body: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
          providerAttempted: true,
        });

      expect(result).toEqual({ status: 'stale_discarded' });
      expect(
        state.smartManagerPreparedActions.get(reserved._id).generationState
      ).toBe('stale_discarded');
      expect(state.smartManagerPreparedActionCopies.size).toBe(2);
      expect(
        Array.from(state.smartManagerPreparedActionCopies.values()).some(
          (copy) => copy.revision === 3
        )
      ).toBe(false);
    }
  });

  test('superseded exact request becomes stale_discarded without changing selected copy', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await regeneratePreparedWinbackCopy._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
      expectedCopyRevision: 1,
    });
    const reserved = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    const selectedCopyId = reserved.selectedCopyId;
    const selectedCopyRevision = reserved.selectedCopyRevision;
    state.smartManagerPreparedActions.set(reserved._id, {
      ...reserved,
      state: 'superseded',
      supersededAt: Date.now(),
    });

    const result = await finalizePreparedWinbackGenerationInternal._handler(
      ctx,
      {
        preparedActionId: reserved._id,
        requestToken: reserved.generationRequestToken,
        requestBindingHash: reserved.generationRequestBindingHash,
        reservedResultRevision: reserved.generationReservedCopyRevision,
        actorUserId: reserved.generationActorUserId,
        outcome: 'ai_fresh',
        title: 'שמחים לראות אתכם',
        body: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
        providerAttempted: true,
      }
    );

    const closed = state.smartManagerPreparedActions.get(reserved._id);
    expect(result).toEqual({ status: 'stale_discarded' });
    expect(closed.generationState).toBe('stale_discarded');
    expect(closed.generationRequestToken).toBe(reserved.generationRequestToken);
    expect(closed.selectedCopyId).toBe(selectedCopyId);
    expect(closed.selectedCopyRevision).toBe(selectedCopyRevision);
    expect(state.smartManagerPreparedActionCopies.size).toBe(2);
    expect(
      Array.from(state.smartManagerPreparedActionCopies.values()).some(
        (copy) => copy.revision === reserved.generationReservedCopyRevision
      )
    ).toBe(false);
  });

  test('expired exact request becomes stale_discarded without inserting a copy', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await regeneratePreparedWinbackCopy._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
      expectedCopyRevision: 1,
    });
    const reserved = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    const selectedCopyRevision = reserved.selectedCopyRevision;
    state.smartManagerPreparedActions.set(reserved._id, {
      ...reserved,
      expiresAt: Date.now() - 1,
    });

    const result = await finalizePreparedWinbackGenerationInternal._handler(
      ctx,
      {
        preparedActionId: reserved._id,
        requestToken: reserved.generationRequestToken,
        requestBindingHash: reserved.generationRequestBindingHash,
        reservedResultRevision: reserved.generationReservedCopyRevision,
        actorUserId: reserved.generationActorUserId,
        outcome: 'ai_fresh',
        title: 'שמחים לראות אתכם',
        body: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
        providerAttempted: true,
      }
    );

    const closed = state.smartManagerPreparedActions.get(reserved._id);
    expect(result).toEqual({ status: 'stale_discarded' });
    expect(closed.generationState).toBe('stale_discarded');
    expect(closed.selectedCopyRevision).toBe(selectedCopyRevision);
    expect(state.smartManagerPreparedActionCopies.size).toBe(2);
  });

  test('authority drift on the exact request becomes stale_discarded', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await regeneratePreparedWinbackCopy._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
      expectedCopyRevision: 1,
    });
    const reserved = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    const selectedCopyRevision = reserved.selectedCopyRevision;
    const evaluation = state.smartManagerEvaluationStates.get('evaluation_1');
    state.smartManagerEvaluationStates.set('evaluation_1', {
      ...evaluation,
      generation: 8,
      dirtyDomains: ['events'],
    });

    const result = await finalizePreparedWinbackGenerationInternal._handler(
      ctx,
      {
        preparedActionId: reserved._id,
        requestToken: reserved.generationRequestToken,
        requestBindingHash: reserved.generationRequestBindingHash,
        reservedResultRevision: reserved.generationReservedCopyRevision,
        actorUserId: reserved.generationActorUserId,
        outcome: 'ai_fresh',
        title: 'שמחים לראות אתכם',
        body: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
        providerAttempted: true,
      }
    );

    const closed = state.smartManagerPreparedActions.get(reserved._id);
    expect(result).toEqual({ status: 'stale_discarded' });
    expect(closed.generationState).toBe('stale_discarded');
    expect(closed.generationRequestToken).toBe(reserved.generationRequestToken);
    expect(closed.selectedCopyRevision).toBe(selectedCopyRevision);
    expect(state.smartManagerPreparedActionCopies.size).toBe(2);
  });

  test('active policy controls the fresh-AI audience minimum', async () => {
    const raised = buildCtx(
      buildFixture({
        subscriptionPlan: 'pro',
        audienceCount: 6,
        policyConfig: {
          ...SMART_MANAGER_POLICY_V1,
          aiGeneration: { minimumAudienceForFreshGeneration: 10 },
        },
      })
    );
    const raisedPrepared = await prepareWinbackAction._handler(raised.ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await expect(
      regeneratePreparedWinbackCopy._handler(raised.ctx, {
        preparedActionId: raisedPrepared.preparedActionId,
        expectedCopyRevision: 1,
      })
    ).rejects.toThrow('AI_FRESH_AUDIENCE_BELOW_MINIMUM');
    expect(raised.state.smartManagerPreparedActionCopies.size).toBe(1);

    const lowered = buildCtx(
      buildFixture({
        subscriptionPlan: 'pro',
        audienceCount: 4,
        policyConfig: {
          ...SMART_MANAGER_POLICY_V1,
          aiGeneration: { minimumAudienceForFreshGeneration: 3 },
        },
      })
    );
    const loweredPrepared = await prepareWinbackAction._handler(lowered.ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    const loweredResult = await regeneratePreparedWinbackCopy._handler(
      lowered.ctx,
      {
        preparedActionId: loweredPrepared.preparedActionId,
        expectedCopyRevision: 1,
      }
    );
    expect(loweredResult.copyRevision).toBe(2);
    expect(
      lowered.state.smartManagerPreparedActions.get(
        loweredPrepared.preparedActionId
      ).generationState
    ).toBe('queued');
  });

  test('initial prepare schedules exactly one AI request and exact reuse schedules none', async () => {
    const scheduled = [];
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 }),
      { scheduled }
    );
    const args = {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    };
    const created = await prepareWinbackAction._handler(ctx, args);
    const first = state.smartManagerPreparedActions.get(created.preparedActionId);
    expect(created.reused).toBe(false);
    expect(first.generationState).toBe('queued');
    expect(first.generationReservedCopyRevision).toBe(2);
    expect(first.nextCopyRevision).toBe(3);
    expect(scheduled).toHaveLength(1);

    const reused = await prepareWinbackAction._handler(ctx, args);
    const second = state.smartManagerPreparedActions.get(
      created.preparedActionId
    );
    expect(reused.reused).toBe(true);
    expect(reused.preparedActionId).toBe(created.preparedActionId);
    expect(scheduled).toHaveLength(1);
    expect(second.generationRequestToken).toBe(first.generationRequestToken);
    expect(second.generationReservedCopyRevision).toBe(2);
    expect(second.nextCopyRevision).toBe(3);
    expect(state.smartManagerPreparedActions.size).toBe(1);
  });

  test('duplicate in-flight generation is blocked without allocating another revision', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await regeneratePreparedWinbackCopy._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
      expectedCopyRevision: 1,
    });
    const reserved = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    await expect(
      regeneratePreparedWinbackCopy._handler(ctx, {
        preparedActionId: prepared.preparedActionId,
        expectedCopyRevision: reserved.selectedCopyRevision,
      })
    ).rejects.toThrow('AI_GENERATION_IN_PROGRESS');
    expect(
      state.smartManagerPreparedActions.get(prepared.preparedActionId)
    ).toMatchObject({
      selectedCopyRevision: reserved.selectedCopyRevision,
      nextCopyRevision: reserved.nextCopyRevision,
      generationRequestToken: reserved.generationRequestToken,
      generationReservedCopyRevision: reserved.generationReservedCopyRevision,
    });
    expect(state.smartManagerPreparedActionCopies.size).toBe(2);
  });

  test('stale request cannot terminate a newer request', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await regeneratePreparedWinbackCopy._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
      expectedCopyRevision: 1,
    });
    const requestA = {
      ...state.smartManagerPreparedActions.get(prepared.preparedActionId),
    };
    state.smartManagerPreparedActions.set(requestA._id, {
      ...requestA,
      generationState: 'queued',
      generationRequestToken: 'request_b_token',
      generationRequestBindingHash: 'request_b_binding',
      generationReservedCopyRevision: 5,
      generationActorUserId: requestA.generationActorUserId,
      selectedCopyRevision: requestA.selectedCopyRevision,
      nextCopyRevision: 6,
    });

    const result = await finalizePreparedWinbackGenerationInternal._handler(
      ctx,
      {
        preparedActionId: requestA._id,
        requestToken: requestA.generationRequestToken,
        requestBindingHash: requestA.generationRequestBindingHash,
        reservedResultRevision: requestA.generationReservedCopyRevision,
        actorUserId: requestA.generationActorUserId,
        outcome: 'ai_fresh',
        title: 'שמחים לראות אתכם',
        body: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
        providerAttempted: true,
      }
    );

    const requestB = state.smartManagerPreparedActions.get(requestA._id);
    expect(result).toEqual({ status: 'stale_discarded' });
    expect(requestB.generationState).toBe('queued');
    expect(requestB.generationRequestToken).toBe('request_b_token');
    expect(requestB.generationReservedCopyRevision).toBe(5);
    expect(requestB.selectedCopyRevision).toBe(requestA.selectedCopyRevision);
    expect(
      Array.from(state.smartManagerPreparedActionCopies.values()).some(
        (copy) => copy.revision === requestA.generationReservedCopyRevision
      )
    ).toBe(false);
  });

  test('expired cache can be refreshed without leaving a duplicate row', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    await regeneratePreparedWinbackCopy._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
      expectedCopyRevision: 1,
    });
    const reserved = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    const now = Date.now();
    const cacheKey = buildSmartManagerAiCacheKey({
      structuredInputHash: reserved.generationInputHash,
    });
    state.aiGenerationCache.set('cache_1', {
      _id: 'cache_1',
      cacheKey,
      promptHash: reserved.generationPromptHash,
      goal: 'winback_copy',
      model: OPENROUTER_JSON_MODEL,
      responseJson: {
        type: 'winback_copy',
        title: 'שמחים לראות אתכם',
        message: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
      },
      inputSignature: reserved.generationInputHash,
      createdAt: now - 2,
      expiresAt: now - 1,
    });

    const result = await finalizePreparedWinbackGenerationInternal._handler(
      ctx,
      {
        preparedActionId: reserved._id,
        requestToken: reserved.generationRequestToken,
        requestBindingHash: reserved.generationRequestBindingHash,
        reservedResultRevision: reserved.generationReservedCopyRevision,
        actorUserId: reserved.generationActorUserId,
        outcome: 'ai_fresh',
        title: 'שמחים לראות אתכם',
        body: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
        providerAttempted: true,
        inputTokens: 12,
        outputTokens: 8,
      }
    );

    expect(result).toMatchObject({
      status: 'selected',
      revision: 3,
      provenance: 'ai_fresh',
    });
    expect(state.aiGenerationCache.size).toBe(1);
    const refreshed = state.aiGenerationCache.get('cache_1');
    expect(refreshed.expiresAt).toBeGreaterThan(now);
    expect(refreshed.responseJson.title).toBe('שמחים לראות אתכם');
    expect(
      state.smartManagerPreparedActions.get(reserved._id).generationState
    ).toBe('succeeded');
  });

  test('valid cache can be used despite fresh quota exhaustion and below the fresh-AI minimum', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 3 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    const action = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    const structuredInput = buildSmartManagerWinbackStructuredInput({
      audienceCount: action.audienceCount,
      recipientCeiling: action.recipientCeiling,
    });
    const structuredInputHash =
      buildSmartManagerStructuredInputHash(structuredInput);
    const promptHash = hashSmartManagerWinbackPrompt(
      buildSmartManagerWinbackPrompt(structuredInput)
    );
    const cacheKey = buildSmartManagerAiCacheKey({ structuredInputHash });
    state.aiGenerationCache.set('cache_1', {
      _id: 'cache_1',
      cacheKey,
      promptHash,
      goal: 'winback_copy',
      model: OPENROUTER_JSON_MODEL,
      responseJson: {
        type: 'winback_copy',
        title: 'שמחים לראות אתכם',
        message: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
      },
      inputSignature: structuredInputHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    const monthKey = monthKeyFromTimestamp(Date.now());
    for (let index = 0; index < 100; index += 1) {
      state.aiUsageLedger.set(`usage_${index}`, {
        _id: `usage_${index}`,
        businessId: 'business_1',
        monthKey,
        requestType: 'smart_manager_copy_generation',
        model: OPENROUTER_JSON_MODEL,
        cacheHit: false,
        status: 'success',
        createdAt: Date.now(),
      });
    }

    const regenerated = await regeneratePreparedWinbackCopy._handler(ctx, {
      preparedActionId: prepared.preparedActionId,
      expectedCopyRevision: 1,
    });
    expect(regenerated.copyRevision).toBe(2);
    const reserved = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    const result = await finalizePreparedWinbackGenerationInternal._handler(
      ctx,
      {
        preparedActionId: reserved._id,
        requestToken: reserved.generationRequestToken,
        requestBindingHash: reserved.generationRequestBindingHash,
        reservedResultRevision: reserved.generationReservedCopyRevision,
        actorUserId: reserved.generationActorUserId,
        outcome: 'ai_cache',
        title: 'שמחים לראות אתכם',
        body: 'התגעגענו אליכם ונשמח לקבל את פניכם בביקור הבא',
        cacheId: 'cache_1',
        providerAttempted: false,
      }
    );
    expect(result).toMatchObject({
      status: 'selected',
      provenance: 'ai_cache',
    });
    expect(state.aiUsageLedger.size).toBe(100);
  });

  test('rate-limit rejection allocates no revision and does not change selected copy', async () => {
    const { ctx, state } = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 })
    );
    const prepared = await prepareWinbackAction._handler(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    ctx.runMutation = async () => ({ ok: false, retryAfter: 10_000 });
    await expect(
      regeneratePreparedWinbackCopy._handler(ctx, {
        preparedActionId: prepared.preparedActionId,
        expectedCopyRevision: 1,
      })
    ).rejects.toThrow('AI_RATE_LIMITED');
    const action = state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    expect(action.selectedCopyRevision).toBe(1);
    expect(action.nextCopyRevision).toBe(2);
    expect(action.generationState).toBe('not_requested');
    expect(state.smartManagerPreparedActionCopies.size).toBe(1);
  });

  test('post-evaluation reconciliation preserves exact bindings and stales an older active generation once', async () => {
    const owner = buildCtx(
      buildFixture({ subscriptionPlan: 'pro', audienceCount: 12 }),
      { scheduled: [] }
    );
    const prepared = await prepareWinbackAction._handler(owner.ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    const action = owner.state.smartManagerPreparedActions.get(
      prepared.preparedActionId
    );
    const selectedCopyId = action.selectedCopyId;
    const auditCount = owner.state.smartManagerAuditEvents.size;

    expect(
      await reconcileCurrentPreparedWinbackAfterEvaluation(owner.ctx, {
        businessId: 'business_1',
        now: OBSERVED_AT + 1,
      })
    ).toEqual({ status: 'current' });
    expect(owner.state.smartManagerAuditEvents.size).toBe(auditCount);

    const evaluationState = owner.state.smartManagerEvaluationStates.get(
      'evaluation_1'
    );
    owner.state.smartManagerEvaluationStates.set('evaluation_1', {
      ...evaluationState,
      generation: 8,
      lastSuccessfulGeneration: 8,
      dirtyDomains: [],
      dirtyReasons: [],
    });
    const facts = owner.state.smartManagerFactSnapshots.get('facts_1');
    owner.state.smartManagerFactSnapshots.set('facts_1', {
      ...facts,
      sourceGeneration: 8,
      sourceWatermark: 'generation:8',
    });
    const decision = owner.state.smartManagerDecisions.get('decision_1');
    owner.state.smartManagerDecisions.set('decision_1', {
      ...decision,
      sourceGeneration: 8,
    });
    const comparison = owner.state.smartManagerShadowComparisons.get(
      'comparison_1'
    );
    owner.state.smartManagerShadowComparisons.set('comparison_1', {
      ...comparison,
      sourceGeneration: 8,
    });

    const staled = await reconcileCurrentPreparedWinbackAfterEvaluation(
      owner.ctx,
      { businessId: 'business_1', now: OBSERVED_AT + 2 }
    );
    expect(staled).toMatchObject({
      status: 'staled',
      reason: 'ACTION_AUTHORITY_BINDING_CHANGED',
      generationRequestDiscarded: true,
    });
    expect(owner.state.smartManagerPreparedActions.get(action._id)).toMatchObject({
      state: 'stale',
      generationState: 'stale_discarded',
      generationFailureCode: 'ACTION_STALE',
      selectedCopyId,
    });
    expect(owner.state.smartManagerPreparedActionCopies.size).toBe(1);
    expect(
      Array.from(owner.state.smartManagerAuditEvents.values()).filter(
        (event) => event.eventType === 'prepared_action_stale'
      )
    ).toHaveLength(1);

    expect(
      await reconcileCurrentPreparedWinbackAfterEvaluation(owner.ctx, {
        businessId: 'business_1',
        now: OBSERVED_AT + 3,
      })
    ).toEqual({ status: 'no_current_singleton' });
    expect(
      Array.from(owner.state.smartManagerAuditEvents.values()).filter(
        (event) => event.eventType === 'prepared_action_stale'
      )
    ).toHaveLength(1);
  });

  test('post-evaluation reconciliation stales disappeared decisions and changed audience bindings', async () => {
    const disappeared = buildCtx(buildFixture());
    const prepared = await prepareWinbackAction._handler(disappeared.ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
    });
    const decision = disappeared.state.smartManagerDecisions.get('decision_1');
    disappeared.state.smartManagerDecisions.set('decision_1', {
      ...decision,
      state: 'shadow_inactive',
    });
    expect(
      await reconcileCurrentPreparedWinbackAfterEvaluation(disappeared.ctx, {
        businessId: 'business_1',
        now: OBSERVED_AT + 1,
      })
    ).toMatchObject({ status: 'staled', reason: 'DECISION_INACTIVE' });
    expect(
      disappeared.state.smartManagerPreparedActions.get(
        prepared.preparedActionId
      ).state
    ).toBe('stale');

    const audienceChanged = buildCtx(buildFixture());
    const audiencePrepared = await prepareWinbackAction._handler(
      audienceChanged.ctx,
      {
        businessId: 'business_1',
        expectedEvidenceFingerprint: 'decision_evidence_v1',
      }
    );
    const audienceAction = audienceChanged.state.smartManagerPreparedActions.get(
      audiencePrepared.preparedActionId
    );
    audienceChanged.state.smartManagerPreparedActions.set(audienceAction._id, {
      ...audienceAction,
      audienceCount: audienceAction.audienceCount + 1,
      lifecycleSourceFingerprint: 'lifecycle_source_old',
    });
    expect(
      await reconcileCurrentPreparedWinbackAfterEvaluation(audienceChanged.ctx, {
        businessId: 'business_1',
        now: OBSERVED_AT + 1,
      })
    ).toMatchObject({
      status: 'staled',
      reason: 'ACTION_AUDIENCE_BINDING_CHANGED',
    });
  });

  test('retention cleanup never commits a dangling selected copy across continuation boundaries', async () => {
    const fixture = buildFixture();
    fixture.tables.smartManagerPreparedActions = [
      {
        _id: 'parent_retained',
        selectedCopyId: 'selected_retained',
        retentionExpiresAt: Date.now() + 60_000,
        expiresAt: 0,
      },
      {
        _id: 'parent_expired',
        selectedCopyId: 'selected_expired',
        retentionExpiresAt: 0,
        expiresAt: 0,
      },
    ];
    fixture.tables.smartManagerPreparedActionCopies = [
      {
        _id: 'selected_retained',
        preparedActionId: 'parent_retained',
        retentionExpiresAt: 0,
      },
      {
        _id: 'selected_expired',
        preparedActionId: 'parent_expired',
        retentionExpiresAt: 0,
      },
      {
        _id: 'orphan_expired',
        preparedActionId: 'missing_parent',
        retentionExpiresAt: 0,
      },
    ];
    const { ctx, state, scheduled } = buildCtx(fixture, { scheduled: [] });
    const assertSelectedCopiesResolve = () => {
      for (const action of state.smartManagerPreparedActions.values()) {
        if (action.selectedCopyId) {
          expect(
            state.smartManagerPreparedActionCopies.has(action.selectedCopyId)
          ).toBe(true);
        }
      }
    };

    const copiesResult =
      await cleanupPreparedActionRetentionInternal._handler(ctx, {
        limit: 100,
        phase: 'copies',
        cursor: null,
      });

    expect(copiesResult).toMatchObject({
      phase: 'copies',
      copiesDeleted: 1,
      retainedCopies: 2,
      nextPhase: 'actions',
      continuationScheduled: true,
    });
    expect(state.smartManagerPreparedActions.has('parent_retained')).toBe(true);
    expect(state.smartManagerPreparedActionCopies.has('selected_retained')).toBe(
      true
    );
    expect(state.smartManagerPreparedActionCopies.has('orphan_expired')).toBe(
      false
    );
    expect(state.smartManagerPreparedActions.has('parent_expired')).toBe(true);
    expect(state.smartManagerPreparedActionCopies.has('selected_expired')).toBe(
      true
    );
    assertSelectedCopiesResolve();

    const actionContinuation = scheduled.find(
      (job) => job.args.phase === 'actions'
    );
    expect(actionContinuation).toBeDefined();
    const actionsResult =
      await cleanupPreparedActionRetentionInternal._handler(
        ctx,
        actionContinuation.args
      );

    expect(actionsResult).toMatchObject({
      phase: 'actions',
      copiesDeleted: 1,
      actionsDeleted: 1,
    });
    expect(state.smartManagerPreparedActions.has('parent_expired')).toBe(false);
    expect(state.smartManagerPreparedActionCopies.has('selected_expired')).toBe(
      false
    );
    expect(state.smartManagerPreparedActions.has('parent_retained')).toBe(true);
    expect(state.smartManagerPreparedActionCopies.has('selected_retained')).toBe(
      true
    );
    assertSelectedCopiesResolve();
  });

  test('retention cleanup is bounded, child-first, resumable, and uses retentionExpiresAt', async () => {
    const fixture = buildFixture();
    fixture.tables.smartManagerPreparedActions = [
      {
        _id: 'action_expired',
        retentionExpiresAt: 0,
        expiresAt: 0,
      },
      {
        _id: 'action_blocked',
        retentionExpiresAt: 0,
        expiresAt: 0,
      },
      {
        _id: 'action_review_expired_only',
        retentionExpiresAt: Date.now() + 60_000,
        expiresAt: 0,
      },
    ];
    fixture.tables.smartManagerPreparedActionCopies = [
      {
        _id: 'copy_expired',
        preparedActionId: 'action_expired',
        retentionExpiresAt: 0,
      },
      {
        _id: 'copy_retained',
        preparedActionId: 'action_blocked',
        retentionExpiresAt: Date.now() + 60_000,
      },
      ...Array.from({ length: 100 }, (_, index) => ({
        _id: `copy_page_${index}`,
        preparedActionId: `historical_${index}`,
        retentionExpiresAt: 0,
      })),
    ];
    const { ctx, state, reads } = buildCtx(fixture, { scheduled: [] });

    const first = await cleanupPreparedActionRetentionInternal._handler(ctx, {
      limit: 10_000,
      phase: 'copies',
      cursor: null,
    });
    expect(first).toMatchObject({ phase: 'copies', examined: 100 });
    expect(
      reads.some(
        (read) => read.kind === 'paginate' && read.limit === 100
      )
    ).toBe(true);
    expect(state.smartManagerPreparedActionCopies.size).toBe(2);

    await cleanupPreparedActionRetentionInternal._handler(ctx, {
      limit: 100,
      phase: 'copies',
      cursor: null,
    });
    expect(state.smartManagerPreparedActionCopies.has('copy_expired')).toBe(false);
    expect(state.smartManagerPreparedActionCopies.has('copy_retained')).toBe(true);

    const actions = await cleanupPreparedActionRetentionInternal._handler(ctx, {
      limit: 100,
      phase: 'actions',
      cursor: null,
    });
    expect(actions).toMatchObject({ actionsDeleted: 1, retainedParents: 1 });
    expect(state.smartManagerPreparedActions.has('action_expired')).toBe(false);
    expect(state.smartManagerPreparedActions.has('action_blocked')).toBe(true);
    expect(
      state.smartManagerPreparedActions.has('action_review_expired_only')
    ).toBe(true);

    state.smartManagerPreparedActionCopies.set('copy_retained', {
      ...state.smartManagerPreparedActionCopies.get('copy_retained'),
      retentionExpiresAt: 0,
    });
    await cleanupPreparedActionRetentionInternal._handler(ctx, {
      phase: 'copies',
      cursor: null,
    });
    await cleanupPreparedActionRetentionInternal._handler(ctx, {
      phase: 'actions',
      cursor: null,
    });
    expect(state.smartManagerPreparedActions.has('action_blocked')).toBe(false);
  });
});
