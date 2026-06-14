export const SERVER_AUTHORITATIVE_BILLING_ENABLED =
  process.env.EXPO_PUBLIC_SERVER_AUTHORITATIVE_BILLING_ENABLED === 'true';

export const BILLING_UNAVAILABLE_TITLE_HE =
  '\u05d4\u05e8\u05db\u05d9\u05e9\u05d4 \u05d0\u05d9\u05e0\u05d4 \u05d6\u05de\u05d9\u05e0\u05d4';

export const BILLING_UNAVAILABLE_MESSAGE_HE =
  '\u05e8\u05db\u05d9\u05e9\u05d5\u05ea \u05d5\u05de\u05e0\u05d5\u05d9\u05d9\u05dd \u05d1\u05ea\u05e9\u05dc\u05d5\u05dd \u05d0\u05d9\u05e0\u05dd \u05d6\u05de\u05d9\u05e0\u05d9\u05dd \u05db\u05e8\u05d2\u05e2. \u05dc\u05d0 \u05ea\u05d7\u05d5\u05d9\u05d1\u05d5.';

export const SERVER_BILLING_UNAVAILABLE_MESSAGE_HE =
  '\u05d7\u05d9\u05d5\u05d1 \u05de\u05d0\u05d5\u05de\u05ea \u05de\u05d4\u05e9\u05e8\u05ea \u05e2\u05d3\u05d9\u05d9\u05df \u05dc\u05d0 \u05d4\u05d5\u05e4\u05e2\u05dc. \u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05d4\u05e9\u05dc\u05d9\u05dd \u05e8\u05db\u05d9\u05e9\u05d4 \u05db\u05e8\u05d2\u05e2.';

export const BILLING_EXPO_GO_MESSAGE_HE =
  '\u05e8\u05db\u05d9\u05e9\u05d5\u05ea \u05dc\u05d0 \u05d6\u05de\u05d9\u05e0\u05d5\u05ea \u05d1-Expo Go. \u05d4\u05e9\u05ea\u05de\u05e9\u05d5 \u05d1-Dev Build.';

export const BILLING_NOT_CONFIGURED_MESSAGE_HE =
  '\u05de\u05e4\u05ea\u05d7\u05d5\u05ea RevenueCat \u05dc\u05d0 \u05de\u05d5\u05d2\u05d3\u05e8\u05d9\u05dd \u05d1\u05e1\u05d1\u05d9\u05d1\u05d4.';

export const BILLING_MISSING_PACKAGE_MESSAGE_HE =
  '\u05dc\u05d0 \u05d4\u05d5\u05d2\u05d3\u05e8 \u05de\u05d6\u05d4\u05d4 \u05d7\u05d1\u05d9\u05dc\u05ea RevenueCat \u05dc\u05de\u05e1\u05dc\u05d5\u05dc \u05e9\u05e0\u05d1\u05d7\u05e8.';

export const BILLING_INVALID_BUSINESS_IDENTITY_MESSAGE_HE =
  '\u05dc\u05d0 \u05e0\u05de\u05e6\u05d0 \u05de\u05d6\u05d4\u05d4 \u05e2\u05e1\u05e7 \u05ea\u05e7\u05d9\u05df \u05dc\u05d7\u05d9\u05d5\u05d1. \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1 \u05d0\u05d7\u05e8\u05d9 \u05d9\u05e6\u05d9\u05e8\u05ea \u05d4\u05e2\u05e1\u05e7.';

export const SERVER_SYNC_PENDING_MESSAGE_HE =
  '\u05de\u05d0\u05de\u05ea\u05d9\u05dd \u05d0\u05ea \u05d4\u05de\u05e0\u05d5\u05d9 \u05de\u05d5\u05dc \u05d4\u05e9\u05e8\u05ea...';

export const SERVER_SYNC_TIMEOUT_MESSAGE_HE =
  '\u05d4\u05ea\u05e9\u05dc\u05d5\u05dd \u05e0\u05e7\u05dc\u05d8 \u05d1-RevenueCat, \u05d0\u05da \u05d4\u05de\u05e0\u05d5\u05d9 \u05e2\u05d3\u05d9\u05d9\u05df \u05de\u05de\u05ea\u05d9\u05df \u05dc\u05d0\u05d9\u05de\u05d5\u05ea \u05d1\u05e9\u05e8\u05ea. \u05e0\u05e1\u05d5 \u05d1\u05d3\u05d9\u05e7\u05d4 \u05d7\u05d5\u05d6\u05e8\u05ea \u05d0\u05d5 \u05e9\u05d7\u05d6\u05d5\u05e8 \u05e8\u05db\u05d9\u05e9\u05d5\u05ea.';

type BillingPeriod = 'monthly' | 'yearly';
type PaidBusinessPlan = 'pro' | 'premium';

export type RevenueCatBillingGuardCode =
  | 'payment_disabled'
  | 'server_billing_disabled'
  | 'expo_go'
  | 'revenuecat_not_configured'
  | 'missing_package'
  | 'invalid_business_identity';

export type RevenueCatBillingGuardInput = {
  paymentSystemEnabled: boolean;
  serverAuthoritativeBillingEnabled: boolean;
  isRevenueCatConfigured: boolean;
  isExpoGo: boolean;
  packageId?: string | null;
  businessAppUserId?: string | null;
};

export type RevenueCatBillingGuardResult =
  | { canStart: true; code: null; message: null }
  | {
      canStart: false;
      code: RevenueCatBillingGuardCode;
      message: string;
    };

export function buildRevenueCatBusinessAppUserId(
  businessId: string | null | undefined
) {
  const normalizedBusinessId = businessId?.trim();
  return normalizedBusinessId ? `business:${normalizedBusinessId}` : null;
}

export function isValidRevenueCatBusinessAppUserId(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();
  if (!normalized.startsWith('business:')) {
    return false;
  }

  const businessId = normalized.slice('business:'.length);
  return businessId.length > 0 && !businessId.includes(':');
}

export function evaluateRevenueCatBillingGuard(
  input: RevenueCatBillingGuardInput
): RevenueCatBillingGuardResult {
  if (!input.paymentSystemEnabled) {
    return {
      canStart: false,
      code: 'payment_disabled',
      message: BILLING_UNAVAILABLE_MESSAGE_HE,
    };
  }

  if (!input.serverAuthoritativeBillingEnabled) {
    return {
      canStart: false,
      code: 'server_billing_disabled',
      message: SERVER_BILLING_UNAVAILABLE_MESSAGE_HE,
    };
  }

  if (input.isExpoGo) {
    return {
      canStart: false,
      code: 'expo_go',
      message: BILLING_EXPO_GO_MESSAGE_HE,
    };
  }

  if (!input.isRevenueCatConfigured) {
    return {
      canStart: false,
      code: 'revenuecat_not_configured',
      message: BILLING_NOT_CONFIGURED_MESSAGE_HE,
    };
  }

  if (!input.packageId?.trim()) {
    return {
      canStart: false,
      code: 'missing_package',
      message: BILLING_MISSING_PACKAGE_MESSAGE_HE,
    };
  }

  if (!isValidRevenueCatBusinessAppUserId(input.businessAppUserId)) {
    return {
      canStart: false,
      code: 'invalid_business_identity',
      message: BILLING_INVALID_BUSINESS_IDENTITY_MESSAGE_HE,
    };
  }

  return { canStart: true, code: null, message: null };
}

export function canStartRevenueCatPurchase(
  input?: RevenueCatBillingGuardInput
) {
  if (!input) {
    return false;
  }

  return evaluateRevenueCatBillingGuard(input).canStart;
}

export function isServerConfirmedPaidEntitlement(
  entitlements: unknown,
  expectedPlan?: PaidBusinessPlan,
  expectedBillingPeriod?: BillingPeriod
) {
  if (typeof entitlements !== 'object' || entitlements === null) {
    return false;
  }

  const snapshot = entitlements as {
    plan?: unknown;
    effectivePlan?: unknown;
    billingPeriod?: unknown;
    isSubscriptionActive?: unknown;
  };
  const paidPlans: PaidBusinessPlan[] = ['pro', 'premium'];
  const actualPlan =
    snapshot.effectivePlan === 'pro' || snapshot.effectivePlan === 'premium'
      ? snapshot.effectivePlan
      : snapshot.plan;

  if (!paidPlans.includes(actualPlan as PaidBusinessPlan)) {
    return false;
  }

  if (expectedPlan && actualPlan !== expectedPlan) {
    return false;
  }

  if (
    expectedBillingPeriod &&
    snapshot.billingPeriod !== expectedBillingPeriod
  ) {
    return false;
  }

  return snapshot.isSubscriptionActive === true;
}
