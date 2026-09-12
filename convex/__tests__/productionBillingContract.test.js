import { describe, expect, test } from 'bun:test';

import {
  CANONICAL_LOYALTY_THEME_COUNT,
  LOGICAL_SUBSCRIPTION_PRODUCTS,
  MVP_FEATURE_FLAGS,
  PLAN_ORDER,
  REFERRAL_CONTRACT,
  REVENUECAT_CANONICAL_ENTITLEMENT,
  assertFrozenPlanContract,
  planConfig,
} from '../lib/billing/productionContract';
import { CARD_THEMES } from '../../constants/cardThemes';

describe('frozen launch billing contract', () => {
  test('locks exactly three paid plans, prices and limits', () => {
    expect(() => assertFrozenPlanContract()).not.toThrow();
    expect(PLAN_ORDER).toEqual(['starter', 'pro', 'premium']);
    expect(planConfig.starter.pricing).toEqual({
      monthly: 149,
      yearly: 1490,
      currency: 'ILS',
    });
    expect(planConfig.pro.pricing).toEqual({
      monthly: 299,
      yearly: 2990,
      currency: 'ILS',
    });
    expect(planConfig.premium.pricing).toEqual({
      monthly: 499,
      yearly: 4990,
      currency: 'ILS',
    });
    expect(planConfig.starter.limits).toEqual({
      maxCards: 1,
      maxCustomers: 250,
      maxCampaigns: 1,
      maxActiveRetentionActions: 0,
      maxAiExecutionsPerMonth: 0,
      maxTeamSeats: 0,
    });
    expect(planConfig.pro.limits).toEqual({
      maxCards: 5,
      maxCustomers: 3000,
      maxCampaigns: 5,
      maxActiveRetentionActions: 5,
      maxAiExecutionsPerMonth: 100,
      maxTeamSeats: 5,
    });
    expect(planConfig.premium.limits).toEqual({
      maxCards: 10,
      maxCustomers: 10000,
      maxCampaigns: 10,
      maxActiveRetentionActions: 15,
      maxAiExecutionsPerMonth: 300,
      maxTeamSeats: 20,
    });
  });

  test('launch features hide advanced reports and keep Starter paid', () => {
    expect(planConfig.starter.pricing.monthly).toBeGreaterThan(0);
    expect(planConfig.starter.features.team).toBe(false);
    expect(planConfig.starter.features.smartRetentionManagerAiAssist).toBe(
      false
    );
    expect(planConfig.pro.features.team).toBe(true);
    expect(planConfig.pro.features.smartRetentionManagerAiAssist).toBe(true);
    expect(planConfig.premium.features.advancedReports).toBe(false);
    expect(planConfig.pro.features.advancedReports).toBe(false);
    expect(planConfig.starter.features.advancedReports).toBe(false);
  });

  test('canonical RevenueCat contract includes six products and business_access', () => {
    expect(LOGICAL_SUBSCRIPTION_PRODUCTS).toHaveLength(6);
    expect(REVENUECAT_CANONICAL_ENTITLEMENT).toBe('business_access');
    expect(MVP_FEATURE_FLAGS.freeStarterEnabled).toBe(false);
    expect(MVP_FEATURE_FLAGS.additionalBusinessCreationEnabled).toBe(false);
    expect(MVP_FEATURE_FLAGS.referralRewardMayGrantEntitlement).toBe(false);
    expect(MVP_FEATURE_FLAGS.referralMayPatchSubscriptionEndAt).toBe(false);
  });

  test('premium maxCards matches ten loyalty themes', () => {
    expect(CARD_THEMES).toHaveLength(CANONICAL_LOYALTY_THEME_COUNT);
    expect(planConfig.premium.limits.maxCards).toBe(CARD_THEMES.length);
  });

  test('referral reward constants are frozen', () => {
    expect(REFERRAL_CONTRACT.referrerMonthlyRewardMonths).toBe(1);
    expect(REFERRAL_CONTRACT.referrerYearlyRewardMonths).toBe(2);
    expect(REFERRAL_CONTRACT.qualificationPaidMonths).toBe(3);
    expect(REFERRAL_CONTRACT.referredAnniversaryPaidMonths).toBe(12);
    expect(REFERRAL_CONTRACT.referredAnniversaryRewardMonths).toBe(1);
    expect(REFERRAL_CONTRACT.walletUnredeemedCapMonths).toBe(24);
    expect(REFERRAL_CONTRACT.referrerMonthlyRedemptionMaturityPaidMonths).toBe(
      6
    );
  });
});
