import { describe, expect, test } from 'bun:test';

import { resolveRevenueCatPlanMapping } from '../lib/billing/productMap';
import { REVENUECAT_CANONICAL_ENTITLEMENT } from '../lib/billing/productionContract';

describe('RevenueCat product map', () => {
  test('maps all six logical products to plan and period', () => {
    expect(
      resolveRevenueCatPlanMapping({ productId: 'starter_monthly' })
    ).toEqual({
      logicalProductId: 'starter_monthly',
      plan: 'starter',
      period: 'monthly',
    });
    expect(
      resolveRevenueCatPlanMapping({ productId: 'starter_yearly' }).plan
    ).toBe('starter');
    expect(resolveRevenueCatPlanMapping({ productId: 'pro_monthly' }).plan).toBe(
      'pro'
    );
    expect(resolveRevenueCatPlanMapping({ productId: 'pro_yearly' }).period).toBe(
      'yearly'
    );
    expect(
      resolveRevenueCatPlanMapping({ productId: 'premium_monthly' }).plan
    ).toBe('premium');
    expect(
      resolveRevenueCatPlanMapping({
        productId: 'com.stampaix.app.premium.yearly',
      }).period
    ).toBe('yearly');
  });

  test('unknown product fails closed', () => {
    expect(() =>
      resolveRevenueCatPlanMapping({ productId: 'unknown_sku' })
    ).toThrow('REVENUECAT_UNSUPPORTED_PRODUCT');
  });

  test('business_access is canonical and does not select plan', () => {
    expect(REVENUECAT_CANONICAL_ENTITLEMENT).toBe('business_access');
    const mapped = resolveRevenueCatPlanMapping({
      productId: 'starter_monthly',
      entitlementIds: ['business_access'],
    });
    expect(mapped.plan).toBe('starter');
  });

  test('starter is included in RevenueCat mapping', () => {
    expect(
      resolveRevenueCatPlanMapping({
        productId: 'stampaix_starter:monthly',
      }).plan
    ).toBe('starter');
  });
});
