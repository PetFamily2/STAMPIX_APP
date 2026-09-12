import { describe, expect, test } from 'bun:test';

import { applyRevenueCatWebhookEvent } from '../entitlements';

const BUSINESS_ID = 'abc123def456ghi789jkl012mno345pq';

function createMockCtx(initial = {}) {
  const tableNames = [
    'businesses',
    'subscriptions',
    'revenueCatWebhookEvents',
    'businessBillingAccounts',
    'businessPaidServicePeriods',
    'businessReferralRelationships',
    'businessReferralRewards',
    'businessStaff',
    'staffInvites',
    'staffEvents',
  ];
  const state = Object.fromEntries(
    tableNames.map((tableName) => [
      tableName,
      new Map((initial[tableName] ?? []).map((row) => [row._id, { ...row }])),
    ])
  );
  const rows = (tableName) => Array.from(state[tableName].values());
  const ctx = {
    db: {
      get: async (id) => {
        for (const tableName of tableNames) {
          const row = state[tableName].get(id);
          if (row) {
            return row;
          }
        }
        return null;
      },
      normalizeId: (tableName, id) =>
        state[tableName]?.has(id) ? id : tableName === 'businesses' && id === BUSINESS_ID ? id : null,
      insert: async (tableName, doc) => {
        const id = doc._id ?? `${tableName}_${state[tableName].size + 1}`;
        state[tableName].set(id, { _id: id, ...doc });
        return id;
      },
      patch: async (id, patch) => {
        for (const tableName of tableNames) {
          const row = state[tableName].get(id);
          if (row) {
            state[tableName].set(id, { ...row, ...patch });
            return;
          }
        }
        throw new Error(`UNKNOWN_PATCH_TARGET:${id}`);
      },
      query: (tableName) => {
        const buildResult = (filters = []) => {
          const filtered = rows(tableName).filter((row) =>
            filters.every(([field, value]) => row[field] === value)
          );
          return {
            collect: async () => filtered,
            first: async () => filtered[0] ?? null,
          };
        };
        return {
          withIndex: (_indexName, buildIndex) => {
            const filters = [];
            const q = {
              eq(field, value) {
                filters.push([field, value]);
                return q;
              },
            };
            buildIndex(q);
            return buildResult(filters);
          },
          collect: async () => rows(tableName),
          first: async () => rows(tableName)[0] ?? null,
        };
      },
    },
    state,
    rows,
  };
  return ctx;
}

function buildBusiness() {
  const now = Date.now();
  return {
    _id: BUSINESS_ID,
    ownerUserId: 'user_owner',
    externalId: 'ext',
    name: 'Biz',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    subscriptionPlan: 'starter',
    subscriptionStatus: 'inactive',
  };
}

async function apply(ctx, overrides) {
  return applyRevenueCatWebhookEvent._handler(ctx, {
    eventId: 'evt_new',
    eventType: 'PRODUCT_CHANGE',
    appUserId: `business:${BUSINESS_ID}`,
    businessId: BUSINESS_ID,
    productId: 'premium_monthly',
    entitlementIds: ['business_access'],
    purchasedAt: 2_000,
    expirationAt: 3_000,
    providerEventAt: 2_000,
    providerSubscriptionId: 'tx_1',
    rawEvent: {},
    ...overrides,
  });
}

describe('out-of-order RevenueCat events', () => {
  test('older expiration does not overwrite a newer product change', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    await apply(ctx, {
      eventId: 'evt_new',
      eventType: 'PRODUCT_CHANGE',
      providerEventAt: 2_000,
      productId: 'premium_monthly',
    });
    await apply(ctx, {
      eventId: 'evt_old',
      eventType: 'EXPIRATION',
      providerEventAt: 1_000,
      productId: 'pro_monthly',
    });
    const business = ctx.rows('businesses')[0];
    expect(business.subscriptionPlan).toBe('premium');
    expect(business.subscriptionStatus).toBe('active');
    const stale = ctx
      .rows('revenueCatWebhookEvents')
      .find((row) => row.eventId === 'evt_old');
    expect(stale.status).toBe('ignored_stale');
  });

  test('duplicate event id is acknowledged without reapplying', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    const first = await apply(ctx, { eventId: 'evt_dup', eventType: 'INITIAL_PURCHASE' });
    const second = await apply(ctx, { eventId: 'evt_dup', eventType: 'INITIAL_PURCHASE' });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(ctx.rows('revenueCatWebhookEvents')).toHaveLength(1);
  });

  test('refund does not fall back to Starter', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    await apply(ctx, {
      eventId: 'evt_buy',
      eventType: 'INITIAL_PURCHASE',
      productId: 'pro_monthly',
      providerEventAt: 1_000,
    });
    await apply(ctx, {
      eventId: 'evt_refund',
      eventType: 'REFUND',
      productId: 'pro_monthly',
      providerEventAt: 2_000,
    });
    const business = ctx.rows('businesses')[0];
    expect(business.subscriptionPlan).toBe('pro');
    expect(business.subscriptionStatus).toBe('inactive');
  });
});
