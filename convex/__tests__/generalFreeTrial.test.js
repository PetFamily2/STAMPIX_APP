import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  GENERAL_FREE_TRIAL_DAYS,
  GENERAL_FREE_TRIAL_PLAN,
  getGeneralFreeTrialEnd,
} from '../lib/billing/productionContract';
import {
  hasOperationalAccessFromStatus,
  resolveCanonicalBillingState,
} from '../lib/billing/lifecycle';

const DAY = 24 * 60 * 60 * 1000;
const start = Date.UTC(2026, 9, 3, 12, 0, 0);
const end = start + 14 * DAY;

describe('general free trial launch contract', () => {
  test('is exactly 14 days on Pro', () => {
    expect(GENERAL_FREE_TRIAL_DAYS).toBe(14);
    expect(GENERAL_FREE_TRIAL_PLAN).toBe('pro');
    expect(getGeneralFreeTrialEnd(start)).toBe(end);
  });

  test('first-party trial grants access without fake provider evidence', () => {
    expect(
      hasOperationalAccessFromStatus({
        status: 'trialing',
        hasProviderEvidence: false,
        currentPeriodEndAt: end,
        gracePeriodEndAt: null,
        trialSource: 'stampaix',
        trialEndsAt: end,
        now: start + DAY,
      })
    ).toBe(true);
  });

  test('trial status alone cannot forge access', () => {
    expect(
      hasOperationalAccessFromStatus({
        status: 'trialing',
        hasProviderEvidence: false,
        currentPeriodEndAt: end,
        gracePeriodEndAt: null,
        now: start + DAY,
      })
    ).toBe(false);
  });

  test('expired first-party trial resolves inactive', () => {
    const state = resolveCanonicalBillingState({
      plan: 'pro',
      status: 'trialing',
      currentPeriodStartAt: start,
      currentPeriodEndAt: end,
      trialSource: 'stampaix',
      trialEndsAt: end,
      hasProviderEvidence: false,
      now: end,
    });
    expect(state.operationalAccess).toBe(false);
    expect(state.status).toBe('inactive');
  });

  test('renewal grace still requires provider evidence', () => {
    expect(
      hasOperationalAccessFromStatus({
        status: 'past_due',
        hasProviderEvidence: false,
        currentPeriodEndAt: start,
        gracePeriodEndAt: start + 7 * DAY,
        now: start + DAY,
      })
    ).toBe(false);
    expect(
      hasOperationalAccessFromStatus({
        status: 'past_due',
        hasProviderEvidence: true,
        currentPeriodEndAt: start,
        gracePeriodEndAt: start + 7 * DAY,
        now: start + DAY,
      })
    ).toBe(true);
  });

  test('trial starts only from new-business creation path', () => {
    const businessSource = readFileSync('convex/business.ts', 'utf8');
    const accountsSource = readFileSync(
      'convex/lib/billing/accounts.ts',
      'utf8'
    );
    expect(businessSource).toContain(
      'startGeneralFreeTrial: startsGeneralFreeTrial'
    );
    expect(accountsSource).toContain('args.startGeneralFreeTrial === true');
    expect(accountsSource).toContain('hasProviderEvidence: false');
  });

  test('expiry is server-only, bounded and indexed', () => {
    const expirySource = readFileSync('convex/generalFreeTrial.ts', 'utf8');
    const schemaSource = readFileSync('convex/schema.ts', 'utf8');
    expect(expirySource).toContain('internalMutation');
    expect(expirySource).toContain('MAX_EXPIRY_LIMIT = 100');
    expect(schemaSource).toContain('by_trialSource_trialEndsAt');
  });
});
