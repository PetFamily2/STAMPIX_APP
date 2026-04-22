import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import {
  getBusinessStaffStatus,
  requireActorHasBusinessCapability,
  requireActorIsBusinessOwner,
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
  | 'smartAnalytics';
export type LegacyFeatureKey =
  | 'canManageTeam'
  | 'canSeeAdvancedReports'
  | 'canUseMarketingHubAI'
  | 'canUseSmartAnalytics';
export type FeatureKey = CanonicalFeatureKey | LegacyFeatureKey;
export type LimitKey =
  | 'maxCards'
  | 'maxCustomers'
  | 'maxActiveRetentionActions'
  | 'maxCampaigns'
  | 'maxAiExecutionsPerMonth'
  | 'maxTeamSeats';

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
  effectivePlan: BusinessPlan;
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
    activeManagementCampaignsOverLimit: boolean;
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
  canManageTeam: 'team',
  canSeeAdvancedReports: 'advancedReports',
  canUseMarketingHubAI: 'marketingHub',
  canUseSmartAnalytics: 'smartAnalytics',
};

const LIMIT_KEYS: LimitKey[] = [
  'maxCards',
  'maxCustomers',
  'maxActiveRetentionActions',
  'maxCampaigns',
  'maxAiExecutionsPerMonth',
  'maxTeamSeats',
];

function expandFeatureConfig(features: CanonicalFeatureConfig): FeatureConfig {
  return {
    ...features,
    canManageTeam: features.team,
    canSeeAdvancedReports: features.advancedReports,
    canUseMarketingHubAI: features.marketingHub,
    canUseSmartAnalytics: features.smartAnalytics,
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
  };
}

const REQUIRED_PLAN_BY_CANONICAL_FEATURE: Record<
  CanonicalFeatureKey,
  BusinessPlan
> = {
  team: 'pro',
  advancedReports: 'pro',
  marketingHub: 'starter',
  smartAnalytics: 'starter',
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
      maxTeamSeats: 0,
    },
    features: {
      team: false,
      advancedReports: false,
      marketingHub: true,
      smartAnalytics: true,
    },
  },
  pro: {
    displayName: 'Pro',
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
      maxTeamSeats: 5,
    },
    features: {
      team: true,
      advancedReports: true,
      marketingHub: true,
      smartAnalytics: true,
    },
  },
  premium: {
    displayName: 'Pro Max',
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
      maxTeamSeats: 20,
    },
    features: {
      team: true,
      advancedReports: true,
      marketingHub: true,
      smartAnalytics: true,
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
    activeCampaigns?: number;
    activeManagementCampaigns?: number;
    aiExecutionsThisMonth?: number;
  }
): BusinessEntitlements {
  const state = resolveBusinessSubscriptionState(business, now);
  const effectivePlan =
    state.isSubscriptionActive || state.plan === 'starter'
      ? state.plan
      : 'starter';
  const config = planConfig[effectivePlan];
  const activeRetentionActions = Number.isFinite(
    options?.activeRetentionActions
  )
    ? Math.max(0, Math.floor(Number(options?.activeRetentionActions)))
    : 0;
  const remaining = Math.max(
    0,
    config.limits.maxActiveRetentionActions - activeRetentionActions
  );
  const activeCampaignsSource = Number.isFinite(options?.activeCampaigns)
    ? options?.activeCampaigns
    : options?.activeManagementCampaigns;
  const activeManagementCampaigns = Number.isFinite(activeCampaignsSource)
    ? Math.max(0, Math.floor(Number(activeCampaignsSource)))
    : 0;
  const activeManagementCampaignsRemaining = Math.max(
    0,
    config.limits.maxCampaigns - activeManagementCampaigns
  );
  const activeManagementCampaignsOverLimit =
    activeManagementCampaigns > config.limits.maxCampaigns;
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
    effectivePlan,
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
      activeManagementCampaignsOverLimit,
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
  const isPaidPlanInactive =
    !entitlements.isSubscriptionActive && entitlements.plan !== 'starter';

  if (requirement.featureKey) {
    const canonicalFeatureKey = normalizeFeatureKey(requirement.featureKey);
    const hasFeature = entitlements.features[canonicalFeatureKey] === true;
    if (!hasFeature) {
      if (isPaidPlanInactive) {
        throwEntitlementError({
          code: 'SUBSCRIPTION_INACTIVE',
          businessId: String(entitlements.businessId),
          requiredPlan: entitlements.plan,
          planKey: entitlements.plan,
          subscriptionStatus: entitlements.subscriptionStatus,
          featureKey: requirement.featureKey,
        });
      }
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
    activeCampaigns,
    aiExecutionsThisMonth,
  ] = await Promise.all([
    getBusinessOrThrow(ctx, businessId),
    countActiveRetentionActionsForBusiness(ctx, businessId),
    countActiveCampaignsForBusiness(ctx, businessId),
    countAiExecutionsForBusinessInMonth(ctx, businessId, monthKey),
  ]);
  return buildBusinessEntitlementsFromBusiness(business, Date.now(), {
    activeRetentionActions,
    activeCampaigns,
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

export function getCampaignLifecycleState(campaign: any) {
  if (
    campaign?.activationStatus === 'draft' ||
    campaign?.activationStatus === 'active' ||
    campaign?.activationStatus === 'paused' ||
    campaign?.activationStatus === 'completed' ||
    campaign?.activationStatus === 'archived'
  ) {
    return campaign.activationStatus;
  }
  if (
    campaign?.status === 'draft' ||
    campaign?.status === 'active' ||
    campaign?.status === 'paused' ||
    campaign?.status === 'completed' ||
    campaign?.status === 'archived'
  ) {
    return campaign.status;
  }
  return 'active';
}

export function getCampaignScheduleMode(campaign: any) {
  if (
    campaign?.schedule?.mode === 'send_now' ||
    campaign?.schedule?.mode === 'one_time' ||
    campaign?.schedule?.mode === 'recurring'
  ) {
    return campaign.schedule.mode;
  }
  return null;
}

export function countsTowardCampaignDefinitions(campaign: any) {
  if (campaign?.isActive !== true) {
    return false;
  }

  const lifecycle = getCampaignLifecycleState(campaign);
  if (lifecycle === 'completed' || lifecycle === 'archived') {
    return false;
  }

  return true;
}

export function countsTowardRecurringLiveLimit(campaign: any) {
  if (campaign?.isActive !== true) {
    return false;
  }

  if (campaign?.type === 'retention_action' && campaign?.status === 'active') {
    // Legacy recurring retention actions during migration.
    return true;
  }

  const lifecycle = getCampaignLifecycleState(campaign);
  const scheduleMode = getCampaignScheduleMode(campaign);
  if (scheduleMode === 'recurring' && lifecycle === 'active') {
    return true;
  }

  // Compatibility path for legacy automation-enabled management campaigns
  // that predate schedule.mode=recurring.
  return (
    scheduleMode === null &&
    campaign?.automationEnabled === true &&
    lifecycle === 'active' &&
    campaign?.type !== 'ai_marketing' &&
    campaign?.type !== 'ai_retention'
  );
}

export async function countActiveRetentionActionsForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const campaigns = await ctx.db
    .query('campaigns')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .collect();
  return campaigns.filter(countsTowardRecurringLiveLimit).length;
}

export async function countActiveManagementCampaignsForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  return countActiveCampaignsForBusiness(ctx, businessId);
}

export async function countActiveCampaignsForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const campaigns = await ctx.db
    .query('campaigns')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .collect();

  return campaigns.filter(countsTowardCampaignDefinitions).length;
}

export async function assertCampaignsNotOverLimit(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const entitlements = await getBusinessEntitlementsForBusinessId(
    ctx,
    businessId
  );
  const currentValue = entitlements.usage.activeManagementCampaigns;
  const limitValue = entitlements.limits.maxCampaigns;
  if (currentValue > limitValue) {
    throwEntitlementError({
      code: 'PLAN_LIMIT_REACHED',
      businessId: String(entitlements.businessId),
      requiredPlan:
        REQUIRED_PLAN_BY_LIMIT_FROM_CURRENT_PLAN[entitlements.plan]
          .maxCampaigns ?? undefined,
      limitKey: 'maxCampaigns',
      limitValue,
      currentValue,
      planKey: entitlements.plan,
      subscriptionStatus: entitlements.subscriptionStatus,
    });
  }
  return entitlements;
}

type CampaignLimitRemediationResult = {
  overLimit: boolean;
  activeCampaigns: number;
  campaignLimit: number;
  patchedCampaigns: number;
  pausedRetentionActions: number;
};

export async function enforceCampaignLimitForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
): Promise<CampaignLimitRemediationResult> {
  const entitlements = await getBusinessEntitlementsForBusinessId(
    ctx,
    businessId
  );
  const activeCampaigns = entitlements.usage.activeManagementCampaigns;
  const campaignLimit = entitlements.limits.maxCampaigns;
  if (activeCampaigns <= campaignLimit) {
    return {
      overLimit: false,
      activeCampaigns,
      campaignLimit,
      patchedCampaigns: 0,
      pausedRetentionActions: 0,
    };
  }

  const campaigns = await ctx.db
    .query('campaigns')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .collect();

  const now = Date.now();
  let patchedCampaigns = 0;
  let pausedRetentionActions = 0;

  for (const campaign of campaigns) {
    const patchPayload: Record<string, unknown> = { updatedAt: now };
    let shouldPatch = false;

    if (campaign.automationEnabled === true) {
      patchPayload.automationEnabled = false;
      shouldPatch = true;
    }

    if (campaign.type === 'retention_action' && campaign.status === 'active') {
      patchPayload.status = 'paused';
      shouldPatch = true;
      pausedRetentionActions += 1;
    }

    if (!shouldPatch) {
      continue;
    }
    await ctx.db.patch(campaign._id, patchPayload);
    patchedCampaigns += 1;
  }

  return {
    overLimit: true,
    activeCampaigns,
    campaignLimit,
    patchedCampaigns,
    pausedRetentionActions,
  };
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
    activeCampaigns,
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
    countActiveCampaignsForBusiness(ctx, businessId),
    countAiExecutionsForBusinessInMonth(ctx, businessId, monthKey),
  ]);

  const entitlements = buildBusinessEntitlementsFromBusiness(
    business,
    Date.now(),
    {
      activeRetentionActions,
      activeCampaigns,
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

    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'view_usage_quota'
    );
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

    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'view_usage_quota'
    );
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

type StaffRole = 'owner' | 'manager' | 'staff';

export function isTeamDisabledByPlanOrStatus(
  plan: BusinessPlan,
  status: BusinessSubscriptionStatus
) {
  return plan === 'starter' || !isPaidPlanSubscriptionActive(plan, status);
}

async function writePlanTeamEvent(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    targetUserId?: Id<'users'>;
    targetInviteId?: Id<'staffInvites'>;
    eventType: 'auto_disabled_by_plan' | 'auto_invites_cancelled_by_plan';
    fromStatus?: 'active' | 'suspended' | 'removed';
    toStatus?: 'active' | 'suspended' | 'removed';
    reasonCode: string;
    now: number;
  }
) {
  await ctx.db.insert('staffEvents', {
    businessId: args.businessId,
    actorUserId: undefined,
    targetUserId: args.targetUserId,
    targetInviteId: args.targetInviteId,
    eventType: args.eventType,
    fromRole: undefined,
    toRole: undefined,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    reasonCode: args.reasonCode,
    createdAt: args.now,
  });
}

export async function enforceTeamAccessForPlanState(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    plan: BusinessPlan;
    status: BusinessSubscriptionStatus;
    now: number;
  }
) {
  if (!isTeamDisabledByPlanOrStatus(args.plan, args.status)) {
    return;
  }

  const reasonCode =
    args.plan === 'starter'
      ? 'team_disabled_on_starter'
      : 'team_disabled_on_inactive_subscription';

  const staffRows = await ctx.db
    .query('businessStaff')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', args.businessId))
    .collect();

  for (const staff of staffRows) {
    const staffRole = staff.staffRole as StaffRole;
    const currentStatus = getBusinessStaffStatus(staff);
    if (staffRole === 'owner' || currentStatus !== 'active') {
      continue;
    }

    await ctx.db.patch(staff._id, {
      status: 'suspended',
      isActive: false,
      statusChangedAt: args.now,
      statusChangedByUserId: undefined,
      updatedAt: args.now,
    });

    await writePlanTeamEvent(ctx, {
      businessId: args.businessId,
      targetUserId: staff.userId,
      eventType: 'auto_disabled_by_plan',
      fromStatus: 'active',
      toStatus: 'suspended',
      reasonCode,
      now: args.now,
    });
  }

  const pendingInvites = await ctx.db
    .query('staffInvites')
    .withIndex('by_businessId_status', (q: any) =>
      q.eq('businessId', args.businessId).eq('status', 'pending')
    )
    .collect();

  for (const invite of pendingInvites) {
    await ctx.db.patch(invite._id, {
      status: 'cancelled',
      cancelledAt: args.now,
      cancelledByUserId: undefined,
    });

    await writePlanTeamEvent(ctx, {
      businessId: args.businessId,
      targetInviteId: invite._id,
      eventType: 'auto_invites_cancelled_by_plan',
      reasonCode,
      now: args.now,
    });
  }
}

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

    await enforceTeamAccessForPlanState(ctx, {
      businessId: args.businessId,
      plan,
      status,
      now,
    });
    await enforceCampaignLimitForBusiness(ctx, args.businessId);
    try {
      await ctx.runMutation(
        internal.referrals.processBusinessReferralSubscriptionSyncInternal,
        {
          businessId: args.businessId,
        }
      );
    } catch {
      // Referral subscription sync is best-effort and must not break billing sync.
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
