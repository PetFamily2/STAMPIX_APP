import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  approvePreparedWinbackAction,
  materializeApprovedRunInternal,
} from '../smartManagerExecution';
import {
  buildAuthorityComparisonHash,
  buildAuthorityDecisionHash,
  buildAuthorityFactHash,
} from '../lib/smartManagerAuthority';
import {
  buildPreparedActionCopyContentHash,
  buildPreparedWinbackPreparationKey,
  SMART_MANAGER_FALLBACK_GENERATION_VERSION,
  SMART_MANAGER_WINBACK_CAMPAIGN_DRAFT,
  SMART_MANAGER_WINBACK_CHANNEL_STRATEGY,
} from '../lib/smartManagerPreparedActions';
import {
  buildSmartManagerApprovalKey,
  buildSmartManagerRecipientBindingHash,
  buildSmartManagerRecipientSetHash,
  SMART_MANAGER_MATERIALIZATION_BATCH_SIZE,
  SMART_MANAGER_RECIPIENT_EVENT_LIMIT,
} from '../lib/smartManagerExecution';
import {
  hashSmartManagerValue,
  SMART_MANAGER_POLICY_V1_HASH,
  SMART_MANAGER_POLICY_V1_VERSION,
} from '../lib/smartManagerPolicy';
import { buildCustomerSegmentFacts } from '../recommendations';
import { buildCanonicalBusinessBillingAccount } from './helpers/businessBillingFixtures';

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

class FakeQuery {
  constructor(db, table, predicates = [], index = null, direction = 'asc') {
    this.db = db;
    this.table = table;
    this.predicates = predicates;
    this.index = index;
    this.direction = direction;
  }

  withIndex(index, builder) {
    const predicates = [...this.predicates];
    const q = {
      eq: (field, value) => {
        predicates.push((row) => row[field] === value);
        return q;
      },
      lte: (field, value) => {
        predicates.push((row) => row[field] <= value);
        return q;
      },
      gte: (field, value) => {
        predicates.push((row) => row[field] >= value);
        return q;
      },
    };
    builder(q);
    this.db.reads.push({ kind: 'index', table: this.table, index });
    return new FakeQuery(this.db, this.table, predicates, index, this.direction);
  }

  filter(builder) {
    const q = {
      field: (field) => field,
      eq: (field, value) => (row) => row[field] === value,
      neq: (field, value) => (row) => row[field] !== value,
      and: (...predicates) => (row) =>
        predicates.every((predicate) => predicate(row)),
    };
    return new FakeQuery(
      this.db,
      this.table,
      [...this.predicates, builder(q)],
      this.index,
      this.direction
    );
  }

  order(direction) {
    return new FakeQuery(
      this.db,
      this.table,
      this.predicates,
      this.index,
      direction
    );
  }

  rows() {
    const rows = this.db
      .rows(this.table)
      .filter((row) => this.predicates.every((predicate) => predicate(row)));
    if (this.index === 'by_businessId_createdAt') {
      rows.sort(
        (left, right) =>
          left.createdAt - right.createdAt || left._id.localeCompare(right._id)
      );
    } else if (this.index === 'by_campaignRunId_recipientKey') {
      rows.sort((left, right) =>
        left.recipientKey.localeCompare(right.recipientKey)
      );
    } else if (this.index === 'by_campaignRunId_recipientBindingHash') {
      rows.sort((left, right) =>
        left.recipientBindingHash.localeCompare(right.recipientBindingHash)
      );
    }
    return this.direction === 'desc' ? rows.reverse() : rows;
  }

  async first() {
    this.db.reads.push({ kind: 'first', table: this.table });
    return this.rows()[0] ?? null;
  }

  async take(limit) {
    this.db.reads.push({ kind: 'take', table: this.table, limit });
    return this.rows().slice(0, limit);
  }

  async paginate({ cursor, numItems }) {
    this.db.reads.push({ kind: 'paginate', table: this.table, limit: numItems });
    const rows = this.rows();
    const start = cursor === null ? 0 : Number(cursor);
    const end = Math.min(rows.length, start + numItems);
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

class FakeDb {
  constructor(tables) {
    this.tables = Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [
        name,
        new Map(rows.map((row) => [row._id, structuredClone(row)])),
      ])
    );
    this.reads = [];
    this.inserts = {};
  }

  rows(table) {
    return [...(this.tables[table]?.values() ?? [])];
  }

  query(table) {
    this.reads.push({ kind: 'query', table });
    return new FakeQuery(this, table);
  }

  async get(id) {
    for (const table of Object.values(this.tables)) {
      if (table.has(id)) {
        return table.get(id);
      }
    }
    return null;
  }

  async insert(table, value) {
    if (!this.tables[table]) {
      this.tables[table] = new Map();
    }
    this.inserts[table] = (this.inserts[table] ?? 0) + 1;
    const id = `${table}_${this.inserts[table]}`;
    this.tables[table].set(id, { _id: id, ...structuredClone(value) });
    return id;
  }

  async patch(id, patch) {
    for (const table of Object.values(this.tables)) {
      if (table.has(id)) {
        table.set(id, { ...table.get(id), ...structuredClone(patch) });
        return;
      }
    }
    throw new Error(`UNKNOWN_PATCH:${id}`);
  }

  async delete(id) {
    for (const table of Object.values(this.tables)) {
      if (table.delete(id)) {
        return;
      }
    }
    throw new Error(`UNKNOWN_DELETE:${id}`);
  }
}

function makeFixture({ role = 'owner', marketingOptIn = true, push = false } = {}) {
  const business = {
    _id: 'business_1',
    ownerUserId: 'owner_1',
    name: 'Business',
    subscriptionPlan: 'pro',
    subscriptionStatus: 'active',
    isActive: true,
    createdAt: NOW - 100 * DAY_MS,
    updatedAt: NOW,
  };
  const program = {
    _id: 'program_1',
    businessId: business._id,
    title: 'Program',
    maxStamps: 10,
    status: 'active',
    isActive: true,
    createdAt: NOW - 100 * DAY_MS,
    updatedAt: NOW,
  };
  const customer = {
    _id: 'customer_1',
    isActive: true,
    marketingOptIn,
    createdAt: NOW - 100 * DAY_MS,
    updatedAt: NOW,
  };
  const membership = {
    _id: 'membership_1',
    businessId: business._id,
    programId: program._id,
    userId: customer._id,
    currentStamps: 2,
    isActive: true,
    createdAt: NOW - 100 * DAY_MS,
    updatedAt: NOW - 50 * DAY_MS,
  };
  const events = [
    {
      _id: 'event_1',
      type: 'STAMP_ADDED',
      businessId: business._id,
      programId: program._id,
      customerUserId: customer._id,
      createdAt: NOW - 60 * DAY_MS,
    },
    {
      _id: 'event_2',
      type: 'STAMP_ADDED',
      businessId: business._id,
      programId: program._id,
      customerUserId: customer._id,
      createdAt: NOW - 50 * DAY_MS,
    },
  ];
  const lifecycle = buildCustomerSegmentFacts({
    business,
    programs: [program],
    memberships: [membership],
    events,
    now: NOW,
    excludeReversedEvents: true,
  }).inactive;
  if (lifecycle.state !== 'known') {
    throw new Error('FIXTURE_LIFECYCLE_INVALID');
  }
  const decisionSummary = {
    stableId: 'retention.reengage_inactive',
    category: 'retention',
    priority: 2,
    placement: 'primary',
    title: 'Title',
    reason: 'Reason',
    ctaLabel: 'Review',
    action: { type: 'open_customers_segment', segment: 'at_risk' },
    entityType: null,
    entityId: null,
    guideId: 'inactive-review',
    tone: 'retention',
    evidenceFingerprint: 'decision_evidence_1',
    evidenceObservedAt: NOW,
    count: lifecycle.value.count,
    requiredCapabilities: ['access_customers'],
    access: { state: 'allowed' },
  };
  const factEnvelope = {
    schemaVersion: 1,
    businessId: business._id,
    generatedAt: NOW,
    facts: {
      customerLifecycleSegments: { inactive: lifecycle },
    },
  };
  const factHash = buildAuthorityFactHash(factEnvelope);
  const decisionHash = buildAuthorityDecisionHash(decisionSummary);
  const canonicalSummary = { recommendations: [decisionSummary], facts: {} };
  const comparisonHash = buildAuthorityComparisonHash({
    factHash,
    policyHash: SMART_MANAGER_POLICY_V1_HASH,
    status: 'parity',
    canonicalSummary,
    liveSummary: canonicalSummary,
    differences: [],
  });
  const authorityBindingHash = hashSmartManagerValue({
    authorityMode: 'shadow_parity_v1',
    businessId: business._id,
    decisionId: 'decision_1',
    decisionHash,
    evidenceFingerprint: decisionSummary.evidenceFingerprint,
    factHash,
    sourceGeneration: 7,
    policyVersion: SMART_MANAGER_POLICY_V1_VERSION,
    policyHash: SMART_MANAGER_POLICY_V1_HASH,
    comparisonHash,
    audienceCount: lifecycle.value.count,
    lifecycleSourceFingerprint: lifecycle.value.evidenceFingerprint,
    observedAt: NOW,
  });
  const copy = {
    _id: 'copy_1',
    preparedActionId: 'action_1',
    businessId: business._id,
    revision: 1,
    title: 'נשמח לראות אתכם שוב',
    body: 'עבר זמן מאז הביקור האחרון שלכם. נשמח לראות אתכם שוב בקרוב.',
    provenance: 'deterministic',
    generationVersion: SMART_MANAGER_FALLBACK_GENERATION_VERSION,
    createdAt: NOW,
    retentionExpiresAt: NOW + 90 * DAY_MS,
  };
  copy.contentHash = buildPreparedActionCopyContentHash(copy);
  const action = {
    _id: 'action_1',
    businessId: business._id,
    stableId: 'retention.reengage_inactive',
    actionKind: 'winback_campaign',
    schemaVersion: 1,
    actionContractVersion: 'smart-manager-winback-action-v1',
    preparationKey: buildPreparedWinbackPreparationKey({
      businessId: business._id,
      authorityMode: 'shadow_parity_v1',
      authorityBindingHash,
      decisionHash,
      policyHash: SMART_MANAGER_POLICY_V1_HASH,
    }),
    authorityMode: 'shadow_parity_v1',
    authorityBindingHash,
    decisionId: 'decision_1',
    decisionHash,
    evidenceFingerprint: decisionSummary.evidenceFingerprint,
    factHash,
    sourceGeneration: 7,
    policyVersion: SMART_MANAGER_POLICY_V1_VERSION,
    policyHash: SMART_MANAGER_POLICY_V1_HASH,
    comparisonHash,
    audienceDefinitionVersion: 'smart-manager-at-risk-v1',
    segment: 'at_risk',
    audienceCount: lifecycle.value.count,
    lifecycleSourceFingerprint: lifecycle.value.evidenceFingerprint,
    observedAt: NOW,
    recipientCeiling: 10_000,
    materializationState: 'not_materialized',
    channelStrategy: structuredClone(SMART_MANAGER_WINBACK_CHANNEL_STRATEGY),
    campaignDraft: structuredClone(SMART_MANAGER_WINBACK_CAMPAIGN_DRAFT),
    selectedCopyId: copy._id,
    selectedCopyRevision: copy.revision,
    nextCopyRevision: 2,
    copyRevisionLimit: 10,
    generationState: 'not_requested',
    state: 'reviewable',
    preparedByUserId: 'owner_1',
    expiresAt: NOW + DAY_MS,
    retentionExpiresAt: NOW + 90 * DAY_MS,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const actorId = role === 'manager' ? 'manager_1' : role === 'staff' ? 'staff_1' : 'owner_1';
  const tables = {
    users: [
      { _id: 'owner_1', isActive: true },
      { _id: 'manager_1', isActive: true },
      { _id: 'staff_1', isActive: true },
      customer,
    ],
    businesses: [business],
    businessBillingAccounts: [
      buildCanonicalBusinessBillingAccount({
        businessId: business._id,
        ownerUserId: business.ownerUserId,
        plan: business.subscriptionPlan,
        now: NOW,
      }),
    ],
    businessStaff: [
      {
        _id: `staff_${actorId}`,
        businessId: business._id,
        userId: actorId,
        staffRole: role,
        status: 'active',
        isActive: true,
      },
    ],
    loyaltyPrograms: [program],
    memberships: [membership],
    events,
    referralConfigs: [
      { _id: 'referral_1', businessId: business._id, isEnabled: false },
    ],
    campaigns: [],
    campaignRuns: [],
    campaignRunRecipients: [],
    pushTokens: push
      ? [
          {
            _id: 'push_1',
            userId: customer._id,
            token: 'secret-token-not-copied',
            platform: 'ios',
            isActive: true,
            createdAt: NOW,
            updatedAt: NOW,
            lastRegisteredAt: NOW,
          },
        ]
      : [],
    messageLog: [],
    pushDeliveryLog: [],
    smartManagerPolicyVersions: [],
    smartManagerEvaluationStates: [
      {
        _id: 'evaluation_1',
        businessId: business._id,
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
        businessId: business._id,
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
        businessId: business._id,
        stableId: decisionSummary.stableId,
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
        businessId: business._id,
        sourceGeneration: 7,
        factHash,
        policyVersion: SMART_MANAGER_POLICY_V1_VERSION,
        policyHash: SMART_MANAGER_POLICY_V1_HASH,
        comparisonHash,
        status: 'parity',
        canonicalSummary,
        liveSummary: canonicalSummary,
        differences: [],
        updatedAt: NOW,
      },
    ],
    smartManagerPreparedActions: [action],
    smartManagerPreparedActionCopies: [copy],
    smartManagerAuditEvents: [],
  };
  return { actorId, tables, action, copy };
}

function makeCtx(options = {}) {
  const fixture = makeFixture(options);
  const db = new FakeDb(fixture.tables);
  const scheduled = [];
  const ctx = {
    db,
    auth: {
      getUserIdentity: async () => ({
        subject: `${fixture.actorId}|session_1`,
      }),
    },
    scheduler: {
      runAfter: async (delay, ref, args) => scheduled.push({ delay, ref, args }),
    },
  };
  return { ...fixture, db, scheduled, ctx };
}

function approvalArgs(fixture) {
  return {
    preparedActionId: fixture.action._id,
    selectedCopyId: fixture.copy._id,
    selectedCopyRevision: fixture.copy.revision,
    contentHash: fixture.copy.contentHash,
  };
}

async function approve(fixture) {
  return await approvePreparedWinbackAction._handler(
    fixture.ctx,
    approvalArgs(fixture)
  );
}

async function runNextWorker(fixture) {
  const scheduled = fixture.scheduled.shift();
  if (!scheduled) {
    throw new Error('NO_SCHEDULED_WORKER');
  }
  return await materializeApprovedRunInternal._handler(
    fixture.ctx,
    scheduled.args
  );
}

async function drainWorkers(fixture) {
  let last = null;
  for (let index = 0; fixture.scheduled.length > 0 && index < 50; index += 1) {
    last = await runNextWorker(fixture);
  }
  return last;
}

async function withFixedNow(now, operation) {
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    return await operation();
  } finally {
    Date.now = originalNow;
  }
}

function addPostApprovalAtRiskCustomers(fixture, count) {
  for (let index = 2; index < count + 2; index += 1) {
    const userId = `customer_${index}`;
    fixture.db.tables.users.set(userId, {
      _id: userId,
      isActive: true,
      marketingOptIn: true,
      createdAt: NOW - 100 * DAY_MS,
      updatedAt: NOW,
    });
    fixture.db.tables.memberships.set(`membership_${index}`, {
      _id: `membership_${index}`,
      businessId: 'business_1',
      programId: 'program_1',
      userId,
      currentStamps: 2,
      isActive: true,
      createdAt: NOW - 100 * DAY_MS,
      updatedAt: NOW - 50 * DAY_MS,
    });
    fixture.db.tables.events.set(`event_${index}_first`, {
      _id: `event_${index}_first`,
      type: 'STAMP_ADDED',
      businessId: 'business_1',
      programId: 'program_1',
      customerUserId: userId,
      createdAt: NOW - 60 * DAY_MS,
    });
    fixture.db.tables.events.set(`event_${index}_last`, {
      _id: `event_${index}_last`,
      type: 'STAMP_ADDED',
      businessId: 'business_1',
      programId: 'program_1',
      customerUserId: userId,
      createdAt: NOW - 50 * DAY_MS,
    });
  }
}

async function materializeAcrossFinalizationTimes(fixture, times) {
  const approved = await withFixedNow(NOW, () => approve(fixture));
  addPostApprovalAtRiskCustomers(fixture, 25);
  await withFixedNow(NOW, () => runNextWorker(fixture));
  for (const time of times) {
    await withFixedNow(time, () => runNextWorker(fixture));
  }
  return fixture.db.tables.campaignRuns.get(approved.campaignRunId);
}

describe('Smart Manager Pass A approval', () => {
  test('1 owner with the exact reviewed binding can approve', async () => {
    const fixture = makeCtx();
    const result = await approve(fixture);
    expect(result.reused).toBe(false);
    expect(fixture.db.rows('campaignRuns')).toHaveLength(1);
  });

  test('2 manager with required capabilities can approve', async () => {
    const fixture = makeCtx({ role: 'manager' });
    expect((await approve(fixture)).executionState).toBe('materializing');
  });

  test('3 staff without activation capability cannot approve', async () => {
    const fixture = makeCtx({ role: 'staff' });
    await expect(approve(fixture)).rejects.toThrow(
      'SMART_MANAGER_APPROVAL_NOT_ELIGIBLE'
    );
  });

  test('4 cross-business requests fail with the same safe unavailable reason', async () => {
    const fixture = makeCtx();
    fixture.db.tables.businessStaff.clear();
    await expect(approve(fixture)).rejects.toThrow(
      'SMART_MANAGER_APPROVAL_REFRESH_REQUIRED'
    );
  });

  test('5 wrong selectedCopyId fails closed', async () => {
    const fixture = makeCtx();
    await expect(
      approvePreparedWinbackAction._handler(fixture.ctx, {
        ...approvalArgs(fixture),
        selectedCopyId: 'missing_copy',
      })
    ).rejects.toThrow('SMART_MANAGER_APPROVAL_REFRESH_REQUIRED');
  });

  test('6 wrong selected copy revision fails closed', async () => {
    const fixture = makeCtx();
    await expect(
      approvePreparedWinbackAction._handler(fixture.ctx, {
        ...approvalArgs(fixture),
        selectedCopyRevision: 2,
      })
    ).rejects.toThrow('SMART_MANAGER_APPROVAL_REFRESH_REQUIRED');
  });

  test('7 forged content hash fails closed', async () => {
    const fixture = makeCtx();
    await expect(
      approvePreparedWinbackAction._handler(fixture.ctx, {
        ...approvalArgs(fixture),
        contentHash: 'forged',
      })
    ).rejects.toThrow('SMART_MANAGER_APPROVAL_REFRESH_REQUIRED');
  });

  test('8 authority generation or policy drift fails closed', async () => {
    const fixture = makeCtx();
    fixture.db.tables.smartManagerEvaluationStates.get('evaluation_1').dirtyDomains = [
      'events',
    ];
    await expect(approve(fixture)).rejects.toThrow(
      'SMART_MANAGER_APPROVAL_REFRESH_REQUIRED'
    );
  });

  test('9 changed lifecycle fingerprint and count fail before run creation', async () => {
    const fixture = makeCtx();
    fixture.db.tables.users.set('customer_2', {
      _id: 'customer_2',
      isActive: true,
      marketingOptIn: true,
    });
    fixture.db.tables.memberships.set('membership_2', {
      _id: 'membership_2',
      businessId: 'business_1',
      programId: 'program_1',
      userId: 'customer_2',
      currentStamps: 2,
      isActive: true,
      createdAt: NOW - 100 * DAY_MS,
      updatedAt: NOW,
    });
    for (const [id, age] of [['event_3', 60], ['event_4', 50]]) {
      fixture.db.tables.events.set(id, {
        _id: id,
        type: 'STAMP_ADDED',
        businessId: 'business_1',
        programId: 'program_1',
        customerUserId: 'customer_2',
        createdAt: NOW - age * DAY_MS,
      });
    }
    await expect(approve(fixture)).rejects.toThrow(
      'SMART_MANAGER_APPROVAL_REFRESH_REQUIRED'
    );
    expect(fixture.db.rows('campaignRuns')).toHaveLength(0);
  });

  test('10 inactive paid subscription creates no run', async () => {
    const fixture = makeCtx();
    fixture.db.tables.businesses.get('business_1').subscriptionStatus = 'inactive';
    fixture.db.tables.businessBillingAccounts.get('billing_1').status = 'inactive';
    await expect(approve(fixture)).rejects.toThrow(
      'SMART_MANAGER_APPROVAL_NOT_ELIGIBLE'
    );
    expect(fixture.db.rows('campaignRuns')).toHaveLength(0);
  });

  test('11 campaign capacity failure creates no partial campaign or run', async () => {
    const fixture = makeCtx();
    for (let index = 0; index < 5; index += 1) {
      fixture.db.tables.campaigns.set(`existing_${index}`, {
        _id: `existing_${index}`,
        businessId: 'business_1',
        status: 'draft',
        isActive: true,
      });
    }
    await expect(approve(fixture)).rejects.toThrow(
      'SMART_MANAGER_CAMPAIGN_CAPACITY_REACHED'
    );
    expect(fixture.db.rows('campaignRuns')).toHaveLength(0);
  });

  test('12 double approval reuses one exact run', async () => {
    const fixture = makeCtx();
    const first = await approve(fixture);
    const second = await approve(fixture);
    expect(second.campaignRunId).toBe(first.campaignRunId);
    expect(second.reused).toBe(true);
    expect(fixture.db.rows('campaignRuns')).toHaveLength(1);
  });

  test('13 concurrent approval identity is deterministic and server-derived', () => {
    const fixture = makeFixture();
    const common = {
      preparedActionId: fixture.action._id,
      selectedCopyId: fixture.copy._id,
      selectedCopyRevision: fixture.copy.revision,
      selectedCopyContentHash: fixture.copy.contentHash,
      authorityMode: fixture.action.authorityMode,
      authorityBindingHash: fixture.action.authorityBindingHash,
      decisionHash: fixture.action.decisionHash,
      evidenceFingerprint: fixture.action.evidenceFingerprint,
      factHash: fixture.action.factHash,
      policyVersion: fixture.action.policyVersion,
      policyHash: fixture.action.policyHash,
      comparisonHash: fixture.action.comparisonHash,
      sourceGeneration: fixture.action.sourceGeneration,
      audienceDefinitionVersion: fixture.action.audienceDefinitionVersion,
      lifecycleSourceFingerprint: fixture.action.lifecycleSourceFingerprint,
      approvedAudienceObservedCount: fixture.action.audienceCount,
      channelStrategyVersion:
        fixture.action.channelStrategy.channelStrategyVersion,
    };
    expect(buildSmartManagerApprovalKey(common)).toBe(
      buildSmartManagerApprovalKey(structuredClone(common))
    );
    const schema = readFileSync(new URL('../schema.ts', import.meta.url), 'utf8');
    expect(schema).toContain(".index('by_preparedActionId_approvalKey'");
  });

  test('14 a changed copy binding never produces the old approval key', () => {
    const fixture = makeFixture();
    const base = {
      preparedActionId: fixture.action._id,
      selectedCopyId: fixture.copy._id,
      selectedCopyRevision: 1,
      selectedCopyContentHash: fixture.copy.contentHash,
      authorityMode: fixture.action.authorityMode,
      authorityBindingHash: fixture.action.authorityBindingHash,
      decisionHash: fixture.action.decisionHash,
      evidenceFingerprint: fixture.action.evidenceFingerprint,
      factHash: fixture.action.factHash,
      policyVersion: fixture.action.policyVersion,
      policyHash: fixture.action.policyHash,
      comparisonHash: fixture.action.comparisonHash,
      sourceGeneration: 7,
      audienceDefinitionVersion: 'smart-manager-at-risk-v1',
      lifecycleSourceFingerprint: fixture.action.lifecycleSourceFingerprint,
      approvedAudienceObservedCount: 1,
      channelStrategyVersion: 'push-with-in-app-fallback-v1',
    };
    expect(buildSmartManagerApprovalKey(base)).not.toBe(
      buildSmartManagerApprovalKey({
        ...base,
        selectedCopyRevision: 2,
        selectedCopyContentHash: 'different',
      })
    );
  });
});

describe('Smart Manager Pass A materialization', () => {
  test('15 approval itself does not enumerate recipient or token tables', async () => {
    const fixture = makeCtx();
    await approve(fixture);
    expect(
      fixture.db.reads.some(
        (read) =>
          read.table === 'campaignRunRecipients' || read.table === 'pushTokens'
      )
    ).toBe(false);
  });

  test('16 each worker page is hard bounded to at most one hundred', async () => {
    const fixture = makeCtx();
    await approve(fixture);
    await runNextWorker(fixture);
    const pages = fixture.db.reads.filter((read) => read.kind === 'paginate');
    expect(Math.max(...pages.map((page) => page.limit))).toBeLessThanOrEqual(
      SMART_MANAGER_MATERIALIZATION_BATCH_SIZE
    );
  });

  test('17 continuation advances an exact persisted checkpoint', async () => {
    const fixture = makeCtx();
    for (let index = 0; index < 101; index += 1) {
      fixture.db.tables.events.set(`noise_${index}`, {
        _id: `noise_${index}`,
        type: 'OTHER',
        businessId: 'business_1',
        programId: 'program_1',
        createdAt: NOW - DAY_MS + index,
      });
    }
    const approved = await approve(fixture);
    await runNextWorker(fixture);
    const run = fixture.db.tables.campaignRuns.get(approved.campaignRunId);
    expect(run.materializationCheckpoint).toBe(1);
    expect(run.materializationCursor).toBeDefined();
  });

  test('18 stale duplicate workers cannot advance the newer checkpoint', async () => {
    const fixture = makeCtx();
    const approved = await approve(fixture);
    const job = fixture.scheduled[0];
    await runNextWorker(fixture);
    const stale = await materializeApprovedRunInternal._handler(
      fixture.ctx,
      job.args
    );
    expect(stale.status).toBe('stale');
    expect(
      fixture.db.tables.campaignRuns.get(approved.campaignRunId)
        .materializationCheckpoint
    ).toBe(1);
  });

  test('19 an eligible recipient materializes exactly once', async () => {
    const fixture = makeCtx();
    await approve(fixture);
    await drainWorkers(fixture);
    expect(fixture.db.rows('campaignRunRecipients')).toHaveLength(1);
  });

  test('20 duplicate memberships and retries do not duplicate recipients', async () => {
    const fixture = makeCtx();
    fixture.db.tables.memberships.set('membership_duplicate', {
      ...fixture.db.tables.memberships.get('membership_1'),
      _id: 'membership_duplicate',
    });
    await approve(fixture);
    await drainWorkers(fixture);
    expect(fixture.db.rows('campaignRunRecipients')).toHaveLength(1);
  });

  test('21 a customer made ineligible before finalization is excluded', async () => {
    const fixture = makeCtx();
    const approved = await approve(fixture);
    await runNextWorker(fixture);
    fixture.db.tables.memberships.get('membership_1').isActive = false;
    await drainWorkers(fixture);
    const run = fixture.db.tables.campaignRuns.get(approved.campaignRunId);
    expect(run.materializedExcluded).toBe(1);
    expect(run.totalExecutionRecipients).toBe(0);
  });

  test('36 a post-approval return is excluded by live canonical finalization', async () => {
    const fixture = makeCtx();
    const approved = await approve(fixture);
    await runNextWorker(fixture);
    fixture.db.tables.events.set('event_post_approval_return', {
      _id: 'event_post_approval_return',
      type: 'STAMP_ADDED',
      businessId: 'business_1',
      programId: 'program_1',
      customerUserId: 'customer_1',
      createdAt: Date.now(),
    });

    await drainWorkers(fixture);

    const run = fixture.db.tables.campaignRuns.get(approved.campaignRunId);
    expect(fixture.db.rows('campaignRunRecipients')).toHaveLength(0);
    expect(run.materializedExcluded).toBe(1);
    expect(run.totalExecutionRecipients).toBe(0);
  });

  test('37 a canonically reversed candidate stamp is recomputed and excluded', async () => {
    const fixture = makeCtx();
    const approved = await approve(fixture);
    await runNextWorker(fixture);
    fixture.db.tables.events.get('event_2').reversalEventId =
      'event_2_reversal';
    fixture.db.tables.events.set('event_2_reversal', {
      _id: 'event_2_reversal',
      type: 'STAMP_REMOVED',
      businessId: 'business_1',
      programId: 'program_1',
      customerUserId: 'customer_1',
      revertsEventId: 'event_2',
      createdAt: Date.now(),
    });

    await drainWorkers(fixture);

    const run = fixture.db.tables.campaignRuns.get(approved.campaignRunId);
    expect(fixture.db.rows('campaignRunRecipients')).toHaveLength(0);
    expect(run.materializedExcluded).toBe(1);
    expect(run.totalExecutionRecipients).toBe(0);
  });

  test('38 over-limit current recipient history fails closed without truncation', async () => {
    const fixture = makeCtx();
    const approved = await approve(fixture);
    await runNextWorker(fixture);
    for (
      let index = 0;
      index < SMART_MANAGER_RECIPIENT_EVENT_LIMIT - 1;
      index += 1
    ) {
      fixture.db.tables.events.set(`event_overflow_${index}`, {
        _id: `event_overflow_${index}`,
        type: 'STAMP_ADDED',
        businessId: 'business_1',
        programId: 'program_1',
        customerUserId: 'customer_1',
        createdAt: Date.now() - index,
      });
    }

    const result = await runNextWorker(fixture);

    const run = fixture.db.tables.campaignRuns.get(approved.campaignRunId);
    expect(result).toEqual({
      status: 'failed',
      failureCode: 'SOURCE_LIMIT_EXCEEDED',
    });
    expect(run.executionState).toBe('failed');
    expect(run.materializationFailureCode).toBe('SOURCE_LIMIT_EXCEEDED');
    expect(run.recipientSetHash).toBeUndefined();
  });

  test('22 a reachable customer gets one push intent token reference', async () => {
    const fixture = makeCtx({ push: true });
    await approve(fixture);
    await drainWorkers(fixture);
    const recipient = fixture.db.rows('campaignRunRecipients')[0];
    expect(recipient.channel).toBe('push');
    expect(recipient.pushTokenId).toBe('push_1');
    expect(recipient).not.toHaveProperty('token');
  });

  test('23 push-unreachable customer gets in-app fallback intent', async () => {
    const fixture = makeCtx();
    await approve(fixture);
    await drainWorkers(fixture);
    expect(fixture.db.rows('campaignRunRecipients')[0].channel).toBe('in_app');
  });

  test('24 customer without a permitted channel is not contactable', async () => {
    const fixture = makeCtx({ marketingOptIn: false });
    await approve(fixture);
    await drainWorkers(fixture);
    expect(fixture.db.rows('campaignRunRecipients')[0].executionState).toBe(
      'not_contactable'
    );
  });

  test('25 Pass A invokes no message or provider delivery path', async () => {
    const fixture = makeCtx({ push: true });
    await approve(fixture);
    await drainWorkers(fixture);
    expect(fixture.db.rows('messageLog')).toHaveLength(0);
    expect(fixture.db.rows('pushDeliveryLog')).toHaveLength(0);
  });
});

describe('Smart Manager Pass A hash and finalization', () => {
  const bindingA = buildSmartManagerRecipientBindingHash({
    recipientKey: 'recipient_a',
    eligibilityBindingHash: 'eligibility_a',
    channel: 'push',
  });
  const bindingB = buildSmartManagerRecipientBindingHash({
    recipientKey: 'recipient_b',
    eligibilityBindingHash: 'eligibility_b',
    channel: 'in_app',
  });

  test('26 identical final recipient sets produce identical hashes', () => {
    expect(buildSmartManagerRecipientSetHash([bindingA, bindingB])).toBe(
      buildSmartManagerRecipientSetHash([bindingA, bindingB])
    );
  });

  test('27 changed exact membership or channel changes the set hash', () => {
    expect(buildSmartManagerRecipientSetHash([bindingA])).not.toBe(
      buildSmartManagerRecipientSetHash([bindingA, bindingB])
    );
  });

  test('28 pagination and insertion order do not change the set hash', () => {
    expect(buildSmartManagerRecipientSetHash([bindingA, bindingB])).toBe(
      buildSmartManagerRecipientSetHash([bindingB, bindingA])
    );
  });

  test('39 equivalent real materializations hash identically across different clocks', async () => {
    const first = makeCtx();
    const second = makeCtx();
    const firstApproved = await withFixedNow(NOW, () => approve(first));
    const secondApproved = await withFixedNow(NOW, () => approve(second));
    await withFixedNow(NOW, () => runNextWorker(first));
    await withFixedNow(NOW, () => runNextWorker(second));
    await withFixedNow(NOW + 1_000, () => runNextWorker(first));
    await withFixedNow(NOW + 90_000, () => runNextWorker(second));
    await withFixedNow(NOW + 2_000, () => runNextWorker(first));
    await withFixedNow(NOW + 180_000, () => runNextWorker(second));

    const firstRecipient = first.db.rows('campaignRunRecipients')[0];
    const secondRecipient = second.db.rows('campaignRunRecipients')[0];
    const firstRun = first.db.tables.campaignRuns.get(
      firstApproved.campaignRunId
    );
    const secondRun = second.db.tables.campaignRuns.get(
      secondApproved.campaignRunId
    );
    expect(firstRecipient.eligibilityEvaluatedAt).not.toBe(
      secondRecipient.eligibilityEvaluatedAt
    );
    expect(firstRecipient.eligibilityBindingHash).toBe(
      secondRecipient.eligibilityBindingHash
    );
    expect(firstRun.recipientSetHash).toBe(secondRun.recipientSetHash);
  });

  test('40 multi-page real finalization hash is independent of page timing', async () => {
    const first = makeCtx();
    const second = makeCtx();
    const firstRun = await materializeAcrossFinalizationTimes(first, [
      NOW + 1_000,
      NOW + 2_000,
      NOW + 3_000,
    ]);
    const secondRun = await materializeAcrossFinalizationTimes(second, [
      NOW + 60_000,
      NOW + 120_000,
      NOW + 180_000,
    ]);
    const firstEvaluationTimes = new Set(
      first.db
        .rows('campaignRunRecipients')
        .map((recipient) => recipient.eligibilityEvaluatedAt)
    );
    const secondEvaluationTimes = new Set(
      second.db
        .rows('campaignRunRecipients')
        .map((recipient) => recipient.eligibilityEvaluatedAt)
    );

    expect(first.db.rows('campaignRunRecipients')).toHaveLength(26);
    expect(second.db.rows('campaignRunRecipients')).toHaveLength(26);
    expect(firstEvaluationTimes.size).toBe(2);
    expect(secondEvaluationTimes.size).toBe(2);
    expect(firstRun.recipientSetHash).toBe(secondRun.recipientSetHash);
  });

  test('41 a real resolved-channel change changes the final recipient hash', async () => {
    const inAppFixture = makeCtx();
    const pushFixture = makeCtx({ push: true });
    const inAppApproved = await withFixedNow(NOW, () => approve(inAppFixture));
    const pushApproved = await withFixedNow(NOW, () => approve(pushFixture));
    await withFixedNow(NOW, () => runNextWorker(inAppFixture));
    await withFixedNow(NOW, () => runNextWorker(pushFixture));
    await withFixedNow(NOW + 1_000, () => runNextWorker(inAppFixture));
    await withFixedNow(NOW + 1_000, () => runNextWorker(pushFixture));
    await withFixedNow(NOW + 2_000, () => runNextWorker(inAppFixture));
    await withFixedNow(NOW + 2_000, () => runNextWorker(pushFixture));

    const inAppRun = inAppFixture.db.tables.campaignRuns.get(
      inAppApproved.campaignRunId
    );
    const pushRun = pushFixture.db.tables.campaignRuns.get(
      pushApproved.campaignRunId
    );
    expect(inAppFixture.db.rows('campaignRunRecipients')[0].channel).toBe(
      'in_app'
    );
    expect(pushFixture.db.rows('campaignRunRecipients')[0].channel).toBe(
      'push'
    );
    expect(inAppRun.recipientSetHash).not.toBe(pushRun.recipientSetHash);
  });

  test('29 a run cannot be ready after only the source scan', async () => {
    const fixture = makeCtx();
    const approved = await approve(fixture);
    await runNextWorker(fixture);
    expect(
      fixture.db.tables.campaignRuns.get(approved.campaignRunId).executionState
    ).toBe('materializing');
  });

  test('30 final counters equal the persisted execution recipients', async () => {
    const fixture = makeCtx({ push: true });
    const approved = await approve(fixture);
    await drainWorkers(fixture);
    const run = fixture.db.tables.campaignRuns.get(approved.campaignRunId);
    expect(run.totalExecutionRecipients).toBe(
      fixture.db.rows('campaignRunRecipients').length
    );
    expect(run.pushEligible + run.inAppFallbackEligible + run.notContactable).toBe(
      run.totalExecutionRecipients
    );
  });

  test('31 ready-for-delivery freezes approved campaign mutation surfaces', () => {
    const source = readFileSync(new URL('../campaigns.ts', import.meta.url), 'utf8');
    expect(source).toContain('SMART_MANAGER_APPROVED_CAMPAIGN_IMMUTABLE');
    expect(source).toContain(
      'function assertCampaignIsNotImmutableSmartManagerExecution('
    );
    expect(source).toContain("campaign.source === 'smart_manager'");
    const protectedSurfaceCalls =
      source.match(
        /assertCampaignIsNotImmutableSmartManagerExecution\(campaign\);/g
      ) ?? [];
    expect(protectedSurfaceCalls.length).toBeGreaterThanOrEqual(7);
  });
});

describe('Smart Manager Pass A deletion and privacy', () => {
  test('32 business deletion removes recipient rows before campaign runs', () => {
    const source = readFileSync(
      new URL('../businessDeletion.ts', import.meta.url),
      'utf8'
    );
    expect(source.indexOf("table: 'campaignRunRecipients'")).toBeLessThan(
      source.lastIndexOf("table: 'campaignRuns'")
    );
  });

  test('33 hard wipe includes recipients and campaign runs', () => {
    const source = readFileSync(new URL('../users.ts', import.meta.url), 'utf8');
    expect(source).toContain("'campaignRunRecipients'");
    expect(source).toContain("'campaignRuns'");
  });

  test('34 account deletion redacts approver without deleting the run', () => {
    const source = readFileSync(new URL('../users.ts', import.meta.url), 'utf8');
    expect(source).toContain("'by_approvedByUserId'");
    expect(source).toContain("'approvedByUserId'");
  });

  test('35 audits contain only closed hashes, identifiers, and counters', async () => {
    const fixture = makeCtx({ push: true });
    await approve(fixture);
    await drainWorkers(fixture);
    const serialized = JSON.stringify(fixture.db.rows('smartManagerAuditEvents'));
    expect(serialized).not.toContain('secret-token-not-copied');
    expect(serialized).not.toContain(fixture.copy.body);
    expect(serialized).not.toContain('customer_1');
  });
});
