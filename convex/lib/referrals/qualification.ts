import {
  REFERRAL_CONTRACT,
  REFERRAL_WALLET_CAP_STATES,
  type BillingPeriod,
  type ReferralRewardState,
  getReferrerRewardMonths,
} from '../billing/productionContract';

export type PaidPeriodRecord = {
  isPaid: boolean;
  isReferralReward: boolean;
  isRefunded: boolean;
  periodStartAt: number;
  periodEndAt?: number | null;
  billingPeriod: BillingPeriod;
};

export function countConfirmedPaidMonths(
  periods: PaidPeriodRecord[],
  now = Date.now()
): number {
  return periods.filter((period) => {
    if (!period.isPaid || period.isReferralReward || period.isRefunded) {
      return false;
    }
    if (period.billingPeriod === 'yearly') {
      const end = period.periodEndAt ?? period.periodStartAt + 365 * 24 * 60 * 60 * 1000;
      return period.periodStartAt <= now && end >= now;
    }
    const end = period.periodEndAt ?? now;
    return period.periodStartAt <= now && end <= now + 1;
  }).length;
}

export function countCompletedMonthlyPaidPeriods(
  periods: PaidPeriodRecord[],
  now = Date.now()
): number {
  return periods.filter(
    (period) =>
      period.billingPeriod === 'monthly' &&
      period.isPaid &&
      !period.isReferralReward &&
      !period.isRefunded &&
      typeof period.periodEndAt === 'number' &&
      period.periodEndAt <= now
  ).length;
}

export function hasCompletedAnnualTerm(
  periods: PaidPeriodRecord[],
  now = Date.now()
): boolean {
  return periods.some(
    (period) =>
      period.billingPeriod === 'yearly' &&
      period.isPaid &&
      !period.isReferralReward &&
      !period.isRefunded &&
      typeof period.periodEndAt === 'number' &&
      period.periodEndAt <= now
  );
}

export function annualQualificationElapsed(
  firstPaidAt: number,
  now = Date.now()
): boolean {
  const requiredMs =
    REFERRAL_CONTRACT.qualificationPaidMonths * 30 * 24 * 60 * 60 * 1000;
  return now - firstPaidAt >= requiredMs;
}

export function resolveReferrerRewardMonths(period: BillingPeriod): number {
  return getReferrerRewardMonths(period);
}

export function walletMonthsFromRewards(
  rewards: Array<{ status: ReferralRewardState; rewardMonths: number }>
): number {
  return rewards
    .filter((reward) =>
      (REFERRAL_WALLET_CAP_STATES as readonly string[]).includes(reward.status)
    )
    .reduce((sum, reward) => sum + Math.max(0, reward.rewardMonths), 0);
}

export function canAcceptMoreWalletMonths(
  currentWalletMonths: number,
  incomingMonths: number
): boolean {
  return (
    currentWalletMonths + incomingMonths <=
    REFERRAL_CONTRACT.walletUnredeemedCapMonths
  );
}

export function buildRewardIdempotencyKey(args: {
  relationshipId: string;
  rewardType: string;
  sourceEventId?: string;
}): string {
  return [
    args.relationshipId,
    args.rewardType,
    args.sourceEventId ?? 'qualification',
  ].join(':');
}

export function isSelfOrSameOwnerReferral(args: {
  referrerBusinessId: string;
  referredBusinessId?: string | null;
  referrerOwnerUserId: string;
  referredOwnerUserId?: string | null;
}): { blocked: boolean; reason?: string } {
  if (
    args.referredBusinessId &&
    args.referredBusinessId === args.referrerBusinessId
  ) {
    return { blocked: true, reason: 'self_referral' };
  }
  if (
    args.referredOwnerUserId &&
    args.referredOwnerUserId === args.referrerOwnerUserId
  ) {
    return { blocked: true, reason: 'same_owner_referral' };
  }
  return { blocked: false };
}

export function isReferrerRedemptionMature(args: {
  billingPeriod: BillingPeriod | null;
  paidMonths: number;
  currentPeriodEndAt: number | null;
  now?: number;
}): boolean {
  const now = args.now ?? Date.now();
  if (args.billingPeriod === 'yearly') {
    return (
      typeof args.currentPeriodEndAt === 'number' &&
      args.currentPeriodEndAt <= now
    );
  }
  return (
    args.paidMonths >=
    REFERRAL_CONTRACT.referrerMonthlyRedemptionMaturityPaidMonths
  );
}

export function resolveRewardEligibility(args: {
  rewardType: string;
  beneficiaryPeriod: BillingPeriod | null;
  beneficiaryPaidMonths: number;
  currentPeriodEndAt: number | null;
  earnedAt: number;
  now?: number;
}): {
  status: 'earned' | 'scheduled' | 'redeemable';
  eligibleAt: number;
  canRedeem: boolean;
} {
  const now = args.now ?? Date.now();
  if (args.rewardType === 'referred_anniversary') {
    return {
      status: 'redeemable',
      eligibleAt: args.earnedAt,
      canRedeem: true,
    };
  }
  if (args.beneficiaryPeriod === 'yearly') {
    const eligibleAt = args.currentPeriodEndAt ?? args.earnedAt;
    const canRedeem = eligibleAt <= now;
    return {
      status: canRedeem ? 'redeemable' : 'scheduled',
      eligibleAt,
      canRedeem,
    };
  }
  const mature = isReferrerRedemptionMature({
    billingPeriod: 'monthly',
    paidMonths: args.beneficiaryPaidMonths,
    currentPeriodEndAt: args.currentPeriodEndAt,
    now,
  });
  return {
    status: mature ? 'redeemable' : 'earned',
    eligibleAt: args.earnedAt,
    canRedeem: mature,
  };
}

export function evaluateReferralClaimGate(args: {
  codeStatus?: string | null;
  referrerBusinessId: string;
  referredBusinessId: string;
  referrerOwnerUserId: string;
  referredOwnerUserId?: string | null;
  existingRelationship?: boolean;
  referredAlreadyPaid?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (!args.codeStatus || args.codeStatus === 'unknown') {
    return { ok: false, reason: 'invalid_code' };
  }
  if (args.codeStatus === 'revoked' || args.codeStatus === 'rotated') {
    return { ok: false, reason: 'revoked_code' };
  }
  if (args.codeStatus !== 'active') {
    return { ok: false, reason: 'invalid_code' };
  }
  const self = isSelfOrSameOwnerReferral({
    referrerBusinessId: args.referrerBusinessId,
    referredBusinessId: args.referredBusinessId,
    referrerOwnerUserId: args.referrerOwnerUserId,
    referredOwnerUserId: args.referredOwnerUserId,
  });
  if (self.blocked) {
    return { ok: false, reason: self.reason ?? 'self_referral' };
  }
  if (args.existingRelationship) {
    return { ok: false, reason: 'already_referred' };
  }
  if (args.referredAlreadyPaid) {
    return { ok: false, reason: 'already_subscribed' };
  }
  return { ok: true };
}
