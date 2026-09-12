import {
  type BillingPeriod,
  type BusinessPlan,
  INTENDED_APP_STORE_PRODUCT_IDS,
  INTENDED_PLAY_BASE_PLANS,
  INTENDED_PLAY_SUBSCRIPTION_IDS,
  isLogicalSubscriptionProductId,
  type LogicalSubscriptionProductId,
  REVENUECAT_CANONICAL_ENTITLEMENT,
} from './productionContract';

export type RevenueCatPlanMapping = {
  logicalProductId: LogicalSubscriptionProductId;
  plan: BusinessPlan;
  period: BillingPeriod;
};

const LOGICAL_PRODUCT_MAP: Record<
  LogicalSubscriptionProductId,
  RevenueCatPlanMapping
> = {
  starter_monthly: {
    logicalProductId: 'starter_monthly',
    plan: 'starter',
    period: 'monthly',
  },
  starter_yearly: {
    logicalProductId: 'starter_yearly',
    plan: 'starter',
    period: 'yearly',
  },
  pro_monthly: {
    logicalProductId: 'pro_monthly',
    plan: 'pro',
    period: 'monthly',
  },
  pro_yearly: {
    logicalProductId: 'pro_yearly',
    plan: 'pro',
    period: 'yearly',
  },
  premium_monthly: {
    logicalProductId: 'premium_monthly',
    plan: 'premium',
    period: 'monthly',
  },
  premium_yearly: {
    logicalProductId: 'premium_yearly',
    plan: 'premium',
    period: 'yearly',
  },
};

const PLAY_PRODUCT_IDS: Record<LogicalSubscriptionProductId, string> = {
  starter_monthly: `${INTENDED_PLAY_SUBSCRIPTION_IDS.starter}:${INTENDED_PLAY_BASE_PLANS.monthly}`,
  starter_yearly: `${INTENDED_PLAY_SUBSCRIPTION_IDS.starter}:${INTENDED_PLAY_BASE_PLANS.yearly}`,
  pro_monthly: `${INTENDED_PLAY_SUBSCRIPTION_IDS.pro}:${INTENDED_PLAY_BASE_PLANS.monthly}`,
  pro_yearly: `${INTENDED_PLAY_SUBSCRIPTION_IDS.pro}:${INTENDED_PLAY_BASE_PLANS.yearly}`,
  premium_monthly: `${INTENDED_PLAY_SUBSCRIPTION_IDS.premium}:${INTENDED_PLAY_BASE_PLANS.monthly}`,
  premium_yearly: `${INTENDED_PLAY_SUBSCRIPTION_IDS.premium}:${INTENDED_PLAY_BASE_PLANS.yearly}`,
};

const ENV_PRODUCT_ALIAS_KEYS: Record<LogicalSubscriptionProductId, string> = {
  starter_monthly: 'REVENUECAT_PRODUCT_IDS_STARTER_MONTHLY',
  starter_yearly: 'REVENUECAT_PRODUCT_IDS_STARTER_YEARLY',
  pro_monthly: 'REVENUECAT_PRODUCT_IDS_PRO_MONTHLY',
  pro_yearly: 'REVENUECAT_PRODUCT_IDS_PRO_YEARLY',
  premium_monthly: 'REVENUECAT_PRODUCT_IDS_PREMIUM_MONTHLY',
  premium_yearly: 'REVENUECAT_PRODUCT_IDS_PREMIUM_YEARLY',
};

function splitEnvList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeProductId(value: string): string {
  return value.trim();
}

export function isCanonicalBusinessAccessEntitlement(
  entitlementId: string
): boolean {
  const normalized = entitlementId.trim();
  if (normalized === REVENUECAT_CANONICAL_ENTITLEMENT) {
    return true;
  }
  // Historical aliases may still be attached in RevenueCat during cutover.
  // They never select a plan; they only prove business_access presence.
  return normalized === 'pro' || normalized === 'premium';
}

export function buildRevenueCatProductMap(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): Map<string, RevenueCatPlanMapping> {
  const map = new Map<string, RevenueCatPlanMapping>();

  for (const logicalId of Object.keys(
    LOGICAL_PRODUCT_MAP
  ) as LogicalSubscriptionProductId[]) {
    const mapping = LOGICAL_PRODUCT_MAP[logicalId];
    map.set(logicalId, mapping);
    map.set(INTENDED_APP_STORE_PRODUCT_IDS[logicalId], mapping);
    map.set(PLAY_PRODUCT_IDS[logicalId], mapping);
    map.set(
      `${INTENDED_PLAY_SUBSCRIPTION_IDS[mapping.plan]}_${mapping.period}`,
      mapping
    );
    if (mapping.period === 'yearly') {
      map.set(`${mapping.plan}_annual`, mapping);
    }
    for (const alias of splitEnvList(env[ENV_PRODUCT_ALIAS_KEYS[logicalId]])) {
      map.set(normalizeProductId(alias), mapping);
    }
  }

  return map;
}

export function resolveLogicalProductId(
  productId: string | undefined
): LogicalSubscriptionProductId | null {
  if (!productId) {
    return null;
  }
  const mapping = buildRevenueCatProductMap().get(normalizeProductId(productId));
  return mapping?.logicalProductId ?? null;
}

export function resolveRevenueCatPlanMapping(args: {
  productId?: string | null;
  newProductId?: string | null;
  entitlementIds?: string[];
  requireEntitlement?: boolean;
}): RevenueCatPlanMapping {
  const candidateProductId = args.newProductId || args.productId;
  if (!candidateProductId) {
    throw new Error('REVENUECAT_MISSING_PRODUCT_ID');
  }

  const mapping = buildRevenueCatProductMap().get(
    normalizeProductId(candidateProductId)
  );
  if (!mapping) {
    throw new Error('REVENUECAT_UNSUPPORTED_PRODUCT');
  }

  if (args.requireEntitlement !== false) {
    const entitlementIds = args.entitlementIds ?? [];
    if (entitlementIds.length > 0) {
      const hasBusinessAccess = entitlementIds.some((id) =>
        isCanonicalBusinessAccessEntitlement(id)
      );
      if (!hasBusinessAccess) {
        throw new Error('REVENUECAT_UNSUPPORTED_ENTITLEMENT');
      }
    }
  }

  return mapping;
}

export function assertNoPlanSpecificEntitlementAuthorization(): void {
  if (isLogicalSubscriptionProductId(REVENUECAT_CANONICAL_ENTITLEMENT)) {
    throw new Error('REVENUECAT_PLAN_SPECIFIC_ENTITLEMENT');
  }
}
