import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  action,
  internalAction,
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
import type {
  BillingPeriod,
  BusinessPlan,
} from './lib/billing/productionContract';
import {
  isBillingPeriod,
  isBusinessPlan,
  isLogicalSubscriptionProductId,
} from './lib/billing/productionContract';
import {
  assertSumitCheckoutCanHost,
  buildSumitCheckoutDraft,
  buildSumitHostedCheckoutUrl,
  sumitAmountsMatch,
  toSumitHostedCheckoutClientResult,
} from './lib/billing/sumit/checkout';
import {
  buildSumitReturnUrls,
  resolveSumitConfig,
  type SumitConfig,
  sumitConfigErrorCode,
} from './lib/billing/sumit/config';
import {
  mapSumitCancellation,
  mapVerifiedSumitPaymentEvidence,
  mapVerifiedSumitRefund,
} from './lib/billing/sumit/mapToCanonical';
import {
  buildSumitCancelRecurringBody,
  compareSumitRecurringSnapshot,
  fetchSumitDocumentMetadata,
  fetchSumitPayment,
  fetchSumitPayments,
  fetchSumitRecurringItems,
  parseSumitAck,
  type SumitTransport,
  sumitJsonRequest,
} from './lib/billing/sumit/providerClient';
import {
  type NormalizedSumitPayment,
  type NormalizedSumitRecurringItem,
  sumitCancellationEventId,
  sumitPaymentEventId,
  verifySumitCancellationEvidence,
  verifySumitPaymentEvidence,
  verifySumitRefundEvidence,
} from './lib/billing/sumit/verify';
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

function sumitErrorCode(error: unknown): string {
  rethrowAuth(error);
  if (error instanceof Error && error.message.startsWith('SUMIT_')) {
    return error.message;
  }
  return 'SUMIT_PROVIDER_ERROR';
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
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
}

function configuredProduct(config: SumitConfig, logicalProductId: unknown) {
  return isLogicalSubscriptionProductId(logicalProductId)
    ? config.products[logicalProductId]
    : undefined;
}

async function requireSumitOwner(
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

async function getCheckoutIntent(ctx: any, checkoutId: string) {
  return await ctx.db
    .query('sumitCheckoutIntents')
    .withIndex('by_checkoutId', (q: any) => q.eq('checkoutId', checkoutId))
    .first();
}

async function findProviderEvent(ctx: any, externalEventId: string) {
  return await ctx.db
    .query('sumitProviderEvents')
    .withIndex('by_externalEventId', (q: any) =>
      q.eq('externalEventId', externalEventId)
    )
    .first();
}

export async function createSUMITCheckoutRecord(
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
  const draft = buildSumitCheckoutDraft({
    checkoutId: args.checkoutId ?? `su_${generateOpaqueToken(24)}`,
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
  const existing = await getCheckoutIntent(ctx, draft.checkoutId);
  if (existing) {
    throw new Error('SUMIT_CHECKOUT_ID_CONFLICT');
  }
  await ensureBusinessBillingAccount(ctx, {
    businessId: business._id,
    ownerUserId: business.ownerUserId,
    now,
  });
  const id = await ctx.db.insert('sumitCheckoutIntents', {
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
  return { ...draft, _id: id };
}

async function recordIgnoredSumitPayment(
  ctx: any,
  args: {
    externalEventId: string;
    intent: any;
    paymentId: string;
    customerId: string;
    recurringId?: string | null;
    documentId?: string | null;
    amount: number;
    currency: string;
    providerProductId: string;
    occurredAt: number;
    reason: string;
    now: number;
  }
) {
  await ctx.db.insert(
    'sumitProviderEvents',
    withoutUndefined({
      externalEventId: args.externalEventId,
      checkoutId: args.intent.checkoutId,
      businessId: args.intent.businessId,
      sumitPaymentId: args.paymentId,
      sumitCustomerId: args.customerId,
      sumitRecurringId: definedString(args.recurringId),
      sumitDocumentId: definedString(args.documentId),
      eventType: 'payment_ignored',
      status: 'ignored',
      ignoredReason: args.reason,
      amount: args.currency === 'ILS' ? args.amount : undefined,
      currency: args.currency === 'ILS' ? 'ILS' : undefined,
      providerProductId: args.providerProductId,
      providerEventAt: args.occurredAt,
      receivedAt: args.now,
      processedAt: args.now,
    })
  );
}

export async function applyVerifiedSUMITPaymentRecord(
  ctx: any,
  args: {
    checkoutId: string;
    paymentId: string;
    customerId: string;
    validPayment: boolean;
    amount: number;
    currency: string;
    occurredAt: number;
    recurringId?: string | null;
    providerProductId: string;
    providerEnvironment: 'test';
    documentId?: string | null;
    documentNumber?: string | null;
    documentType?: string | null;
    documentUrl?: string | null;
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  const externalEventId = sumitPaymentEventId(
    args.paymentId,
    args.validPayment
  );
  const existing = await findProviderEvent(ctx, externalEventId);
  if (existing) {
    return { ok: true, duplicate: true, eventId: externalEventId };
  }
  const intent = await getCheckoutIntent(ctx, args.checkoutId);
  if (!intent) {
    return { ok: false, code: 'SUMIT_UNKNOWN_CHECKOUT' };
  }
  const business = await ctx.db.get(intent.businessId);
  if (!business) {
    return { ok: false, code: 'SUMIT_UNKNOWN_CHECKOUT' };
  }
  if (String(business.ownerUserId) !== String(intent.ownerUserId)) {
    return { ok: false, code: 'SUMIT_OWNER_MISMATCH' };
  }
  if (
    !sumitAmountsMatch(args.amount, intent.amount) ||
    args.currency !== 'ILS'
  ) {
    return {
      ok: false,
      code:
        args.currency === 'ILS'
          ? 'SUMIT_AMOUNT_MISMATCH'
          : 'SUMIT_CURRENCY_MISMATCH',
    };
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
    .query('sumitProviderEvents')
    .withIndex('by_businessId', (q: any) =>
      q.eq('businessId', intent.businessId)
    )
    .collect();
  const priorSuccessfulPaymentCount = providerEvents.filter(
    (event: any) =>
      event.status === 'processed' && event.eventType === 'payment_succeeded'
  ).length;
  const mapped = mapVerifiedSumitPaymentEvidence({
    businessId: intent.businessId,
    plan: intent.plan,
    billingPeriod: intent.billingPeriod,
    expectedAmount: intent.amount,
    paymentId: args.paymentId,
    validPayment: args.validPayment,
    amount: args.amount,
    currency: args.currency,
    occurredAt: args.occurredAt,
    recurringId: args.recurringId ?? null,
    providerProductId: args.providerProductId,
    priorSuccessfulPaymentCount,
    currentProvider:
      typeof billingAccount?.provider === 'string'
        ? billingAccount.provider
        : null,
    currentPlan: asPlan(billingAccount?.plan),
    currentPeriod: asPeriod(billingAccount?.billingPeriod),
    currentStatus:
      typeof billingAccount?.status === 'string' ? billingAccount.status : null,
    currentRecurringId:
      typeof billingAccount?.providerSubscriptionIdentifier === 'string'
        ? billingAccount.providerSubscriptionIdentifier
        : null,
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
    await recordIgnoredSumitPayment(ctx, {
      externalEventId,
      intent,
      paymentId: args.paymentId,
      customerId: args.customerId,
      recurringId: args.recurringId,
      documentId: args.documentId,
      amount: args.amount,
      currency: args.currency,
      providerProductId: args.providerProductId,
      occurredAt: args.occurredAt,
      reason: mapped.code,
      now,
    });
    return mapped;
  }

  const applied = await applyVerifiedBillingEvent(ctx, mapped.event);
  await ctx.db.insert(
    'sumitProviderEvents',
    withoutUndefined({
      externalEventId,
      checkoutId: intent.checkoutId,
      businessId: intent.businessId,
      sumitPaymentId: args.paymentId,
      sumitCustomerId: args.customerId,
      sumitRecurringId: definedString(args.recurringId),
      sumitDocumentId: definedString(args.documentId),
      eventType: args.validPayment ? 'payment_succeeded' : 'payment_failed',
      status: applied.applied ? 'processed' : 'ignored',
      ignoredReason: applied.applied ? undefined : 'stale_event',
      amount: args.amount,
      currency: 'ILS',
      providerProductId: args.providerProductId,
      providerEventAt: args.occurredAt,
      canonicalPeriodStartAt: mapped.event.periodStartAt,
      canonicalPeriodEndAt: mapped.event.periodEndAt ?? undefined,
      documentNumber: definedString(args.documentNumber),
      documentType: definedString(args.documentType),
      documentUrl: httpsOrUndefined(args.documentUrl),
      receivedAt: now,
      processedAt: now,
    })
  );
  if (applied.applied && billingAccount) {
    await ctx.db.patch(billingAccount._id, {
      providerEnvironment: args.providerEnvironment,
    });
  }
  if (applied.applied) {
    await ctx.db.patch(
      intent._id,
      withoutUndefined({
        status: args.validPayment ? 'verified' : intent.status,
        sumitCustomerId: args.customerId,
        sumitRecurringId: definedString(args.recurringId),
        sumitPaymentId: intent.sumitPaymentId ?? args.paymentId,
        sumitDocumentId:
          intent.sumitDocumentId ?? definedString(args.documentId),
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
    periodEndAt: mapped.event.periodEndAt,
  };
}

export async function applySUMITCancellationRecord(
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
  const recurringId =
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
  const providerProductId =
    typeof billingAccount?.providerProductId === 'string' &&
    billingAccount.providerProductId.trim()
      ? billingAccount.providerProductId
      : null;
  if (
    !billingAccount ||
    billingAccount.provider !== 'sumit' ||
    !plan ||
    !billingPeriod ||
    !recurringId ||
    !providerProductId ||
    periodStartAt === null ||
    periodEndAt === null
  ) {
    return { ok: false, code: 'SUMIT_CANCELLATION_STATE_MISSING' };
  }
  const externalEventId = sumitCancellationEventId(recurringId);
  if (await findProviderEvent(ctx, externalEventId)) {
    return { ok: true, duplicate: true, eventId: externalEventId };
  }
  const event = mapSumitCancellation({
    businessId: args.businessId,
    plan,
    billingPeriod,
    recurringId,
    providerProductId,
    periodStartAt,
    periodEndAt,
    now,
  });
  const applied = await applyVerifiedBillingEvent(ctx, event);
  await ctx.db.insert(
    'sumitProviderEvents',
    withoutUndefined({
      externalEventId,
      businessId: args.businessId,
      sumitRecurringId: recurringId,
      eventType: 'recurring_canceled',
      status: applied.applied ? 'processed' : 'ignored',
      ignoredReason: applied.applied ? undefined : 'stale_event',
      providerProductId: event.providerProductId ?? undefined,
      providerEventAt: now,
      receivedAt: now,
      processedAt: now,
    })
  );
  return applied.applied
    ? {
        ok: true,
        duplicate: false,
        eventId: externalEventId,
        status: 'canceled' as const,
        periodEndAt,
      }
    : {
        ok: true,
        duplicate: false,
        ignored: true,
        code: 'stale_event',
        eventId: externalEventId,
      };
}

export async function applyVerifiedSUMITRefundRecord(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    originalPaymentId: string;
    referencedPaymentId: string;
    refundId: string;
    successful: boolean;
    amount: number;
    currency: string;
    occurredAt: number;
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  const payments = await ctx.db
    .query('sumitProviderEvents')
    .withIndex('by_sumitPaymentId', (q: any) =>
      q.eq('sumitPaymentId', args.originalPaymentId)
    )
    .collect();
  const charge = payments.find(
    (event: any) =>
      String(event.businessId) === String(args.businessId) &&
      event.status === 'processed' &&
      event.eventType === 'payment_succeeded'
  );
  if (!charge || typeof charge.amount !== 'number') {
    return { ok: false, code: 'SUMIT_REFUND_REFERENCE_MISMATCH' };
  }
  const verification = verifySumitRefundEvidence({
    refundId: args.refundId,
    originalPaymentId: args.originalPaymentId,
    referencedPaymentId: args.referencedPaymentId,
    successful: args.successful,
    amount: args.amount,
    expectedAmount: charge.amount,
    currency: args.currency,
  });
  if (!verification.ok) {
    return verification;
  }
  if (await findProviderEvent(ctx, verification.externalEventId)) {
    return {
      ok: true,
      duplicate: true,
      eventId: verification.externalEventId,
    };
  }
  const account = await getBillingAccountForBusiness(ctx, args.businessId);
  const plan = asPlan(account?.plan);
  const billingPeriod = asPeriod(account?.billingPeriod);
  const recurringId =
    typeof account?.providerSubscriptionIdentifier === 'string'
      ? account.providerSubscriptionIdentifier
      : null;
  const periodStartAt =
    typeof account?.currentPeriodStartAt === 'number'
      ? account.currentPeriodStartAt
      : null;
  const periodEndAt =
    typeof account?.currentPeriodEndAt === 'number'
      ? account.currentPeriodEndAt
      : null;
  if (
    account?.provider !== 'sumit' ||
    !plan ||
    !billingPeriod ||
    !recurringId ||
    periodStartAt === null ||
    periodEndAt === null
  ) {
    return { ok: false, code: 'SUMIT_REFUND_STATE_MISSING' };
  }
  if (
    charge.sumitRecurringId !== recurringId ||
    charge.currency !== 'ILS' ||
    charge.canonicalPeriodStartAt !== periodStartAt ||
    charge.canonicalPeriodEndAt !== periodEndAt ||
    (typeof account.providerProductId === 'string' &&
      charge.providerProductId !== account.providerProductId)
  ) {
    return { ok: false, code: 'SUMIT_REFUND_PERIOD_MISMATCH' };
  }
  const event = mapVerifiedSumitRefund({
    externalEventId: verification.externalEventId,
    businessId: args.businessId,
    plan,
    billingPeriod,
    recurringId,
    providerProductId:
      typeof charge.providerProductId === 'string'
        ? charge.providerProductId
        : `${plan}_${billingPeriod}`,
    periodStartAt,
    occurredAt: args.occurredAt,
    now,
  });
  const applied = await applyVerifiedBillingEvent(ctx, event);
  await ctx.db.insert(
    'sumitProviderEvents',
    withoutUndefined({
      externalEventId: event.externalEventId,
      businessId: args.businessId,
      sumitPaymentId: args.originalPaymentId,
      sumitRecurringId: recurringId,
      eventType: 'refund',
      status: applied.applied ? 'processed' : 'ignored',
      ignoredReason: applied.applied ? undefined : 'stale_event',
      amount: args.amount,
      currency: 'ILS',
      providerProductId: event.providerProductId ?? undefined,
      providerEventAt: args.occurredAt,
      receivedAt: now,
      processedAt: now,
    })
  );
  return {
    ok: true,
    duplicate: false,
    ignored: !applied.applied,
    eventId: event.externalEventId,
  };
}

export const prepareSUMITCheckout = internalMutation({
  args: {
    businessId: v.id('businesses'),
    plan: v.union(v.literal('starter'), v.literal('pro'), v.literal('premium')),
    billingPeriod: v.union(v.literal('monthly'), v.literal('yearly')),
  },
  handler: async (ctx, args) => {
    const { user, business } = await requireSumitOwner(ctx, args.businessId);
    return await createSUMITCheckoutRecord(ctx, {
      actorUserId: user._id,
      businessId: business._id,
      plan: args.plan,
      billingPeriod: args.billingPeriod,
    });
  },
});

export const markSUMITCheckoutHosted = internalMutation({
  args: { checkoutId: v.string() },
  handler: async (ctx, args) => {
    const intent = await getCheckoutIntent(ctx, args.checkoutId);
    if (!intent) {
      throw new Error('SUMIT_UNKNOWN_CHECKOUT');
    }
    const now = Date.now();
    try {
      assertSumitCheckoutCanHost({ expiresAt: intent.expiresAt, now });
    } catch (error) {
      await ctx.db.patch(intent._id, { status: 'expired', updatedAt: now });
      throw error;
    }
    await ctx.db.patch(intent._id, {
      status: 'hosted_checkout_created',
      updatedAt: now,
    });
    return { ok: true as const };
  },
});

export const markSUMITCheckoutRejected = internalMutation({
  args: { checkoutId: v.string() },
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

export const getSUMITVerificationContext = internalQuery({
  args: { checkoutId: v.string() },
  handler: async (ctx, args) => {
    const intent = await getCheckoutIntent(ctx, args.checkoutId);
    if (!intent) {
      throw new Error('SUMIT_UNKNOWN_CHECKOUT');
    }
    await requireSumitOwner(ctx, intent.businessId);
    return {
      checkoutId: intent.checkoutId,
      businessId: intent.businessId,
      amount: intent.amount,
      currency: intent.currency,
      plan: intent.plan,
      billingPeriod: intent.billingPeriod,
      logicalProductId: intent.logicalProductId,
      sumitCustomerId: intent.sumitCustomerId ?? null,
      sumitRecurringId: intent.sumitRecurringId ?? null,
      createdAt: intent.createdAt,
    };
  },
});

function toSUMITCheckoutContext(intent: any) {
  return {
    checkoutId: intent.checkoutId,
    plan: intent.plan,
    amount: intent.amount,
    billingPeriod: intent.billingPeriod,
    logicalProductId: intent.logicalProductId,
    sumitCustomerId: intent.sumitCustomerId ?? null,
    sumitRecurringId: intent.sumitRecurringId ?? null,
    createdAt: intent.createdAt,
  };
}

export async function resolveSUMITSubscriptionCheckout(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    account: any | null;
  }
) {
  const providerSubscriptionId =
    typeof args.account?.providerSubscriptionIdentifier === 'string'
      ? args.account.providerSubscriptionIdentifier
      : null;
  if (providerSubscriptionId) {
    if (args.account?.provider !== 'sumit') {
      return null;
    }
    const indexed = await ctx.db
      .query('sumitCheckoutIntents')
      .withIndex('by_sumitRecurringId', (q: any) =>
        q.eq('sumitRecurringId', providerSubscriptionId)
      )
      .take(3);
    const matchingBusiness = indexed.filter(
      (intent: any) => String(intent.businessId) === String(args.businessId)
    );
    return matchingBusiness.length === 1 ? matchingBusiness[0] : null;
  }

  const recent = await ctx.db
    .query('sumitCheckoutIntents')
    .withIndex('by_businessId_createdAt', (q: any) =>
      q.eq('businessId', args.businessId)
    )
    .order('desc')
    .take(20);
  return (
    recent.find(
      (intent: any) =>
        intent.status === 'pending' ||
        intent.status === 'hosted_checkout_created'
    ) ?? null
  );
}

async function buildSUMITSubscriptionContext(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const account = await getBillingAccountForBusiness(ctx, businessId);
  const plan = asPlan(account?.plan);
  const billingPeriod = asPeriod(account?.billingPeriod);
  const intent = await resolveSUMITSubscriptionCheckout(ctx, {
    businessId,
    account,
  });
  return {
    provider: account?.provider ?? null,
    plan,
    billingPeriod,
    status: account?.status ?? null,
    recurringId: account?.providerSubscriptionIdentifier ?? null,
    currentPeriodStartAt:
      typeof account?.currentPeriodStartAt === 'number'
        ? account.currentPeriodStartAt
        : null,
    currentPeriodEndAt:
      typeof account?.currentPeriodEndAt === 'number'
        ? account.currentPeriodEndAt
        : null,
    lastProviderEventAt:
      typeof account?.lastProviderEventAt === 'number'
        ? account.lastProviderEventAt
        : null,
    checkout: intent ? toSUMITCheckoutContext(intent) : null,
  };
}

export const getSUMITSubscriptionContext = internalQuery({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, args) => {
    await requireSumitOwner(ctx, args.businessId);
    return await buildSUMITSubscriptionContext(ctx, args.businessId);
  },
});

export const getSUMITServerReconciliationContext = internalQuery({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error('BUSINESS_NOT_FOUND');
    }
    return await buildSUMITSubscriptionContext(ctx, args.businessId);
  },
});

export const applyVerifiedSUMITPayment = internalMutation({
  args: {
    checkoutId: v.string(),
    paymentId: v.string(),
    customerId: v.string(),
    validPayment: v.boolean(),
    amount: v.number(),
    currency: v.string(),
    occurredAt: v.number(),
    recurringId: v.optional(v.union(v.string(), v.null())),
    providerProductId: v.string(),
    providerEnvironment: v.literal('test'),
    documentId: v.optional(v.union(v.string(), v.null())),
    documentNumber: v.optional(v.union(v.string(), v.null())),
    documentType: v.optional(v.union(v.string(), v.null())),
    documentUrl: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    return await applyVerifiedSUMITPaymentRecord(ctx, args);
  },
});

export const applySUMITCancellation = internalMutation({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, args) => {
    return await applySUMITCancellationRecord(ctx, args);
  },
});

export const applyVerifiedSUMITRefund = internalMutation({
  args: {
    businessId: v.id('businesses'),
    originalPaymentId: v.string(),
    referencedPaymentId: v.string(),
    refundId: v.string(),
    successful: v.boolean(),
    amount: v.number(),
    currency: v.string(),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await applyVerifiedSUMITRefundRecord(ctx, args);
  },
});

export async function verifyAndApplyPayment(
  ctx: any,
  args: {
    config: SumitConfig;
    context: any;
    payment: NormalizedSumitPayment;
    recurringItems?: NormalizedSumitRecurringItem[];
    documentTransport?: SumitTransport;
  }
) {
  if (!args.config.liveApiEnabled) {
    return {
      ok: false as const,
      code: sumitConfigErrorCode(args.config),
      missing: args.config.missingApi,
    };
  }
  const product = configuredProduct(args.config, args.context.logicalProductId);
  if (!product) {
    return { ok: false as const, code: 'SUMIT_CONFIG_MISSING' };
  }
  const recurringItems =
    args.recurringItems ??
    (args.payment.validPayment
      ? await fetchSumitRecurringItems({
          config: args.config,
          customerId: args.payment.customerId,
        })
      : []);
  const verified = verifySumitPaymentEvidence({
    payment: args.payment,
    intent: args.context,
    expectedProductId: product.productId,
    recurringItems,
  });
  if (!verified.ok) {
    return verified;
  }
  let document = null;
  if (verified.evidence.documentId) {
    try {
      document = await fetchSumitDocumentMetadata({
        config: args.config,
        documentId: verified.evidence.documentId,
        transport: args.documentTransport,
      });
    } catch {
      document = null;
    }
  }
  return await ctx.runMutation(
    internal.sumitBilling.applyVerifiedSUMITPayment,
    {
      checkoutId: args.context.checkoutId,
      paymentId: verified.evidence.paymentId,
      customerId: verified.evidence.customerId,
      validPayment: verified.evidence.validPayment,
      amount: verified.evidence.amount,
      currency: verified.evidence.currency,
      occurredAt: verified.evidence.occurredAt,
      recurringId: verified.evidence.recurringId,
      providerProductId: verified.evidence.providerProductId,
      providerEnvironment: 'test',
      documentId: document?.documentId ?? verified.evidence.documentId,
      documentNumber: document?.documentNumber ?? null,
      documentType: document?.documentType ?? null,
      documentUrl: document?.documentUrl ?? null,
    }
  );
}

export const createSUMITCheckout = action({
  args: {
    businessId: v.id('businesses'),
    plan: v.union(v.literal('starter'), v.literal('pro'), v.literal('premium')),
    billingPeriod: v.union(v.literal('monthly'), v.literal('yearly')),
  },
  handler: async (ctx, args): Promise<any> => {
    const prepared = await ctx.runMutation(
      internal.sumitBilling.prepareSUMITCheckout,
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
    try {
      const config = resolveSumitConfig(process.env);
      const product = configuredProduct(config, prepared.logicalProductId);
      if (!config.liveCheckoutEnabled || !config.webOrigin || !product) {
        return toSumitHostedCheckoutClientResult({
          ...clientBase,
          ok: false,
          hosted: false,
          code: sumitConfigErrorCode(config),
          missing: config.missingCheckout,
        });
      }
      const paymentPageLink = buildSumitHostedCheckoutUrl({
        hostedUrl: product.hostedUrl,
        checkoutId: prepared.checkoutId,
        amount: prepared.amount,
      });
      const returnUrls = buildSumitReturnUrls(config.webOrigin);
      await ctx.runMutation(internal.sumitBilling.markSUMITCheckoutHosted, {
        checkoutId: prepared.checkoutId,
      });
      return toSumitHostedCheckoutClientResult({
        ...clientBase,
        ok: true,
        hosted: true,
        paymentPageLink,
        successUrl: returnUrls.success,
        cancelUrl: returnUrls.cancel,
      });
    } catch (error) {
      rethrowAuth(error);
      const code = sumitErrorCode(error);
      if (code !== 'SUMIT_CHECKOUT_EXPIRED') {
        await ctx.runMutation(internal.sumitBilling.markSUMITCheckoutRejected, {
          checkoutId: prepared.checkoutId,
        });
      }
      return toSumitHostedCheckoutClientResult({
        ...clientBase,
        ok: false,
        hosted: false,
        code,
      });
    }
  },
});

export const verifySUMITCheckoutPayment = action({
  args: { checkoutId: v.string(), paymentId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const context = await ctx.runQuery(
      internal.sumitBilling.getSUMITVerificationContext,
      { checkoutId: args.checkoutId }
    );
    try {
      const config = resolveSumitConfig(process.env);
      if (!config.liveApiEnabled) {
        return {
          ok: false as const,
          code: sumitConfigErrorCode(config),
          missing: config.missingApi,
        };
      }
      const payment = await fetchSumitPayment({
        config,
        paymentId: args.paymentId,
      });
      return await verifyAndApplyPayment(ctx, { config, context, payment });
    } catch (error) {
      rethrowAuth(error);
      return { ok: false as const, code: sumitErrorCode(error) };
    }
  },
});

export const cancelSUMITRecurring = action({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, args): Promise<any> => {
    const context = await ctx.runQuery(
      internal.sumitBilling.getSUMITSubscriptionContext,
      args
    );
    if (
      context.provider !== 'sumit' ||
      !context.recurringId ||
      !context.checkout?.sumitCustomerId
    ) {
      return { ok: false as const, code: 'SUMIT_CANCELLATION_STATE_MISSING' };
    }
    try {
      const config = resolveSumitConfig(process.env);
      if (!config.liveApiEnabled) {
        return {
          ok: false as const,
          code: sumitConfigErrorCode(config),
          missing: config.missingApi,
        };
      }
      const response = await sumitJsonRequest({
        config,
        path: 'billing/recurring/cancel/',
        body: buildSumitCancelRecurringBody({
          customerId: context.checkout.sumitCustomerId,
          recurringId: context.recurringId,
        }),
      });
      const ack = parseSumitAck(response);
      if (!ack.ok) {
        return ack;
      }
      const recurringItems = await fetchSumitRecurringItems({
        config,
        customerId: context.checkout.sumitCustomerId,
      });
      if (
        !verifySumitCancellationEvidence({
          recurringId: context.recurringId,
          recurringItems,
        })
      ) {
        return {
          ok: false as const,
          code: 'SUMIT_CANCELLATION_UNCONFIRMED',
        };
      }
      return await ctx.runMutation(
        internal.sumitBilling.applySUMITCancellation,
        args
      );
    } catch (error) {
      rethrowAuth(error);
      return { ok: false as const, code: sumitErrorCode(error) };
    }
  },
});

export const createSUMITPaymentMethodUpdate = action({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.sumitBilling.getSUMITSubscriptionContext, args);
    return {
      ok: false as const,
      code: 'SUMIT_CARD_UPDATE_VERIFY_REQUIRED',
    };
  },
});

export const refundSUMITPayment = action({
  args: { businessId: v.id('businesses'), paymentId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.sumitBilling.getSUMITSubscriptionContext, {
      businessId: args.businessId,
    });
    return {
      ok: false as const,
      code: 'SUMIT_REFUND_VERIFY_REQUIRED',
    };
  },
});

export async function reconcileSUMITBillingServer(
  ctx: any,
  args: { context: any; config?: SumitConfig }
): Promise<any> {
  const { context } = args;
  if (!context.checkout) {
    return {
      ok: false as const,
      code: 'SUMIT_RECONCILIATION_CONTEXT_MISSING',
      applied: [],
      discrepancies: ['missing_checkout_intent'],
      observations: [],
      latestPayment: null,
      recurringSnapshot: null,
    };
  }
  const checkout = context.checkout;
  try {
    const config = args.config ?? resolveSumitConfig(process.env);
    const product = configuredProduct(config, checkout.logicalProductId);
    if (!config.liveApiEnabled || !product) {
      return {
        ok: false as const,
        code: sumitConfigErrorCode(config),
        missing: config.liveApiEnabled
          ? [`SUMIT_PRODUCTS_JSON:${checkout.logicalProductId}`]
          : config.missingApi,
        applied: [],
        discrepancies: [],
        observations: [],
        latestPayment: null,
        recurringSnapshot: null,
      };
    }
    const now = Date.now();
    const dateFrom =
      (context.lastProviderEventAt ?? checkout.createdAt) - 24 * 60 * 60 * 1000;
    const payments = await fetchSumitPayments({
      config,
      dateFrom,
      dateTo: now + 60 * 1000,
    });
    const recurringId = context.recurringId ?? checkout.sumitRecurringId;
    const candidates = payments
      .filter(
        (payment) =>
          payment.externalIdentifier === checkout.checkoutId ||
          (recurringId !== null && payment.recurringIds.includes(recurringId))
      )
      .sort((left, right) => left.occurredAt - right.occurredAt);
    const customerId =
      checkout.sumitCustomerId ?? candidates.at(-1)?.customerId ?? null;
    const recurringItems = customerId
      ? await fetchSumitRecurringItems({ config, customerId })
      : [];
    const applied = [];
    for (const payment of candidates) {
      applied.push(
        await verifyAndApplyPayment(ctx, {
          config,
          context: checkout,
          payment,
          recurringItems,
        })
      );
    }
    const comparison = compareSumitRecurringSnapshot({
      provider: context.provider,
      recurringId,
      plan: context.plan ?? checkout.plan,
      billingPeriod: context.billingPeriod ?? checkout.billingPeriod,
      expectedProductId: product.productId,
      items: recurringItems,
    });
    const latest = candidates.at(-1) ?? null;
    return {
      ok: true as const,
      applied,
      discrepancies: comparison.discrepancies,
      observations: comparison.observations,
      latestPayment: latest
        ? {
            paymentId: latest.paymentId,
            validPayment: latest.validPayment,
            occurredAt: latest.occurredAt,
            amount: latest.amount,
            currency: latest.currency,
          }
        : null,
      recurringSnapshot: comparison.snapshot,
    };
  } catch (error) {
    rethrowAuth(error);
    return {
      ok: false as const,
      code: sumitErrorCode(error),
      applied: [],
      discrepancies: [],
      observations: [],
      latestPayment: null,
      recurringSnapshot: null,
    };
  }
}

export const reconcileSUMITBilling = action({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, args): Promise<any> => {
    const context = await ctx.runQuery(
      internal.sumitBilling.getSUMITSubscriptionContext,
      args
    );
    return await reconcileSUMITBillingServer(ctx, { context });
  },
});

export const reconcileSUMITBillingInternal = internalAction({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, args): Promise<any> => {
    const context = await ctx.runQuery(
      internal.sumitBilling.getSUMITServerReconciliationContext,
      args
    );
    return await reconcileSUMITBillingServer(ctx, { context });
  },
});
