import { describe, expect, test } from 'bun:test';

import {
  applyRevenueCatWebhookEvent,
  buildBusinessEntitlementsFromBusiness,
} from '../entitlements';
import { applyVerifiedBillingEvent } from '../lib/billing/applyVerifiedBillingEvent';
import { mapRevenueCatToCanonicalEvent } from '../lib/billing/canonicalEvent';

const BUSINESS_ID = 'abc123def456ghi789jkl012mno345pq';
const OWNER_ID = 'user_owner';

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
      normalizeId: (tableName, id) => (state[tableName]?.has(id) ? id : null),
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
    rows,
  };
  return ctx;
}

function buildBusiness(overrides = {}) {
  const now = Date.now();
  return {
    _id: BUSINESS_ID,
    ownerUserId: OWNER_ID,
    externalId: 'ext',
    name: 'Biz',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    subscriptionPlan: 'starter',
    subscriptionStatus: 'inactive',
    subscriptionStartAt: null,
    subscriptionEndAt: null,
    billingPeriod: null,
    ...overrides,
  };
}

function buildRelationship(overrides = {}) {
  return {
    _id: 'rel_1',
    referrerBusinessId: 'biz_referrer',
    referredBusinessId: BUSINESS_ID,
    status: 'claimed',
    paidMonthsConfirmed: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function webhookArgs(overrides = {}) {
  return {
    eventId: 'evt_initial',
    eventType: 'INITIAL_PURCHASE',
    appUserId: `business:${BUSINESS_ID}`,
    businessId: BUSINESS_ID,
    productId: 'pro_monthly',
    entitlementIds: ['business_access'],
    purchasedAt: 1_700_000_000_000,
    expirationAt: 1_702_592_000_000,
    providerEventAt: 1_700_000_000_000,
    providerSubscriptionId: 'tx_original_1',
    rawEvent: {},
    ...overrides,
  };
}

async function apply(ctx, overrides = {}) {
  return applyRevenueCatWebhookEvent._handler(ctx, webhookArgs(overrides));
}

function accountOf(ctx) {
  return ctx.rows('businessBillingAccounts')[0];
}

function businessOf(ctx) {
  return ctx.rows('businesses')[0];
}

function accessAt(ctx, now) {
  const business = businessOf(ctx);
  const billingAccount = accountOf(ctx);
  return buildBusinessEntitlementsFromBusiness(business, now, {
    billingAccount,
  });
}

describe('RevenueCat billing application baseline', () => {
  test('INITIAL_PURCHASE records provider evidence, mirror, and active entitlement', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    const result = await apply(ctx);

    expect(result).toMatchObject({
      ok: true,
      duplicate: false,
      plan: 'pro',
      status: 'active',
    });
    expect(accountOf(ctx)).toMatchObject({
      plan: 'pro',
      status: 'active',
      billingPeriod: 'monthly',
      provider: 'revenuecat',
      hasProviderEvidence: true,
      currentPeriodStartAt: 1_700_000_000_000,
      currentPeriodEndAt: 1_702_592_000_000,
      subscriptionStartAt: 1_700_000_000_000,
      providerSubscriptionIdentifier: 'tx_original_1',
    });
    expect(businessOf(ctx)).toMatchObject({
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      billingPeriod: 'monthly',
      subscriptionStartAt: 1_700_000_000_000,
      subscriptionEndAt: 1_702_592_000_000,
    });
    expect(ctx.rows('subscriptions')[0]).toMatchObject({
      provider: 'revenuecat',
      plan: 'pro',
      status: 'active',
      period: 'monthly',
    });
    expect(accessAt(ctx, 1_701_000_000_000).isSubscriptionActive).toBe(true);
  });

  test('RENEWAL replaces period bounds and keeps provider evidence and access', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    await apply(ctx);
    await apply(ctx, {
      eventId: 'evt_renewal',
      eventType: 'RENEWAL',
      purchasedAt: 1_702_592_000_000,
      expirationAt: 1_705_184_000_000,
      providerEventAt: 1_702_592_000_000,
    });

    expect(accountOf(ctx)).toMatchObject({
      hasProviderEvidence: true,
      status: 'active',
      plan: 'pro',
      currentPeriodStartAt: 1_702_592_000_000,
      currentPeriodEndAt: 1_705_184_000_000,
      subscriptionStartAt: 1_702_592_000_000,
    });
    expect(businessOf(ctx)).toMatchObject({
      subscriptionStartAt: 1_702_592_000_000,
      subscriptionEndAt: 1_705_184_000_000,
      subscriptionStatus: 'active',
    });
    expect(accessAt(ctx, 1_703_000_000_000).isSubscriptionActive).toBe(true);
  });

  test('duplicate event id does not apply a second account or paid-period write', async () => {
    const ctx = createMockCtx({
      businesses: [buildBusiness()],
      businessReferralRelationships: [buildRelationship()],
    });
    const first = await apply(ctx);
    const accountSnapshot = { ...accountOf(ctx) };
    const second = await apply(ctx);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(accountOf(ctx)).toEqual(accountSnapshot);
    expect(ctx.rows('businessPaidServicePeriods')).toHaveLength(1);
    expect(ctx.rows('businessReferralRewards')).toHaveLength(0);
    expect(ctx.rows('revenueCatWebhookEvents')).toHaveLength(1);
    expect(ctx.rows('subscriptions')).toHaveLength(1);
  });

  test('older event cannot regress plan, status, or period', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    await apply(ctx, {
      eventId: 'evt_new',
      eventType: 'PRODUCT_CHANGE',
      productId: 'premium_monthly',
      providerEventAt: 5_000,
      purchasedAt: 5_000,
      expirationAt: 9_000,
    });
    const stale = await apply(ctx, {
      eventId: 'evt_old',
      eventType: 'EXPIRATION',
      productId: 'pro_monthly',
      providerEventAt: 4_000,
      purchasedAt: 1_000,
      expirationAt: 2_000,
    });

    expect(stale).toMatchObject({ ignored: true, reason: 'stale_event' });
    expect(accountOf(ctx)).toMatchObject({
      plan: 'premium',
      status: 'active',
      currentPeriodEndAt: 9_000,
      lastProviderEventId: 'evt_new',
    });
    expect(businessOf(ctx).subscriptionStatus).toBe('active');
    expect(
      ctx
        .rows('revenueCatWebhookEvents')
        .find((row) => row.eventId === 'evt_old').status
    ).toBe('ignored_stale');
  });

  test('equal timestamps let the later arrival apply', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    await apply(ctx, {
      eventId: 'evt_first',
      eventType: 'INITIAL_PURCHASE',
      productId: 'pro_monthly',
      providerEventAt: 5_000,
      purchasedAt: 5_000,
      expirationAt: 8_000,
    });
    const second = await apply(ctx, {
      eventId: 'evt_second',
      eventType: 'PRODUCT_CHANGE',
      productId: 'premium_yearly',
      providerEventAt: 5_000,
      purchasedAt: 5_000,
      expirationAt: 12_000,
    });

    expect(second.ignored).toBeUndefined();
    expect(accountOf(ctx)).toMatchObject({
      plan: 'premium',
      billingPeriod: 'yearly',
      currentPeriodEndAt: 12_000,
      lastProviderEventId: 'evt_second',
      status: 'active',
    });
    expect(
      ctx
        .rows('revenueCatWebhookEvents')
        .every((row) => row.status === 'processed')
    ).toBe(true);
  });

  test('missing provider timestamp falls back to processing time and can apply after an older event', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    await apply(ctx, {
      eventId: 'evt_old',
      providerEventAt: 1_000,
      purchasedAt: 1_000,
      expirationAt: 2_000,
    });
    const before = Date.now();
    await apply(ctx, {
      eventId: 'evt_notimestamp',
      eventType: 'PRODUCT_CHANGE',
      productId: 'premium_monthly',
      providerEventAt: undefined,
      purchasedAt: 3_000,
      expirationAt: 4_000,
    });
    const after = Date.now();

    expect(accountOf(ctx).plan).toBe('premium');
    expect(accountOf(ctx).lastProviderEventAt).toBeGreaterThanOrEqual(before);
    expect(accountOf(ctx).lastProviderEventAt).toBeLessThanOrEqual(after);
    expect(accountOf(ctx).lastProviderEventId).toBe('evt_notimestamp');
  });

  test('CANCELLATION keeps access until currentPeriodEndAt', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    const periodEnd = Date.now() + 30 * 24 * 60 * 60 * 1000;
    await apply(ctx, {
      eventId: 'evt_cancel',
      eventType: 'CANCELLATION',
      expirationAt: periodEnd,
      providerEventAt: Date.now(),
    });

    const account = accountOf(ctx);
    expect(account).toMatchObject({
      status: 'canceled',
      plan: 'pro',
      hasProviderEvidence: true,
      currentPeriodEndAt: periodEnd,
    });
    expect(typeof account.canceledAt).toBe('number');
    expect(accessAt(ctx, Date.now()).isSubscriptionActive).toBe(true);
    expect(accessAt(ctx, periodEnd + 1).isSubscriptionActive).toBe(false);
    expect(accessAt(ctx, periodEnd + 1).plan).toBe('pro');
  });

  test('BILLING_ISSUE keeps access only during a future grace timestamp', async () => {
    const futureGrace = Date.now() + 5 * 24 * 60 * 60 * 1000;
    const withGrace = createMockCtx({ businesses: [buildBusiness()] });
    await apply(withGrace, {
      eventId: 'evt_grace',
      eventType: 'BILLING_ISSUE',
      gracePeriodEndAt: futureGrace,
      providerEventAt: Date.now(),
    });
    expect(accountOf(withGrace)).toMatchObject({
      status: 'past_due',
      gracePeriodEndAt: futureGrace,
      hasProviderEvidence: true,
    });
    expect(accessAt(withGrace, Date.now()).isSubscriptionActive).toBe(true);
    expect(accessAt(withGrace, futureGrace + 1).isSubscriptionActive).toBe(
      false
    );

    const withoutGrace = createMockCtx({ businesses: [buildBusiness()] });
    await apply(withoutGrace, {
      eventId: 'evt_no_grace',
      eventType: 'BILLING_ISSUE',
      providerEventAt: Date.now(),
    });
    expect(accountOf(withoutGrace).gracePeriodEndAt).toBeNull();
    expect(accessAt(withoutGrace, Date.now()).isSubscriptionActive).toBe(false);

    const expiredGrace = createMockCtx({ businesses: [buildBusiness()] });
    await apply(expiredGrace, {
      eventId: 'evt_expired_grace',
      eventType: 'BILLING_ISSUE',
      gracePeriodEndAt: Date.now() - 1_000,
      providerEventAt: Date.now(),
    });
    expect(accessAt(expiredGrace, Date.now()).isSubscriptionActive).toBe(false);
  });

  test('EXPIRATION revokes access and keeps the paid plan', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    await apply(ctx);
    await apply(ctx, {
      eventId: 'evt_expire',
      eventType: 'EXPIRATION',
      providerEventAt: 1_702_600_000_000,
      expirationAt: 1_702_592_000_000,
    });

    const account = accountOf(ctx);
    expect(account).toMatchObject({
      plan: 'pro',
      status: 'inactive',
      hasProviderEvidence: true,
    });
    expect(typeof account.entitlementRevokedAt).toBe('number');
    expect(account.revokeReason).toBe('expiration');
    expect(accessAt(ctx, Date.now()).isSubscriptionActive).toBe(false);
    expect(accessAt(ctx, Date.now()).plan).toBe('pro');
  });

  test('REFUND uses the same revocation semantics and does not mark paid periods refunded', async () => {
    const ctx = createMockCtx({
      businesses: [buildBusiness()],
      businessReferralRelationships: [buildRelationship()],
    });
    await apply(ctx);
    await apply(ctx, {
      eventId: 'evt_refund',
      eventType: 'REFUND',
      providerEventAt: 1_700_000_100_000,
    });

    const account = accountOf(ctx);
    expect(account.status).toBe('inactive');
    expect(account.plan).toBe('pro');
    expect(typeof account.entitlementRevokedAt).toBe('number');
    expect(account.revokeReason).toBe('refund');
    expect(accessAt(ctx, Date.now()).isSubscriptionActive).toBe(false);
    expect(ctx.rows('businessPaidServicePeriods')[0].isRefunded).toBe(false);
    expect(ctx.rows('businessReferralRelationships')[0].status).toBe('revoked');
  });

  test('a later renewal clears revocation and restores access', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    await apply(ctx, {
      eventId: 'evt_expire',
      eventType: 'EXPIRATION',
      providerEventAt: 2_000,
      purchasedAt: 1_000,
      expirationAt: 2_000,
    });
    expect(typeof accountOf(ctx).entitlementRevokedAt).toBe('number');

    await apply(ctx, {
      eventId: 'evt_renew',
      eventType: 'RENEWAL',
      providerEventAt: 3_000,
      purchasedAt: 3_000,
      expirationAt: 9_000,
    });

    const account = accountOf(ctx);
    expect(account.status).toBe('active');
    expect(account.hasProviderEvidence).toBe(true);
    expect(account.entitlementRevokedAt).toBeUndefined();
    expect(account.revokeReason).toBeUndefined();
    expect(account.currentPeriodStartAt).toBe(3_000);
    expect(account.currentPeriodEndAt).toBe(9_000);
    expect(accessAt(ctx, 4_000).isSubscriptionActive).toBe(true);
  });

  test('REFUND_REVERSED clears revocation and restores access', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    await apply(ctx, {
      eventId: 'evt_refund',
      eventType: 'REFUND',
      providerEventAt: 2_000,
    });
    await apply(ctx, {
      eventId: 'evt_reversed',
      eventType: 'REFUND_REVERSED',
      providerEventAt: 3_000,
      purchasedAt: 3_000,
      expirationAt: 9_000,
    });

    expect(accountOf(ctx).status).toBe('active');
    expect(accountOf(ctx).entitlementRevokedAt).toBeUndefined();
    expect(accessAt(ctx, 4_000).isSubscriptionActive).toBe(true);
  });

  test('PRODUCT_CHANGE switches plan immediately and does not add a paid period', async () => {
    const ctx = createMockCtx({
      businesses: [buildBusiness()],
      businessReferralRelationships: [buildRelationship()],
    });
    await apply(ctx);
    await apply(ctx, {
      eventId: 'evt_change',
      eventType: 'PRODUCT_CHANGE',
      productId: 'pro_monthly',
      newProductId: 'premium_monthly',
      providerEventAt: 1_700_000_200_000,
      purchasedAt: 1_700_000_200_000,
      expirationAt: 1_702_700_000_000,
    });

    expect(accountOf(ctx)).toMatchObject({
      plan: 'premium',
      billingPeriod: 'monthly',
      status: 'active',
      providerProductId: 'premium_monthly',
      currentPeriodEndAt: 1_702_700_000_000,
    });
    expect(businessOf(ctx).subscriptionPlan).toBe('premium');
    expect(ctx.rows('businessPaidServicePeriods')).toHaveLength(1);
    expect(ctx.rows('businessPaidServicePeriods')[0]).toMatchObject({
      idempotencyKey: 'paid:evt_initial',
      sourceEventId: 'evt_initial',
      isPaid: true,
      isRefunded: false,
    });
  });

  test('INITIAL_PURCHASE and RENEWAL keep paid-period idempotency when a referral exists', async () => {
    const ctx = createMockCtx({
      businesses: [buildBusiness()],
      businessReferralRelationships: [buildRelationship()],
    });
    await apply(ctx);
    expect(ctx.rows('businessReferralRelationships')[0].status).toBe(
      'subscription_started'
    );
    await apply(ctx, {
      eventId: 'evt_renewal',
      eventType: 'RENEWAL',
      providerEventAt: 1_700_000_300_000,
      purchasedAt: 1_700_000_300_000,
      expirationAt: 1_702_800_000_000,
    });
    await apply(ctx, {
      eventId: 'evt_renewal',
      eventType: 'RENEWAL',
      providerEventAt: 1_700_000_300_000,
    });

    const periods = ctx.rows('businessPaidServicePeriods');
    expect(periods).toHaveLength(2);
    expect(periods.map((period) => period.idempotencyKey).sort()).toEqual([
      'paid:evt_initial',
      'paid:evt_renewal',
    ]);
    expect(ctx.rows('businessReferralRelationships')[0].status).toBe(
      'qualification_pending'
    );
  });

  test('NON_RENEWING_PURCHASE and TRIAL_STARTED do not create paid periods or subscription_started', async () => {
    for (const eventType of ['NON_RENEWING_PURCHASE', 'TRIAL_STARTED']) {
      const ctx = createMockCtx({
        businesses: [buildBusiness()],
        businessReferralRelationships: [buildRelationship()],
      });
      await apply(ctx, {
        eventId: `evt_${eventType.toLowerCase()}`,
        eventType,
        providerEventAt: 1_700_000_000_000,
      });

      expect(ctx.rows('businessPaidServicePeriods')).toHaveLength(0);
      expect(ctx.rows('businessReferralRelationships')[0]).toMatchObject({
        status: 'qualification_pending',
        subscriptionStartedAt: undefined,
      });
      expect(
        typeof ctx.rows('businessReferralRelationships')[0].firstPaidAt
      ).toBe('number');
    }
  });

  test('without a referral relationship no paid period is written', async () => {
    const ctx = createMockCtx({ businesses: [buildBusiness()] });
    await apply(ctx);
    await apply(ctx, {
      eventId: 'evt_renewal',
      eventType: 'RENEWAL',
      providerEventAt: 1_700_000_300_000,
      purchasedAt: 1_700_000_300_000,
      expirationAt: 1_702_800_000_000,
    });

    expect(ctx.rows('businessPaidServicePeriods')).toHaveLength(0);
    expect(accountOf(ctx).hasProviderEvidence).toBe(true);
    expect(accessAt(ctx, 1_701_000_000_000).isSubscriptionActive).toBe(true);
  });

  test('unpaid Starter mirror state does not grant operational access', () => {
    const business = buildBusiness({
      subscriptionPlan: 'starter',
      subscriptionStatus: 'active',
      billingPeriod: 'monthly',
      subscriptionEndAt: Date.now() + 86_400_000,
    });
    const withoutAccount = buildBusinessEntitlementsFromBusiness(business);
    expect(withoutAccount.plan).toBe('starter');
    expect(withoutAccount.isSubscriptionActive).toBe(false);

    const withInactiveAccount = buildBusinessEntitlementsFromBusiness(
      business,
      Date.now(),
      {
        billingAccount: {
          plan: undefined,
          lastPlan: undefined,
          status: 'inactive',
          billingPeriod: null,
          hasProviderEvidence: false,
          currentPeriodEndAt: null,
        },
      }
    );
    expect(withInactiveAccount.plan).toBe('starter');
    expect(withInactiveAccount.isSubscriptionActive).toBe(false);
    expect(withInactiveAccount.features.marketingHub).toBe(false);
  });
});

describe('canonical billing event mapping', () => {
  test('maps RevenueCat effects without collapsing paid-period or revoke flags', () => {
    const base = {
      eventId: 'evt_map',
      businessId: BUSINESS_ID,
      plan: 'pro',
      billingPeriod: 'monthly',
      purchasedAt: 10,
      expirationAt: 20,
      providerEventAt: 15,
      providerProductId: 'pro_monthly',
      providerSubscriptionId: 'tx_1',
      now: 100,
    };
    const cases = [
      ['INITIAL_PURCHASE', 'initial_payment', true, false],
      ['NON_RENEWING_PURCHASE', 'initial_payment', false, false],
      ['TRIAL_STARTED', 'initial_payment', false, false],
      ['RENEWAL', 'renewal', true, false],
      ['PRODUCT_CHANGE', 'plan_change', false, false],
      ['BILLING_ISSUE', 'billing_issue', false, false],
      ['UNCANCELLATION', 'recovery', false, false],
      ['SUBSCRIPTION_EXTENDED', 'recovery', false, false],
      ['REFUND_REVERSED', 'recovery', false, false],
      ['CANCELLATION', 'cancellation', false, false],
      ['EXPIRATION', 'expiration', false, true],
      ['REFUND', 'refund', false, true],
      ['SUBSCRIPTION_PAUSED', 'pause', false, false],
    ];

    for (const [eventType, eventKind, recordsPaid, revokes] of cases) {
      const event = mapRevenueCatToCanonicalEvent({
        ...base,
        eventType,
      });
      expect(event.eventKind).toBe(eventKind);
      expect(event.recordsPaidServicePeriod).toBe(recordsPaid);
      expect(event.revokesReferral).toBe(revokes);
      expect(event.provider).toBe('revenuecat');
      expect(event).not.toHaveProperty('referralEventType');
      expect(JSON.stringify(event)).not.toContain(eventType);
    }

    expect(
      mapRevenueCatToCanonicalEvent({
        ...base,
        eventType: 'CANCELLATION',
      }).canceledAtAction
    ).toEqual({ kind: 'set', value: 100 });
    expect(
      mapRevenueCatToCanonicalEvent({
        ...base,
        eventType: 'UNCANCELLATION',
      }).canceledAtAction
    ).toEqual({ kind: 'clear' });
    expect(
      mapRevenueCatToCanonicalEvent({
        ...base,
        eventType: 'RENEWAL',
      }).canceledAtAction
    ).toEqual({ kind: 'preserve' });
    expect(
      mapRevenueCatToCanonicalEvent({
        ...base,
        eventType: 'RENEWAL',
      }).revokeAction
    ).toEqual({ kind: 'clear' });
    expect(
      mapRevenueCatToCanonicalEvent({
        ...base,
        eventType: 'REFUND',
      }).revokeAction
    ).toEqual({ kind: 'set', value: 100, reason: 'refund' });
    expect(
      mapRevenueCatToCanonicalEvent({
        ...base,
        eventType: 'BILLING_ISSUE',
        gracePeriodEndAt: 50,
      }).graceAction
    ).toEqual({ kind: 'set', value: 50 });
    expect(
      mapRevenueCatToCanonicalEvent({
        ...base,
        eventType: 'RENEWAL',
      }).graceAction
    ).toEqual({ kind: 'clear' });
    expect(
      mapRevenueCatToCanonicalEvent({
        ...base,
        eventType: 'INITIAL_PURCHASE',
        providerEventAt: undefined,
      }).occurredAt
    ).toBe(100);
  });
});

describe('canonical billing application', () => {
  function canonicalEvent(overrides = {}) {
    return {
      provider: 'revenuecat',
      externalEventId: 'evt_direct',
      businessId: BUSINESS_ID,
      occurredAt: 5_000,
      appliedAt: 5_100,
      eventKind: 'renewal',
      plan: 'pro',
      billingPeriod: 'monthly',
      status: 'active',
      periodStartAt: 5_000,
      periodEndAt: 9_000,
      providerProductId: 'pro_monthly',
      providerSubscriptionId: 'tx_1',
      recordsPaidServicePeriod: true,
      revokesReferral: false,
      canceledAtAction: { kind: 'preserve' },
      revokeAction: { kind: 'clear' },
      graceAction: { kind: 'clear' },
      ...overrides,
    };
  }

  test('writes the billing account and business mirror without provider logs', async () => {
    const ctx = createMockCtx({
      businesses: [buildBusiness()],
      businessBillingAccounts: [
        {
          _id: 'billing_1',
          businessId: BUSINESS_ID,
          ownerUserId: OWNER_ID,
          providerAppUserId: `business:${BUSINESS_ID}`,
          status: 'inactive',
          hasProviderEvidence: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const result = await applyVerifiedBillingEvent(ctx, canonicalEvent());

    expect(result).toEqual({
      applied: true,
      businessId: BUSINESS_ID,
      plan: 'pro',
      status: 'active',
    });
    expect(accountOf(ctx)).toMatchObject({
      plan: 'pro',
      status: 'active',
      hasProviderEvidence: true,
      currentPeriodStartAt: 5_000,
      currentPeriodEndAt: 9_000,
      lastProviderEventAt: 5_000,
      lastProviderEventId: 'evt_direct',
      provider: 'revenuecat',
    });
    expect(businessOf(ctx)).toMatchObject({
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      subscriptionEndAt: 9_000,
    });
    expect(ctx.rows('subscriptions')).toHaveLength(0);
    expect(ctx.rows('revenueCatWebhookEvents')).toHaveLength(0);
    expect(ctx.rows('businessPaidServicePeriods')).toHaveLength(0);
  });

  test('stale canonical events do not change stored billing state', async () => {
    const ctx = createMockCtx({
      businesses: [buildBusiness({ subscriptionPlan: 'premium' })],
      businessBillingAccounts: [
        {
          _id: 'billing_1',
          businessId: BUSINESS_ID,
          ownerUserId: OWNER_ID,
          providerAppUserId: 'ba_existing',
          plan: 'premium',
          status: 'active',
          hasProviderEvidence: true,
          lastProviderEventAt: 8_000,
          lastProviderEventId: 'evt_newer',
          currentPeriodEndAt: 12_000,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const result = await applyVerifiedBillingEvent(
      ctx,
      canonicalEvent({
        externalEventId: 'evt_older',
        occurredAt: 7_000,
        plan: 'starter',
      })
    );

    expect(result).toEqual({
      applied: false,
      reason: 'stale_event',
      businessId: BUSINESS_ID,
    });
    expect(accountOf(ctx)).toMatchObject({
      plan: 'premium',
      lastProviderEventId: 'evt_newer',
      currentPeriodEndAt: 12_000,
    });
    expect(businessOf(ctx).subscriptionPlan).toBe('premium');
  });

  test('paid periods follow canonical kind and the records flag', async () => {
    const ctx = createMockCtx({
      businesses: [buildBusiness()],
      businessBillingAccounts: [
        {
          _id: 'billing_1',
          businessId: BUSINESS_ID,
          ownerUserId: OWNER_ID,
          providerAppUserId: 'ba_existing',
          status: 'inactive',
          hasProviderEvidence: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      businessReferralRelationships: [buildRelationship()],
    });

    await applyVerifiedBillingEvent(
      ctx,
      canonicalEvent({
        externalEventId: 'evt_plan_change',
        occurredAt: 5_000,
        eventKind: 'plan_change',
        recordsPaidServicePeriod: true,
      })
    );
    expect(ctx.rows('businessPaidServicePeriods')).toHaveLength(0);
    expect(ctx.rows('businessReferralRelationships')[0].status).toBe(
      'qualification_pending'
    );

    await applyVerifiedBillingEvent(
      ctx,
      canonicalEvent({
        externalEventId: 'evt_non_cycle',
        occurredAt: 5_500,
        eventKind: 'initial_payment',
        recordsPaidServicePeriod: false,
      })
    );
    expect(ctx.rows('businessPaidServicePeriods')).toHaveLength(0);
    expect(
      ctx.rows('businessReferralRelationships')[0].subscriptionStartedAt
    ).toBeUndefined();

    await applyVerifiedBillingEvent(
      ctx,
      canonicalEvent({
        externalEventId: 'evt_paid',
        occurredAt: 6_000,
        eventKind: 'initial_payment',
        recordsPaidServicePeriod: true,
      })
    );
    expect(ctx.rows('businessPaidServicePeriods')).toHaveLength(1);
    expect(ctx.rows('businessPaidServicePeriods')[0].idempotencyKey).toBe(
      'paid:evt_paid'
    );
    expect(ctx.rows('businessReferralRelationships')[0].status).toBe(
      'subscription_started'
    );

    await applyVerifiedBillingEvent(
      ctx,
      canonicalEvent({
        externalEventId: 'evt_renew_without_record',
        occurredAt: 6_500,
        eventKind: 'renewal',
        recordsPaidServicePeriod: false,
      })
    );
    expect(ctx.rows('businessPaidServicePeriods')).toHaveLength(1);

    await applyVerifiedBillingEvent(
      ctx,
      canonicalEvent({
        externalEventId: 'evt_renew_paid',
        occurredAt: 7_000,
        eventKind: 'renewal',
        recordsPaidServicePeriod: true,
      })
    );
    expect(ctx.rows('businessPaidServicePeriods')).toHaveLength(2);
    expect(ctx.rows('businessReferralRelationships')[0].status).toBe(
      'qualification_pending'
    );

    await applyVerifiedBillingEvent(
      ctx,
      canonicalEvent({
        externalEventId: 'evt_refund',
        occurredAt: 8_000,
        eventKind: 'refund',
        recordsPaidServicePeriod: true,
        revokesReferral: true,
        status: 'inactive',
        revokeAction: { kind: 'set', value: 8_000, reason: 'refund' },
      })
    );
    expect(ctx.rows('businessPaidServicePeriods')).toHaveLength(2);
    expect(
      ctx
        .rows('businessPaidServicePeriods')
        .every((period) => !period.isRefunded)
    ).toBe(true);
    expect(ctx.rows('businessReferralRelationships')[0].status).toBe('revoked');
  });
});
