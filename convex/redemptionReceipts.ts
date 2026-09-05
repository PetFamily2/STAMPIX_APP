import { v } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import { internalMutation, mutation, query } from './_generated/server';
import { requireCurrentUser } from './guards';
import { generateOpaqueToken } from './lib/ids';
import {
  buildPrivacySafeRedemptionPresentation,
  REDEMPTION_PRESENTATION_CLAIM_LEASE_MS,
  REDEMPTION_RECEIPT_CLAIM_SCAN_LIMIT,
  REDEMPTION_RECEIPT_CLEANUP_BATCH_SIZE,
  REDEMPTION_RECEIPT_CLEANUP_CONTINUATION_DELAY_MS,
  revokeRedemptionCelebrationReceipt,
  shouldContinueRedemptionReceiptCleanup,
} from './lib/redemptionReceipts';

const SINGLETON_LIMIT = 2;
const receiptCleanupContinuationRef = makeFunctionReference<
  'mutation',
  Record<string, never>,
  any
>('redemptionReceipts:cleanupRedemptionReceiptsInternal');

async function loadOwnedReceipt(ctx: any, userId: any, receiptToken: string) {
  const rows = await ctx.db
    .query('redemptionCelebrationReceipts')
    .withIndex('by_receiptToken', (q: any) =>
      q.eq('receiptToken', receiptToken)
    )
    .take(SINGLETON_LIMIT);
  if (
    rows.length !== 1 ||
    String(rows[0].ownerUserId) !== String(userId)
  ) {
    throw new Error('REDEMPTION_RECEIPT_NOT_FOUND');
  }
  return rows[0];
}

async function receiptAuthorityIsCurrent(ctx: any, receipt: any) {
  const event = await ctx.db.get(receipt.canonicalRedemptionEventId);
  if (
    !event ||
    String(event.businessId) !== String(receipt.businessId) ||
    String(event.customerUserId ?? '') !== String(receipt.ownerUserId) ||
    event.createdAt !== receipt.confirmedAt ||
    (receipt.variant === 'standard' && event.type !== 'REWARD_REDEEMED') ||
    (receipt.variant === 'referral' &&
      event.type !== 'REFERRAL_BENEFIT_REDEEMED')
  ) {
    return { valid: false as const, revoked: true as const };
  }
  if (event.reversalEventId) {
    return { valid: false as const, revoked: true as const };
  }
  if (receipt.referralRewardId) {
    const reward = await ctx.db.get(receipt.referralRewardId);
    if (
      !reward ||
      reward.status !== 'redeemed' ||
      String(reward.recipientUserId) !== String(receipt.ownerUserId) ||
      String(reward.redeemedEventId ?? '') !== String(event._id)
    ) {
      return { valid: false as const, revoked: true as const };
    }
  }
  return { valid: true as const, revoked: false as const };
}

async function markReceiptExpired(ctx: any, receipt: any, now: number) {
  if (receipt.status === 'expired' || receipt.status === 'revoked') {
    return;
  }
  await ctx.db.patch(receipt._id, {
    status: 'expired',
    claimToken: undefined,
    claimExpiresAt: undefined,
    updatedAt: now,
  });
}

export const hasPendingRedemptionCelebration = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();
    const db = ctx.db as any;
    const available = await db
      .query('redemptionCelebrationReceipts')
      .withIndex(
        'by_ownerUserId_status_autoPresentUntil_confirmedAt',
        (q: any) =>
          q
            .eq('ownerUserId', user._id)
            .eq('status', 'available')
            .gt('autoPresentUntil', now)
      )
      .order('desc')
      .take(REDEMPTION_RECEIPT_CLAIM_SCAN_LIMIT);
    const reclaimable = await db
      .query('redemptionCelebrationReceipts')
      .withIndex('by_ownerUserId_status_claimExpiresAt', (q: any) =>
        q
          .eq('ownerUserId', user._id)
          .eq('status', 'claimed')
          .lte('claimExpiresAt', now)
      )
      .take(REDEMPTION_RECEIPT_CLAIM_SCAN_LIMIT);
    const eligibleReclaimable = reclaimable.filter(
      (receipt: any) =>
        receipt.autoPresentUntil > now && receipt.expiresAt > now
    );
    const newestConfirmedAt = [...available, ...eligibleReclaimable]
      .reduce(
        (latest: number, receipt: any) =>
          Math.max(latest, Number(receipt.confirmedAt)),
        Number.NEGATIVE_INFINITY
      );
    if (!Number.isFinite(newestConfirmedAt)) {
      return { pending: false as const };
    }
    return { pending: true as const, newestConfirmedAt };
  },
});

export const claimPendingRedemptionReceipt = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();
    const db = ctx.db as any;
    const available = await db
      .query('redemptionCelebrationReceipts')
      .withIndex(
        'by_ownerUserId_status_autoPresentUntil_confirmedAt',
        (q: any) =>
          q
            .eq('ownerUserId', user._id)
            .eq('status', 'available')
            .gt('autoPresentUntil', now)
      )
      .order('desc')
      .take(REDEMPTION_RECEIPT_CLAIM_SCAN_LIMIT);
    const reclaimable = await db
      .query('redemptionCelebrationReceipts')
      .withIndex('by_ownerUserId_status_claimExpiresAt', (q: any) =>
        q
          .eq('ownerUserId', user._id)
          .eq('status', 'claimed')
          .lte('claimExpiresAt', now)
      )
      .take(REDEMPTION_RECEIPT_CLAIM_SCAN_LIMIT);
    const candidates = [...available, ...reclaimable]
      .filter((receipt, index, rows) =>
        rows.findIndex((row) => String(row._id) === String(receipt._id)) ===
        index
      )
      .sort(
        (left, right) =>
          right.confirmedAt - left.confirmedAt ||
          String(right._id).localeCompare(String(left._id))
      )
      .slice(0, REDEMPTION_RECEIPT_CLAIM_SCAN_LIMIT);

    for (const receipt of candidates) {
      if (receipt.expiresAt <= now) {
        await markReceiptExpired(ctx, receipt, now);
        continue;
      }
      if (receipt.autoPresentUntil <= now) {
        continue;
      }
      const authority = await receiptAuthorityIsCurrent(ctx, receipt);
      if (!authority.valid) {
        await revokeRedemptionCelebrationReceipt(ctx, {
          canonicalRedemptionEventId: receipt.canonicalRedemptionEventId,
          revokedAt: now,
        });
        continue;
      }
      const claimToken = generateOpaqueToken();
      await ctx.db.patch(receipt._id, {
        status: 'claimed',
        claimToken,
        claimExpiresAt: now + REDEMPTION_PRESENTATION_CLAIM_LEASE_MS,
        updatedAt: now,
      });
      return {
        status: 'claimed' as const,
        receiptToken: receipt.receiptToken,
        claimToken,
        confirmedAt: receipt.confirmedAt,
        presentation: buildPrivacySafeRedemptionPresentation(receipt, now),
      };
    }
    return { status: 'none' as const };
  },
});

export const acknowledgeRedemptionPresentation = mutation({
  args: { receiptToken: v.string(), claimToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const receipt = await loadOwnedReceipt(ctx, user._id, args.receiptToken);
    const now = Date.now();
    if (receipt.status === 'revoked') {
      return { status: 'revoked' as const };
    }
    if (receipt.expiresAt <= now || receipt.status === 'expired') {
      await markReceiptExpired(ctx, receipt, now);
      return { status: 'expired' as const };
    }
    if (
      receipt.claimToken !== args.claimToken ||
      (receipt.status !== 'claimed' && receipt.status !== 'presented')
    ) {
      throw new Error('REDEMPTION_CLAIM_NOT_FOUND');
    }
    if (receipt.status === 'presented') {
      return { status: 'presented' as const };
    }
    if (!receipt.claimExpiresAt || receipt.claimExpiresAt <= now) {
      throw new Error('REDEMPTION_CLAIM_EXPIRED');
    }
    const authority = await receiptAuthorityIsCurrent(ctx, receipt);
    if (!authority.valid) {
      await revokeRedemptionCelebrationReceipt(ctx, {
        canonicalRedemptionEventId: receipt.canonicalRedemptionEventId,
        revokedAt: now,
      });
      return { status: 'revoked' as const };
    }
    await ctx.db.patch(receipt._id, {
      status: 'presented',
      presentedAt: now,
      updatedAt: now,
    });
    return { status: 'presented' as const };
  },
});

export const getRedemptionReceiptPresentation = query({
  args: { receiptToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const receipt = await loadOwnedReceipt(ctx, user._id, args.receiptToken);
    return buildPrivacySafeRedemptionPresentation(receipt, Date.now());
  },
});

export const authorizeRedemptionReceiptShare = mutation({
  args: { receiptToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const receipt = await loadOwnedReceipt(ctx, user._id, args.receiptToken);
    const now = Date.now();
    if (receipt.expiresAt <= now || receipt.status === 'expired') {
      await markReceiptExpired(ctx, receipt, now);
      return { allowed: false as const, state: 'expired' as const };
    }
    const authority = await receiptAuthorityIsCurrent(ctx, receipt);
    if (receipt.status === 'revoked' || !authority.valid) {
      if (receipt.status !== 'revoked') {
        await revokeRedemptionCelebrationReceipt(ctx, {
          canonicalRedemptionEventId: receipt.canonicalRedemptionEventId,
          revokedAt: now,
        });
      }
      return { allowed: false as const, state: 'revoked' as const };
    }
    if (receipt.status !== 'claimed' && receipt.status !== 'presented') {
      return { allowed: false as const, state: 'unavailable' as const };
    }
    return { allowed: true as const, state: 'normal' as const };
  },
});

export const cleanupRedemptionReceiptsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const db = ctx.db as any;
    const expirableStatuses = ['available', 'claimed', 'presented'] as const;
    const expiredClaimLimit = Math.floor(
      REDEMPTION_RECEIPT_CLEANUP_BATCH_SIZE / 4
    );
    const expiredClaims = await db
      .query('redemptionCelebrationReceipts')
      .withIndex('by_status_claimExpiresAt', (q: any) =>
        q.eq('status', 'claimed').lte('claimExpiresAt', now)
      )
      .take(expiredClaimLimit);
    let releasedClaims = 0;
    let expiredCount = 0;
    let expiryExamined = 0;
    for (const receipt of expiredClaims) {
      if (receipt.expiresAt <= now) {
        await markReceiptExpired(ctx, receipt, now);
        expiredCount += 1;
        continue;
      }
      await ctx.db.patch(receipt._id, {
        status: 'available',
        claimToken: undefined,
        claimExpiresAt: undefined,
        updatedAt: now,
      });
      releasedClaims += 1;
    }
    const remainingAfterClaims =
      REDEMPTION_RECEIPT_CLEANUP_BATCH_SIZE - expiredClaims.length;
    const perStatusLimit = Math.max(
      1,
      Math.floor(remainingAfterClaims / 4)
    );
    const expirableStatusCounts: number[] = [];
    for (const status of expirableStatuses) {
      const rows = await db
        .query('redemptionCelebrationReceipts')
        .withIndex('by_status_expiresAt', (q: any) =>
          q.eq('status', status).lte('expiresAt', now)
        )
        .take(perStatusLimit);
      expirableStatusCounts.push(rows.length);
      expiryExamined += rows.length;
      for (const receipt of rows) {
        await markReceiptExpired(ctx, receipt, now);
        expiredCount += 1;
      }
    }
    const purgeLimit = Math.max(
      0,
      REDEMPTION_RECEIPT_CLEANUP_BATCH_SIZE -
        expiredClaims.length -
        expiryExamined
    );
    const purgeable = purgeLimit > 0
      ? await db
          .query('redemptionCelebrationReceipts')
          .withIndex('by_purgeAfter', (q: any) => q.lte('purgeAfter', now))
          .take(purgeLimit)
      : [];
    let purgedCount = 0;
    for (const receipt of purgeable) {
      if (receipt.status === 'available' || receipt.status === 'claimed') {
        continue;
      }
      await ctx.db.delete(receipt._id);
      purgedCount += 1;
    }
    const continuationScheduled = shouldContinueRedemptionReceiptCleanup({
      expiredClaimCount: expiredClaims.length,
      expiredClaimLimit,
      expirableStatusCounts,
      expirableStatusLimit: perStatusLimit,
      purgeableCount: purgeable.length,
      purgeLimit,
    });
    if (continuationScheduled) {
      await ctx.scheduler.runAfter(
        REDEMPTION_RECEIPT_CLEANUP_CONTINUATION_DELAY_MS,
        receiptCleanupContinuationRef,
        {}
      );
    }
    return {
      releasedClaims,
      expiredCount,
      purgedCount,
      continuationScheduled,
    };
  },
});
