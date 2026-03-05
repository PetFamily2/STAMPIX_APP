import type { BillingPeriod } from '@/config/appConfig';

export type PlanId = 'starter' | 'pro' | 'unlimited';
export type LimitKey = 'maxCards' | 'maxCustomers' | 'maxAiCampaignsPerMonth';
export type FeatureKey =
  | 'canManageTeam'
  | 'canSeeAdvancedReports'
  | 'canUseMarketingHubAI'
  | 'canUseSmartAnalytics'
  | 'canUseAdvancedSegmentation';

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

const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'unlimited'];

const DEFAULT_PLAN_CATALOG: PlanCatalogItem[] = [
  {
    plan: 'starter',
    label: 'Starter',
    pricing: {
      monthly: 0,
      yearly: 0,
      currency: 'ILS',
    },
    limits: {
      maxCards: 1,
      maxCustomers: 30,
      maxAiCampaignsPerMonth: 0,
    },
    features: {
      canManageTeam: false,
      canSeeAdvancedReports: false,
      canUseMarketingHubAI: false,
      canUseSmartAnalytics: false,
      canUseAdvancedSegmentation: false,
    },
  },
  {
    plan: 'pro',
    label: 'Pro AI',
    pricing: {
      monthly: 129,
      yearly: 1238,
      currency: 'ILS',
    },
    limits: {
      maxCards: 5,
      maxCustomers: -1,
      maxAiCampaignsPerMonth: 5,
    },
    features: {
      canManageTeam: true,
      canSeeAdvancedReports: true,
      canUseMarketingHubAI: true,
      canUseSmartAnalytics: true,
      canUseAdvancedSegmentation: false,
    },
  },
  {
    plan: 'unlimited',
    label: 'Unlimited AI',
    pricing: {
      monthly: 249,
      yearly: 2390,
      currency: 'ILS',
    },
    limits: {
      maxCards: -1,
      maxCustomers: -1,
      maxAiCampaignsPerMonth: 15,
    },
    features: {
      canManageTeam: true,
      canSeeAdvancedReports: true,
      canUseMarketingHubAI: true,
      canUseSmartAnalytics: true,
      canUseAdvancedSegmentation: true,
    },
  },
];

const LIMIT_ROW_LABELS: Record<LimitKey, string> = {
  maxCards: 'כמות כרטיסים',
  maxCustomers: 'לקוחות פעילים',
  maxAiCampaignsPerMonth: 'קמפייני AI בחודש',
};

const FEATURE_ROW_LABELS: Record<FeatureKey, string> = {
  canManageTeam: 'ניהול צוות',
  canSeeAdvancedReports: 'דוחות מתקדמים',
  canUseMarketingHubAI: 'Marketing Hub AI',
  canUseSmartAnalytics: 'Smart Analytics',
  canUseAdvancedSegmentation: 'סגמנטציה מתקדמת',
};

function isPlanId(value: unknown): value is PlanId {
  return value === 'starter' || value === 'pro' || value === 'unlimited';
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
  const fallback = DEFAULT_PLAN_CATALOG.find((plan) => plan.plan === planId);
  if (!fallback) {
    throw new Error(`Missing fallback catalog for plan ${planId}`);
  }
  return fallback;
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
      maxAiCampaignsPerMonth: normalizeNumber(
        sourceLimits.maxAiCampaignsPerMonth,
        fallback.limits.maxAiCampaignsPerMonth
      ),
    },
    features: {
      canManageTeam: normalizeBoolean(
        sourceFeatures.canManageTeam,
        fallback.features.canManageTeam
      ),
      canSeeAdvancedReports: normalizeBoolean(
        sourceFeatures.canSeeAdvancedReports,
        fallback.features.canSeeAdvancedReports
      ),
      canUseMarketingHubAI: normalizeBoolean(
        sourceFeatures.canUseMarketingHubAI,
        fallback.features.canUseMarketingHubAI
      ),
      canUseSmartAnalytics: normalizeBoolean(
        sourceFeatures.canUseSmartAnalytics,
        fallback.features.canUseSmartAnalytics
      ),
      canUseAdvancedSegmentation: normalizeBoolean(
        sourceFeatures.canUseAdvancedSegmentation,
        fallback.features.canUseAdvancedSegmentation
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
  if (limitValue === -1) {
    return 'ללא הגבלה';
  }
  return String(limitValue);
}

export function buildComparisonRows(plans: PlanCatalogItem[]): ComparisonRow[] {
  const planById = new Map<PlanId, PlanCatalogItem>(
    plans.map((plan) => [plan.plan, plan])
  );

  const resolvedPlans: Record<PlanId, PlanCatalogItem> = {
    starter: planById.get('starter') ?? getDefaultPlanById('starter'),
    pro: planById.get('pro') ?? getDefaultPlanById('pro'),
    unlimited: planById.get('unlimited') ?? getDefaultPlanById('unlimited'),
  };

  const limitRows: ComparisonRow[] = (
    ['maxCards', 'maxCustomers', 'maxAiCampaignsPerMonth'] as LimitKey[]
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
      unlimited: {
        type: 'text',
        value: formatLimitValue(resolvedPlans.unlimited.limits[limitKey]),
      },
    },
  }));

  const featureRows: ComparisonRow[] = (
    [
      'canManageTeam',
      'canSeeAdvancedReports',
      'canUseMarketingHubAI',
      'canUseSmartAnalytics',
      'canUseAdvancedSegmentation',
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
      unlimited: {
        type: 'boolean',
        value: resolvedPlans.unlimited.features[featureKey],
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
