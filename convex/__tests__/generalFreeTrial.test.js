import { describe, expect, test } from 'bun:test';

import { buildBusinessEntitlementsFromBusiness } from '../entitlements';
import { startBusinessOnboardingTrial } from '../lib/billing/accounts';
import {
  GENERAL_FREE_TRIAL_MS,
  GENERAL_FREE_TRIAL_PLAN,
} from '../lib/billing/productionContract';

const BUSINESS_ID = 'business_trial_001';
const OWNER_ID = 'user_trial_001';
const START_AT = Date.parse('2026-10-03T12:00:00Z');

function createCtx() {
  const state = {
    businesses: new Map([
      [
        BUSINESS_ID,
        {
          _id: BUSINESS_ID,
          ownerUserId: OWNER_ID,
          name: 'Trial Business',
          isActive: true,
          subscriptionPlan: 'starter',
          subscriptionStatus: 'inactive',
          subscriptionStartAt: null,
          subscriptionEndAt: null,
          billingPeriod: null,
          createdAt: START_AT,
          updatedAt: START_AT,
        },
      ],
    ]),
    businessBillingAccounts: new Map(),
  };
  const rows = (tableName) => Array.from(state[tableName].values());
  return {
    state,
    db: {
      get: async (id) =>
        state.businesses.get(id) ??
        state.businessBillingAccounts.get(id) ??
        null,
      insert: async (tableName, doc) => {
        const id = `${tableName}_${state[tableName].size + 1}`;
        state[tableName].set(id, { _id: id, ...doc });
        return id;
      },
      patch: async (id, patchValue) => {
        for (const tableName of Object.keys(state)) {
          const existing = state[tableName].get(id);
          if (existing) {
            state[tableName].set(id, { ...existing, ...patchValue });
            return;
          }
        }
        throw new Error(`UNKNOWN_PATCH_TARGET:${id}`);
      },
      query: (tableName) => ({
        withIndex: (_indexName, buildIndex) => {
          const filters = [];
          const q = {
            eq(field, value) {
              filters.push([field, value]);
              return q;
            },
          };
          buildIndex(q);
          const filtered = rows(tableName).filter((row) =>
            filters.every(([field, value]) => row[field] === value)
          );
          return {
            first: async () => filtered[0] ?? null,
            collect: async () => filtered,
          };
        },
        first: async () => rows(tableName)[0] ?? null,
        collect: async () => rows(tableName),
      }),
    },
  };
}

describe('14-day Pro business trial', () => {
  test('starts once without provider evidence and expires by server time', async () => {
    const ctx = createCtx();
    const first = await startBusinessOnboardingTrial(ctx, {
      businessId: BUSINESS_ID,
      ownerUserId: OWNER_ID,
      now: START_AT,
    });

    expect(first.started).toBe(true);
    expect(first.plan).toBe(GENERAL_FREE_TRIAL_PLAN);
    expect(first.trialEndAt).toBe(START_AT + GENERAL_FREE_TRIAL_MS);

    const account = Array.from(ctx.state.businessBillingAccounts.values())[0];
    expect(account).toMatchObject({
      plan: 'pro',
      lastPlan: 'pro',
      status: 'trialing',
      hasProviderEvidence: false,
      trialStartedAt: START_AT,
      trialEndAt: START_AT + GENERAL_FREE_TRIAL_MS,
      trialSource: 'business_onboarding',
    });

    const business = ctx.state.businesses.get(BUSINESS_ID);
    const during = buildBusinessEntitlementsFromBusiness(
      business,
      START_AT + 1,
      { billingAccount: account }
    );
    expect(during.isSubscriptionActive).toBe(true);
    expect(during.plan).toBe('pro');
    expect(during.features.team).toBe(true);

    const expired = buildBusinessEntitlementsFromBusiness(
      business,
      START_AT + GENERAL_FREE_TRIAL_MS,
      { billingAccount: account }
    );
    expect(expired.isSubscriptionActive).toBe(false);
    expect(expired.subscriptionStatus).toBe('inactive');

    const second = await startBusinessOnboardingTrial(ctx, {
      businessId: BUSINESS_ID,
      ownerUserId: OWNER_ID,
      now: START_AT + 86_400_000,
    });
    expect(second.started).toBe(false);
    expect(second.reason).toBe('already_started');
    const unchanged = Array.from(ctx.state.businessBillingAccounts.values())[0];
    expect(unchanged.trialEndAt).toBe(START_AT + GENERAL_FREE_TRIAL_MS);
  });
});
