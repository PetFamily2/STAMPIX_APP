import type { BillingPeriod } from '@/config/appConfig';

export type PlanId = 'starter' | 'pro' | 'premium';
export type LimitKey =
  | 'maxCards'
  | 'maxCustomers'
  | 'maxActiveRetentionActions';
export type FeatureKey =
  | 'team'
  | 'advancedReports'
  | 'marketingHub'
  | 'smartAnalytics'
  | 'segmentationBuilder'
  | 'savedSegments';

export type PlanPricing = {
  monthly: number;
  yearly: number;
  currency: string;
};

export type PlanLimits = Record<LimitKey, number>;
export type PlanFeatures = Record<FeatureKey, boolean>;

export type PlanCatalogItem = {
  plan: PlanId;
  label: string;
  pricing: PlanPricing;
  limits: PlanLimits;
  features: PlanFeatures;
};

export type AnnualSavings = {
  amount: number;
  percent: number;
} | null;

export type ComparisonCellValue =
  | { type: 'text'; value: string }
  | { type: 'boolean'; value: boolean };

export type ComparisonRow = {
  id: string;
  label: string;
  cells: Record<PlanId, ComparisonCellValue>;
};

const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'premium'];

const LIMIT_ROW_LABELS: Record<LimitKey, string> = {
  maxCards: 'כרטיסי נאמנות',
  maxCustomers: 'לקוחות',
  maxActiveRetentionActions: 'קמפייני שימור פעילים',
};

const FEATURE_ROW_LABELS: Record<FeatureKey, string> = {
  team: 'ניהול צוות',
  advancedReports: 'דוחות מתקדמים',
  marketingHub: 'מרכז שימור',
  smartAnalytics: 'תובנות לקוחות',
  segmentationBuilder: 'בונה סגמנטים',
  savedSegments: 'סגמנטים שמורים',
};

function isPlanId(value: unknown): value is PlanId {
  return value === 'starter' || value === 'pro' || value === 'premium';
}

function normalizeNumber(value: unknown, fallbackValue: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallbackValue;
}

function normalizeBoolean(value: unknown, fallbackValue: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallbackValue;
}

function getDefaultPlanById(planId: PlanId): PlanCatalogItem {
  const labels: Record<PlanId, string> = {
    starter: 'Starter',
    pro: 'Pro AI',
    premium: 'Premium AI',
  };

  return {
    plan: planId,
    label: labels[planId],
    pricing: {
      monthly: 0,
      yearly: 0,
      currency: 'ILS',
    },
    limits: {
      maxCards: 0,
      maxCustomers: 0,
      maxActiveRetentionActions: 0,
    },
    features: {
      team: false,
      advancedReports: false,
      marketingHub: false,
      smartAnalytics: false,
      segmentationBuilder: false,
      savedSegments: false,
    },
  };
}

function normalizePlan(rawPlan: unknown): PlanCatalogItem | null {
  if (typeof rawPlan !== 'object' || rawPlan === null) {
    return null;
  }

  const source = rawPlan as Record<string, unknown>;
  if (!isPlanId(source.plan)) {
    return null;
  }

  const fallback = getDefaultPlanById(source.plan);
  const sourcePricing =
    typeof source.pricing === 'object' && source.pricing !== null
      ? (source.pricing as Record<string, unknown>)
      : {};
  const sourceLimits =
    typeof source.limits === 'object' && source.limits !== null
      ? (source.limits as Record<string, unknown>)
      : {};
  const sourceFeatures =
    typeof source.features === 'object' && source.features !== null
      ? (source.features as Record<string, unknown>)
      : {};

  return {
    plan: source.plan,
    label:
      typeof source.label === 'string' && source.label.trim().length > 0
        ? source.label
        : typeof source.displayName === 'string' &&
            source.displayName.trim().length > 0
          ? source.displayName
          : fallback.label,
    pricing: {
      monthly: normalizeNumber(sourcePricing.monthly, fallback.pricing.monthly),
      yearly: normalizeNumber(sourcePricing.yearly, fallback.pricing.yearly),
      currency:
        typeof sourcePricing.currency === 'string' &&
        sourcePricing.currency.trim().length > 0
          ? sourcePricing.currency
          : fallback.pricing.currency,
    },
    limits: {
      maxCards: normalizeNumber(
        sourceLimits.maxCards,
        fallback.limits.maxCards
      ),
      maxCustomers: normalizeNumber(
        sourceLimits.maxCustomers,
        fallback.limits.maxCustomers
      ),
      maxActiveRetentionActions: normalizeNumber(
        sourceLimits.maxActiveRetentionActions,
        fallback.limits.maxActiveRetentionActions
      ),
    },
    features: {
      team: normalizeBoolean(sourceFeatures.team, fallback.features.team),
      advancedReports: normalizeBoolean(
        sourceFeatures.advancedReports,
        fallback.features.advancedReports
      ),
      marketingHub: normalizeBoolean(
        sourceFeatures.marketingHub,
        fallback.features.marketingHub
      ),
      smartAnalytics: normalizeBoolean(
        sourceFeatures.smartAnalytics,
        fallback.features.smartAnalytics
      ),
      segmentationBuilder: normalizeBoolean(
        sourceFeatures.segmentationBuilder,
        fallback.features.segmentationBuilder
      ),
      savedSegments: normalizeBoolean(
        sourceFeatures.savedSegments,
        fallback.features.savedSegments
      ),
    },
  };
}

export function normalizePlanCatalog(rawCatalog: unknown): PlanCatalogItem[] {
  const catalog = Array.isArray(rawCatalog) ? rawCatalog : [];
  const byPlan = new Map<PlanId, PlanCatalogItem>();

  for (const rawPlan of catalog) {
    const normalized = normalizePlan(rawPlan);
    if (!normalized) {
      continue;
    }
    byPlan.set(normalized.plan, normalized);
  }

  return PLAN_ORDER.map(
    (planId) => byPlan.get(planId) ?? getDefaultPlanById(planId)
  );
}

export function computeAnnualSavings(pricing: PlanPricing): AnnualSavings {
  if (pricing.monthly <= 0) {
    return null;
  }

  const baseYearly = pricing.monthly * 12;
  if (baseYearly <= 0) {
    return null;
  }

  const amount = baseYearly - pricing.yearly;
  if (amount <= 0) {
    return null;
  }

  return {
    amount,
    percent: Math.round((amount / baseYearly) * 100),
  };
}

function formatLimitValue(limitValue: number): string {
  return String(limitValue);
}

export function buildComparisonRows(plans: PlanCatalogItem[]): ComparisonRow[] {
  const planById = new Map<PlanId, PlanCatalogItem>(
    plans.map((plan) => [plan.plan, plan])
  );

  const resolvedPlans: Record<PlanId, PlanCatalogItem> = {
    starter: planById.get('starter') ?? getDefaultPlanById('starter'),
    pro: planById.get('pro') ?? getDefaultPlanById('pro'),
    premium: planById.get('premium') ?? getDefaultPlanById('premium'),
  };

  const limitRows: ComparisonRow[] = (
    ['maxCards', 'maxCustomers', 'maxActiveRetentionActions'] as LimitKey[]
  ).map((limitKey) => ({
    id: `limit:${limitKey}`,
    label: LIMIT_ROW_LABELS[limitKey],
    cells: {
      starter: {
        type: 'text',
        value: formatLimitValue(resolvedPlans.starter.limits[limitKey]),
      },
      pro: {
        type: 'text',
        value: formatLimitValue(resolvedPlans.pro.limits[limitKey]),
      },
      premium: {
        type: 'text',
        value: formatLimitValue(resolvedPlans.premium.limits[limitKey]),
      },
    },
  }));

  const featureRows: ComparisonRow[] = (
    [
      'team',
      'advancedReports',
      'marketingHub',
      'smartAnalytics',
      'segmentationBuilder',
      'savedSegments',
    ] as FeatureKey[]
  ).map((featureKey) => ({
    id: `feature:${featureKey}`,
    label: FEATURE_ROW_LABELS[featureKey],
    cells: {
      starter: {
        type: 'boolean',
        value: resolvedPlans.starter.features[featureKey],
      },
      pro: {
        type: 'boolean',
        value: resolvedPlans.pro.features[featureKey],
      },
      premium: {
        type: 'boolean',
        value: resolvedPlans.premium.features[featureKey],
      },
    },
  }));

  return [...limitRows, ...featureRows];
}

export function getPlanPriceForPeriod(
  plan: PlanCatalogItem,
  period: BillingPeriod
): number {
  return period === 'monthly' ? plan.pricing.monthly : plan.pricing.yearly;
}
