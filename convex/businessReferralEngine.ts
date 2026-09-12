import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  query,
} from './_generated/server';
import {
  requireActorHasBusinessCapability,
  requireCurrentUser,
} from './guards';
import { generateJoinCode } from './lib/ids';
import {
  REFERRAL_CONTRACT,
  buildCanonicalReferralUrl,
  getReferrerRewardMonths,
} from './lib/billing/productionContract';
import { getBillingAccountForBusiness } from './lib/billing/accounts';
import {
  buildRewardIdempotencyKey,
  canAcceptMoreWalletMonths,
  countCompletedMonthlyPaidPeriods,
  evaluateReferralClaimGate,
  hasCompletedAnnualTerm,
  resolveRewardEligibility,
  walletMonthsFromRewards,
} from './lib/referrals/qualification';
import { REFERRAL_COPY } from './lib/referrals/copy';
import { selectRedemptionProvider } from './lib/referrals/redemptionProvider';
import { sendPushNotificationToUser } from './pushNotifications';
import { runRegisteredHandler } from './lib/runRegisteredHandler';

const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{8,24}$/;

function publicReferralPayload(args: {
  code: string;
  status: 'valid' | 'invalid' | 'revoked' | 'unknown';
  businessPublicName?: string;
}) {
  return {
    code: args.code,
    status: args.status,
    businessPublicName: args.businessPublicName ?? null,
    benefitCopy: REFERRAL_COPY.landingBenefit,
    url: buildCanonicalReferralUrl(args.code),
  };
}

async function getActiveCode(ctx: any, code: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return await ctx.db
    .query('businessReferralCodes')
    .withIndex('by_code', (q: any) => q.eq('code', normalized))
    .first();
}

async function getRelationshipForReferredBusiness(
  ctx: any,
  referredBusinessId: Id<'businesses'>
) {
  return await ctx.db
    .query('businessReferralRelationships')
    .withIndex('by_referredBusinessId', (q: any) =>
      q.eq('referredBusinessId', referredBusinessId)
    )
    .first();
}

async function listWalletRewards(ctx: any, businessId: Id<'businesses'>) {
  return await ctx.db
    .query('businessReferralRewards')
    .withIndex('by_beneficiaryBusinessId_status', (q: any) =>
      q.eq('beneficiaryBusinessId', businessId)
    )
    .collect();
}

export const resolvePublicBusinessReferralCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const normalized = code.trim();
    if (!REFERRAL_CODE_PATTERN.test(normalized)) {
      return publicReferralPayload({ code: normalized, status: 'invalid' });
    }
    const row = await getActiveCode(ctx, normalized);
    if (!row) {
      return publicReferralPayload({ code: normalized, status: 'unknown' });
    }
    if (row.status !== 'active') {
      return publicReferralPayload({ code: normalized, status: 'revoked' });
    }
    const business = await ctx.db.get(row.referrerBusinessId) as
      | { name?: string }
      | null;
    return publicReferralPayload({
      code: normalized,
      status: 'valid',
      businessPublicName: business?.name,
    });
  },
});

export const getOrCreateBusinessReferralCode = mutation({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, { businessId }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'invite_businesses'
    );
    const existing = await ctx.db
      .query('businessReferralCodes')
      .withIndex('by_referrerBusinessId_status', (q: any) =>
        q.eq('referrerBusinessId', businessId).eq('status', 'active')
      )
      .first();
    if (existing) {
      return {
        code: existing.code,
        url: buildCanonicalReferralUrl(existing.code),
      };
    }
    const now = Date.now();
    let code = generateJoinCode(10);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const collision = await getActiveCode(ctx, code);
      if (!collision) {
        break;
      }
      code = generateJoinCode(10);
    }
    const user = await requireCurrentUser(ctx);
    await ctx.db.insert('businessReferralCodes', {
      code,
      referrerBusinessId: businessId,
      createdByUserId: user._id,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    return { code, url: buildCanonicalReferralUrl(code) };
  },
});

export async function claimReferralCodeForBusiness(
  ctx: any,
  args: {
    code: string;
    referredBusinessId: Id<'businesses'>;
    actorUserId: Id<'users'>;
  }
) {
  const normalized = args.code.trim();
  const referralCode = await getActiveCode(ctx, normalized);
  if (!referralCode || referralCode.status !== 'active') {
    return { ok: false as const, reason: 'invalid_code' };
  }
  const referredBusiness = await ctx.db.get(args.referredBusinessId);
  const referrerBusiness = await ctx.db.get(referralCode.referrerBusinessId);
  if (!referredBusiness || !referrerBusiness) {
    return { ok: false as const, reason: 'invalid_code' };
  }
  const existing = await getRelationshipForReferredBusiness(
    ctx,
    args.referredBusinessId
  );
  const referredBilling = await getBillingAccountForBusiness(
    ctx,
    args.referredBusinessId
  );
  const claimGate = evaluateReferralClaimGate({
    codeStatus: referralCode.status,
    referrerBusinessId: String(referrerBusiness._id),
    referredBusinessId: String(referredBusiness._id),
    referrerOwnerUserId: String(referrerBusiness.ownerUserId),
    referredOwnerUserId: String(referredBusiness.ownerUserId),
    existingRelationship: Boolean(existing),
    referredAlreadyPaid: referredBilling?.hasProviderEvidence === true,
  });
  if (!claimGate.ok) {
    return { ok: false as const, reason: claimGate.reason };
  }
  const now = Date.now();
  const relationshipId = await ctx.db.insert('businessReferralRelationships', {
    codeId: referralCode._id,
    referrerBusinessId: referralCode.referrerBusinessId,
    referredBusinessId: args.referredBusinessId,
    referredOwnerUserId: referredBusiness.ownerUserId,
    createdByUserId: args.actorUserId,
    status: 'claimed',
    claimedAt: now,
    paidMonthsConfirmed: 0,
    createdAt: now,
    updatedAt: now,
  });
  return {
    ok: true as const,
    relationshipId,
    referrerPublicName: referrerBusiness.name,
    benefitCopy: REFERRAL_COPY.referredOnboardingBenefit,
  };
}

export const claimBusinessReferralCode = mutation({
  args: {
    code: v.string(),
    referredBusinessId: v.id('businesses'),
  },
  handler: async (ctx, { code, referredBusinessId }) => {
    const { actor } = await requireActorHasBusinessCapability(
      ctx,
      referredBusinessId,
      'manage_subscription'
    );
    return await claimReferralCodeForBusiness(ctx, {
      code,
      referredBusinessId,
      actorUserId: actor._id,
    });
  },
});

export const getBusinessReferralHub = query({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, { businessId }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'invite_businesses'
    );
    const relationships = await ctx.db
      .query('businessReferralRelationships')
      .withIndex('by_referrerBusinessId_status', (q: any) =>
        q.eq('referrerBusinessId', businessId)
      )
      .collect();
    const rewards = await listWalletRewards(ctx, businessId);
    const walletMonths = walletMonthsFromRewards(rewards);
    const pendingMonths = relationships
      .filter((row: any) =>
        ['claimed', 'subscription_started', 'qualification_pending'].includes(
          row.status
        )
      )
      .reduce((sum: number, row: any) => {
        const period = row.effectiveBillingPeriod === 'yearly' ? 'yearly' : 'monthly';
        return sum + getReferrerRewardMonths(period);
      }, 0);
    const redeemedMonths = rewards
      .filter((row: any) => row.status === 'redeemed')
      .reduce((sum: number, row: any) => sum + Number(row.rewardMonths ?? 0), 0);
    return {
      heading: REFERRAL_COPY.hubHeading,
      metrics: {
        monthsEarned: walletMonths,
        monthsPending: pendingMonths,
        monthsRedeemed: redeemedMonths,
        invited: relationships.length,
        joined: relationships.filter((row: any) => row.referredBusinessId).length,
        matured: relationships.filter((row: any) =>
          ['qualified', 'reward_created'].includes(row.status)
        ).length,
      },
      walletCap: REFERRAL_CONTRACT.walletUnredeemedCapMonths,
      remainingCap: Math.max(
        0,
        REFERRAL_CONTRACT.walletUnredeemedCapMonths - walletMonths
      ),
      history: await Promise.all(
        relationships.map(async (row: any) => {
          const referred = row.referredBusinessId
            ? await ctx.db.get(row.referredBusinessId)
            : null;
          return {
            id: row._id,
            publicName: (referred as { name?: string } | null)?.name ?? 'עסק מוזמן',
            claimedAt: row.claimedAt ?? row.createdAt,
            status: row.status,
            paidMonthsConfirmed: row.paidMonthsConfirmed ?? 0,
            requiredMonths: REFERRAL_CONTRACT.qualificationPaidMonths,
          };
        })
      ),
      rewards: rewards.map((row: any) => ({
        id: row._id,
        months: row.rewardMonths,
        status: row.status,
        type: row.rewardType,
        earnedAt: row.earnedAt,
        eligibleAt: row.eligibleAt,
        redeemedAt: row.redeemedAt,
      })),
    };
  },
});

export const getBusinessReferralCreditSummary = query({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, { businessId }) => {
    const hub = await runRegisteredHandler<any>(
      getBusinessReferralHub,
      ctx,
      { businessId }
    );
    return {
      creditedMonths: hub.metrics.monthsEarned,
      pendingMonths: hub.metrics.monthsPending,
      remainingCapMonths: hub.remainingCap,
      pendingInvitesCount: hub.metrics.joined,
    };
  },
});

export const getOrCreateBusinessReferralLink = mutation({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, args) => {
    return await runRegisteredHandler(getOrCreateBusinessReferralCode, ctx, args);
  },
});

async function notifyBusinessOwner(
  ctx: any,
  businessId: Id<'businesses'>,
  title: string,
  body: string
) {
  const business = await ctx.db.get(businessId);
  if (!business?.ownerUserId) {
    return;
  }
  try {
    await sendPushNotificationToUser(ctx, {
      businessId,
      toUserId: business.ownerUserId,
      title,
      body,
    });
  } catch {
    // Notification delivery must never block billing/referral state.
  }
}

async function createRewardIfAbsent(
  ctx: any,
  args: {
    relationship: any;
    beneficiaryBusinessId: Id<'businesses'>;
    rewardType: 'referrer_acquisition' | 'referred_anniversary';
    months: number;
    sourceEventId?: string;
    now: number;
  }
) {
  const idempotencyKey = buildRewardIdempotencyKey({
    relationshipId: String(args.relationship._id),
    rewardType: args.rewardType,
    sourceEventId: args.sourceEventId,
  });
  const existing = await ctx.db
    .query('businessReferralRewards')
    .withIndex('by_idempotencyKey', (q: any) =>
      q.eq('idempotencyKey', idempotencyKey)
    )
    .first();
  if (existing) {
    return existing._id;
  }
  const wallet = await listWalletRewards(ctx, args.beneficiaryBusinessId);
  const currentMonths = walletMonthsFromRewards(wallet);
  if (!canAcceptMoreWalletMonths(currentMonths, args.months)) {
    return null;
  }
  const beneficiaryBilling = await getBillingAccountForBusiness(
    ctx,
    args.beneficiaryBusinessId
  );
  const beneficiaryPeriods = await ctx.db
    .query('businessPaidServicePeriods')
    .withIndex('by_businessId', (q: any) =>
      q.eq('businessId', args.beneficiaryBusinessId)
    )
    .collect();
  const eligibility = resolveRewardEligibility({
    rewardType: args.rewardType,
    beneficiaryPeriod:
      beneficiaryBilling?.billingPeriod === 'yearly' ? 'yearly' : 'monthly',
    beneficiaryPaidMonths: countCompletedMonthlyPaidPeriods(
      beneficiaryPeriods,
      args.now
    ),
    currentPeriodEndAt: beneficiaryBilling?.currentPeriodEndAt ?? null,
    earnedAt: args.now,
    now: args.now,
  });
  const rewardId = await ctx.db.insert('businessReferralRewards', {
    relationshipId: args.relationship._id,
    referrerBusinessId: args.relationship.referrerBusinessId,
    referredBusinessId: args.relationship.referredBusinessId,
    beneficiaryBusinessId: args.beneficiaryBusinessId,
    rewardType: args.rewardType,
    rewardMonths: args.months,
    reason: args.rewardType,
    status: eligibility.status,
    earnedAt: args.now,
    eligibleAt: eligibility.eligibleAt,
    sourceProviderEventId: args.sourceEventId,
    idempotencyKey,
    createdAt: args.now,
    updatedAt: args.now,
  });
  const celebrationTitle =
    args.months === 2
      ? REFERRAL_COPY.earnedTwoMonths
      : args.rewardType === 'referred_anniversary'
        ? REFERRAL_COPY.referredQualified
        : REFERRAL_COPY.earnedOneMonth;
  await notifyBusinessOwner(
    ctx,
    args.beneficiaryBusinessId,
    celebrationTitle,
    args.rewardType === 'referred_anniversary'
      ? REFERRAL_COPY.referredRewardWaiting
      : REFERRAL_COPY.shareBenefit
  );
  return rewardId;
}

export const evaluateReferralProgressInternal = internalMutation({
  args: {
    businessId: v.id('businesses'),
    eventType: v.string(),
    eventId: v.string(),
    plan: v.optional(v.string()),
    period: v.optional(v.union(v.literal('monthly'), v.literal('yearly'), v.null())),
    expirationAt: v.optional(v.union(v.number(), v.null())),
    isRevoked: v.optional(v.boolean()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const relationship = await getRelationshipForReferredBusiness(
      ctx,
      args.businessId
    );
    if (!relationship) {
      return { evaluated: false };
    }
    if (args.isRevoked) {
      if (relationship.status !== 'reward_created') {
        await ctx.db.patch(relationship._id, {
          status: 'revoked',
          skipReason: 'provider_revoked_before_qualification',
          updatedAt: args.now,
        });
        return { evaluated: true, revoked: true };
      }
      const wallet = await listWalletRewards(ctx, relationship.referrerBusinessId);
      for (const reward of wallet) {
        if (
          String(reward.relationshipId) === String(relationship._id) &&
          reward.status !== 'redeemed' &&
          reward.status !== 'revoked'
        ) {
          await ctx.db.patch(reward._id, {
            status: 'revoked',
            revokedAt: args.now,
            revokeReason: 'qualifying_purchase_invalidated',
            updatedAt: args.now,
          });
        }
      }
      return { evaluated: true, revoked: true, afterQualification: true };
    }
    const period =
      args.period === 'yearly' || args.period === 'monthly'
        ? args.period
        : relationship.effectiveBillingPeriod ?? 'monthly';
    const periods = await ctx.db
      .query('businessPaidServicePeriods')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', args.businessId))
      .collect();
    if (
      ['INITIAL_PURCHASE', 'RENEWAL'].includes(args.eventType) &&
      args.period
    ) {
      const idempotencyKey = `paid:${args.eventId}`;
      const existingPeriod = await ctx.db
        .query('businessPaidServicePeriods')
        .withIndex('by_businessId_idempotencyKey', (q: any) =>
          q.eq('businessId', args.businessId).eq('idempotencyKey', idempotencyKey)
        )
        .first();
      if (!existingPeriod) {
        await ctx.db.insert('businessPaidServicePeriods', {
          businessId: args.businessId,
          billingPeriod: period,
          plan: args.plan === 'premium' || args.plan === 'pro' ? args.plan : 'starter',
          periodStartAt: args.now,
          periodEndAt: args.expirationAt ?? undefined,
          isPaid: true,
          isReferralReward: false,
          isRefunded: false,
          sourceEventId: args.eventId,
          idempotencyKey,
          createdAt: args.now,
          updatedAt: args.now,
        });
      }
    }
    const paidMonths =
      period === 'yearly'
        ? annualQualificationElapsedSafe(
            relationship.firstPaidAt ?? relationship.subscriptionStartedAt ?? args.now,
            args.now
          )
          ? REFERRAL_CONTRACT.qualificationPaidMonths
          : Math.min(
              REFERRAL_CONTRACT.qualificationPaidMonths - 1,
              relationship.paidMonthsConfirmed ?? 0
            )
        : countCompletedMonthlyPaidPeriods(
            [...periods, ...(args.period ? [{
              isPaid: true,
              isReferralReward: false,
              isRefunded: false,
              periodStartAt: args.now,
              periodEndAt: args.expirationAt,
              billingPeriod: period,
            }] : [])],
            args.now
          );
    const nextStatus =
      paidMonths >= REFERRAL_CONTRACT.qualificationPaidMonths
        ? 'qualified'
        : args.eventType === 'INITIAL_PURCHASE'
          ? 'subscription_started'
          : 'qualification_pending';
    await ctx.db.patch(relationship._id, {
      status: nextStatus === 'qualified' ? 'qualified' : nextStatus,
      effectiveBillingPeriod: period,
      paidMonthsConfirmed: Math.max(relationship.paidMonthsConfirmed ?? 0, paidMonths),
      subscriptionStartedAt:
        relationship.subscriptionStartedAt ??
        (args.eventType === 'INITIAL_PURCHASE' ? args.now : undefined),
      firstPaidAt: relationship.firstPaidAt ?? args.now,
      updatedAt: args.now,
    });
    if (nextStatus === 'qualified') {
      await createRewardIfAbsent(ctx, {
        relationship: {
          ...relationship,
          referredBusinessId: args.businessId,
        },
        beneficiaryBusinessId: relationship.referrerBusinessId,
        rewardType: 'referrer_acquisition',
        months: getReferrerRewardMonths(period),
        sourceEventId: args.eventId,
        now: args.now,
      });
      await ctx.db.patch(relationship._id, {
        status: 'reward_created',
        qualifiedAt: args.now,
        updatedAt: args.now,
      });
    }
    const referredPaidMonths = countCompletedMonthlyPaidPeriods(periods, args.now);
    if (
      (period === 'monthly' &&
        referredPaidMonths >= REFERRAL_CONTRACT.referredAnniversaryPaidMonths) ||
      (period === 'yearly' && hasCompletedAnnualTerm(periods, args.now))
    ) {
      if (!relationship.anniversaryRewardedAt) {
        await createRewardIfAbsent(ctx, {
          relationship: {
            ...relationship,
            referredBusinessId: args.businessId,
          },
          beneficiaryBusinessId: args.businessId,
          rewardType: 'referred_anniversary',
          months: REFERRAL_CONTRACT.referredAnniversaryRewardMonths,
          sourceEventId: `${args.eventId}:anniversary`,
          now: args.now,
        });
        await ctx.db.patch(relationship._id, {
          anniversaryRewardedAt: args.now,
          updatedAt: args.now,
        });
      }
    }
    return { evaluated: true, status: nextStatus, paidMonths };
  },
});

function annualQualificationElapsedSafe(firstPaidAt: number, now: number) {
  return (
    now - firstPaidAt >=
    REFERRAL_CONTRACT.qualificationPaidMonths * 30 * 24 * 60 * 60 * 1000
  );
}

export const prepareReferralRewardRedemption = mutation({
  args: {
    businessId: v.id('businesses'),
    rewardId: v.id('businessReferralRewards'),
    store: v.union(v.literal('apple'), v.literal('google')),
  },
  handler: async (ctx, { businessId, rewardId, store }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'manage_subscription'
    );
    const reward = await ctx.db.get(rewardId);
    if (!reward || String(reward.beneficiaryBusinessId) !== String(businessId)) {
      throw new Error('REWARD_NOT_FOUND');
    }
    if (reward.status === 'redeemed') {
      return { canRedeem: false, provider: store, code: 'ALREADY_REDEEMED', message: 'ההטבה כבר מומשה' };
    }
    const existingRedemption = await ctx.db
      .query('businessReferralRewardRedemptions')
      .withIndex('by_idempotencyKey', (q: any) =>
        q.eq('idempotencyKey', `redeem:${String(rewardId)}`)
      )
      .first();
    if (existingRedemption?.status === 'confirmed') {
      return { canRedeem: false, provider: store, code: 'ALREADY_REDEEMED', message: 'ההטבה כבר מומשה' };
    }
    if (
      reward.status !== 'earned' &&
      reward.status !== 'redeemable' &&
      reward.status !== 'scheduled' &&
      reward.status !== 'redeeming' &&
      reward.status !== 'failed'
    ) {
      throw new Error('REWARD_NOT_REDEEMABLE');
    }
    const billing = await getBillingAccountForBusiness(ctx, businessId);
    const beneficiaryPeriods = await ctx.db
      .query('businessPaidServicePeriods')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .collect();
    const eligibility = resolveRewardEligibility({
      rewardType: reward.rewardType,
      beneficiaryPeriod:
        billing?.billingPeriod === 'yearly' ? 'yearly' : 'monthly',
      beneficiaryPaidMonths: countCompletedMonthlyPaidPeriods(
        beneficiaryPeriods,
        Date.now()
      ),
      currentPeriodEndAt: billing?.currentPeriodEndAt ?? null,
      earnedAt: reward.earnedAt ?? Date.now(),
    });
    if (!eligibility.canRedeem) {
      return {
        canRedeem: false,
        provider: store,
        code: 'NOT_YET_ELIGIBLE',
        message:
          billing?.billingPeriod === 'yearly'
            ? 'ההטבה תמומש בסוף תקופת המנוי השנתית'
            : 'ההטבה תהיה זמינה למימוש אחרי שישה חודשי מנוי בתשלום',
      };
    }
    const provider = selectRedemptionProvider(store, {
      googleSecretApiKey: process.env.REVENUECAT_SECRET_API_KEY ?? null,
    });
    const prepared = provider.canRedeem({
      months: reward.rewardMonths,
      hasActivePaidSubscription: billing?.hasProviderEvidence === true &&
        (billing.status === 'active' || billing.status === 'canceled'),
      storeProductId: billing?.providerProductId,
    });
    if (prepared.canRedeem !== true) {
      return prepared;
    }
    if (store === 'google' && prepared.mode === 'defer') {
      await ctx.db.patch(rewardId, {
        status: 'redeeming',
        updatedAt: Date.now(),
      });
      const applied = await provider.apply({
        months: reward.rewardMonths,
        providerAppUserId: billing?.providerAppUserId ?? '',
        productId: billing?.providerProductId,
        idempotencyKey: `redeem:${String(rewardId)}`,
      });
      if (!applied.ok) {
        await ctx.db.patch(rewardId, {
          status: 'redeemable',
          updatedAt: Date.now(),
        });
        return {
          canRedeem: false,
          provider: 'google',
          code: applied.failureCode ?? 'GOOGLE_DEFER_FAILED',
          message: 'לא הצלחנו להפעיל את ההטבה כרגע',
        };
      }
      await ctx.db.patch(rewardId, {
        status: 'redeemed',
        redeemedAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert('businessReferralRewardRedemptions', {
        rewardId,
        beneficiaryBusinessId: businessId,
        provider: 'google',
        monthsRequested: reward.rewardMonths,
        monthsConfirmed: applied.monthsConfirmed,
        status: 'confirmed',
        idempotencyKey: `redeem:${String(rewardId)}`,
        providerRequestFingerprint: applied.requestFingerprint,
        newPeriodEndAt: applied.newPeriodEndAt,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { ...prepared, applied: true, newPeriodEndAt: applied.newPeriodEndAt };
    }
    return prepared;
  },
});

export const confirmReferralRewardRedemption = mutation({
  args: {
    businessId: v.id('businesses'),
    rewardId: v.id('businessReferralRewards'),
    monthsConfirmed: v.number(),
    newPeriodEndAt: v.optional(v.number()),
    providerRedemptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireActorHasBusinessCapability(
      ctx,
      args.businessId,
      'manage_subscription'
    );
    const reward = await ctx.db.get(args.rewardId);
    if (!reward || String(reward.beneficiaryBusinessId) !== String(args.businessId)) {
      throw new Error('REWARD_NOT_FOUND');
    }
    const idempotencyKey = `redeem:${String(args.rewardId)}`;
    const existingRedemption = await ctx.db
      .query('businessReferralRewardRedemptions')
      .withIndex('by_idempotencyKey', (q: any) =>
        q.eq('idempotencyKey', idempotencyKey)
      )
      .first();
    if (reward.status === 'redeemed' || existingRedemption?.status === 'confirmed') {
      return { ok: true, duplicate: true };
    }
    const now = Date.now();
    await ctx.db.patch(args.rewardId, {
      status: 'redeemed',
      redeemedAt: now,
      providerRedemptionId: args.providerRedemptionId,
      updatedAt: now,
    });
    await ctx.db.insert('businessReferralRewardRedemptions', {
      rewardId: args.rewardId,
      beneficiaryBusinessId: args.businessId,
      provider: 'revenuecat',
      monthsRequested: reward.rewardMonths,
      monthsConfirmed: args.monthsConfirmed,
      status: 'confirmed',
      idempotencyKey,
      newPeriodEndAt: args.newPeriodEndAt,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true, duplicate: false };
  },
});

export const evaluateDueReferralsInternal = internalMutation({
  args: {
    now: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const limit = Math.min(50, Math.max(1, args.limit ?? 25));
    const pending = await ctx.db
      .query('businessReferralRelationships')
      .withIndex('by_status_qualificationDueAt', (q: any) =>
        q.eq('status', 'qualification_pending')
      )
      .order('asc')
      .take(limit);
    let evaluated = 0;
    for (const row of pending) {
      if (row.qualificationDueAt && Number(row.qualificationDueAt) > now) {
        continue;
      }
      if (!row.referredBusinessId) {
        continue;
      }
      await runRegisteredHandler(evaluateReferralProgressInternal, ctx, {
        businessId: row.referredBusinessId,
        eventType: 'RECONCILE',
        eventId: `reconcile:${String(row._id)}:${now}`,
        now,
      });
      evaluated += 1;
    }
    return { evaluated, now };
  },
});
