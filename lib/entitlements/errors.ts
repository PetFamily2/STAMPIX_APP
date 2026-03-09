export type EntitlementErrorCode =
  | 'FEATURE_NOT_AVAILABLE'
  | 'PLAN_LIMIT_REACHED'
  | 'SUBSCRIPTION_INACTIVE';

export type EntitlementErrorPayload = {
  code: EntitlementErrorCode;
  businessId: string;
  featureKey?: string;
  requiredPlan?: 'starter' | 'pro' | 'premium';
  limitKey?: 'maxCards' | 'maxCustomers' | 'maxActiveRetentionActions';
  limitType?: 'active_retention_actions';
  limitValue?: number;
  currentValue?: number;
  subscriptionStatus?:
    | 'active'
    | 'trialing'
    | 'past_due'
    | 'canceled'
    | 'inactive';
};

function isEntitlementCode(value: unknown): value is EntitlementErrorCode {
  return (
    value === 'FEATURE_NOT_AVAILABLE' ||
    value === 'PLAN_LIMIT_REACHED' ||
    value === 'SUBSCRIPTION_INACTIVE'
  );
}

export function getEntitlementError(
  error: unknown
): EntitlementErrorPayload | null {
  const candidate = (error as any)?.data ?? (error as any)?.cause?.data;
  if (!candidate || !isEntitlementCode(candidate.code)) {
    return null;
  }

  return candidate as EntitlementErrorPayload;
}

export function entitlementErrorToHebrewMessage(
  payload: EntitlementErrorPayload
) {
  switch (payload.code) {
    case 'FEATURE_NOT_AVAILABLE':
      return 'היכולת הזאת זמינה במסלול מתקדם יותר.';
    case 'PLAN_LIMIT_REACHED': {
      if (
        (payload.limitKey === 'maxActiveRetentionActions' ||
          payload.limitType === 'active_retention_actions') &&
        typeof payload.limitValue === 'number'
      ) {
        return `הגעתם למכסת קמפייני השימור הפעילים במסלול הנוכחי (${payload.limitValue}).`;
      }
      if (
        payload.limitKey === 'maxCards' &&
        typeof payload.limitValue === 'number'
      ) {
        return `הגעתם למכסת כרטיסי הנאמנות במסלול הנוכחי (${payload.limitValue}).`;
      }
      if (
        payload.limitKey === 'maxCustomers' &&
        typeof payload.limitValue === 'number'
      ) {
        return `הגעתם למכסת הלקוחות במסלול הנוכחי (${payload.limitValue}).`;
      }
      return 'הגעתם למגבלת המסלול הנוכחי.';
    }
    case 'SUBSCRIPTION_INACTIVE':
      return 'המנוי לא פעיל כרגע. יש להסדיר תשלום או לשדרג.';
    default:
      return 'אין הרשאה לפעולה הזו.';
  }
}
