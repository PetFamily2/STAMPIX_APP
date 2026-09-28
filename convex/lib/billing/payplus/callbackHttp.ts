import { type PayPlusConfig, resolvePayPlusConfig } from './config';
import { payPlusJsonRequest } from './providerClient';
import {
  confirmPayPlusTransaction,
  parsePayPlusCallback,
  verifyPayPlusRequestHash,
} from './verify';

const MAX_CALLBACK_BYTES = 65_536;
const PROVIDER_UID = /^[A-Za-z0-9-]{8,80}$/;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export type PayPlusCallbackCtx = {
  runQuery: (ref: any, args: any) => Promise<any>;
  runMutation: (ref: any, args: any) => Promise<any>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function handlePayPlusCallbackRequest(
  ctx: PayPlusCallbackCtx,
  request: Request,
  options: {
    intentRef: unknown;
    applyRef: unknown;
    config?: PayPlusConfig;
    now?: number;
    queryTransaction?: (transactionUid: string) => Promise<unknown>;
  }
) {
  const config = options.config ?? resolvePayPlusConfig(process.env);
  if (!config.liveCheckoutEnabled || !config.secretKey) {
    return jsonResponse(503, { ok: false, code: 'PAYPLUS_LIVE_DISABLED' });
  }

  const rawBody = await request.text();
  if (!rawBody || rawBody.length > MAX_CALLBACK_BYTES) {
    return jsonResponse(400, { ok: false, code: 'PAYPLUS_CALLBACK_BODY' });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return jsonResponse(400, { ok: false, code: 'PAYPLUS_CALLBACK_BODY' });
  }

  const authenticated = await verifyPayPlusRequestHash({
    rawBody,
    parsedBody: parsed,
    hashHeader: request.headers.get('hash'),
    userAgent: request.headers.get('user-agent'),
    secretKey: config.secretKey,
  });
  if (!authenticated.ok) {
    return jsonResponse(401, {
      ok: false,
      code: 'PAYPLUS_CALLBACK_UNAUTHENTICATED',
    });
  }

  const callback = parsePayPlusCallback(parsed);
  if (!callback.ok) {
    return jsonResponse(400, { ok: false, code: callback.code });
  }
  if (!PROVIDER_UID.test(callback.transaction.transactionUid)) {
    return jsonResponse(400, {
      ok: false,
      code: 'PAYPLUS_PROVIDER_UID_INVALID',
    });
  }

  const intent = await ctx.runQuery(options.intentRef, {
    checkoutId: callback.transaction.moreInfo,
  });
  if (
    !isRecord(intent) ||
    intent.checkoutId !== callback.transaction.moreInfo
  ) {
    return jsonResponse(400, {
      ok: false,
      code: 'PAYPLUS_UNKNOWN_TRANSACTION',
    });
  }
  if (
    typeof intent.amount !== 'number' ||
    typeof intent.logicalProductId !== 'string'
  ) {
    return jsonResponse(400, {
      ok: false,
      code: 'PAYPLUS_UNKNOWN_TRANSACTION',
    });
  }

  let viewBody: unknown;
  try {
    viewBody = options.queryTransaction
      ? await options.queryTransaction(callback.transaction.transactionUid)
      : await payPlusJsonRequest({
          config,
          path: 'Transactions/View',
          body: { transaction_uid: callback.transaction.transactionUid },
        });
  } catch {
    return jsonResponse(502, {
      ok: false,
      code: 'PAYPLUS_VERIFICATION_UNAVAILABLE',
    });
  }

  const confirmed = confirmPayPlusTransaction({
    callback: callback.transaction,
    viewBody,
    intent: {
      checkoutId: callback.transaction.moreInfo,
      amount: intent.amount,
      logicalProductId: intent.logicalProductId,
      pageRequestUid:
        typeof intent.pageRequestUid === 'string'
          ? intent.pageRequestUid
          : null,
    },
  });
  if (!confirmed.ok) {
    return jsonResponse(400, { ok: false, code: confirmed.code });
  }

  const transaction = confirmed.transaction;
  const applied = await ctx.runMutation(options.applyRef, {
    checkoutId: transaction.moreInfo,
    transactionUid: transaction.transactionUid,
    transactionType: transaction.transactionType,
    statusCode: transaction.statusCode,
    amount: transaction.amount,
    currency: transaction.currency,
    occurredAt: transaction.occurredAt ?? options.now ?? Date.now(),
    recurringUid: transaction.recurringUid,
    transactionIsCancelled: transaction.cancelled,
    invoiceUuid: transaction.invoice?.uuid ?? null,
    invoiceNumber: transaction.invoice?.number ?? null,
    invoiceOriginalUrl: transaction.invoice?.originalUrl ?? null,
    invoiceCopyUrl: transaction.invoice?.copyUrl ?? null,
  });
  const result = isRecord(applied) ? applied : {};
  if (result.ok === false) {
    return jsonResponse(400, {
      ok: false,
      code:
        typeof result.code === 'string'
          ? result.code
          : 'PAYPLUS_CALLBACK_REJECTED',
    });
  }

  return jsonResponse(200, {
    ok: true,
    duplicate: result.duplicate === true,
    eventId: typeof result.eventId === 'string' ? result.eventId : null,
  });
}
