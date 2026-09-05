import { afterEach, describe, expect, test } from 'bun:test';

import {
  claimSmartManagerDeliveryBatchInternal,
  finalizeSmartManagerDeliveryBatchInternal,
  sendSmartManagerPushBatch,
  startSmartManagerDeliveryInternal,
  sweepSmartManagerDeliveriesInternal,
} from '../smartManagerDelivery';
import {
  buildSmartManagerDeliveryAttemptId,
  buildSmartManagerDeliveryLeaseToken,
  buildSmartManagerInboxDedupeKey,
  classifySmartManagerExpoTicket,
  getSmartManagerPushBackoffMs,
  isSmartManagerRecipientTerminal,
  sanitizeSmartManagerProviderTicketId,
  SMART_MANAGER_DELIVERY_BATCH_SIZE,
  SMART_MANAGER_MAX_PUSH_ATTEMPTS,
} from '../lib/smartManagerDelivery';
import { buildPreparedActionCopyContentHash } from '../lib/smartManagerPreparedActions';
import { sendExpoPushMessages } from '../pushNotifications';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

class FakeQuery {
  constructor(db, table, predicates = [], direction = 'asc') {
    this.db = db;
    this.table = table;
    this.predicates = predicates;
    this.direction = direction;
  }

  withIndex(_index, builder) {
    const predicates = [...this.predicates];
    const q = {
      eq: (field, value) => {
        predicates.push((row) => row[field] === value);
        return q;
      },
    };
    builder(q);
    return new FakeQuery(this.db, this.table, predicates, this.direction);
  }

  filter(builder) {
    const q = {
      field: (field) => field,
      eq: (field, value) => (row) => row[field] === value,
      lte: (field, value) => (row) => row[field] <= value,
    };
    return new FakeQuery(
      this.db,
      this.table,
      [...this.predicates, builder(q)],
      this.direction
    );
  }

  order(direction) {
    return new FakeQuery(this.db, this.table, this.predicates, direction);
  }

  rows() {
    const rows = this.db
      .rows(this.table)
      .filter((row) => this.predicates.every((predicate) => predicate(row)))
      .sort((left, right) => {
        const leftKey = left.recipientKey ?? left.createdAt ?? left._id;
        const rightKey = right.recipientKey ?? right.createdAt ?? right._id;
        return String(leftKey).localeCompare(String(rightKey));
      });
    return this.direction === 'desc' ? rows.reverse() : rows;
  }

  async first() {
    return this.rows()[0] ?? null;
  }

  async take(limit) {
    this.db.takeLimits.push({ table: this.table, limit });
    return this.rows().slice(0, limit);
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
    this.insertCounts = {};
    this.takeLimits = [];
  }

  rows(table) {
    return [...(this.tables[table]?.values() ?? [])];
  }

  query(table) {
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
    this.insertCounts[table] = (this.insertCounts[table] ?? 0) + 1;
    const id = `${table}_${this.insertCounts[table]}`;
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

function makeFixture(channels = ['in_app']) {
  const title = 'Exact approved title';
  const body = 'Exact approved body';
  const copy = {
    _id: 'copy_1',
    businessId: 'business_1',
    preparedActionId: 'action_1',
    revision: 2,
    title,
    body,
  };
  copy.contentHash = buildPreparedActionCopyContentHash(copy);
  const action = {
    _id: 'action_1',
    businessId: 'business_1',
    state: 'approved',
    materializationState: 'ready_for_delivery',
    approvedCampaignRunId: 'run_1',
    approvalKey: 'approval_key',
    selectedCopyId: copy._id,
    selectedCopyRevision: copy.revision,
    decisionId: 'decision_1',
    authorityMode: 'shadow_parity_v1',
    authorityBindingHash: 'authority_hash',
    decisionHash: 'decision_hash',
    evidenceFingerprint: 'evidence_hash',
    factHash: 'fact_hash',
    policyVersion: 'policy_v1',
    policyHash: 'policy_hash',
    comparisonHash: 'comparison_hash',
    sourceGeneration: 8,
    audienceDefinitionVersion: 'smart-manager-at-risk-v1',
    lifecycleSourceFingerprint: 'lifecycle_hash',
    audienceCount: channels.length,
    recipientCeiling: 100,
    updatedAt: 1,
  };
  const campaign = {
    _id: 'campaign_1',
    businessId: 'business_1',
    type: 'winback',
    family: 'lifecycle',
    opportunityType: 'winback',
    source: 'smart_manager',
    smartManagerCampaignRunId: 'run_1',
    smartManagerPreparedActionId: action._id,
    smartManagerSelectedCopyId: copy._id,
    smartManagerSelectedCopyRevision: copy.revision,
    smartManagerSelectedCopyContentHash: copy.contentHash,
    smartManagerApprovalKey: action.approvalKey,
    messageTitle: title,
    messageBody: body,
    status: 'draft',
    automationEnabled: false,
    isActive: true,
    createdAt: 1,
    updatedAt: 1,
  };
  const run = {
    _id: 'run_1',
    businessId: 'business_1',
    campaignId: campaign._id,
    campaignType: 'winback',
    family: 'lifecycle',
    opportunityType: 'winback',
    targetedCount: channels.length,
    deliveredCount: 0,
    summaryStatus: 'pending',
    executionKind: 'smart_manager_v1',
    executionState: 'ready_for_delivery',
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
    audienceDefinitionVersion: action.audienceDefinitionVersion,
    lifecycleSourceFingerprint: action.lifecycleSourceFingerprint,
    approvedAudienceObservedCount: action.audienceCount,
    recipientCeiling: action.recipientCeiling,
    channelStrategyVersion: 'push-with-in-app-fallback-v1',
    approvalKey: action.approvalKey,
    approvedByUserId: 'deleted_approver_is_allowed',
    recipientSetHash: 'immutable_recipient_set_hash',
    totalExecutionRecipients: channels.length,
    createdAt: 1,
    updatedAt: 1,
  };
  const recipients = channels.map((channel, index) => ({
    _id: `recipient_${index + 1}`,
    businessId: run.businessId,
    campaignId: campaign._id,
    campaignRunId: run._id,
    userId: `customer_${index + 1}`,
    recipientKey: `recipient_key_${String(index + 1).padStart(3, '0')}`,
    firstStampAt: 1,
    lastStampAt: 2,
    positiveIntervalCount: 1,
    eligibilityVersion: 'smart-manager-at-risk-recipient-v1',
    channel,
    eligibilityBindingHash: `eligibility_${index + 1}`,
    recipientBindingHash: `binding_${index + 1}`,
    executionState: channel === 'not_contactable' ? 'not_contactable' : 'pending',
    createdAt: 1,
    updatedAt: 1,
  }));
  const users = recipients.map((recipient) => ({
    _id: recipient.userId,
    isActive: true,
    marketingOptIn: true,
    email: `${recipient.userId}@example.com`,
  }));
  const pushTokens = recipients
    .filter((recipient) => recipient.channel === 'push')
    .map((recipient, index) => ({
      _id: `token_${index + 1}`,
      userId: recipient.userId,
      token: `ExponentPushToken[token-secret-${index + 1}]`,
      platform: 'ios',
      isActive: true,
      createdAt: index + 1,
      updatedAt: index + 1,
      lastRegisteredAt: index + 1,
    }));
  const tables = {
    businesses: [
      {
        _id: run.businessId,
        ownerUserId: 'owner_1',
        name: 'Business',
        subscriptionPlan: 'pro',
        subscriptionStatus: 'active',
        isActive: true,
      },
    ],
    campaigns: [campaign],
    referralConfigs: [],
    smartManagerPreparedActions: [action],
    smartManagerPreparedActionCopies: [copy],
    campaignRuns: [run],
    campaignRunRecipients: recipients,
    users,
    pushTokens,
    messageLog: [],
    smartManagerAuditEvents: [],
  };
  const db = new FakeDb(tables);
  const scheduled = [];
  const ctx = {
    db,
    scheduler: {
      runAfter: async (delay, ref, args) => scheduled.push({ delay, ref, args }),
    },
  };
  return { ctx, db, scheduled, run, action, campaign, copy, recipients };
}

async function start(fixture) {
  return await startSmartManagerDeliveryInternal._handler(fixture.ctx, {
    campaignRunId: fixture.run._id,
  });
}

async function claim(fixture) {
  const run = await fixture.db.get(fixture.run._id);
  return await claimSmartManagerDeliveryBatchInternal._handler(fixture.ctx, {
    campaignRunId: run._id,
    deliveryGeneration: run.deliveryGeneration,
  });
}

async function finalize(fixture, claimed, result) {
  const run = await fixture.db.get(fixture.run._id);
  return await finalizeSmartManagerDeliveryBatchInternal._handler(fixture.ctx, {
    campaignRunId: run._id,
    deliveryGeneration: run.deliveryGeneration,
    results: claimed.recipients.map((recipient) => ({
      recipientId: recipient.recipientId,
      pushTokenId: recipient.pushTokenId,
      attemptId: recipient.attemptId,
      leaseToken: recipient.leaseToken,
      leaseGeneration: recipient.leaseGeneration,
      result,
    })),
  });
}

function providerFinalization(recipient, result) {
  return {
    recipientId: recipient.recipientId,
    pushTokenId: recipient.pushTokenId,
    attemptId: recipient.attemptId,
    leaseToken: recipient.leaseToken,
    leaseGeneration: recipient.leaseGeneration,
    result,
  };
}

async function finalizeResults(fixture, deliveryGeneration, results) {
  return await finalizeSmartManagerDeliveryBatchInternal._handler(fixture.ctx, {
    campaignRunId: fixture.run._id,
    deliveryGeneration,
    results,
  });
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

describe('Smart Manager delivery start and authority', () => {
  test('1 ready run starts exactly one delivery generation', async () => {
    const fixture = makeFixture();
    const result = await start(fixture);
    expect(result).toMatchObject({ status: 'started', deliveryGeneration: 1 });
    expect((await fixture.db.get('run_1')).executionState).toBe('delivering');
  });

  test('2 duplicate start reuses the same generation', async () => {
    const fixture = makeFixture();
    await start(fixture);
    expect(await start(fixture)).toMatchObject({
      status: 'reused',
      deliveryGeneration: 1,
    });
  });

  test('3 invalidated run cannot start', async () => {
    const fixture = makeFixture();
    await fixture.db.patch('run_1', { executionState: 'invalidated' });
    expect(await start(fixture)).toEqual({ status: 'stale' });
  });

  test('4 non-ready materializing run cannot start', async () => {
    const fixture = makeFixture();
    await fixture.db.patch('run_1', { executionState: 'materializing' });
    expect(await start(fixture)).toEqual({ status: 'stale' });
  });

  test('5 inactive business invalidates before delivery', async () => {
    const fixture = makeFixture();
    await fixture.db.patch('business_1', { isActive: false });
    expect(await start(fixture)).toMatchObject({
      status: 'invalidated',
      failureCode: 'BUSINESS_INACTIVE',
    });
  });

  test('6 permanent deletion in progress invalidates before delivery', async () => {
    const fixture = makeFixture();
    await fixture.db.patch('business_1', { permanentDeletionStatus: 'in_progress' });
    expect(await start(fixture)).toMatchObject({
      failureCode: 'BUSINESS_DELETION_IN_PROGRESS',
    });
  });

  test('7 inactive subscription invalidates before delivery', async () => {
    const fixture = makeFixture();
    await fixture.db.patch('business_1', {
      subscriptionPlan: 'pro',
      subscriptionStatus: 'inactive',
    });
    expect(await start(fixture)).toMatchObject({ failureCode: 'SUBSCRIPTION_INACTIVE' });
  });

  test('8 deleted original approver does not block business execution', async () => {
    const fixture = makeFixture();
    expect(
      fixture.db
        .rows('users')
        .some((user) => user._id === fixture.run.approvedByUserId)
    ).toBe(false);
    expect((await start(fixture)).status).toBe('started');
  });

  test('9 missing business fails closed', async () => {
    const fixture = makeFixture();
    fixture.db.tables.businesses.delete('business_1');
    expect(await start(fixture)).toMatchObject({ failureCode: 'BUSINESS_NOT_FOUND' });
  });

  test('10 recipient overflow invalidates without sending', async () => {
    const fixture = makeFixture(Array.from({ length: 101 }, () => 'not_contactable'));
    expect(await start(fixture)).toMatchObject({ failureCode: 'RECIPIENT_SET_INVALID' });
  });

  test('current campaign-send entitlement is revalidated', async () => {
    const fixture = makeFixture();
    for (let index = 0; index < 5; index += 1) {
      fixture.db.tables.campaigns.set(`extra_campaign_${index}`, {
        ...fixture.campaign,
        _id: `extra_campaign_${index}`,
        source: 'manual',
      });
    }
    expect(await start(fixture)).toMatchObject({
      failureCode: 'CAMPAIGN_SEND_ENTITLEMENT_UNAVAILABLE',
    });
  });
});

describe('Smart Manager immutable execution binding', () => {
  test('11 changed campaign title invalidates', async () => {
    const fixture = makeFixture();
    await fixture.db.patch('campaign_1', { messageTitle: 'mutated' });
    expect(await start(fixture)).toMatchObject({
      failureCode: 'IMMUTABLE_BINDING_INVALID',
    });
  });

  test('12 changed campaign body invalidates', async () => {
    const fixture = makeFixture();
    await fixture.db.patch('campaign_1', { messageBody: 'mutated' });
    expect(await start(fixture)).toMatchObject({
      failureCode: 'IMMUTABLE_BINDING_INVALID',
    });
  });

  test('13 changed approved copy hash invalidates', async () => {
    const fixture = makeFixture();
    await fixture.db.patch('copy_1', { contentHash: 'corrupt' });
    expect(await start(fixture)).toMatchObject({
      failureCode: 'IMMUTABLE_BINDING_INVALID',
    });
  });

  test('14 changed decision hash invalidates', async () => {
    const fixture = makeFixture();
    await fixture.db.patch('run_1', { decisionHash: 'changed' });
    expect(await start(fixture)).toMatchObject({
      failureCode: 'IMMUTABLE_BINDING_INVALID',
    });
  });

  test('15 changed recipient count invalidates', async () => {
    const fixture = makeFixture();
    await fixture.db.patch('run_1', { totalExecutionRecipients: 2 });
    expect(await start(fixture)).toMatchObject({ failureCode: 'RECIPIENT_SET_INVALID' });
  });

  test('16 missing recipient binding invalidates', async () => {
    const fixture = makeFixture();
    await fixture.db.patch('recipient_1', { recipientBindingHash: undefined });
    expect(await start(fixture)).toMatchObject({ failureCode: 'RECIPIENT_SET_INVALID' });
  });
});

describe('Smart Manager in-app execution', () => {
  test('17 in-app recipient gets one durable inbox item', async () => {
    const fixture = makeFixture();
    await start(fixture);
    await claim(fixture);
    expect(fixture.db.rows('messageLog')).toHaveLength(1);
  });

  test('18 duplicate worker does not duplicate inbox item', async () => {
    const fixture = makeFixture();
    await start(fixture);
    await claim(fixture);
    await claim(fixture);
    expect(fixture.db.rows('messageLog')).toHaveLength(1);
  });

  test('19 inbox uses exact approved title and body', async () => {
    const fixture = makeFixture();
    await start(fixture);
    await claim(fixture);
    expect(fixture.db.rows('messageLog')[0].inboxPayload).toEqual({
      title: fixture.copy.title,
      body: fixture.copy.body,
    });
  });

  test('20 inbox item links campaign and existing run', async () => {
    const fixture = makeFixture();
    await start(fixture);
    await claim(fixture);
    expect(fixture.db.rows('messageLog')[0]).toMatchObject({
      campaignId: 'campaign_1',
      campaignRunId: 'run_1',
      notificationType: 'smart_manager_winback',
      smartManagerSource: 'smart_manager_delivery_v1',
    });
  });

  test('21 inbox payload does not copy recipient PII', async () => {
    const fixture = makeFixture();
    await start(fixture);
    await claim(fixture);
    const payload = fixture.db.rows('messageLog')[0].inboxPayload;
    expect(payload.email).toBeUndefined();
    expect(payload.userId).toBeUndefined();
  });

  test('22 durable in-app state means available, not opened', async () => {
    const fixture = makeFixture();
    await start(fixture);
    await claim(fixture);
    expect(fixture.db.rows('messageLog')[0]).toMatchObject({
      status: 'available',
      deliveryStatus: 'persisted_available',
    });
    expect(fixture.db.rows('messageLog')[0].readAt).toBeUndefined();
  });
});

describe('Smart Manager push execution and fallback', () => {
  test('23 push token is resolved at claim time', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const result = await claim(fixture);
    expect(result.status).toBe('claimed');
    expect(result.recipients[0].token).toContain('token-secret');
  });

  test('24 token secret is not persisted on run or audit', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    await claim(fixture);
    expect(JSON.stringify(await fixture.db.get('run_1'))).not.toContain('token-secret');
    expect(
      JSON.stringify(fixture.db.rows('smartManagerAuditEvents'))
    ).not.toContain('token-secret');
  });

  test('25 provider acceptance becomes push_accepted', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await finalize(fixture, claimed, {
      status: 'accepted',
      providerTicketId: 'ticket_1',
    });
    expect((await fixture.db.get('recipient_1')).executionState).toBe('push_accepted');
  });

  test('26 provider acceptance does not increment deliveredCount', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await finalize(fixture, claimed, { status: 'accepted' });
    expect((await fixture.db.get('run_1')).deliveredCount).toBe(0);
  });

  test('27 permanent invalid token is deactivated', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await finalize(fixture, claimed, {
      status: 'permanent_token_failure',
      code: 'PUSH_TOKEN_INVALID',
    });
    expect((await fixture.db.get('token_1')).isActive).toBe(false);
  });

  test('28 permanent invalid token creates fallback once', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await finalize(fixture, claimed, {
      status: 'permanent_token_failure',
      code: 'PUSH_TOKEN_INVALID',
    });
    await finalize(fixture, claimed, {
      status: 'permanent_token_failure',
      code: 'PUSH_TOKEN_INVALID',
    });
    expect(fixture.db.rows('messageLog')).toHaveLength(1);
  });

  test('29 missing token falls back without provider claim', async () => {
    const fixture = makeFixture(['push']);
    fixture.db.tables.pushTokens.clear();
    await start(fixture);
    expect((await claim(fixture)).status).toBe('complete');
    expect((await fixture.db.get('recipient_1')).fallbackReason).toBe(
      'PUSH_TOKEN_MISSING'
    );
  });

  test('30 first transient failure schedules retry without fallback', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await finalize(fixture, claimed, {
      status: 'transient_failure',
      code: 'PUSH_PROVIDER_TRANSIENT',
    });
    expect((await fixture.db.get('recipient_1')).executionState).toBe('retryable');
    expect(fixture.db.rows('messageLog')).toHaveLength(0);
  });

  test('31 max transient attempts end in one durable fallback', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    await fixture.db.patch('recipient_1', {
      attemptCount: SMART_MANAGER_MAX_PUSH_ATTEMPTS - 1,
    });
    const claimed = await claim(fixture);
    await finalize(fixture, claimed, {
      status: 'transient_failure',
      code: 'PUSH_PROVIDER_TRANSIENT',
    });
    expect((await fixture.db.get('recipient_1')).executionState).toBe(
      'in_app_available'
    );
    expect(fixture.db.rows('messageLog')).toHaveLength(1);
  });

  test('32 provider result cannot mutate approved content', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await finalize(fixture, claimed, {
      status: 'accepted',
      providerTicketId: 'safe_id',
    });
    expect((await fixture.db.get('campaign_1')).messageBody).toBe(fixture.copy.body);
  });
});

describe('Smart Manager leases, retries, and finalization', () => {
  test('33 duplicate worker cannot claim dispatching recipient', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    expect((await claim(fixture)).status).toBe('claimed');
    expect((await claim(fixture)).status).toBe('waiting');
  });

  test('34 stale lease cannot finalize a newer attempt', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await fixture.db.patch('recipient_1', { leaseGeneration: 99, leaseToken: 'newer' });
    await finalize(fixture, claimed, { status: 'accepted' });
    expect((await fixture.db.get('recipient_1')).executionState).toBe('dispatching');
  });

  test('35 expired dispatch lease recovers as ambiguous fallback', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    await claim(fixture);
    await fixture.db.patch('recipient_1', { leaseExpiresAt: 0 });
    await claim(fixture);
    expect((await fixture.db.get('recipient_1'))).toMatchObject({
      executionState: 'in_app_available',
      fallbackReason: 'PUSH_OUTCOME_AMBIGUOUS',
      providerStatus: 'ambiguous',
    });
  });

  test('invalidated run generation makes an in-flight finalizer stale', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await fixture.db.patch('run_1', {
      executionState: 'invalidated',
      deliveryGeneration: 2,
    });
    expect(
      (await finalize(fixture, claimed, { status: 'accepted' })).status
    ).toBe('stale');
    expect((await fixture.db.get('recipient_1')).executionState).toBe('dispatching');
  });

  test('36 retry attempt identity changes deterministically by generation', () => {
    const first = buildSmartManagerDeliveryAttemptId({
      campaignRunId: 'r',
      recipientKey: 'u',
      deliveryGeneration: 1,
      attemptNumber: 1,
      leaseGeneration: 1,
    });
    const second = buildSmartManagerDeliveryAttemptId({
      campaignRunId: 'r',
      recipientKey: 'u',
      deliveryGeneration: 1,
      attemptNumber: 2,
      leaseGeneration: 2,
    });
    expect(first).not.toBe(second);
  });

  test('37 lease token binds attempt and claim time', () => {
    expect(
      buildSmartManagerDeliveryLeaseToken({ attemptId: 'a', claimedAt: 1 })
    ).not.toBe(
      buildSmartManagerDeliveryLeaseToken({ attemptId: 'a', claimedAt: 2 })
    );
  });

  test('38 retry backoff is bounded and stepped', () => {
    expect(getSmartManagerPushBackoffMs(1)).toBeLessThan(
      getSmartManagerPushBackoffMs(2)
    );
    expect(getSmartManagerPushBackoffMs(99)).toBe(getSmartManagerPushBackoffMs(2));
  });

  test('39 worker claims are clamped to twenty-five', async () => {
    const fixture = makeFixture(Array.from({ length: 30 }, () => 'push'));
    await start(fixture);
    const result = await claim(fixture);
    expect(result.recipients).toHaveLength(SMART_MANAGER_DELIVERY_BATCH_SIZE);
  });

  test('40 partial batch leaves run resumable', async () => {
    const fixture = makeFixture(Array.from({ length: 30 }, () => 'push'));
    await start(fixture);
    const claimed = await claim(fixture);
    await finalize(fixture, claimed, { status: 'accepted' });
    expect((await fixture.db.get('run_1')).executionState).toBe('delivering');
    expect((await fixture.db.get('run_1')).deliveryCounters.pendingCount).toBe(5);
  });

  test('41 not-contactable recipient is terminal without an artifact', async () => {
    const fixture = makeFixture(['not_contactable']);
    await start(fixture);
    await claim(fixture);
    expect(fixture.db.rows('messageLog')).toHaveLength(0);
    expect((await fixture.db.get('run_1')).executionState).toBe('delivery_completed');
  });

  test('42 mixed successful channels reconcile separate counters', async () => {
    const fixture = makeFixture(['push', 'in_app', 'not_contactable']);
    await start(fixture);
    const claimed = await claim(fixture);
    await finalize(fixture, claimed, { status: 'accepted' });
    expect((await fixture.db.get('run_1')).deliveryCounters).toMatchObject({
      pushAcceptedCount: 1,
      inAppAvailableCount: 1,
      notContactableCount: 1,
      completedExecutionCount: 3,
    });
  });

  test('43 terminal account failure yields completed-with-failures', async () => {
    const fixture = makeFixture(['in_app']);
    await fixture.db.patch('customer_1', { isActive: false });
    await start(fixture);
    await claim(fixture);
    expect((await fixture.db.get('run_1')).executionState).toBe(
      'delivery_completed_with_failures'
    );
  });

  test('44 sentAt is absent until accepted or available evidence exists', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    await claim(fixture);
    expect((await fixture.db.get('run_1')).sentAt).toBeUndefined();
  });

  test(
    '45 sentAt appears after provider acceptance without claiming full delivery',
    async () => {
      const fixture = makeFixture(['push']);
      await start(fixture);
      const claimed = await claim(fixture);
      await finalize(fixture, claimed, { status: 'accepted' });
      const run = await fixture.db.get('run_1');
      expect(Number.isFinite(run.sentAt)).toBe(true);
      expect(run.deliveredCount).toBe(0);
    }
  );

  test('46 recovery sweep schedules ready and delivering runs', async () => {
    const fixture = makeFixture(['push', 'push']);
    const second = structuredClone(fixture.run);
    second._id = 'run_2';
    second.executionState = 'delivering';
    second.deliveryGeneration = 4;
    fixture.db.tables.campaignRuns.set(second._id, second);
    const result = await sweepSmartManagerDeliveriesInternal._handler(
      fixture.ctx,
      {}
    );
    expect(result.scheduled).toBe(2);
  });

  test(
    'run-level audit contains hashes and counters but no approved copy',
    async () => {
      const fixture = makeFixture(['in_app']);
      await start(fixture);
      await claim(fixture);
      const audits = fixture.db.rows('smartManagerAuditEvents');
      expect(audits.map((audit) => audit.eventType)).toEqual([
        'delivery_started',
        'delivery_completed',
      ]);
      expect(audits[1].detail.recipientSetHash).toBe(
        'immutable_recipient_set_hash'
      );
      expect(JSON.stringify(audits)).not.toContain(fixture.copy.body);
    }
  );
});

describe('Smart Manager execution evidence timestamps', () => {
  test('first acceptance sets sentAt and lastDeliveryAt to evidence time', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    const evidenceAt = Date.now() + 1_000;
    await withFixedNow(evidenceAt, async () => {
      await finalize(fixture, claimed, { status: 'accepted' });
    });
    expect(await fixture.db.get('run_1')).toMatchObject({
      sentAt: evidenceAt,
      lastDeliveryAt: evidenceAt,
    });
  });

  test('reconciliation without new evidence does not move lastDeliveryAt', async () => {
    const fixture = makeFixture(['push', 'push']);
    await start(fixture);
    const claimed = await claim(fixture);
    const generation = (await fixture.db.get('run_1')).deliveryGeneration;
    const firstEvidenceAt = Date.now() + 1_000;
    await withFixedNow(firstEvidenceAt, async () => {
      await finalizeResults(fixture, generation, [
        providerFinalization(claimed.recipients[0], { status: 'accepted' }),
      ]);
    });
    await withFixedNow(firstEvidenceAt + 60_000, async () => {
      await claim(fixture);
    });
    expect((await fixture.db.get('run_1')).lastDeliveryAt).toBe(
      firstEvidenceAt
    );
  });

  test('later actual execution evidence advances lastDeliveryAt', async () => {
    const fixture = makeFixture(['push', 'push']);
    await start(fixture);
    const claimed = await claim(fixture);
    const generation = (await fixture.db.get('run_1')).deliveryGeneration;
    const firstEvidenceAt = Date.now() + 1_000;
    const secondEvidenceAt = firstEvidenceAt + 1_000;
    await withFixedNow(firstEvidenceAt, async () => {
      await finalizeResults(fixture, generation, [
        providerFinalization(claimed.recipients[0], { status: 'accepted' }),
      ]);
    });
    await withFixedNow(secondEvidenceAt, async () => {
      await finalizeResults(fixture, generation, [
        providerFinalization(claimed.recipients[1], { status: 'accepted' }),
      ]);
    });
    expect(await fixture.db.get('run_1')).toMatchObject({
      sentAt: firstEvidenceAt,
      lastDeliveryAt: secondEvidenceAt,
    });
  });

  test('retry and lease activity do not create delivery timestamps', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await finalize(fixture, claimed, {
      status: 'transient_failure',
      code: 'PUSH_PROVIDER_TRANSIENT',
    });
    await claim(fixture);
    expect((await fixture.db.get('run_1')).sentAt).toBeUndefined();
    expect((await fixture.db.get('run_1')).lastDeliveryAt).toBeUndefined();
  });

  test('all-not-contactable run has no execution evidence timestamps', async () => {
    const fixture = makeFixture(['not_contactable']);
    await start(fixture);
    await claim(fixture);
    expect((await fixture.db.get('run_1')).sentAt).toBeUndefined();
    expect((await fixture.db.get('run_1')).lastDeliveryAt).toBeUndefined();
  });
});

describe('Smart Manager recovery fairness', () => {
  test('ready backlog reserves recovery capacity for delivering runs', async () => {
    const fixture = makeFixture();
    for (let index = 2; index <= 30; index += 1) {
      fixture.db.tables.campaignRuns.set(`ready_${index}`, {
        ...fixture.run,
        _id: `ready_${index}`,
      });
    }
    fixture.db.tables.campaignRuns.set('delivering_1', {
      ...fixture.run,
      _id: 'delivering_1',
      executionState: 'delivering',
      deliveryGeneration: 7,
    });

    await sweepSmartManagerDeliveriesInternal._handler(fixture.ctx, {});

    expect(
      fixture.scheduled.some(
        (job) =>
          job.args.campaignRunId === 'delivering_1' &&
          job.args.deliveryGeneration === 7
      )
    ).toBe(true);
  });

  test('delivering backlog reserves recovery capacity for ready runs', async () => {
    const fixture = makeFixture();
    for (let index = 1; index <= 30; index += 1) {
      fixture.db.tables.campaignRuns.set(`delivering_${index}`, {
        ...fixture.run,
        _id: `delivering_${index}`,
        executionState: 'delivering',
        deliveryGeneration: index,
      });
    }

    await sweepSmartManagerDeliveriesInternal._handler(fixture.ctx, {});

    expect(
      fixture.scheduled.some((job) => job.args.campaignRunId === 'run_1')
    ).toBe(true);
  });

  test('combined recovery scheduling remains hard bounded', async () => {
    const fixture = makeFixture();
    for (let index = 1; index <= 30; index += 1) {
      fixture.db.tables.campaignRuns.set(`ready_${index}`, {
        ...fixture.run,
        _id: `ready_${index}`,
      });
      fixture.db.tables.campaignRuns.set(`delivering_${index}`, {
        ...fixture.run,
        _id: `delivering_${index}`,
        executionState: 'delivering',
        deliveryGeneration: index,
      });
    }
    const result = await sweepSmartManagerDeliveriesInternal._handler(
      fixture.ctx,
      {}
    );

    expect(result.scheduled).toBeLessThanOrEqual(25);
    expect(
      fixture.scheduled.filter((job) => job.args.campaignRunId)
    ).toHaveLength(25);
    expect(
      fixture.scheduled.filter(
        (job) => !job.args.campaignRunId && Object.keys(job.args).length === 0
      )
    ).toHaveLength(1);
  });

  test('duplicate recovery invocation remains bounded and non-mutating', async () => {
    const fixture = makeFixture();
    for (let index = 1; index <= 30; index += 1) {
      fixture.db.tables.campaignRuns.set(`ready_${index}`, {
        ...fixture.run,
        _id: `ready_${index}`,
      });
      fixture.db.tables.campaignRuns.set(`delivering_${index}`, {
        ...fixture.run,
        _id: `delivering_${index}`,
        executionState: 'delivering',
        deliveryGeneration: index,
      });
    }
    const first = await sweepSmartManagerDeliveriesInternal._handler(
      fixture.ctx,
      {}
    );
    const second = await sweepSmartManagerDeliveriesInternal._handler(
      fixture.ctx,
      {}
    );

    expect(first.scheduled).toBe(25);
    expect(second.scheduled).toBe(25);
    expect((await fixture.db.get('run_1')).executionState).toBe(
      'ready_for_delivery'
    );
  });
});

describe('Smart Manager post-call authority races', () => {
  test('accepted evidence survives subscription revocation', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await fixture.db.patch('business_1', {
      subscriptionPlan: 'pro',
      subscriptionStatus: 'inactive',
    });
    fixture.scheduled.length = 0;

    await finalize(fixture, claimed, { status: 'accepted' });

    expect((await fixture.db.get('recipient_1')).executionState).toBe(
      'push_accepted'
    );
    expect(await fixture.db.get('run_1')).toMatchObject({
      executionState: 'invalidated',
      deliveryFailureCode: 'SUBSCRIPTION_INACTIVE',
      deliveryCounters: { pushAcceptedCount: 1 },
    });
    expect(fixture.scheduled).toHaveLength(0);
  });

  test('accepted evidence survives business closure before finalize', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await fixture.db.patch('business_1', { isActive: false });
    fixture.scheduled.length = 0;

    await finalize(fixture, claimed, { status: 'accepted' });

    expect((await fixture.db.get('recipient_1')).executionState).toBe(
      'push_accepted'
    );
    expect(await fixture.db.get('run_1')).toMatchObject({
      executionState: 'invalidated',
      deliveryFailureCode: 'BUSINESS_INACTIVE',
    });
    expect(fixture.scheduled).toHaveLength(0);
  });

  test('failed result after revocation creates no retry or fallback', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await fixture.db.patch('business_1', { isActive: false });
    fixture.scheduled.length = 0;

    await finalize(fixture, claimed, {
      status: 'transient_failure',
      code: 'PUSH_PROVIDER_TRANSIENT',
    });

    const recipient = await fixture.db.get('recipient_1');
    expect(recipient).toMatchObject({
      executionState: 'invalidated',
      lastFailureCode: 'PUSH_PROVIDER_TRANSIENT',
      nextAttemptAt: undefined,
    });
    expect(recipient).not.toHaveProperty('fallbackToInApp');
    expect(fixture.db.rows('messageLog')).toHaveLength(0);
    expect(fixture.scheduled).toHaveLength(0);
  });

  test('deleted recipient remains absent when stale finalizer returns', async () => {
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    const claimedGeneration = (await fixture.db.get('run_1'))
      .deliveryGeneration;
    await fixture.db.delete('recipient_1');
    await fixture.db.patch('run_1', {
      executionState: 'invalidated',
      deliveryGeneration: claimedGeneration + 1,
    });

    const result = await finalizeResults(fixture, claimedGeneration, [
      providerFinalization(claimed.recipients[0], { status: 'accepted' }),
    ]);

    expect(result.status).toBe('stale');
    expect(await fixture.db.get('recipient_1')).toBeNull();
  });
});

describe('Smart Manager provider boundary and closed semantics', () => {
  test('47 Expo ok ticket is accepted rather than delivered', () => {
    expect(
      classifySmartManagerExpoTicket({ status: 'ok', id: 'ticket_1' })
    ).toEqual({
      status: 'accepted',
      providerTicketId: 'ticket_1',
    });
  });

  test('48 DeviceNotRegistered is a permanent token failure', () => {
    expect(
      classifySmartManagerExpoTicket({
        status: 'error',
        details: { error: 'DeviceNotRegistered' },
      })
    ).toEqual({
      status: 'permanent_token_failure',
      code: 'PUSH_TOKEN_INVALID',
    });
  });

  test('49 other provider rejection remains retryable', () => {
    expect(
      classifySmartManagerExpoTicket({
        status: 'error',
        details: { error: 'MessageRateExceeded' },
      })
    ).toEqual({
      status: 'transient_failure',
      code: 'PUSH_PROVIDER_REJECTED',
    });
  });

  test('50 unsafe provider ticket ids are discarded', () => {
    expect(
      sanitizeSmartManagerProviderTicketId('raw response with spaces')
    ).toBeUndefined();
  });

  test('51 deterministic inbox dedupe is recipient-run scoped', () => {
    expect(
      buildSmartManagerInboxDedupeKey({
        campaignRunId: 'r1',
        recipientKey: 'u1',
      })
    ).not.toBe(
      buildSmartManagerInboxDedupeKey({
        campaignRunId: 'r1',
        recipientKey: 'u2',
      })
    );
  });

  test('52 terminal-state helper excludes retryable and dispatching', () => {
    expect(isSmartManagerRecipientTerminal('retryable')).toBe(false);
    expect(isSmartManagerRecipientTerminal('dispatching')).toBe(false);
    expect(isSmartManagerRecipientTerminal('push_accepted')).toBe(true);
  });

  test('53 provider batch preserves exact approved content', async () => {
    let payload = null;
    globalThis.fetch = async (_url, init) => {
      payload = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [{ status: 'ok', id: 'ticket_1' }] }),
      };
    };
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    await sendSmartManagerPushBatch(claimed.recipients);
    expect(payload[0].title).toBe(fixture.copy.title);
    expect(payload[0].body).toBe(fixture.copy.body);
  });

  test('54 ambiguous transport failure uses conservative result', async () => {
    globalThis.fetch = async () => {
      throw new Error('raw network secret must not persist');
    };
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    const results = await sendSmartManagerPushBatch(claimed.recipients);
    expect(results).toEqual([
      { status: 'ambiguous_failure', code: 'PUSH_OUTCOME_AMBIGUOUS' },
    ]);
    await finalize(fixture, claimed, results[0]);
    expect(await fixture.db.get('recipient_1')).toMatchObject({
      executionState: 'in_app_available',
      fallbackReason: 'PUSH_OUTCOME_AMBIGUOUS',
      nextAttemptAt: undefined,
    });
    expect(fixture.db.rows('messageLog')).toHaveLength(1);
  });

  test('fetch ambiguity falls back once without a push retry state', async () => {
    globalThis.fetch = async () => {
      throw new Error('request outcome unknown');
    };
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    const results = await sendSmartManagerPushBatch(claimed.recipients);
    await finalize(fixture, claimed, results[0]);

    expect(await fixture.db.get('recipient_1')).toMatchObject({
      executionState: 'in_app_available',
      fallbackReason: 'PUSH_OUTCOME_AMBIGUOUS',
      providerStatus: 'ambiguous',
      nextAttemptAt: undefined,
    });
    expect(fixture.db.rows('messageLog')).toHaveLength(1);
  });

  test('HTTP 503 remains bounded retryable', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      json: async () => null,
    });
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    expect(await sendSmartManagerPushBatch(claimed.recipients)).toEqual([
      { status: 'transient_failure', code: 'PUSH_PROVIDER_TRANSIENT' },
    ]);
  });

  test('HTTP 429 remains bounded retryable', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => null,
    });
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    expect(await sendSmartManagerPushBatch(claimed.recipients)).toEqual([
      { status: 'transient_failure', code: 'PUSH_PROVIDER_TRANSIENT' },
    ]);
  });

  test('definite HTTP 400 rejection is not blindly retried', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => null,
    });
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    expect(await sendSmartManagerPushBatch(claimed.recipients)).toEqual([
      { status: 'permanent_failure', code: 'PUSH_PROVIDER_REJECTED' },
    ]);
  });

  test('missing per-recipient ticket is ambiguous and never retryable', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    const results = await sendSmartManagerPushBatch(claimed.recipients);
    expect(results).toEqual([
      { status: 'ambiguous_failure', code: 'PUSH_OUTCOME_AMBIGUOUS' },
    ]);
    await finalize(fixture, claimed, results[0]);
    expect(await fixture.db.get('recipient_1')).toMatchObject({
      executionState: 'in_app_available',
      fallbackReason: 'PUSH_OUTCOME_AMBIGUOUS',
      nextAttemptAt: undefined,
    });
    expect(fixture.db.rows('messageLog')).toHaveLength(1);
  });

  test('malformed successful response is ambiguous', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    });
    const fixture = makeFixture(['push']);
    await start(fixture);
    const claimed = await claim(fixture);
    expect(await sendSmartManagerPushBatch(claimed.recipients)).toEqual([
      { status: 'ambiguous_failure', code: 'PUSH_OUTCOME_AMBIGUOUS' },
    ]);
  });

  test('legacy Expo transport result fields remain available', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      json: async () => null,
    });
    const result = await sendExpoPushMessages([
      {
        to: 'ExponentPushToken[legacy]',
        title: 'Title',
        body: 'Body',
        sound: 'default',
        channelId: 'default',
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('expo_push_http_503');
    expect(result.failureKind).toBe('http_rejected');
  });
});
