import { describe, expect, test } from 'bun:test';

import {
  applyRevenueCatWebhookEvent,
  buildBusinessEntitlementsFromBusiness,
  syncBusinessSubscription,
} from '../entitlements';
import { handleRevenueCatWebhookRequest } from '../http';

const SECRET = 'test_revenuecat_secret';
const BUSINESS_ID = 'abc123def456ghi789jkl012mno345pq';

function buildBusiness(overrides = {}) {
  const now = Date.now();
  return {
    _id: BUSINESS_ID,
    ownerUserId: 'user_owner',
    externalId: 'business-ext-1',
    name: 'Business',
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    subscriptionStartAt: now,
    subscriptionEndAt: null,
    billingPeriod: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockCtx(initial = {}) {
  const tableNames = [
    'businesses',
    'subscriptions',
    'revenueCatWebhookEvents',
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
  const validMissingBusinessIds = new Set(
    initial.validMissingBusinessIds ?? []
  );
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
      normalizeId: (tableName, id) => {
        if (state[tableName]?.has(id)) {
          return id;
        }
        return tableName === 'businesses' && validMissingBusinessIds.has(id)
          ? id
          : null;
      },
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
        const queryTable = state[tableName];
        if (!queryTable) {
          throw new Error(`UNKNOWN_TABLE:${tableName}`);
        }

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
    rows,
  };

  return ctx;
}

function createWebhookRequest(event, secret = SECRET) {
  const headers = new Headers({
    'Content-Type': 'application/json',
  });
  if (secret) {
    headers.set('Authorization', `Bearer ${secret}`);
  }

  return new Request('https://stampix.test/revenuecat/webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify({ event }),
  });
}

function createWebhookCtx(ctx) {
  return {
    runMutation: async (_mutationRef, args) =>
      applyRevenueCatWebhookEvent._handler(ctx, args),
  };
}

async function postWebhook(
  event,
  ctx = createMockCtx({
    businesses: [buildBusiness()],
  })
) {
  const response = await handleRevenueCatWebhookRequest(
    createWebhookCtx(ctx),
    createWebhookRequest(event),
    { expectedSecret: SECRET }
  );
  return { response, body: await response.json(), ctx };
}

function buildRevenueCatEvent(overrides = {}) {
  return {
    id: 'evt_1',
    type: 'INITIAL_PURCHASE',
    app_user_id: `business:${BUSINESS_ID}`,
    product_id: 'pro_monthly',
    entitlement_ids: ['pro'],
    purchased_at_ms: 1_700_000_000_000,
    expiration_at_ms: 1_702_592_000_000,
    original_transaction_id: 'tx_original_1',
    ...overrides,
  };
}

describe('RevenueCat webhook authorization and validation', () => {
  test('missing configured secret is rejected before mutation', async () => {
    const response = await handleRevenueCatWebhookRequest(
      {
        runMutation: async () => {
          throw new Error('MUTATION_SHOULD_NOT_RUN');
        },
      },
      createWebhookRequest(buildRevenueCatEvent()),
      { expectedSecret: '' }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'REVENUECAT_WEBHOOK_SECRET_NOT_CONFIGURED',
    });
  });

  test('invalid or missing request secret is rejected before mutation', async () => {
    const ctx = {
      runMutation: async () => {
        throw new Error('MUTATION_SHOULD_NOT_RUN');
      },
    };

    const missing = await handleRevenueCatWebhookRequest(
      ctx,
      createWebhookRequest(buildRevenueCatEvent(), ''),
      { expectedSecret: SECRET }
    );
    expect(missing.status).toBe(401);

    const invalid = await handleRevenueCatWebhookRequest(
      ctx,
      createWebhookRequest(buildRevenueCatEvent(), 'wrong'),
      { expectedSecret: SECRET }
    );
    expect(invalid.status).toBe(401);
  });

  test('malformed app_user_id is rejected', async () => {
    const { response, body } = await postWebhook(
      buildRevenueCatEvent({ app_user_id: 'user:user_1' })
    );

    expect(response.status).toBe(400);
    expect(body.code).toBe('REVENUECAT_INVALID_APP_USER_ID');
  });

  test('malformed business id suffix is rejected with structured app_user_id error', async () => {
    const { response, body } = await postWebhook(
      buildRevenueCatEvent({ app_user_id: 'business:not_a_convex_id' })
    );

    expect(response.status).toBe(400);
    expect(body.code).toBe('REVENUECAT_INVALID_APP_USER_ID');
  });

  test('lower-alphanumeric invalid business id is rejected with structured app_user_id error', async () => {
    const { response, body } = await postWebhook(
      buildRevenueCatEvent({
        app_user_id: 'business:abc123def456ghi789jkl012mno345qr',
      })
    );

    expect(response.status).toBe(400);
    expect(body.code).toBe('REVENUECAT_INVALID_APP_USER_ID');
  });

  test('unsupported product or entitlement is rejected', async () => {
    const unsupportedProduct = await postWebhook(
      buildRevenueCatEvent({
        product_id: 'unknown_product',
        entitlement_ids: [],
      })
    );
    expect(unsupportedProduct.response.status).toBe(400);
    expect(unsupportedProduct.body.code).toBe('REVENUECAT_UNSUPPORTED_PRODUCT');

    const unsupportedEntitlement = await postWebhook(
      buildRevenueCatEvent({
        product_id: undefined,
        entitlement_ids: ['unknown_entitlement'],
      })
    );
    expect(unsupportedEntitlement.response.status).toBe(400);
    expect(unsupportedEntitlement.body.code).toBe(
      'REVENUECAT_UNSUPPORTED_ENTITLEMENT'
    );
  });

  test('entitlement-only subscription event is rejected without defaulting period', async () => {
    const { response, body } = await postWebhook(
      buildRevenueCatEvent({
        product_id: undefined,
        entitlement_ids: ['pro'],
      })
    );

    expect(response.status).toBe(400);
    expect(body.code).toBe('REVENUECAT_MISSING_PRODUCT_ID');
  });
});

describe('RevenueCat server-authoritative business subscription state', () => {
  test('valid purchase and renewal events activate the mapped plan', async () => {
    const purchase = await postWebhook(buildRevenueCatEvent());

    expect(purchase.response.status).toBe(200);
    expect(purchase.ctx.rows('businesses')[0]).toMatchObject({
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      billingPeriod: 'monthly',
    });
    expect(purchase.ctx.rows('subscriptions')[0]).toMatchObject({
      plan: 'pro',
      status: 'active',
      period: 'monthly',
      provider: 'revenuecat',
      providerSubscriptionId: 'tx_original_1',
    });

    const renewal = await postWebhook(
      buildRevenueCatEvent({
        id: 'evt_renewal_1',
        type: 'RENEWAL',
        product_id: 'premium_yearly',
        entitlement_ids: ['premium'],
        original_transaction_id: 'tx_original_2',
      })
    );

    expect(renewal.response.status).toBe(200);
    expect(renewal.ctx.rows('businesses')[0]).toMatchObject({
      subscriptionPlan: 'premium',
      subscriptionStatus: 'active',
      billingPeriod: 'yearly',
    });
  });

  test('valid late event for a missing business is ignored idempotently', async () => {
    const ctx = createMockCtx({
      businesses: [],
      validMissingBusinessIds: [BUSINESS_ID],
    });
    const event = buildRevenueCatEvent({ id: 'evt_deleted_business' });

    const first = await postWebhook(event, ctx);
    const duplicate = await postWebhook(event, ctx);

    expect(first.response.status).toBe(200);
    expect(first.body).toMatchObject({
      ignored: true,
      reason: 'business_not_found',
      duplicate: false,
    });
    expect(duplicate.response.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);
    expect(ctx.rows('revenueCatWebhookEvents')).toHaveLength(1);
    expect(ctx.rows('revenueCatWebhookEvents')[0]).toMatchObject({
      eventId: 'evt_deleted_business',
      appUserId: 'redacted',
      rawEvent: { redacted: true },
      status: 'ignored',
    });
    expect(ctx.rows('revenueCatWebhookEvents')[0].businessId).toBeUndefined();
    expect(typeof ctx.rows('revenueCatWebhookEvents')[0].redactedAt).toBe(
      'number'
    );
    expect(ctx.rows('revenueCatWebhookEvents')[0].purgeAfter).toBeGreaterThan(
      ctx.rows('revenueCatWebhookEvents')[0].redactedAt
    );
    expect(ctx.rows('businesses')).toHaveLength(0);
    expect(ctx.rows('subscriptions')).toHaveLength(0);
  });

  test('cancellation with future expiration preserves paid access as canceled', async () => {
    const futureExpiration = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const ctx = createMockCtx({
      businesses: [
        buildBusiness({
          subscriptionPlan: 'pro',
          subscriptionStatus: 'active',
          billingPeriod: 'monthly',
        }),
      ],
    });

    const result = await postWebhook(
      buildRevenueCatEvent({
        id: 'evt_cancellation_future',
        type: 'CANCELLATION',
        expiration_at_ms: futureExpiration,
      }),
      ctx
    );

    expect(result.response.status).toBe(200);
    const business = ctx.rows('businesses')[0];
    expect(business).toMatchObject({
      subscriptionPlan: 'pro',
      subscriptionStatus: 'canceled',
      billingPeriod: 'monthly',
      subscriptionEndAt: futureExpiration,
    });
    expect(
      buildBusinessEntitlementsFromBusiness(business, Date.now()).effectivePlan
    ).toBe('pro');
    expect(
      buildBusinessEntitlementsFromBusiness(business, Date.now())
        .isSubscriptionActive
    ).toBe(true);
    expect(ctx.rows('subscriptions')[0]).toMatchObject({
      plan: 'pro',
      status: 'canceled',
      period: 'monthly',
    });
  });

  test('expiration and refund downgrade the business plan', async () => {
    for (const eventType of ['EXPIRATION', 'REFUND']) {
      const ctx = createMockCtx({
        businesses: [
          buildBusiness({
            subscriptionPlan: 'pro',
            subscriptionStatus: 'active',
            billingPeriod: 'monthly',
          }),
        ],
      });

      const result = await postWebhook(
        buildRevenueCatEvent({
          id: `evt_${eventType.toLowerCase()}`,
          type: eventType,
        }),
        ctx
      );

      expect(result.response.status).toBe(200);
      expect(ctx.rows('businesses')[0]).toMatchObject({
        subscriptionPlan: 'starter',
        subscriptionStatus: 'active',
        billingPeriod: null,
      });
      expect(ctx.rows('subscriptions')[0].status).toBe('inactive');
    }
  });

  test('billing issue sets paid plan to past_due without enabling public writes', async () => {
    const result = await postWebhook(
      buildRevenueCatEvent({
        id: 'evt_billing_issue',
        type: 'BILLING_ISSUE',
        product_id: 'premium_monthly',
        entitlement_ids: ['premium'],
      })
    );

    expect(result.response.status).toBe(200);
    expect(result.ctx.rows('businesses')[0]).toMatchObject({
      subscriptionPlan: 'premium',
      subscriptionStatus: 'past_due',
      billingPeriod: 'monthly',
    });
    expect(result.ctx.rows('subscriptions')[0]).toMatchObject({
      plan: 'premium',
      status: 'past_due',
      period: 'monthly',
    });
    await expect(
      syncBusinessSubscription._handler(
        {},
        {
          businessId: BUSINESS_ID,
          plan: 'premium',
          status: 'active',
          period: 'monthly',
          provider: 'manual',
        }
      )
    ).rejects.toThrow('SUBSCRIPTION_CLIENT_SYNC_DISABLED');
  });

  test('internal webhook mutation rejects mismatched product and supplied plan', async () => {
    const ctx = createMockCtx({
      businesses: [buildBusiness()],
    });

    await expect(
      applyRevenueCatWebhookEvent._handler(ctx, {
        eventId: 'evt_mismatch',
        eventType: 'INITIAL_PURCHASE',
        appUserId: `business:${BUSINESS_ID}`,
        businessId: BUSINESS_ID,
        productId: 'pro_monthly',
        entitlementIds: ['pro'],
        plan: 'premium',
        period: 'monthly',
        purchasedAt: Date.now(),
        expirationAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        providerSubscriptionId: 'tx_mismatch',
        rawEvent: {},
      })
    ).rejects.toThrow('REVENUECAT_PLAN_IDENTIFIER_CONFLICT');
    expect(ctx.rows('revenueCatWebhookEvents')).toHaveLength(0);
    expect(ctx.rows('subscriptions')).toHaveLength(0);
  });

  test('internal webhook mutation rejects mismatched product and supplied period', async () => {
    for (const [productId, entitlementIds, period] of [
      ['pro_monthly', ['pro'], 'yearly'],
      ['pro_yearly', ['pro'], 'monthly'],
    ]) {
      const ctx = createMockCtx({
        businesses: [buildBusiness()],
      });

      await expect(
        applyRevenueCatWebhookEvent._handler(ctx, {
          eventId: `evt_period_mismatch_${productId}`,
          eventType: 'INITIAL_PURCHASE',
          appUserId: `business:${BUSINESS_ID}`,
          businessId: BUSINESS_ID,
          productId,
          entitlementIds,
          plan: 'pro',
          period,
          purchasedAt: Date.now(),
          expirationAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          providerSubscriptionId: `tx_period_mismatch_${productId}`,
          rawEvent: {},
        })
      ).rejects.toThrow('REVENUECAT_PERIOD_IDENTIFIER_CONFLICT');
      expect(ctx.rows('revenueCatWebhookEvents')).toHaveLength(0);
      expect(ctx.rows('subscriptions')).toHaveLength(0);
    }
  });

  test('duplicate webhook event is idempotent', async () => {
    const ctx = createMockCtx({
      businesses: [buildBusiness()],
    });
    const event = buildRevenueCatEvent({ id: 'evt_duplicate' });

    const first = await postWebhook(event, ctx);
    const second = await postWebhook(event, ctx);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(ctx.rows('revenueCatWebhookEvents')).toHaveLength(1);
    expect(ctx.rows('subscriptions')).toHaveLength(1);
  });

  test('public business subscription writes remain blocked', async () => {
    await expect(
      syncBusinessSubscription._handler(
        {},
        {
          businessId: BUSINESS_ID,
          plan: 'premium',
          status: 'active',
          period: 'yearly',
          provider: 'manual',
        }
      )
    ).rejects.toThrow('SUBSCRIPTION_CLIENT_SYNC_DISABLED');
  });
});
