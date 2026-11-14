import { expect, test } from 'bun:test';
import { parseSumitAck } from '../lib/billing/sumit/providerClient';
import {
  normalizeSumitCurrency,
  parseSumitDocumentResponse,
  parseSumitPaymentResponse,
  parseSumitPaymentsListResponse,
  parseSumitRecurringListResponse,
  verifySumitPaymentEvidence,
} from '../lib/billing/sumit/verify';

// Sanitized JSON shape observed on SUMIT TEST. No real card/customer identifiers.
const payment = {
  ID: 101,
  CustomerID: 202,
  Date: '2026-11-10T22:48:00Z',
  ValidPayment: true,
  Status: 'Success',
  Amount: 299,
  Currency: 0,
  RecurringCustomerItemIDs: null,
  ExternalIdentifier: null,
  DocumentID: 303,
  PaymentMethod: { CreditCard_Token: 'private-fixture-do-not-return' },
};

test('numeric provider success and ILS enums parse without returning payment credentials', () => {
  const result = parseSumitPaymentResponse({
    Status: 0,
    Data: { Payment: payment },
  });
  expect(result).toMatchObject({
    paymentId: '101',
    customerId: '202',
    amount: 299,
    currency: 'ILS',
    validPayment: true,
    recurringIds: [],
    externalIdentifier: null,
    documentId: '303',
  });
  expect(JSON.stringify(result)).not.toContain('private-fixture');
  expect(result).not.toHaveProperty('PaymentMethod');
  expect(
    verifySumitPaymentEvidence({
      payment: result,
      intent: {
        checkoutId: 'unrelated-checkout',
        amount: 299,
        billingPeriod: 'monthly',
      },
      expectedProductId: 'pro-monthly',
      recurringItems: [],
    })
  ).toEqual({ ok: false, code: 'SUMIT_REFERENCE_MISMATCH' });
});

test('only explicit success codes acknowledge provider commands', () => {
  for (const Status of [0, 'Success', 'Success (0)']) {
    expect(parseSumitAck({ Status })).toEqual({ ok: true });
  }
  for (const Status of [
    false,
    true,
    null,
    undefined,
    '',
    '0',
    'Error',
    1,
    -1,
    0.5,
  ]) {
    expect(parseSumitAck({ Status })).toEqual({
      ok: false,
      code: 'SUMIT_PROVIDER_ERROR',
    });
    expect(
      parseSumitPaymentResponse({ Status, Data: { Payment: payment } })
    ).toBeNull();
  }
});

test('numeric success also supports list, recurring and document responses', () => {
  expect(
    parseSumitPaymentsListResponse({
      Status: 0,
      Data: { Payments: [payment], HasNextPage: false },
    })?.payments[0].currency
  ).toBe('ILS');
  expect(
    parseSumitRecurringListResponse({
      Status: 0,
      Data: {
        RecurringItems: [
          {
            ID: 404,
            Item: { ID: 505, Currency: 0, Duration_Months: 1 },
            Quantity: 1,
            UnitPrice: 299,
            Status: 0,
          },
        ],
      },
    })
  ).toMatchObject([
    {
      recurringId: '404',
      currency: 'ILS',
      status: 'Active',
      durationMonths: 1,
    },
  ]);
  expect(
    parseSumitDocumentResponse(
      { Status: 0, Data: { DocumentID: 303, DocumentNumber: 123 } },
      '303'
    )
  ).toMatchObject({ documentId: '303', documentNumber: '123' });
});

test('declined payment remains declined and unknown numeric currencies stay rejected', () => {
  expect(
    parseSumitPaymentResponse({
      Status: 0,
      Data: { Payment: { ...payment, ValidPayment: false } },
    })?.validPayment
  ).toBe(false);
  for (const Currency of [1, -1, false, true, null, {}, []]) {
    expect(normalizeSumitCurrency(Currency)).toBeNull();
    expect(
      parseSumitPaymentResponse({
        Status: 0,
        Data: { Payment: { ...payment, Currency } },
      })
    ).toBeNull();
  }
});
