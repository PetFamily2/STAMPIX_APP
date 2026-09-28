import {
  BILLING_CURRENCY,
  type BillingPeriod,
  type BusinessPlan,
  isBillingPeriod,
  isBusinessPlan,
  isLogicalSubscriptionProductId,
  planConfig,
} from '../productionContract';

export const PAYPLUS_CHECKOUT_TTL_MS = 30 * 60 * 1000;
export const PAYPLUS_CHARGE_METHOD_RECURRING = 3;
export const PAYPLUS_RECURRING_TYPE_MONTHLY = 2;

/**
 * Hosted PaymentPages/generateLink with charge_method 3 is the documented
 * recurring path that never gives StampAix a card token.
 * RecurringPayments/Add is the alternate and requires card_token.
 * The API enum is daily, weekly, or monthly. Yearly uses monthly + range 12,
 * which is the documented range multiplier, and still needs account confirmation.
 */
export const PAYPLUS_RECURRING_POC = {
  recommended: 'hosted_payment_page',
  chargeMethod: PAYPLUS_CHARGE_METHOD_RECURRING,
  alternateRequiresCardToken: true,
  yearlyTypeEnum: false,
  yearlyRange: 12,
  unlimitedCharges: 0,
  invoiceModuleEnabled: false,
} as const;

export type PayPlusCheckoutDraft = {
  checkoutId: string;
  businessId: string;
  ownerUserId: string;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  logicalProductId: string;
  amount: number;
  currency: typeof BILLING_CURRENCY;
  status: 'pending';
  createdAt: number;
  expiresAt: number;
  updatedAt: number;
};

export function canonicalPlanAmount(
  plan: BusinessPlan,
  period: BillingPeriod
): number {
  const amount = planConfig[plan].pricing[period];
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('PAYPLUS_CONTRACT_AMOUNT_INVALID');
  }
  if (planConfig[plan].pricing.currency !== BILLING_CURRENCY) {
    throw new Error('PAYPLUS_CONTRACT_CURRENCY_INVALID');
  }
  return amount;
}

export function assertPayPlusCheckoutCanHost(args: {
  expiresAt: number;
  now: number;
}): void {
  if (args.expiresAt <= args.now) {
    throw new Error('PAYPLUS_CHECKOUT_EXPIRED');
  }
}

export function payPlusRefundEvidenceCanApply(args: {
  chargeTransactionUid: string;
  refundTransactionUid: string;
}): boolean {
  return (
    args.refundTransactionUid.length > 0 &&
    args.refundTransactionUid !== args.chargeTransactionUid
  );
}

export function payPlusAmountsMatch(actual: number, expected: number): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return false;
  }
  return Math.round(actual * 100) === Math.round(expected * 100);
}

export function payPlusRecurringSchedule(period: BillingPeriod): {
  recurring_type: typeof PAYPLUS_RECURRING_TYPE_MONTHLY;
  recurring_range: number;
  number_of_charges: 0;
} {
  return {
    recurring_type: PAYPLUS_RECURRING_TYPE_MONTHLY,
    recurring_range:
      period === 'yearly' ? PAYPLUS_RECURRING_POC.yearlyRange : 1,
    number_of_charges: 0,
  };
}

export function addContractBillingPeriod(
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

export function buildPayPlusCheckoutDraft(args: {
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
}): PayPlusCheckoutDraft {
  if (!args.businessActive) {
    throw new Error('BUSINESS_CLOSED');
  }
  if (String(args.actorUserId) !== String(args.ownerUserId)) {
    throw new Error('NOT_AUTHORIZED');
  }
  if (!isBusinessPlan(args.plan) || !isBillingPeriod(args.billingPeriod)) {
    throw new Error('PAYPLUS_PLAN_INVALID');
  }
  const amount = canonicalPlanAmount(args.plan, args.billingPeriod);
  if (
    args.browserAmount !== undefined &&
    (typeof args.browserAmount !== 'number' ||
      !payPlusAmountsMatch(args.browserAmount, amount))
  ) {
    throw new Error('PAYPLUS_AMOUNT_NOT_AUTHORITATIVE');
  }
  if (
    args.browserCurrency !== undefined &&
    args.browserCurrency !== BILLING_CURRENCY
  ) {
    throw new Error('PAYPLUS_CURRENCY_NOT_AUTHORITATIVE');
  }
  const logicalProductId = `${args.plan}_${args.billingPeriod}`;
  if (!isLogicalSubscriptionProductId(logicalProductId)) {
    throw new Error('PAYPLUS_PLAN_INVALID');
  }
  if (!args.checkoutId.startsWith('pp_') || args.checkoutId.length < 12) {
    throw new Error('PAYPLUS_CHECKOUT_ID_INVALID');
  }
  return {
    checkoutId: args.checkoutId,
    businessId: args.businessId,
    ownerUserId: args.ownerUserId,
    plan: args.plan,
    billingPeriod: args.billingPeriod,
    logicalProductId,
    amount,
    currency: BILLING_CURRENCY,
    status: 'pending',
    createdAt: args.now,
    expiresAt: args.now + PAYPLUS_CHECKOUT_TTL_MS,
    updatedAt: args.now,
  };
}

export function buildPayPlusGenerateLinkBody(args: {
  paymentPageUid: string;
  amount: number;
  billingPeriod: BillingPeriod;
  checkoutId: string;
  logicalProductId: string;
  urls: {
    success: string;
    failure: string;
    cancel: string;
    callback: string;
  };
  customerName: string;
  customerEmail: string;
  now: number;
}) {
  const schedule = payPlusRecurringSchedule(args.billingPeriod);
  const day = new Date(args.now).getUTCDate();
  return {
    payment_page_uid: args.paymentPageUid,
    charge_method: PAYPLUS_CHARGE_METHOD_RECURRING,
    amount: args.amount,
    currency_code: BILLING_CURRENCY,
    language_code: 'he',
    sendEmailApproval: false,
    sendEmailFailure: false,
    send_failure_callback: true,
    expiry_datetime: '30',
    refURL_success: args.urls.success,
    refURL_failure: args.urls.failure,
    refURL_cancel: args.urls.cancel,
    refURL_callback: args.urls.callback,
    create_token: false,
    more_info: args.checkoutId,
    more_info_2: args.logicalProductId,
    customer: {
      customer_name: args.customerName,
      email: args.customerEmail,
    },
    recurring_settings: {
      instant_first_payment: true,
      recurring_type: schedule.recurring_type,
      recurring_range: schedule.recurring_range,
      number_of_charges: schedule.number_of_charges,
      start_date_on_payment_date: true,
      start_date: Math.min(day, 28),
      jump_payments: 0,
      successful_invoice: false,
      customer_failure_email: true,
      send_customer_success_email: false,
    },
  };
}

export function toHostedCheckoutClientResult(args: {
  ok: boolean;
  hosted: boolean;
  code?: string;
  checkoutId: string;
  expiresAt: number;
  amount: number;
  currency: typeof BILLING_CURRENCY;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  paymentPageLink?: string;
  missing?: string[];
}) {
  return {
    ok: args.ok,
    hosted: args.hosted,
    ...(args.code ? { code: args.code } : {}),
    checkoutId: args.checkoutId,
    expiresAt: args.expiresAt,
    amount: args.amount,
    currency: args.currency,
    plan: args.plan,
    billingPeriod: args.billingPeriod,
    ...(args.paymentPageLink ? { paymentPageLink: args.paymentPageLink } : {}),
    ...(args.missing ? { missing: [...args.missing] } : {}),
  };
}
