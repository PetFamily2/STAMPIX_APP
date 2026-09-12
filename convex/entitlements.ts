import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { requireActorHasBusinessCapability } from './guards';
import { reserveUsageSlot } from './lib/billing/usageCounters';
import {
  ensureBusinessBillingAccount,
  getBillingAccountByProviderAppUserId,
  getBillingAccountForBusiness,
} from './lib/billing/accounts';
import {
  resolveCanonicalBillingState,
} from './lib/billing/lifecycle';
import {
  type BillingPeriod as ContractBillingPeriod,
  type BusinessPlan as ContractBusinessPlan,
  PLAN_ORDER as CONTRACT_PLAN_ORDER,
  PLAN_RANK as CONTRACT_PLAN_RANK,
  planConfig as CONTRACT_PLAN_CONFIG,
  REQUIRED_PLAN_BY_CANONICAL_FEATURE as CONTRACT_REQUIRED_PLAN_BY_FEATURE,
} from './lib/billing/productionContract';
import { resolveRevenueCatPlanMapping as resolveMappedRevenueCatProduct } from './lib/billing/productMap';
import {
  isLegacyBusinessScopedAppUserId,
  parseLegacyBusinessIdFromAppUserId,
} from './lib/billing/identity';
import { evaluateReferralProgressFromBillingEvent } from './lib/referrals/billingHook';
import { monthKeyFromTimestamp } from './lib/recommendationUtils';
import { markSmartManagerDirty } from './lib/smartManagerDirty';

export type BusinessPlan = ContractBusinessPlan;
export type LegacyBusinessPlan = 'starter' | 'pro' | 'unlimited' | 'free';
export type BusinessSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'inactive';
export type BillingPeriod = ContractBillingPeriod;

export type RevenueCatPlanMapping = {
  plan: BusinessPlan;
  period: BillingPeriod;
};

export type CanonicalFeatureKey =
  | 'team'
  | 'advancedReports'
  | 'marketingHub'
  | 'smartAnalytics'
  | 'smartRetentionManager'
  | 'smartRetentionManagerAiAssist';
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
  reserveSlot?: boolean;
};

export const PLAN_ORDER: BusinessPlan[] = CONTRACT_PLAN_ORDER;

export const PLAN_RANK: Record<BusinessPlan, number> = CONTRACT_PLAN_RANK;

const FEATURE_ALIAS_MAP: Record<FeatureKey, CanonicalFeatureKey> = {
  team: 'team',
  advancedReports: 'advancedReports',
  marketingHub: 'marketingHub',
  smartAnalytics: 'smartAnalytics',
  smartRetentionManager: 'smartRetentionManager',
  smartRetentionManagerAiAssist: 'smartRetentionManagerAiAssist',
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
> = CONTRACT_REQUIRED_PLAN_BY_FEATURE;

export const REQUIRED_PLAN_BY_FEATURE = expandRequiredPlanMap(
  REQUIRED_PLAN_BY_CANONICAL_FEATURE
);

export const planConfig: Record<BusinessPlan, PlanDefinition> = {
  starter: {
    displayName: CONTRACT_PLAN_CONFIG.starter.displayName,
    pricing: CONTRACT_PLAN_CONFIG.starter.pricing,
    limits: CONTRACT_PLAN_CONFIG.starter.limits,
    features: CONTRACT_PLAN_CONFIG.starter.features,
  },
  pro: {
    displayName: CONTRACT_PLAN_CONFIG.pro.displayName,
    pricing: CONTRACT_PLAN_CONFIG.pro.pricing,
    limits: CONTRACT_PLAN_CONFIG.pro.limits,
    features: CONTRACT_PLAN_CONFIG.pro.features,
  },
  premium: {
    displayName: CONTRACT_PLAN_CONFIG.premium.displayName,
    pricing: CONTRACT_PLAN_CONFIG.premium.pricing,
    limits: CONTRACT_PLAN_CONFIG.premium.limits,
    features: CONTRACT_PLAN_CONFIG.premium.features,
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

const REVENUECAT_ACTIVATION_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'NON_RENEWING_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'TRIAL_STARTED',
  'SUBSCRIPTION_EXTENDED',
  'REFUND_REVERSED',
]);

const REVENUECAT_REVOKE_EVENT_TYPES = new Set(['EXPIRATION', 'REFUND']);

const REVENUECAT_PAST_DUE_EVENT_TYPES = new Set(['BILLING_ISSUE']);
const REVENUECAT_CANCELLATION_EVENT_TYPES = new Set(['CANCELLATION']);
const REVENUECAT_SAFE_IRRELEVANT_EVENT_TYPES = new Set([
  'TRANSFER',
  'SUBSCRIBER_ALIAS',
  'TEST',
  'EXPERIMENT_ENROLLMENT',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'INVOICE_ISSUANCE',
]);

function throwEntitlementError(payload: EntitlementErrorPayload): never {
  throw new ConvexError(payload);
}

export function resolveRevenueCatPlanMapping(args: {
  productId?: string;
  newProductId?: string;
  entitlementIds?: string[];
  requireEntitlement?: boolean;
}): RevenueCatPlanMapping {
  const mapped = resolveMappedRevenueCatProduct({
    productId: args.productId,
    newProductId: args.newProductId,
    entitlementIds: args.entitlementIds,
    requireEntitlement: args.requireEntitlement,
  });
  return {
    plan: mapped.plan,
    period: mapped.period,
  };
}

function normalizeRevenueCatSubscriptionStatus(
  eventType: string
): BusinessSubscriptionStatus {
  if (eventType === 'TRIAL_STARTED') {
    return 'trialing';
  }
  if (REVENUECAT_PAST_DUE_EVENT_TYPES.has(eventType)) {
    return 'past_due';
  }
  if (eventType === 'CANCELLATION') {
    return 'canceled';
  }
  if (
    eventType === 'EXPIRATION' ||
    eventType === 'REFUND' ||
    eventType === 'SUBSCRIPTION_PAUSED'
  ) {
    return 'inactive';
  }
  return 'active';
}

function shouldRevokeAccessForRevenueCatEvent(eventType: string) {
  return REVENUECAT_REVOKE_EVENT_TYPES.has(eventType);
}

function assertSupportedRevenueCatEventType(eventType: string) {
  if (
    REVENUECAT_ACTIVATION_EVENT_TYPES.has(eventType) ||
    REVENUECAT_REVOKE_EVENT_TYPES.has(eventType) ||
    REVENUECAT_PAST_DUE_EVENT_TYPES.has(eventType) ||
    REVENUECAT_CANCELLATION_EVENT_TYPES.has(eventType) ||
    REVENUECAT_SAFE_IRRELEVANT_EVENT_TYPES.has(eventType) ||
    eventType === 'SUBSCRIPTION_PAUSED'
  ) {
    return;
  }

  throw new Error('REVENUECAT_UNSUPPORTED_EVENT_TYPE');
}

function isSafeIrrelevantRevenueCatEvent(eventType: string) {
  return REVENUECAT_SAFE_IRRELEVANT_EVENT_TYPES.has(eventType);
}

type RevenueCatBusinessIdNormalizer = {
  db: {
    normalizeId: (
      tableName: 'businesses',
      id: string
    ) => Id<'businesses'> | null;
  };
};

function normalizeRevenueCatBusinessIdOrThrow(
  ctx: RevenueCatBusinessIdNormalizer,
  businessId: string
): Id<'businesses'> {
  const normalizedId = ctx.db.normalizeId('businesses', businessId);
  if (!normalizedId) {
    throw new Error('REVENUECAT_INVALID_APP_USER_ID');
  }
  return normalizedId;
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
  _plan: BusinessPlan
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
  return 'inactive';
}

function normalizeFeatureKey(featureKey: FeatureKey): CanonicalFeatureKey {
  return FEATURE_ALIAS_MAP[featureKey];
}

function isPaidPlanSubscriptionActive(
  _plan: BusinessPlan,
  status: BusinessSubscriptionStatus,
  endAt: number | null,
  now = Date.now(),
  options?: {
    hasProviderEvidence?: boolean;
    gracePeriodEndAt?: number | null;
    entitlementRevokedAt?: number | null;
  }
): boolean {
  const canonical = resolveCanonicalBillingState({
    plan: _plan,
    status,
    currentPeriodEndAt: endAt,
    gracePeriodEndAt: options?.gracePeriodEndAt ?? null,
    hasProviderEvidence: options?.hasProviderEvidence === true,
    entitlementRevokedAt: options?.entitlementRevokedAt ?? null,
    now,
  });
  return canonical.operationalAccess;
}

function resolveBusinessSubscriptionState(
  business: Doc<'businesses'>,
  _now = Date.now(),
  billingAccount?: any
): BusinessSubscriptionState {
  if (billingAccount) {
    const canonical = resolveCanonicalBillingState({
      plan: billingAccount.plan ?? billingAccount.lastPlan,
      lastPlan: billingAccount.lastPlan,
      status: billingAccount.status,
      billingPeriod: billingAccount.billingPeriod,
      subscriptionStartAt: billingAccount.subscriptionStartAt,
      currentPeriodStartAt: billingAccount.currentPeriodStartAt,
      currentPeriodEndAt: billingAccount.currentPeriodEndAt,
      gracePeriodEndAt: billingAccount.gracePeriodEndAt,
      canceledAt: billingAccount.canceledAt,
      hasProviderEvidence: billingAccount.hasProviderEvidence === true,
      entitlementRevokedAt: billingAccount.entitlementRevokedAt,
      now: _now,
    });
    return {
      plan: canonical.plan ?? 'starter',
      status: canonical.status,
      startAt: canonical.subscriptionStartAt,
      endAt: canonical.currentPeriodEndAt,
      billingPeriod: canonical.billingPeriod,
      isSubscriptionActive: canonical.operationalAccess,
    };
  }

  const plan = normalizeBusinessPlan(business.subscriptionPlan);
  const status = normalizeSubscriptionStatus(business.subscriptionStatus, plan);
  const canonical = resolveCanonicalBillingState({
    plan,
    status,
    billingPeriod: business.billingPeriod,
    subscriptionStartAt: business.subscriptionStartAt,
    currentPeriodEndAt: business.subscriptionEndAt,
    hasProviderEvidence: false,
    now: _now,
  });

  return {
    plan: canonical.plan ?? plan,
    status: canonical.status,
    startAt: business.subscriptionStartAt ?? null,
    endAt: business.subscriptionEndAt ?? null,
    billingPeriod: canonical.billingPeriod,
    isSubscriptionActive: canonical.operationalAccess,
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
    billingAccount?: any;
    hasProviderEvidence?: boolean;
  }
): BusinessEntitlements {
  const state = resolveBusinessSubscriptionState(
    business,
    now,
    options?.billingAccount
  );
  const lastPlan = state.plan;
  const config = planConfig[lastPlan];
  const inactiveFeatures = expandFeatureConfig({
    team: false,
    advancedReports: false,
    marketingHub: false,
    smartAnalytics: false,
    smartRetentionManager: false,
    smartRetentionManagerAiAssist: false,
  });
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
    plan: lastPlan,
    effectivePlan: lastPlan,
    subscriptionStatus: state.status,
    subscriptionStartAt: state.startAt,
    subscriptionEndAt: state.endAt,
    billingPeriod: state.billingPeriod,
    isSubscriptionActive: state.isSubscriptionActive,
    limits: config.limits,
    features: state.isSubscriptionActive
      ? expandFeatureConfig(config.features)
      : inactiveFeatures,
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

export async function loadCanonicalBillingAccountForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  return await getBillingAccountForBusiness(ctx, businessId).catch(() => null);
}

export async function buildCanonicalBusinessEntitlementsFromBusiness(
  ctx: any,
  business: Doc<'businesses'>,
  now = Date.now(),
  options?: {
    activeRetentionActions?: number;
    activeCampaigns?: number;
    activeManagementCampaigns?: number;
    aiExecutionsThisMonth?: number;
  }
): Promise<BusinessEntitlements> {
  const billingAccount = await loadCanonicalBillingAccountForBusiness(
    ctx,
    business._id
  );
  return buildBusinessEntitlementsFromBusiness(business, now, {
    ...options,
    billingAccount,
  });
}

function assertEntitlementFromSnapshot(
  entitlements: BusinessEntitlements,
  requirement: EntitlementRequirement
) {
  const isPaidPlanInactive = entitlements.isSubscriptionActive !== true;

  if (isPaidPlanInactive) {
    throwEntitlementError({
      code: 'SUBSCRIPTION_INACTIVE',
      businessId: String(entitlements.businessId),
      requiredPlan: entitlements.plan,
      planKey: entitlements.plan,
      subscriptionStatus: entitlements.subscriptionStatus,
      featureKey: requirement.featureKey,
      limitKey: requirement.limitKey,
    });
  }

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
    billingAccount,
  ] = await Promise.all([
    getBusinessOrThrow(ctx, businessId),
    countActiveRetentionActionsForBusiness(ctx, businessId),
    countActiveCampaignsForBusiness(ctx, businessId),
    countAiExecutionsForBusinessInMonth(ctx, businessId, monthKey),
    getBillingAccountForBusiness(ctx, businessId).catch(() => null),
  ]);
  return buildBusinessEntitlementsFromBusiness(business, Date.now(), {
    activeRetentionActions,
    activeCampaigns,
    aiExecutionsThisMonth,
    billingAccount,
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
  if (!entitlements.isSubscriptionActive) {
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
  if (requirement.reserveSlot === true && requirement.limitKey) {
    const reserved = await reserveUsageSlot(ctx, {
      businessId,
      limitKey: requirement.limitKey,
      limitValue: entitlements.limits[requirement.limitKey],
      currentObserved: requirement.currentValue,
    });
    if (!reserved.reserved) {
      throwEntitlementError({
        code: 'PLAN_LIMIT_REACHED',
        businessId: String(entitlements.businessId),
        requiredPlan:
          REQUIRED_PLAN_BY_LIMIT_FROM_CURRENT_PLAN[entitlements.plan][
            requirement.limitKey
          ] ?? undefined,
        limitKey: requirement.limitKey,
        limitValue: entitlements.limits[requirement.limitKey],
        currentValue: reserved.current,
        planKey: entitlements.plan,
        subscriptionStatus: entitlements.subscriptionStatus,
      });
    }
  }
  return entitlements;
}

export function throwPlanLimitReached(args: {
  businessId: string;
  plan: BusinessPlan;
  status: BusinessSubscriptionStatus;
  limitKey: LimitKey;
  limitValue: number;
  currentValue: number;
}): never {
  throwEntitlementError({
    code: 'PLAN_LIMIT_REACHED',
    businessId: args.businessId,
    requiredPlan:
      REQUIRED_PLAN_BY_LIMIT_FROM_CURRENT_PLAN[args.plan][args.limitKey] ??
      undefined,
    limitKey: args.limitKey,
    limitValue: args.limitValue,
    currentValue: args.currentValue,
    planKey: args.plan,
    subscriptionStatus: args.status,
  });
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

export function countsTowardReferralCampaignQuota(referralConfig: any) {
  // Customer friend-invite campaigns still occupy a campaign slot.
  // B2B business referrals are a separate domain and never counted here.
  if (!referralConfig) {
    return false;
  }
  if (referralConfig.kind === 'b2b' || referralConfig.channel === 'b2b') {
    return false;
  }
  return referralConfig.isEnabled === true;
}

export async function countReferralCampaignsForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const referralConfig = await ctx.db
    .query('referralConfigs')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .first();

  return countsTowardReferralCampaignQuota(referralConfig) ? 1 : 0;
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

  const referralCampaigns = await countReferralCampaignsForBusiness(
    ctx,
    businessId
  );
  return (
    campaigns.filter(countsTowardCampaignDefinitions).length + referralCampaigns
  );
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
    billingAccount,
  ] = await Promise.all([
    getBusinessOrThrow(ctx, businessId),
    ctx.db
      .query('loyaltyPrograms')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .collect(),
    countActiveCustomersForBusiness(ctx, businessId),
    countActiveRetentionActionsForBusiness(ctx, businessId),
    countActiveCampaignsForBusiness(ctx, businessId),
    countAiExecutionsForBusinessInMonth(ctx, businessId, monthKey),
    getBillingAccountForBusiness(ctx, businessId).catch(() => null),
  ]);

  const entitlements = buildBusinessEntitlementsFromBusiness(
    business,
    Date.now(),
    {
      activeRetentionActions,
      activeCampaigns,
      aiExecutionsThisMonth,
      billingAccount,
    }
  );
  const cardsUsed = programs.filter((program: any) => {
    if (program.status === 'archived' || program.isArchived === true) {
      return false;
    }
    return true;
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
  status: BusinessSubscriptionStatus,
  subscriptionEndAt?: number | null,
  now = Date.now()
) {
  return (
    plan === 'starter' ||
    !isPaidPlanSubscriptionActive(plan, status, subscriptionEndAt ?? null, now)
  );
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
  _ctx: any,
  _args: {
    businessId: Id<'businesses'>;
    plan: BusinessPlan;
    status: BusinessSubscriptionStatus;
    subscriptionEndAt?: number | null;
    now: number;
  }
) {
  // Launch policy: billing must not destroy or suspend team membership records.
  // Team feature/seat gates are entitlement-derived at invite and access time.
  return;
}

async function findRevenueCatSubscriptionRow(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    providerSubscriptionId?: string;
  }
) {
  if (args.providerSubscriptionId) {
    const byProviderSubscriptionId = await ctx.db
      .query('subscriptions')
      .withIndex('by_providerSubscriptionId', (q: any) =>
        q.eq('providerSubscriptionId', args.providerSubscriptionId)
      )
      .first();

    if (byProviderSubscriptionId) {
      return byProviderSubscriptionId;
    }
  }

  const businessSubscriptions = await ctx.db
    .query('subscriptions')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', args.businessId))
    .collect();

  return (
    businessSubscriptions
      .filter((subscription: any) => subscription.provider === 'revenuecat')
      .sort((left: any, right: any) => {
        const updatedDelta = (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
        if (updatedDelta !== 0) {
          return updatedDelta;
        }
        return String(left._id).localeCompare(String(right._id));
      })[0] ?? null
  );
}

async function upsertRevenueCatSubscriptionRow(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    plan: BusinessPlan;
    status: BusinessSubscriptionStatus;
    period: BillingPeriod;
    startAt: number;
    endAt: number | null;
    providerSubscriptionId?: string;
    now: number;
  }
) {
  const existing = await findRevenueCatSubscriptionRow(ctx, {
    businessId: args.businessId,
    providerSubscriptionId: args.providerSubscriptionId,
  });
  const payload = {
    businessId: args.businessId,
    plan: args.plan,
    status: args.status,
    period: args.period,
    startAt: args.startAt,
    endAt: args.endAt,
    provider: 'revenuecat' as const,
    providerSubscriptionId: args.providerSubscriptionId,
    updatedAt: args.now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }

  return await ctx.db.insert('subscriptions', {
    ...payload,
    createdAt: args.now,
  });
}

export const applyRevenueCatWebhookEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    appUserId: v.string(),
    businessId: v.optional(v.string()),
    productId: v.optional(v.string()),
    newProductId: v.optional(v.string()),
    entitlementIds: v.optional(v.array(v.string())),
    plan: v.optional(
      v.union(v.literal('starter'), v.literal('pro'), v.literal('premium'))
    ),
    period: v.optional(v.union(v.literal('monthly'), v.literal('yearly'))),
    purchasedAt: v.optional(v.number()),
    expirationAt: v.optional(v.union(v.number(), v.null())),
    gracePeriodEndAt: v.optional(v.union(v.number(), v.null())),
    providerEventAt: v.optional(v.number()),
    providerSubscriptionId: v.optional(v.string()),
    rawEvent: v.any(),
  },
  handler: async (ctx, args) => {
    assertSupportedRevenueCatEventType(args.eventType);
    const now = Date.now();
    const existingEvent = await ctx.db
      .query('revenueCatWebhookEvents')
      .withIndex('by_eventId', (q: any) => q.eq('eventId', args.eventId))
      .first();
    if (existingEvent) {
      return {
        ok: true,
        duplicate: true,
        eventId: args.eventId,
        businessId: existingEvent.businessId,
      };
    }

    if (isSafeIrrelevantRevenueCatEvent(args.eventType)) {
      await ctx.db.insert('revenueCatWebhookEvents', {
        eventId: args.eventId,
        eventType: args.eventType,
        appUserId: args.appUserId,
        status: 'ignored',
        ignoredReason: 'safe_irrelevant',
        providerEventAt: args.providerEventAt,
        receivedAt: now,
        processedAt: now,
        rawEvent: args.rawEvent,
      });
      return { ok: true, duplicate: false, ignored: true, reason: 'safe_irrelevant' };
    }

    const isRevokeEvent = shouldRevokeAccessForRevenueCatEvent(args.eventType);
    const mapping = resolveRevenueCatPlanMapping({
      productId: args.productId,
      newProductId: args.newProductId,
      entitlementIds: args.entitlementIds,
      requireEntitlement: !isRevokeEvent && args.eventType !== 'EXPIRATION',
    });
    if (args.plan !== undefined && args.plan !== mapping.plan) {
      throw new Error('REVENUECAT_PLAN_IDENTIFIER_CONFLICT');
    }
    if (args.period !== undefined && args.period !== mapping.period) {
      throw new Error('REVENUECAT_PERIOD_IDENTIFIER_CONFLICT');
    }

    const billingAccountByIdentity =
      await getBillingAccountByProviderAppUserId(ctx, args.appUserId);
    let businessId: Id<'businesses'> | null =
      billingAccountByIdentity?.businessId ?? null;
    if (!businessId && args.businessId) {
      businessId = normalizeRevenueCatBusinessIdOrThrow(ctx, args.businessId);
    }
    if (
      !businessId &&
      isLegacyBusinessScopedAppUserId(args.appUserId)
    ) {
      const legacyId = parseLegacyBusinessIdFromAppUserId(args.appUserId);
      if (legacyId) {
        businessId = normalizeRevenueCatBusinessIdOrThrow(ctx, legacyId);
      }
    }
    if (!businessId) {
      throw new Error('REVENUECAT_UNKNOWN_PROVIDER_IDENTITY');
    }

    const business = await ctx.db.get(businessId);
    if (!business) {
      throw new Error('REVENUECAT_UNKNOWN_PROVIDER_IDENTITY');
    }

    const billingAccount = await ensureBusinessBillingAccount(ctx, {
      businessId,
      ownerUserId: business.ownerUserId,
      preferredProviderAppUserId: args.appUserId,
      now,
    });

    const incomingEventAt = args.providerEventAt ?? now;
    const lastEventAt = Number(billingAccount.lastProviderEventAt ?? 0);
    if (lastEventAt > 0 && incomingEventAt < lastEventAt) {
      await ctx.db.insert('revenueCatWebhookEvents', {
        eventId: args.eventId,
        eventType: args.eventType,
        appUserId: args.appUserId,
        businessId,
        productId: args.productId,
        entitlementIds: args.entitlementIds,
        status: 'ignored_stale',
        ignoredReason: 'older_than_last_provider_event',
        providerEventAt: incomingEventAt,
        receivedAt: now,
        processedAt: now,
        rawEvent: args.rawEvent,
      });
      return {
        ok: true,
        duplicate: false,
        ignored: true,
        reason: 'stale_event',
        eventId: args.eventId,
        businessId,
      };
    }

    const providerStatus = normalizeRevenueCatSubscriptionStatus(
      args.eventType
    );
    const shouldRevoke = shouldRevokeAccessForRevenueCatEvent(args.eventType);
    const startAt = args.purchasedAt ?? business.subscriptionStartAt ?? now;
    const endAt =
      args.expirationAt === undefined
        ? (business.subscriptionEndAt ?? null)
        : args.expirationAt;
    const nextPlan = mapping.plan;
    const nextStatus: BusinessSubscriptionStatus = shouldRevoke
      ? 'inactive'
      : providerStatus;
    const nextPeriod = mapping.period;
    const nextEndAt = shouldRevoke ? (endAt ?? now) : endAt;
    const revokedAt =
      shouldRevoke && (args.eventType === 'REFUND' || args.eventType === 'EXPIRATION')
        ? now
        : undefined;
    const gracePeriodEndAt =
      args.eventType === 'BILLING_ISSUE' ? (args.gracePeriodEndAt ?? null) : null;

    await ctx.db.insert('revenueCatWebhookEvents', {
      eventId: args.eventId,
      eventType: args.eventType,
      appUserId: args.appUserId,
      businessId,
      productId: args.productId,
      entitlementIds: args.entitlementIds,
      status: 'processed',
      providerEventAt: incomingEventAt,
      receivedAt: now,
      processedAt: now,
      rawEvent: args.rawEvent,
    });

    await upsertRevenueCatSubscriptionRow(ctx, {
      businessId,
      plan: nextPlan,
      status: nextStatus,
      period: nextPeriod,
      startAt,
      endAt: nextEndAt,
      providerSubscriptionId: args.providerSubscriptionId,
      now,
    });

    await ctx.db.patch(billingAccount._id, {
      plan: nextPlan,
      lastPlan: nextPlan,
      status: nextStatus,
      billingPeriod: nextPeriod,
      provider: 'revenuecat',
      providerProductId: args.newProductId ?? args.productId,
      providerSubscriptionIdentifier: args.providerSubscriptionId,
      subscriptionStartAt: startAt,
      currentPeriodStartAt: startAt,
      currentPeriodEndAt: nextEndAt,
      gracePeriodEndAt,
      canceledAt:
        args.eventType === 'CANCELLATION'
          ? now
          : args.eventType === 'UNCANCELLATION'
            ? null
            : billingAccount.canceledAt,
      entitlementRevokedAt: revokedAt,
      revokeReason: shouldRevoke ? args.eventType.toLowerCase() : undefined,
      lastProviderEventAt: incomingEventAt,
      lastProviderEventId: args.eventId,
      hasProviderEvidence: true,
      updatedAt: now,
    });

    await ctx.db.patch(businessId, {
      subscriptionPlan: nextPlan,
      subscriptionStatus: nextStatus,
      subscriptionStartAt: startAt,
      subscriptionEndAt: nextEndAt,
      billingPeriod: nextPeriod,
      updatedAt: now,
    });

    await enforceTeamAccessForPlanState(ctx, {
      businessId,
      plan: nextPlan,
      status: nextStatus,
      subscriptionEndAt: nextEndAt,
      now,
    });

    await evaluateReferralProgressFromBillingEvent(ctx, {
      businessId,
      eventType: args.eventType,
      eventId: args.eventId,
      providerEventAt: incomingEventAt,
      plan: nextPlan,
      period: nextPeriod,
      expirationAt: nextEndAt,
      isRevoked: shouldRevoke,
      now,
    });

    await markSmartManagerDirty(ctx, {
      businessId,
      domains: ['entitlements', 'team'],
      reasons: ['subscription_state_changed'],
      now,
    });

    return {
      ok: true,
      duplicate: false,
      eventId: args.eventId,
      businessId,
      plan: nextPlan,
      status: nextStatus,
    };
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
  handler: async () => {
    throw new Error('SUBSCRIPTION_CLIENT_SYNC_DISABLED');
  },
});

export const debugEntitlementConstants = internalQuery({
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
