import { describe, expect, test } from 'bun:test';

import { buildBusinessEntitlementsFromBusiness } from '../entitlements';
import { resolveCanonicalBillingState } from '../lib/billing/lifecycle';
import { createProviderAppUserId, isOpaqueProviderAppUserId } from '../lib/billing/identity';

function buildBusiness(overrides = {}) {
  const now = Date.now();
  return {
    _id: 'business_1',
    ownerUserId: 'user_1',
    externalId: 'ext',
    name: 'Cafe',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    subscriptionStartAt: now,
    subscriptionEndAt: null,
    billingPeriod: null,
    ...overrides,
  };
}

describe('no free Starter operational access', () => {
  test('unpaid new business has no operational Starter access', () => {
    const entitlements = buildBusinessEntitlementsFromBusiness(buildBusiness());
    expect(entitlements.isSubscriptionActive).toBe(false);
    expect(entitlements.features.marketingHub).toBe(false);
  });

  test('missing provider subscription does not grant Starter', () => {
    const state = resolveCanonicalBillingState({
      plan: 'starter',
      status: 'active',
      hasProviderEvidence: false,
    });
    expect(state.operationalAccess).toBe(false);
  });

  test('expired paid subscription does not fall back to Starter', () => {
    const entitlements = buildBusinessEntitlementsFromBusiness(
      buildBusiness({
        subscriptionPlan: 'pro',
        subscriptionStatus: 'inactive',
        subscriptionEndAt: Date.now() - 1000,
      })
    );
    expect(entitlements.isSubscriptionActive).toBe(false);
    expect(entitlements.plan).toBe('pro');
    expect(entitlements.features.team).toBe(false);
  });

  test('refund/revoked state never grants Starter', () => {
    const state = resolveCanonicalBillingState({
      plan: 'starter',
      status: 'inactive',
      hasProviderEvidence: true,
      entitlementRevokedAt: Date.now(),
    });
    expect(state.operationalAccess).toBe(false);
  });

  test('provider-backed Starter remains operational', () => {
    const entitlements = buildBusinessEntitlementsFromBusiness(
      buildBusiness(),
      Date.now(),
      {
        billingAccount: {
          plan: 'starter',
          lastPlan: 'starter',
          status: 'active',
          hasProviderEvidence: true,
          currentPeriodEndAt: Date.now() + 86_400_000,
        },
      }
    );
    expect(entitlements.isSubscriptionActive).toBe(true);
    expect(entitlements.plan).toBe('starter');
    expect(entitlements.limits.maxCustomers).toBe(250);
  });

  test('canceled with future period end remains operational', () => {
    const future = Date.now() + 5 * 86_400_000;
    const state = resolveCanonicalBillingState({
      plan: 'pro',
      status: 'canceled',
      hasProviderEvidence: true,
      currentPeriodEndAt: future,
    });
    expect(state.operationalAccess).toBe(true);
  });

  test('past_due after grace is not operational', () => {
    const state = resolveCanonicalBillingState({
      plan: 'premium',
      status: 'past_due',
      hasProviderEvidence: true,
      gracePeriodEndAt: Date.now() - 1000,
    });
    expect(state.operationalAccess).toBe(false);
  });
});

describe('business billing identity', () => {
  test('creates a stable opaque non-PII providerAppUserId', () => {
    const first = createProviderAppUserId();
    const second = createProviderAppUserId();
    expect(isOpaqueProviderAppUserId(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(first.includes('@')).toBe(false);
    expect(first.startsWith('ba_')).toBe(true);
  });
});
