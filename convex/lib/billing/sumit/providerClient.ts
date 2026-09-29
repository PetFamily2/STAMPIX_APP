import type { BillingPeriod } from '../productionContract';
import { canonicalSumitAmount, expectedSumitRecurringMonths } from './checkout';
import {
  assertSumitApiConfigured,
  SUMIT_API_HOST,
  type SumitConfig,
} from './config';
import {
  type NormalizedSumitPayment,
  type NormalizedSumitRecurringItem,
  parseSumitDocumentResponse,
  parseSumitPaymentResponse,
  parseSumitPaymentsListResponse,
  parseSumitRecurringListResponse,
  type SumitDocumentMetadata,
} from './verify';

export type SumitTransport = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string }
) => Promise<{ status: number; text: string }>;

export const SUMIT_MAX_PAYMENT_LIST_PAGES = 100;

export async function defaultSumitTransport(
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string }
): Promise<{ status: number; text: string }> {
  const response = await fetch(url, init);
  return { status: response.status, text: await response.text() };
}

function providerNumber(
  value: string,
  code = 'SUMIT_PROVIDER_ID_INVALID'
): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(code);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(code);
  }
  return parsed;
}

export async function sumitJsonRequest(args: {
  config: SumitConfig;
  path: string;
  body: Record<string, unknown>;
  transport?: SumitTransport;
}): Promise<unknown> {
  assertSumitApiConfigured(args.config);
  if (
    args.path.startsWith('http') ||
    args.path.includes('..') ||
    (!args.path.startsWith('billing/') && !args.path.startsWith('accounting/'))
  ) {
    throw new Error('SUMIT_PATH_INVALID');
  }
  const url = new URL(args.path.replace(/^\//, ''), args.config.apiBase);
  if (url.protocol !== 'https:' || url.hostname !== SUMIT_API_HOST) {
    throw new Error('SUMIT_API_HOST_INVALID');
  }
  const transport = args.transport ?? defaultSumitTransport;
  let response: { status: number; text: string };
  try {
    response = await transport(url.toString(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...args.body,
        Credentials: {
          CompanyID: providerNumber(
            args.config.companyId,
            'SUMIT_COMPANY_ID_INVALID'
          ),
          APIKey: args.config.apiKey,
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SUMIT_')) {
      throw error;
    }
    throw new Error('SUMIT_PROVIDER_UNAVAILABLE');
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error('SUMIT_PROVIDER_ERROR');
  }
  try {
    return JSON.parse(response.text) as unknown;
  } catch {
    throw new Error('SUMIT_PROVIDER_ERROR');
  }
}

export function buildSumitGetPaymentBody(paymentId: string) {
  return { PaymentID: providerNumber(paymentId) };
}

export function buildSumitListRecurringBody(
  customerId: string,
  includeInactive = true
) {
  return {
    Customer: { ID: providerNumber(customerId) },
    IncludeInactive: includeInactive,
  };
}

export function buildSumitCancelRecurringBody(args: {
  customerId: string;
  recurringId: string;
}) {
  return {
    Customer: { ID: providerNumber(args.customerId) },
    RecurringCustomerItemID: providerNumber(args.recurringId),
  };
}

export function buildSumitListPaymentsBody(args: {
  dateFrom: number;
  dateTo: number;
  startIndex?: number;
}) {
  if (
    !Number.isFinite(args.dateFrom) ||
    !Number.isFinite(args.dateTo) ||
    args.dateFrom > args.dateTo
  ) {
    throw new Error('SUMIT_PAYMENT_RANGE_INVALID');
  }
  return {
    Date_From: new Date(args.dateFrom).toISOString(),
    Date_To: new Date(args.dateTo).toISOString(),
    StartIndex: args.startIndex ?? 0,
  };
}

export function buildSumitGetDocumentBody(documentId: string) {
  return { DocumentID: providerNumber(documentId) };
}

function responseSucceeded(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }
  const status = (body as Record<string, unknown>).Status;
  return status === 'Success' || status === 'Success (0)';
}

export function parseSumitAck(
  body: unknown
): { ok: true } | { ok: false; code: string } {
  return responseSucceeded(body)
    ? { ok: true }
    : { ok: false, code: 'SUMIT_PROVIDER_ERROR' };
}

export async function fetchSumitPayment(args: {
  config: SumitConfig;
  paymentId: string;
  transport?: SumitTransport;
}): Promise<NormalizedSumitPayment> {
  const body = await sumitJsonRequest({
    config: args.config,
    path: 'billing/payments/get/',
    body: buildSumitGetPaymentBody(args.paymentId),
    transport: args.transport,
  });
  const payment = parseSumitPaymentResponse(body);
  if (!payment || payment.paymentId !== args.paymentId) {
    throw new Error('SUMIT_PAYMENT_VERIFICATION_FAILED');
  }
  return payment;
}

export async function fetchSumitRecurringItems(args: {
  config: SumitConfig;
  customerId: string;
  transport?: SumitTransport;
}): Promise<NormalizedSumitRecurringItem[]> {
  const body = await sumitJsonRequest({
    config: args.config,
    path: 'billing/recurring/listforcustomer/',
    body: buildSumitListRecurringBody(args.customerId, true),
    transport: args.transport,
  });
  const items = parseSumitRecurringListResponse(body);
  if (!items) {
    throw new Error('SUMIT_RECURRING_VERIFICATION_FAILED');
  }
  return items;
}

export async function fetchSumitPayments(args: {
  config: SumitConfig;
  dateFrom: number;
  dateTo: number;
  transport?: SumitTransport;
}): Promise<NormalizedSumitPayment[]> {
  const payments: NormalizedSumitPayment[] = [];
  let startIndex = 0;
  for (
    let pageNumber = 0;
    pageNumber < SUMIT_MAX_PAYMENT_LIST_PAGES;
    pageNumber += 1
  ) {
    const body = await sumitJsonRequest({
      config: args.config,
      path: 'billing/payments/list/',
      body: buildSumitListPaymentsBody({
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        startIndex,
      }),
      transport: args.transport,
    });
    const page = parseSumitPaymentsListResponse(body);
    if (!page) {
      throw new Error('SUMIT_PAYMENT_VERIFICATION_FAILED');
    }
    payments.push(...page.payments);
    if (!page.hasNextPage) {
      return payments;
    }
    if (page.payments.length === 0) {
      throw new Error('SUMIT_PAYMENT_PAGINATION_INVALID');
    }
    startIndex += page.payments.length;
  }
  throw new Error('SUMIT_PAYMENT_PAGINATION_LIMIT');
}

export async function fetchSumitDocumentMetadata(args: {
  config: SumitConfig;
  documentId: string;
  transport?: SumitTransport;
}): Promise<SumitDocumentMetadata | null> {
  const body = await sumitJsonRequest({
    config: args.config,
    path: 'accounting/documents/getdetails/',
    body: buildSumitGetDocumentBody(args.documentId),
    transport: args.transport,
  });
  return parseSumitDocumentResponse(body, args.documentId);
}

export type SumitRecurringComparison = {
  discrepancies: string[];
  observations: string[];
  snapshot: NormalizedSumitRecurringItem | null;
};

export function compareSumitRecurringSnapshot(args: {
  provider: string | null;
  recurringId: string | null;
  plan: 'starter' | 'pro' | 'premium';
  billingPeriod: BillingPeriod;
  expectedProductId: string;
  items: NormalizedSumitRecurringItem[];
}): SumitRecurringComparison {
  const discrepancies: string[] = [];
  const observations: string[] = [];
  if (args.provider !== 'sumit') {
    discrepancies.push('provider_not_sumit');
  }
  if (!args.recurringId) {
    discrepancies.push('missing_provider_subscription');
    return { discrepancies, observations, snapshot: null };
  }
  const matches = args.items.filter(
    (item) => item.recurringId === args.recurringId
  );
  if (matches.length !== 1) {
    discrepancies.push('recurring_item_not_unique');
    return { discrepancies, observations, snapshot: null };
  }
  const snapshot = matches[0];
  if (snapshot.providerProductId !== args.expectedProductId) {
    discrepancies.push('product_mismatch');
  }
  if (snapshot.currency !== 'ILS') {
    discrepancies.push('currency_mismatch');
  }
  if (
    snapshot.quantity * snapshot.unitPrice !==
    canonicalSumitAmount(args.plan, args.billingPeriod)
  ) {
    discrepancies.push('amount_mismatch');
  }
  if (
    snapshot.durationMonths !== expectedSumitRecurringMonths(args.billingPeriod)
  ) {
    discrepancies.push('schedule_mismatch');
  }
  switch (snapshot.status) {
    case 'Active':
      break;
    case 'GracePeriod':
      observations.push('provider_grace_period');
      break;
    case 'PendingRetry':
      observations.push('provider_retry_pending');
      break;
    case 'DisabledFailedBillingPayment':
      discrepancies.push('provider_billing_disabled');
      break;
    case 'FinishedExpired':
      discrepancies.push('provider_finished_expired');
      break;
    case 'Cancelled':
      discrepancies.push('provider_cancelled');
      break;
    case 'CancelledByCustomer':
      discrepancies.push('provider_cancelled_by_customer');
      break;
    case 'PendingForFirstPayment':
      discrepancies.push('provider_pending_first_payment');
      break;
  }
  return { discrepancies, observations, snapshot };
}
