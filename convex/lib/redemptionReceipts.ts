import type { Id } from '../_generated/dataModel';
import { generateOpaqueToken } from './ids';
import { SMART_MANAGER_POLICY_V1 } from './smartManagerPolicy';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Receipt lifecycle is the durable representation of the single central
// Celebration policy: automatic discovery, explicit reopen/share, then purge.
export const REDEMPTION_AUTO_PRESENT_MS =
  SMART_MANAGER_POLICY_V1.celebration.autoPresentHours * HOUR_MS;
export const REDEMPTION_REOPEN_MS =
  SMART_MANAGER_POLICY_V1.celebration.reopenDays * DAY_MS;
export const REDEMPTION_RETENTION_MS =
  SMART_MANAGER_POLICY_V1.celebration.retentionDays * DAY_MS;
export const REDEMPTION_PRESENTATION_CLAIM_LEASE_MS = 2 * 60 * 1000;
export const REDEMPTION_RECEIPT_CLEANUP_BATCH_SIZE = 100;
export const REDEMPTION_RECEIPT_CLEANUP_CONTINUATION_DELAY_MS = 100;
export const REDEMPTION_RECEIPT_CLAIM_SCAN_LIMIT = 10;

const SINGLETON_LIMIT = 2;

export function shouldContinueRedemptionReceiptCleanup(args: {
  expiredClaimCount: number;
  expiredClaimLimit: number;
  expirableStatusCounts: number[];
  expirableStatusLimit: number;
  purgeableCount: number;
  purgeLimit: number;
}) {
  return (
    (args.expiredClaimLimit > 0 &&
      args.expiredClaimCount >= args.expiredClaimLimit) ||
    (args.expirableStatusLimit > 0 &&
      args.expirableStatusCounts.some(
        (count) => count >= args.expirableStatusLimit
      )) ||
    (args.purgeLimit > 0 && args.purgeableCount >= args.purgeLimit)
  );
}

function cleanSnapshotText(value: unknown, fallback: string, limit: number) {
  const normalized = typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : '';
  return (normalized || fallback).slice(0, limit);
}

function cleanOptionalSnapshotText(value: unknown, limit: number) {
  const normalized = typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : '';
  return normalized ? normalized.slice(0, limit) : undefined;
}

function cleanPublicLogoUrl(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^https:\/\//i.test(normalized) ? normalized.slice(0, 2048) : undefined;
}

async function generateUniqueReceiptToken(ctx: any) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateOpaqueToken();
    const collision = await ctx.db
      .query('redemptionCelebrationReceipts')
      .withIndex('by_receiptToken', (q: any) => q.eq('receiptToken', token))
      .first();
    if (!collision) {
      return token;
    }
  }
  throw new Error('REDEMPTION_RECEIPT_TOKEN_UNAVAILABLE');
}

export async function createRedemptionCelebrationReceipt(
  ctx: any,
  args: {
    ownerUserId: Id<'users'>;
    businessId: Id<'businesses'>;
    membershipId?: Id<'memberships'>;
    canonicalRedemptionEventId: Id<'events'>;
    referralRewardId?: Id<'referralRewards'>;
    variant: 'standard' | 'referral';
    businessName: unknown;
    businessLogoUrl?: unknown;
    programDisplayName?: unknown;
    rewardDisplayName: unknown;
    cardThemeId?: unknown;
    confirmedAt: number;
  }
) {
  const existing = await ctx.db
    .query('redemptionCelebrationReceipts')
    .withIndex('by_canonicalRedemptionEventId', (q: any) =>
      q.eq('canonicalRedemptionEventId', args.canonicalRedemptionEventId)
    )
    .take(SINGLETON_LIMIT);
  if (existing.length > 1) {
    throw new Error('REDEMPTION_RECEIPT_BINDING_CONFLICT');
  }
  if (existing.length === 1) {
    const receipt = existing[0];
    if (
      String(receipt.ownerUserId) !== String(args.ownerUserId) ||
      String(receipt.businessId) !== String(args.businessId) ||
      String(receipt.membershipId ?? '') !== String(args.membershipId ?? '') ||
      String(receipt.referralRewardId ?? '') !==
        String(args.referralRewardId ?? '') ||
      receipt.variant !== args.variant ||
      receipt.confirmedAt !== args.confirmedAt
    ) {
      throw new Error('REDEMPTION_RECEIPT_BINDING_CONFLICT');
    }
    return receipt;
  }

  const receiptToken = await generateUniqueReceiptToken(ctx);
  const confirmedAt = args.confirmedAt;
  const receiptId = await ctx.db.insert('redemptionCelebrationReceipts', {
    ownerUserId: args.ownerUserId,
    businessId: args.businessId,
    membershipId: args.membershipId,
    canonicalRedemptionEventId: args.canonicalRedemptionEventId,
    referralRewardId: args.referralRewardId,
    receiptToken,
    variant: args.variant,
    status: 'available',
    businessName: cleanSnapshotText(args.businessName, 'בית העסק', 80),
    businessLogoUrl: cleanPublicLogoUrl(args.businessLogoUrl),
    programDisplayName: cleanOptionalSnapshotText(
      args.programDisplayName,
      100
    ),
    rewardDisplayName: cleanSnapshotText(
      args.rewardDisplayName,
      'הטבה מיוחדת',
      120
    ),
    cardThemeId: cleanOptionalSnapshotText(args.cardThemeId, 80),
    confirmedAt,
    autoPresentUntil: confirmedAt + REDEMPTION_AUTO_PRESENT_MS,
    expiresAt: confirmedAt + REDEMPTION_REOPEN_MS,
    purgeAfter: confirmedAt + REDEMPTION_RETENTION_MS,
    createdAt: confirmedAt,
    updatedAt: confirmedAt,
  });
  return await ctx.db.get(receiptId);
}

export async function revokeRedemptionCelebrationReceipt(
  ctx: any,
  args: {
    canonicalRedemptionEventId: Id<'events'>;
    revocationEventId?: Id<'events'>;
    revokedAt: number;
  }
) {
  const receipts = await ctx.db
    .query('redemptionCelebrationReceipts')
    .withIndex('by_canonicalRedemptionEventId', (q: any) =>
      q.eq('canonicalRedemptionEventId', args.canonicalRedemptionEventId)
    )
    .take(SINGLETON_LIMIT);
  if (receipts.length > 1) {
    throw new Error('REDEMPTION_RECEIPT_BINDING_CONFLICT');
  }
  const receipt = receipts[0];
  if (!receipt || receipt.status === 'revoked') {
    return;
  }
  await ctx.db.patch(receipt._id, {
    status: 'revoked',
    claimToken: undefined,
    claimExpiresAt: undefined,
    revokedAt: args.revokedAt,
    revocationEventId: args.revocationEventId,
    updatedAt: args.revokedAt,
  });
}

export function buildPrivacySafeRedemptionPresentation(
  receipt: any,
  now = Date.now()
) {
  const state =
    receipt.status === 'revoked'
      ? 'revoked'
      : receipt.status === 'expired' || receipt.expiresAt <= now
        ? 'expired'
        : 'normal';
  return {
    variant: receipt.variant === 'referral' ? 'referral' : 'standard',
    state,
    businessName: receipt.businessName,
    businessLogoUrl: receipt.businessLogoUrl ?? null,
    programDisplayName: receipt.programDisplayName ?? null,
    rewardDisplayName: receipt.rewardDisplayName,
    cardThemeId: receipt.cardThemeId ?? null,
  } as const;
}
