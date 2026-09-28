/**
 * PayPlus documents callback authenticity as:
 * user-agent "PayPlus" and HMAC-SHA256(secret, JSON.stringify(body)) base64,
 * sent in the hash header.
 * The sample hashes a parsed body. The raw request bytes are also accepted so
 * whitespace cannot turn a valid signature into a false negative.
 * A valid hash is still only a trigger. Transactions/View is the documented
 * server-to-server query whose response schema is published. PaymentPages/ipn
 * returns an empty schema, so it is not used as billing authority.
 */

import { payPlusAmountsMatch } from './checkout';

export type PayPlusInvoiceMetadata = {
  uuid: string | null;
  number: string | null;
  originalUrl: string | null;
  copyUrl: string | null;
};

export type NormalizedPayPlusTransaction = {
  transactionUid: string;
  transactionType: string;
  statusCode: string;
  amount: number;
  currency: string;
  moreInfo: string;
  moreInfo2: string | null;
  paymentRequestUid: string | null;
  cancelled: boolean;
  occurredAt: number | null;
  recurringUid: string | null;
  chargeUid: string | null;
  invoice: PayPlusInvoiceMetadata | null;
};

export function payPlusChargeEventId(transactionUid: string): string {
  return `payplus:tx:${transactionUid}`;
}

export function payPlusCancellationEventId(recurringUid: string): string {
  return `payplus:recurring-invalid:${recurringUid}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function hmacSha256Base64(
  secret: string,
  message: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  );
  return bytesToBase64(new Uint8Array(signature));
}

function secureEquals(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

export async function verifyPayPlusRequestHash(args: {
  rawBody: string;
  parsedBody: unknown;
  hashHeader: string | null;
  userAgent: string | null;
  secretKey: string | null;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!args.secretKey) {
    return { ok: false, code: 'PAYPLUS_SECRET_NOT_CONFIGURED' };
  }
  if (args.userAgent !== 'PayPlus') {
    return { ok: false, code: 'PAYPLUS_CALLBACK_UNAUTHENTICATED' };
  }
  const provided = args.hashHeader?.trim() ?? '';
  if (!provided) {
    return { ok: false, code: 'PAYPLUS_CALLBACK_UNAUTHENTICATED' };
  }
  const rawHash = await hmacSha256Base64(args.secretKey, args.rawBody);
  const parsedHash = await hmacSha256Base64(
    args.secretKey,
    JSON.stringify(args.parsedBody)
  );
  if (!secureEquals(provided, rawHash) && !secureEquals(provided, parsedHash)) {
    return { ok: false, code: 'PAYPLUS_CALLBACK_UNAUTHENTICATED' };
  }
  return { ok: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parsePayPlusTimestamp(value: unknown): number | null {
  const text = readString(value);
  if (!text) {
    return null;
  }
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(text);
  if (!match) {
    return null;
  }
  const parsed = Date.parse(`${match[1]}T${match[2]}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function httpsUrlOrNull(value: unknown): string | null {
  const text = readString(value);
  if (!text) {
    return null;
  }
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function readInvoice(value: unknown): PayPlusInvoiceMetadata | null {
  if (!isRecord(value)) {
    return null;
  }
  const invoice = {
    uuid: readString(value.uuid),
    number: readString(value.docu_number),
    originalUrl: httpsUrlOrNull(value.original_url ?? value.original_doc_url),
    copyUrl: httpsUrlOrNull(value.copy_url ?? value.copy_doc_url),
  };
  if (
    !invoice.uuid &&
    !invoice.number &&
    !invoice.originalUrl &&
    !invoice.copyUrl
  ) {
    return null;
  }
  return invoice;
}

function readRecurring(value: unknown): {
  recurringUid: string | null;
  chargeUid: string | null;
} {
  if (!isRecord(value)) {
    return { recurringUid: null, chargeUid: null };
  }
  return {
    recurringUid: readString(value.recurring_uid),
    chargeUid: readString(value.charge_uid),
  };
}

export function normalizePayPlusTransaction(
  source: unknown,
  fallbackType?: unknown,
  invoiceSource?: unknown
): NormalizedPayPlusTransaction | null {
  if (!isRecord(source)) {
    return null;
  }
  const transactionUid = readString(source.uid ?? source.transaction_uid);
  const transactionType = readString(
    source.transaction_type ?? source.type ?? fallbackType
  );
  const statusCode = readString(source.status_code);
  const currency = readString(source.currency ?? source.currency_code);
  const moreInfo = readString(source.more_info);
  if (
    !transactionUid ||
    !transactionType ||
    !statusCode ||
    typeof source.amount !== 'number' ||
    !currency ||
    !moreInfo
  ) {
    return null;
  }
  const recurring = readRecurring(source.recurring_charge_information);
  return {
    transactionUid,
    transactionType,
    statusCode,
    amount: source.amount,
    currency,
    moreInfo,
    moreInfo2: readString(source.more_info_2),
    paymentRequestUid: readString(source.payment_request_uid),
    cancelled: source.transaction_is_cancelled === true,
    occurredAt: parsePayPlusTimestamp(source.date),
    recurringUid: recurring.recurringUid,
    chargeUid: recurring.chargeUid,
    invoice: readInvoice(invoiceSource),
  };
}

export function parsePayPlusCallback(
  body: unknown
):
  | { ok: true; transaction: NormalizedPayPlusTransaction }
  | { ok: false; code: string } {
  if (!isRecord(body) || !isRecord(body.transaction)) {
    return { ok: false, code: 'PAYPLUS_CALLBACK_BODY' };
  }
  const transaction = normalizePayPlusTransaction(
    body.transaction,
    body.transaction_type,
    body.invoice
  );
  if (!transaction) {
    return { ok: false, code: 'PAYPLUS_CALLBACK_BODY' };
  }
  return { ok: true, transaction };
}

export function readPayPlusViewTransactions(
  body: unknown
):
  | { ok: true; transactions: NormalizedPayPlusTransaction[] }
  | { ok: false; code: string } {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    return { ok: false, code: 'PAYPLUS_VERIFICATION_FAILED' };
  }
  if (isRecord(body.results)) {
    if (body.results.status !== 'success' || body.results.code !== 0) {
      return { ok: false, code: 'PAYPLUS_VERIFICATION_FAILED' };
    }
  }
  const transactions: NormalizedPayPlusTransaction[] = [];
  for (const entry of body.data) {
    if (!isRecord(entry) || !isRecord(entry.transaction)) {
      return { ok: false, code: 'PAYPLUS_VERIFICATION_FAILED' };
    }
    const transaction = normalizePayPlusTransaction(entry.transaction);
    if (!transaction) {
      return { ok: false, code: 'PAYPLUS_VERIFICATION_FAILED' };
    }
    transactions.push(transaction);
  }
  return { ok: true, transactions };
}

function sameFinancialTransaction(
  left: NormalizedPayPlusTransaction,
  right: NormalizedPayPlusTransaction
): boolean {
  return (
    left.transactionUid === right.transactionUid &&
    left.transactionType.toLowerCase() ===
      right.transactionType.toLowerCase() &&
    left.statusCode === right.statusCode &&
    left.amount === right.amount &&
    left.currency.toUpperCase() === right.currency.toUpperCase() &&
    left.moreInfo === right.moreInfo
  );
}

export function confirmPayPlusTransaction(args: {
  callback: NormalizedPayPlusTransaction;
  viewBody: unknown;
  intent: {
    checkoutId: string;
    amount: number;
    logicalProductId: string;
    pageRequestUid?: string | null;
  };
}):
  | { ok: true; transaction: NormalizedPayPlusTransaction }
  | { ok: false; code: string } {
  const view = readPayPlusViewTransactions(args.viewBody);
  if (!view.ok) {
    return view;
  }
  const matches = view.transactions.filter((transaction) =>
    sameFinancialTransaction(transaction, args.callback)
  );
  if (matches.length === 0) {
    return { ok: false, code: 'PAYPLUS_VERIFICATION_MISMATCH' };
  }
  if (matches.length > 1) {
    return { ok: false, code: 'PAYPLUS_AMBIGUOUS_TRANSACTION' };
  }
  const verified = matches[0];
  if (verified.moreInfo !== args.intent.checkoutId) {
    return { ok: false, code: 'PAYPLUS_REFERENCE_MISMATCH' };
  }
  if (verified.currency.toUpperCase() !== 'ILS') {
    return { ok: false, code: 'PAYPLUS_CURRENCY_MISMATCH' };
  }
  const verifiedType = verified.transactionType.toLowerCase();
  const amountMatchesIntent = payPlusAmountsMatch(
    verified.amount,
    args.intent.amount
  );
  if (verifiedType === 'refund' && !amountMatchesIntent) {
    return { ok: false, code: 'PAYPLUS_PARTIAL_REFUND_UNMAPPED' };
  }
  if (verifiedType !== 'refund' && !amountMatchesIntent) {
    return { ok: false, code: 'PAYPLUS_AMOUNT_MISMATCH' };
  }
  if (
    args.callback.moreInfo2 &&
    args.callback.moreInfo2 !== args.intent.logicalProductId
  ) {
    return { ok: false, code: 'PAYPLUS_REFERENCE_MISMATCH' };
  }
  const paymentRequestUid =
    verified.paymentRequestUid ?? args.callback.paymentRequestUid;
  if (
    verified.paymentRequestUid &&
    args.callback.paymentRequestUid &&
    verified.paymentRequestUid !== args.callback.paymentRequestUid
  ) {
    return { ok: false, code: 'PAYPLUS_PAGE_REQUEST_MISMATCH' };
  }
  if (
    args.intent.pageRequestUid &&
    paymentRequestUid &&
    paymentRequestUid !== args.intent.pageRequestUid
  ) {
    return { ok: false, code: 'PAYPLUS_PAGE_REQUEST_MISMATCH' };
  }
  return {
    ok: true,
    transaction: {
      ...verified,
      paymentRequestUid,
      recurringUid: args.callback.recurringUid ?? verified.recurringUid,
      chargeUid: args.callback.chargeUid ?? verified.chargeUid,
      invoice: args.callback.invoice,
      occurredAt: verified.occurredAt ?? args.callback.occurredAt,
    },
  };
}

const SENSITIVE_KEYS = new Set([
  'card_information',
  'card_token',
  'token',
  'cvv',
  'identification_number',
  'card_bin',
  'hash_data',
  'api-key',
  'secret-key',
  'apikey',
  'secretkey',
  'payplus_api_key',
  'payplus_secret_key',
]);

export function redactPayPlusPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactPayPlusPayload(entry));
  }
  if (!isRecord(value)) {
    return value;
  }
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      continue;
    }
    redacted[key] = redactPayPlusPayload(entry);
  }
  return redacted;
}
