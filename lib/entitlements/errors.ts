export type EntitlementErrorCode =
  | 'FEATURE_NOT_AVAILABLE'
  | 'PLAN_LIMIT_REACHED'
  | 'SUBSCRIPTION_INACTIVE';

export type EntitlementErrorPayload = {
  code: EntitlementErrorCode;
  businessId: string;
  featureKey?: string;
  requiredPlan?: 'starter' | 'pro' | 'premium';
  limitKey?:
    | 'maxCards'
    | 'maxCustomers'
    | 'maxActiveRetentionActions'
    | 'maxCampaigns'
    | 'maxAiExecutionsPerMonth';
  limitType?: 'active_retention_actions' | 'ai_executions_monthly';
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
      return '\u05d4\u05d9\u05db\u05d5\u05dc\u05ea \u05d4\u05d6\u05d0\u05ea \u05d6\u05de\u05d9\u05e0\u05d4 \u05d1\u05de\u05e1\u05dc\u05d5\u05dc \u05de\u05ea\u05e7\u05d3\u05dd \u05d9\u05d5\u05ea\u05e8.';
    case 'PLAN_LIMIT_REACHED': {
      if (
        (payload.limitKey === 'maxActiveRetentionActions' ||
          payload.limitType === 'active_retention_actions') &&
        typeof payload.limitValue === 'number'
      ) {
        return `\u05d4\u05d2\u05e2\u05ea\u05dd \u05dc\u05de\u05db\u05e1\u05ea \u05e7\u05de\u05e4\u05d9\u05d9\u05e0\u05d9 \u05e9\u05d9\u05de\u05d5\u05e8 \u05e4\u05e2\u05d9\u05dc\u05d9\u05dd \u05d1\u05de\u05e1\u05dc\u05d5\u05dc \u05d4\u05e0\u05d5\u05db\u05d7\u05d9 (${payload.limitValue}).`;
      }
      if (
        payload.limitKey === 'maxCards' &&
        typeof payload.limitValue === 'number'
      ) {
        return `\u05d4\u05d2\u05e2\u05ea\u05dd \u05dc\u05de\u05db\u05e1\u05ea \u05db\u05e8\u05d8\u05d9\u05e1\u05d9 \u05d4\u05e0\u05d0\u05de\u05e0\u05d5\u05ea \u05d1\u05de\u05e1\u05dc\u05d5\u05dc \u05d4\u05e0\u05d5\u05db\u05d7\u05d9 (${payload.limitValue}).`;
      }
      if (
        payload.limitKey === 'maxCustomers' &&
        typeof payload.limitValue === 'number'
      ) {
        return `\u05d4\u05d2\u05e2\u05ea\u05dd \u05dc\u05de\u05db\u05e1\u05ea \u05d4\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05d1\u05de\u05e1\u05dc\u05d5\u05dc \u05d4\u05e0\u05d5\u05db\u05d7\u05d9 (${payload.limitValue}).`;
      }
      if (
        payload.limitKey === 'maxCampaigns' &&
        typeof payload.limitValue === 'number'
      ) {
        return `\u05d4\u05d2\u05e2\u05ea\u05dd \u05dc\u05de\u05db\u05e1\u05ea \u05de\u05e1\u05e4\u05e8 \u05d4\u05e7\u05de\u05e4\u05d9\u05d9\u05e0\u05d9\u05dd \u05d4\u05e4\u05e2\u05d9\u05dc\u05d9\u05dd \u05d1\u05de\u05e1\u05dc\u05d5\u05dc \u05d4\u05e0\u05d5\u05db\u05d7\u05d9 (${payload.limitValue}).`;
      }
      if (
        (payload.limitKey === 'maxAiExecutionsPerMonth' ||
          payload.limitType === 'ai_executions_monthly') &&
        typeof payload.limitValue === 'number'
      ) {
        return `\u05d4\u05d2\u05e2\u05ea\u05dd \u05dc\u05de\u05db\u05e1\u05ea \u05e9\u05d9\u05de\u05d5\u05e9\u05d9 AI \u05dc\u05d7\u05d5\u05d3\u05e9 \u05d4\u05e0\u05d5\u05db\u05d7\u05d9 (${payload.limitValue}).`;
      }
      return '\u05d4\u05d2\u05e2\u05ea\u05dd \u05dc\u05de\u05d2\u05d1\u05dc\u05ea \u05d4\u05de\u05e1\u05dc\u05d5\u05dc \u05d4\u05e0\u05d5\u05db\u05d7\u05d9.';
    }
    case 'SUBSCRIPTION_INACTIVE':
      return '\u05d4\u05de\u05e0\u05d5\u05d9 \u05dc\u05d0 \u05e4\u05e2\u05d9\u05dc \u05db\u05e8\u05d2\u05e2. \u05d9\u05e9 \u05dc\u05d4\u05e1\u05d3\u05d9\u05e8 \u05ea\u05e9\u05dc\u05d5\u05dd \u05d0\u05d5 \u05dc\u05e9\u05d3\u05e8\u05d2.';
    default:
      return '\u05d0\u05d9\u05df \u05d4\u05e8\u05e9\u05d0\u05d4 \u05dc\u05e4\u05e2\u05d5\u05dc\u05d4 \u05d4\u05d6\u05d5.';
  }
}
