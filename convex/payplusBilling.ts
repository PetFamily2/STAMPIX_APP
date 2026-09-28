import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import {
  requireActorHasBusinessCapability,
  requireCurrentUser,
} from './guards';
import {
  ensureBusinessBillingAccount,
  getBillingAccountForBusiness,
} from './lib/billing/accounts';
import { applyVerifiedBillingEvent } from './lib/billing/applyVerifiedBillingEvent';
import {
  assertPayPlusCheckoutCanHost,
  buildPayPlusCheckoutDraft,
  buildPayPlusGenerateLinkBody,
  canonicalPlanAmount,
  payPlusAmountsMatch,
  payPlusRefundEvidenceCanApply,
  toHostedCheckoutClientResult,
} from './lib/billing/payplus/checkout';
import {
  buildPayPlusReturnUrls,
  resolvePayPlusConfig,
} from './lib/billing/payplus/config';
import {
  mapPayPlusCancellation,
  mapVerifiedPayPlusEvidence,
} from './lib/billing/payplus/mapToCanonical';
import {
  assertPayPlusResourceUid,
  buildCreditCardRenewalBody,
  buildRecurringValidBody,
  buildRefundByTransactionUidBody,
  comparePayPlusRecurringSnapshot,
  defaultPayPlusTransport,
  parseCreditCardRenewalResponse,
  parseGenerateLinkResponse,
  parseRecurringAck,
  parseRefundResponse,
  payPlusJsonRequest,
} from './lib/billing/payplus/providerClient';
import {
  payPlusCancellationEventId,
  payPlusChargeEventId,
} from './lib/billing/payplus/verify';
import type {
  BillingPeriod,
  BusinessPlan,
} from './lib/billing/productionContract';
import {
  isBillingPeriod,
  isBusinessPlan,
} from './lib/billing/productionContract';
import { generateOpaqueToken } from './lib/ids';

const AUTH_ERRORS = new Set([
  'NOT_AUTHENTICATED',
  'NOT_AUTHORIZED',
  'BUSINESS_NOT_FOUND',
  'BUSINESS_CLOSED',
  'BUSINESS_PERMANENT_DELETION_IN_PROGRESS',
]);

function rethrowAuth(error: unknown): void {
  if (error instanceof Error && AUTH_ERRORS.has(error.message)) {
    throw error;
  }
}

function payPlusErrorCode(error: unknown): string {
  rethrowAuth(error);
  if (error instanceof Error && error.message.startsWith('PAYPLUS_')) {
    return error.message;
  }
  return 'PAYPLUS_PROVIDER_ERROR';
}

function asPlan(value: unknown): BusinessPlan | null {
  return isBusinessPlan(value) ? value : null;
}

function asPeriod(value: unknown): BillingPeriod | null {
  return isBillingPeriod(value) ? value : null;
}

function definedString(value: string | null | undefined): string | undefined {
  return value ? value : undefined;
}

function httpsOrUndefined(
  value: string | null | undefined
): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
}

async function requirePayPlusOwner(
  ctx: QueryCtx | MutationCtx,
  businessId: Id<'businesses'>
) {
  const user = await requireCurrentUser(ctx);
  await requireActorHasBusinessCapability(
    ctx,
    businessId,
    'manage_subscription'
  );
  const business = await ctx.db.get(businessId);
  if (!business) {
    throw new Error('BUSINESS_NOT_FOUND');
  }
  if (String(business.ownerUserId) !== String(user._id)) {
    throw new Error('NOT_AUTHORIZED');
  }
  return { user, business };
}

export async function createPayPlusCheckoutRecord(
  ctx: any,
  args: {
    actorUserId: Id<'users'>;
    businessId: Id<'businesses'>;
    plan: unknown;
    billingPeriod: unknown;
    browserAmount?: unknown;
    browserCurrency?: unknown;
    now?: number;
    checkoutId?: string;
  }
) {
  const business = await ctx.db.get(args.businessId);
  if (!business) {
    throw new Error('BUSINESS_NOT_FOUND');
  }
  const now = args.now ?? Date.now();
  const draft = buildPayPlusCheckoutDraft({
    checkoutId: args.checkoutId ?? `pp_${generateOpaqueToken(24)}`,
    businessId: business._id,
    ownerUserId: business.ownerUserId,
    actorUserId: args.actorUserId,
    businessActive: business.isActive === true,
    plan: args.plan,
    billingPeriod: args.billingPeriod,
    browserAmount: args.browserAmount,
    browserCurrency: args.browserCurrency,
    now,
  });
  const existing = await ctx.db
    .query('payplusCheckoutIntents')
    .withIndex('by_checkoutId', (q: any) =>
      q.eq('checkoutId', draft.checkoutId)
    )
    .first();
  if (existing) {
    throw new Error('PAYPLUS_CHECKOUT_ID_CONFLICT');
  }
  await ensureBusinessBillingAccount(ctx, {
    businessId: business._id,
    ownerUserId: business.ownerUserId,
    now,
  });
  const id = await ctx.db.insert('payplusCheckoutIntents', {
    checkoutId: draft.checkoutId,
    businessId: business._id,
    ownerUserId: business.ownerUserId,
    plan: draft.plan,
    billingPeriod: draft.billingPeriod,
    logicalProductId: draft.logicalProductId,
    amount: draft.amount,
    currency: draft.currency,
    status: draft.status,
    createdAt: draft.createdAt,
    expiresAt: draft.expiresAt,
    updatedAt: draft.updatedAt,
  });
  return {
    ...draft,
    _id: id,
    businessId: business._id,
    ownerUserId: business.ownerUserId,
  };
}

async function getCheckoutIntent(ctx: any, checkoutId: string) {
  return await ctx.db
    .query('payplusCheckoutIntents')
    .withIndex('by_checkoutId', (q: any) => q.eq('checkoutId', checkoutId))
    .first();
}

async function findProviderEvent(ctx: any, externalEventId: string) {
  return await ctx.db
    .query('payplusProviderEvents')
    .withIndex('by_externalEventId', (q: any) =>
      q.eq('externalEventId', externalEventId)
    )
    .first();
}

export async function applyVerifiedPayPlusEvidenceRecord(
  ctx: any,
  args: {
    checkoutId: string;
    transactionUid: string;
    transactionType: string;
    statusCode: string;
    amount: number;
    currency: string;
    occurredAt: number;
    recurringUid?: string | null;
    transactionIsCancelled: boolean;
    invoiceUuid?: string | null;
    invoiceNumber?: string | null;
    invoiceOriginalUrl?: string | null;
    invoiceCopyUrl?: string | null;
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  const externalEventId = payPlusChargeEventId(args.transactionUid);
  const existing = await findProviderEvent(ctx, externalEventId);
  if (existing) {
    return { ok: true, duplicate: true, eventId: externalEventId };
  }

  const intent = await getCheckoutIntent(ctx, args.checkoutId);
  if (!intent) {
    return { ok: false, code: 'PAYPLUS_UNKNOWN_TRANSACTION' };
  }
  const business = await ctx.db.get(intent.businessId);
  if (!business) {
    return { ok: false, code: 'PAYPLUS_UNKNOWN_TRANSACTION' };
  }
  if (String(business.ownerUserId) !== String(intent.ownerUserId)) {
    return { ok: false, code: 'PAYPLUS_OWNER_MISMATCH' };
  }

  await ensureBusinessBillingAccount(ctx, {
    businessId: intent.businessId,
    ownerUserId: intent.ownerUserId,
    now,
  });
  const billingAccount = await getBillingAccountForBusiness(
    ctx,
    intent.businessId
  );
  if (billingAccount?.lastProviderEventId === externalEventId) {
    return { ok: true, duplicate: true, eventId: externalEventId };
  }
  const providerEvents = await ctx.db
    .query('payplusProviderEvents')
    .withIndex('by_businessId', (q: any) =>
      q.eq('businessId', intent.businessId)
    )
    .collect();
  const successfulCharges = providerEvents.filter(
    (event: any) =>
      event.status === 'processed' &&
      String(event.transactionType).toLowerCase() === 'charge'
  );
  const priorSuccessfulChargeCount = successfulCharges.length;
  const checkoutSuccessfulChargeCount = successfulCharges.filter(
    (event: any) => event.checkoutId === intent.checkoutId
  ).length;
  const mapped = mapVerifiedPayPlusEvidence({
    businessId: intent.businessId,
    plan: intent.plan,
    billingPeriod: intent.billingPeriod,
    expectedAmount: intent.amount,
    transactionUid: args.transactionUid,
    transactionType: args.transactionType,
    statusCode: args.statusCode,
    amount: args.amount,
    currency: args.currency,
    occurredAt: args.occurredAt,
    recurringUid: args.recurringUid ?? null,
    transactionIsCancelled: args.transactionIsCancelled,
    priorSuccessfulChargeCount,
    checkoutSuccessfulChargeCount,
    currentPlan: asPlan(billingAccount?.plan),
    currentPeriod: asPeriod(billingAccount?.billingPeriod),
    existingPeriodStartAt:
      typeof billingAccount?.currentPeriodStartAt === 'number'
        ? billingAccount.currentPeriodStartAt
        : null,
    existingPeriodEndAt:
      typeof billingAccount?.currentPeriodEndAt === 'number'
        ? billingAccount.currentPeriodEndAt
        : null,
    now,
  });
  if (!mapped.ok) {
    return mapped;
  }

  const applied = await applyVerifiedBillingEvent(ctx, mapped.event);
  const status = applied.applied ? 'processed' : 'ignored';
  await ctx.db.insert(
    'payplusProviderEvents',
    withoutUndefined({
      externalEventId,
      checkoutId: intent.checkoutId,
      businessId: intent.businessId,
      transactionUid: args.transactionUid,
      transactionType: args.transactionType,
      status,
      ignoredReason: applied.applied ? undefined : 'stale_event',
      amount: args.currency.toUpperCase() === 'ILS' ? args.amount : undefined,
      currency: args.currency.toUpperCase() === 'ILS' ? 'ILS' : undefined,
      recurringUid: definedString(args.recurringUid),
      providerEventAt: args.occurredAt,
      invoiceUuid: definedString(args.invoiceUuid),
      invoiceNumber: definedString(args.invoiceNumber),
      invoiceOriginalUrl: httpsOrUndefined(args.invoiceOriginalUrl),
      invoiceCopyUrl: httpsOrUndefined(args.invoiceCopyUrl),
      receivedAt: now,
      processedAt: now,
    })
  );
  if (applied.applied && billingAccount) {
    await ctx.db.patch(billingAccount._id, { providerEnvironment: 'staging' });
  }
  if (applied.applied) {
    await ctx.db.patch(
      intent._id,
      withoutUndefined({
        status: mapped.event.status === 'active' ? 'verified' : intent.status,
        recurringPaymentUid:
          definedString(args.recurringUid) ?? intent.recurringPaymentUid,
        updatedAt: now,
      })
    );
  }
  if (!applied.applied) {
    return {
      ok: true,
      duplicate: false,
      ignored: true,
      code: 'stale_event',
      eventId: externalEventId,
    };
  }
  return {
    ok: true,
    duplicate: false,
    eventId: externalEventId,
    eventKind: mapped.event.eventKind,
    businessId: intent.businessId,
    plan: mapped.event.plan,
    status: mapped.event.status,
  };
}

export async function applyPayPlusCancellationRecord(
  ctx: any,
  args: { businessId: Id<'businesses'>; now?: number }
) {
  const now = args.now ?? Date.now();
  const billingAccount = await getBillingAccountForBusiness(
    ctx,
    args.businessId
  );
  const plan = asPlan(billingAccount?.plan);
  const billingPeriod = asPeriod(billingAccount?.billingPeriod);
  const recurringUid =
    typeof billingAccount?.providerSubscriptionIdentifier === 'string'
      ? billingAccount.providerSubscriptionIdentifier
      : null;
  const periodStartAt =
    typeof billingAccount?.currentPeriodStartAt === 'number'
      ? billingAccount.currentPeriodStartAt
      : null;
  const periodEndAt =
    typeof billingAccount?.currentPeriodEndAt === 'number'
      ? billingAccount.currentPeriodEndAt
      : null;
  if (
    !billingAccount ||
    billingAccount.provider !== 'payplus' ||
    !plan ||
    !billingPeriod ||
    !recurringUid ||
    periodStartAt === null ||
    periodEndAt === null
  ) {
    return { ok: false, code: 'PAYPLUS_CANCELLATION_STATE_MISSING' };
  }

  const externalEventId = payPlusCancellationEventId(recurringUid);
  const existing = await findProviderEvent(ctx, externalEventId);
  if (existing) {
    return { ok: true, duplicate: true, eventId: externalEventId };
  }
  const event = mapPayPlusCancellation({
    businessId: args.businessId,
    plan,
    billingPeriod,
    recurringUid,
    periodStartAt,
    periodEndAt,
    now,
  });
  const applied = await applyVerifiedBillingEvent(ctx, event);
  await ctx.db.insert(
    'payplusProviderEvents',
    withoutUndefined({
      externalEventId,
      businessId: args.businessId,
      transactionType: 'recurring_invalid',
      status: applied.applied ? 'processed' : 'ignored',
      ignoredReason: applied.applied ? undefined : 'stale_event',
      recurringUid,
      providerEventAt: now,
      receivedAt: now,
      processedAt: now,
    })
  );
  if (!applied.applied) {
    return {
      ok: true,
      duplicate: false,
      ignored: true,
      code: 'stale_event',
      eventId: externalEventId,
    };
  }
  return {
    ok: true,
    duplicate: false,
    eventId: externalEventId,
    eventKind: 'cancellation' as const,
    status: 'canceled' as const,
    periodEndAt,
  };
}

export const getPayPlusCheckoutIntent = internalQuery({
  args: { checkoutId: v.string() },
  handler: async (ctx, args) => {
    const intent = await getCheckoutIntent(ctx, args.checkoutId);
    if (!intent) {
      return null;
    }
    return {
      checkoutId: intent.checkoutId,
      amount: intent.amount,
      currency: intent.currency,
      logicalProductId: intent.logicalProductId,
      pageRequestUid: intent.pageRequestUid ?? null,
      plan: intent.plan,
      billingPeriod: intent.billingPeriod,
    };
  },
});

export const preparePayPlusCheckout = internalMutation({
  args: {
    businessId: v.id('businesses'),
    plan: v.union(v.literal('starter'), v.literal('pro'), v.literal('premium')),
    billingPeriod: v.union(v.literal('monthly'), v.literal('yearly')),
  },
  handler: async (ctx, args) => {
    const { user, business } = await requirePayPlusOwner(ctx, args.businessId);
    const draft = await createPayPlusCheckoutRecord(ctx, {
      actorUserId: user._id,
      businessId: business._id,
      plan: args.plan,
      billingPeriod: args.billingPeriod,
    });
    const owner = await ctx.db.get(business.ownerUserId);
    return {
      checkoutId: draft.checkoutId,
      expiresAt: draft.expiresAt,
      amount: draft.amount,
      currency: draft.currency,
      plan: draft.plan,
      billingPeriod: draft.billingPeriod,
      logicalProductId: draft.logicalProductId,
      customerName: business.name,
      customerEmail: owner?.email ?? null,
    };
  },
});

export const markPayPlusCheckoutHosted = internalMutation({
  args: {
    checkoutId: v.string(),
    pageRequestUid: v.string(),
  },
  handler: async (ctx, args) => {
    const intent = await getCheckoutIntent(ctx, args.checkoutId);
    if (!intent) {
      throw new Error('PAYPLUS_UNKNOWN_TRANSACTION');
    }
    const now = Date.now();
    try {
      assertPayPlusCheckoutCanHost({ expiresAt: intent.expiresAt, now });
    } catch (error) {
      await ctx.db.patch(intent._id, { status: 'expired', updatedAt: now });
      throw error;
    }
    await ctx.db.patch(intent._id, {
      status: 'hosted_checkout_created',
      pageRequestUid: args.pageRequestUid,
      updatedAt: now,
    });
    return { ok: true as const };
  },
});

export const markPayPlusCheckoutRejected = internalMutation({
  args: {
    checkoutId: v.string(),
  },
  handler: async (ctx, args) => {
    const intent = await getCheckoutIntent(ctx, args.checkoutId);
    if (!intent || intent.status === 'verified') {
      return { ok: false as const };
    }
    await ctx.db.patch(intent._id, {
      status: 'rejected',
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const applyVerifiedPayPlusEvidence = internalMutation({
  args: {
    checkoutId: v.string(),
    transactionUid: v.string(),
    transactionType: v.string(),
    statusCode: v.string(),
    amount: v.number(),
    currency: v.string(),
    occurredAt: v.number(),
    recurringUid: v.optional(v.union(v.string(), v.null())),
    transactionIsCancelled: v.boolean(),
    invoiceUuid: v.optional(v.union(v.string(), v.null())),
    invoiceNumber: v.optional(v.union(v.string(), v.null())),
    invoiceOriginalUrl: v.optional(v.union(v.string(), v.null())),
    invoiceCopyUrl: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    return await applyVerifiedPayPlusEvidenceRecord(ctx, args);
  },
});

export const applyPayPlusCancellation = internalMutation({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, args) => {
    return await applyPayPlusCancellationRecord(ctx, args);
  },
});

export const getPayPlusRefundContext = internalQuery({
  args: {
    businessId: v.id('businesses'),
    transactionUid: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePayPlusOwner(ctx, args.businessId);
    const events = await ctx.db
      .query('payplusProviderEvents')
      .withIndex('by_businessId', (q: any) =>
        q.eq('businessId', args.businessId)
      )
      .collect();
    const charge = events.find(
      (event: any) =>
        event.status === 'processed' &&
        event.transactionUid === args.transactionUid &&
        String(event.transactionType).toLowerCase() === 'charge'
    );
    if (!charge?.checkoutId || typeof charge.amount !== 'number') {
      return { ok: false as const, code: 'PAYPLUS_UNKNOWN_TRANSACTION' };
    }
    const intent = await getCheckoutIntent(ctx, charge.checkoutId);
    if (!intent || !payPlusAmountsMatch(charge.amount, intent.amount)) {
      return { ok: false as const, code: 'PAYPLUS_AMOUNT_MISMATCH' };
    }
    return {
      ok: true as const,
      checkoutId: intent.checkoutId,
      transactionUid: args.transactionUid,
      amount: intent.amount,
      currency: 'ILS' as const,
      recurringUid: charge.recurringUid ?? null,
    };
  },
});

export const getPayPlusSubscriptionContext = internalQuery({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, args) => {
    await requirePayPlusOwner(ctx, args.businessId);
    const account = await getBillingAccountForBusiness(ctx, args.businessId);
    const plan = asPlan(account?.plan);
    const billingPeriod = asPeriod(account?.billingPeriod);
    return {
      provider: account?.provider ?? null,
      plan,
      billingPeriod,
      status: account?.status ?? null,
      recurringUid: account?.providerSubscriptionIdentifier ?? null,
      amount:
        plan && billingPeriod ? canonicalPlanAmount(plan, billingPeriod) : null,
      currentPeriodStartAt:
        typeof account?.currentPeriodStartAt === 'number'
          ? account.currentPeriodStartAt
          : null,
      currentPeriodEndAt:
        typeof account?.currentPeriodEndAt === 'number'
          ? account.currentPeriodEndAt
          : null,
    };
  },
});

export const createPayPlusHostedCheckout = action({
  args: {
    businessId: v.id('businesses'),
    plan: v.union(v.literal('starter'), v.literal('pro'), v.literal('premium')),
    billingPeriod: v.union(v.literal('monthly'), v.literal('yearly')),
  },
  handler: async (
    ctx,
    args
  ): Promise<ReturnType<typeof toHostedCheckoutClientResult>> => {
    const prepared = await ctx.runMutation(
      internal.payplusBilling.preparePayPlusCheckout,
      args
    );
    const clientBase = {
      checkoutId: prepared.checkoutId,
      expiresAt: prepared.expiresAt,
      amount: prepared.amount,
      currency: prepared.currency,
      plan: prepared.plan,
      billingPeriod: prepared.billingPeriod,
    };
    const config = resolvePayPlusConfig(process.env);
    if (
      !config.liveCheckoutEnabled ||
      !config.paymentPageUid ||
      !config.webOrigin ||
      !config.convexSiteUrl
    ) {
      return toHostedCheckoutClientResult({
        ...clientBase,
        ok: false,
        hosted: false,
        code: 'PAYPLUS_LIVE_DISABLED',
        missing: config.missingCheckout,
      });
    }
    if (!prepared.customerEmail || !prepared.customerName.trim()) {
      await ctx.runMutation(
        internal.payplusBilling.markPayPlusCheckoutRejected,
        {
          checkoutId: prepared.checkoutId,
        }
      );
      return toHostedCheckoutClientResult({
        ...clientBase,
        ok: false,
        hosted: false,
        code: prepared.customerEmail
          ? 'PAYPLUS_CUSTOMER_NAME_REQUIRED'
          : 'PAYPLUS_CUSTOMER_EMAIL_REQUIRED',
      });
    }
    try {
      const urls = buildPayPlusReturnUrls({
        webOrigin: config.webOrigin,
        convexSiteUrl: config.convexSiteUrl,
      });
      const response = await payPlusJsonRequest({
        config,
        path: 'PaymentPages/generateLink',
        body: buildPayPlusGenerateLinkBody({
          paymentPageUid: config.paymentPageUid,
          amount: prepared.amount,
          billingPeriod: prepared.billingPeriod,
          checkoutId: prepared.checkoutId,
          logicalProductId: prepared.logicalProductId,
          urls,
          customerName: prepared.customerName,
          customerEmail: prepared.customerEmail,
          now: Date.now(),
        }),
      });
      const link = parseGenerateLinkResponse(response);
      await ctx.runMutation(internal.payplusBilling.markPayPlusCheckoutHosted, {
        checkoutId: prepared.checkoutId,
        pageRequestUid: link.pageRequestUid,
      });
      return toHostedCheckoutClientResult({
        ...clientBase,
        ok: true,
        hosted: true,
        paymentPageLink: link.paymentPageLink,
      });
    } catch (error) {
      rethrowAuth(error);
      const code = payPlusErrorCode(error);
      if (code !== 'PAYPLUS_CHECKOUT_EXPIRED') {
        await ctx.runMutation(
          internal.payplusBilling.markPayPlusCheckoutRejected,
          {
            checkoutId: prepared.checkoutId,
          }
        );
      }
      return toHostedCheckoutClientResult({
        ...clientBase,
        ok: false,
        hosted: false,
        code,
      });
    }
  },
});

export const refundPayPlusTransaction = action({
  args: {
    businessId: v.id('businesses'),
    transactionUid: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<
    | { ok: false; code: string; missing?: string[] }
    | { ok: true; duplicate: boolean; eventId?: string }
  > => {
    const context = await ctx.runQuery(
      internal.payplusBilling.getPayPlusRefundContext,
      args
    );
    if (!context.ok) {
      return { ok: false as const, code: context.code };
    }
    const config = resolvePayPlusConfig(process.env);
    if (!config.liveCheckoutEnabled) {
      return {
        ok: false as const,
        code: 'PAYPLUS_LIVE_DISABLED',
        missing: config.missingCheckout,
      };
    }
    try {
      const response = await payPlusJsonRequest({
        config,
        path: 'Transactions/RefundByTransactionUID',
        body: buildRefundByTransactionUidBody({
          transactionUid: context.transactionUid,
          amount: context.amount,
        }),
      });
      const refund = parseRefundResponse(response);
      if (!refund.ok) {
        return refund;
      }
      if (
        refund.statusCode !== '000' ||
        refund.currency.toUpperCase() !== 'ILS' ||
        !payPlusAmountsMatch(refund.amount, context.amount) ||
        !payPlusRefundEvidenceCanApply({
          chargeTransactionUid: context.transactionUid,
          refundTransactionUid: refund.transactionUid,
        })
      ) {
        return { ok: false as const, code: 'PAYPLUS_REFUND_UNCONFIRMED' };
      }
      const applied = await ctx.runMutation(
        internal.payplusBilling.applyVerifiedPayPlusEvidence,
        {
          checkoutId: context.checkoutId,
          transactionUid: refund.transactionUid,
          transactionType: 'Refund',
          statusCode: refund.statusCode,
          amount: refund.amount,
          currency: refund.currency,
          occurredAt: refund.occurredAt ?? Date.now(),
          recurringUid: context.recurringUid,
          transactionIsCancelled: false,
        }
      );
      if (!applied.ok) {
        return { ok: false as const, code: 'PAYPLUS_REFUND_UNAPPLIED' };
      }
      return {
        ok: true as const,
        duplicate: applied.duplicate === true,
        eventId: applied.eventId,
      };
    } catch (error) {
      rethrowAuth(error);
      return { ok: false as const, code: payPlusErrorCode(error) };
    }
  },
});

export const cancelPayPlusRecurring = action({
  args: { businessId: v.id('businesses') },
  handler: async (
    ctx,
    args
  ): Promise<
    | { ok: false; code: string; missing?: string[] }
    | {
        ok: true;
        duplicate: boolean;
        eventId: string;
        ignored?: boolean;
        code?: string;
        eventKind?: string;
        status?: string;
        periodEndAt?: number;
      }
  > => {
    const context = await ctx.runQuery(
      internal.payplusBilling.getPayPlusSubscriptionContext,
      { businessId: args.businessId }
    );
    const config = resolvePayPlusConfig(process.env);
    if (!config.liveRecurringAdminEnabled || !config.terminalUid) {
      return {
        ok: false as const,
        code: 'PAYPLUS_LIVE_DISABLED',
        missing: config.missingRecurringAdmin,
      };
    }
    if (context.provider !== 'payplus' || !context.recurringUid) {
      return { ok: false as const, code: 'PAYPLUS_CANCELLATION_STATE_MISSING' };
    }
    try {
      const recurringUid = assertPayPlusResourceUid(context.recurringUid);
      const response = await payPlusJsonRequest({
        config,
        path: `RecurringPayments/${encodeURIComponent(recurringUid)}/Valid`,
        body: buildRecurringValidBody(config.terminalUid, false),
      });
      const ack = parseRecurringAck(response);
      if (!ack.ok) {
        return ack;
      }
      const applied = await ctx.runMutation(
        internal.payplusBilling.applyPayPlusCancellation,
        {
          businessId: args.businessId,
        }
      );
      if (applied.ok !== true || typeof applied.eventId !== 'string') {
        return {
          ok: false as const,
          code:
            typeof applied.code === 'string'
              ? applied.code
              : 'PAYPLUS_PROVIDER_ERROR',
        };
      }
      return {
        ok: true as const,
        duplicate: applied.duplicate === true,
        eventId: applied.eventId,
        ignored: applied.ignored,
        code: applied.code,
        eventKind: applied.eventKind,
        status: applied.status,
        periodEndAt: applied.periodEndAt,
      };
    } catch (error) {
      rethrowAuth(error);
      return { ok: false as const, code: payPlusErrorCode(error) };
    }
  },
});

export const createPayPlusPaymentMethodUpdate = action({
  args: { businessId: v.id('businesses') },
  handler: async (
    ctx,
    args
  ): Promise<
    { ok: false; code: string } | { ok: true; paymentPageLink: string }
  > => {
    const context = await ctx.runQuery(
      internal.payplusBilling.getPayPlusSubscriptionContext,
      { businessId: args.businessId }
    );
    const config = resolvePayPlusConfig(process.env);
    if (!config.liveRecurringAdminEnabled || !config.terminalUid) {
      return { ok: false as const, code: 'PAYPLUS_LIVE_DISABLED' };
    }
    if (!context.recurringUid) {
      return { ok: false as const, code: 'PAYPLUS_RECURRING_UID_REQUIRED' };
    }
    try {
      const recurringUid = assertPayPlusResourceUid(context.recurringUid);
      const response = await payPlusJsonRequest({
        config,
        path: `RecurringPayments/CreditCardRenewal/${encodeURIComponent(recurringUid)}`,
        body: buildCreditCardRenewalBody(config.terminalUid),
      });
      return parseCreditCardRenewalResponse(response);
    } catch (error) {
      rethrowAuth(error);
      return { ok: false as const, code: payPlusErrorCode(error) };
    }
  },
});

export const reconcilePayPlusBilling = action({
  args: { businessId: v.id('businesses') },
  handler: async (
    ctx,
    args
  ): Promise<{
    ok: boolean;
    code?: string;
    discrepancies: string[];
    observations: string[];
    snapshot: {
      uid: string | null;
      currencyCode: string | null;
      amount: number | null;
      numberOfCharges: number | null;
      recurringType: number | null;
      recurringRange: number | null;
      valid: boolean | null;
    } | null;
  }> => {
    const context = await ctx.runQuery(
      internal.payplusBilling.getPayPlusSubscriptionContext,
      { businessId: args.businessId }
    );
    const config = resolvePayPlusConfig(process.env);
    if (
      !config.liveRecurringAdminEnabled ||
      !config.terminalUid ||
      !context.recurringUid ||
      context.amount === null ||
      !context.billingPeriod
    ) {
      const comparison = comparePayPlusRecurringSnapshot({
        provider: context.provider,
        recurringUid: context.recurringUid,
        amount: context.amount ?? 0,
        billingPeriod: context.billingPeriod ?? 'monthly',
        view: null,
      });
      return {
        ok: false as const,
        code: config.liveRecurringAdminEnabled
          ? 'PAYPLUS_RECONCILIATION_CONTEXT_MISSING'
          : 'PAYPLUS_LIVE_DISABLED',
        discrepancies: comparison.discrepancies,
        observations: comparison.observations,
        snapshot: null,
      };
    }
    try {
      const recurringUid = assertPayPlusResourceUid(context.recurringUid);
      const view = await payPlusJsonRequest({
        config,
        method: 'GET',
        path: `RecurringPayments/${encodeURIComponent(recurringUid)}/ViewRecurring?terminal_uid=${encodeURIComponent(config.terminalUid)}`,
        transport: defaultPayPlusTransport,
      });
      const comparison = comparePayPlusRecurringSnapshot({
        provider: context.provider,
        recurringUid: context.recurringUid,
        amount: context.amount,
        billingPeriod: context.billingPeriod,
        view,
      });
      return {
        ok: true as const,
        discrepancies: comparison.discrepancies,
        observations: comparison.observations,
        snapshot: comparison.snapshot,
      };
    } catch (error) {
      rethrowAuth(error);
      return {
        ok: false as const,
        code: payPlusErrorCode(error),
        discrepancies: [],
        observations: [],
        snapshot: null,
      };
    }
  },
});
