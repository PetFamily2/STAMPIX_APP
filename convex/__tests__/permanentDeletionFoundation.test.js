import { describe, expect, test } from 'bun:test';

import {
  backfillAiGenerationCacheBusinessIds,
  backfillBusinessOnboardingDraftImageStorageIds,
  getBusinessIdCandidateFromCacheKey,
} from '../migrations/backfillPermanentDeletionReferences';
import { saveMyBusinessOnboardingDraft } from '../onboarding';

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
        conditions.push({ field, value });
        return q;
      },
    };
    builder(q);
    this.predicates.push((row) =>
      conditions.every(({ field, value }) => row[field] === value)
    );
    return this;
  }

  docs() {
    return this.db
      .rows(this.tableName)
      .filter((row) => this.predicates.every((predicate) => predicate(row)));
  }

  async unique() {
    const rows = this.docs();
    if (rows.length > 1) {
      throw new Error('NOT_UNIQUE');
    }
    return rows[0] ?? null;
  }

  async paginate({ cursor, numItems }) {
    this.db.paginateCalls.push({
      tableName: this.tableName,
      cursor,
      numItems,
    });
    const rows = this.docs();
    const start = cursor == null ? 0 : Number(cursor);
    const end = Math.min(start + numItems, rows.length);
    return {
      page: rows.slice(start, end),
      isDone: end >= rows.length,
      continueCursor: String(end),
    };
  }
}

class FakeDb {
  constructor(tables, validIds = {}) {
    this.tables = tables;
    this.validIds = validIds;
    this.counter = 0;
    this.paginateCalls = [];
    this.system = {
      normalizeId: (tableName, id) => this.normalizeId(tableName, id),
    };
  }

  rows(tableName) {
    if (!this.tables[tableName]) {
      this.tables[tableName] = [];
    }
    return this.tables[tableName];
  }

  query(tableName) {
    return new FakeQuery(this, tableName);
  }

  normalizeId(tableName, id) {
    return this.validIds[tableName]?.has(id) ? id : null;
  }

  async get(id) {
    for (const tableName of Object.keys(this.tables)) {
      const row = this.rows(tableName).find((entry) => entry._id === id);
      if (row) {
        return row;
      }
    }
    return null;
  }

  async insert(tableName, value) {
    this.counter += 1;
    const row = {
      _id: value._id ?? `${tableName}_${this.counter}`,
      ...value,
    };
    this.rows(tableName).push(row);
    return row._id;
  }

  async patch(id, patch) {
    for (const tableName of Object.keys(this.tables)) {
      const rows = this.rows(tableName);
      const index = rows.findIndex((entry) => entry._id === id);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...patch };
        return;
      }
    }
    throw new Error(`PATCH_TARGET_NOT_FOUND:${id}`);
  }
}

function buildDb(tables) {
  return new FakeDb(tables, {
    _storage: new Set(['storage_1', 'storage_2']),
    businesses: new Set(['business_1']),
  });
}

describe('permanent deletion reference foundation', () => {
  test('onboarding draft writes mirror and clear the nested image storage id', async () => {
    const now = Date.now();
    const db = buildDb({
      users: [
        {
          _id: 'user_1',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      businessOnboardingDrafts: [],
    });
    const ctx = {
      db,
      auth: {
        getUserIdentity: async () => ({ subject: 'user_1|session' }),
      },
    };

    await saveMyBusinessOnboardingDraft._handler(ctx, {
      flow: 'default',
      currentStep: 'createProgram',
      programDraft: { title: 'Card', imageStorageId: 'storage_1' },
    });
    expect(db.rows('businessOnboardingDrafts')[0]).toMatchObject({
      programImageStorageId: 'storage_1',
      programDraft: { title: 'Card', imageStorageId: 'storage_1' },
    });

    await saveMyBusinessOnboardingDraft._handler(ctx, {
      flow: 'default',
      currentStep: 'previewCard',
      programDraft: { title: 'Card without image' },
    });
    expect(
      db.rows('businessOnboardingDrafts')[0].programImageStorageId
    ).toBeUndefined();
  });

  test('onboarding image backfill is bounded and idempotent', async () => {
    const db = buildDb({
      businessOnboardingDrafts: [
        {
          _id: 'draft_1',
          programDraft: { imageStorageId: 'storage_1' },
        },
        {
          _id: 'draft_2',
          programDraft: { imageStorageId: 'invalid_storage' },
        },
        {
          _id: 'draft_3',
          programDraft: { imageStorageId: 'storage_2' },
        },
      ],
    });
    const ctx = { db };

    const first =
      await backfillBusinessOnboardingDraftImageStorageIds._handler(ctx, {
        cursor: null,
        batchSize: 2,
      });
    expect(first).toMatchObject({
      isDone: false,
      scanned: 2,
      patched: 1,
      skipped: 1,
    });
    expect(db.paginateCalls[0].numItems).toBe(2);

    const second =
      await backfillBusinessOnboardingDraftImageStorageIds._handler(ctx, {
        cursor: first.continueCursor,
        batchSize: 2,
      });
    expect(second).toMatchObject({ isDone: true, scanned: 1, patched: 1 });

    const retry =
      await backfillBusinessOnboardingDraftImageStorageIds._handler(ctx, {
        cursor: null,
        batchSize: 2,
      });
    expect(retry.patched).toBe(0);
  });

  test('AI cache backfill tags only exact business-scoped keys', async () => {
    const businessKey = ({
      businessId = 'business_1',
      goal = 'business_insight',
      type = 'business_insight',
      state = 'ACTIVITY_DROP',
      hash = 'h1',
    } = {}) =>
      `v1|biz:${businessId}|goal:${goal}|type:${type}|state:${state}|hash:${hash}`;
    const rows = [
      {
        _id: 'cache_business_insight',
        cacheKey: businessKey(),
        responseJson: { type: 'business_insight' },
      },
      {
        _id: 'cache_campaign_summary',
        cacheKey: businessKey({
          goal: 'campaign_summary',
          type: 'campaign_summary',
          hash: 'h2',
        }),
        responseJson: { type: 'campaign_summary' },
      },
      {
        _id: 'cache_recommendation_explanation',
        cacheKey: businessKey({
          type: 'recommendation_explanation',
          hash: 'h3',
        }),
        responseJson: { type: 'recommendation_explanation' },
      },
      {
        _id: 'cache_shared',
        cacheKey:
          'v1|goal:bring_back_customers|state:ACTIVITY_DROP|sig:drop|lang:he|brand:friendly|btype:cafe|svc:visit|cat:food|rt:stamp|thr:10|card:none',
        responseJson: { type: 'campaign_message' },
      },
      {
        _id: 'cache_shared_business_shaped',
        cacheKey: businessKey({ type: 'campaign_message', hash: 'h4' }),
        responseJson: { type: 'campaign_message' },
      },
      {
        _id: 'cache_unknown_type',
        cacheKey: businessKey({ type: 'unknown_type', hash: 'h5' }),
        responseJson: { type: 'unknown_type' },
      },
      {
        _id: 'cache_malformed_prefix',
        cacheKey:
          'v1|business:business_1|goal:business_insight|type:business_insight|state:ACTIVITY_DROP|hash:h6',
        responseJson: { type: 'business_insight' },
      },
      {
        _id: 'cache_empty_state',
        cacheKey: businessKey({ state: '', hash: 'h7' }),
        responseJson: { type: 'business_insight' },
      },
      {
        _id: 'cache_extra_segment',
        cacheKey: `${businessKey({ hash: 'h8' })}|biz:business_2`,
        responseJson: { type: 'business_insight' },
      },
      {
        _id: 'cache_missing_business',
        cacheKey: businessKey({ businessId: 'business_2', hash: 'h9' }),
        responseJson: { type: 'business_insight' },
      },
      {
        _id: 'cache_insight_response_shared',
        cacheKey: businessKey({ hash: 'h10' }),
        responseJson: { type: 'campaign_message' },
      },
      {
        _id: 'cache_summary_response_explanation',
        cacheKey: businessKey({
          goal: 'campaign_summary',
          type: 'campaign_summary',
          hash: 'h11',
        }),
        responseJson: { type: 'recommendation_explanation' },
      },
      {
        _id: 'cache_explanation_response_insight',
        cacheKey: businessKey({
          type: 'recommendation_explanation',
          hash: 'h12',
        }),
        responseJson: { type: 'business_insight' },
      },
    ];
    const db = buildDb({
      businesses: [{ _id: 'business_1' }],
      aiGenerationCache: rows,
    });
    const ctx = { db };

    const first = await backfillAiGenerationCacheBusinessIds._handler(ctx, {
      cursor: null,
      batchSize: 999,
    });
    expect(first).toMatchObject({
      isDone: true,
      scanned: 13,
      patched: 3,
      skipped: 10,
    });
    expect(db.paginateCalls[0].numItems).toBe(100);
    for (const row of db.rows('aiGenerationCache').slice(0, 3)) {
      expect(row.businessId).toBe('business_1');
    }
    for (const row of db.rows('aiGenerationCache').slice(3)) {
      expect(row.businessId).toBeUndefined();
    }
    expect(getBusinessIdCandidateFromCacheKey(businessKey())).toBe(
      'business_1'
    );
    expect(
      getBusinessIdCandidateFromCacheKey(
        businessKey({ type: 'campaign_message' })
      )
    ).toBeUndefined();
    expect(
      getBusinessIdCandidateFromCacheKey(`${businessKey()}|extra:value`)
    ).toBeUndefined();

    const retry = await backfillAiGenerationCacheBusinessIds._handler(ctx, {
      cursor: null,
      batchSize: 999,
    });
    expect(retry.patched).toBe(0);
  });
});
