/**
 * Canonical StampAix MVP billing + referral production lock.
 * Frozen for store launch. Do not change prices, limits, or reward rules
 * without an explicit product decision.
 */

export const BILLING_CONTRACT_VERSION = '1.0.0';

export const BILLING_CURRENCY = 'ILS' as const;

export type BusinessPlan = 'starter' | 'pro' | 'premium';
export type BillingPeriod = 'monthly' | 'yearly';
export type BusinessSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'inactive';

export type CanonicalFeatureKey =
  | 'team'
  | 'advancedReports'
  | 'marketingHub'
  | 'smartAnalytics'
  | 'smartRetentionManager'
  | 'smartRetentionManagerAiAssist';

export type LimitKey =
  | 'maxCards'
  | 'maxCustomers'
  | 'maxActiveRetentionActions'
  | 'maxCampaigns'
  | 'maxAiExecutionsPerMonth'
  | 'maxTeamSeats';

export type LogicalSubscriptionProductId =
  | 'starter_monthly'
  | 'starter_yearly'
  | 'pro_monthly'
  | 'pro_yearly'
  | 'premium_monthly'
  | 'premium_yearly';

export type PlanLimits = Record<LimitKey, number>;
export type PlanFeatures = Record<CanonicalFeatureKey, boolean>;

export type PlanDefinition = {
  plan: BusinessPlan;
  displayName: string;
  pricing: {
    monthly: number;
    yearly: number;
    currency: typeof BILLING_CURRENCY;
  };
  limits: PlanLimits;
  features: PlanFeatures;
};

export const PLAN_ORDER: BusinessPlan[] = ['starter', 'pro', 'premium'];

export const PLAN_RANK: Record<BusinessPlan, number> = {
  starter: 0,
  pro: 1,
  premium: 2,
};

export const LAUNCH_PLAN_COUNT = 3;

export const MVP_FEATURE_FLAGS = {
  additionalBusinessCreationEnabled: false,
  generalFreeTrialEnabled: false,
  freeStarterEnabled: false,
  ownerLevelBillingEnabled: false,
  multiBusinessBillingEnabled: false,
  mockPaymentsMayGrantEntitlement: false,
  clientRevenueCatMayGrantEntitlement: false,
  referralRewardMayGrantEntitlement: false,
  referralMayPatchSubscriptionEndAt: false,
  advancedReportsLaunchEnabled: false,
} as const;

export const REVENUECAT_CANONICAL_ENTITLEMENT = 'business_access';
export const REVENUECAT_CANONICAL_OFFERING = 'business_plans';

export const LOGICAL_SUBSCRIPTION_PRODUCTS: readonly LogicalSubscriptionProductId[] =
  [
    'starter_monthly',
    'starter_yearly',
    'pro_monthly',
    'pro_yearly',
    'premium_monthly',
    'premium_yearly',
  ];

export const INTENDED_APP_STORE_PRODUCT_IDS: Record<
  LogicalSubscriptionProductId,
  string
> = {
  starter_monthly: 'com.stampaix.app.starter.monthly',
  starter_yearly: 'com.stampaix.app.starter.yearly',
  pro_monthly: 'com.stampaix.app.pro.monthly',
  pro_yearly: 'com.stampaix.app.pro.yearly',
  premium_monthly: 'com.stampaix.app.premium.monthly',
  premium_yearly: 'com.stampaix.app.premium.yearly',
};

export const INTENDED_PLAY_SUBSCRIPTION_IDS = {
  starter: 'stampaix_starter',
  pro: 'stampaix_pro',
  premium: 'stampaix_premium',
} as const;

export const INTENDED_PLAY_BASE_PLANS = {
  monthly: 'monthly',
  yearly: 'yearly',
} as const;

export const STORE_GRACE_POLICY_DAYS = 16;
export const PLAY_PAUSE_ENABLED_FOR_MVP = false;

export const planConfig: Record<BusinessPlan, PlanDefinition> = {
  starter: {
    plan: 'starter',
    displayName: 'Starter',
    pricing: {
      monthly: 149,
      yearly: 1490,
      currency: BILLING_CURRENCY,
    },
    limits: {
      maxCards: 1,
      maxCustomers: 250,
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
      smartRetentionManager: true,
      smartRetentionManagerAiAssist: false,
    },
  },
  pro: {
    plan: 'pro',
    displayName: 'Pro',
    pricing: {
      monthly: 299,
      yearly: 2990,
      currency: BILLING_CURRENCY,
    },
    limits: {
      maxCards: 5,
      maxCustomers: 3000,
      maxActiveRetentionActions: 5,
      maxCampaigns: 5,
      maxAiExecutionsPerMonth: 100,
      maxTeamSeats: 5,
    },
    features: {
      team: true,
      advancedReports: false,
      marketingHub: true,
      smartAnalytics: true,
      smartRetentionManager: true,
      smartRetentionManagerAiAssist: true,
    },
  },
  premium: {
    plan: 'premium',
    displayName: 'Premium',
    pricing: {
      monthly: 499,
      yearly: 4990,
      currency: BILLING_CURRENCY,
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
      advancedReports: false,
      marketingHub: true,
      smartAnalytics: true,
      smartRetentionManager: true,
      smartRetentionManagerAiAssist: true,
    },
  },
};

export const REQUIRED_PLAN_BY_CANONICAL_FEATURE: Record<
  CanonicalFeatureKey,
  BusinessPlan
> = {
  team: 'pro',
  advancedReports: 'premium',
  marketingHub: 'starter',
  smartAnalytics: 'starter',
  smartRetentionManager: 'starter',
  smartRetentionManagerAiAssist: 'pro',
};

export const CANONICAL_LOYALTY_THEME_COUNT = 10;

export const REFERRAL_CONTRACT = {
  canonicalUrlOrigin: 'https://stampaix.com',
  urlPrefix: '/r/',
  qualificationPaidMonths: 3,
  referrerMonthlyRewardMonths: 1,
  referrerYearlyRewardMonths: 2,
  referrerMonthlyRedemptionMaturityPaidMonths: 6,
  referredAnniversaryPaidMonths: 12,
  referredAnniversaryRewardMonths: 1,
  walletUnredeemedCapMonths: 24,
  firstValidReferralWins: true,
} as const;

export const REFERRAL_RELATIONSHIP_STATES = [
  'created',
  'claimed',
  'subscription_started',
  'qualification_pending',
  'qualified',
  'reward_created',
  'skipped',
  'revoked',
] as const;

export type ReferralRelationshipState =
  (typeof REFERRAL_RELATIONSHIP_STATES)[number];

export const REFERRAL_REWARD_STATES = [
  'pending',
  'earned',
  'scheduled',
  'redeemable',
  'redeeming',
  'redeemed',
  'revoked',
  'failed',
] as const;

export type ReferralRewardState = (typeof REFERRAL_REWARD_STATES)[number];

export const REFERRAL_WALLET_CAP_STATES: readonly ReferralRewardState[] = [
  'earned',
  'scheduled',
  'redeemable',
  'redeeming',
];

export const REFERRAL_ANALYTICS_EVENTS = {
  referral_hub_viewed: 'referral_hub_viewed',
  referral_share_opened: 'referral_share_opened',
  referral_shared: 'referral_shared',
  referral_link_opened: 'referral_link_opened',
  referral_claimed: 'referral_claimed',
  referral_onboarding_started: 'referral_onboarding_started',
  referral_subscription_started: 'referral_subscription_started',
  referral_qualification_completed: 'referral_qualification_completed',
  referral_reward_earned: 'referral_reward_earned',
  referral_reward_redeem_started: 'referral_reward_redeem_started',
  referral_reward_redeemed: 'referral_reward_redeemed',
  referred_business_anniversary_reward_earned:
    'referred_business_anniversary_reward_earned',
} as const;

export const FORBIDDEN_LAUNCH_PRICE_TOKENS = [
  '129',
  '1238',
  '249',
  '2390',
  '₪9.99',
  '₪69.99',
] as const;

export const FORBIDDEN_STARTER_COPY_PATTERNS = [
  'Starter חינם',
  'ללא חיוב',
  '30 ימים ראשונים חינם',
  '30 ימים חינם',
] as const;

export const FORBIDDEN_V2_PLAN_COPY_PATTERNS = [
  'דוחות מתקדמים (בקרוב)',
  'דוחות (בקרוב)',
  'Pro Max',
] as const;

export function isBusinessPlan(value: unknown): value is BusinessPlan {
  return value === 'starter' || value === 'pro' || value === 'premium';
}

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === 'monthly' || value === 'yearly';
}

export function isLogicalSubscriptionProductId(
  value: unknown
): value is LogicalSubscriptionProductId {
  return (
    value === 'starter_monthly' ||
    value === 'starter_yearly' ||
    value === 'pro_monthly' ||
    value === 'pro_yearly' ||
    value === 'premium_monthly' ||
    value === 'premium_yearly'
  );
}

export function getReferrerRewardMonths(period: BillingPeriod): number {
  return period === 'yearly'
    ? REFERRAL_CONTRACT.referrerYearlyRewardMonths
    : REFERRAL_CONTRACT.referrerMonthlyRewardMonths;
}

export function buildCanonicalReferralUrl(code: string): string {
  return `${REFERRAL_CONTRACT.canonicalUrlOrigin}${REFERRAL_CONTRACT.urlPrefix}${code}`;
}

export function assertFrozenPlanContract(
  catalog: Record<BusinessPlan, PlanDefinition> = planConfig
): void {
  if (PLAN_ORDER.length !== LAUNCH_PLAN_COUNT) {
    throw new Error('BILLING_CONTRACT_PLAN_COUNT');
  }
  if (catalog.starter.pricing.monthly !== 149) {
    throw new Error('BILLING_CONTRACT_STARTER_MONTHLY_PRICE');
  }
  if (catalog.starter.pricing.yearly !== 1490) {
    throw new Error('BILLING_CONTRACT_STARTER_YEARLY_PRICE');
  }
  if (catalog.pro.pricing.monthly !== 299) {
    throw new Error('BILLING_CONTRACT_PRO_MONTHLY_PRICE');
  }
  if (catalog.pro.pricing.yearly !== 2990) {
    throw new Error('BILLING_CONTRACT_PRO_YEARLY_PRICE');
  }
  if (catalog.premium.pricing.monthly !== 499) {
    throw new Error('BILLING_CONTRACT_PREMIUM_MONTHLY_PRICE');
  }
  if (catalog.premium.pricing.yearly !== 4990) {
    throw new Error('BILLING_CONTRACT_PREMIUM_YEARLY_PRICE');
  }
  if (catalog.starter.limits.maxCards !== 1) {
    throw new Error('BILLING_CONTRACT_STARTER_CARDS');
  }
  if (catalog.pro.limits.maxCards !== 5) {
    throw new Error('BILLING_CONTRACT_PRO_CARDS');
  }
  if (catalog.premium.limits.maxCards !== 10) {
    throw new Error('BILLING_CONTRACT_PREMIUM_CARDS');
  }
  if (catalog.starter.limits.maxCustomers !== 250) {
    throw new Error('BILLING_CONTRACT_STARTER_CUSTOMERS');
  }
  if (catalog.pro.limits.maxCustomers !== 3000) {
    throw new Error('BILLING_CONTRACT_PRO_CUSTOMERS');
  }
  if (catalog.premium.limits.maxCustomers !== 10000) {
    throw new Error('BILLING_CONTRACT_PREMIUM_CUSTOMERS');
  }
  if (catalog.starter.limits.maxCampaigns !== 1) {
    throw new Error('BILLING_CONTRACT_STARTER_CAMPAIGNS');
  }
  if (catalog.pro.limits.maxCampaigns !== 5) {
    throw new Error('BILLING_CONTRACT_PRO_CAMPAIGNS');
  }
  if (catalog.premium.limits.maxCampaigns !== 10) {
    throw new Error('BILLING_CONTRACT_PREMIUM_CAMPAIGNS');
  }
  if (catalog.starter.limits.maxActiveRetentionActions !== 0) {
    throw new Error('BILLING_CONTRACT_STARTER_RETENTION');
  }
  if (catalog.pro.limits.maxActiveRetentionActions !== 5) {
    throw new Error('BILLING_CONTRACT_PRO_RETENTION');
  }
  if (catalog.premium.limits.maxActiveRetentionActions !== 15) {
    throw new Error('BILLING_CONTRACT_PREMIUM_RETENTION');
  }
  if (catalog.starter.limits.maxAiExecutionsPerMonth !== 0) {
    throw new Error('BILLING_CONTRACT_STARTER_AI');
  }
  if (catalog.pro.limits.maxAiExecutionsPerMonth !== 100) {
    throw new Error('BILLING_CONTRACT_PRO_AI');
  }
  if (catalog.premium.limits.maxAiExecutionsPerMonth !== 300) {
    throw new Error('BILLING_CONTRACT_PREMIUM_AI');
  }
  if (catalog.starter.limits.maxTeamSeats !== 0) {
    throw new Error('BILLING_CONTRACT_STARTER_TEAM');
  }
  if (catalog.pro.limits.maxTeamSeats !== 5) {
    throw new Error('BILLING_CONTRACT_PRO_TEAM');
  }
  if (catalog.premium.limits.maxTeamSeats !== 20) {
    throw new Error('BILLING_CONTRACT_PREMIUM_TEAM');
  }
  if (catalog.starter.pricing.monthly <= 0) {
    throw new Error('BILLING_CONTRACT_STARTER_MUST_BE_PAID');
  }
  for (const plan of PLAN_ORDER) {
    if (catalog[plan].features.advancedReports === true) {
      throw new Error('BILLING_CONTRACT_ADVANCED_REPORTS_LAUNCH');
    }
    if (catalog[plan].pricing.currency !== BILLING_CURRENCY) {
      throw new Error('BILLING_CONTRACT_CURRENCY');
    }
  }
  if (catalog.premium.limits.maxCards > CANONICAL_LOYALTY_THEME_COUNT) {
    throw new Error('BILLING_CONTRACT_PREMIUM_CARDS_EXCEED_THEMES');
  }
  if (LOGICAL_SUBSCRIPTION_PRODUCTS.length !== 6) {
    throw new Error('BILLING_CONTRACT_SIX_PRODUCTS');
  }
  if (REVENUECAT_CANONICAL_ENTITLEMENT !== 'business_access') {
    throw new Error('BILLING_CONTRACT_ENTITLEMENT');
  }
  if (MVP_FEATURE_FLAGS.freeStarterEnabled) {
    throw new Error('BILLING_CONTRACT_FREE_STARTER_FLAG');
  }
  if (MVP_FEATURE_FLAGS.additionalBusinessCreationEnabled) {
    throw new Error('BILLING_CONTRACT_MULTI_BUSINESS_FLAG');
  }
  if (REFERRAL_CONTRACT.referrerMonthlyRewardMonths !== 1) {
    throw new Error('REFERRAL_CONTRACT_MONTHLY_REWARD');
  }
  if (REFERRAL_CONTRACT.referrerYearlyRewardMonths !== 2) {
    throw new Error('REFERRAL_CONTRACT_YEARLY_REWARD');
  }
  if (REFERRAL_CONTRACT.qualificationPaidMonths !== 3) {
    throw new Error('REFERRAL_CONTRACT_QUALIFICATION');
  }
  if (REFERRAL_CONTRACT.referredAnniversaryRewardMonths !== 1) {
    throw new Error('REFERRAL_CONTRACT_ANNIVERSARY_REWARD');
  }
  if (REFERRAL_CONTRACT.referredAnniversaryPaidMonths !== 12) {
    throw new Error('REFERRAL_CONTRACT_ANNIVERSARY_MONTHS');
  }
  if (REFERRAL_CONTRACT.walletUnredeemedCapMonths !== 24) {
    throw new Error('REFERRAL_CONTRACT_WALLET_CAP');
  }
  if (REFERRAL_CONTRACT.referrerMonthlyRedemptionMaturityPaidMonths !== 6) {
    throw new Error('REFERRAL_CONTRACT_REFERRER_MATURITY');
  }
}

assertFrozenPlanContract();
