import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';

import { hasOperationalAccessFromStatus } from '../lib/billing/lifecycle';
import { handlePayPlusCallbackRequest } from '../lib/billing/payplus/callbackHttp';
import {
  assertPayPlusCheckoutCanHost,
  buildPayPlusCheckoutDraft,
  buildPayPlusGenerateLinkBody,
  PAYPLUS_RECURRING_POC,
  payPlusRecurringSchedule,
  payPlusRefundEvidenceCanApply,
  toHostedCheckoutClientResult,
} from '../lib/billing/payplus/checkout';
import {
  assertServerOnlyPayPlusEnvNames,
  PAYPLUS_PRODUCTION_API_HOST,
  PAYPLUS_STAGING_API_BASE,
  publicPayPlusConfigStatus,
  resolvePayPlusConfig,
} from '../lib/billing/payplus/config';
import { mapVerifiedPayPlusEvidence } from '../lib/billing/payplus/mapToCanonical';
import {
  buildRefundByTransactionUidBody,
  comparePayPlusRecurringSnapshot,
  parseCreditCardRenewalResponse,
  parseRefundResponse,
  payPlusJsonRequest,
} from '../lib/billing/payplus/providerClient';
import {
  hmacSha256Base64,
  redactPayPlusPayload,
  verifyPayPlusRequestHash,
} from '../lib/billing/payplus/verify';
import {
  applyPayPlusCancellationRecord,
  applyVerifiedPayPlusEvidenceRecord,
  createPayPlusCheckoutRecord,
  createPayPlusHostedCheckout,
  refundPayPlusTransaction,
} from '../payplusBilling';

const SECRET = 'test-payplus-secret';
const API_KEY = 'test-payplus-api-key';
const BUSINESS_ID = 'business_payplus_owner_001';
const OWNER_ID = 'user_payplus_owner_001';
const OTHER_ID = 'user_payplus_other_001';
const CHECKOUT_ID = 'pp_checkoutintent0001';
const TRANSACTION_UID = 'tx-uid-00000001';
const RECURRING_UID = 'recurring-uid-000001';
const PAGE_REQUEST_UID = 'page-request-uid-0001';
const OCCURRED_AT = Date.parse('2026-01-15T10:00:00Z');
const CARD_MARKER = 'CARDSECRET9999';
const CVV_MARKER = 'CVVSECRET';

function createMockCtx(initial = {}) {
  const tableNames = [
    'businesses',
    'users',
    'businessBillingAccounts',
    'businessPaidServicePeriods',
    'businessReferralRelationships',
    'businessReferralRewards',
    'payplusCheckoutIntents',
    'payplusProviderEvents',
  ];
  const state = Object.fromEntries(
    tableNames.map((tableName) => [
      tableName,
      new Map((initial[tableName] ?? []).map((row) => [row._id, { ...row }])),
    ])
  );
  const rows = (tableName) => Array.from(state[tableName].values());
  return {
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
            take: async (count) => filtered.slice(0, count),
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
}

function business(overrides = {}) {
  return {
    _id: BUSINESS_ID,
    ownerUserId: OWNER_ID,
    name: 'StampAix Cafe',
    isActive: true,
    subscriptionPlan: 'starter',
    subscriptionStatus: 'inactive',
    subscriptionStartAt: null,
    subscriptionEndAt: null,
    billingPeriod: null,
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
    ...overrides,
  };
}

function chargeInput(overrides = {}) {
  return {
    checkoutId: CHECKOUT_ID,
    transactionUid: TRANSACTION_UID,
    transactionType: 'Charge',
    statusCode: '000',
    amount: 149,
    currency: 'ILS',
    occurredAt: OCCURRED_AT,
    recurringUid: RECURRING_UID,
    transactionIsCancelled: false,
    now: OCCURRED_AT,
    ...overrides,
  };
}

function callbackBody(overrides = {}) {
  const transaction = {
    uid: TRANSACTION_UID,
    payment_request_uid: PAGE_REQUEST_UID,
    status_code: '000',
    amount: 149,
    currency: 'ILS',
    more_info: CHECKOUT_ID,
    more_info_2: 'starter_monthly',
    date: '2026-01-15 10:00:00',
    recurring_charge_information: {
      recurring_uid: RECURRING_UID,
      charge_uid: 'charge-uid-00000001',
    },
    ...(overrides.transaction ?? {}),
  };
  return {
    transaction_type: overrides.transaction_type ?? 'Charge',
    transaction,
    invoice: overrides.invoice,
    data: {
      card_information: {
        four_digits: CARD_MARKER,
        cvv: CVV_MARKER,
        identification_number: '123456789',
        token: 'card-token-secret',
      },
    },
  };
}

function viewBody(body) {
  const transaction = body.transaction;
  return {
    results: { status: 'success', code: 0, description: 'ok' },
    data: [
      {
        transaction: {
          transaction_uid: transaction.uid,
          transaction_type: body.transaction_type,
          date: transaction.date,
          status_code: transaction.status_code,
          amount: transaction.amount,
          currency: transaction.currency,
          more_info: transaction.more_info,
          transaction_is_cancelled: false,
        },
        data: {
          card_information: { token: 'view-card-token-secret' },
        },
      },
    ],
  };
}

function stagingEnv(overrides = {}) {
  return {
    PAYPLUS_ENV: 'staging',
    PAYPLUS_API_KEY: API_KEY,
    PAYPLUS_SECRET_KEY: SECRET,
    PAYPLUS_PAYMENT_PAGE_UID: 'payment-page-uid-0001',
    PAYPLUS_TERMINAL_UID: 'terminal-uid-0000001',
    PAYPLUS_WEB_ORIGIN: 'http://localhost:8081',
    CONVEX_SITE_URL: 'https://example.convex.site',
    ...overrides,
  };
}

function signedRequest(body, secret = SECRET, headers = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const hash =
    headers.hash === undefined
      ? createHmac('sha256', secret).update(raw).digest('base64')
      : headers.hash;
  return new Request('https://example.convex.site/payplus/callback', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      hash,
      'user-agent': headers.userAgent ?? 'PayPlus',
    },
    body: raw,
  });
}

async function seedCheckout(ctx, overrides = {}) {
  return await createPayPlusCheckoutRecord(ctx, {
    actorUserId: OWNER_ID,
    businessId: BUSINESS_ID,
    plan: 'starter',
    billingPeriod: 'monthly',
    now: OCCURRED_AT,
    checkoutId: CHECKOUT_ID,
    ...overrides,
  });
}

describe('PayPlus server authority and environment', () => {
  test('plan prices come from billing contract 1.0.0', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    const starter = await seedCheckout(ctx);
    const pro = buildPayPlusCheckoutDraft({
      checkoutId: 'pp_proyearlycheckout01',
      businessId: BUSINESS_ID,
      ownerUserId: OWNER_ID,
      actorUserId: OWNER_ID,
      businessActive: true,
      plan: 'pro',
      billingPeriod: 'yearly',
      now: OCCURRED_AT,
    });

    expect(starter.amount).toBe(149);
    expect(starter.currency).toBe('ILS');
    expect(pro.amount).toBe(2990);
    expect(pro.currency).toBe('ILS');
    expect(() =>
      buildPayPlusCheckoutDraft({
        checkoutId: 'pp_proyearlycheckout01',
        businessId: BUSINESS_ID,
        ownerUserId: OWNER_ID,
        actorUserId: OWNER_ID,
        businessActive: true,
        plan: 'pro',
        billingPeriod: 'yearly',
        browserAmount: 1,
        now: OCCURRED_AT,
      })
    ).toThrow('PAYPLUS_AMOUNT_NOT_AUTHORITATIVE');
    expect(() =>
      buildPayPlusCheckoutDraft({
        checkoutId: 'pp_proyearlycheckout01',
        businessId: BUSINESS_ID,
        ownerUserId: OWNER_ID,
        actorUserId: OWNER_ID,
        businessActive: true,
        plan: 'pro',
        billingPeriod: 'yearly',
        browserCurrency: 'USD',
        now: OCCURRED_AT,
      })
    ).toThrow('PAYPLUS_CURRENCY_NOT_AUTHORITATIVE');
  });

  test('checkout intent binds owner, plan, period, and server amount', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await expect(seedCheckout(ctx, { actorUserId: OTHER_ID })).rejects.toThrow(
      'NOT_AUTHORIZED'
    );
    await expect(
      seedCheckout(ctx, {
        businessId: BUSINESS_ID,
        actorUserId: OWNER_ID,
        plan: 'premium',
        billingPeriod: 'monthly',
        checkoutId: 'pp_closedbusiness0001',
      })
    ).resolves.toMatchObject({ amount: 499, currency: 'ILS' });
    const closed = createMockCtx({
      businesses: [business({ isActive: false })],
    });
    await expect(seedCheckout(closed)).rejects.toThrow('BUSINESS_CLOSED');
    const missing = createMockCtx();
    await expect(seedCheckout(missing)).rejects.toThrow('BUSINESS_NOT_FOUND');
    expect(
      ctx
        .rows('payplusCheckoutIntents')
        .find((row) => row.checkoutId === 'pp_closedbusiness0001')
    ).toMatchObject({
      businessId: BUSINESS_ID,
      ownerUserId: OWNER_ID,
      plan: 'premium',
      billingPeriod: 'monthly',
      amount: 499,
      currency: 'ILS',
    });
  });

  test('hosted checkout body uses recurring charge method and contract amount', () => {
    const urls = {
      success: 'http://localhost:8081/billing/payplus/success',
      failure: 'http://localhost:8081/billing/payplus/failure',
      cancel: 'http://localhost:8081/billing/payplus/cancel',
      callback: 'https://example.convex.site/payplus/callback',
    };
    const monthly = buildPayPlusGenerateLinkBody({
      paymentPageUid: 'payment-page-uid-0001',
      amount: 149,
      billingPeriod: 'monthly',
      checkoutId: CHECKOUT_ID,
      logicalProductId: 'starter_monthly',
      urls,
      customerName: 'StampAix Cafe',
      customerEmail: 'owner@example.com',
      now: OCCURRED_AT,
    });
    const yearly = payPlusRecurringSchedule('yearly');
    expect(monthly.amount).toBe(149);
    expect(monthly.currency_code).toBe('ILS');
    expect(monthly.charge_method).toBe(3);
    expect(monthly.more_info).toBe(CHECKOUT_ID);
    expect(monthly.recurring_settings.number_of_charges).toBe(0);
    expect(monthly.recurring_settings.recurring_range).toBe(1);
    expect(monthly.recurring_settings.successful_invoice).toBe(false);
    expect(monthly.create_token).toBe(false);
    expect(yearly).toEqual({
      recurring_type: 2,
      recurring_range: 12,
      number_of_charges: 0,
    });
    expect(PAYPLUS_RECURRING_POC.recommended).toBe('hosted_payment_page');
    expect(PAYPLUS_RECURRING_POC.alternateRequiresCardToken).toBe(true);
    expect(PAYPLUS_RECURRING_POC.yearlyTypeEnum).toBe(false);
    const serialized = JSON.stringify(monthly);
    expect(serialized).not.toContain('cvv');
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(API_KEY);
  });

  test('production PayPlus cannot be selected and live calls stay disabled', async () => {
    expect(() =>
      resolvePayPlusConfig({
        PAYPLUS_ENV: 'production',
        PAYPLUS_SECRET_KEY: SECRET,
      })
    ).toThrow('PAYPLUS_PRODUCTION_FORBIDDEN');
    expect(() => resolvePayPlusConfig({ PAYPLUS_ENV: 'prod' })).toThrow(
      'PAYPLUS_PRODUCTION_FORBIDDEN'
    );
    const disabled = resolvePayPlusConfig({});
    expect(disabled.env).toBe('disabled');
    expect(disabled.liveCheckoutEnabled).toBe(false);
    expect(disabled.baseUrl).toBeNull();
    expect(JSON.stringify(publicPayPlusConfigStatus(disabled))).not.toContain(
      SECRET
    );
    const staging = resolvePayPlusConfig(stagingEnv());
    expect(staging.baseUrl).toBe(PAYPLUS_STAGING_API_BASE);
    expect(staging.baseUrl).not.toContain(`://${PAYPLUS_PRODUCTION_API_HOST}/`);
    expect(JSON.stringify(publicPayPlusConfigStatus(staging))).not.toContain(
      SECRET
    );
    expect(JSON.stringify(publicPayPlusConfigStatus(staging))).not.toContain(
      API_KEY
    );
    const transport = async () => {
      throw new Error('NETWORK_SHOULD_NOT_RUN');
    };
    await expect(
      payPlusJsonRequest({
        config: disabled,
        path: 'Transactions/View',
        body: { transaction_uid: TRANSACTION_UID },
        transport,
      })
    ).rejects.toThrow('PAYPLUS_LIVE_DISABLED');
    await expect(
      payPlusJsonRequest({
        config: {
          ...staging,
          baseUrl: `https://${PAYPLUS_PRODUCTION_API_HOST}/api/v1.0/`,
        },
        path: 'Transactions/View',
        body: { transaction_uid: TRANSACTION_UID },
        transport,
      })
    ).rejects.toThrow('PAYPLUS_PRODUCTION_FORBIDDEN');
    assertServerOnlyPayPlusEnvNames();
  });

  test('client checkout result and refund request omit secrets and browser amount', () => {
    const result = toHostedCheckoutClientResult({
      ok: false,
      hosted: false,
      code: 'PAYPLUS_LIVE_DISABLED',
      checkoutId: CHECKOUT_ID,
      expiresAt: OCCURRED_AT,
      amount: 149,
      currency: 'ILS',
      plan: 'starter',
      billingPeriod: 'monthly',
      missing: ['PAYPLUS_API_KEY'],
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain('payment_page_uid');
    expect(result.amount).toBe(149);
    const refund = buildRefundByTransactionUidBody({
      transactionUid: TRANSACTION_UID,
      amount: 149,
    });
    expect(refund).toEqual({
      transaction_uid: TRANSACTION_UID,
      amount: 149,
    });
    expect(Object.hasOwn(refund, 'cvv')).toBe(false);
    const checkoutArgs = JSON.parse(createPayPlusHostedCheckout.exportArgs());
    const refundArgs = JSON.parse(refundPayPlusTransaction.exportArgs());
    expect(checkoutArgs.value.amount).toBeUndefined();
    expect(refundArgs.value.amount).toBeUndefined();
    expect(refundArgs.value.transactionUid.fieldType.type).toBe('string');
  });
});

describe('PayPlus callback verification', () => {
  function spyCtx(intent) {
    const calls = { query: 0, mutation: 0, provider: 0 };
    return {
      calls,
      ctx: {
        runQuery: async () => {
          calls.query += 1;
          return intent;
        },
        runMutation: async () => {
          calls.mutation += 1;
          return { ok: true, duplicate: false, eventId: 'payplus:tx:1' };
        },
      },
    };
  }

  function intent() {
    return {
      checkoutId: CHECKOUT_ID,
      amount: 149,
      currency: 'ILS',
      logicalProductId: 'starter_monthly',
      pageRequestUid: PAGE_REQUEST_UID,
      plan: 'starter',
      billingPeriod: 'monthly',
    };
  }

  test('missing hash, user agent, or provider agreement fails closed', async () => {
    const secretConfig = resolvePayPlusConfig(stagingEnv());
    const { ctx, calls } = spyCtx(intent());
    const unauthenticated = await handlePayPlusCallbackRequest(
      ctx,
      signedRequest(callbackBody(), SECRET, { hash: 'not-a-valid-hash' }),
      {
        intentRef: 'intent',
        applyRef: 'apply',
        config: secretConfig,
        queryTransaction: async () => {
          calls.provider += 1;
          return viewBody(callbackBody());
        },
      }
    );
    expect(unauthenticated.status).toBe(401);
    expect(calls.provider).toBe(0);
    expect(calls.mutation).toBe(0);

    const wrongAgent = await handlePayPlusCallbackRequest(
      ctx,
      signedRequest(callbackBody(), SECRET, { userAgent: 'curl' }),
      {
        intentRef: 'intent',
        applyRef: 'apply',
        config: secretConfig,
        queryTransaction: async () => {
          calls.provider += 1;
          return {};
        },
      }
    );
    expect(wrongAgent.status).toBe(401);
    expect(calls.provider).toBe(0);

    const disabled = await handlePayPlusCallbackRequest(
      ctx,
      signedRequest(callbackBody()),
      {
        intentRef: 'intent',
        applyRef: 'apply',
        config: resolvePayPlusConfig({}),
        queryTransaction: async () => {
          calls.provider += 1;
          return {};
        },
      }
    );
    expect(disabled.status).toBe(503);
    expect(await disabled.json()).toEqual({
      ok: false,
      code: 'PAYPLUS_LIVE_DISABLED',
    });
    expect(calls.provider).toBe(0);
    expect(calls.mutation).toBe(0);
  });

  test('hash matches the documented HMAC and a raw body', async () => {
    const message = '{"ok":true}';
    expect(await hmacSha256Base64(SECRET, message)).toBe(
      createHmac('sha256', SECRET).update(message).digest('base64')
    );
    const parsed = { ok: true };
    const raw = '{ "ok" : true }';
    const rawHash = createHmac('sha256', SECRET).update(raw).digest('base64');
    expect(
      await verifyPayPlusRequestHash({
        rawBody: raw,
        parsedBody: parsed,
        hashHeader: rawHash,
        userAgent: 'PayPlus',
        secretKey: SECRET,
      })
    ).toEqual({ ok: true });
    expect(
      await verifyPayPlusRequestHash({
        rawBody: message,
        parsedBody: parsed,
        hashHeader: 'wrong',
        userAgent: 'PayPlus',
        secretKey: SECRET,
      })
    ).toEqual({ ok: false, code: 'PAYPLUS_CALLBACK_UNAUTHENTICATED' });
  });

  test('unknown transaction, wrong amount, and wrong currency do not apply', async () => {
    const config = resolvePayPlusConfig(stagingEnv());
    const unknown = spyCtx(null);
    const unknownResponse = await handlePayPlusCallbackRequest(
      unknown.ctx,
      signedRequest(callbackBody()),
      {
        intentRef: 'intent',
        applyRef: 'apply',
        config,
        queryTransaction: async () => {
          unknown.calls.provider += 1;
          return viewBody(callbackBody());
        },
      }
    );
    expect(unknownResponse.status).toBe(400);
    expect(await unknownResponse.json()).toMatchObject({
      code: 'PAYPLUS_UNKNOWN_TRANSACTION',
    });
    expect(unknown.calls.provider).toBe(0);
    expect(unknown.calls.mutation).toBe(0);

    const wrongAmountBody = callbackBody({
      transaction: { amount: 1 },
    });
    const wrongAmount = spyCtx(intent());
    const amountResponse = await handlePayPlusCallbackRequest(
      wrongAmount.ctx,
      signedRequest(wrongAmountBody),
      {
        intentRef: 'intent',
        applyRef: 'apply',
        config,
        queryTransaction: async () => viewBody(wrongAmountBody),
      }
    );
    expect(await amountResponse.json()).toMatchObject({
      code: 'PAYPLUS_AMOUNT_MISMATCH',
    });
    expect(wrongAmount.calls.mutation).toBe(0);

    const wrongCurrencyBody = callbackBody({
      transaction: { currency: 'USD' },
    });
    const wrongCurrency = spyCtx(intent());
    const currencyResponse = await handlePayPlusCallbackRequest(
      wrongCurrency.ctx,
      signedRequest(wrongCurrencyBody),
      {
        intentRef: 'intent',
        applyRef: 'apply',
        config,
        queryTransaction: async () => viewBody(wrongCurrencyBody),
      }
    );
    expect(await currencyResponse.json()).toMatchObject({
      code: 'PAYPLUS_CURRENCY_MISMATCH',
    });
    expect(wrongCurrency.calls.mutation).toBe(0);
  });

  test('verified callback applies once and hides card data', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    const body = callbackBody({
      invoice: {
        uuid: 'invoice-uuid-0001',
        docu_number: '90191',
        original_url: 'https://invoice.example/doc/1',
        copy_url: 'http://invoice.example/insecure',
      },
    });
    const callbackCtx = {
      runQuery: async () => {
        const intent = ctx.rows('payplusCheckoutIntents')[0];
        return {
          checkoutId: intent.checkoutId,
          amount: intent.amount,
          currency: intent.currency,
          logicalProductId: intent.logicalProductId,
          pageRequestUid: PAGE_REQUEST_UID,
          plan: intent.plan,
          billingPeriod: intent.billingPeriod,
        };
      },
      runMutation: async (_ref, args) =>
        applyVerifiedPayPlusEvidenceRecord(ctx, {
          ...args,
          now: OCCURRED_AT,
        }),
    };
    const first = await handlePayPlusCallbackRequest(
      callbackCtx,
      signedRequest(body),
      {
        intentRef: 'intent',
        applyRef: 'apply',
        config: resolvePayPlusConfig(stagingEnv()),
        now: OCCURRED_AT,
        queryTransaction: async () => viewBody(body),
      }
    );
    const second = await handlePayPlusCallbackRequest(
      callbackCtx,
      signedRequest(body),
      {
        intentRef: 'intent',
        applyRef: 'apply',
        config: resolvePayPlusConfig(stagingEnv()),
        now: OCCURRED_AT,
        queryTransaction: async () => viewBody(body),
      }
    );
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(first.status).toBe(200);
    expect(firstBody).toMatchObject({ ok: true, duplicate: false });
    expect(secondBody).toMatchObject({ ok: true, duplicate: true });
    expect(ctx.rows('payplusProviderEvents')).toHaveLength(1);
    expect(ctx.rows('businessBillingAccounts')[0]).toMatchObject({
      provider: 'payplus',
      plan: 'starter',
      status: 'active',
      hasProviderEvidence: true,
      providerEnvironment: 'staging',
    });
    const responseText = JSON.stringify(firstBody);
    expect(responseText).not.toContain(SECRET);
    expect(responseText).not.toContain(CARD_MARKER);
    expect(responseText).not.toContain(CVV_MARKER);
    const stored = JSON.stringify(ctx.rows('payplusProviderEvents')[0]);
    expect(stored).toContain('https://invoice.example/doc/1');
    expect(stored).not.toContain('http://invoice.example/insecure');
    expect(stored).not.toContain(CARD_MARKER);
    expect(stored).not.toContain('card-token-secret');
  });
});

describe('PayPlus canonical mapping and reconciliation', () => {
  test('initial charge, renewal, failure, refund, and cancellation map canonically', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    const initial = await applyVerifiedPayPlusEvidenceRecord(
      ctx,
      chargeInput()
    );
    expect(initial).toMatchObject({
      ok: true,
      duplicate: false,
      eventKind: 'initial_payment',
      plan: 'starter',
      status: 'active',
    });
    expect(ctx.rows('businesses')[0].subscriptionStatus).toBe('active');

    const renewal = await applyVerifiedPayPlusEvidenceRecord(
      ctx,
      chargeInput({
        transactionUid: 'tx-uid-00000002',
        occurredAt: OCCURRED_AT + 86_400_000,
        now: OCCURRED_AT + 86_400_000,
      })
    );
    expect(renewal.eventKind).toBe('renewal');

    const failure = await applyVerifiedPayPlusEvidenceRecord(
      ctx,
      chargeInput({
        transactionUid: 'tx-uid-00000003',
        statusCode: '004',
        occurredAt: OCCURRED_AT + 2 * 86_400_000,
        now: OCCURRED_AT + 2 * 86_400_000,
      })
    );
    expect(failure).toMatchObject({
      eventKind: 'billing_issue',
      status: 'past_due',
    });
    const afterFailure = ctx.rows('businessBillingAccounts')[0];
    expect(
      hasOperationalAccessFromStatus({
        status: afterFailure.status,
        hasProviderEvidence: true,
        currentPeriodEndAt: afterFailure.currentPeriodEndAt,
        gracePeriodEndAt: afterFailure.gracePeriodEndAt,
        entitlementRevokedAt: afterFailure.entitlementRevokedAt,
        now: OCCURRED_AT + 2 * 86_400_000,
      })
    ).toBe(true);

    const partial = await applyVerifiedPayPlusEvidenceRecord(
      ctx,
      chargeInput({
        transactionUid: 'tx-uid-00000004',
        transactionType: 'Refund',
        amount: 10,
        occurredAt: OCCURRED_AT + 3 * 86_400_000,
        now: OCCURRED_AT + 3 * 86_400_000,
      })
    );
    expect(partial).toEqual({
      ok: false,
      code: 'PAYPLUS_PARTIAL_REFUND_UNMAPPED',
    });

    const refund = await applyVerifiedPayPlusEvidenceRecord(
      ctx,
      chargeInput({
        transactionUid: 'tx-uid-00000005',
        transactionType: 'Refund',
        occurredAt: OCCURRED_AT + 4 * 86_400_000,
        now: OCCURRED_AT + 4 * 86_400_000,
      })
    );
    expect(refund).toMatchObject({ eventKind: 'refund', status: 'inactive' });
    const revoked = ctx.rows('businessBillingAccounts')[0];
    expect(
      hasOperationalAccessFromStatus({
        status: revoked.status,
        hasProviderEvidence: true,
        currentPeriodEndAt: revoked.currentPeriodEndAt,
        gracePeriodEndAt: revoked.gracePeriodEndAt,
        entitlementRevokedAt: revoked.entitlementRevokedAt,
        now: OCCURRED_AT + 4 * 86_400_000,
      })
    ).toBe(false);
  });

  test('duplicate, stale, unknown, and mismatched evidence do not grant access', async () => {
    const ctx = createMockCtx({
      businesses: [business()],
      businessBillingAccounts: [
        {
          _id: 'billing_existing',
          businessId: BUSINESS_ID,
          ownerUserId: OWNER_ID,
          providerAppUserId: 'ba_existingpayplus0001',
          plan: 'premium',
          status: 'active',
          billingPeriod: 'yearly',
          provider: 'payplus',
          hasProviderEvidence: true,
          providerSubscriptionIdentifier: RECURRING_UID,
          currentPeriodStartAt: OCCURRED_AT,
          currentPeriodEndAt: OCCURRED_AT + 86_400_000,
          lastProviderEventAt: OCCURRED_AT + 10_000,
          createdAt: OCCURRED_AT,
          updatedAt: OCCURRED_AT,
        },
      ],
      payplusProviderEvents: [
        {
          _id: 'event_existing',
          externalEventId: `payplus:tx:${TRANSACTION_UID}`,
          businessId: BUSINESS_ID,
          transactionUid: TRANSACTION_UID,
          transactionType: 'Charge',
          status: 'processed',
          receivedAt: OCCURRED_AT,
        },
      ],
    });
    await seedCheckout(ctx);
    const duplicate = await applyVerifiedPayPlusEvidenceRecord(
      ctx,
      chargeInput()
    );
    expect(duplicate.duplicate).toBe(true);
    expect(ctx.rows('businessBillingAccounts')[0].plan).toBe('premium');

    const fresh = createMockCtx({ businesses: [business()] });
    expect(
      await applyVerifiedPayPlusEvidenceRecord(fresh, chargeInput())
    ).toEqual({ ok: false, code: 'PAYPLUS_UNKNOWN_TRANSACTION' });
    expect(fresh.rows('businessBillingAccounts')).toHaveLength(0);

    const mismatch = createMockCtx({ businesses: [business()] });
    await seedCheckout(mismatch);
    expect(
      await applyVerifiedPayPlusEvidenceRecord(
        mismatch,
        chargeInput({ currency: 'USD' })
      )
    ).toEqual({ ok: false, code: 'PAYPLUS_CURRENCY_MISMATCH' });
    expect(
      await applyVerifiedPayPlusEvidenceRecord(
        mismatch,
        chargeInput({ amount: 1, transactionUid: 'tx-uid-00000009' })
      )
    ).toEqual({ ok: false, code: 'PAYPLUS_AMOUNT_MISMATCH' });
    expect(
      mismatch.rows('businessBillingAccounts')[0].hasProviderEvidence
    ).toBe(false);

    const ownerChanged = createMockCtx({
      businesses: [business({ ownerUserId: OTHER_ID })],
    });
    await createPayPlusCheckoutRecord(ownerChanged, {
      actorUserId: OTHER_ID,
      businessId: BUSINESS_ID,
      plan: 'starter',
      billingPeriod: 'monthly',
      now: OCCURRED_AT,
      checkoutId: CHECKOUT_ID,
    });
    ownerChanged.rows('businesses')[0].ownerUserId = OWNER_ID;
    expect(
      await applyVerifiedPayPlusEvidenceRecord(ownerChanged, chargeInput())
    ).toEqual({ ok: false, code: 'PAYPLUS_OWNER_MISMATCH' });
  });

  test('cancellation keeps the paid period and refund response parsing drops card data', async () => {
    const periodEnd = OCCURRED_AT + 30 * 86_400_000;
    const ctx = createMockCtx({
      businesses: [business()],
      businessBillingAccounts: [
        {
          _id: 'billing_cancel',
          businessId: BUSINESS_ID,
          ownerUserId: OWNER_ID,
          providerAppUserId: 'ba_cancelpayplus000001',
          plan: 'pro',
          status: 'active',
          billingPeriod: 'yearly',
          provider: 'payplus',
          hasProviderEvidence: true,
          providerSubscriptionIdentifier: RECURRING_UID,
          currentPeriodStartAt: OCCURRED_AT,
          currentPeriodEndAt: periodEnd,
          lastProviderEventAt: OCCURRED_AT,
          createdAt: OCCURRED_AT,
          updatedAt: OCCURRED_AT,
        },
      ],
    });
    const cancelled = await applyPayPlusCancellationRecord(ctx, {
      businessId: BUSINESS_ID,
      now: OCCURRED_AT + 86_400_000,
    });
    expect(cancelled).toMatchObject({
      ok: true,
      duplicate: false,
      eventKind: 'cancellation',
      status: 'canceled',
      periodEndAt: periodEnd,
    });
    const account = ctx.rows('businessBillingAccounts')[0];
    expect(account.currentPeriodEndAt).toBe(periodEnd);
    expect(account.entitlementRevokedAt == null).toBe(true);
    expect(
      hasOperationalAccessFromStatus({
        status: account.status,
        hasProviderEvidence: account.hasProviderEvidence,
        currentPeriodEndAt: account.currentPeriodEndAt,
        gracePeriodEndAt: account.gracePeriodEndAt ?? null,
        entitlementRevokedAt: account.entitlementRevokedAt ?? null,
        now: OCCURRED_AT + 86_400_000,
      })
    ).toBe(true);
    expect(
      await applyPayPlusCancellationRecord(ctx, {
        businessId: BUSINESS_ID,
        now: OCCURRED_AT + 2 * 86_400_000,
      })
    ).toMatchObject({ duplicate: true });

    const parsed = parseRefundResponse({
      results: { status: 'success', code: 0, description: 'ok' },
      data: {
        transaction: {
          uid: 'tx-uid-refund0001',
          status_code: '000',
          amount: 149,
          currency: 'ILS',
          date: '2026-02-01 08:00:00',
          more_info: '',
        },
        data: { card_information: { cvv: CVV_MARKER, token: CARD_MARKER } },
      },
    });
    expect(parsed.ok).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain(CVV_MARKER);
    expect(JSON.stringify(parsed)).not.toContain(CARD_MARKER);

    const redacted = redactPayPlusPayload({
      'secret-key': SECRET,
      card_information: { cvv: CVV_MARKER },
      amount: 149,
    });
    expect(JSON.stringify(redacted)).not.toContain(SECRET);
    expect(JSON.stringify(redacted)).not.toContain(CVV_MARKER);
    expect(redacted.amount).toBe(149);
  });

  test('reconciliation reports differences and payment-method link stays hosted', () => {
    const comparison = comparePayPlusRecurringSnapshot({
      provider: 'payplus',
      recurringUid: RECURRING_UID,
      amount: 2990,
      billingPeriod: 'yearly',
      view: {
        uid: RECURRING_UID,
        currency_code: 'ILS',
        amount: 149,
        number_of_charges: 0,
        recurring_type: 2,
        recurring_range: 12,
        card_token: CARD_MARKER,
      },
    });
    expect(comparison.discrepancies).toContain('amount_mismatch');
    expect(comparison.observations).toContain('valid_flag_undocumented');
    expect(JSON.stringify(comparison.snapshot)).not.toContain(CARD_MARKER);

    expect(
      parseCreditCardRenewalResponse({
        result: { status: 'success', code: 0, description: 'ok' },
        data: {},
      })
    ).toEqual({
      ok: false,
      code: 'PAYPLUS_UPDATE_METHOD_RESPONSE_UNDOCUMENTED',
    });
    expect(
      parseCreditCardRenewalResponse({
        result: { status: 'success', code: 0, description: 'ok' },
        data: {
          payment_page_link: `https://${PAYPLUS_PRODUCTION_API_HOST}/card`,
        },
      }).ok
    ).toBe(false);
    expect(
      parseCreditCardRenewalResponse({
        result: { status: 'success', code: 0, description: 'ok' },
        data: {
          payment_page_link:
            'https://paymentsdev.payplus.co.il/page-request-uid-0001',
        },
      })
    ).toEqual({
      ok: true,
      paymentPageLink:
        'https://paymentsdev.payplus.co.il/page-request-uid-0001',
    });
  });

  test('initial provider failure and unmapped types do not activate', () => {
    const initialFailure = mapVerifiedPayPlusEvidence({
      businessId: BUSINESS_ID,
      plan: 'starter',
      billingPeriod: 'monthly',
      expectedAmount: 149,
      transactionUid: TRANSACTION_UID,
      transactionType: 'Charge',
      statusCode: '004',
      amount: 149,
      currency: 'ILS',
      occurredAt: OCCURRED_AT,
      recurringUid: null,
      transactionIsCancelled: false,
      priorSuccessfulChargeCount: 0,
      currentPlan: null,
      currentPeriod: null,
      existingPeriodStartAt: null,
      existingPeriodEndAt: null,
      now: OCCURRED_AT,
    });
    expect(initialFailure).toEqual({
      ok: false,
      code: 'PAYPLUS_INITIAL_FAILURE_IGNORED',
    });
    const unmapped = mapVerifiedPayPlusEvidence({
      businessId: BUSINESS_ID,
      plan: 'starter',
      billingPeriod: 'monthly',
      expectedAmount: 149,
      transactionUid: TRANSACTION_UID,
      transactionType: 'Approval',
      statusCode: '000',
      amount: 149,
      currency: 'ILS',
      occurredAt: OCCURRED_AT,
      recurringUid: null,
      transactionIsCancelled: false,
      priorSuccessfulChargeCount: 0,
      currentPlan: null,
      currentPeriod: null,
      existingPeriodStartAt: null,
      existingPeriodEndAt: null,
      now: OCCURRED_AT,
    });
    expect(unmapped).toEqual({
      ok: false,
      code: 'PAYPLUS_UNMAPPED_TRANSACTION_TYPE',
    });
  });

  test('a failed new checkout cannot replace an active plan', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    expect((await applyVerifiedPayPlusEvidenceRecord(ctx, chargeInput())).ok).toBe(
      true
    );

    await createPayPlusCheckoutRecord(ctx, {
      actorUserId: OWNER_ID,
      businessId: BUSINESS_ID,
      plan: 'premium',
      billingPeriod: 'yearly',
      now: OCCURRED_AT + 1000,
      checkoutId: 'pp_checkoutintent0002',
    });
    const failure = await applyVerifiedPayPlusEvidenceRecord(
      ctx,
      chargeInput({
        checkoutId: 'pp_checkoutintent0002',
        transactionUid: 'tx-uid-00000099',
        statusCode: '004',
        amount: 4990,
        occurredAt: OCCURRED_AT + 2000,
        now: OCCURRED_AT + 2000,
      })
    );
    expect(failure).toEqual({
      ok: false,
      code: 'PAYPLUS_INITIAL_FAILURE_IGNORED',
    });
    expect(ctx.rows('businessBillingAccounts')[0]).toMatchObject({
      plan: 'starter',
      status: 'active',
    });
    expect(ctx.rows('businesses')[0]).toMatchObject({
      subscriptionPlan: 'starter',
      subscriptionStatus: 'active',
    });
  });

  test('verified settlement still applies after the hosted-link TTL', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    const intent = ctx.rows('payplusCheckoutIntents')[0];
    intent.expiresAt = OCCURRED_AT - 1;
    expect(() =>
      assertPayPlusCheckoutCanHost({
        expiresAt: intent.expiresAt,
        now: OCCURRED_AT,
      })
    ).toThrow('PAYPLUS_CHECKOUT_EXPIRED');

    const applied = await applyVerifiedPayPlusEvidenceRecord(ctx, chargeInput());
    expect(applied).toMatchObject({
      ok: true,
      eventKind: 'initial_payment',
      status: 'active',
    });
  });

  test('replay after the provider row is missing does not apply twice', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    const first = await applyVerifiedPayPlusEvidenceRecord(ctx, chargeInput());
    expect(first.duplicate).toBe(false);
    const event = ctx.rows('payplusProviderEvents')[0];
    event.externalEventId = 'payplus:tx:removed-from-index';

    const replay = await applyVerifiedPayPlusEvidenceRecord(ctx, chargeInput());
    expect(replay).toMatchObject({ ok: true, duplicate: true });
    expect(
      ctx
        .rows('payplusProviderEvents')
        .filter(
          (row) => row.externalEventId === `payplus:tx:${TRANSACTION_UID}`
        )
    ).toHaveLength(0);
    expect(ctx.rows('businessBillingAccounts')[0]).toMatchObject({
      plan: 'starter',
      status: 'active',
      lastProviderEventId: `payplus:tx:${TRANSACTION_UID}`,
    });
  });

  test('a refund response that echoes the charge uid is not applied', () => {
    expect(
      payPlusRefundEvidenceCanApply({
        chargeTransactionUid: TRANSACTION_UID,
        refundTransactionUid: TRANSACTION_UID,
      })
    ).toBe(false);
    expect(
      payPlusRefundEvidenceCanApply({
        chargeTransactionUid: TRANSACTION_UID,
        refundTransactionUid: 'tx-uid-refund0001',
      })
    ).toBe(true);
  });
});
