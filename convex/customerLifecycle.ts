import type { Doc, Id } from './_generated/dataModel';
import {
  buildCampaignAudienceHint,
  type CampaignOpportunity,
  type CustomerState,
  type CustomerValueTier,
  deriveDefaultServiceTypeFromBusiness,
  getRetentionThresholdsForBusiness,
  type LegacyLifecycleStatus,
  mapCustomerStateToLegacyLifecycleStatus,
  shouldSuggestBirthdayOpportunity,
  shouldSuggestJoinAnniversaryOpportunity,
  shouldSuggestTimeBasedPromoOpportunity,
} from './lib/customerIntelligence';

const DAY_MS = 24 * 60 * 60 * 1000;

export type CustomerLifecycleStatus = LegacyLifecycleStatus;

export type RetentionOpportunityKey =
  | 'at_risk'
  | 'near_reward'
  | 'vip'
  | 'new_customers';

export type CustomerLifecycleSnapshot = {
  businessId: Id<'businesses'>;
  customerId: Id<'users'>;
  primaryMembershipId: Id<'memberships'>;
  name: string;
  phone: string | null;
  joinedAt: number;
  joinedDaysAgo: number;
  lastVisitAt: number;
  lastVisitDaysAgo: number;
  visitCount: number;
  rewardsRedeemedCount: number;
  loyaltyProgress: number;
  rewardThreshold: number;
  rewardProgressRatio: number;
  customerState: CustomerState;
  customerValueTier: CustomerValueTier;
  lifecycleStatus: CustomerLifecycleStatus;
  isNewCustomer: boolean;
  isAtRisk: boolean;
  isNearReward: boolean;
  isVip: boolean;
  primaryProgramName: string;
  opportunities: CampaignOpportunity[];
  campaignAudienceHint:
    | 'new_customers'
    | 'near_reward'
    | 'at_risk'
    | 'vip_customers'
    | 'general_members';
};

export type CustomerLifecycleSummary = {
  totalCustomers: number;
  activeCustomers: number;
  needsNurtureCustomers: number;
  needsWinbackCustomers: number;
  closeToRewardCustomers: number;
  loyalCustomers: number;
  vipCustomers: number;
  newCustomers: number;
  secondVisitCustomers: number;
  birthdayEligibleCustomers: number;
  anniversaryEligibleCustomers: number;
  atRiskCustomers: number;
  nearRewardCustomers: number;
};

export type RetentionOpportunityCard = {
  key: RetentionOpportunityKey;
  title: string;
  description: string;
  suggestedAction: string;
  count: number;
};

export type CampaignOpportunityCard = {
  opportunityType: CampaignOpportunity;
  title: string;
  description: string;
  suggestedAction: string;
  count: number;
  source: 'automatic';
  campaignType:
    | 'welcome'
    | 'second_visit'
    | 'winback'
    | 'finish_card'
    | 'vip_retention'
    | 'birthday'
    | 'join_anniversary'
    | 'general_promo'
    | 'time_based_promo'
    | 'product_promo';
};

type MembershipAggregate = {
  membership: Doc<'memberships'>;
  program: Doc<'loyaltyPrograms'>;
  joinedAt: number;
  lastVisitAt: number;
  ratio: number;
};

function getDaysAgo(timestamp: number, now: number) {
  return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
}

function isNearRewardRatio(rewardProgressRatio: number, threshold: number) {
  return (
    Number.isFinite(rewardProgressRatio) &&
    rewardProgressRatio >= threshold &&
    rewardProgressRatio < 1
  );
}

function resolveCustomerState(args: {
  joinedDaysAgo: number;
  lastVisitDaysAgo: number;
  rewardProgressRatio: number;
  newDays: number;
  nurtureDays: number;
  winbackDays: number;
  closeToRewardRatio: number;
}): CustomerState {
  if (args.joinedDaysAgo <= args.newDays) {
    return 'NEW';
  }
  if (args.lastVisitDaysAgo >= args.winbackDays) {
    return 'NEEDS_WINBACK';
  }
  if (args.lastVisitDaysAgo >= args.nurtureDays) {
    return 'NEEDS_NURTURE';
  }
  if (isNearRewardRatio(args.rewardProgressRatio, args.closeToRewardRatio)) {
    return 'CLOSE_TO_REWARD';
  }
  return 'ACTIVE';
}

function resolveCustomerValueTier(args: {
  visitCount: number;
  rewardsRedeemedCount: number;
  loyalVisitThreshold: number;
  vipVisitThreshold: number;
  loyalRedemptionThreshold: number;
  vipRedemptionThreshold: number;
}): CustomerValueTier {
  const isVipByVisits = args.visitCount >= args.vipVisitThreshold;
  const isVipByRedemptions =
    args.rewardsRedeemedCount >= args.vipRedemptionThreshold;
  if (isVipByVisits || isVipByRedemptions) {
    return 'VIP';
  }

  const isLoyalByVisits = args.visitCount >= args.loyalVisitThreshold;
  const isLoyalByRedemptions =
    args.rewardsRedeemedCount >= args.loyalRedemptionThreshold;
  if (isLoyalByVisits || isLoyalByRedemptions) {
    return 'LOYAL';
  }

  return 'REGULAR';
}

function getUniqueOpportunities(opportunities: CampaignOpportunity[]) {
  return [...new Set(opportunities)];
}

function mapOpportunityToCampaignType(opportunity: CampaignOpportunity) {
  switch (opportunity) {
    case 'WELCOME':
      return 'welcome' as const;
    case 'SECOND_VISIT':
      return 'second_visit' as const;
    case 'WINBACK':
      return 'winback' as const;
    case 'FINISH_CARD':
      return 'finish_card' as const;
    case 'VIP_RETENTION':
      return 'vip_retention' as const;
    case 'BIRTHDAY':
      return 'birthday' as const;
    case 'JOIN_ANNIVERSARY':
      return 'join_anniversary' as const;
    case 'TIME_BASED_PROMO':
      return 'time_based_promo' as const;
    case 'PRODUCT_PROMO':
      return 'product_promo' as const;
    case 'GENERAL_PROMO':
    default:
      return 'general_promo' as const;
  }
}

function buildCampaignOpportunityCards(
  summary: CustomerLifecycleSummary,
  args: {
    birthdayRelevant: boolean;
    joinAnniversaryRelevant: boolean;
    timeBasedRelevant: boolean;
    productPromoRelevant: boolean;
  }
): CampaignOpportunityCard[] {
  const base: CampaignOpportunityCard[] = [
    {
      opportunityType: 'WELCOME',
      title: 'Welcome Campaign',
      description:
        'Customers who joined recently and should receive onboarding communication.',
      suggestedAction: 'Create a welcome campaign draft.',
      count: summary.newCustomers,
      source: 'automatic',
      campaignType: 'welcome',
    },
    {
      opportunityType: 'SECOND_VISIT',
      title: 'Second Visit Follow-up',
      description:
        'Customers with a single recorded visit who should be nudged to return.',
      suggestedAction: 'Activate a second-visit nudge.',
      count: summary.secondVisitCustomers,
      source: 'automatic',
      campaignType: 'second_visit',
    },
    {
      opportunityType: 'WINBACK',
      title: 'Winback',
      description: 'Customers with long inactivity windows.',
      suggestedAction: 'Prepare a winback campaign and activate when ready.',
      count: summary.needsWinbackCustomers,
      source: 'automatic',
      campaignType: 'winback',
    },
    {
      opportunityType: 'FINISH_CARD',
      title: 'Finish Card',
      description: 'Customers close to loyalty reward completion.',
      suggestedAction: 'Send a finish-card reminder.',
      count: summary.closeToRewardCustomers,
      source: 'automatic',
      campaignType: 'finish_card',
    },
    {
      opportunityType: 'VIP_RETENTION',
      title: 'VIP Retention',
      description:
        'Top-value customers that should receive appreciation and retention messaging.',
      suggestedAction: 'Create a VIP retention message.',
      count: summary.vipCustomers,
      source: 'automatic',
      campaignType: 'vip_retention',
    },
    {
      opportunityType: 'GENERAL_PROMO',
      title: 'General Promo',
      description: 'General promotional communication for active members.',
      suggestedAction: 'Create a one-time promotional campaign.',
      count: summary.activeCustomers,
      source: 'automatic',
      campaignType: 'general_promo',
    },
  ];

  if (args.birthdayRelevant) {
    base.push({
      opportunityType: 'BIRTHDAY',
      title: 'Birthday',
      description: 'Customers with birthday data available.',
      suggestedAction: 'Prepare a birthday campaign.',
      count: summary.birthdayEligibleCustomers,
      source: 'automatic',
      campaignType: 'birthday',
    });
  }

  if (args.joinAnniversaryRelevant) {
    base.push({
      opportunityType: 'JOIN_ANNIVERSARY',
      title: 'Join Anniversary',
      description: 'Customers with join-anniversary profile data available.',
      suggestedAction: 'Prepare a join-anniversary campaign.',
      count: summary.anniversaryEligibleCustomers,
      source: 'automatic',
      campaignType: 'join_anniversary',
    });
  }

  if (args.timeBasedRelevant) {
    base.push({
      opportunityType: 'TIME_BASED_PROMO',
      title: 'Weak Hours / Days Promo',
      description:
        'Time-based promotional opportunity for weak traffic windows.',
      suggestedAction: 'Create a time-based promotion.',
      count: summary.needsNurtureCustomers,
      source: 'automatic',
      campaignType: 'time_based_promo',
    });
  }

  if (args.productPromoRelevant) {
    base.push({
      opportunityType: 'PRODUCT_PROMO',
      title: 'Product / Service Promotion',
      description:
        'Promote products or services by business context tags. v1 is context-level and not SKU-level targeting.',
      suggestedAction: 'Create a product/service promotion campaign.',
      count: summary.activeCustomers,
      source: 'automatic',
      campaignType: 'product_promo',
    });
  }

  return base;
}

function buildLegacyOpportunityCards(
  summary: CustomerLifecycleSummary
): RetentionOpportunityCard[] {
  return [
    {
      key: 'at_risk',
      title: 'At Risk Customers',
      description:
        'Customers with nurture/winback signals that require follow-up.',
      suggestedAction: 'Prepare a winback message.',
      count: summary.atRiskCustomers,
    },
    {
      key: 'near_reward',
      title: 'Close To Reward',
      description: 'Customers who can complete a reward with one more visit.',
      suggestedAction: 'Send a reward reminder.',
      count: summary.nearRewardCustomers,
    },
    {
      key: 'vip',
      title: 'VIP Customers',
      description: 'High-value customers that need retention touchpoints.',
      suggestedAction: 'Send a thank-you message.',
      count: summary.vipCustomers,
    },
    {
      key: 'new_customers',
      title: 'New Customers',
      description:
        'Recent joiners who should receive onboarding communication.',
      suggestedAction: 'Activate a welcome flow.',
      count: summary.newCustomers,
    },
  ];
}

export function buildCustomerLifecycleInsights(
  summary: CustomerLifecycleSummary
) {
  const insights: string[] = [];

  if (summary.totalCustomers === 0) {
    return [
      'No active customers yet. Start with customer enrollment and first loyalty visits.',
    ];
  }

  if (summary.needsWinbackCustomers > 0) {
    insights.push(
      `${summary.needsWinbackCustomers} customers are in winback state.`
    );
  }
  if (summary.closeToRewardCustomers > 0) {
    insights.push(
      `${summary.closeToRewardCustomers} customers are close to reward completion.`
    );
  }
  if (summary.vipCustomers > 0) {
    insights.push(`${summary.vipCustomers} customers are in VIP value tier.`);
  }
  if (summary.newCustomers > 0) {
    insights.push(`${summary.newCustomers} customers are newly joined.`);
  }

  if (insights.length === 0) {
    insights.push('Customer base is stable. Keep campaign cadence consistent.');
  }

  return insights.slice(0, 3);
}

function buildCustomerOpportunities(args: {
  customerState: CustomerState;
  customerValueTier: CustomerValueTier;
  visitCount: number;
  hasBirthday: boolean;
  hasAnniversary: boolean;
  birthdayRelevant: boolean;
  joinAnniversaryRelevant: boolean;
  timeBasedRelevant: boolean;
  productPromoRelevant: boolean;
}) {
  const opportunities: CampaignOpportunity[] = ['GENERAL_PROMO'];

  if (args.customerState === 'NEW') {
    opportunities.push('WELCOME');
    if (args.visitCount <= 1) {
      opportunities.push('SECOND_VISIT');
    }
  }

  if (
    args.customerState === 'NEEDS_WINBACK' ||
    args.customerState === 'NEEDS_NURTURE'
  ) {
    opportunities.push('WINBACK');
  }

  if (args.customerState === 'CLOSE_TO_REWARD') {
    opportunities.push('FINISH_CARD');
  }

  if (args.customerValueTier === 'VIP') {
    opportunities.push('VIP_RETENTION');
  }

  if (args.birthdayRelevant && args.hasBirthday) {
    opportunities.push('BIRTHDAY');
  }
  if (args.joinAnniversaryRelevant && args.hasAnniversary) {
    opportunities.push('JOIN_ANNIVERSARY');
  }
  if (args.timeBasedRelevant) {
    opportunities.push('TIME_BASED_PROMO');
  }
  if (args.productPromoRelevant) {
    opportunities.push('PRODUCT_PROMO');
  }

  return getUniqueOpportunities(opportunities);
}

export async function buildCustomerLifecycleSnapshotForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const now = Date.now();
  const business = (await ctx.db.get(businessId)) as Doc<'businesses'> | null;
  const thresholds = getRetentionThresholdsForBusiness(business);

  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .collect();

  if (memberships.length === 0) {
    const summary: CustomerLifecycleSummary = {
      totalCustomers: 0,
      activeCustomers: 0,
      needsNurtureCustomers: 0,
      needsWinbackCustomers: 0,
      closeToRewardCustomers: 0,
      loyalCustomers: 0,
      vipCustomers: 0,
      newCustomers: 0,
      secondVisitCustomers: 0,
      birthdayEligibleCustomers: 0,
      anniversaryEligibleCustomers: 0,
      atRiskCustomers: 0,
      nearRewardCustomers: 0,
    };

    return {
      customers: [] as CustomerLifecycleSnapshot[],
      summary,
      opportunityCards: buildLegacyOpportunityCards(summary),
      campaignOpportunityCards: buildCampaignOpportunityCards(summary, {
        birthdayRelevant: shouldSuggestBirthdayOpportunity(business),
        joinAnniversaryRelevant:
          shouldSuggestJoinAnniversaryOpportunity(business),
        timeBasedRelevant: shouldSuggestTimeBasedPromoOpportunity(business),
        productPromoRelevant:
          business?.businessRetentionProfile?.businessModel !== 'service',
      }),
      insights: buildCustomerLifecycleInsights(summary),
    };
  }

  const uniqueProgramIds = [
    ...new Set(
      memberships.map((row: Doc<'memberships'>) => String(row.programId))
    ),
  ];
  const uniqueCustomerIds = [
    ...new Set(
      memberships.map((row: Doc<'memberships'>) => String(row.userId))
    ),
  ];
  const [programs, users, events] = await Promise.all([
    Promise.all(
      uniqueProgramIds.map((programId) =>
        ctx.db.get(programId as Id<'loyaltyPrograms'>)
      )
    ),
    Promise.all(
      uniqueCustomerIds.map((customerId) =>
        ctx.db.get(customerId as Id<'users'>)
      )
    ),
    ctx.db
      .query('events')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .collect(),
  ]);

  const programById = new Map<string, Doc<'loyaltyPrograms'>>();
  for (const program of programs) {
    if (program && program.isActive === true) {
      programById.set(String(program._id), program);
    }
  }

  const userById = new Map<string, Doc<'users'>>();
  for (const user of users) {
    if (user && user.isActive === true) {
      userById.set(String(user._id), user);
    }
  }

  const visitCountByCustomer = new Map<string, number>();
  const rewardsRedeemedByCustomer = new Map<string, number>();
  const lastVisitByCustomer = new Map<string, number>();
  for (const event of events) {
    if (event.type !== 'STAMP_ADDED' && event.type !== 'REWARD_REDEEMED') {
      continue;
    }
    const key = String(event.customerUserId);
    const currentLastVisit = lastVisitByCustomer.get(key) ?? 0;
    if (event.createdAt > currentLastVisit) {
      lastVisitByCustomer.set(key, event.createdAt);
    }
    if (event.type === 'STAMP_ADDED') {
      visitCountByCustomer.set(key, (visitCountByCustomer.get(key) ?? 0) + 1);
    }
    if (event.type === 'REWARD_REDEEMED') {
      rewardsRedeemedByCustomer.set(
        key,
        (rewardsRedeemedByCustomer.get(key) ?? 0) + 1
      );
    }
  }

  const membershipByCustomer = new Map<string, MembershipAggregate[]>();
  for (const membership of memberships) {
    const program = programById.get(String(membership.programId));
    const user = userById.get(String(membership.userId));
    if (!program || !user) {
      continue;
    }

    const lastVisitAt =
      lastVisitByCustomer.get(String(user._id)) ??
      membership.lastStampAt ??
      membership.updatedAt ??
      membership.createdAt;
    const ratio =
      program.maxStamps > 0 ? membership.currentStamps / program.maxStamps : 0;
    const entries = membershipByCustomer.get(String(user._id)) ?? [];
    entries.push({
      membership,
      program,
      joinedAt: membership.createdAt,
      lastVisitAt,
      ratio,
    });
    membershipByCustomer.set(String(user._id), entries);
  }

  const customers: CustomerLifecycleSnapshot[] = [];
  const summary: CustomerLifecycleSummary = {
    totalCustomers: 0,
    activeCustomers: 0,
    needsNurtureCustomers: 0,
    needsWinbackCustomers: 0,
    closeToRewardCustomers: 0,
    loyalCustomers: 0,
    vipCustomers: 0,
    newCustomers: 0,
    secondVisitCustomers: 0,
    birthdayEligibleCustomers: 0,
    anniversaryEligibleCustomers: 0,
    atRiskCustomers: 0,
    nearRewardCustomers: 0,
  };

  const birthdayRelevant = shouldSuggestBirthdayOpportunity(business);
  const joinAnniversaryRelevant =
    shouldSuggestJoinAnniversaryOpportunity(business);
  const timeBasedRelevant = shouldSuggestTimeBasedPromoOpportunity(business);
  const serviceType = deriveDefaultServiceTypeFromBusiness(business);
  const productPromoRelevant =
    business?.businessRetentionProfile?.businessModel !== 'service' ||
    serviceType === 'retail' ||
    serviceType === 'food_drink';

  for (const [customerKey, aggregates] of membershipByCustomer.entries()) {
    const customer = userById.get(customerKey);
    if (!customer || aggregates.length === 0) {
      continue;
    }

    const sortedAggregates = [...aggregates].sort((left, right) => {
      if (right.ratio !== left.ratio) {
        return right.ratio - left.ratio;
      }
      return right.lastVisitAt - left.lastVisitAt;
    });
    const primary = sortedAggregates[0];
    const joinedAt = Math.min(...aggregates.map((entry) => entry.joinedAt));
    const lastVisitAt = Math.max(
      ...aggregates.map((entry) => entry.lastVisitAt)
    );
    const joinedDaysAgo = getDaysAgo(joinedAt, now);
    const lastVisitDaysAgo = getDaysAgo(lastVisitAt, now);
    const visitCount = visitCountByCustomer.get(customerKey) ?? 0;
    const rewardsRedeemedCount =
      rewardsRedeemedByCustomer.get(customerKey) ?? 0;
    const loyaltyProgress = primary.membership.currentStamps;
    const rewardThreshold = primary.program.maxStamps;
    const rewardProgressRatio =
      rewardThreshold > 0 ? loyaltyProgress / rewardThreshold : 0;

    const customerState = resolveCustomerState({
      joinedDaysAgo,
      lastVisitDaysAgo,
      rewardProgressRatio,
      newDays: thresholds.newDays,
      nurtureDays: thresholds.nurtureDays,
      winbackDays: thresholds.winbackDays,
      closeToRewardRatio: thresholds.closeToRewardRatio,
    });
    const customerValueTier = resolveCustomerValueTier({
      visitCount,
      rewardsRedeemedCount,
      loyalVisitThreshold: thresholds.loyalVisitThreshold,
      vipVisitThreshold: thresholds.vipVisitThreshold,
      loyalRedemptionThreshold: thresholds.loyalRedemptionThreshold,
      vipRedemptionThreshold: thresholds.vipRedemptionThreshold,
    });
    const lifecycleStatus = mapCustomerStateToLegacyLifecycleStatus(
      customerState,
      customerValueTier
    );

    const hasBirthday =
      Number.isFinite(customer.birthdayMonth) &&
      Number.isFinite(customer.birthdayDay);
    const hasAnniversary =
      Number.isFinite(customer.anniversaryMonth) &&
      Number.isFinite(customer.anniversaryDay);

    const opportunities = buildCustomerOpportunities({
      customerState,
      customerValueTier,
      visitCount,
      hasBirthday,
      hasAnniversary,
      birthdayRelevant,
      joinAnniversaryRelevant,
      timeBasedRelevant,
      productPromoRelevant,
    });

    const snapshot: CustomerLifecycleSnapshot = {
      businessId,
      customerId: customer._id,
      primaryMembershipId: primary.membership._id,
      name:
        customer.fullName ??
        customer.email ??
        customer.externalId ??
        'Customer',
      phone: customer.phone ?? null,
      joinedAt,
      joinedDaysAgo,
      lastVisitAt,
      lastVisitDaysAgo,
      visitCount,
      rewardsRedeemedCount,
      loyaltyProgress,
      rewardThreshold,
      rewardProgressRatio,
      customerState,
      customerValueTier,
      lifecycleStatus,
      isNewCustomer: customerState === 'NEW',
      isAtRisk:
        customerState === 'NEEDS_NURTURE' || customerState === 'NEEDS_WINBACK',
      isNearReward: customerState === 'CLOSE_TO_REWARD',
      isVip: customerValueTier === 'VIP',
      primaryProgramName: primary.program.title,
      opportunities,
      campaignAudienceHint: buildCampaignAudienceHint({
        customerState,
        customerValueTier,
        joinedDaysAgo,
        visitCount,
      }),
    };

    customers.push(snapshot);
    summary.totalCustomers += 1;

    if (snapshot.customerState === 'ACTIVE') {
      summary.activeCustomers += 1;
    }
    if (snapshot.customerState === 'NEEDS_NURTURE') {
      summary.needsNurtureCustomers += 1;
    }
    if (snapshot.customerState === 'NEEDS_WINBACK') {
      summary.needsWinbackCustomers += 1;
    }
    if (snapshot.customerState === 'CLOSE_TO_REWARD') {
      summary.closeToRewardCustomers += 1;
      summary.nearRewardCustomers += 1;
    }
    if (snapshot.customerValueTier === 'LOYAL') {
      summary.loyalCustomers += 1;
    }
    if (snapshot.customerValueTier === 'VIP') {
      summary.loyalCustomers += 1;
      summary.vipCustomers += 1;
    }
    if (snapshot.customerState === 'NEW') {
      summary.newCustomers += 1;
    }
    if (snapshot.visitCount <= 1) {
      summary.secondVisitCustomers += 1;
    }
    if (hasBirthday) {
      summary.birthdayEligibleCustomers += 1;
    }
    if (hasAnniversary) {
      summary.anniversaryEligibleCustomers += 1;
    }
    if (
      snapshot.customerState === 'NEEDS_NURTURE' ||
      snapshot.customerState === 'NEEDS_WINBACK'
    ) {
      summary.atRiskCustomers += 1;
    }
  }

  customers.sort((left, right) => {
    const score = (customer: CustomerLifecycleSnapshot) => {
      if (customer.customerState === 'NEEDS_WINBACK') return 0;
      if (customer.customerState === 'NEEDS_NURTURE') return 1;
      if (customer.customerState === 'CLOSE_TO_REWARD') return 2;
      if (customer.customerValueTier === 'VIP') return 3;
      if (customer.customerState === 'NEW') return 4;
      return 5;
    };
    const leftPriority = score(left);
    const rightPriority = score(right);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return right.lastVisitAt - left.lastVisitAt;
  });

  return {
    customers,
    summary,
    opportunityCards: buildLegacyOpportunityCards(summary),
    campaignOpportunityCards: buildCampaignOpportunityCards(summary, {
      birthdayRelevant,
      joinAnniversaryRelevant,
      timeBasedRelevant,
      productPromoRelevant,
    }),
    insights: buildCustomerLifecycleInsights(summary),
  };
}

export function getCustomerStateAndTier(args: {
  joinedDaysAgo: number;
  lastVisitDaysAgo: number;
  rewardProgressRatio: number;
  visitCount: number;
  rewardsRedeemedCount?: number;
  thresholds?: {
    newDays?: number;
    nurtureDays?: number;
    winbackDays?: number;
    closeToRewardRatio?: number;
    loyalVisitThreshold?: number;
    vipVisitThreshold?: number;
    loyalRedemptionThreshold?: number;
    vipRedemptionThreshold?: number;
  };
}) {
  const resolvedThresholds = {
    newDays: Math.max(1, Math.floor(args.thresholds?.newDays ?? 7)),
    nurtureDays: Math.max(1, Math.floor(args.thresholds?.nurtureDays ?? 14)),
    winbackDays: Math.max(1, Math.floor(args.thresholds?.winbackDays ?? 30)),
    closeToRewardRatio: Math.min(
      0.99,
      Math.max(0.1, Number(args.thresholds?.closeToRewardRatio ?? 0.8))
    ),
    loyalVisitThreshold: Math.max(
      1,
      Math.floor(args.thresholds?.loyalVisitThreshold ?? 5)
    ),
    vipVisitThreshold: Math.max(
      1,
      Math.floor(args.thresholds?.vipVisitThreshold ?? 10)
    ),
    loyalRedemptionThreshold: Math.max(
      1,
      Math.floor(args.thresholds?.loyalRedemptionThreshold ?? 1)
    ),
    vipRedemptionThreshold: Math.max(
      1,
      Math.floor(args.thresholds?.vipRedemptionThreshold ?? 3)
    ),
  };

  const customerState = resolveCustomerState({
    joinedDaysAgo: args.joinedDaysAgo,
    lastVisitDaysAgo: args.lastVisitDaysAgo,
    rewardProgressRatio: args.rewardProgressRatio,
    newDays: resolvedThresholds.newDays,
    nurtureDays: resolvedThresholds.nurtureDays,
    winbackDays: resolvedThresholds.winbackDays,
    closeToRewardRatio: resolvedThresholds.closeToRewardRatio,
  });
  const customerValueTier = resolveCustomerValueTier({
    visitCount: args.visitCount,
    rewardsRedeemedCount: args.rewardsRedeemedCount ?? 0,
    loyalVisitThreshold: resolvedThresholds.loyalVisitThreshold,
    vipVisitThreshold: resolvedThresholds.vipVisitThreshold,
    loyalRedemptionThreshold: resolvedThresholds.loyalRedemptionThreshold,
    vipRedemptionThreshold: resolvedThresholds.vipRedemptionThreshold,
  });

  return {
    customerState,
    customerValueTier,
    lifecycleStatus: mapCustomerStateToLegacyLifecycleStatus(
      customerState,
      customerValueTier
    ),
  };
}

export function getCustomerLifecycleStatus(
  customer: Pick<
    CustomerLifecycleSnapshot,
    | 'joinedDaysAgo'
    | 'lastVisitDaysAgo'
    | 'rewardProgressRatio'
    | 'visitCount'
    | 'rewardsRedeemedCount'
  >
) {
  return getCustomerStateAndTier(customer).lifecycleStatus;
}

export function getCustomersForOpportunity(
  customers: CustomerLifecycleSnapshot[],
  opportunity: RetentionOpportunityKey
) {
  switch (opportunity) {
    case 'at_risk':
      return customers.filter(
        (customer) =>
          customer.customerState === 'NEEDS_NURTURE' ||
          customer.customerState === 'NEEDS_WINBACK'
      );
    case 'near_reward':
      return customers.filter(
        (customer) => customer.customerState === 'CLOSE_TO_REWARD'
      );
    case 'vip':
      return customers.filter(
        (customer) => customer.customerValueTier === 'VIP'
      );
    case 'new_customers':
      return customers.filter((customer) => customer.customerState === 'NEW');
    default:
      return [];
  }
}

export function getCustomersForCampaignOpportunity(
  customers: CustomerLifecycleSnapshot[],
  opportunity: CampaignOpportunity
) {
  return customers.filter((customer) =>
    customer.opportunities.includes(opportunity)
  );
}
