import type { BillingPeriod } from '../productionContract';
import { payPlusAmountsMatch, payPlusRecurringSchedule } from './checkout';
import {
  assertNotPayPlusProductionUrl,
  PAYPLUS_STAGING_API_HOST,
  PAYPLUS_STAGING_PAGE_HOST,
  type PayPlusConfig,
} from './config';
import { parsePayPlusTimestamp } from './verify';

const PROVIDER_UID = /^[A-Za-z0-9-]{8,80}$/;

export type PayPlusTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
) => Promise<{ status: number; text: string }>;

export function assertPayPlusResourceUid(value: string): string {
  if (!PROVIDER_UID.test(value)) {
    throw new Error('PAYPLUS_PROVIDER_UID_INVALID');
  }
  return value;
}

export async function defaultPayPlusTransport(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
): Promise<{ status: number; text: string }> {
  const response = await fetch(url, init);
  return { status: response.status, text: await response.text() };
}

export async function payPlusJsonRequest(args: {
  config: PayPlusConfig;
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  transport?: PayPlusTransport;
}): Promise<unknown> {
  if (
    !args.config.liveCheckoutEnabled ||
    !args.config.baseUrl ||
    !args.config.apiKey ||
    !args.config.secretKey
  ) {
    throw new Error('PAYPLUS_LIVE_DISABLED');
  }
  if (args.path.startsWith('http') || args.path.includes('..')) {
    throw new Error('PAYPLUS_PATH_INVALID');
  }
  const url = new URL(args.path.replace(/^\//, ''), args.config.baseUrl);
  assertNotPayPlusProductionUrl(url.toString());
  if (url.hostname !== PAYPLUS_STAGING_API_HOST) {
    throw new Error('PAYPLUS_STAGING_HOST_REQUIRED');
  }
  const transport = args.transport ?? defaultPayPlusTransport;
  let response: { status: number; text: string };
  try {
    response = await transport(url.toString(), {
      method: args.method ?? 'POST',
      headers: {
        'api-key': args.config.apiKey,
        'secret-key': args.config.secretKey,
        Accept: 'application/json',
        ...(args.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      body: args.body === undefined ? undefined : JSON.stringify(args.body),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PAYPLUS_')) {
      throw error;
    }
    throw new Error('PAYPLUS_PROVIDER_UNAVAILABLE');
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error('PAYPLUS_PROVIDER_ERROR');
  }
  try {
    return JSON.parse(response.text) as unknown;
  } catch {
    throw new Error('PAYPLUS_PROVIDER_ERROR');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readAck(body: unknown): { status: unknown; code: unknown } | null {
  if (!isRecord(body)) {
    return null;
  }
  const result = isRecord(body.results)
    ? body.results
    : isRecord(body.result)
      ? body.result
      : null;
  if (!result) {
    return null;
  }
  return { status: result.status, code: result.code };
}

export function parseGenerateLinkResponse(body: unknown): {
  pageRequestUid: string;
  paymentPageLink: string;
} {
  const ack = readAck(body);
  if (!isRecord(body) || !ack || ack.status !== 'success' || ack.code !== 0) {
    throw new Error('PAYPLUS_PROVIDER_ERROR');
  }
  if (!isRecord(body.data)) {
    throw new Error('PAYPLUS_PROVIDER_ERROR');
  }
  const pageRequestUid = assertPayPlusResourceUid(
    typeof body.data.page_request_uid === 'string'
      ? body.data.page_request_uid
      : ''
  );
  if (typeof body.data.payment_page_link !== 'string') {
    throw new Error('PAYPLUS_PROVIDER_ERROR');
  }
  const link = assertNotPayPlusProductionUrl(body.data.payment_page_link);
  if (
    link.protocol !== 'https:' ||
    link.hostname !== PAYPLUS_STAGING_PAGE_HOST
  ) {
    throw new Error('PAYPLUS_UNEXPECTED_PAYMENT_HOST');
  }
  return { pageRequestUid, paymentPageLink: link.toString() };
}

export function buildRefundByTransactionUidBody(args: {
  transactionUid: string;
  amount: number;
}) {
  return {
    transaction_uid: assertPayPlusResourceUid(args.transactionUid),
    amount: args.amount,
  };
}

export function parseRefundResponse(body: unknown):
  | {
      ok: true;
      transactionUid: string;
      amount: number;
      currency: string;
      statusCode: string;
      occurredAt: number | null;
    }
  | { ok: false; code: string } {
  const ack = readAck(body);
  if (!isRecord(body) || !ack || ack.status !== 'success' || ack.code !== 0) {
    return { ok: false, code: 'PAYPLUS_PROVIDER_ERROR' };
  }
  if (!isRecord(body.data) || !isRecord(body.data.transaction)) {
    return { ok: false, code: 'PAYPLUS_REFUND_UNCONFIRMED' };
  }
  const transaction = body.data.transaction;
  const transactionUid =
    typeof transaction.uid === 'string' ? transaction.uid.trim() : '';
  const currency =
    typeof transaction.currency === 'string' ? transaction.currency.trim() : '';
  const statusCode =
    typeof transaction.status_code === 'string'
      ? transaction.status_code.trim()
      : '';
  if (
    !transactionUid ||
    typeof transaction.amount !== 'number' ||
    !currency ||
    !statusCode
  ) {
    return { ok: false, code: 'PAYPLUS_REFUND_UNCONFIRMED' };
  }
  return {
    ok: true,
    transactionUid,
    amount: transaction.amount,
    currency,
    statusCode,
    occurredAt: parsePayPlusTimestamp(transaction.date),
  };
}

export function buildRecurringValidBody(terminalUid: string, valid: boolean) {
  return {
    terminal_uid: assertPayPlusResourceUid(terminalUid),
    valid,
  };
}

export function parseRecurringAck(
  body: unknown
): { ok: true } | { ok: false; code: string } {
  const ack = readAck(body);
  if (!ack || ack.status !== 'success' || ack.code !== 0) {
    return { ok: false, code: 'PAYPLUS_PROVIDER_ERROR' };
  }
  return { ok: true };
}

export function buildCreditCardRenewalBody(terminalUid: string) {
  return {
    terminal_uid: assertPayPlusResourceUid(terminalUid),
    disable_send_email: true,
  };
}

export function parseCreditCardRenewalResponse(
  body: unknown
): { ok: true; paymentPageLink: string } | { ok: false; code: string } {
  const ack = readAck(body);
  if (!ack || ack.status !== 'success' || ack.code !== 0 || !isRecord(body)) {
    return { ok: false, code: 'PAYPLUS_PROVIDER_ERROR' };
  }
  const data = isRecord(body.data) ? body.data : null;
  const linkValue =
    data && typeof data.payment_page_link === 'string'
      ? data.payment_page_link
      : null;
  if (!linkValue) {
    return {
      ok: false,
      code: 'PAYPLUS_UPDATE_METHOD_RESPONSE_UNDOCUMENTED',
    };
  }
  try {
    const link = assertNotPayPlusProductionUrl(linkValue);
    if (
      link.protocol !== 'https:' ||
      link.hostname !== PAYPLUS_STAGING_PAGE_HOST
    ) {
      return { ok: false, code: 'PAYPLUS_UNEXPECTED_PAYMENT_HOST' };
    }
    return { ok: true, paymentPageLink: link.toString() };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PAYPLUS_')) {
      return { ok: false, code: error.message };
    }
    return { ok: false, code: 'PAYPLUS_PROVIDER_ERROR' };
  }
}

export type PayPlusRecurringSnapshot = {
  uid: string | null;
  currencyCode: string | null;
  amount: number | null;
  numberOfCharges: number | null;
  recurringType: number | null;
  recurringRange: number | null;
  valid: boolean | null;
};

export function sanitizePayPlusRecurringView(
  view: unknown
): PayPlusRecurringSnapshot | null {
  if (!isRecord(view)) {
    return null;
  }
  return {
    uid: typeof view.uid === 'string' ? view.uid : null,
    currencyCode:
      typeof view.currency_code === 'string' ? view.currency_code : null,
    amount: typeof view.amount === 'number' ? view.amount : null,
    numberOfCharges:
      typeof view.number_of_charges === 'number'
        ? view.number_of_charges
        : null,
    recurringType:
      typeof view.recurring_type === 'number' ? view.recurring_type : null,
    recurringRange:
      typeof view.recurring_range === 'number' ? view.recurring_range : null,
    valid: typeof view.valid === 'boolean' ? view.valid : null,
  };
}

export function comparePayPlusRecurringSnapshot(args: {
  provider: string | null;
  recurringUid: string | null;
  amount: number;
  billingPeriod: BillingPeriod;
  view: unknown | null;
}): {
  discrepancies: string[];
  observations: string[];
  snapshot: PayPlusRecurringSnapshot | null;
} {
  const discrepancies: string[] = [];
  const observations: string[] = [];
  if (args.provider !== 'payplus') {
    discrepancies.push('provider_not_payplus');
  }
  if (!args.recurringUid) {
    discrepancies.push('missing_provider_subscription');
  }
  const snapshot = sanitizePayPlusRecurringView(args.view);
  if (!snapshot) {
    discrepancies.push('missing_recurring_view');
    return { discrepancies, observations, snapshot: null };
  }
  if (snapshot.valid === null) {
    observations.push('valid_flag_undocumented');
  } else if (snapshot.valid === false) {
    discrepancies.push('provider_recurring_inactive');
  }
  if (snapshot.currencyCode?.toUpperCase() !== 'ILS') {
    discrepancies.push('currency_mismatch');
  }
  if (
    snapshot.amount === null ||
    !payPlusAmountsMatch(snapshot.amount, args.amount)
  ) {
    discrepancies.push('amount_mismatch');
  }
  if (snapshot.numberOfCharges !== 0) {
    discrepancies.push('not_unlimited');
  }
  const expected = payPlusRecurringSchedule(args.billingPeriod);
  if (
    snapshot.recurringType !== expected.recurring_type ||
    snapshot.recurringRange !== expected.recurring_range
  ) {
    discrepancies.push('schedule_mismatch');
  }
  if (args.recurringUid && snapshot.uid !== args.recurringUid) {
    discrepancies.push('recurring_uid_mismatch');
  }
  return { discrepancies, observations, snapshot };
}
