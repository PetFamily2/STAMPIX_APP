import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import {
  requireActorIsBusinessOwner,
  requireActorIsStaffForBusiness,
} from './guards';

export type BusinessPlan = 'starter' | 'pro' | 'unlimited';
export type BusinessSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled';
export type BillingPeriod = 'monthly' | 'yearly';

export type FeatureKey =
  | 'canManageTeam'
  | 'canSeeAdvancedReports'
  | 'canUseMarketingHubAI'
  | 'canUseSmartAnalytics'
  | 'canUseAdvancedSegmentation';

export type LimitKey =
  | 'maxCards'
  | 'maxCustomers'
  | 'maxAiCampaignsPerMonth';

type FeatureConfig = Record<FeatureKey, boolean>;
type LimitConfig = Record<LimitKey, number>;

type PlanDefinition = {
  label: string;
  pricing: {
    monthly: number;
    yearly: number;
    currency: 'ILS';
  };
  limits: LimitConfig;
  features: FeatureConfig;
};

type BusinessSubscriptionState = {
  plan: BusinessPlan;
  status: BusinessSubscriptionStatus;
  startAt: number | null;
  endAt: number | null;
  billingPeriod: BillingPeriod | null;
  aiCampaignsUsedThisMonth: number;
  aiCampaignsMonthKey: string;
  isSubscriptionActive: boolean;
};

export type BusinessEntitlements = {
  businessId: Id<'businesses'>;
  plan: BusinessPlan;
  subscriptionStatus: BusinessSubscriptionStatus;
  subscriptionStartAt: number | null;
  subscriptionEndAt: number | null;
  billingPeriod: BillingPeriod | null;
  isSubscriptionActive: boolean;
  limits: LimitConfig;
  features: FeatureConfig;
  pricing: PlanDefinition['pricing'];
  usage: {
    aiCampaignsUsedThisMonth: number;
    aiCampaignsMonthKey: string;
    aiCampaignsRemainingThisMonth: number | null;
  };
  requiredPlanMap: {
    byFeature: Record<FeatureKey, BusinessPlan>;
    byLimitFromCurrentPlan: Record<BusinessPlan, Record<LimitKey, BusinessPlan | null>>;
  };
};

export type EntitlementErrorCode =
  | 'FEATURE_NOT_AVAILABLE'
  | 'PLAN_LIMIT_REACHED'
  | 'SUBSCRIPTION_INACTIVE';

export type EntitlementErrorPayload = {
  code: EntitlementErrorCode;
  businessId: string;
  featureKey?: FeatureKey;
  requiredPlan?: BusinessPlan;
  limitKey?: LimitKey;
  limitValue?: number;
  currentValue?: number;
  subscriptionStatus?: BusinessSubscriptionStatus;
};

export type EntitlementRequirement = {
  featureKey?: FeatureKey;
  limitKey?: LimitKey;
  currentValue?: number;
};

export const PLAN_ORDER: BusinessPlan[] = ['starter', 'pro', 'unlimited'];

export const PLAN_RANK: Record<BusinessPlan, number> = {
  starter: 0,
  pro: 1,
  unlimited: 2,
};

export const REQUIRED_PLAN_BY_FEATURE: Record<FeatureKey, BusinessPlan> = {
  canManageTeam: 'pro',
  canSeeAdvancedReports: 'pro',
  canUseMarketingHubAI: 'pro',
  canUseSmartAnalytics: 'pro',
  canUseAdvancedSegmentation: 'unlimited',
};

export const planConfig: Record<BusinessPlan, PlanDefinition> = {
  starter: {
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
  pro: {
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
  unlimited: {
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
};

const SUBSCRIPTION_STATUS_ORDER: BusinessSubscriptionStatus[] = [
  'active',
  'trialing',
  'past_due',
  'canceled',
];

const ACTIVE_PAID_STATUSES: BusinessSubscriptionStatus[] = ['active', 'trialing'];

function throwEntitlementError(payload: EntitlementErrorPayload): never {
  throw new ConvexError(payload);
}

function normalizeBusinessPlan(value: unknown): BusinessPlan {
  if (value === 'pro' || value === 'unlimited') {
    return value;
  }
  return 'starter';
}

function normalizeBillingPeriod(value: unknown): BillingPeriod | null {
  if (value === 'monthly' || value === 'yearly') {
    return value;
  }
  return null;
}

function normalizeSubscriptionStatus(
  value: unknown,
  plan: BusinessPlan
): BusinessSubscriptionStatus {
  if (
    value === 'active' ||
    value === 'trialing' ||
    value === 'past_due' ||
    value === 'canceled'
  ) {
    return value;
  }
  return plan === 'starter' ? 'active' : 'active';
}

function isPaidPlanSubscriptionActive(
  plan: BusinessPlan,
  status: BusinessSubscriptionStatus
): boolean {
  if (plan === 'starter') {
    return true;
  }
  return ACTIVE_PAID_STATUSES.includes(status);
}

export function getCurrentMonthKey(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function resolveBusinessSubscriptionState(
  business: Doc<'businesses'>,
  now = Date.now()
): BusinessSubscriptionState {
  const currentMonthKey = getCurrentMonthKey(now);
  const plan = normalizeBusinessPlan(business.subscriptionPlan);
  const status = normalizeSubscriptionStatus(business.subscriptionStatus, plan);
  const rawMonthKey = business.aiCampaignsMonthKey ?? currentMonthKey;
  const aiCampaignsMonthKey =
    typeof rawMonthKey === 'string' && rawMonthKey.trim().length > 0
      ? rawMonthKey
      : currentMonthKey;
  const rawUsage = Number.isFinite(business.aiCampaignsUsedThisMonth)
    ? Number(business.aiCampaignsUsedThisMonth)
    : 0;
  const normalizedUsage = Math.max(0, Math.floor(rawUsage));
  const aiCampaignsUsedThisMonth =
    aiCampaignsMonthKey === currentMonthKey ? normalizedUsage : 0;

  return {
    plan,
    status,
    startAt: business.subscriptionStartAt ?? null,
    endAt: business.subscriptionEndAt ?? null,
    billingPeriod: normalizeBillingPeriod(business.billingPeriod),
    aiCampaignsUsedThisMonth,
    aiCampaignsMonthKey: currentMonthKey,
    isSubscriptionActive: isPaidPlanSubscriptionActive(plan, status),
  };
}

export function getRequiredPlanForLimit(
  limitKey: LimitKey,
  currentPlan: BusinessPlan
): BusinessPlan | null {
  const currentRank = PLAN_RANK[currentPlan];
  const currentLimit = planConfig[currentPlan].limits[limitKey];
  if (currentLimit === -1) {
    return null;
  }

  for (const plan of PLAN_ORDER) {
    if (PLAN_RANK[plan] <= currentRank) {
      continue;
    }
    const candidateLimit = planConfig[plan].limits[limitKey];
    if (candidateLimit === -1) {
      return plan;
    }
    if (candidateLimit > currentLimit) {
      return plan;
    }
  }

  return null;
}

function buildRequiredPlanByLimitFromCurrentPlan(): Record<
  BusinessPlan,
  Record<LimitKey, BusinessPlan | null>
> {
  return {
    starter: {
      maxCards: getRequiredPlanForLimit('maxCards', 'starter'),
      maxCustomers: getRequiredPlanForLimit('maxCustomers', 'starter'),
      maxAiCampaignsPerMonth: getRequiredPlanForLimit(
        'maxAiCampaignsPerMonth',
        'starter'
      ),
    },
    pro: {
      maxCards: getRequiredPlanForLimit('maxCards', 'pro'),
      maxCustomers: getRequiredPlanForLimit('maxCustomers', 'pro'),
      maxAiCampaignsPerMonth: getRequiredPlanForLimit(
        'maxAiCampaignsPerMonth',
        'pro'
      ),
    },
    unlimited: {
      maxCards: getRequiredPlanForLimit('maxCards', 'unlimited'),
      maxCustomers: getRequiredPlanForLimit('maxCustomers', 'unlimited'),
      maxAiCampaignsPerMonth: getRequiredPlanForLimit(
        'maxAiCampaignsPerMonth',
        'unlimited'
      ),
    },
  };
}

const REQUIRED_PLAN_BY_LIMIT_FROM_CURRENT_PLAN =
  buildRequiredPlanByLimitFromCurrentPlan();

export function buildBusinessEntitlementsFromBusiness(
  business: Doc<'businesses'>,
  now = Date.now()
): BusinessEntitlements {
  const state = resolveBusinessSubscriptionState(business, now);
  const config = planConfig[state.plan];
  const limit = config.limits.maxAiCampaignsPerMonth;
  const remaining =
    limit === -1 ? null : Math.max(0, limit - state.aiCampaignsUsedThisMonth);

  return {
    businessId: business._id,
    plan: state.plan,
    subscriptionStatus: state.status,
    subscriptionStartAt: state.startAt,
    subscriptionEndAt: state.endAt,
    billingPeriod: state.billingPeriod,
    isSubscriptionActive: state.isSubscriptionActive,
    limits: config.limits,
    features: config.features,
    pricing: config.pricing,
    usage: {
      aiCampaignsUsedThisMonth: state.aiCampaignsUsedThisMonth,
      aiCampaignsMonthKey: state.aiCampaignsMonthKey,
      aiCampaignsRemainingThisMonth: remaining,
    },
    requiredPlanMap: {
      byFeature: REQUIRED_PLAN_BY_FEATURE,
      byLimitFromCurrentPlan: REQUIRED_PLAN_BY_LIMIT_FROM_CURRENT_PLAN,
    },
  };
}

function assertEntitlementFromSnapshot(
  entitlements: BusinessEntitlements,
  requirement: EntitlementRequirement
) {
  if (!entitlements.isSubscriptionActive && entitlements.plan !== 'starter') {
    throwEntitlementError({
      code: 'SUBSCRIPTION_INACTIVE',
      businessId: String(entitlements.businessId),
      requiredPlan: entitlements.plan,
      subscriptionStatus: entitlements.subscriptionStatus,
      featureKey: requirement.featureKey,
      limitKey: requirement.limitKey,
      currentValue:
        typeof requirement.currentValue === 'number'
          ? requirement.currentValue
          : undefined,
    });
  }

  if (requirement.featureKey) {
    const hasFeature = entitlements.features[requirement.featureKey] === true;
    if (!hasFeature) {
      throwEntitlementError({
        code: 'FEATURE_NOT_AVAILABLE',
        businessId: String(entitlements.businessId),
        featureKey: requirement.featureKey,
        requiredPlan: REQUIRED_PLAN_BY_FEATURE[requirement.featureKey],
        subscriptionStatus: entitlements.subscriptionStatus,
      });
    }
  }

  if (requirement.limitKey) {
    const limitValue = entitlements.limits[requirement.limitKey];
    const currentValue = Number.isFinite(requirement.currentValue)
      ? Number(requirement.currentValue)
      : 0;

    if (limitValue !== -1 && currentValue >= limitValue) {
      throwEntitlementError({
        code: 'PLAN_LIMIT_REACHED',
        businessId: String(entitlements.businessId),
        requiredPlan:
          REQUIRED_PLAN_BY_LIMIT_FROM_CURRENT_PLAN[entitlements.plan][
            requirement.limitKey
          ] ?? undefined,
        featureKey: requirement.featureKey,
        limitKey: requirement.limitKey,
        limitValue,
        currentValue,
        subscriptionStatus: entitlements.subscriptionStatus,
      });
    }
  }
}

async function getBusinessOrThrow(ctx: any, businessId: Id<'businesses'>) {
  const business = await ctx.db.get(businessId);
  if (!business || business.isActive !== true) {
    throw new Error('BUSINESS_INACTIVE');
  }
  return business;
}

export async function getBusinessEntitlementsForBusinessId(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const business = await getBusinessOrThrow(ctx, businessId);
  return buildBusinessEntitlementsFromBusiness(business, Date.now());
}

export async function canUseFeature(
  ctx: any,
  businessId: Id<'businesses'>,
  featureKey: FeatureKey
) {
  const entitlements = await getBusinessEntitlementsForBusinessId(ctx, businessId);
  if (!entitlements.isSubscriptionActive && entitlements.plan !== 'starter') {
    return false;
  }
  return entitlements.features[featureKey] === true;
}

export async function assertEntitlement(
  ctx: any,
  businessId: Id<'businesses'>,
  requirement: EntitlementRequirement
) {
  const entitlements = await getBusinessEntitlementsForBusinessId(ctx, businessId);
  assertEntitlementFromSnapshot(entitlements, requirement);
  return entitlements;
}

export async function countActiveCustomersForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .collect();

  return new Set(memberships.map((membership: any) => String(membership.userId)))
    .size;
}

export async function reserveAiCampaignQuota(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const business = await getBusinessOrThrow(ctx, businessId);
  const entitlements = buildBusinessEntitlementsFromBusiness(business, Date.now());
  assertEntitlementFromSnapshot(entitlements, {
    featureKey: 'canUseMarketingHubAI',
    limitKey: 'maxAiCampaignsPerMonth',
    currentValue: entitlements.usage.aiCampaignsUsedThisMonth,
  });

  const usedBefore = entitlements.usage.aiCampaignsUsedThisMonth;
  const usedAfter = usedBefore + 1;
  const now = Date.now();
  await ctx.db.patch(businessId, {
    aiCampaignsMonthKey: getCurrentMonthKey(now),
    aiCampaignsUsedThisMonth: usedAfter,
    updatedAt: now,
  });

  return {
    usedBefore,
    usedAfter,
    limitValue: entitlements.limits.maxAiCampaignsPerMonth,
    monthKey: getCurrentMonthKey(now),
  };
}

export const getBusinessEntitlements = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return null;
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    return await getBusinessEntitlementsForBusinessId(ctx, businessId);
  },
});

export const getPlanCatalog = query({
  args: {},
  handler: async () => {
    return PLAN_ORDER.map((plan) => ({
      plan,
      ...planConfig[plan],
      requiredPlanByLimit: REQUIRED_PLAN_BY_LIMIT_FROM_CURRENT_PLAN[plan],
    }));
  },
});

export const syncBusinessSubscription = mutation({
  args: {
    businessId: v.id('businesses'),
    plan: v.union(v.literal('starter'), v.literal('pro'), v.literal('unlimited')),
    status: v.optional(
      v.union(
        v.literal('active'),
        v.literal('trialing'),
        v.literal('past_due'),
        v.literal('canceled')
      )
    ),
    period: v.optional(v.union(v.literal('monthly'), v.literal('yearly'))),
    startAt: v.optional(v.number()),
    endAt: v.optional(v.union(v.number(), v.null())),
    provider: v.optional(
      v.union(v.literal('revenuecat'), v.literal('mock'), v.literal('manual'))
    ),
    providerSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireActorIsBusinessOwner(ctx, args.businessId);
    const business = await getBusinessOrThrow(ctx, args.businessId);
    const now = Date.now();
    const monthKey = getCurrentMonthKey(now);
    const plan = args.plan;
    const status = normalizeSubscriptionStatus(args.status, plan);
    const billingPeriod = args.period ?? (plan === 'starter' ? null : 'monthly');
    const startAt = args.startAt ?? now;
    const endAt = args.endAt ?? null;
    const provider = args.provider ?? (plan === 'starter' ? 'manual' : 'mock');
    const subscriptionPeriod = args.period ?? 'monthly';

    const existingMonthKey = business.aiCampaignsMonthKey ?? monthKey;
    const existingUsage = Number.isFinite(business.aiCampaignsUsedThisMonth)
      ? Math.max(0, Math.floor(Number(business.aiCampaignsUsedThisMonth)))
      : 0;
    const normalizedUsage = existingMonthKey === monthKey ? existingUsage : 0;

    await ctx.db.patch(args.businessId, {
      subscriptionPlan: plan,
      subscriptionStatus: status,
      subscriptionStartAt: startAt,
      subscriptionEndAt: endAt,
      billingPeriod,
      aiCampaignsMonthKey: monthKey,
      aiCampaignsUsedThisMonth: normalizedUsage,
      updatedAt: now,
    });

    const existingSubscription = await ctx.db
      .query('subscriptions')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', args.businessId))
      .first();

    if (existingSubscription) {
      await ctx.db.patch(existingSubscription._id, {
        plan,
        status,
        period: subscriptionPeriod,
        startAt,
        endAt,
        provider,
        providerSubscriptionId: args.providerSubscriptionId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('subscriptions', {
        businessId: args.businessId,
        plan,
        status,
        period: subscriptionPeriod,
        startAt,
        endAt,
        provider,
        providerSubscriptionId: args.providerSubscriptionId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return await getBusinessEntitlementsForBusinessId(ctx, args.businessId);
  },
});

export const debugEntitlementConstants = query({
  args: {},
  handler: async () => {
    return {
      planOrder: PLAN_ORDER,
      planRank: PLAN_RANK,
      requiredPlanByFeature: REQUIRED_PLAN_BY_FEATURE,
      requiredPlanByLimitFromCurrentPlan:
        REQUIRED_PLAN_BY_LIMIT_FROM_CURRENT_PLAN,
      statusOrder: SUBSCRIPTION_STATUS_ORDER,
    };
  },
});
