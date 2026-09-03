import { describe, expect, test } from 'bun:test';
import {
  assertAiExecutionQuotaAvailable,
  countsTowardLegacyDailyAiLimit,
  finalizeAiRecommendationFailureInternal,
  finalizeAiRecommendationQuotaFallbackInternal,
  finalizeAiRecommendationSuccessInternal,
  toLegacyAiTokenCounts,
} from '../aiRecommendations';
import { countAiExecutionsForBusinessInMonth } from '../entitlements';
import { generateOpenRouterJson } from '../lib/aiJsonGeneration';
import { monthKeyFromTimestamp } from '../lib/recommendationUtils';

class FakeQuery {
  constructor(db, tableName) {
    this.db = db;
    this.tableName = tableName;
    this.predicates = [];
  }

  withIndex(_indexName, builder) {
    const conditions = [];
    const q = {
      eq: (field, value) => {
        conditions.push({ field, op: 'eq', value });
        return q;
      },
      gte: (field, value) => {
        conditions.push({ field, op: 'gte', value });
        return q;
      },
    };
    builder(q);
    this.predicates.push((doc) =>
      conditions.every((condition) => {
        if (condition.op === 'gte') {
          return doc[condition.field] >= condition.value;
        }
        return doc[condition.field] === condition.value;
      })
    );
    return this;
  }

  async collect() {
    return this.db
      .rows(this.tableName)
      .filter((doc) => this.predicates.every((predicate) => predicate(doc)));
  }

  async first() {
    return (await this.collect())[0] ?? null;
  }
}

class FakeDb {
  constructor(tables) {
    this.tables = tables;
    this.counter = 0;
  }

  query(tableName) {
    return new FakeQuery(this, tableName);
  }

  rows(tableName) {
    if (!this.tables[tableName]) {
      this.tables[tableName] = [];
    }
    return this.tables[tableName];
  }

  async get(id) {
    for (const tableName of Object.keys(this.tables)) {
      const row = this.rows(tableName).find((doc) => doc._id === id);
      if (row) {
        return row;
      }
    }
    return null;
  }

  async insert(tableName, value) {
    this.counter += 1;
    const row = { ...value, _id: value._id ?? `${tableName}_${this.counter}` };
    this.rows(tableName).push(row);
    return row._id;
  }

  async patch(id, patch) {
    for (const tableName of Object.keys(this.tables)) {
      const rows = this.rows(tableName);
      const index = rows.findIndex((doc) => doc._id === id);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...patch };
        return;
      }
    }
    throw new Error(`PATCH_TARGET_NOT_FOUND:${id}`);
  }
}

function buildBusiness(overrides = {}) {
  const now = Date.now();
  return {
    _id: 'business_1',
    _creationTime: now,
    ownerUserId: 'owner_1',
    externalId: 'biz-ext-1',
    name: 'Quota Test Business',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    subscriptionPlan: 'pro',
    subscriptionStatus: 'active',
    subscriptionStartAt: now,
    subscriptionEndAt: null,
    billingPeriod: 'monthly',
    ...overrides,
  };
}

function buildSnapshot(overrides = {}) {
  const now = Date.now();
  return {
    package_plan: 'pro',
    normalized_business_profile: {
      business_type: 'cafe',
      service_name: 'visit',
      service_category: 'food_drink',
      customer_cycle_days: 14,
      reward_type: 'stamp',
      reward_threshold: 10,
      language: 'he',
      brand_style: 'friendly',
      business_model: 'product',
    },
    key_performance_metrics: {
      total_customers: 80,
      active_customers_30d: 50,
      inactive_customers_60d: 12,
      new_customers_30d: 8,
      visits_7d: 12,
      visits_30d: 40,
      visits_prev_30d: 55,
      customers_close_to_reward: 9,
      reward_redemptions_30d: 3,
      avg_days_between_visits: 9,
      campaigns_30d: 1,
      inactive_customers_dynamic: 14,
      inactive_rate_dynamic: 0.175,
      close_to_reward_rate: 0.1125,
      redemption_rate_30d: 0.075,
      activity_drop_pct_30d: 0.27,
      joined_never_returned: 4,
      previously_active_now_inactive: 10,
      active_primary_members: 70,
    },
    signal_quality: 'performance_ready',
    customer_state: {},
    product_usage_state: {
      has_active_loyalty_card: true,
      active_program_count: 1,
      card_recently_changed: false,
      changed_card_days_ago: 60,
      campaigns_30d: 1,
      campaigns_all_time: 3,
      has_recent_campaign: false,
      has_ever_sent_campaign: true,
      has_ever_sent_welcome_campaign: true,
      has_recent_welcome_campaign: true,
      has_ready_campaign_summary: false,
      recommendation_usage_30d: 0,
      profile_basics_complete: true,
      second_program_supported: false,
    },
    cooldown_quota_state: {},
    detected_states: ['ACTIVITY_DROP'],
    top_priority_state: 'ACTIVITY_DROP',
    enough_data: true,
    enough_data_reasons: [],
    required_dates: {
      business_created_at: now - 90 * 24 * 60 * 60 * 1000,
      loyalty_card_created_at: now - 80 * 24 * 60 * 60 * 1000,
      loyalty_card_updated_at: now - 60 * 24 * 60 * 60 * 1000,
      last_campaign_at: now - 20 * 24 * 60 * 60 * 1000,
      last_ai_recommendation_at: null,
      last_event_detected_at: now - 24 * 60 * 60 * 1000,
      last_reward_redeemed_at: now - 10 * 24 * 60 * 60 * 1000,
    },
    state_signal: 'activity_drop',
    state_hash: 'state_hash_1',
    ...overrides,
  };
}

function buildUsageRow(index, now, overrides = {}) {
  return {
    _id: `usage_${index}`,
    businessId: 'business_1',
    monthKey: monthKeyFromTimestamp(now),
    requestType: 'business_insight',
    model: 'test-model',
    cacheHit: false,
    status: 'success',
    inputTokens: 10,
    outputTokens: 5,
    costEstimate: 0.001,
    createdAt: now - index,
    ...overrides,
  };
}

function baseTables({ business = buildBusiness(), usageRows = [] } = {}) {
  const now = Date.now();
  return {
    businesses: [business],
    campaigns: [],
    referralConfigs: [],
    aiUsageLedger: usageRows,
    aiRecommendations: [],
    aiGenerationCache: [],
    aiBusinessSnapshots: [
      {
        _id: 'snapshot_1',
        businessId: business._id,
        scannedAt: now,
        enoughData: true,
        enoughDataReasons: [],
        topBusinessState: 'ACTIVITY_DROP',
        stateHash: 'state_hash_1',
        snapshot: buildSnapshot(),
        createdAt: now,
      },
    ],
  };
}

function buildCtx(tables) {
  return { db: new FakeDb(tables) };
}

function successArgs(now = Date.now()) {
  return {
    businessId: 'business_1',
    snapshotId: 'snapshot_1',
    stateKey: 'ACTIVITY_DROP',
    goal: 'business_insight',
    outputType: 'business_insight',
    primaryCta: { kind: 'view_analytics', label: 'Open analytics' },
    dedupeKey: 'dedupe_1',
    promptHash: 'prompt_hash_1',
    cacheKey: 'cache_key_1',
    inputSignature: 'input_signature_1',
    title: 'Review activity drop',
    message: 'Visits dropped compared with the previous period.',
    inputTokens: 100,
    outputTokens: 20,
    costEstimate: 0.001,
    now,
  };
}

async function convexErrorData(work) {
  try {
    await work();
  } catch (error) {
    return error?.data ?? null;
  }
  return null;
}

describe('AI recommendation monthly quota boundary', () => {
  test('shared JSON transport preserves the legacy type/title/message contract', async () => {
    const result = await generateOpenRouterJson({
      prompt: 'legacy closed prompt',
      apiKey: 'server-only-test-key',
      maxOutputTokens: 120,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    type: 'business_insight',
                    title: 'Insight',
                    message: 'Stable activity',
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        ),
      validate: (parsed) =>
        parsed.type === 'business_insight' &&
        typeof parsed.title === 'string' &&
        typeof parsed.message === 'string'
          ? { ok: true, value: parsed }
          : { ok: false, code: 'AI_PROVIDER_SCHEMA_INVALID' },
    });

    expect(result).toMatchObject({
      ok: true,
      output: {
        type: 'business_insight',
        title: 'Insight',
        message: 'Stable activity',
      },
    });
  });

  test('starter with zero AI executions cannot run paid AI', async () => {
    const now = Date.now();
    const tables = baseTables({
      business: buildBusiness({
        subscriptionPlan: 'starter',
        billingPeriod: null,
      }),
    });
    const ctx = buildCtx(tables);

    const errorData = await convexErrorData(() =>
      assertAiExecutionQuotaAvailable(ctx, 'business_1', now)
    );

    expect(errorData?.code).toBe('PLAN_LIMIT_REACHED');
    expect(errorData?.limitKey).toBe('maxAiExecutionsPerMonth');
    expect(errorData?.limitValue).toBe(0);
    expect(errorData?.currentValue).toBe(0);
  });

  test('pro and premium respect monthly AI caps', async () => {
    const now = Date.now();
    const cases = [
      { plan: 'pro', cap: 100 },
      { plan: 'premium', cap: 300 },
    ];

    for (const item of cases) {
      const allowedCtx = buildCtx(
        baseTables({
          business: buildBusiness({ subscriptionPlan: item.plan }),
          usageRows: Array.from({ length: item.cap - 1 }, (_, index) =>
            buildUsageRow(index, now)
          ),
        })
      );
      await expect(
        assertAiExecutionQuotaAvailable(allowedCtx, 'business_1', now)
      ).resolves.toBeDefined();

      const cappedCtx = buildCtx(
        baseTables({
          business: buildBusiness({ subscriptionPlan: item.plan }),
          usageRows: Array.from({ length: item.cap }, (_, index) =>
            buildUsageRow(index, now)
          ),
        })
      );
      const errorData = await convexErrorData(() =>
        assertAiExecutionQuotaAvailable(cappedCtx, 'business_1', now)
      );

      expect(errorData?.code).toBe('PLAN_LIMIT_REACHED');
      expect(errorData?.limitKey).toBe('maxAiExecutionsPerMonth');
      expect(errorData?.limitValue).toBe(item.cap);
      expect(errorData?.currentValue).toBe(item.cap);
    }
  });

  test('cache hits and fixed quota fallback do not consume AI quota', async () => {
    const now = Date.now();
    const tables = baseTables({
      usageRows: [
        buildUsageRow(1, now, { cacheHit: true }),
        buildUsageRow(2, now, { status: 'failed' }),
      ],
    });
    const ctx = buildCtx(tables);
    const monthKey = monthKeyFromTimestamp(now);

    expect(
      await countAiExecutionsForBusinessInMonth(ctx, 'business_1', monthKey)
    ).toBe(0);

    await finalizeAiRecommendationQuotaFallbackInternal._handler(ctx, {
      businessId: 'business_1',
      snapshotId: 'snapshot_1',
      stateKey: 'ACTIVITY_DROP',
      goal: 'business_insight',
      outputType: 'business_insight',
      primaryCta: { kind: 'view_analytics', label: 'Open analytics' },
      dedupeKey: 'quota_fallback_1',
      now,
    });

    expect(ctx.db.rows('aiRecommendations')).toHaveLength(1);
    expect(ctx.db.rows('aiRecommendations')[0].source).toBe('fixed');
    expect(ctx.db.rows('aiRecommendations')[0].guardrailReason).toBe(
      'QUOTA_EXHAUSTED'
    );
    expect(ctx.db.rows('aiUsageLedger')).toHaveLength(2);
    expect(
      await countAiExecutionsForBusinessInMonth(ctx, 'business_1', monthKey)
    ).toBe(0);
  });

  test('business-specific AI cache writes record deterministic ownership', async () => {
    const now = Date.now();
    const ctx = buildCtx(baseTables());

    await finalizeAiRecommendationSuccessInternal._handler(
      ctx,
      successArgs(now)
    );

    expect(ctx.db.rows('aiGenerationCache')).toHaveLength(1);
    expect(ctx.db.rows('aiGenerationCache')[0].businessId).toBe('business_1');
  });

  test('shared campaign-message AI cache writes remain unscoped', async () => {
    const now = Date.now();
    const ctx = buildCtx(baseTables());

    await finalizeAiRecommendationSuccessInternal._handler(ctx, {
      ...successArgs(now),
      outputType: 'campaign_message',
      cacheKey: 'v1|goal:business_insight|state:ACTIVITY_DROP|sig:drop',
    });

    expect(ctx.db.rows('aiGenerationCache')).toHaveLength(1);
    expect(ctx.db.rows('aiGenerationCache')[0].businessId).toBeUndefined();
  });

  test('quota exceeded blocks success ledger with structured limit error', async () => {
    const now = Date.now();
    const tables = baseTables({
      usageRows: Array.from({ length: 100 }, (_, index) =>
        buildUsageRow(index, now)
      ),
    });
    const ctx = buildCtx(tables);

    const errorData = await convexErrorData(() =>
      finalizeAiRecommendationSuccessInternal._handler(ctx, successArgs(now))
    );

    expect(errorData?.code).toBe('PLAN_LIMIT_REACHED');
    expect(errorData?.limitKey).toBe('maxAiExecutionsPerMonth');
    expect(errorData?.limitValue).toBe(100);
    expect(ctx.db.rows('aiRecommendations')).toHaveLength(0);
    expect(ctx.db.rows('aiGenerationCache')).toHaveLength(0);
    expect(ctx.db.rows('aiUsageLedger')).toHaveLength(100);
  });

  test('AI unavailable fallback remains safe when quota is exhausted', async () => {
    const now = Date.now();
    const tables = baseTables({
      usageRows: Array.from({ length: 100 }, (_, index) =>
        buildUsageRow(index, now)
      ),
    });
    const ctx = buildCtx(tables);

    await expect(
      finalizeAiRecommendationFailureInternal._handler(ctx, {
        businessId: 'business_1',
        snapshotId: 'snapshot_1',
        stateKey: 'ACTIVITY_DROP',
        goal: 'business_insight',
        outputType: 'business_insight',
        primaryCta: { kind: 'view_analytics', label: 'Open analytics' },
        dedupeKey: 'ai_failed_1',
        reason: 'MISSING_OPENROUTER_API_KEY',
        inputTokens: 0,
        outputTokens: 0,
        costEstimate: 0,
        now,
      })
    ).resolves.toEqual({
      ok: true,
      recommendationId: expect.any(String),
    });

    expect(ctx.db.rows('aiRecommendations')).toHaveLength(1);
    expect(ctx.db.rows('aiRecommendations')[0].source).toBe('fixed');
    expect(ctx.db.rows('aiRecommendations')[0].guardrailReason).toBe(
      'AI_REQUEST_FAILED'
    );
    expect(ctx.db.rows('aiUsageLedger')).toHaveLength(100);
  });

  test('Smart Manager copy generation does not count toward the legacy 2/day guardrail', () => {
    const now = Date.now();
    const usageMonth = [
      buildUsageRow(1, now, { requestType: 'business_insight' }),
      buildUsageRow(2, now, { requestType: 'smart_manager_copy_generation' }),
      buildUsageRow(3, now, { requestType: 'smart_manager_copy_generation' }),
    ];
    expect(
      usageMonth.filter((row) => countsTowardLegacyDailyAiLimit(row, now))
        .length
    ).toBe(1);
    expect(
      usageMonth.filter(
        (row) =>
          row.status === 'success' &&
          row.cacheHit !== true &&
          row.requestType === 'smart_manager_copy_generation'
      ).length
    ).toBe(2);
  });

  test('legacy adapter preserves historic numeric token shape when provider metadata is absent', () => {
    expect(toLegacyAiTokenCounts({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(
      toLegacyAiTokenCounts({ inputTokens: 12, outputTokens: 8 })
    ).toEqual({
      inputTokens: 12,
      outputTokens: 8,
    });
  });
});
