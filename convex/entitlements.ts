import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import {
  requireActorIsBusinessOwner,
  requireActorIsStaffForBusiness,
} from './guards';
import { monthKeyFromTimestamp } from './lib/recommendationUtils';

export type BusinessPlan = 'starter' | 'pro' | 'premium';
export type LegacyBusinessPlan = 'starter' | 'pro' | 'unlimited' | 'free';
export type BusinessSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'inactive';
export type BillingPeriod = 'monthly' | 'yearly';

export type CanonicalFeatureKey =
  | 'team'
  | 'advancedReports'
  | 'marketingHub'
  | 'smartAnalytics'
  | 'segmentationBuilder'
  | 'savedSegments';
export type LegacyFeatureKey =
  | 'canManageTeam'
  | 'canSeeAdvancedReports'
  | 'canUseMarketingHubAI'
  | 'canUseSmartAnalytics'
  | 'canUseAdvancedSegmentation';
export type FeatureKey = CanonicalFeatureKey | LegacyFeatureKey;
export type LimitKey =
  | 'maxCards'
  | 'maxCustomers'
  | 'maxActiveRetentionActions'
  | 'maxCampaigns'
  | 'maxAiExecutionsPerMonth';

type CanonicalFeatureConfig = Record<CanonicalFeatureKey, boolean>;
type FeatureConfig = CanonicalFeatureConfig & Record<LegacyFeatureKey, boolean>;
type LimitConfig = Record<LimitKey, number>;

type PlanDefinition = {
  displayName: string;
  pricing: {
    monthly: number;
    yearly: number;
    currency: 'ILS';
  };
  limits: LimitConfig;
  features: CanonicalFeatureConfig;
};

type BusinessSubscriptionState = {
  plan: BusinessPlan;
  status: BusinessSubscriptionStatus;
  startAt: number | null;
  endAt: number | null;
  billingPeriod: BillingPeriod | null;
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
    activeRetentionActions: number;
    activeRetentionActionsRemaining: number;
    activeManagementCampaigns: number;
    activeManagementCampaignsRemaining: number;
    aiExecutionsThisMonth: number;
    aiExecutionsThisMonthRemaining: number;
  };
  requiredPlanMap: {
    byFeature: Record<FeatureKey, BusinessPlan>;
    byLimitFromCurrentPlan: Record<
      BusinessPlan,
      Record<LimitKey, BusinessPlan | null>
    >;
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
  limitType?: 'active_retention_actions' | 'ai_executions_monthly';
  limitValue?: number;
  currentValue?: number;
  planKey?: BusinessPlan;
  subscriptionStatus?: BusinessSubscriptionStatus;
};

export type EntitlementRequirement = {
  featureKey?: FeatureKey;
  limitKey?: LimitKey;
  currentValue?: number;
};

export const PLAN_ORDER: BusinessPlan[] = ['starter', 'pro', 'premium'];

export const PLAN_RANK: Record<BusinessPlan, number> = {
  starter: 0,
  pro: 1,
  premium: 2,
};

const FEATURE_ALIAS_MAP: Record<FeatureKey, CanonicalFeatureKey> = {
  team: 'team',
  advancedReports: 'advancedReports',
  marketingHub: 'marketingHub',
  smartAnalytics: 'smartAnalytics',
  segmentationBuilder: 'segmentationBuilder',
  savedSegments: 'savedSegments',
  canManageTeam: 'team',
  canSeeAdvancedReports: 'advancedReports',
  canUseMarketingHubAI: 'marketingHub',
  canUseSmartAnalytics: 'smartAnalytics',
  canUseAdvancedSegmentation: 'segmentationBuilder',
};

const LIMIT_KEYS: LimitKey[] = [
  'maxCards',
  'maxCustomers',
  'maxActiveRetentionActions',
  'maxCampaigns',
  'maxAiExecutionsPerMonth',
];

const MANAGEMENT_CAMPAIGN_TYPES = new Set([
  'welcome',
  'birthday',
  'anniversary',
  'winback',
  'promo',
]);

function expandFeatureConfig(features: CanonicalFeatureConfig): FeatureConfig {
  return {
    ...features,
    canManageTeam: features.team,
    canSeeAdvancedReports: features.advancedReports,
    canUseMarketingHubAI: features.marketingHub,
    canUseSmartAnalytics: features.smartAnalytics,
    canUseAdvancedSegmentation: features.segmentationBuilder,
  };
}

function expandRequiredPlanMap(
  requiredPlanByFeature: Record<CanonicalFeatureKey, BusinessPlan>
): Record<FeatureKey, BusinessPlan> {
  return {
    ...requiredPlanByFeature,
    canManageTeam: requiredPlanByFeature.team,
    canSeeAdvancedReports: requiredPlanByFeature.advancedReports,
    canUseMarketingHubAI: requiredPlanByFeature.marketingHub,
    canUseSmartAnalytics: requiredPlanByFeature.smartAnalytics,
    canUseAdvancedSegmentation: requiredPlanByFeature.segmentationBuilder,
  };
}

const REQUIRED_PLAN_BY_CANONICAL_FEATURE: Record<
  CanonicalFeatureKey,
  BusinessPlan
> = {
  team: 'pro',
  advancedReports: 'pro',
  marketingHub: 'pro',
  smartAnalytics: 'pro',
  segmentationBuilder: 'premium',
  savedSegments: 'premium',
};

export const REQUIRED_PLAN_BY_FEATURE = expandRequiredPlanMap(
  REQUIRED_PLAN_BY_CANONICAL_FEATURE
);

export const planConfig: Record<BusinessPlan, PlanDefinition> = {
  starter: {
    displayName: 'Starter',
    pricing: {
      monthly: 0,
      yearly: 0,
      currency: 'ILS',
    },
    limits: {
      maxCards: 1,
      maxCustomers: 30,
      maxActiveRetentionActions: 0,
      maxCampaigns: 1,
      maxAiExecutionsPerMonth: 0,
    },
    features: {
      team: false,
      advancedReports: false,
      marketingHub: false,
      smartAnalytics: false,
      segmentationBuilder: false,
      savedSegments: false,
    },
  },
  pro: {
    displayName: 'Pro AI',
    pricing: {
      monthly: 129,
      yearly: 1238,
      currency: 'ILS',
    },
    limits: {
      maxCards: 5,
      maxCustomers: 2000,
      maxActiveRetentionActions: 5,
      maxCampaigns: 5,
      maxAiExecutionsPerMonth: 100,
    },
    features: {
      team: true,
      advancedReports: true,
      marketingHub: true,
      smartAnalytics: true,
      segmentationBuilder: false,
      savedSegments: false,
    },
  },
  premium: {
    displayName: 'Premium AI',
    pricing: {
      monthly: 249,
      yearly: 2390,
      currency: 'ILS',
    },
    limits: {
      maxCards: 10,
      maxCustomers: 10000,
      maxActiveRetentionActions: 15,
      maxCampaigns: 10,
      maxAiExecutionsPerMonth: 300,
    },
    features: {
      team: true,
      advancedReports: true,
      marketingHub: true,
      smartAnalytics: true,
      segmentationBuilder: true,
      savedSegments: true,
    },
  },
};

const SUBSCRIPTION_STATUS_ORDER: BusinessSubscriptionStatus[] = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'inactive',
];

const ACTIVE_PAID_STATUSES: BusinessSubscriptionStatus[] = [
  'active',
  'trialing',
];

function throwEntitlementError(payload: EntitlementErrorPayload): never {
  throw new ConvexError(payload);
}

export function normalizeBusinessPlan(value: unknown): BusinessPlan {
  if (value === 'premium' || value === 'unlimited') {
    return 'premium';
  }
  if (value === 'pro') {
    return 'pro';
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
    value === 'canceled' ||
    value === 'inactive'
  ) {
    return value;
  }
  return plan === 'starter' ? 'active' : 'inactive';
}

function normalizeFeatureKey(featureKey: FeatureKey): CanonicalFeatureKey {
  return FEATURE_ALIAS_MAP[featureKey];
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

function resolveBusinessSubscriptionState(
  business: Doc<'businesses'>,
  _now = Date.now()
): BusinessSubscriptionState {
  const plan = normalizeBusinessPlan(business.subscriptionPlan);
  const status = normalizeSubscriptionStatus(business.subscriptionStatus, plan);

  return {
    plan,
    status,
    startAt: business.subscriptionStartAt ?? null,
    endAt: business.subscriptionEndAt ?? null,
    billingPeriod: normalizeBillingPeriod(business.billingPeriod),
    isSubscriptionActive: isPaidPlanSubscriptionActive(plan, status),
  };
}

export function getRequiredPlanForLimit(
  limitKey: LimitKey,
  currentPlan: BusinessPlan
): BusinessPlan | null {
  const currentRank = PLAN_RANK[currentPlan];
  const currentLimit = planConfig[currentPlan].limits[limitKey];

  for (const plan of PLAN_ORDER) {
    if (PLAN_RANK[plan] <= currentRank) {
      continue;
    }
    const candidateLimit = planConfig[plan].limits[limitKey];
    if (candidateLimit > currentLimit) {
      return plan;
    }
  }

  return null;
}

export function getRequiredPlanForFeature(
  featureKey: FeatureKey
): BusinessPlan {
  return REQUIRED_PLAN_BY_FEATURE[featureKey];
}

export function getRequiredUpgradePlan(
  args:
    | { featureKey: FeatureKey }
    | { limitKey: LimitKey; currentPlan: BusinessPlan }
): BusinessPlan | null {
  if ('featureKey' in args) {
    return getRequiredPlanForFeature(args.featureKey);
  }
  return getRequiredPlanForLimit(args.limitKey, args.currentPlan);
}

function buildRequiredPlanByLimitFromCurrentPlan(): Record<
  BusinessPlan,
  Record<LimitKey, BusinessPlan | null>
> {
  return PLAN_ORDER.reduce(
    (acc, plan) => {
      const byLimit = LIMIT_KEYS.reduce(
        (limitAcc, limitKey) => {
          limitAcc[limitKey] = getRequiredPlanForLimit(limitKey, plan);
          return limitAcc;
        },
        {} as Record<LimitKey, BusinessPlan | null>
      );
      acc[plan] = byLimit;
      return acc;
    },
    {} as Record<BusinessPlan, Record<LimitKey, BusinessPlan | null>>
  );
}

const REQUIRED_PLAN_BY_LIMIT_FROM_CURRENT_PLAN =
  buildRequiredPlanByLimitFromCurrentPlan();

export function buildBusinessEntitlementsFromBusiness(
  business: Doc<'businesses'>,
  now = Date.now(),
  options?: {
    activeRetentionActions?: number;
    activeManagementCampaigns?: number;
    aiExecutionsThisMonth?: number;
  }
): BusinessEntitlements {
  const state = resolveBusinessSubscriptionState(business, now);
  const config = planConfig[state.plan];
  const activeRetentionActions = Number.isFinite(
    options?.activeRetentionActions
  )
    ? Math.max(0, Math.floor(Number(options?.activeRetentionActions)))
    : 0;
  const remaining = Math.max(
    0,
    config.limits.maxActiveRetentionActions - activeRetentionActions
  );
  const activeManagementCampaigns = Number.isFinite(
    options?.activeManagementCampaigns
  )
    ? Math.max(0, Math.floor(Number(options?.activeManagementCampaigns)))
    : 0;
  const activeManagementCampaignsRemaining = Math.max(
    0,
    config.limits.maxCampaigns - activeManagementCampaigns
  );
  const aiExecutionsThisMonth = Number.isFinite(options?.aiExecutionsThisMonth)
    ? Math.max(0, Math.floor(Number(options?.aiExecutionsThisMonth)))
    : 0;
  const aiExecutionsThisMonthRemaining = Math.max(
    0,
    config.limits.maxAiExecutionsPerMonth - aiExecutionsThisMonth
  );

  return {
    businessId: business._id,
    plan: state.plan,
    subscriptionStatus: state.status,
    subscriptionStartAt: state.startAt,
    subscriptionEndAt: state.endAt,
    billingPeriod: state.billingPeriod,
    isSubscriptionActive: state.isSubscriptionActive,
    limits: config.limits,
    features: expandFeatureConfig(config.features),
    pricing: config.pricing,
    usage: {
      activeRetentionActions,
      activeRetentionActionsRemaining: remaining,
      activeManagementCampaigns,
      activeManagementCampaignsRemaining,
      aiExecutionsThisMonth,
      aiExecutionsThisMonthRemaining,
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
      planKey: entitlements.plan,
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
    const canonicalFeatureKey = normalizeFeatureKey(requirement.featureKey);
    const hasFeature = entitlements.features[canonicalFeatureKey] === true;
    if (!hasFeature) {
      throwEntitlementError({
        code: 'FEATURE_NOT_AVAILABLE',
        businessId: String(entitlements.businessId),
        featureKey: requirement.featureKey,
        requiredPlan: REQUIRED_PLAN_BY_CANONICAL_FEATURE[canonicalFeatureKey],
        planKey: entitlements.plan,
        subscriptionStatus: entitlements.subscriptionStatus,
      });
    }
  }

  if (requirement.limitKey) {
    const limitValue = entitlements.limits[requirement.limitKey];
    const currentValue = Number.isFinite(requirement.currentValue)
      ? Number(requirement.currentValue)
      : 0;

    if (currentValue >= limitValue) {
      throwEntitlementError({
        code: 'PLAN_LIMIT_REACHED',
        businessId: String(entitlements.businessId),
        requiredPlan:
          REQUIRED_PLAN_BY_LIMIT_FROM_CURRENT_PLAN[entitlements.plan][
            requirement.limitKey
          ] ?? undefined,
        featureKey: requirement.featureKey,
        limitKey: requirement.limitKey,
        limitType:
          requirement.limitKey === 'maxActiveRetentionActions'
            ? 'active_retention_actions'
            : requirement.limitKey === 'maxAiExecutionsPerMonth'
              ? 'ai_executions_monthly'
              : undefined,
        limitValue,
        currentValue,
        planKey: entitlements.plan,
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
  const monthKey = monthKeyFromTimestamp(Date.now());
  const [
    business,
    activeRetentionActions,
    activeManagementCampaigns,
    aiExecutionsThisMonth,
  ] = await Promise.all([
    getBusinessOrThrow(ctx, businessId),
    countActiveRetentionActionsForBusiness(ctx, businessId),
    countActiveManagementCampaignsForBusiness(ctx, businessId),
    countAiExecutionsForBusinessInMonth(ctx, businessId, monthKey),
  ]);
  return buildBusinessEntitlementsFromBusiness(business, Date.now(), {
    activeRetentionActions,
    activeManagementCampaigns,
    aiExecutionsThisMonth,
  });
}

export async function hasFeature(
  ctx: any,
  businessId: Id<'businesses'>,
  featureKey: FeatureKey
) {
  const entitlements = await getBusinessEntitlementsForBusinessId(
    ctx,
    businessId
  );
  if (!entitlements.isSubscriptionActive && entitlements.plan !== 'starter') {
    return false;
  }
  const canonicalFeatureKey = normalizeFeatureKey(featureKey);
  return entitlements.features[canonicalFeatureKey] === true;
}

export async function canUseFeature(
  ctx: any,
  businessId: Id<'businesses'>,
  featureKey: FeatureKey
) {
  return hasFeature(ctx, businessId, featureKey);
}

export async function assertFeature(
  ctx: any,
  businessId: Id<'businesses'>,
  featureKey: FeatureKey
) {
  return assertEntitlement(ctx, businessId, { featureKey });
}

export async function assertLimit(
  ctx: any,
  businessId: Id<'businesses'>,
  limitKey: LimitKey,
  currentValue: number
) {
  return assertEntitlement(ctx, businessId, { limitKey, currentValue });
}

export async function assertEntitlement(
  ctx: any,
  businessId: Id<'businesses'>,
  requirement: EntitlementRequirement
) {
  const entitlements = await getBusinessEntitlementsForBusinessId(
    ctx,
    businessId
  );
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

  return new Set(
    memberships.map((membership: any) => String(membership.userId))
  ).size;
}

export async function countActiveRetentionActionsForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const campaigns = await ctx.db
    .query('campaigns')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) =>
      q.and(
        q.eq(q.field('type'), 'retention_action'),
        q.eq(q.field('status'), 'active'),
        q.eq(q.field('isActive'), true)
      )
    )
    .collect();
  return campaigns.length;
}

export async function countActiveManagementCampaignsForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const campaigns = await ctx.db
    .query('campaigns')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .collect();

  return campaigns.filter((campaign: any) =>
    MANAGEMENT_CAMPAIGN_TYPES.has(campaign.type)
  ).length;
}

export async function countAiExecutionsForBusinessInMonth(
  ctx: any,
  businessId: Id<'businesses'>,
  monthKey: string
) {
  const usageRows = await ctx.db
    .query('aiUsageLedger')
    .withIndex('by_businessId_monthKey', (q: any) =>
      q.eq('businessId', businessId).eq('monthKey', monthKey)
    )
    .collect();

  return usageRows.filter(
    (row: any) => row.status === 'success' && row.cacheHit !== true
  ).length;
}

export async function getUsageSummary(ctx: any, businessId: Id<'businesses'>) {
  const monthKey = monthKeyFromTimestamp(Date.now());
  const [
    business,
    programs,
    activeCustomers,
    activeRetentionActions,
    activeManagementCampaigns,
    aiExecutionsThisMonth,
  ] = await Promise.all([
    getBusinessOrThrow(ctx, businessId),
    ctx.db
      .query('loyaltyPrograms')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect(),
    countActiveCustomersForBusiness(ctx, businessId),
    countActiveRetentionActionsForBusiness(ctx, businessId),
    countActiveManagementCampaignsForBusiness(ctx, businessId),
    countAiExecutionsForBusinessInMonth(ctx, businessId, monthKey),
  ]);

  const entitlements = buildBusinessEntitlementsFromBusiness(
    business,
    Date.now(),
    {
      activeRetentionActions,
      activeManagementCampaigns,
      aiExecutionsThisMonth,
    }
  );
  const cardsUsed = programs.filter((program: any) => {
    if (program.status === 'active') {
      return true;
    }
    if (program.status === 'draft' || program.status === 'archived') {
      return false;
    }
    return program.isArchived !== true;
  }).length;
  return {
    cardsUsed,
    customersUsed: activeCustomers,
    activeRetentionActionsUsed: entitlements.usage.activeRetentionActions,
    activeManagementCampaignsUsed: entitlements.usage.activeManagementCampaigns,
    aiExecutionsThisMonthUsed: entitlements.usage.aiExecutionsThisMonth,
    limits: entitlements.limits,
    billingPeriod: entitlements.billingPeriod,
    plan: entitlements.plan,
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

export const getBusinessUsageSummary = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return null;
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    return await getUsageSummary(ctx, businessId);
  },
});

export const getPlanCatalog = query({
  args: {},
  handler: async () => {
    return PLAN_ORDER.map((plan) => ({
      plan,
      label: planConfig[plan].displayName,
      displayName: planConfig[plan].displayName,
      monthlyPrice: planConfig[plan].pricing.monthly,
      yearlyPrice: planConfig[plan].pricing.yearly,
      pricing: planConfig[plan].pricing,
      limits: planConfig[plan].limits,
      features: expandFeatureConfig(planConfig[plan].features),
      requiredPlanByLimit: REQUIRED_PLAN_BY_LIMIT_FROM_CURRENT_PLAN[plan],
    }));
  },
});

export const syncBusinessSubscription = mutation({
  args: {
    businessId: v.id('businesses'),
    plan: v.union(v.literal('starter'), v.literal('pro'), v.literal('premium')),
    status: v.optional(
      v.union(
        v.literal('active'),
        v.literal('trialing'),
        v.literal('past_due'),
        v.literal('canceled'),
        v.literal('inactive')
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
    const plan = normalizeBusinessPlan(args.plan);
    const status = normalizeSubscriptionStatus(args.status, plan);
    const billingPeriod =
      plan === 'starter'
        ? null
        : (args.period ?? business.billingPeriod ?? 'monthly');
    const startAt = args.startAt ?? now;
    const endAt = args.endAt ?? null;
    const provider = args.provider ?? (plan === 'starter' ? 'manual' : 'mock');
    const subscriptionPeriod = args.period ?? 'monthly';

    await ctx.db.patch(args.businessId, {
      subscriptionPlan: plan,
      subscriptionStatus: status,
      subscriptionStartAt: startAt,
      subscriptionEndAt: endAt,
      billingPeriod,
      updatedAt: now,
    });

    const existingSubscription = await ctx.db
      .query('subscriptions')
      .withIndex('by_businessId', (q: any) =>
        q.eq('businessId', args.businessId)
      )
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
