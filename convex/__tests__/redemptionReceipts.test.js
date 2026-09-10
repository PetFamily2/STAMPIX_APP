import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  buildPrivacySafeRedemptionPresentation,
  createRedemptionCelebrationReceipt,
  REDEMPTION_AUTO_PRESENT_MS,
  REDEMPTION_PRESENTATION_CLAIM_LEASE_MS,
  REDEMPTION_RECEIPT_CLEANUP_BATCH_SIZE,
  REDEMPTION_RECEIPT_CLEANUP_CONTINUATION_DELAY_MS,
  REDEMPTION_REOPEN_MS,
  REDEMPTION_RETENTION_MS,
  shouldContinueRedemptionReceiptCleanup,
} from '../lib/redemptionReceipts';
import {
  acknowledgeRedemptionPresentation,
  authorizeRedemptionReceiptShare,
  claimPendingRedemptionReceipt,
  getRedemptionReceiptPresentation,
  hasPendingRedemptionCelebration,
} from '../redemptionReceipts';

const receiptSource = readFileSync(
  new URL('../redemptionReceipts.ts', import.meta.url),
  'utf8'
);
const scannerSource = readFileSync(
  new URL('../scanner.ts', import.meta.url),
  'utf8'
);
const referralSource = readFileSync(
  new URL('../referrals.ts', import.meta.url),
  'utf8'
);
const accountDeletionSource = readFileSync(
  new URL('../users.ts', import.meta.url),
  'utf8'
);
const businessDeletionSource = readFileSync(
  new URL('../businessDeletion.ts', import.meta.url),
  'utf8'
);
const hostSource = readFileSync(
  new URL('../../components/customer/RedemptionCelebrationHost.tsx', import.meta.url),
  'utf8'
);
const cronSource = readFileSync(
  new URL('../crons.ts', import.meta.url),
  'utf8'
);
const cleanupSource = receiptSource.slice(
  receiptSource.indexOf('export const cleanupRedemptionReceiptsInternal')
);

class FakeQuery {
  constructor(db, table, conditions = []) {
    this.db = db;
    this.table = table;
    this.conditions = conditions;
  }
  withIndex(_index, builder) {
    const conditions = [...this.conditions];
    const q = {
      eq: (field, value) => {
        conditions.push(['eq', field, value]);
        return q;
      },
      gt: (field, value) => {
        conditions.push(['gt', field, value]);
        return q;
      },
      lte: (field, value) => {
        conditions.push(['lte', field, value]);
        return q;
      },
    };
    builder(q);
    return new FakeQuery(this.db, this.table, conditions);
  }
  order(direction) {
    const query = new FakeQuery(this.db, this.table, this.conditions);
    query.direction = direction;
    return query;
  }
  matchingRows() {
    const rows = this.db.rows(this.table)
      .filter((row) => this.conditions.every(([operator, field, value]) => {
        if (operator === 'eq') {
          return row[field] === value;
        }
        if (operator === 'gt') {
          return row[field] > value;
        }
        if (operator === 'lte') {
          return row[field] <= value;
        }
        return false;
      }));
    if (this.direction === 'desc') {
      return [...rows].sort((left, right) =>
        (right.confirmedAt ?? 0) - (left.confirmedAt ?? 0)
      );
    }
    return rows;
  }
  async take(limit) {
    return this.matchingRows().slice(0, limit);
  }
  async first() {
    return (await this.take(1))[0] ?? null;
  }
}

class FakeDb {
  constructor() {
    this.tables = {};
    this.nextId = 1;
  }
  rows(table) {
    if (!this.tables[table]) {
      this.tables[table] = [];
    }
    return this.tables[table];
  }
  query(table) {
    return new FakeQuery(this, table);
  }
  async insert(table, value) {
    const row = { _id: `${table}_${this.nextId++}`, ...structuredClone(value) };
    this.rows(table).push(row);
    return row._id;
  }
  async get(id) {
    return Object.values(this.tables).flat().find((row) => row._id === id) ?? null;
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
}

function createArgs(overrides = {}) {
  return {
    ownerUserId: 'customer_1',
    businessId: 'business_1',
    membershipId: 'membership_1',
    canonicalRedemptionEventId: 'event_1',
    variant: 'standard',
    businessName: 'Business One',
    businessLogoUrl: 'https://example.test/logo.png',
    programDisplayName: 'Coffee Card',
    rewardDisplayName: 'Free Coffee',
    cardThemeId: 'blue',
    confirmedAt: 1_000,
    ...overrides,
  };
}

describe('durable redemption celebration receipts', () => {
  test('confirmed redemption retry reuses one logical receipt', async () => {
    const ctx = { db: new FakeDb() };
    const first = await createRedemptionCelebrationReceipt(ctx, createArgs());
    const second = await createRedemptionCelebrationReceipt(
      ctx,
      createArgs({ businessName: 'Changed later' })
    );
    expect(first._id).toBe(second._id);
    expect(ctx.db.rows('redemptionCelebrationReceipts')).toHaveLength(1);
    expect(second.businessName).toBe('Business One');
  });

  test('standard and referral snapshots retain only presentation facts', async () => {
    const standard = buildPrivacySafeRedemptionPresentation({
      ...createArgs(),
      status: 'available',
      expiresAt: 10_000,
    }, 2_000);
    const referral = buildPrivacySafeRedemptionPresentation({
      ...createArgs({ variant: 'referral' }),
      status: 'available',
      expiresAt: 10_000,
    }, 2_000);
    expect(standard.variant).toBe('standard');
    expect(referral.variant).toBe('referral');
    expect(Object.keys(standard).sort()).toEqual([
      'businessLogoUrl',
      'businessName',
      'cardThemeId',
      'programDisplayName',
      'rewardDisplayName',
      'state',
      'variant',
    ]);
  });

  test('expired and revoked receipts map fail-closed presentation states', () => {
    expect(buildPrivacySafeRedemptionPresentation({ ...createArgs(), status: 'available', expiresAt: 1 }, 2).state).toBe('expired');
    expect(buildPrivacySafeRedemptionPresentation({ ...createArgs(), status: 'revoked', expiresAt: 9 }, 2).state).toBe('revoked');
  });

  test('central policy separates auto-present, reopen, and retention', () => {
    expect(REDEMPTION_AUTO_PRESENT_MS).toBe(24 * 60 * 60 * 1000);
    expect(REDEMPTION_REOPEN_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(REDEMPTION_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(REDEMPTION_PRESENTATION_CLAIM_LEASE_MS).toBe(2 * 60 * 1000);
    expect(REDEMPTION_RECEIPT_CLEANUP_BATCH_SIZE).toBe(100);
    expect(REDEMPTION_RECEIPT_CLEANUP_CONTINUATION_DELAY_MS).toBe(100);
    expect(receiptSource).not.toContain('.collect()');
  });
});

describe('redemption receipt cleanup continuation policy', () => {
  const partialWork = {
    expiredClaimCount: 1,
    expiredClaimLimit: 25,
    expirableStatusCounts: [1, 0, 2],
    expirableStatusLimit: 18,
    purgeableCount: 3,
    purgeLimit: 21,
  };

  test('any full bounded work category requests a continuation', () => {
    expect(
      shouldContinueRedemptionReceiptCleanup({
        ...partialWork,
        expiredClaimCount: partialWork.expiredClaimLimit,
      })
    ).toBe(true);
    expect(
      shouldContinueRedemptionReceiptCleanup({
        ...partialWork,
        expirableStatusCounts: [1, partialWork.expirableStatusLimit, 2],
      })
    ).toBe(true);
    expect(
      shouldContinueRedemptionReceiptCleanup({
        ...partialWork,
        purgeableCount: partialWork.purgeLimit,
      })
    ).toBe(true);
  });

  test('partial and empty completed work do not request continuation', () => {
    expect(shouldContinueRedemptionReceiptCleanup(partialWork)).toBe(false);
    expect(
      shouldContinueRedemptionReceiptCleanup({
        ...partialWork,
        expiredClaimCount: 0,
        expirableStatusCounts: [0, 0, 0],
        purgeableCount: 0,
      })
    ).toBe(false);
  });

  test('cleanup stays bounded and contains one continuation schedule site', () => {
    expect(cleanupSource).toContain('.take(expiredClaimLimit)');
    expect(cleanupSource).toContain('.take(perStatusLimit)');
    expect(cleanupSource).toContain('.take(purgeLimit)');
    expect(cleanupSource).not.toContain('.collect()');
    expect(cleanupSource).not.toMatch(/while\s*\(/);
    expect(
      cleanupSource.match(/ctx\.scheduler\.runAfter\(/g) ?? []
    ).toHaveLength(1);
  });

  test('the unchanged daily cron is the single receipt-cleanup seed', () => {
    expect(cronSource).toMatch(
      /crons\.daily\(\s*'redemption celebration receipt cleanup daily'/
    );
    expect(
      cronSource.match(/cleanupRedemptionReceiptsInternal/g) ?? []
    ).toHaveLength(1);
  });
});

function buildBehaviorContext({ ownerUserId = 'customer_1' } = {}) {
  const now = Date.now();
  const db = new FakeDb();
  db.tables.users = [
    { _id: 'customer_1' },
    { _id: 'customer_2' },
  ];
  db.tables.events = [{
    _id: 'event_1',
    type: 'REWARD_REDEEMED',
    businessId: 'business_1',
    customerUserId: 'customer_1',
    createdAt: now,
  }];
  db.tables.redemptionCelebrationReceipts = [{
    _id: 'receipt_1',
    ownerUserId: 'customer_1',
    businessId: 'business_1',
    membershipId: 'membership_1',
    canonicalRedemptionEventId: 'event_1',
    receiptToken: 'receipt_token_1',
    variant: 'standard',
    status: 'available',
    businessName: 'Business One',
    rewardDisplayName: 'Free Coffee',
    confirmedAt: now,
    autoPresentUntil: now + REDEMPTION_AUTO_PRESENT_MS,
    expiresAt: now + REDEMPTION_REOPEN_MS,
    purgeAfter: now + REDEMPTION_RETENTION_MS,
    createdAt: now,
    updatedAt: now,
  }];
  return {
    db,
    auth: {
      getUserIdentity: async () => ({ subject: ownerUserId }),
    },
  };
}

describe('redemption receipt executable claim lifecycle', () => {
  test('standard redemption receipt completes the customer presentation lifecycle', async () => {
    const ctx = buildBehaviorContext();

    const pending = await hasPendingRedemptionCelebration._handler(ctx, {
      refreshGeneration: 0,
    });
    expect(pending.pending).toBe(true);

    const claim = await claimPendingRedemptionReceipt._handler(ctx, {});
    expect(claim.status).toBe('claimed');
    expect(claim.claimExpiresAt).toBeGreaterThan(Date.now());
    expect(claim.presentation.state).toBe('normal');
    expect(claim.presentation.rewardDisplayName).toBe('Free Coffee');

    const live = await getRedemptionReceiptPresentation._handler(ctx, {
      receiptToken: claim.receiptToken,
    });
    expect(live.state).toBe('normal');
    expect(Object.keys(live)).not.toContain('ownerUserId');
    expect(Object.keys(live)).not.toContain('membershipId');

    const acknowledged = await acknowledgeRedemptionPresentation._handler(
      ctx,
      {
        receiptToken: claim.receiptToken,
        claimToken: claim.claimToken,
      }
    );
    expect(acknowledged.status).toBe('presented');
    expect(
      (
        await authorizeRedemptionReceiptShare._handler(ctx, {
          receiptToken: claim.receiptToken,
        })
      ).allowed
    ).toBe(true);
    expect(
      (
        await hasPendingRedemptionCelebration._handler(ctx, {
          refreshGeneration: 1,
        })
      ).pending
    ).toBe(false);
  });

  test('claim is exclusive and an expired lease is reclaimable', async () => {
    const ctx = buildBehaviorContext();
    const first = await claimPendingRedemptionReceipt._handler(ctx, {});
    expect(first.status).toBe('claimed');
    expect(Number.isFinite(first.confirmedAt)).toBe(true);
    expect((await claimPendingRedemptionReceipt._handler(ctx, {})).status).toBe('none');

    await ctx.db.patch('receipt_1', { claimExpiresAt: Date.now() - 1 });
    const reclaimed = await claimPendingRedemptionReceipt._handler(ctx, {});
    expect(reclaimed.status).toBe('claimed');
    expect(reclaimed.claimToken).not.toBe(first.claimToken);
  });

  test('acknowledgement is idempotent for the owning claim', async () => {
    const ctx = buildBehaviorContext();
    const claim = await claimPendingRedemptionReceipt._handler(ctx, {});
    const args = {
      receiptToken: claim.receiptToken,
      claimToken: claim.claimToken,
    };
    expect((await acknowledgeRedemptionPresentation._handler(ctx, args)).status).toBe('presented');
    expect((await acknowledgeRedemptionPresentation._handler(ctx, args)).status).toBe('presented');
  });

  test('owner isolation and reactive signal expose availability only', async () => {
    const owner = buildBehaviorContext();
    const signal = await hasPendingRedemptionCelebration._handler(owner, {});
    expect(signal.pending).toBe(true);
    expect(Number.isFinite(signal.newestConfirmedAt)).toBe(true);
    expect(Object.keys(signal).sort()).toEqual([
      'newestConfirmedAt',
      'pending',
    ]);

    const other = buildBehaviorContext({ ownerUserId: 'customer_2' });
    expect(await hasPendingRedemptionCelebration._handler(other, {})).toEqual({ pending: false });
    expect((await claimPendingRedemptionReceipt._handler(other, {})).status).toBe('none');
  });

  test('reactive availability watermark advances for a newer receipt', async () => {
    const ctx = buildBehaviorContext();
    const first = await hasPendingRedemptionCelebration._handler(ctx, {});
    const firstReceipt = ctx.db.rows('redemptionCelebrationReceipts')[0];
    await ctx.db.insert('redemptionCelebrationReceipts', {
      ...firstReceipt,
      _id: 'receipt_2',
      receiptToken: 'receipt_token_2',
      canonicalRedemptionEventId: 'event_2',
      confirmedAt: firstReceipt.confirmedAt + 1,
      autoPresentUntil: firstReceipt.autoPresentUntil + 1,
      expiresAt: firstReceipt.expiresAt + 1,
      purgeAfter: firstReceipt.purgeAfter + 1,
    });
    const second = await hasPendingRedemptionCelebration._handler(ctx, {});
    expect(second.newestConfirmedAt).toBeGreaterThan(first.newestConfirmedAt);
    expect(Object.keys(second).sort()).toEqual([
      'newestConfirmedAt',
      'pending',
    ]);
  });

  test('auto-present cutoff is earlier than explicit reopen/share expiry', async () => {
    const ctx = buildBehaviorContext();
    await ctx.db.patch('receipt_1', {
      status: 'presented',
      autoPresentUntil: Date.now() - 1,
      expiresAt: Date.now() + 10_000,
    });
    expect(await hasPendingRedemptionCelebration._handler(ctx, {})).toEqual({ pending: false });
    expect(await authorizeRedemptionReceiptShare._handler(ctx, {
      receiptToken: 'receipt_token_1',
    })).toEqual({ allowed: true, state: 'normal' });
  });

  test('revoked and expired receipts reject share authorization', async () => {
    const revoked = buildBehaviorContext();
    await revoked.db.patch('receipt_1', { status: 'revoked' });
    expect((await authorizeRedemptionReceiptShare._handler(revoked, {
      receiptToken: 'receipt_token_1',
    })).state).toBe('revoked');

    const expired = buildBehaviorContext();
    await expired.db.patch('receipt_1', { expiresAt: Date.now() - 1 });
    expect((await authorizeRedemptionReceiptShare._handler(expired, {
      receiptToken: 'receipt_token_1',
    })).state).toBe('expired');
  });
});

describe('receipt authority and lifecycle source contracts', () => {
  test('receipt creation appears only after canonical redemption event insertion', () => {
    expect(scannerSource.indexOf("type: 'REWARD_REDEEMED'")).toBeLessThan(
      scannerSource.indexOf('createRedemptionCelebrationReceipt(ctx')
    );
    expect(referralSource.indexOf("type: 'REFERRAL_BENEFIT_REDEEMED'")).toBeLessThan(
      referralSource.indexOf('createRedemptionCelebrationReceipt(ctx')
    );
  });

  test('preview, resolve, and failed paths do not create receipts', () => {
    const applyRedeemStart = scannerSource.indexOf('async function applyRedeem');
    const resolveStart = scannerSource.indexOf('export const resolveScan');
    const resolveEnd = scannerSource.indexOf('export const commitStamp');
    expect(scannerSource.slice(resolveStart, resolveEnd)).not.toContain(
      'createRedemptionCelebrationReceipt'
    );
    expect(applyRedeemStart).toBeGreaterThan(0);
  });

  test('claim requires authentication, ownership, and an exclusive lease', () => {
    expect(receiptSource).toContain('requireCurrentUser(ctx)');
    expect(receiptSource).toContain('String(rows[0].ownerUserId)');
    expect(receiptSource).toContain("status: 'claimed'");
    expect(receiptSource).toContain('claimExpiresAt: now +');
  });

  test('second device is excluded until an expired lease becomes reclaimable', () => {
    expect(receiptSource).toContain(".eq('status', 'available')");
    expect(receiptSource).toContain(".eq('status', 'claimed')");
    expect(receiptSource).toContain(".lte('claimExpiresAt', now)");
  });

  test('expired receipts cannot be newly claimed or shared', () => {
    expect(receiptSource).toContain(".gt('autoPresentUntil', now)");
    expect(receiptSource).toContain('receipt.expiresAt <= now');
    expect(receiptSource).toContain("allowed: false as const, state: 'expired'");
  });

  test('acknowledgement is idempotent and presented receipts are not reclaimed', () => {
    expect(receiptSource).toContain("if (receipt.status === 'presented')");
    expect(receiptSource).not.toContain(".eq('status', 'presented')\n            .gt");
  });

  test('reversal revokes and disables future claims/shares', () => {
    expect(scannerSource).toContain('revokeRedemptionCelebrationReceipt(ctx');
    expect(receiptSource).toContain("receipt.status === 'revoked'");
    expect(receiptSource).toContain("allowed: false as const, state: 'revoked'");
  });

  test('account and business deletion remove receipts', () => {
    expect(accountDeletionSource).toContain("'redemptionCelebrationReceipts'");
    expect(businessDeletionSource).toContain("table: 'redemptionCelebrationReceipts'");
  });

  test('cleanup is indexed, bounded, and releases crashed-device claims', () => {
    expect(receiptSource).toContain("withIndex('by_status_claimExpiresAt'");
    expect(receiptSource).toContain('REDEMPTION_RECEIPT_CLEANUP_BATCH_SIZE');
    expect(receiptSource).toContain("status: 'available'");
  });

  test('host claims only from the reactive pending signal with session guards', () => {
    expect(hostSource).toContain('hasPendingRedemptionCelebration');
    expect(hostSource).toContain(
      'const pending = pendingSignal?.pending === true'
    );
    expect(hostSource).toContain('claimInFlightRef.current');
    expect(hostSource).toContain('consumedConfirmedAtRef.current');
    expect(hostSource).toContain(
      'const newestConfirmedAt = pendingSignal?.newestConfirmedAt'
    );
    expect(hostSource).toContain('claimAttemptKey');
    expect(hostSource).not.toMatch(/setInterval|poll/i);
  });

  test('server never persists a generated share image or private DTO fields', () => {
    expect(receiptSource).not.toMatch(/storage\.store|imageStorageId|qrPayload|qrSignature/);
    const dtoBuilder = readFileSync(
      new URL('../lib/redemptionReceipts.ts', import.meta.url),
      'utf8'
    );
    const dto = dtoBuilder.slice(dtoBuilder.indexOf('buildPrivacySafeRedemptionPresentation'));
    expect(dto).not.toMatch(/email|phone|customerName|staffId|referralCode|membershipId/);
  });
});
