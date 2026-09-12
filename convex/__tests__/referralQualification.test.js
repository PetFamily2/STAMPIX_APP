import { describe, expect, test } from 'bun:test';

import {
  buildRewardIdempotencyKey,
  canAcceptMoreWalletMonths,
  countCompletedMonthlyPaidPeriods,
  evaluateReferralClaimGate,
  hasCompletedAnnualTerm,
  isSelfOrSameOwnerReferral,
  resolveReferrerRewardMonths,
  resolveRewardEligibility,
  walletMonthsFromRewards,
} from '../lib/referrals/qualification';
import { REFERRAL_COPY } from '../lib/referrals/copy';
import { REFERRAL_CONTRACT } from '../lib/billing/productionContract';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

describe('referral attribution and fraud', () => {
  test('blocks self and same-owner referral', () => {
    expect(
      isSelfOrSameOwnerReferral({
        referrerBusinessId: 'b1',
        referredBusinessId: 'b1',
        referrerOwnerUserId: 'o1',
      }).blocked
    ).toBe(true);
    expect(
      isSelfOrSameOwnerReferral({
        referrerBusinessId: 'b1',
        referredBusinessId: 'b2',
        referrerOwnerUserId: 'o1',
        referredOwnerUserId: 'o1',
      }).reason
    ).toBe('same_owner_referral');
  });
});

describe('referrer qualification', () => {
  test('monthly referred subscription rewards 1 month only after 3 paid months', () => {
    const month1 = [
      {
        billingPeriod: 'monthly',
        isPaid: true,
        isReferralReward: false,
        isRefunded: false,
        periodStartAt: 1,
        periodEndAt: MONTH_MS,
      },
    ];
    expect(countCompletedMonthlyPaidPeriods(month1, MONTH_MS)).toBe(1);
    const month3 = [1, 2, 3].map((index) => ({
      billingPeriod: 'monthly',
      isPaid: true,
      isReferralReward: false,
      isRefunded: false,
      periodStartAt: index * MONTH_MS,
      periodEndAt: (index + 1) * MONTH_MS,
    }));
    expect(countCompletedMonthlyPaidPeriods(month3, 4 * MONTH_MS)).toBe(3);
    expect(resolveReferrerRewardMonths('monthly')).toBe(1);
    expect(resolveReferrerRewardMonths('yearly')).toBe(2);
  });

  test('refunded periods do not count', () => {
    const periods = [1, 2, 3].map((index) => ({
      billingPeriod: 'monthly',
      isPaid: true,
      isReferralReward: false,
      isRefunded: index === 2,
      periodStartAt: index * MONTH_MS,
      periodEndAt: (index + 1) * MONTH_MS,
    }));
    expect(countCompletedMonthlyPaidPeriods(periods, 4 * MONTH_MS)).toBe(2);
  });

  test('free referral months do not count as paid', () => {
    const periods = [
      {
        billingPeriod: 'monthly',
        isPaid: true,
        isReferralReward: true,
        isRefunded: false,
        periodStartAt: 1,
        periodEndAt: MONTH_MS,
      },
    ];
    expect(countCompletedMonthlyPaidPeriods(periods, MONTH_MS + 1)).toBe(0);
  });

  test('annual referred qualification is 2 months after 3 valid months elapsed', () => {
    expect(REFERRAL_CONTRACT.referrerYearlyRewardMonths).toBe(2);
    expect(
      hasCompletedAnnualTerm(
        [
          {
            billingPeriod: 'yearly',
            isPaid: true,
            isReferralReward: false,
            isRefunded: false,
            periodStartAt: 0,
            periodEndAt: 12 * MONTH_MS,
          },
        ],
        12 * MONTH_MS
      )
    ).toBe(true);
  });
});

describe('reward wallet cap', () => {
  test('pending does not consume cap and redeemed frees cap', () => {
    expect(
      walletMonthsFromRewards([
        { status: 'pending', rewardMonths: 4 },
        { status: 'earned', rewardMonths: 2 },
        { status: 'redeemable', rewardMonths: 1 },
      ])
    ).toBe(3);
    expect(canAcceptMoreWalletMonths(24, 1)).toBe(false);
    expect(canAcceptMoreWalletMonths(21, 3)).toBe(true);
  });

  test('idempotency keys are deterministic', () => {
    expect(
      buildRewardIdempotencyKey({
        relationshipId: 'rel_1',
        rewardType: 'referrer_acquisition',
        sourceEventId: 'evt_1',
      })
    ).toBe('rel_1:referrer_acquisition:evt_1');
  });
});

describe('referral copy', () => {
  test('does not promise 30 free days or immediate discount', () => {
    const blob = JSON.stringify(REFERRAL_COPY);
    expect(blob).not.toContain('30 ימים');
    expect(blob).toContain('12 חודשי מנוי בתשלום');
  });
});

describe('referrer maturity and claim gates', () => {
  test('monthly referrer cannot redeem before 6 paid months', () => {
    const early = resolveRewardEligibility({
      rewardType: 'referrer_acquisition',
      beneficiaryPeriod: 'monthly',
      beneficiaryPaidMonths: 5,
      currentPeriodEndAt: Date.now() + 1000,
      earnedAt: 1,
      now: 2,
    });
    expect(early.canRedeem).toBe(false);
    expect(early.status).toBe('earned');
    const mature = resolveRewardEligibility({
      rewardType: 'referrer_acquisition',
      beneficiaryPeriod: 'monthly',
      beneficiaryPaidMonths: 6,
      currentPeriodEndAt: Date.now() + 1000,
      earnedAt: 1,
      now: 2,
    });
    expect(mature.canRedeem).toBe(true);
  });

  test('annual referrer is scheduled until term end', () => {
    const future = Date.now() + MONTH_MS;
    const scheduled = resolveRewardEligibility({
      rewardType: 'referrer_acquisition',
      beneficiaryPeriod: 'yearly',
      beneficiaryPaidMonths: 12,
      currentPeriodEndAt: future,
      earnedAt: 1,
      now: Date.now(),
    });
    expect(scheduled.status).toBe('scheduled');
    expect(scheduled.canRedeem).toBe(false);
    const ready = resolveRewardEligibility({
      rewardType: 'referrer_acquisition',
      beneficiaryPeriod: 'yearly',
      beneficiaryPaidMonths: 12,
      currentPeriodEndAt: Date.now() - 1,
      earnedAt: 1,
      now: Date.now(),
    });
    expect(ready.canRedeem).toBe(true);
  });

  test('referred anniversary is immediately redeemable once earned', () => {
    const earned = resolveRewardEligibility({
      rewardType: 'referred_anniversary',
      beneficiaryPeriod: 'monthly',
      beneficiaryPaidMonths: 12,
      currentPeriodEndAt: Date.now() + 1000,
      earnedAt: 1,
      now: 2,
    });
    expect(earned.canRedeem).toBe(true);
  });

  test('first-valid claim gates block overwrite, self, and retroactive paid', () => {
    expect(
      evaluateReferralClaimGate({
        codeStatus: 'revoked',
        referrerBusinessId: 'a',
        referredBusinessId: 'b',
        referrerOwnerUserId: 'o1',
      }).reason
    ).toBe('revoked_code');
    expect(
      evaluateReferralClaimGate({
        codeStatus: 'active',
        referrerBusinessId: 'a',
        referredBusinessId: 'b',
        referrerOwnerUserId: 'o1',
        existingRelationship: true,
      }).reason
    ).toBe('already_referred');
    expect(
      evaluateReferralClaimGate({
        codeStatus: 'active',
        referrerBusinessId: 'a',
        referredBusinessId: 'b',
        referrerOwnerUserId: 'o1',
        referredAlreadyPaid: true,
      }).reason
    ).toBe('already_subscribed');
    expect(
      evaluateReferralClaimGate({
        codeStatus: 'active',
        referrerBusinessId: 'a',
        referredBusinessId: 'b',
        referrerOwnerUserId: 'o1',
        referredOwnerUserId: 'o2',
      }).ok
    ).toBe(true);
  });
});
