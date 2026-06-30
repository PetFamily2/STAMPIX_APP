export const SERVER_AUTHORITATIVE_BILLING_ENABLED =
  process.env.EXPO_PUBLIC_SERVER_AUTHORITATIVE_BILLING_ENABLED === 'true';

export const BILLING_UNAVAILABLE_TITLE_HE = 'הרכישה אינה זמינה';

export const BILLING_UNAVAILABLE_MESSAGE_HE =
  'השדרוג לא זמין כרגע באפליקציה הזו. אפשר להמשיך להשתמש במסלול הנוכחי.';

export const SERVER_BILLING_UNAVAILABLE_MESSAGE_HE =
  'השדרוג לא זמין כרגע. אפשר להמשיך להשתמש במסלול הנוכחי ולנסות שוב מאוחר יותר.';

export const BILLING_EXPO_GO_MESSAGE_HE =
  'השדרוג לא זמין כרגע באפליקציה הזו. אפשר להמשיך להשתמש במסלול הנוכחי.';

export const BILLING_NOT_CONFIGURED_MESSAGE_HE =
  'השדרוג לא זמין כרגע. נסו שוב מאוחר יותר או פנו לתמיכה.';

export const BILLING_MISSING_PACKAGE_MESSAGE_HE =
  'השדרוג למסלול שנבחר לא זמין כרגע. נסו שוב מאוחר יותר או פנו לתמיכה.';

export const BILLING_INVALID_BUSINESS_IDENTITY_MESSAGE_HE =
  'לא הצלחנו לזהות את העסק לשדרוג. נסו שוב אחרי יצירת העסק.';

export const SERVER_SYNC_PENDING_MESSAGE_HE = 'מאמתים את השדרוג...';

export const SERVER_SYNC_TIMEOUT_MESSAGE_HE =
  'השדרוג עדיין בתהליך אימות. נסו בדיקה חוזרת או שחזור רכישות.';

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
