import {
  BILLING_CURRENCY,
  type BillingPeriod,
  type BusinessPlan,
  getCanonicalSubscriptionPrice,
  isBillingPeriod,
  isBusinessPlan,
  isLogicalSubscriptionProductId,
  type LogicalSubscriptionProductId,
} from '../productionContract';
import { assertOfficialSumitHostedUrl } from './config';

export const SUMIT_CHECKOUT_TTL_MS = 30 * 60 * 1000;

export type SumitCheckoutDraft = {
  checkoutId: string;
  businessId: string;
  ownerUserId: string;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  logicalProductId: LogicalSubscriptionProductId;
  amount: number;
  currency: typeof BILLING_CURRENCY;
  status: 'pending';
  createdAt: number;
  expiresAt: number;
  updatedAt: number;
};

export function sumitAmountsMatch(actual: number, expected: number): boolean {
  return (
    Number.isFinite(actual) &&
    Number.isFinite(expected) &&
    Math.round(actual * 100) === Math.round(expected * 100)
  );
}

export function canonicalSumitAmount(
  plan: BusinessPlan,
  period: BillingPeriod
): number {
  return getCanonicalSubscriptionPrice(plan, period).amount;
}

export function expectedSumitRecurringMonths(period: BillingPeriod): 1 | 12 {
  return period === 'yearly' ? 12 : 1;
}

export function addSumitBillingPeriod(
  startAt: number,
  period: BillingPeriod
): number {
  const date = new Date(startAt);
  if (period === 'yearly') {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  } else {
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return date.getTime();
}

export function buildSumitCheckoutDraft(args: {
  checkoutId: string;
  businessId: string;
  ownerUserId: string;
  actorUserId: string;
  businessActive: boolean;
  plan: unknown;
  billingPeriod: unknown;
  browserAmount?: unknown;
  browserCurrency?: unknown;
  now: number;
}): SumitCheckoutDraft {
  if (!args.businessActive) {
    throw new Error('BUSINESS_CLOSED');
  }
  if (String(args.actorUserId) !== String(args.ownerUserId)) {
    throw new Error('NOT_AUTHORIZED');
  }
  if (!isBusinessPlan(args.plan) || !isBillingPeriod(args.billingPeriod)) {
    throw new Error('SUMIT_PLAN_INVALID');
  }
  const { amount, currency } = getCanonicalSubscriptionPrice(
    args.plan,
    args.billingPeriod
  );
  if (
    args.browserAmount !== undefined &&
    (typeof args.browserAmount !== 'number' ||
      !sumitAmountsMatch(args.browserAmount, amount))
  ) {
    throw new Error('SUMIT_AMOUNT_NOT_AUTHORITATIVE');
  }
  if (
    args.browserCurrency !== undefined &&
    args.browserCurrency !== BILLING_CURRENCY
  ) {
    throw new Error('SUMIT_CURRENCY_NOT_AUTHORITATIVE');
  }
  const logicalProductId = `${args.plan}_${args.billingPeriod}`;
  if (!isLogicalSubscriptionProductId(logicalProductId)) {
    throw new Error('SUMIT_PLAN_INVALID');
  }
  if (!/^su_[A-Za-z0-9_-]{16,80}$/.test(args.checkoutId)) {
    throw new Error('SUMIT_CHECKOUT_ID_INVALID');
  }
  return {
    checkoutId: args.checkoutId,
    businessId: args.businessId,
    ownerUserId: args.ownerUserId,
    plan: args.plan,
    billingPeriod: args.billingPeriod,
    logicalProductId,
    amount,
    currency,
    status: 'pending',
    createdAt: args.now,
    expiresAt: args.now + SUMIT_CHECKOUT_TTL_MS,
    updatedAt: args.now,
  };
}

export function assertSumitCheckoutCanHost(args: {
  expiresAt: number;
  now: number;
}): void {
  if (args.expiresAt <= args.now) {
    throw new Error('SUMIT_CHECKOUT_EXPIRED');
  }
}

/**
 * SUMIT documents externalidentifier and fixedprice as hosted-page query
 * parameters. They are correlation/UI controls only; verification still uses
 * server-to-server payment and recurring APIs before canonical application.
 */
export function buildSumitHostedCheckoutUrl(args: {
  hostedUrl: string;
  checkoutId: string;
  amount: number;
}): string {
  const url = new URL(assertOfficialSumitHostedUrl(args.hostedUrl));
  url.searchParams.set('externalidentifier', args.checkoutId);
  url.searchParams.set('fixedprice', String(args.amount));
  return url.toString();
}

export function toSumitHostedCheckoutClientResult(args: {
  ok: boolean;
  hosted: boolean;
  code?: string;
  missing?: string[];
  checkoutId: string;
  expiresAt: number;
  amount: number;
  currency: typeof BILLING_CURRENCY;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  paymentPageLink?: string;
  successUrl?: string;
  cancelUrl?: string;
}) {
  return {
    ok: args.ok,
    hosted: args.hosted,
    ...(args.code ? { code: args.code } : {}),
    ...(args.missing ? { missing: [...args.missing] } : {}),
    checkoutId: args.checkoutId,
    expiresAt: args.expiresAt,
    amount: args.amount,
    currency: args.currency,
    plan: args.plan,
    billingPeriod: args.billingPeriod,
    ...(args.paymentPageLink ? { paymentPageLink: args.paymentPageLink } : {}),
    ...(args.successUrl ? { successUrl: args.successUrl } : {}),
    ...(args.cancelUrl ? { cancelUrl: args.cancelUrl } : {}),
  };
}
