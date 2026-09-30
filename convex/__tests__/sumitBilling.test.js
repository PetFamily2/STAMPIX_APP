import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mapRevenueCatToCanonicalEvent } from '../lib/billing/canonicalEvent';
import { hasOperationalAccessFromStatus } from '../lib/billing/lifecycle';
import { DIRECT_PROVIDER_RENEWAL_GRACE_MS } from '../lib/billing/productionContract';
import {
  buildSumitCheckoutDraft,
  buildSumitHostedCheckoutUrl,
  canonicalSumitAmount,
} from '../lib/billing/sumit/checkout';
import {
  assertServerOnlySumitEnvNames,
  assertSumitApiConfigured,
  publicSumitConfigStatus,
  resolveSumitConfig,
  SUMIT_SERVER_ENV_NAMES,
} from '../lib/billing/sumit/config';
import {
  compareSumitRecurringSnapshot,
  fetchSumitPayment,
  fetchSumitPayments,
  fetchSumitRecurringItems,
  sumitJsonRequest,
} from '../lib/billing/sumit/providerClient';
import {
  normalizeSumitRecurringStatus,
  parseSumitDocumentResponse,
  parseSumitRecurringListResponse,
  redactSumitPayload,
  verifySumitCancellationEvidence,
  verifySumitPaymentEvidence,
  verifySumitRefundEvidence,
} from '../lib/billing/sumit/verify';
import { runRegisteredHandler } from '../lib/runRegisteredHandler';
import {
  applySUMITCancellationRecord,
  applyVerifiedSUMITPaymentRecord,
  applyVerifiedSUMITRefundRecord,
  createSUMITCheckout,
  createSUMITCheckoutRecord,
  reconcileSUMITBilling,
  reconcileSUMITBillingInternal,
  refundSUMITPayment,
  resolveSUMITSubscriptionCheckout,
  verifyAndApplyPayment,
} from '../sumitBilling';

const BUSINESS_ID = 'business_sumit_owner_001';
const OWNER_ID = 'user_sumit_owner_001';
const OTHER_ID = 'user_sumit_other_001';
const CHECKOUT_ID = 'su_checkoutintent000001';
const PAYMENT_ID = '41001';
const CUSTOMER_ID = '51001';
const RECURRING_ID = '61001';
const DOCUMENT_ID = '71001';
const PRODUCT_ID = 'stampaix-starter-monthly';
const OCCURRED_AT = Date.parse('2026-01-15T10:00:00Z');

function createMockCtx(initial = {}) {
  const tableNames = [
    'businesses',
    'users',
    'businessBillingAccounts',
    'businessPaidServicePeriods',
    'businessReferralRelationships',
    'businessReferralRewards',
    'sumitCheckoutIntents',
    'sumitProviderEvents',
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
        const buildResult = (filters = [], direction = 'asc') => {
          const filtered = rows(tableName)
            .filter((row) =>
              filters.every(([field, value]) => row[field] === value)
            )
            .sort((left, right) => {
              const difference = (left.createdAt ?? 0) - (right.createdAt ?? 0);
              return direction === 'desc' ? -difference : difference;
            });
          return {
            collect: async () => filtered,
            take: async (count) => filtered.slice(0, count),
            first: async () => filtered[0] ?? null,
            order: (nextDirection) => buildResult(filters, nextDirection),
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

function billingAccount(overrides = {}) {
  return {
    _id: 'billing_sumit_owner_001',
    businessId: BUSINESS_ID,
    ownerUserId: OWNER_ID,
    providerAppUserId: 'ba_sumit_owner_001',
    plan: 'starter',
    lastPlan: 'starter',
    status: 'active',
    billingPeriod: 'monthly',
    provider: 'sumit',
    providerSubscriptionIdentifier: RECURRING_ID,
    currentPeriodStartAt: OCCURRED_AT,
    currentPeriodEndAt: Date.parse('2026-02-15T10:00:00Z'),
    gracePeriodEndAt: null,
    canceledAt: null,
    entitlementRevokedAt: null,
    hasProviderEvidence: true,
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
    ...overrides,
  };
}

function products() {
  return Object.fromEntries(
    [
      'starter_monthly',
      'starter_yearly',
      'pro_monthly',
      'pro_yearly',
      'premium_monthly',
      'premium_yearly',
    ].map((logicalProductId) => [
      logicalProductId,
      {
        hostedUrl: `https://app.sumit.co.il/p/${logicalProductId}`,
        productId: `stampaix-${logicalProductId.replace('_', '-')}`,
      },
    ])
  );
}

function sumitEnv(overrides = {}) {
  return {
    SUMIT_ENV: 'test',
    SUMIT_COMPANY_ID: '12345678',
    SUMIT_API_KEY: 'test-sumit-api-key',
    SUMIT_WEB_ORIGIN: 'http://localhost:8081',
    SUMIT_PRODUCTS_JSON: JSON.stringify(products()),
    ...overrides,
  };
}

function payment(overrides = {}) {
  return {
    paymentId: PAYMENT_ID,
    customerId: CUSTOMER_ID,
    occurredAt: OCCURRED_AT,
    validPayment: true,
    status: 'Charged',
    amount: 149,
    currency: 'ILS',
    recurringIds: [RECURRING_ID],
    externalIdentifier: CHECKOUT_ID,
    documentId: DOCUMENT_ID,
    ...overrides,
  };
}

function recurringItem(overrides = {}) {
  return {
    recurringId: RECURRING_ID,
    providerProductId: PRODUCT_ID,
    quantity: 1,
    unitPrice: 149,
    currency: 'ILS',
    durationMonths: 1,
    status: 'Active',
    dateStartAt: OCCURRED_AT,
    dateLastAt: OCCURRED_AT,
    dateNextBillingAt: Date.parse('2026-02-15T10:00:00Z'),
    ...overrides,
  };
}

function paymentResponse(overrides = {}) {
  const normalized = payment(overrides);
  return {
    Status: 'Success (0)',
    Data: {
      Payment: {
        ID: Number(normalized.paymentId),
        CustomerID: Number(normalized.customerId),
        Date: new Date(normalized.occurredAt).toISOString(),
        ValidPayment: normalized.validPayment,
        Status: normalized.status,
        Amount: normalized.amount,
        Currency: 'ILS (0)',
        RecurringCustomerItemIDs: normalized.recurringIds.map(Number),
        ExternalIdentifier: normalized.externalIdentifier,
        DocumentID: Number(normalized.documentId),
        PaymentMethod: {
          CardNumber: '4580458045804580',
          CVV: '123',
        },
      },
    },
  };
}

function recurringResponse(overrides = {}) {
  const item = recurringItem(overrides);
  const statusCodes = {
    Active: 0,
    Cancelled: 1,
    DisabledFailedBillingPayment: 3,
    FinishedExpired: 9,
    GracePeriod: 11,
    PendingForFirstPayment: 12,
    CancelledByCustomer: 13,
    PendingRetry: 14,
  };
  return {
    Status: 'Success (0)',
    Data: {
      RecurringItems: [
        {
          ID: Number(item.recurringId),
          Item: {
            ID: 9001,
            ExternalIdentifier: item.providerProductId,
            Currency: 'ILS (0)',
            Duration_Months: item.durationMonths,
          },
          Quantity: item.quantity,
          UnitPrice: item.unitPrice,
          Status: overrides.statusValue ?? statusCodes[item.status],
          Date_Start: new Date(item.dateStartAt).toISOString(),
          Date_Last: new Date(item.dateLastAt).toISOString(),
          Date_NextBilling: new Date(item.dateNextBillingAt).toISOString(),
        },
      ],
    },
  };
}

async function seedCheckout(ctx, overrides = {}) {
  return await createSUMITCheckoutRecord(ctx, {
    actorUserId: OWNER_ID,
    businessId: BUSINESS_ID,
    plan: 'starter',
    billingPeriod: 'monthly',
    now: OCCURRED_AT,
    checkoutId: CHECKOUT_ID,
    ...overrides,
  });
}

async function seedHistoricalCheckoutIntent(ctx, overrides = {}) {
  const draft = buildSumitCheckoutDraft({
    checkoutId: overrides.checkoutId ?? CHECKOUT_ID,
    businessId: BUSINESS_ID,
    ownerUserId: OWNER_ID,
    actorUserId: OWNER_ID,
    businessActive: true,
    plan: overrides.plan ?? 'starter',
    billingPeriod: overrides.billingPeriod ?? 'monthly',
    now: overrides.now ?? OCCURRED_AT,
  });
  return await ctx.db.insert('sumitCheckoutIntents', draft);
}

function verifiedPaymentArgs(overrides = {}) {
  return {
    checkoutId: CHECKOUT_ID,
    paymentId: PAYMENT_ID,
    customerId: CUSTOMER_ID,
    validPayment: true,
    amount: 149,
    currency: 'ILS',
    occurredAt: OCCURRED_AT,
    recurringId: RECURRING_ID,
    providerProductId: PRODUCT_ID,
    providerEnvironment: 'test',
    documentId: DOCUMENT_ID,
    documentNumber: '10001',
    documentType: 'InvoiceAndReceipt (1)',
    documentUrl: 'https://app.sumit.co.il/documents/71001',
    now: OCCURRED_AT,
    ...overrides,
  };
}

describe('SUMIT server authority and hosted checkout', () => {
  test('canonical price always comes from the frozen server contract', async () => {
    expect(canonicalSumitAmount('starter', 'monthly')).toBe(149);
    expect(canonicalSumitAmount('starter', 'yearly')).toBe(1490);
    expect(canonicalSumitAmount('pro', 'monthly')).toBe(299);
    expect(canonicalSumitAmount('pro', 'yearly')).toBe(2990);
    expect(canonicalSumitAmount('premium', 'monthly')).toBe(499);
    expect(canonicalSumitAmount('premium', 'yearly')).toBe(4990);

    const ctx = createMockCtx({ businesses: [business()] });
    const draft = await seedCheckout(ctx);
    expect(draft.amount).toBe(149);
    expect(draft.currency).toBe('ILS');
  });

  test.each([
    ['active', {}],
    ['trialing', { status: 'trialing' }],
    [
      'past_due in grace',
      {
        status: 'past_due',
        gracePeriodEndAt: OCCURRED_AT + 60_000,
      },
    ],
    [
      'canceled in paid period',
      {
        status: 'canceled',
        canceledAt: OCCURRED_AT - 1,
        currentPeriodEndAt: OCCURRED_AT + 60_000,
      },
    ],
  ])('server rejects a second recurring checkout for %s access', async (_label, overrides) => {
    const ctx = createMockCtx({
      businesses: [business()],
      businessBillingAccounts: [billingAccount(overrides)],
    });

    await expect(seedCheckout(ctx)).rejects.toThrow(
      'SUMIT_ACTIVE_SUBSCRIPTION_EXISTS'
    );
    expect(ctx.rows('sumitCheckoutIntents')).toHaveLength(0);
  });

  test('direct public action call returns the stable active-subscription code', async () => {
    const recordCtx = createMockCtx({
      businesses: [business()],
      businessBillingAccounts: [billingAccount()],
    });
    const result = await runRegisteredHandler(
      createSUMITCheckout,
      {
        runMutation: async () =>
          await createSUMITCheckoutRecord(recordCtx, {
            actorUserId: OWNER_ID,
            businessId: BUSINESS_ID,
            plan: 'premium',
            billingPeriod: 'yearly',
            now: OCCURRED_AT,
          }),
      },
      {
        businessId: BUSINESS_ID,
        plan: 'premium',
        billingPeriod: 'yearly',
      }
    );

    expect(result).toEqual({
      ok: false,
      hosted: false,
      code: 'SUMIT_ACTIVE_SUBSCRIPTION_EXISTS',
    });
    expect(recordCtx.rows('sumitCheckoutIntents')).toHaveLength(0);
  });

  test('expired grace or paid periods do not block a new checkout', async () => {
    for (const account of [
      billingAccount({
        status: 'past_due',
        gracePeriodEndAt: OCCURRED_AT,
      }),
      billingAccount({
        status: 'canceled',
        currentPeriodEndAt: OCCURRED_AT,
      }),
    ]) {
      const ctx = createMockCtx({
        businesses: [business()],
        businessBillingAccounts: [account],
      });
      await expect(seedCheckout(ctx)).resolves.toMatchObject({
        status: 'pending',
      });
    }
  });

  test('a wrong browser amount cannot change the authoritative amount', () => {
    expect(() =>
      buildSumitCheckoutDraft({
        checkoutId: CHECKOUT_ID,
        businessId: BUSINESS_ID,
        ownerUserId: OWNER_ID,
        actorUserId: OWNER_ID,
        businessActive: true,
        plan: 'starter',
        billingPeriod: 'monthly',
        browserAmount: 1,
        now: OCCURRED_AT,
      })
    ).toThrow('SUMIT_AMOUNT_NOT_AUTHORITATIVE');
  });

  test('a wrong browser currency fails closed', () => {
    expect(() =>
      buildSumitCheckoutDraft({
        checkoutId: CHECKOUT_ID,
        businessId: BUSINESS_ID,
        ownerUserId: OWNER_ID,
        actorUserId: OWNER_ID,
        businessActive: true,
        plan: 'starter',
        billingPeriod: 'monthly',
        browserCurrency: 'USD',
        now: OCCURRED_AT,
      })
    ).toThrow('SUMIT_CURRENCY_NOT_AUTHORITATIVE');
  });

  test('browser success and hosted URL construction grant no entitlement', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    const intent = await seedCheckout(ctx);
    const hosted = buildSumitHostedCheckoutUrl({
      hostedUrl: 'https://app.sumit.co.il/p/starter-monthly',
      checkoutId: intent.checkoutId,
      amount: intent.amount,
    });
    expect(hosted).toContain('externalidentifier=su_checkoutintent000001');
    expect(hosted).toContain('fixedprice=149');
    expect(ctx.rows('businesses')[0].subscriptionStatus).toBe('inactive');
    expect(ctx.rows('sumitProviderEvents')).toHaveLength(0);

    const checkoutArgs = JSON.parse(createSUMITCheckout.exportArgs());
    expect(checkoutArgs.args).not.toHaveProperty('amount');
    expect(checkoutArgs.args).not.toHaveProperty('currency');
  });

  test('configuration is server-only, explicit, and incomplete config is disabled', () => {
    expect(() => assertServerOnlySumitEnvNames()).not.toThrow();
    expect(
      SUMIT_SERVER_ENV_NAMES.every(
        (name) => !name.startsWith('EXPO_PUBLIC_SUMIT_')
      )
    ).toBe(true);
    expect(publicSumitConfigStatus(resolveSumitConfig({}))).toEqual({
      environment: null,
      liveApiEnabled: false,
      liveCheckoutEnabled: false,
      missingApi: ['SUMIT_ENV', 'SUMIT_COMPANY_ID', 'SUMIT_API_KEY'],
      missingCheckout: expect.arrayContaining([
        'SUMIT_ENV',
        'SUMIT_COMPANY_ID',
        'SUMIT_API_KEY',
        'SUMIT_WEB_ORIGIN',
      ]),
    });
    expect(
      publicSumitConfigStatus(resolveSumitConfig(sumitEnv()))
    ).toMatchObject({
      environment: 'test',
      liveApiEnabled: true,
      liveCheckoutEnabled: true,
    });
  });

  test('provider access requires test environment and rejects production', async () => {
    let calls = 0;
    const transport = async () => {
      calls += 1;
      return { status: 200, text: JSON.stringify(paymentResponse()) };
    };
    await expect(
      sumitJsonRequest({
        config: resolveSumitConfig(sumitEnv({ SUMIT_ENV: undefined })),
        path: 'billing/payments/get/',
        body: { PaymentID: 41001 },
        transport,
      })
    ).rejects.toThrow('SUMIT_CONFIG_MISSING');
    expect(calls).toBe(0);

    expect(() =>
      resolveSumitConfig(sumitEnv({ SUMIT_ENV: 'sandbox' }))
    ).toThrow('SUMIT_ENV_INVALID');

    const production = resolveSumitConfig(
      sumitEnv({ SUMIT_ENV: 'production' })
    );
    expect(production.liveApiEnabled).toBe(false);
    expect(production.liveCheckoutEnabled).toBe(false);
    expect(() => assertSumitApiConfigured(production)).toThrow(
      'SUMIT_PRODUCTION_NOT_ENABLED'
    );
    await expect(
      sumitJsonRequest({
        config: production,
        path: 'billing/payments/get/',
        body: { PaymentID: 41001 },
        transport,
      })
    ).rejects.toThrow('SUMIT_PRODUCTION_NOT_ENABLED');
    expect(calls).toBe(0);
    expect(
      await verifyAndApplyPayment(
        {},
        {
          config: production,
          context: {},
          payment: payment(),
        }
      )
    ).toEqual({
      ok: false,
      code: 'SUMIT_PRODUCTION_NOT_ENABLED',
      missing: [],
    });

    expect(() =>
      assertSumitApiConfigured(resolveSumitConfig(sumitEnv()))
    ).not.toThrow();
  });

  test('provider transport is mocked and credentials stay in the server request', async () => {
    const config = resolveSumitConfig(sumitEnv());
    let captured;
    const response = await sumitJsonRequest({
      config,
      path: 'billing/payments/get/',
      body: { PaymentID: 41001 },
      transport: async (url, init) => {
        captured = { url, init };
        return { status: 200, text: JSON.stringify(paymentResponse()) };
      },
    });
    expect(response).toEqual(paymentResponse());
    expect(captured.url).toBe('https://api.sumit.co.il/billing/payments/get/');
    const request = JSON.parse(captured.init.body);
    expect(request.Credentials.CompanyID).toBe(12345678);
    expect(request.Credentials.APIKey).toBe('test-sumit-api-key');
  });
});

describe('SUMIT server-to-server verification', () => {
  test('official payment and recurring response shapes verify together', async () => {
    const config = resolveSumitConfig(sumitEnv());
    const transport = async (url) => ({
      status: 200,
      text: JSON.stringify(
        url.includes('listforcustomer')
          ? recurringResponse()
          : paymentResponse()
      ),
    });
    const providerPayment = await fetchSumitPayment({
      config,
      paymentId: PAYMENT_ID,
      transport,
    });
    const recurringItems = await fetchSumitRecurringItems({
      config,
      customerId: CUSTOMER_ID,
      transport,
    });
    const verified = verifySumitPaymentEvidence({
      payment: providerPayment,
      intent: {
        checkoutId: CHECKOUT_ID,
        amount: 149,
        billingPeriod: 'monthly',
      },
      expectedProductId: PRODUCT_ID,
      recurringItems,
    });
    expect(verified.ok).toBe(true);
    expect(verified.evidence.recurringId).toBe(RECURRING_ID);
  });

  test('documented numeric recurring statuses normalize and unknown values fail closed', () => {
    const statuses = [
      [0, 'Active'],
      [1, 'Cancelled'],
      [3, 'DisabledFailedBillingPayment'],
      [9, 'FinishedExpired'],
      [11, 'GracePeriod'],
      [12, 'PendingForFirstPayment'],
      [13, 'CancelledByCustomer'],
      [14, 'PendingRetry'],
    ];
    for (const [code, status] of statuses) {
      expect(normalizeSumitRecurringStatus(code)).toBe(status);
      expect(normalizeSumitRecurringStatus(String(code))).toBe(status);
      expect(normalizeSumitRecurringStatus(status)).toBe(status);
      expect(normalizeSumitRecurringStatus(`${status} (${code})`)).toBe(status);
      expect(
        parseSumitRecurringListResponse(
          recurringResponse({ status, statusValue: code })
        )?.[0].status
      ).toBe(status);
    }
    expect(normalizeSumitRecurringStatus(2)).toBeNull();
    expect(normalizeSumitRecurringStatus('Paused')).toBeNull();
    expect(normalizeSumitRecurringStatus('Active (13)')).toBeNull();
    expect(
      parseSumitRecurringListResponse(recurringResponse({ statusValue: 404 }))
    ).toBeNull();
  });

  test('numeric cancellation states are accepted and only numeric Active grants initially', () => {
    for (const statusValue of [1, 13]) {
      const parsed = parseSumitRecurringListResponse(
        recurringResponse({ statusValue })
      );
      expect(
        verifySumitCancellationEvidence({
          recurringId: RECURRING_ID,
          recurringItems: parsed,
        })
      ).toBe(true);
    }
    const active = parseSumitRecurringListResponse(
      recurringResponse({ statusValue: 0 })
    );
    expect(
      verifySumitPaymentEvidence({
        payment: payment(),
        intent: {
          checkoutId: CHECKOUT_ID,
          amount: 149,
          billingPeriod: 'monthly',
        },
        expectedProductId: PRODUCT_ID,
        recurringItems: active,
      }).ok
    ).toBe(true);
    for (const statusValue of [1, 3, 9, 11, 12, 13, 14]) {
      const recurringItems = parseSumitRecurringListResponse(
        recurringResponse({ statusValue })
      );
      expect(
        verifySumitPaymentEvidence({
          payment: payment(),
          intent: {
            checkoutId: CHECKOUT_ID,
            amount: 149,
            billingPeriod: 'monthly',
          },
          expectedProductId: PRODUCT_ID,
          recurringItems,
        })
      ).toEqual({ ok: false, code: 'SUMIT_RECURRING_NOT_ACTIVE' });
    }
  });

  test('reconciliation classifies every documented recurring status', () => {
    const expected = new Map([
      ['Active', { discrepancies: [], observations: [] }],
      [
        'Cancelled',
        { discrepancies: ['provider_cancelled'], observations: [] },
      ],
      [
        'DisabledFailedBillingPayment',
        { discrepancies: ['provider_billing_disabled'], observations: [] },
      ],
      [
        'FinishedExpired',
        { discrepancies: ['provider_finished_expired'], observations: [] },
      ],
      [
        'GracePeriod',
        { discrepancies: [], observations: ['provider_grace_period'] },
      ],
      [
        'PendingForFirstPayment',
        { discrepancies: ['provider_pending_first_payment'], observations: [] },
      ],
      [
        'CancelledByCustomer',
        { discrepancies: ['provider_cancelled_by_customer'], observations: [] },
      ],
      [
        'PendingRetry',
        { discrepancies: [], observations: ['provider_retry_pending'] },
      ],
    ]);
    for (const [status, classification] of expected) {
      const result = compareSumitRecurringSnapshot({
        provider: 'sumit',
        recurringId: RECURRING_ID,
        plan: 'starter',
        billingPeriod: 'monthly',
        expectedProductId: PRODUCT_ID,
        items: [recurringItem({ status })],
      });
      expect(result.discrepancies).toEqual(classification.discrepancies);
      expect(result.observations).toEqual(classification.observations);
    }
  });

  test('payment listing follows bounded StartIndex pagination', async () => {
    const starts = [];
    const pages = [
      {
        payments: [paymentResponse().Data.Payment],
        hasNextPage: true,
      },
      {
        payments: [
          paymentResponse({
            paymentId: '41002',
            occurredAt: OCCURRED_AT + 1000,
          }).Data.Payment,
        ],
        hasNextPage: false,
      },
    ];
    const result = await fetchSumitPayments({
      config: resolveSumitConfig(sumitEnv()),
      dateFrom: OCCURRED_AT - 1000,
      dateTo: OCCURRED_AT + 2000,
      transport: async (_url, init) => {
        starts.push(JSON.parse(init.body).StartIndex);
        const page = pages.shift();
        return {
          status: 200,
          text: JSON.stringify({
            Status: 'Success (0)',
            Data: {
              Payments: page.payments,
              HasNextPage: page.hasNextPage,
            },
          }),
        };
      },
    });
    expect(starts).toEqual([0, 1]);
    expect(result.map((item) => item.paymentId)).toEqual(['41001', '41002']);

    await expect(
      fetchSumitPayments({
        config: resolveSumitConfig(sumitEnv()),
        dateFrom: OCCURRED_AT,
        dateTo: OCCURRED_AT + 1,
        transport: async () => ({
          status: 200,
          text: JSON.stringify({
            Status: 'Success (0)',
            Data: { Payments: [], HasNextPage: true },
          }),
        }),
      })
    ).rejects.toThrow('SUMIT_PAYMENT_PAGINATION_INVALID');
  });

  test('wrong provider amount, currency, reference, product, or schedule fails', () => {
    const base = {
      intent: {
        checkoutId: CHECKOUT_ID,
        amount: 149,
        billingPeriod: 'monthly',
      },
      expectedProductId: PRODUCT_ID,
      recurringItems: [recurringItem()],
    };
    expect(
      verifySumitPaymentEvidence({ ...base, payment: payment({ amount: 1 }) })
    ).toEqual({ ok: false, code: 'SUMIT_AMOUNT_MISMATCH' });
    expect(
      verifySumitPaymentEvidence({
        ...base,
        payment: payment({ currency: 'USD' }),
      })
    ).toEqual({ ok: false, code: 'SUMIT_CURRENCY_MISMATCH' });
    expect(
      verifySumitPaymentEvidence({
        ...base,
        payment: payment({ externalIdentifier: 'su_wrong_reference_001' }),
      })
    ).toEqual({ ok: false, code: 'SUMIT_REFERENCE_MISMATCH' });
    expect(
      verifySumitPaymentEvidence({
        ...base,
        payment: payment(),
        recurringItems: [recurringItem({ providerProductId: 'wrong' })],
      })
    ).toEqual({ ok: false, code: 'SUMIT_PRODUCT_MISMATCH' });
    expect(
      verifySumitPaymentEvidence({
        ...base,
        payment: payment(),
        recurringItems: [recurringItem({ durationMonths: 12 })],
      })
    ).toEqual({ ok: false, code: 'SUMIT_RECURRING_SCHEDULE_MISMATCH' });
  });

  test('yearly is one full-price charge on a twelve-month recurring interval', () => {
    const verified = verifySumitPaymentEvidence({
      payment: payment({ amount: 1490 }),
      intent: {
        checkoutId: CHECKOUT_ID,
        amount: 1490,
        billingPeriod: 'yearly',
      },
      expectedProductId: 'stampaix-starter-yearly',
      recurringItems: [
        recurringItem({
          providerProductId: 'stampaix-starter-yearly',
          unitPrice: 1490,
          durationMonths: 12,
        }),
      ],
    });
    expect(verified.ok).toBe(true);
  });

  test('cancellation evidence must show the target recurring item canceled', () => {
    expect(
      verifySumitCancellationEvidence({
        recurringId: RECURRING_ID,
        recurringItems: [recurringItem()],
      })
    ).toBe(false);
    expect(
      verifySumitCancellationEvidence({
        recurringId: RECURRING_ID,
        recurringItems: [recurringItem({ status: 'Cancelled' })],
      })
    ).toBe(true);
  });

  test('safe document metadata is retained without provider payment method data', () => {
    const metadata = parseSumitDocumentResponse(
      {
        Status: 'Success (0)',
        Data: {
          DocumentID: 71001,
          DocumentNumber: 10001,
          DocumentDownloadURL: 'https://app.sumit.co.il/documents/71001',
          Document: { Type: 'InvoiceAndReceipt (1)' },
        },
      },
      DOCUMENT_ID
    );
    expect(metadata).toEqual({
      documentId: DOCUMENT_ID,
      documentNumber: '10001',
      documentType: 'InvoiceAndReceipt (1)',
      documentUrl: 'https://app.sumit.co.il/documents/71001',
    });
    const redacted = JSON.stringify(redactSumitPayload(paymentResponse()));
    expect(redacted).not.toContain('4580458045804580');
    expect(redacted).not.toContain('CVV');
  });

  test('document metadata failure does not block otherwise verified paid access', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    const context = await seedCheckout(ctx);
    ctx.runMutation = async (_reference, mutationArgs) =>
      await applyVerifiedSUMITPaymentRecord(ctx, mutationArgs);
    const result = await verifyAndApplyPayment(ctx, {
      config: resolveSumitConfig(sumitEnv()),
      context,
      payment: payment(),
      recurringItems: [recurringItem()],
      documentTransport: async () => {
        throw new Error('temporary document outage');
      },
    });
    expect(result).toMatchObject({ ok: true, status: 'active' });
    expect(ctx.rows('businessBillingAccounts')[0]).toMatchObject({
      status: 'active',
      providerEnvironment: 'test',
    });
    expect(ctx.rows('sumitProviderEvents')[0]).toMatchObject({
      sumitDocumentId: DOCUMENT_ID,
    });
    expect(ctx.rows('sumitProviderEvents')[0].documentNumber).toBeUndefined();
    expect(ctx.rows('sumitProviderEvents')[0].documentType).toBeUndefined();
    expect(ctx.rows('sumitProviderEvents')[0].documentUrl).toBeUndefined();

    const invalidCtx = createMockCtx({ businesses: [business()] });
    const invalidContext = await seedCheckout(invalidCtx);
    let documentCalls = 0;
    invalidCtx.runMutation = async (_reference, mutationArgs) =>
      await applyVerifiedSUMITPaymentRecord(invalidCtx, mutationArgs);
    const invalid = await verifyAndApplyPayment(invalidCtx, {
      config: resolveSumitConfig(sumitEnv()),
      context: invalidContext,
      payment: payment(),
      recurringItems: [recurringItem({ providerProductId: 'wrong-product' })],
      documentTransport: async () => {
        documentCalls += 1;
        return { status: 500, text: '' };
      },
    });
    expect(invalid).toEqual({ ok: false, code: 'SUMIT_PRODUCT_MISMATCH' });
    expect(documentCalls).toBe(0);
    expect(invalidCtx.rows('businesses')[0].subscriptionStatus).toBe(
      'inactive'
    );
  });
});

describe('SUMIT canonical application and lifecycle', () => {
  test('unknown checkout fails without granting access', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    const result = await applyVerifiedSUMITPaymentRecord(
      ctx,
      verifiedPaymentArgs()
    );
    expect(result).toEqual({ ok: false, code: 'SUMIT_UNKNOWN_CHECKOUT' });
    expect(ctx.rows('businesses')[0].subscriptionStatus).toBe('inactive');
  });

  test('wrong actor and changed owner both fail', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await expect(
      createSUMITCheckoutRecord(ctx, {
        actorUserId: OTHER_ID,
        businessId: BUSINESS_ID,
        plan: 'starter',
        billingPeriod: 'monthly',
        now: OCCURRED_AT,
        checkoutId: CHECKOUT_ID,
      })
    ).rejects.toThrow('NOT_AUTHORIZED');

    await seedCheckout(ctx);
    ctx.rows('businesses')[0].ownerUserId = OTHER_ID;
    const result = await applyVerifiedSUMITPaymentRecord(
      ctx,
      verifiedPaymentArgs()
    );
    expect(result).toEqual({ ok: false, code: 'SUMIT_OWNER_MISMATCH' });
  });

  test('verified success creates a canonical active event exactly once', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    const first = await applyVerifiedSUMITPaymentRecord(
      ctx,
      verifiedPaymentArgs()
    );
    expect(first).toMatchObject({
      ok: true,
      duplicate: false,
      eventKind: 'initial_payment',
      status: 'active',
    });
    expect(ctx.rows('businesses')[0].subscriptionStatus).toBe('active');
    expect(ctx.rows('businessBillingAccounts')[0]).toMatchObject({
      provider: 'sumit',
      providerEnvironment: 'test',
      providerSubscriptionIdentifier: RECURRING_ID,
      plan: 'starter',
      status: 'active',
    });
    expect(ctx.rows('sumitProviderEvents')).toHaveLength(1);

    const duplicate = await applyVerifiedSUMITPaymentRecord(
      ctx,
      verifiedPaymentArgs()
    );
    expect(duplicate).toMatchObject({ ok: true, duplicate: true });
    expect(ctx.rows('sumitProviderEvents')).toHaveLength(1);
  });

  test('failed initial payment does not damage an existing active subscription', async () => {
    const ctx = createMockCtx({
      businesses: [business({ subscriptionStatus: 'active' })],
      businessBillingAccounts: [
        {
          _id: 'billing_1',
          businessId: BUSINESS_ID,
          ownerUserId: OWNER_ID,
          providerAppUserId: 'ba_sumit_existing_001',
          plan: 'pro',
          lastPlan: 'pro',
          status: 'active',
          billingPeriod: 'monthly',
          provider: 'revenuecat',
          providerSubscriptionIdentifier: 'rc_existing',
          currentPeriodStartAt: OCCURRED_AT,
          currentPeriodEndAt: Date.parse('2026-02-15T10:00:00Z'),
          hasProviderEvidence: true,
          createdAt: OCCURRED_AT,
          updatedAt: OCCURRED_AT,
        },
      ],
    });
    await seedHistoricalCheckoutIntent(ctx);
    const result = await applyVerifiedSUMITPaymentRecord(
      ctx,
      verifiedPaymentArgs({ validPayment: false, recurringId: null })
    );
    expect(result).toEqual({
      ok: false,
      code: 'SUMIT_INITIAL_FAILURE_IGNORED',
    });
    expect(ctx.rows('businessBillingAccounts')[0]).toMatchObject({
      provider: 'revenuecat',
      plan: 'pro',
      status: 'active',
    });
  });

  test('a slightly late renewal stays anchored to the canonical schedule', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    await applyVerifiedSUMITPaymentRecord(ctx, verifiedPaymentArgs());
    const firstEnd = ctx.rows('businessBillingAccounts')[0].currentPeriodEndAt;
    const renewal = await applyVerifiedSUMITPaymentRecord(
      ctx,
      verifiedPaymentArgs({
        paymentId: '41002',
        occurredAt: firstEnd + 24 * 60 * 60 * 1000,
        documentId: '71002',
      })
    );
    expect(renewal).toMatchObject({
      ok: true,
      eventKind: 'renewal',
      status: 'active',
    });
    expect(ctx.rows('businessBillingAccounts')[0].currentPeriodStartAt).toBe(
      firstEnd
    );
    expect(ctx.rows('businessBillingAccounts')[0].currentPeriodEndAt).toBe(
      Date.parse('2026-03-15T10:00:00Z')
    );
    expect(
      ctx
        .rows('sumitProviderEvents')
        .filter((event) => event.eventType === 'payment_succeeded')
    ).toHaveLength(2);
  });

  test('an unrelated failed checkout cannot mark the active plan past_due', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    await applyVerifiedSUMITPaymentRecord(ctx, verifiedPaymentArgs());
    await seedHistoricalCheckoutIntent(ctx, {
      plan: 'pro',
      billingPeriod: 'monthly',
      now: OCCURRED_AT + 1000,
      checkoutId: 'su_secondcheckout00001',
    });
    const account = ctx.rows('businessBillingAccounts')[0];
    const selectedWhileProPending = await resolveSUMITSubscriptionCheckout(
      ctx,
      { businessId: BUSINESS_ID, account }
    );
    expect(selectedWhileProPending).toMatchObject({
      checkoutId: CHECKOUT_ID,
      plan: 'starter',
      sumitRecurringId: RECURRING_ID,
    });
    const failed = await applyVerifiedSUMITPaymentRecord(ctx, {
      ...verifiedPaymentArgs({
        checkoutId: 'su_secondcheckout00001',
        paymentId: '41003',
        validPayment: false,
        amount: 299,
        recurringId: '61099',
        providerProductId: 'stampaix-pro-monthly',
      }),
    });
    expect(failed).toEqual({
      ok: false,
      code: 'SUMIT_UNRELATED_FAILURE_IGNORED',
    });
    expect(ctx.rows('businessBillingAccounts')[0]).toMatchObject({
      plan: 'starter',
      status: 'active',
      providerSubscriptionIdentifier: RECURRING_ID,
    });
    const selectedAfterProRejected = await resolveSUMITSubscriptionCheckout(
      ctx,
      {
        businessId: BUSINESS_ID,
        account: ctx.rows('businessBillingAccounts')[0],
      }
    );
    expect(selectedAfterProRejected.checkoutId).toBe(CHECKOUT_ID);

    const canceled = await applySUMITCancellationRecord(ctx, {
      businessId: BUSINESS_ID,
      now: OCCURRED_AT + 2000,
    });
    expect(canceled).toMatchObject({ ok: true, status: 'canceled' });
    expect(ctx.rows('businessBillingAccounts')[0]).toMatchObject({
      plan: 'starter',
      providerSubscriptionIdentifier: RECURRING_ID,
    });
  });

  test('verified failed renewal becomes past_due and recovery becomes active', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    await applyVerifiedSUMITPaymentRecord(ctx, verifiedPaymentArgs());
    const renewalAt = ctx.rows('businessBillingAccounts')[0].currentPeriodEndAt;
    const failed = await applyVerifiedSUMITPaymentRecord(
      ctx,
      verifiedPaymentArgs({
        paymentId: '41004',
        validPayment: false,
        occurredAt: renewalAt,
      })
    );
    expect(failed).toMatchObject({
      ok: true,
      eventKind: 'billing_issue',
      status: 'past_due',
    });
    const pastDue = ctx.rows('businessBillingAccounts')[0];
    expect(pastDue.status).toBe('past_due');
    expect(pastDue.gracePeriodEndAt).toBe(
      renewalAt + DIRECT_PROVIDER_RENEWAL_GRACE_MS
    );
    expect(
      hasOperationalAccessFromStatus({
        ...pastDue,
        now: pastDue.gracePeriodEndAt - 1,
      })
    ).toBe(true);
    expect(
      hasOperationalAccessFromStatus({
        ...pastDue,
        now: pastDue.gracePeriodEndAt,
      })
    ).toBe(false);

    const recoveryAt = renewalAt + 3 * 24 * 60 * 60 * 1000;
    const recovered = await applyVerifiedSUMITPaymentRecord(
      ctx,
      verifiedPaymentArgs({
        paymentId: '41004',
        validPayment: true,
        occurredAt: recoveryAt,
      })
    );
    expect(recovered).toMatchObject({
      ok: true,
      eventKind: 'recovery',
      status: 'active',
    });
    expect(ctx.rows('businessBillingAccounts')[0]).toMatchObject({
      status: 'active',
      gracePeriodEndAt: null,
      currentPeriodStartAt: renewalAt,
      currentPeriodEndAt: Date.parse('2026-03-15T10:00:00Z'),
    });
  });

  test('verified cancellation preserves the current paid period', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    await applyVerifiedSUMITPaymentRecord(ctx, verifiedPaymentArgs());
    const before = ctx.rows('businessBillingAccounts')[0].currentPeriodEndAt;
    const canceled = await applySUMITCancellationRecord(ctx, {
      businessId: BUSINESS_ID,
      now: OCCURRED_AT + 2000,
    });
    expect(canceled).toMatchObject({ ok: true, status: 'canceled' });
    expect(ctx.rows('businessBillingAccounts')[0]).toMatchObject({
      status: 'canceled',
      currentPeriodEndAt: before,
      providerProductId: PRODUCT_ID,
    });
    expect(ctx.rows('businesses')[0].subscriptionEndAt).toBe(before);

    const refund = await applyVerifiedSUMITRefundRecord(ctx, {
      businessId: BUSINESS_ID,
      originalPaymentId: PAYMENT_ID,
      referencedPaymentId: PAYMENT_ID,
      refundId: 'refund-after-cancellation',
      successful: true,
      amount: 149,
      currency: 'ILS',
      occurredAt: OCCURRED_AT + 3000,
      now: OCCURRED_AT + 3000,
    });
    expect(refund).toMatchObject({ ok: true, duplicate: false });
  });

  test('cancellation fails closed without a real provider product identifier', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    await applyVerifiedSUMITPaymentRecord(ctx, verifiedPaymentArgs());
    ctx.rows('businessBillingAccounts')[0].providerProductId = undefined;
    const result = await applySUMITCancellationRecord(ctx, {
      businessId: BUSINESS_ID,
      now: OCCURRED_AT + 2000,
    });
    expect(result).toEqual({
      ok: false,
      code: 'SUMIT_CANCELLATION_STATE_MISSING',
    });
    expect(ctx.rows('businessBillingAccounts')[0].status).toBe('active');
  });

  test('refund requires verified full provider evidence and is idempotent', async () => {
    expect(
      verifySumitRefundEvidence({
        refundId: 'refund-1',
        originalPaymentId: PAYMENT_ID,
        referencedPaymentId: PAYMENT_ID,
        successful: false,
        amount: 149,
        expectedAmount: 149,
        currency: 'ILS',
      })
    ).toEqual({ ok: false, code: 'SUMIT_REFUND_UNCONFIRMED' });
    expect(
      verifySumitRefundEvidence({
        refundId: 'refund-1',
        originalPaymentId: PAYMENT_ID,
        referencedPaymentId: 'wrong',
        successful: true,
        amount: 149,
        expectedAmount: 149,
        currency: 'ILS',
      })
    ).toEqual({ ok: false, code: 'SUMIT_REFUND_REFERENCE_MISMATCH' });

    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    await applyVerifiedSUMITPaymentRecord(ctx, verifiedPaymentArgs());
    const refundArgs = {
      businessId: BUSINESS_ID,
      originalPaymentId: PAYMENT_ID,
      referencedPaymentId: PAYMENT_ID,
      refundId: 'refund-verified-1',
      successful: true,
      amount: 149,
      currency: 'ILS',
      occurredAt: OCCURRED_AT + 3000,
      now: OCCURRED_AT + 3000,
    };
    const first = await applyVerifiedSUMITRefundRecord(ctx, refundArgs);
    const duplicate = await applyVerifiedSUMITRefundRecord(ctx, refundArgs);
    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(duplicate).toMatchObject({ ok: true, duplicate: true });
    expect(ctx.rows('businessBillingAccounts')[0].status).toBe('inactive');
    expect(
      ctx
        .rows('sumitProviderEvents')
        .filter((event) => event.eventType === 'refund')
    ).toHaveLength(1);

    const publicRefundArgs = JSON.parse(refundSUMITPayment.exportArgs());
    expect(publicRefundArgs.args).not.toHaveProperty('successful');
    expect(publicRefundArgs.args).not.toHaveProperty('amount');
    expect(publicRefundArgs.args).not.toHaveProperty('currency');
    expect(readFileSync('convex/sumitBilling.ts', 'utf8')).toContain(
      "code: 'SUMIT_REFUND_VERIFY_REQUIRED'"
    );
  });

  test('a historical-period refund cannot deactivate a newer paid period', async () => {
    const ctx = createMockCtx({ businesses: [business()] });
    await seedCheckout(ctx);
    await applyVerifiedSUMITPaymentRecord(ctx, verifiedPaymentArgs());
    const firstPeriodEnd = ctx.rows('businessBillingAccounts')[0]
      .currentPeriodEndAt;
    await applyVerifiedSUMITPaymentRecord(
      ctx,
      verifiedPaymentArgs({
        paymentId: '41002',
        documentId: '71002',
        occurredAt: firstPeriodEnd,
      })
    );
    const currentBeforeRefund = {
      ...ctx.rows('businessBillingAccounts')[0],
    };
    const result = await applyVerifiedSUMITRefundRecord(ctx, {
      businessId: BUSINESS_ID,
      originalPaymentId: PAYMENT_ID,
      referencedPaymentId: PAYMENT_ID,
      refundId: 'refund-old-period',
      successful: true,
      amount: 149,
      currency: 'ILS',
      occurredAt: firstPeriodEnd + 1000,
      now: firstPeriodEnd + 1000,
    });
    expect(result).toEqual({
      ok: false,
      code: 'SUMIT_REFUND_PERIOD_MISMATCH',
    });
    expect(ctx.rows('businessBillingAccounts')[0]).toMatchObject({
      status: 'active',
      currentPeriodStartAt: currentBeforeRefund.currentPeriodStartAt,
      currentPeriodEndAt: currentBeforeRefund.currentPeriodEndAt,
      providerSubscriptionIdentifier: RECURRING_ID,
    });
  });
});

describe('SUMIT compatibility guarantees', () => {
  test('RevenueCat mapping behavior remains unchanged', () => {
    const event = mapRevenueCatToCanonicalEvent({
      eventId: 'rc-event-1',
      eventType: 'INITIAL_PURCHASE',
      businessId: BUSINESS_ID,
      plan: 'premium',
      billingPeriod: 'yearly',
      purchasedAt: OCCURRED_AT,
      expirationAt: Date.parse('2027-01-15T10:00:00Z'),
      now: OCCURRED_AT,
    });
    expect(event).toMatchObject({
      provider: 'revenuecat',
      eventKind: 'initial_payment',
      status: 'active',
      recordsPaidServicePeriod: true,
    });
  });

  test('canonical validators and additive schema accept sumit without removing PayPlus', () => {
    const canonical = readFileSync(
      'convex/lib/billing/canonicalEvent.ts',
      'utf8'
    );
    const schema = readFileSync('convex/schema.ts', 'utf8');
    expect(canonical).toContain("'revenuecat' | 'payplus' | 'sumit'");
    expect(schema).toContain("v.literal('sumit')");
    expect(schema).toContain('sumitCheckoutIntents: defineTable');
    expect(schema).toContain('sumitProviderEvents: defineTable');
    expect(schema).toContain('payplusCheckoutIntents: defineTable');
    expect(schema).toContain('payplusProviderEvents: defineTable');
  });

  test('reconciliation exposes both owner-authenticated and internal cron-ready actions', () => {
    expect(JSON.parse(reconcileSUMITBilling.exportArgs()).value).toHaveProperty(
      'businessId'
    );
    expect(
      JSON.parse(reconcileSUMITBillingInternal.exportArgs()).value
    ).toHaveProperty('businessId');
    const source = readFileSync('convex/sumitBilling.ts', 'utf8');
    expect(source).toContain('reconcileSUMITBillingServer');
    expect(source).toContain('getSUMITServerReconciliationContext');
    expect(source).toContain('internalAction({');
  });
});
