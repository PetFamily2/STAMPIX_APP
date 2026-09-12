import { describe, expect, test } from 'bun:test';

import { resolveCanonicalBillingState } from '../lib/billing/lifecycle';

describe('legacy billing migration audit rules', () => {
  test('legacy Starter active without provider evidence becomes inactive', () => {
    const state = resolveCanonicalBillingState({
      plan: 'starter',
      status: 'active',
      hasProviderEvidence: false,
    });
    expect(state.operationalAccess).toBe(false);
    expect(state.status).toBe('inactive');
  });

  test('legacy Pro without provider evidence is inactive with last plan preserved', () => {
    const state = resolveCanonicalBillingState({
      plan: 'pro',
      status: 'active',
      hasProviderEvidence: false,
    });
    expect(state.operationalAccess).toBe(false);
    expect(state.lastPlan).toBe('pro');
  });

  test('provider-backed Premium remains operational', () => {
    const state = resolveCanonicalBillingState({
      plan: 'premium',
      status: 'active',
      hasProviderEvidence: true,
      currentPeriodEndAt: Date.now() + 1000,
    });
    expect(state.operationalAccess).toBe(true);
    expect(state.lastPlan).toBe('premium');
  });

  test('unlimited legacy maps to premium last-plan metadata', () => {
    const state = resolveCanonicalBillingState({
      plan: 'unlimited',
      status: 'inactive',
      hasProviderEvidence: false,
    });
    expect(state.lastPlan).toBe('premium');
    expect(state.operationalAccess).toBe(false);
  });
});
