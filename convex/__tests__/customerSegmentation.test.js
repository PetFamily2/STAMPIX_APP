import { describe, expect, test } from 'bun:test';
import { buildCustomerInsights } from '../events';

describe('customer insights builder', () => {
  test('returns a single onboarding insight when there are no active customers', () => {
    const insights = buildCustomerInsights({
      activeCustomers: 0,
      needsNurtureCustomers: 0,
      needsWinbackCustomers: 0,
      closeToRewardCustomers: 0,
      loyalCustomers: 0,
      totalCustomers: 0,
      secondVisitCustomers: 0,
      birthdayEligibleCustomers: 0,
      anniversaryEligibleCustomers: 0,
    });
    expect(insights.length).toBe(1);
  });

  test('returns up to 3 prioritized insights with customer-intelligence metrics', () => {
    const insights = buildCustomerInsights({
      activeCustomers: 22,
      needsNurtureCustomers: 3,
      needsWinbackCustomers: 4,
      closeToRewardCustomers: 6,
      loyalCustomers: 5,
      totalCustomers: 22,
      secondVisitCustomers: 2,
      birthdayEligibleCustomers: 1,
      anniversaryEligibleCustomers: 1,
    });
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.length).toBeLessThanOrEqual(3);
  });
});
