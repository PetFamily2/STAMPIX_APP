import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  CANONICAL_LEGAL_UPDATED_AT,
  CANONICAL_LEGAL_VERSION,
  CANONICAL_TERMS_URL,
  CANONICAL_TERMS_VERSION,
  MARKETING_CONSENT_VERSION,
} from '../../lib/legalContract';
import {
  AI_AUDIT_RETENTION_MS,
  INACTIVE_ONBOARDING_DRAFT_RETENTION_MS,
  minimizeExpiredOnboardingDraftsImpl,
  minimizeExpiredOnboardingResearchImpl,
  purgeExpiredAiAuditMetadataImpl,
  purgeExpiredAiCacheImpl,
  purgeExpiredSupportRequestsImpl,
  purgeExpiredTechnicalLogsImpl,
  SUPPORT_RETENTION_MS,
  TECHNICAL_LOG_RETENTION_MS,
} from '../dataRetention';
import { backfillComplianceEvidence } from '../migrations/backfillComplianceEvidence';
import { acceptCurrentTerms, setMyMarketingProfile } from '../users';

class FakeQuery {
  constructor(db, tableName, predicates = []) {
    this.db = db;
    this.tableName = tableName;
    this.predicates = predicates;
  }

  withIndex(_indexName, builder) {
    const predicates = [...this.predicates];
    const q = {
      eq(field, value) {
        predicates.push((row) => row[field] === value);
        return q;
      },
      gte(field, value) {
        predicates.push((row) => row[field] >= value);
        return q;
      },
      lte(field, value) {
        predicates.push((row) => row[field] <= value);
        return q;
      },
    };
    builder(q);
    return new FakeQuery(this.db, this.tableName, predicates);
  }

  rows() {
    return this.db
      .rows(this.tableName)
      .filter((row) => this.predicates.every((predicate) => predicate(row)));
  }

  async take(limit) {
    return this.rows().slice(0, limit);
  }

  async unique() {
    const rows = this.rows();
    if (rows.length > 1) {
      throw new Error('NOT_UNIQUE');
    }
    return rows[0] ?? null;
  }

  async paginate({ cursor, numItems }) {
    const start = cursor === null || cursor === undefined ? 0 : Number(cursor);
    const rows = this.rows();
    const page = rows.slice(start, start + numItems);
    const nextOffset = start + page.length;
    return {
      page,
      continueCursor: String(nextOffset),
      isDone: nextOffset >= rows.length,
    };
  }
}

class FakeDb {
  constructor(seed = {}) {
    this.tables = Object.fromEntries(
      Object.entries(seed).map(([name, rows]) => [
        name,
        rows.map((row) => ({ ...row })),
      ])
    );
    this.nextId = 1;
  }

  rows(tableName) {
    this.tables[tableName] ??= [];
    return this.tables[tableName];
  }

  query(tableName) {
    return new FakeQuery(this, tableName);
  }

  async get(id) {
    return (
      Object.values(this.tables)
        .flat()
        .find((row) => row._id === id) ?? null
    );
  }

  async insert(tableName, value) {
    const id = `${tableName}_${this.nextId++}`;
    this.rows(tableName).push({ _id: id, ...value });
    return id;
  }

  async patch(id, patch) {
    const row = await this.get(id);
    if (!row) {
      throw new Error(`MISSING:${id}`);
    }
    Object.assign(row, patch);
  }

  async delete(id) {
    for (const rows of Object.values(this.tables)) {
      const index = rows.findIndex((row) => row._id === id);
      if (index >= 0) {
        rows.splice(index, 1);
        return;
      }
    }
    throw new Error(`MISSING:${id}`);
  }
}

function makeCtx(seed = {}) {
  const db = new FakeDb({
    users: [
      {
        _id: 'user_1',
        isActive: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    ...seed,
  });
  return {
    db,
    ctx: {
      auth: {
        getUserIdentity: async () => ({ subject: 'user_1|session_1' }),
      },
      db,
    },
  };
}

describe('versioned legal and marketing evidence', () => {
  test('current Terms acceptance is versioned, sourced, and idempotent', async () => {
    const { ctx, db } = makeCtx();

    const first = await acceptCurrentTerms._handler(ctx, {
      source: 'signup_email',
    });
    const second = await acceptCurrentTerms._handler(ctx, {
      source: 'signup_email',
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(db.rows('legalAcceptances')).toHaveLength(1);
    expect(db.rows('legalAcceptances')[0]).toMatchObject({
      userId: 'user_1',
      documentKind: 'terms',
      version: CANONICAL_TERMS_VERSION,
      canonicalUrl: CANONICAL_TERMS_URL,
      source: 'signup_email',
    });
    expect(typeof db.rows('legalAcceptances')[0].acceptedAt).toBe('number');
  });

  test('marketing toggle appends grant/revoke history only on changes', async () => {
    const { ctx, db } = makeCtx();
    const profile = {
      birthdayMonth: undefined,
      birthdayDay: undefined,
      anniversaryMonth: undefined,
      anniversaryDay: undefined,
    };

    await setMyMarketingProfile._handler(ctx, {
      ...profile,
      marketingOptIn: true,
      source: 'settings',
    });
    await setMyMarketingProfile._handler(ctx, {
      ...profile,
      marketingOptIn: true,
      source: 'account_details',
    });
    await setMyMarketingProfile._handler(ctx, {
      ...profile,
      marketingOptIn: false,
      source: 'account_details',
    });

    expect(db.rows('marketingConsentEvents')).toHaveLength(2);
    expect(db.rows('marketingConsentEvents')[0]).toMatchObject({
      eventType: 'granted',
      effectiveOptIn: true,
      source: 'settings',
      version: MARKETING_CONSENT_VERSION,
      scope: 'stampaix_and_joined_businesses',
      channels: ['in_app', 'push'],
    });
    expect(db.rows('marketingConsentEvents')[1]).toMatchObject({
      eventType: 'revoked',
      effectiveOptIn: false,
      source: 'account_details',
      version: MARKETING_CONSENT_VERSION,
    });
    expect(db.rows('users')[0].marketingOptIn).toBe(false);
    expect(db.rows('users')[0].marketingOptInAt).toBeUndefined();
  });
});

describe('bounded retention behavior', () => {
  test('support cleanup honors 24 months and legal hold', async () => {
    const now = SUPPORT_RETENTION_MS + 10;
    const { ctx, db } = makeCtx({
      supportRequests: [
        {
          _id: 'expired',
          status: 'handled',
          purgeAfter: now - 1,
        },
        {
          _id: 'held',
          status: 'handled',
          purgeAfter: now - 1,
          legalHold: true,
        },
        {
          _id: 'future',
          status: 'handled',
          purgeAfter: now + 1,
        },
      ],
    });

    const result = await purgeExpiredSupportRequestsImpl(ctx, now, 100);

    expect(result).toMatchObject({ deleted: 1, retainedForLegalHold: 1 });
    expect(
      db
        .rows('supportRequests')
        .map((row) => row._id)
        .sort()
    ).toEqual(['future', 'held']);
    expect(
      db.rows('supportRequests').find((row) => row._id === 'held')
    ).toMatchObject({ purgeAfter: undefined, legalHold: true });
  });

  test('AI cache/audit, technical logs, and onboarding payloads use policy cutoffs', async () => {
    const now = 900 * 24 * 60 * 60 * 1000;
    const { ctx, db } = makeCtx({
      aiGenerationCache: [
        { _id: 'cache_old', expiresAt: now - 1 },
        { _id: 'cache_new', expiresAt: now + 1 },
      ],
      aiUsageLedger: [
        {
          _id: 'audit_old',
          createdAt: now - AI_AUDIT_RETENTION_MS - 1,
        },
        { _id: 'audit_new', createdAt: now - AI_AUDIT_RETENTION_MS + 1 },
      ],
      pushDeliveryLog: [
        {
          _id: 'log_old',
          createdAt: now - TECHNICAL_LOG_RETENTION_MS - 1,
        },
        { _id: 'log_new', createdAt: now },
      ],
      businessOnboardingDrafts: [
        {
          _id: 'draft_old',
          status: 'paused',
          businessDraft: { name: 'raw' },
          programDraft: { title: 'raw' },
          businessOnboardingDraft: { ageRange: '25-34' },
          rawPayloadPurgeAfter: now - 1,
          updatedAt: now - INACTIVE_ONBOARDING_DRAFT_RETENTION_MS,
        },
      ],
    });

    await purgeExpiredAiCacheImpl(ctx, now, 100);
    await purgeExpiredAiAuditMetadataImpl(ctx, now, 100);
    await purgeExpiredTechnicalLogsImpl(ctx, now, 100);
    await minimizeExpiredOnboardingDraftsImpl(ctx, now, 100);

    expect(db.rows('aiGenerationCache').map((row) => row._id)).toEqual([
      'cache_new',
    ]);
    expect(db.rows('aiUsageLedger').map((row) => row._id)).toEqual([
      'audit_new',
    ]);
    expect(db.rows('pushDeliveryLog').map((row) => row._id)).toEqual([
      'log_new',
    ]);
    expect(db.rows('businessOnboardingDrafts')[0]).toMatchObject({
      minimizedAt: now,
      businessDraft: undefined,
      programDraft: undefined,
      businessOnboardingDraft: undefined,
    });
  });

  test('research minimization removes research fields but keeps operations', async () => {
    const now = AI_AUDIT_RETENTION_MS;
    const { ctx, db } = makeCtx({
      businesses: [
        {
          _id: 'business_1',
          onboardingResearchPurgeAfter: now - 1,
          onboardingSnapshot: {
            discoverySource: 'search',
            ownerAgeRange: '25-34',
            businessExample: 'hair_salon',
            reason: 'repeat_visits',
            usageAreas: ['nearby'],
            cadenceBand: 'monthly',
          },
          businessRetentionProfile: {
            discoverySource: 'search',
            adoptionReason: 'repeat_visits',
            primaryGoal: 'repeat_visits',
            onboardingMeta: {
              ownerAgeRange: '25-34',
              businessExample: 'hair_salon',
              cadenceBand: 'monthly',
            },
          },
          updatedAt: 1,
        },
      ],
    });

    await minimizeExpiredOnboardingResearchImpl(ctx, now, 100);

    const business = db.rows('businesses')[0];
    expect(business.onboardingSnapshot).toEqual({
      reason: 'repeat_visits',
      usageAreas: ['nearby'],
      cadenceBand: 'monthly',
    });
    expect(business.businessRetentionProfile).toEqual({
      primaryGoal: 'repeat_visits',
      onboardingMeta: { cadenceBand: 'monthly' },
    });
    expect(business.onboardingResearchMinimizedAt).toBe(now);
  });
});

describe('compliance backfill safety', () => {
  test('Terms evidence records the canonical 2026.09.21 version and URL', async () => {
    expect(CANONICAL_TERMS_VERSION).toBe(CANONICAL_LEGAL_VERSION);
    expect(CANONICAL_LEGAL_VERSION).toBe('2026.09.21');
    expect(CANONICAL_LEGAL_UPDATED_AT).toBe('21.09.2026');

    const { ctx, db } = makeCtx();
    await acceptCurrentTerms._handler(ctx, { source: 'signup_email' });
    expect(db.rows('legalAcceptances')[0]).toMatchObject({
      version: '2026.09.21',
      canonicalUrl: CANONICAL_TERMS_URL,
    });
  });

  test('compliance backfill defaults to dry-run and does not write', async () => {
    const now = Date.now();
    const { ctx, db } = makeCtx({
      supportRequests: [
        {
          _id: 'support_1',
          status: 'handled',
          createdAt: now,
          updatedAt: now,
        },
      ],
      smartManagerAuditEvents: [
        {
          _id: 'audit_1',
          createdAt: now,
          expiresAt: now + 90 * 24 * 60 * 60 * 1000,
        },
      ],
    });

    const omitted = await backfillComplianceEvidence._handler(ctx, {
      phase: 'support',
      cursor: null,
    });
    const explicitDryRun = await backfillComplianceEvidence._handler(ctx, {
      phase: 'ai_audit',
      cursor: null,
      dryRun: true,
    });

    expect(omitted).toMatchObject({ dryRun: true, patched: 1, isDone: true });
    expect(explicitDryRun).toMatchObject({
      dryRun: true,
      patched: 1,
      isDone: true,
    });
    expect(db.rows('supportRequests')[0].purgeAfter).toBeUndefined();
    expect(db.rows('smartManagerAuditEvents')[0].expiresAt).toBe(
      now + 90 * 24 * 60 * 60 * 1000
    );
  });

  test('compliance backfill write path can extend AI audit expiry without fabricating consent', async () => {
    const now = Date.now();
    const { ctx, db } = makeCtx({
      smartManagerAuditEvents: [
        {
          _id: 'audit_1',
          createdAt: now,
          expiresAt: now + 90 * 24 * 60 * 60 * 1000,
        },
      ],
      users: [
        {
          _id: 'user_1',
          isActive: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const result = await backfillComplianceEvidence._handler(ctx, {
      phase: 'ai_audit',
      cursor: null,
      dryRun: false,
    });

    expect(result).toMatchObject({ dryRun: false, patched: 1, inserted: 0 });
    expect(db.rows('smartManagerAuditEvents')[0].expiresAt).toBe(
      now + AI_AUDIT_RETENTION_MS
    );
    expect(db.rows('marketingConsentEvents')).toEqual([]);
  });

  test('Smart Manager audit writers share the 12-month policy constant', () => {
    const files = [
      'convex/smartManager.ts',
      'convex/smartManagerActions.ts',
      'convex/smartManagerExecution.ts',
      'convex/smartManagerDelivery.ts',
      'convex/smartManagerMigration.ts',
      'convex/users.ts',
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('AI_AUDIT_RETENTION_MS');
      expect(source).not.toMatch(
        /const AUDIT_RETENTION_MS = 90 \* 24 \* 60 \* 60 \* 1000/
      );
      expect(source).not.toMatch(
        /const SMART_MANAGER_MIGRATION_AUDIT_RETENTION_MS =\s*90 \* 24 \* 60 \* 60 \* 1000/
      );
    }
  });
});
