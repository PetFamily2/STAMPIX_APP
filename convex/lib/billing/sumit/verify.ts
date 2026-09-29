import type { BillingPeriod } from '../productionContract';
import { expectedSumitRecurringMonths, sumitAmountsMatch } from './checkout';

type JsonRecord = Record<string, unknown>;

export type NormalizedSumitPayment = {
  paymentId: string;
  customerId: string;
  occurredAt: number;
  validPayment: boolean;
  status: string | null;
  amount: number;
  currency: string;
  recurringIds: string[];
  externalIdentifier: string | null;
  documentId: string | null;
};

export type SumitRecurringStatus =
  | 'Active'
  | 'Cancelled'
  | 'DisabledFailedBillingPayment'
  | 'FinishedExpired'
  | 'GracePeriod'
  | 'PendingForFirstPayment'
  | 'CancelledByCustomer'
  | 'PendingRetry';

export type NormalizedSumitRecurringItem = {
  recurringId: string;
  providerProductId: string | null;
  quantity: number;
  unitPrice: number;
  currency: string;
  durationMonths: number | null;
  status: SumitRecurringStatus;
  dateStartAt: number | null;
  dateLastAt: number | null;
  dateNextBillingAt: number | null;
};

export type SumitDocumentMetadata = {
  documentId: string;
  documentNumber: string | null;
  documentType: string | null;
  documentUrl: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readProviderId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  const text = readString(value);
  return text && /^\d+$/.test(text) && text !== '0' ? text : null;
}

function readTimestamp(value: unknown): number | null {
  const text = readString(value);
  if (!text) {
    return null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSuccessStatus(value: unknown): boolean {
  return value === 'Success' || value === 'Success (0)';
}

function unwrapResponse(body: unknown): JsonRecord | null {
  if (
    !isRecord(body) ||
    !isSuccessStatus(body.Status) ||
    !isRecord(body.Data)
  ) {
    return null;
  }
  return body.Data;
}

export function normalizeSumitCurrency(value: unknown): string | null {
  const text = readString(value);
  if (text === 'ILS' || text === 'ILS (0)') {
    return 'ILS';
  }
  return text;
}

const SUMIT_RECURRING_STATUS_BY_CODE: Readonly<
  Record<number, SumitRecurringStatus>
> = {
  0: 'Active',
  1: 'Cancelled',
  3: 'DisabledFailedBillingPayment',
  9: 'FinishedExpired',
  11: 'GracePeriod',
  12: 'PendingForFirstPayment',
  13: 'CancelledByCustomer',
  14: 'PendingRetry',
};

const SUMIT_RECURRING_CODE_BY_STATUS = new Map<SumitRecurringStatus, number>(
  Object.entries(SUMIT_RECURRING_STATUS_BY_CODE).map(([code, status]) => [
    status,
    Number(code),
  ])
);

export function normalizeSumitRecurringStatus(
  value: unknown
): SumitRecurringStatus | null {
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? (SUMIT_RECURRING_STATUS_BY_CODE[value] ?? null)
      : null;
  }
  const text = readString(value);
  if (!text) {
    return null;
  }
  if (/^\d+$/.test(text)) {
    return SUMIT_RECURRING_STATUS_BY_CODE[Number(text)] ?? null;
  }
  const match = /^([A-Za-z]+)(?: \((\d+)\))?$/.exec(text);
  if (!match) {
    return null;
  }
  const status = match[1] as SumitRecurringStatus;
  const documentedCode = SUMIT_RECURRING_CODE_BY_STATUS.get(status);
  if (documentedCode === undefined) {
    return null;
  }
  if (match[2] !== undefined && Number(match[2]) !== documentedCode) {
    return null;
  }
  return status;
}

export function parseSumitPaymentResponse(
  body: unknown
): NormalizedSumitPayment | null {
  const data = unwrapResponse(body);
  const payment = data && isRecord(data.Payment) ? data.Payment : null;
  if (!payment) {
    return null;
  }
  const paymentId = readProviderId(payment.ID);
  const customerId = readProviderId(payment.CustomerID);
  const occurredAt = readTimestamp(payment.Date);
  const currency = normalizeSumitCurrency(payment.Currency);
  if (
    !paymentId ||
    !customerId ||
    occurredAt === null ||
    typeof payment.ValidPayment !== 'boolean' ||
    typeof payment.Amount !== 'number' ||
    !currency
  ) {
    return null;
  }
  const recurringIds = Array.isArray(payment.RecurringCustomerItemIDs)
    ? payment.RecurringCustomerItemIDs.map(readProviderId).filter(
        (id): id is string => id !== null
      )
    : [];
  if (
    Array.isArray(payment.RecurringCustomerItemIDs) &&
    recurringIds.length !== payment.RecurringCustomerItemIDs.length
  ) {
    return null;
  }
  return {
    paymentId,
    customerId,
    occurredAt,
    validPayment: payment.ValidPayment,
    status: readString(payment.Status),
    amount: payment.Amount,
    currency,
    recurringIds,
    externalIdentifier: readString(payment.ExternalIdentifier),
    documentId: readProviderId(payment.DocumentID),
  };
}

export function parseSumitPaymentsListResponse(
  body: unknown
): { payments: NormalizedSumitPayment[]; hasNextPage: boolean } | null {
  const data = unwrapResponse(body);
  if (
    !data ||
    !Array.isArray(data.Payments) ||
    typeof data.HasNextPage !== 'boolean'
  ) {
    return null;
  }
  const payments: NormalizedSumitPayment[] = [];
  for (const rawPayment of data.Payments) {
    const parsed = parseSumitPaymentResponse({
      Status: 'Success (0)',
      Data: { Payment: rawPayment },
    });
    if (!parsed) {
      return null;
    }
    payments.push(parsed);
  }
  return { payments, hasNextPage: data.HasNextPage };
}

function parseRecurringItem(
  value: unknown
): NormalizedSumitRecurringItem | null {
  if (!isRecord(value) || !isRecord(value.Item)) {
    return null;
  }
  const recurringId = readProviderId(value.ID);
  const status = normalizeSumitRecurringStatus(value.Status);
  const quantity = value.Quantity ?? 1;
  const unitPrice = value.UnitPrice;
  const currency = normalizeSumitCurrency(value.Item.Currency);
  const providerProductId =
    readString(value.Item.ExternalIdentifier) ?? readProviderId(value.Item.ID);
  if (
    !recurringId ||
    !status ||
    typeof quantity !== 'number' ||
    typeof unitPrice !== 'number' ||
    !currency
  ) {
    return null;
  }
  return {
    recurringId,
    providerProductId,
    quantity,
    unitPrice,
    currency,
    durationMonths:
      typeof value.Item.Duration_Months === 'number'
        ? value.Item.Duration_Months
        : null,
    status,
    dateStartAt: readTimestamp(value.Date_Start),
    dateLastAt: readTimestamp(value.Date_Last),
    dateNextBillingAt: readTimestamp(value.Date_NextBilling),
  };
}

export function parseSumitRecurringListResponse(
  body: unknown
): NormalizedSumitRecurringItem[] | null {
  const data = unwrapResponse(body);
  if (!data || !Array.isArray(data.RecurringItems)) {
    return null;
  }
  const items: NormalizedSumitRecurringItem[] = [];
  for (const value of data.RecurringItems) {
    const item = parseRecurringItem(value);
    if (!item) {
      return null;
    }
    items.push(item);
  }
  return items;
}

function safeDocumentUrl(value: unknown): string | null {
  const text = readString(value);
  if (!text) {
    return null;
  }
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function parseSumitDocumentResponse(
  body: unknown,
  expectedDocumentId: string
): SumitDocumentMetadata | null {
  const data = unwrapResponse(body);
  if (!data) {
    return null;
  }
  const documentId = readProviderId(data.DocumentID);
  if (documentId !== expectedDocumentId) {
    return null;
  }
  const document = isRecord(data.Document) ? data.Document : null;
  return {
    documentId,
    documentNumber: readProviderId(data.DocumentNumber),
    documentType: document ? readString(document.Type) : null,
    documentUrl: safeDocumentUrl(data.DocumentDownloadURL),
  };
}

export type VerifiedSumitPaymentEvidence = NormalizedSumitPayment & {
  recurringId: string | null;
  providerProductId: string;
  recurringStatus: string | null;
};

export function verifySumitPaymentEvidence(args: {
  payment: NormalizedSumitPayment;
  intent: {
    checkoutId: string;
    amount: number;
    billingPeriod: BillingPeriod;
    sumitCustomerId?: string | null;
    sumitRecurringId?: string | null;
  };
  expectedProductId: string;
  recurringItems: NormalizedSumitRecurringItem[];
}):
  | { ok: true; evidence: VerifiedSumitPaymentEvidence }
  | { ok: false; code: string } {
  const payment = args.payment;
  if (
    args.intent.sumitCustomerId &&
    payment.customerId !== args.intent.sumitCustomerId
  ) {
    return { ok: false, code: 'SUMIT_CUSTOMER_MISMATCH' };
  }
  if (!sumitAmountsMatch(payment.amount, args.intent.amount)) {
    return { ok: false, code: 'SUMIT_AMOUNT_MISMATCH' };
  }
  if (payment.currency !== 'ILS') {
    return { ok: false, code: 'SUMIT_CURRENCY_MISMATCH' };
  }

  const storedRecurringId = args.intent.sumitRecurringId ?? null;
  const correlatedByRecurring =
    storedRecurringId !== null &&
    payment.recurringIds.includes(storedRecurringId);
  if (
    payment.externalIdentifier !== args.intent.checkoutId &&
    !correlatedByRecurring
  ) {
    return { ok: false, code: 'SUMIT_REFERENCE_MISMATCH' };
  }

  const recurringId =
    storedRecurringId ??
    (payment.recurringIds.length === 1 ? payment.recurringIds[0] : null);
  if (!payment.validPayment) {
    return {
      ok: true,
      evidence: {
        ...payment,
        recurringId,
        providerProductId: args.expectedProductId,
        recurringStatus: null,
      },
    };
  }
  if (!recurringId || !payment.recurringIds.includes(recurringId)) {
    return { ok: false, code: 'SUMIT_RECURRING_ID_MISSING' };
  }
  const matching = args.recurringItems.filter(
    (item) => item.recurringId === recurringId
  );
  if (matching.length !== 1) {
    return { ok: false, code: 'SUMIT_RECURRING_MISMATCH' };
  }
  const item = matching[0];
  if (item.providerProductId !== args.expectedProductId) {
    return { ok: false, code: 'SUMIT_PRODUCT_MISMATCH' };
  }
  if (
    item.currency !== 'ILS' ||
    !sumitAmountsMatch(item.quantity * item.unitPrice, args.intent.amount)
  ) {
    return { ok: false, code: 'SUMIT_RECURRING_AMOUNT_MISMATCH' };
  }
  if (
    item.durationMonths !==
    expectedSumitRecurringMonths(args.intent.billingPeriod)
  ) {
    return { ok: false, code: 'SUMIT_RECURRING_SCHEDULE_MISMATCH' };
  }
  if (item.status !== 'Active') {
    return { ok: false, code: 'SUMIT_RECURRING_NOT_ACTIVE' };
  }
  return {
    ok: true,
    evidence: {
      ...payment,
      recurringId,
      providerProductId: args.expectedProductId,
      recurringStatus: item.status,
    },
  };
}

export function verifySumitCancellationEvidence(args: {
  recurringId: string;
  recurringItems: NormalizedSumitRecurringItem[];
}): boolean {
  const item = args.recurringItems.find(
    (candidate) => candidate.recurringId === args.recurringId
  );
  return item?.status === 'Cancelled' || item?.status === 'CancelledByCustomer';
}

export function verifySumitRefundEvidence(args: {
  refundId: string;
  originalPaymentId: string;
  referencedPaymentId: string;
  successful: boolean;
  amount: number;
  expectedAmount: number;
  currency: string;
}): { ok: true; externalEventId: string } | { ok: false; code: string } {
  if (!args.successful) {
    return { ok: false, code: 'SUMIT_REFUND_UNCONFIRMED' };
  }
  if (!args.refundId || args.referencedPaymentId !== args.originalPaymentId) {
    return { ok: false, code: 'SUMIT_REFUND_REFERENCE_MISMATCH' };
  }
  if (
    args.currency !== 'ILS' ||
    !sumitAmountsMatch(args.amount, args.expectedAmount)
  ) {
    return { ok: false, code: 'SUMIT_REFUND_AMOUNT_MISMATCH' };
  }
  return { ok: true, externalEventId: `sumit:refund:${args.refundId}` };
}

export function sumitPaymentEventId(
  paymentId: string,
  validPayment: boolean
): string {
  return `sumit:payment:${paymentId}:${validPayment ? 'valid' : 'invalid'}`;
}

export function sumitCancellationEventId(recurringId: string): string {
  return `sumit:recurring-cancel:${recurringId}`;
}

const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'cardnumber',
  'card_number',
  'cvv',
  'token',
  'singleusetoken',
  'paymentmethod',
]);

export function redactSumitPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSumitPayload(entry));
  }
  if (!isRecord(value)) {
    return value;
  }
  const result: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = redactSumitPayload(entry);
    }
  }
  return result;
}
