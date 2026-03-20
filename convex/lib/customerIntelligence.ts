import type { Doc, Id } from '../_generated/dataModel';

export const CUSTOMER_STATE_VALUES = [
  'NEW',
  'ACTIVE',
  'NEEDS_NURTURE',
  'NEEDS_WINBACK',
  'CLOSE_TO_REWARD',
] as const;

export type CustomerState = (typeof CUSTOMER_STATE_VALUES)[number];

export const CUSTOMER_VALUE_TIER_VALUES = ['REGULAR', 'LOYAL', 'VIP'] as const;

export type CustomerValueTier = (typeof CUSTOMER_VALUE_TIER_VALUES)[number];

export const CAMPAIGN_OPPORTUNITY_VALUES = [
  'WELCOME',
  'SECOND_VISIT',
  'WINBACK',
  'FINISH_CARD',
  'VIP_RETENTION',
  'BIRTHDAY',
  'JOIN_ANNIVERSARY',
  'GENERAL_PROMO',
  'TIME_BASED_PROMO',
  'PRODUCT_PROMO',
] as const;

export type CampaignOpportunity = (typeof CAMPAIGN_OPPORTUNITY_VALUES)[number];

export type LegacyLifecycleStatus =
  | 'NEW_CUSTOMER'
  | 'ACTIVE'
  | 'AT_RISK'
  | 'NEAR_REWARD'
  | 'VIP';

export function mapCustomerStateToLegacyLifecycleStatus(
  state: CustomerState,
  valueTier: CustomerValueTier
): LegacyLifecycleStatus {
  if (valueTier === 'VIP') {
    return 'VIP';
  }

  switch (state) {
    case 'NEW':
      return 'NEW_CUSTOMER';
    case 'NEEDS_WINBACK':
    case 'NEEDS_NURTURE':
      return 'AT_RISK';
    case 'CLOSE_TO_REWARD':
      return 'NEAR_REWARD';
    case 'ACTIVE':
    default:
      return 'ACTIVE';
  }
}

export function deriveDefaultServiceTypeFromBusiness(
  business: Doc<'businesses'> | null
) {
  const profileServiceType = business?.businessRetentionProfile?.serviceType;
  if (profileServiceType) {
    return profileServiceType;
  }

  const fallbackServiceType = Array.isArray(business?.serviceTypes)
    ? business?.serviceTypes[0]
    : undefined;
  if (
    typeof fallbackServiceType === 'string' &&
    fallbackServiceType.length > 0
  ) {
    return fallbackServiceType;
  }

  return 'other';
}

export function mapOpportunityToCampaignType(
  opportunity: CampaignOpportunity
):
  | 'welcome'
  | 'second_visit'
  | 'winback'
  | 'finish_card'
  | 'vip_retention'
  | 'birthday'
  | 'join_anniversary'
  | 'general_promo'
  | 'time_based_promo'
  | 'product_promo' {
  switch (opportunity) {
    case 'WELCOME':
      return 'welcome';
    case 'SECOND_VISIT':
      return 'second_visit';
    case 'WINBACK':
      return 'winback';
    case 'FINISH_CARD':
      return 'finish_card';
    case 'VIP_RETENTION':
      return 'vip_retention';
    case 'BIRTHDAY':
      return 'birthday';
    case 'JOIN_ANNIVERSARY':
      return 'join_anniversary';
    case 'TIME_BASED_PROMO':
      return 'time_based_promo';
    case 'PRODUCT_PROMO':
      return 'product_promo';
    case 'GENERAL_PROMO':
    default:
      return 'general_promo';
  }
}

export function buildCampaignAudienceHint(args: {
  customerState?: CustomerState;
  customerValueTier?: CustomerValueTier;
  joinedDaysAgo: number;
  visitCount: number;
}) {
  if (args.customerState === 'NEW') {
    return 'new_customers' as const;
  }
  if (args.customerState === 'CLOSE_TO_REWARD') {
    return 'near_reward' as const;
  }
  if (
    args.customerState === 'NEEDS_WINBACK' ||
    args.customerState === 'NEEDS_NURTURE'
  ) {
    return 'at_risk' as const;
  }
  if (args.customerValueTier === 'VIP') {
    return 'vip_customers' as const;
  }
  if (args.visitCount <= 1 || args.joinedDaysAgo <= 30) {
    return 'new_customers' as const;
  }
  return 'general_members' as const;
}

export type RetentionThresholds = {
  newDays: number;
  nurtureDays: number;
  winbackDays: number;
  closeToRewardRatio: number;
  loyalVisitThreshold: number;
  vipVisitThreshold: number;
  loyalRedemptionThreshold: number;
  vipRedemptionThreshold: number;
};

const DEFAULT_RETENTION_THRESHOLDS: RetentionThresholds = {
  newDays: 7,
  nurtureDays: 14,
  winbackDays: 30,
  closeToRewardRatio: 0.8,
  loyalVisitThreshold: 5,
  vipVisitThreshold: 10,
  loyalRedemptionThreshold: 1,
  vipRedemptionThreshold: 3,
};

function normalizePositiveNumber(value: unknown, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(Number(value)));
}

function normalizeRatio(value: unknown, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(0.99, Math.max(0.1, Number(value)));
}

export function getRetentionThresholdsForBusiness(
  business: Doc<'businesses'> | null
): RetentionThresholds {
  const repeatModel = business?.businessRetentionProfile?.repeatModel;
  const rewardModel = business?.businessRetentionProfile?.rewardModel;

  return {
    newDays: DEFAULT_RETENTION_THRESHOLDS.newDays,
    nurtureDays: normalizePositiveNumber(
      repeatModel?.nurtureDays,
      DEFAULT_RETENTION_THRESHOLDS.nurtureDays
    ),
    winbackDays: normalizePositiveNumber(
      repeatModel?.winbackDays,
      DEFAULT_RETENTION_THRESHOLDS.winbackDays
    ),
    closeToRewardRatio: normalizeRatio(
      rewardModel?.closeToRewardRatio,
      DEFAULT_RETENTION_THRESHOLDS.closeToRewardRatio
    ),
    loyalVisitThreshold: normalizePositiveNumber(
      rewardModel?.loyalVisitThreshold,
      DEFAULT_RETENTION_THRESHOLDS.loyalVisitThreshold
    ),
    vipVisitThreshold: normalizePositiveNumber(
      rewardModel?.vipVisitThreshold,
      DEFAULT_RETENTION_THRESHOLDS.vipVisitThreshold
    ),
    loyalRedemptionThreshold: normalizePositiveNumber(
      rewardModel?.loyalRedemptionThreshold,
      DEFAULT_RETENTION_THRESHOLDS.loyalRedemptionThreshold
    ),
    vipRedemptionThreshold: normalizePositiveNumber(
      rewardModel?.vipRedemptionThreshold,
      DEFAULT_RETENTION_THRESHOLDS.vipRedemptionThreshold
    ),
  };
}

export function shouldSuggestBirthdayOpportunity(
  business: Doc<'businesses'> | null
) {
  const policy = business?.businessRetentionProfile?.birthdayPolicy;
  const override =
    business?.businessRetentionProfile?.overrides?.birthdayEnabled;
  if (typeof override === 'boolean') {
    return override;
  }
  if (typeof policy?.enabled === 'boolean') {
    return policy.enabled;
  }
  return true;
}

export function shouldSuggestJoinAnniversaryOpportunity(
  business: Doc<'businesses'> | null
) {
  const policy = business?.businessRetentionProfile?.joinAnniversaryPolicy;
  const override =
    business?.businessRetentionProfile?.overrides?.joinAnniversaryEnabled;
  if (typeof override === 'boolean') {
    return override;
  }
  if (typeof policy?.enabled === 'boolean') {
    return policy.enabled;
  }
  return true;
}

export function shouldSuggestTimeBasedPromoOpportunity(
  business: Doc<'businesses'> | null
) {
  const policy = business?.businessRetentionProfile?.timeBasedPromoPolicy;
  const override =
    business?.businessRetentionProfile?.overrides?.timeBasedPromoEnabled;
  if (typeof override === 'boolean') {
    return override;
  }
  if (typeof policy?.enabled === 'boolean') {
    return policy.enabled;
  }
  return true;
}

export type CustomerIdentifier = {
  customerId: Id<'users'>;
};
