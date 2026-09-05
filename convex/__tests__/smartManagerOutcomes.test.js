import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  isQualifyingSmartManagerReturnEvent,
  emptySmartManagerOutcomeCounters,
  ensureSmartManagerOutcomeForContact,
  markSmartManagerOutcomeDirty,
  SMART_MANAGER_OUTCOME_DIRTY_BATCH_SIZE,
  SMART_MANAGER_OUTCOME_EVENT_BATCH_SIZE,
  SMART_MANAGER_OUTCOME_EXPIRY_BATCH_SIZE,
  smartManagerRecipientBindingsAreStructurallyValid,
  sortEligibleLastTouchOutcomes,
  shouldContinueSmartManagerOutcomeSweep,
  transitionSmartManagerOutcomeState,
} from '../lib/smartManagerOutcomes';
import { buildSmartManagerRecipientBindingHash } from '../lib/smartManagerExecution';
import {
  SMART_MANAGER_POLICY_V1_HASH,
  SMART_MANAGER_POLICY_V1_VERSION,
} from '../lib/smartManagerPolicy';
import {
  attributeQualifyingEvent,
  buildRunResultSummary,
  retractReversedQualifyingEvent,
} from '../smartManagerOutcomes';
import { deleteSmartManagerOutcomesForAccount } from '../users';

const source = readFileSync(
  new URL('../smartManagerOutcomes.ts', import.meta.url),
  'utf8'
);
const scannerSource = readFileSync(
  new URL('../scanner.ts', import.meta.url),
  'utf8'
);
const deletionSource = readFileSync(
  new URL('../businessDeletion.ts', import.meta.url),
  'utf8'
);
const accountDeletionSource = readFileSync(
  new URL('../users.ts', import.meta.url),
  'utf8'
);

function outcome(overrides = {}) {
  return {
    state: 'awaiting_return',
    contactEvidenceAt: 1_000,
    outcomeWindowEndsAt: 2_000,
    attributionTieBreaker: 'run_a',
    ...overrides,
  };
}

describe('Smart Manager returned-after-campaign temporal truth', () => {
  test('activity before contact evidence does not count', () => {
    expect(sortEligibleLastTouchOutcomes([outcome()], 900)).toEqual([]);
  });

  test('activity after contact and inside the window counts', () => {
    expect(sortEligibleLastTouchOutcomes([outcome()], 1_500)).toHaveLength(1);
  });

  test('activity after the outcome window does not count', () => {
    expect(sortEligibleLastTouchOutcomes([outcome()], 2_001)).toEqual([]);
  });

  test('a recipient without persisted contact evidence has no candidate', () => {
    expect(sortEligibleLastTouchOutcomes([], 1_500)).toEqual([]);
  });

  test('scanner resolve/preview and failed actions are not qualifying activity', () => {
    expect(
      isQualifyingSmartManagerReturnEvent({
        type: 'SCANNER_RESOLVED',
        customerUserId: 'user_1',
      })
    ).toBe(false);
    expect(
      isQualifyingSmartManagerReturnEvent({
        type: 'STAMP_REVERTED',
        customerUserId: 'user_1',
      })
    ).toBe(false);
    expect(
      isQualifyingSmartManagerReturnEvent({
        type: 'STAMP_FAILED',
        customerUserId: 'user_1',
      })
    ).toBe(false);
  });

  test('only committed, unreversed loyalty event types qualify', () => {
    for (const type of [
      'STAMP_ADDED',
      'REWARD_REDEEMED',
      'REFERRAL_BENEFIT_REDEEMED',
    ]) {
      expect(
        isQualifyingSmartManagerReturnEvent({
          type,
          customerUserId: 'user_1',
        })
      ).toBe(true);
    }
    expect(
      isQualifyingSmartManagerReturnEvent({
        type: 'STAMP_ADDED',
        customerUserId: 'user_1',
        reversalEventId: 'reverse_1',
      })
    ).toBe(false);
  });
});

describe('Smart Manager deterministic last-touch attribution', () => {
  test('newest prior contact owns an overlapping return', () => {
    const selected = sortEligibleLastTouchOutcomes(
      [
        outcome({ contactEvidenceAt: 1_100, attributionTieBreaker: 'run_a' }),
        outcome({ contactEvidenceAt: 1_300, attributionTieBreaker: 'run_b' }),
      ],
      1_500
    );
    expect(selected[0].attributionTieBreaker).toBe('run_b');
  });

  test('identical contact times use a stable descending tie-break', () => {
    const selected = sortEligibleLastTouchOutcomes(
      [outcome({ attributionTieBreaker: 'run_a' }), outcome({ attributionTieBreaker: 'run_b' })],
      1_500
    );
    expect(selected.map((row) => row.attributionTieBreaker)).toEqual([
      'run_b',
      'run_a',
    ]);
  });

  test('an already-returned older campaign is not eligible for reassignment', () => {
    const selected = sortEligibleLastTouchOutcomes(
      [
        outcome({ state: 'returned_after_campaign', attributionTieBreaker: 'run_a' }),
        outcome({ contactEvidenceAt: 1_300, attributionTieBreaker: 'run_b' }),
      ],
      1_500
    );
    expect(selected.map((row) => row.attributionTieBreaker)).toEqual(['run_b']);
  });

  test('recipient/run binding mismatch fails closed', () => {
    const recipient = {
      _id: 'recipient_1',
      businessId: 'business_1',
      campaignId: 'campaign_1',
      campaignRunId: 'run_1',
      userId: 'user_1',
      recipientKey: 'recipient_key',
      primaryMembershipId: 'membership_1',
      eligibilityBindingHash: 'eligibility_hash',
      channel: 'push',
    };
    recipient.recipientBindingHash = buildSmartManagerRecipientBindingHash({
      recipientKey: recipient.recipientKey,
      eligibilityBindingHash: recipient.eligibilityBindingHash,
      channel: recipient.channel,
    });
    expect(
      smartManagerRecipientBindingsAreStructurallyValid({
        run: {
          _id: 'run_1',
          businessId: 'business_1',
          campaignId: 'campaign_1',
          executionKind: 'smart_manager_v1',
        },
        recipient,
      })
    ).toBe(true);
    expect(
      smartManagerRecipientBindingsAreStructurallyValid({
        run: {
          _id: 'other_run',
          businessId: 'business_1',
          campaignId: 'campaign_1',
          executionKind: 'smart_manager_v1',
        },
        recipient,
      })
    ).toBe(false);
  });
});

describe('Smart Manager outcome processing contracts', () => {
  test('same qualifying activity is idempotent and first result is durable', () => {
    expect(source).toContain("withIndex('by_qualifyingEventId'");
    expect(source).toContain("'returned_after_campaign'");
    expect(source).toContain('const existingWinner = existingAttribution[0]');
  });

  test('older open contacts are durably superseded', () => {
    expect(source).toContain("transitionSmartManagerOutcomeState(ctx, older, 'superseded'");
    expect(source).toContain('supersededByOutcomeId: args.winner._id');
  });

  test('cross-business activity is isolated by the compound index', () => {
    expect(source).toContain(".eq('businessId', event.businessId)");
    expect(source).toContain(".eq('userId', event.customerUserId)");
  });

  test('processing and expiry have explicit hard bounds and no collect', () => {
    expect(SMART_MANAGER_OUTCOME_EVENT_BATCH_SIZE).toBe(10);
    expect(SMART_MANAGER_OUTCOME_DIRTY_BATCH_SIZE).toBe(5);
    expect(SMART_MANAGER_OUTCOME_EXPIRY_BATCH_SIZE).toBe(25);
    expect(source).not.toContain('.collect()');
    expect(source).toContain('.paginate({');
  });

  test('repeated processor invocation uses generation/cursor safety', () => {
    expect(source).toContain('current.generation !== snapshotGeneration');
    expect(source).toContain('eventCursor: page.continueCursor');
  });

  test('window expiry is server-time deterministic', () => {
    expect(source).toContain(".lte('outcomeWindowEndsAt', now)");
    expect(source).toContain("'window_expired'");
  });

  test('authorized run summary uses factual non-causal result names', () => {
    expect(source).toContain('contactedOrAvailableCount');
    expect(source).toContain('returnedAfterCampaignCount');
    expect(source).toContain('openOutcomeWindowCount');
    expect(source).toContain('expiredOutcomeWindowCount');
    expect(source).not.toMatch(/recoveredRevenue|ROI|becauseOfCampaign/);
    const summarySource = source.slice(source.indexOf('async function buildRunResultSummary'));
    expect(summarySource).not.toContain(".query('smartManagerRecipientOutcomes')");
  });

  test('scanner hot path only writes a deduplicated marker', () => {
    expect(scannerSource).toContain('markSmartManagerOutcomeDirty(ctx');
    expect(scannerSource).toContain('markSmartManagerOutcomeReversalDirty(ctx');
    expect(scannerSource).not.toContain('smartManagerRecipientOutcomes');
  });

  test('business deletion covers outcome records and dirty markers', () => {
    expect(deletionSource).toContain("table: 'smartManagerRecipientOutcomes'");
    expect(deletionSource).toContain("table: 'smartManagerOutcomeDirtyMarkers'");
    expect(deletionSource).toContain("table: 'smartManagerOutcomeReversalMarkers'");
  });

  test('account deletion removes customer-bound outcomes and dirty markers', () => {
    expect(accountDeletionSource).toContain("'smartManagerRecipientOutcomes'");
    expect(accountDeletionSource).toContain("'smartManagerOutcomeDirtyMarkers'");
    expect(accountDeletionSource).toContain("'smartManagerOutcomeReversalMarkers'");
  });
});

class BehaviorQuery {
  constructor(db, table, conditions = [], direction = 'asc') {
    this.db = db;
    this.table = table;
    this.conditions = conditions;
    this.direction = direction;
  }
  withIndex(_index, builder) {
    const conditions = [...this.conditions];
    const q = {};
    for (const operator of ['eq', 'lt', 'lte', 'gte']) {
      q[operator] = (field, value) => {
        conditions.push([operator, field, value]);
        return q;
      };
    }
    builder(q);
    return new BehaviorQuery(this.db, this.table, conditions, this.direction);
  }
  order(direction) {
    return new BehaviorQuery(this.db, this.table, this.conditions, direction);
  }
  rows() {
    const filtered = this.db.rows(this.table).filter((row) =>
      this.conditions.every(([operator, field, value]) => {
        if (operator === 'eq') return row[field] === value;
        if (operator === 'lt') return row[field] < value;
        if (operator === 'lte') return row[field] <= value;
        if (operator === 'gte') return row[field] >= value;
        return false;
      })
    );
    return [...filtered].sort((left, right) => {
      const comparison =
        (left.contactEvidenceAt ?? left.createdAt ?? 0) -
        (right.contactEvidenceAt ?? right.createdAt ?? 0);
      return this.direction === 'desc' ? -comparison : comparison;
    });
  }
  async take(limit) {
    return this.rows().slice(0, limit);
  }
  async first() {
    return this.rows()[0] ?? null;
  }
}

class BehaviorDb {
  constructor(tables = {}) {
    this.tables = structuredClone(tables);
    this.nextId = 1;
  }
  rows(table) {
    return (this.tables[table] ??= []);
  }
  query(table) {
    return new BehaviorQuery(this, table);
  }
  async get(id) {
    return Object.values(this.tables).flat().find((row) => row._id === id) ?? null;
  }
  async insert(table, value) {
    const row = { _id: `${table}_${this.nextId++}`, ...structuredClone(value) };
    this.rows(table).push(row);
    return row._id;
  }
  async patch(id, patch) {
    for (const rows of Object.values(this.tables)) {
      const index = rows.findIndex((row) => row._id === id);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...structuredClone(patch) };
        return;
      }
    }
    throw new Error(`PATCH_TARGET_NOT_FOUND:${id}`);
  }
  async delete(id) {
    for (const rows of Object.values(this.tables)) {
      const index = rows.findIndex((row) => row._id === id);
      if (index >= 0) {
        rows.splice(index, 1);
        return;
      }
    }
  }
}

function behaviorFixture() {
  const run = {
    _id: 'run_newer',
    businessId: 'business_1',
    campaignId: 'campaign_newer',
    executionKind: 'smart_manager_v1',
    policyVersion: SMART_MANAGER_POLICY_V1_VERSION,
    policyHash: SMART_MANAGER_POLICY_V1_HASH,
    outcomeCounters: emptySmartManagerOutcomeCounters(),
    deliveryCounters: { pushAcceptedCount: 1, inAppAvailableCount: 0 },
  };
  const olderRun = {
    ...run,
    _id: 'run_older',
    campaignId: 'campaign_older',
    outcomeCounters: emptySmartManagerOutcomeCounters(),
  };
  const makeRecipient = (currentRun, id, contactEvidenceAt) => {
    const recipient = {
      _id: id,
      businessId: currentRun.businessId,
      campaignId: currentRun.campaignId,
      campaignRunId: currentRun._id,
      userId: 'customer_1',
      recipientKey: `key_${id}`,
      primaryMembershipId: 'membership_1',
      eligibilityBindingHash: `eligibility_${id}`,
      channel: 'push',
      executionState: 'push_accepted',
      terminalAt: contactEvidenceAt,
    };
    recipient.recipientBindingHash = buildSmartManagerRecipientBindingHash({
      recipientKey: recipient.recipientKey,
      eligibilityBindingHash: recipient.eligibilityBindingHash,
      channel: recipient.channel,
    });
    return recipient;
  };
  const newerRecipient = makeRecipient(run, 'recipient_newer', 1_200);
  const olderRecipient = makeRecipient(olderRun, 'recipient_older', 1_000);
  const event = {
    _id: 'event_return_1',
    type: 'STAMP_ADDED',
    businessId: 'business_1',
    customerUserId: 'customer_1',
    createdAt: 1_500,
  };
  const db = new BehaviorDb({
    campaignRuns: [run, olderRun],
    campaignRunRecipients: [newerRecipient, olderRecipient],
    smartManagerRecipientOutcomes: [],
    smartManagerOutcomeDirtyMarkers: [],
    events: [event],
  });
  return { ctx: { db }, run, olderRun, newerRecipient, olderRecipient, event };
}

async function createContactOutcome(ctx, run, recipient) {
  return await ensureSmartManagerOutcomeForContact(ctx, {
    run,
    recipient,
    contactEvidenceKind: 'push_accepted',
    contactEvidenceAt: recipient.terminalAt,
  });
}

describe('Smart Manager executable outcome transitions', () => {
  test('initialization and awaiting to returned are counter-safe on retry', async () => {
    const fixture = behaviorFixture();
    await createContactOutcome(fixture.ctx, fixture.run, fixture.newerRecipient);
    await createContactOutcome(fixture.ctx, fixture.run, fixture.newerRecipient);
    expect((await fixture.ctx.db.get('run_newer')).outcomeCounters.awaitingReturnCount).toBe(1);
    expect(fixture.ctx.db.rows('smartManagerRecipientOutcomes')).toHaveLength(1);

    await attributeQualifyingEvent(fixture.ctx, fixture.event);
    await attributeQualifyingEvent(fixture.ctx, fixture.event);
    expect((await fixture.ctx.db.get('run_newer')).outcomeCounters).toEqual({
      awaitingReturnCount: 0,
      returnedAfterCampaignCount: 1,
      windowExpiredCount: 0,
      supersededCount: 0,
      notEligibleCount: 0,
    });
  });

  test('awaiting to expired updates counters exactly once', async () => {
    const fixture = behaviorFixture();
    const outcomeId = await createContactOutcome(
      fixture.ctx,
      fixture.run,
      fixture.newerRecipient
    );
    const created = await fixture.ctx.db.get(outcomeId);
    await transitionSmartManagerOutcomeState(fixture.ctx, created, 'window_expired', {
      terminalAt: created.outcomeWindowEndsAt,
    });
    await transitionSmartManagerOutcomeState(fixture.ctx, created, 'window_expired', {});
    expect((await fixture.ctx.db.get('run_newer')).outcomeCounters).toEqual({
      awaitingReturnCount: 0,
      returnedAfterCampaignCount: 0,
      windowExpiredCount: 1,
      supersededCount: 0,
      notEligibleCount: 0,
    });
  });

  test('overlap supersession retracts on reversal and accepts a later event', async () => {
    const fixture = behaviorFixture();
    await createContactOutcome(fixture.ctx, fixture.olderRun, fixture.olderRecipient);
    await createContactOutcome(fixture.ctx, fixture.run, fixture.newerRecipient);
    await attributeQualifyingEvent(fixture.ctx, fixture.event);
    expect((await fixture.ctx.db.get('run_older')).outcomeCounters.supersededCount).toBe(1);

    await fixture.ctx.db.patch(fixture.event._id, { reversalEventId: 'reversal_1' });
    await fixture.ctx.db.insert('events', {
      _id: 'reversal_1',
      type: 'STAMP_REVERTED',
      businessId: 'business_1',
      customerUserId: 'customer_1',
      revertsEventId: fixture.event._id,
      createdAt: 1_600,
    });
    await fixture.ctx.db.insert('smartManagerOutcomeReversalMarkers', {
      _id: 'reversal_marker_1',
      businessId: 'business_1',
      userId: 'customer_1',
      originalEventId: fixture.event._id,
      originalActivityAt: fixture.event.createdAt,
      reversalAt: 1_600,
      createdAt: 1_600,
      updatedAt: 1_600,
    });
    await retractReversedQualifyingEvent(
      fixture.ctx,
      await fixture.ctx.db.get('reversal_marker_1'),
      2_000_000_000
    );
    expect((await fixture.ctx.db.get('run_newer')).outcomeCounters.windowExpiredCount).toBe(1);
    expect((await fixture.ctx.db.get('run_older')).outcomeCounters.windowExpiredCount).toBe(1);
    const retracted = fixture.ctx.db
      .rows('smartManagerRecipientOutcomes')
      .find((row) => row.campaignRunId === 'run_newer');
    expect(retracted.qualifyingEventId).toBeUndefined();
    expect(retracted.qualifyingActivityAt).toBeUndefined();
    expect(retracted.recordedAt).toBeUndefined();

    const replacement = {
      _id: 'event_return_2',
      type: 'REWARD_REDEEMED',
      businessId: 'business_1',
      customerUserId: 'customer_1',
      createdAt: 1_550,
    };
    await fixture.ctx.db.insert('events', replacement);
    await attributeQualifyingEvent(fixture.ctx, replacement, {
      includeExpiredOutcomes: true,
    });
    expect((await fixture.ctx.db.get('run_newer')).outcomeCounters).toMatchObject({
      returnedAfterCampaignCount: 1,
      windowExpiredCount: 0,
    });
    expect((await fixture.ctx.db.get('run_older')).outcomeCounters).toMatchObject({
      supersededCount: 1,
      windowExpiredCount: 0,
    });
  });

  test('terminal row purge leaves durable aggregate results intact', async () => {
    const fixture = behaviorFixture();
    const outcomeId = await createContactOutcome(
      fixture.ctx,
      fixture.run,
      fixture.newerRecipient
    );
    await attributeQualifyingEvent(fixture.ctx, fixture.event);
    await fixture.ctx.db.delete(outcomeId);
    const summary = await buildRunResultSummary(
      fixture.ctx,
      await fixture.ctx.db.get('run_newer')
    );
    expect(summary.returnedAfterCampaignCount).toBe(1);
    expect(fixture.ctx.db.rows('smartManagerRecipientOutcomes')).toHaveLength(0);
  });
});

describe('Smart Manager account deletion aggregate reconciliation', () => {
  test('open becomes not eligible while legitimate returned history survives', async () => {
    const counters = emptySmartManagerOutcomeCounters();
    const db = new BehaviorDb({
      campaignRuns: [
        {
          _id: 'run_open',
          executionKind: 'smart_manager_v1',
          outcomeCounters: { ...counters, awaitingReturnCount: 1 },
        },
        {
          _id: 'run_returned',
          executionKind: 'smart_manager_v1',
          outcomeCounters: { ...counters, returnedAfterCampaignCount: 1 },
        },
      ],
      smartManagerRecipientOutcomes: [
        {
          _id: 'outcome_open',
          userId: 'customer_delete',
          campaignRunId: 'run_open',
          state: 'awaiting_return',
        },
        {
          _id: 'outcome_returned',
          userId: 'customer_delete',
          campaignRunId: 'run_returned',
          state: 'returned_after_campaign',
          qualifyingEventId: 'event_valid_return',
        },
      ],
      events: [{ _id: 'event_valid_return', type: 'STAMP_ADDED' }],
    });
    const ctx = { db };
    expect(
      await deleteSmartManagerOutcomesForAccount(
        ctx,
        'customer_delete',
        1
      )
    ).toBe(2);
    expect((await db.get('run_open')).outcomeCounters).toMatchObject({
      awaitingReturnCount: 0,
      notEligibleCount: 1,
    });
    expect((await db.get('run_returned')).outcomeCounters).toMatchObject({
      returnedAfterCampaignCount: 1,
      notEligibleCount: 0,
    });
    expect(db.rows('smartManagerRecipientOutcomes')).toHaveLength(0);

    expect(
      await deleteSmartManagerOutcomesForAccount(
        ctx,
        'customer_delete',
        1
      )
    ).toBe(0);
    expect((await db.get('run_open')).outcomeCounters).toMatchObject({
      awaitingReturnCount: 0,
      notEligibleCount: 1,
    });
  });

  test('known-reversed returned history is not preserved during deletion', async () => {
    const counters = emptySmartManagerOutcomeCounters();
    const db = new BehaviorDb({
      campaignRuns: [{
        _id: 'run_reversed',
        executionKind: 'smart_manager_v1',
        outcomeCounters: { ...counters, returnedAfterCampaignCount: 1 },
      }],
      smartManagerRecipientOutcomes: [{
        _id: 'outcome_reversed',
        userId: 'customer_delete',
        campaignRunId: 'run_reversed',
        state: 'returned_after_campaign',
        qualifyingEventId: 'event_reversed',
      }],
      events: [{
        _id: 'event_reversed',
        type: 'REWARD_REDEEMED',
        reversalEventId: 'reversal_1',
      }],
    });
    await deleteSmartManagerOutcomesForAccount(
      { db },
      'customer_delete',
      1
    );
    expect((await db.get('run_reversed')).outcomeCounters).toMatchObject({
      returnedAfterCampaignCount: 0,
      notEligibleCount: 1,
    });
  });
});

describe('Smart Manager marker gating and continuation policy', () => {
  test('normal activity without an awaiting outcome creates no marker', async () => {
    const db = new BehaviorDb({
      smartManagerRecipientOutcomes: [],
      smartManagerOutcomeDirtyMarkers: [],
    });
    expect(await markSmartManagerOutcomeDirty({ db }, {
      businessId: 'business_1',
      userId: 'customer_1',
      activityAt: 100,
    })).toEqual({ marked: false, created: false });
    expect(db.rows('smartManagerOutcomeDirtyMarkers')).toHaveLength(0);
  });

  test('awaiting activity creates and coalesces one marker', async () => {
    const db = new BehaviorDb({
      smartManagerRecipientOutcomes: [{
        _id: 'outcome_waiting',
        businessId: 'business_1',
        userId: 'customer_1',
        state: 'awaiting_return',
        contactEvidenceAt: 1,
      }],
      smartManagerOutcomeDirtyMarkers: [],
    });
    await markSmartManagerOutcomeDirty({ db }, {
      businessId: 'business_1',
      userId: 'customer_1',
      activityAt: 100,
    });
    await markSmartManagerOutcomeDirty({ db }, {
      businessId: 'business_1',
      userId: 'customer_1',
      activityAt: 200,
    });
    expect(db.rows('smartManagerOutcomeDirtyMarkers')).toHaveLength(1);
    expect(db.rows('smartManagerOutcomeDirtyMarkers')[0]).toMatchObject({
      earliestActivityAt: 100,
      latestActivityAt: 200,
      generation: 2,
    });
  });

  test('reversal reprocessing is not suppressed without an awaiting outcome', async () => {
    const db = new BehaviorDb({
      smartManagerRecipientOutcomes: [],
      smartManagerOutcomeDirtyMarkers: [],
    });
    expect(await markSmartManagerOutcomeDirty({ db }, {
      businessId: 'business_1',
      userId: 'customer_1',
      activityAt: 100,
      includeExpiredOutcomes: true,
    })).toEqual({ marked: true, created: true });
    expect(db.rows('smartManagerOutcomeDirtyMarkers')).toHaveLength(1);
  });

  test('full or unfinished work continues, partial completed work stops', () => {
    const partial = {
      reversalMarkerCount: 0,
      dirtyMarkerCount: 1,
      expiredOutcomeCount: 0,
      purgeableOutcomeCount: 0,
      hasUnfinishedDirtyMarker: false,
    };
    expect(shouldContinueSmartManagerOutcomeSweep(partial)).toBe(false);
    expect(
      shouldContinueSmartManagerOutcomeSweep({
        ...partial,
        dirtyMarkerCount: SMART_MANAGER_OUTCOME_DIRTY_BATCH_SIZE,
      })
    ).toBe(true);
    expect(
      shouldContinueSmartManagerOutcomeSweep({
        ...partial,
        hasUnfinishedDirtyMarker: true,
      })
    ).toBe(true);
    expect(source).toContain('ctx.scheduler.runAfter(');
    expect(source).not.toContain('.collect()');
    expect(source).not.toMatch(/while\s*\(/);
  });
});
