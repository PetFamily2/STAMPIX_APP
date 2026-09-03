import { describe, expect, test } from 'bun:test';

import {
  buildAuthorityComparisonHash,
  buildAuthorityDecisionHash,
  buildAuthorityFactHash,
  resolveSmartManagerDecisionAuthority,
  SMART_MANAGER_ACTIVE_AUTHORITY_MODE,
} from '../lib/smartManagerAuthority';
import {
  SMART_MANAGER_POLICY_V1,
  SMART_MANAGER_POLICY_V1_HASH,
  SMART_MANAGER_POLICY_V1_VERSION,
} from '../lib/smartManagerPolicy';

const NOW = 1_800_000_000_000;

class FakeQuery {
  constructor(rows, reads) {
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
    this.reads.push({ kind: 'index', name });
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
    this.reads.push({ kind: 'first' });
    return this.rows()[0] ?? null;
  }

  async take(limit) {
    this.reads.push({ kind: 'take', limit });
    return this.rows().slice(0, limit);
  }

  async collect() {
    throw new Error('UNBOUNDED_COLLECT_FORBIDDEN');
  }
}

function buildAuthorityFixture(overrides = {}) {
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
    evidenceObservedAt: NOW,
    count: 1,
    requiredCapabilities: ['access_customers'],
    access: { state: 'allowed' },
  };
  const factEnvelope = {
    schemaVersion: 1,
    businessId: 'business_1',
    generatedAt: NOW,
    facts: {
      campaignQuota: {
        state: 'known',
        observedAt: NOW,
        value: {
          campaignDefinitionUsage: 0,
          campaignDefinitionLimit: 1,
          remainingDefinitions: 1,
          isAtOrAboveLimit: false,
        },
      },
      customerLifecycleSegments: {
        inactive: {
          state: 'known',
          observedAt: NOW,
          value: {
            count: 1,
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
    policyHash: SMART_MANAGER_POLICY_V1_HASH,
    status: 'parity',
    canonicalSummary,
    liveSummary,
    differences: [],
  });
  const tables = {
    businesses: [
      {
        _id: 'business_1',
        ownerUserId: 'owner_1',
        externalId: 'business_external_1',
        name: 'Business',
        subscriptionPlan: 'starter',
        subscriptionStatus: 'active',
        isActive: true,
        createdAt: NOW - 10_000,
        updatedAt: NOW,
      },
    ],
    smartManagerPolicyVersions: [],
    smartManagerEvaluationStates: [
      {
        _id: 'evaluation_1',
        businessId: 'business_1',
        dirtyDomains: [],
        dirtyReasons: [],
        generation: 7,
        lastSuccessfulGeneration: 7,
        lastFactHash: factHash,
        updatedAt: NOW,
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
        updatedAt: NOW,
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
        evidenceObservedAt: NOW,
        policyVersion: SMART_MANAGER_POLICY_V1_VERSION,
        policyHash: SMART_MANAGER_POLICY_V1_HASH,
        decision: decisionSummary,
        updatedAt: NOW,
      },
    ],
    smartManagerShadowComparisons: [
      {
        _id: 'comparison_1',
        businessId: 'business_1',
        sourceGeneration: 7,
        factHash,
        policyVersion: SMART_MANAGER_POLICY_V1_VERSION,
        policyHash: SMART_MANAGER_POLICY_V1_HASH,
        comparisonHash,
        status: 'parity',
        canonicalSummary,
        liveSummary,
        differences: [],
        updatedAt: NOW,
      },
    ],
  };
  for (const [tableName, rows] of Object.entries(overrides)) {
    tables[tableName] = rows;
  }
  return tables;
}

function buildCtx(tables) {
  const reads = [];
  return {
    reads,
    db: {
      get: async (id) =>
        Object.values(tables)
          .flat()
          .find((row) => row._id === id) ?? null,
      query: (tableName) => {
        reads.push({ kind: 'query', tableName });
        return new FakeQuery(tables[tableName] ?? [], reads);
      },
    },
  };
}

function rebindFixtureHashes(tables) {
  const factSnapshot = tables.smartManagerFactSnapshots[0];
  const evaluation = tables.smartManagerEvaluationStates[0];
  const decision = tables.smartManagerDecisions[0];
  const comparison = tables.smartManagerShadowComparisons[0];
  const factHash = buildAuthorityFactHash(factSnapshot.facts);
  const decisionHash = buildAuthorityDecisionHash(decision.decision);
  const canonicalSummary = {
    ...comparison.canonicalSummary,
    recommendations: [structuredClone(decision.decision)],
  };
  const liveSummary = structuredClone(canonicalSummary);

  factSnapshot.factHash = factHash;
  evaluation.lastFactHash = factHash;
  decision.factHash = factHash;
  decision.decisionHash = decisionHash;
  comparison.factHash = factHash;
  comparison.canonicalSummary = canonicalSummary;
  comparison.liveSummary = liveSummary;
  comparison.comparisonHash = buildAuthorityComparisonHash({
    factHash,
    policyHash: comparison.policyHash,
    status: comparison.status,
    canonicalSummary,
    liveSummary,
    differences: comparison.differences,
  });
}

describe('Smart Manager decision authority', () => {
  test('resolves a parity-confirmed one-customer win-back decision', async () => {
    const ctx = buildCtx(buildAuthorityFixture());
    const result = await resolveSmartManagerDecisionAuthority(ctx, {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'decision_evidence_v1',
      now: NOW,
    });

    expect(result.authorityMode).toBe('shadow_parity_v1');
    expect(SMART_MANAGER_ACTIVE_AUTHORITY_MODE).toBe('shadow_parity_v1');
    expect(result.currentness).toBe('current');
    expect(result.blockers).toEqual([]);
    expect(result.lifecycleEvidence).toEqual({
      audienceCount: 1,
      lifecycleSourceFingerprint: 'lifecycle_source_v1',
      observedAt: NOW,
    });
    expect(result.authorityBindingHash).toMatch(/^sm_sha256_/);
    expect(ctx.reads.some((read) => read.kind === 'collect')).toBe(false);
    expect(
      ctx.reads.filter((read) => read.kind === 'take').every((read) => read.limit === 2)
    ).toBe(true);
  });

  test('dirty domains immediately produce reevaluation_pending', async () => {
    const tables = buildAuthorityFixture();
    tables.smartManagerEvaluationStates[0].dirtyDomains = ['campaigns'];
    const result = await resolveSmartManagerDecisionAuthority(buildCtx(tables), {
      businessId: 'business_1',
      now: NOW,
    });

    expect(result.currentness).toBe('reevaluation_pending');
    expect(result.blockers).toContain('REEVALUATION_PENDING');
  });

  test('fails closed when parity or expected evidence changes', async () => {
    const tables = buildAuthorityFixture();
    tables.smartManagerShadowComparisons[0].status = 'mismatch';
    const result = await resolveSmartManagerDecisionAuthority(buildCtx(tables), {
      businessId: 'business_1',
      expectedEvidenceFingerprint: 'different_evidence',
      now: NOW,
    });

    expect(result.currentness).toBe('stale');
    expect(result.blockers).toContain('COMPARISON_NOT_PARITY');
    expect(result.blockers).toContain('EVIDENCE_FINGERPRINT_MISMATCH');
  });

  test('expires evidence using the immutable active policy', async () => {
    const result = await resolveSmartManagerDecisionAuthority(
      buildCtx(buildAuthorityFixture()),
      {
        businessId: 'business_1',
        now: NOW + SMART_MANAGER_POLICY_V1.actionExpiryHours * 60 * 60 * 1000,
      }
    );

    expect(result.currentness).toBe('expired');
    expect(result.blockers).toContain('EVIDENCE_EXPIRED');
  });

  test('fails closed when a bounded singleton has duplicate rows', async () => {
    const cases = [
      ['smartManagerDecisions', 'DECISION_AMBIGUOUS'],
      ['smartManagerEvaluationStates', 'EVALUATION_AMBIGUOUS'],
      ['smartManagerFactSnapshots', 'FACT_SNAPSHOT_AMBIGUOUS'],
      ['smartManagerShadowComparisons', 'COMPARISON_AMBIGUOUS'],
    ];

    for (const [tableName, blocker] of cases) {
      const tables = buildAuthorityFixture();
      tables[tableName].push({
        ...structuredClone(tables[tableName][0]),
        _id: `${tableName}_duplicate`,
      });

      const result = await resolveSmartManagerDecisionAuthority(
        buildCtx(tables),
        {
          businessId: 'business_1',
          now: NOW,
        }
      );

      expect(result.currentness).toBe('stale');
      expect(result.blockers).toContain(blocker);
    }
  });

  test('fails closed on a recomputed fact-hash mismatch', async () => {
    const tables = buildAuthorityFixture();
    tables.smartManagerFactSnapshots[0].facts.facts.customerLifecycleSegments.inactive.value.count =
      2;

    const result = await resolveSmartManagerDecisionAuthority(buildCtx(tables), {
      businessId: 'business_1',
      now: NOW,
    });

    expect(result.currentness).toBe('stale');
    expect(result.blockers).toContain('FACT_SNAPSHOT_BINDING_MISMATCH');
  });

  test('fails closed on a persisted decision-hash mismatch', async () => {
    const tables = buildAuthorityFixture();
    tables.smartManagerDecisions[0].decisionHash = 'tampered_decision_hash';

    const result = await resolveSmartManagerDecisionAuthority(buildCtx(tables), {
      businessId: 'business_1',
      now: NOW,
    });

    expect(result.currentness).toBe('stale');
    expect(result.blockers).toContain('DECISION_HASH_MISMATCH');
  });

  test('fails closed on comparison hash and generation binding mismatches', async () => {
    const tables = buildAuthorityFixture();
    tables.smartManagerShadowComparisons[0].comparisonHash =
      'tampered_comparison_hash';
    tables.smartManagerShadowComparisons[0].sourceGeneration = 6;

    const result = await resolveSmartManagerDecisionAuthority(buildCtx(tables), {
      businessId: 'business_1',
      now: NOW,
    });

    expect(result.currentness).toBe('stale');
    expect(result.blockers).toContain('COMPARISON_HASH_MISMATCH');
    expect(result.blockers).toContain('COMPARISON_BINDING_MISMATCH');
  });

  test('fails closed when evaluation generation is not successful generation', async () => {
    const tables = buildAuthorityFixture();
    tables.smartManagerEvaluationStates[0].generation = 8;

    const result = await resolveSmartManagerDecisionAuthority(buildCtx(tables), {
      businessId: 'business_1',
      now: NOW,
    });

    expect(result.currentness).toBe('stale');
    expect(result.blockers).toContain('EVALUATION_GENERATION_MISMATCH');
  });

  test('fails closed when the decision policy is not the active policy', async () => {
    const tables = buildAuthorityFixture();
    tables.smartManagerDecisions[0].policyVersion = 'smart-manager-policy-v0';
    tables.smartManagerDecisions[0].policyHash = 'old_policy_hash';

    const result = await resolveSmartManagerDecisionAuthority(buildCtx(tables), {
      businessId: 'business_1',
      now: NOW,
    });

    expect(result.currentness).toBe('stale');
    expect(result.blockers).toContain('POLICY_BINDING_MISMATCH');
  });

  test('fails closed when inactive lifecycle evidence is unavailable', async () => {
    const tables = buildAuthorityFixture();
    tables.smartManagerFactSnapshots[0].facts.facts.customerLifecycleSegments.inactive =
      {
        state: 'unknown',
        reasonCode: 'BOUNDED_SOURCE_UNAVAILABLE',
      };
    rebindFixtureHashes(tables);

    const result = await resolveSmartManagerDecisionAuthority(buildCtx(tables), {
      businessId: 'business_1',
      now: NOW,
    });

    expect(result.currentness).toBe('stale');
    expect(result.blockers).toContain('LIFECYCLE_EVIDENCE_UNAVAILABLE');
  });

  test('fails closed when the inactive audience count is zero', async () => {
    const tables = buildAuthorityFixture();
    tables.smartManagerFactSnapshots[0].facts.facts.customerLifecycleSegments.inactive.value.count =
      0;
    tables.smartManagerDecisions[0].decision.count = 0;
    rebindFixtureHashes(tables);

    const result = await resolveSmartManagerDecisionAuthority(buildCtx(tables), {
      businessId: 'business_1',
      now: NOW,
    });

    expect(result.currentness).toBe('stale');
    expect(result.blockers).toContain('LIFECYCLE_AUDIENCE_INVALID');
    expect(result.lifecycleEvidence).toBeNull();
  });
});
