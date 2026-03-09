import type { Doc, Id } from './_generated/dataModel';

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_CUSTOMER_DAYS = 7;
const AT_RISK_DAYS = 30;
const VIP_VISIT_COUNT = 10;
const NEAR_REWARD_RATIO = 0.8;

export type CustomerLifecycleStatus =
  | 'NEW_CUSTOMER'
  | 'ACTIVE'
  | 'AT_RISK'
  | 'NEAR_REWARD'
  | 'VIP';

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
  loyaltyProgress: number;
  rewardThreshold: number;
  rewardProgressRatio: number;
  lifecycleStatus: CustomerLifecycleStatus;
  isNewCustomer: boolean;
  isAtRisk: boolean;
  isNearReward: boolean;
  isVip: boolean;
  primaryProgramName: string;
};

export type CustomerLifecycleSummary = {
  totalCustomers: number;
  activeCustomers: number;
  atRiskCustomers: number;
  nearRewardCustomers: number;
  vipCustomers: number;
  newCustomers: number;
};

export type RetentionOpportunityCard = {
  key: RetentionOpportunityKey;
  title: string;
  description: string;
  suggestedAction: string;
  count: number;
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

function resolveLifecycleStatus(args: {
  joinedDaysAgo: number;
  lastVisitDaysAgo: number;
  rewardProgressRatio: number;
  visitCount: number;
}): CustomerLifecycleStatus {
  if (args.joinedDaysAgo <= NEW_CUSTOMER_DAYS) {
    return 'NEW_CUSTOMER';
  }
  if (args.lastVisitDaysAgo >= AT_RISK_DAYS) {
    return 'AT_RISK';
  }
  if (args.rewardProgressRatio >= NEAR_REWARD_RATIO) {
    return 'NEAR_REWARD';
  }
  if (args.visitCount >= VIP_VISIT_COUNT) {
    return 'VIP';
  }
  return 'ACTIVE';
}

function buildOpportunityCards(
  summary: CustomerLifecycleSummary
): RetentionOpportunityCard[] {
  return [
    {
      key: 'at_risk',
      title: 'לקוחות בסיכון',
      description: 'לקוחות שלא חזרו כבר תקופה וצריכים תזכורת קצרה.',
      suggestedAction: 'שלחו פוש חזרה',
      count: summary.atRiskCustomers,
    },
    {
      key: 'near_reward',
      title: 'קרובים להטבה',
      description: 'לקוחות שנמצאים ממש לפני תגמול ומועדים לחזרה מהירה.',
      suggestedAction: 'שלחו הודעת תזכורת על ההטבה',
      count: summary.nearRewardCustomers,
    },
    {
      key: 'vip',
      title: 'לקוחות VIP',
      description: 'הלקוחות הפעילים ביותר שכדאי לשמר עם יחס אישי.',
      suggestedAction: 'שלחו הודעת תודה',
      count: summary.vipCustomers,
    },
    {
      key: 'new_customers',
      title: 'לקוחות חדשים',
      description: 'לקוחות שהצטרפו לאחרונה וחשוב לחזק אצלם את ההרגל.',
      suggestedAction: 'שלחו פוש קבלת פנים',
      count: summary.newCustomers,
    },
  ];
}

export function buildCustomerLifecycleInsights(
  summary: CustomerLifecycleSummary
) {
  const insights: string[] = [];

  if (summary.totalCustomers === 0) {
    return ['עדיין אין לקוחות פעילים. התחילו לסרוק ולהצטרף לכרטיס הראשון.'];
  }

  if (summary.atRiskCustomers > 0) {
    insights.push(
      `${summary.atRiskCustomers} לקוחות בסיכון. זה הזמן לשלוח תזכורת קצרה לחזרה.`
    );
  }
  if (summary.nearRewardCustomers > 0) {
    insights.push(
      `${summary.nearRewardCustomers} לקוחות קרובים להטבה. כדאי להזכיר להם להשלים ביקור.`
    );
  }
  if (summary.vipCustomers > 0) {
    insights.push(
      `${summary.vipCustomers} לקוחות VIP פעילים. שמרו אותם עם מסר אישי או הטבה.`
    );
  }
  if (summary.newCustomers > 0) {
    insights.push(
      `${summary.newCustomers} לקוחות חדשים השבוע. פוש קבלת פנים יכול לחזק ביקור שני.`
    );
  }

  if (insights.length === 0) {
    insights.push(
      'בסיס הלקוחות יציב. המשיכו לעודד ביקורים חוזרים דרך כרטיסי הנאמנות.'
    );
  }

  return insights.slice(0, 3);
}

export async function buildCustomerLifecycleSnapshotForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const now = Date.now();
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .collect();

  if (memberships.length === 0) {
    const summary: CustomerLifecycleSummary = {
      totalCustomers: 0,
      activeCustomers: 0,
      atRiskCustomers: 0,
      nearRewardCustomers: 0,
      vipCustomers: 0,
      newCustomers: 0,
    };

    return {
      customers: [] as CustomerLifecycleSnapshot[],
      summary,
      opportunityCards: buildOpportunityCards(summary),
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
  const lastVisitByCustomer = new Map<string, number>();
  for (const event of events) {
    if (event.type !== 'STAMP_ADDED') {
      continue;
    }
    const key = String(event.customerUserId);
    visitCountByCustomer.set(key, (visitCountByCustomer.get(key) ?? 0) + 1);
    const currentLastVisit = lastVisitByCustomer.get(key) ?? 0;
    if (event.createdAt > currentLastVisit) {
      lastVisitByCustomer.set(key, event.createdAt);
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
    atRiskCustomers: 0,
    nearRewardCustomers: 0,
    vipCustomers: 0,
    newCustomers: 0,
  };

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
    const loyaltyProgress = primary.membership.currentStamps;
    const rewardThreshold = primary.program.maxStamps;
    const rewardProgressRatio =
      rewardThreshold > 0 ? loyaltyProgress / rewardThreshold : 0;
    const lifecycleStatus = resolveLifecycleStatus({
      joinedDaysAgo,
      lastVisitDaysAgo,
      rewardProgressRatio,
      visitCount,
    });

    const snapshot: CustomerLifecycleSnapshot = {
      businessId,
      customerId: customer._id,
      primaryMembershipId: primary.membership._id,
      name:
        customer.fullName ?? customer.email ?? customer.externalId ?? 'לקוח',
      phone: customer.phone ?? null,
      joinedAt,
      joinedDaysAgo,
      lastVisitAt,
      lastVisitDaysAgo,
      visitCount,
      loyaltyProgress,
      rewardThreshold,
      rewardProgressRatio,
      lifecycleStatus,
      isNewCustomer: joinedDaysAgo <= NEW_CUSTOMER_DAYS,
      isAtRisk: lastVisitDaysAgo >= AT_RISK_DAYS,
      isNearReward: rewardProgressRatio >= NEAR_REWARD_RATIO,
      isVip: visitCount >= VIP_VISIT_COUNT,
      primaryProgramName: primary.program.title,
    };

    customers.push(snapshot);
    summary.totalCustomers += 1;

    if (snapshot.lifecycleStatus === 'ACTIVE') {
      summary.activeCustomers += 1;
    }
    if (snapshot.isAtRisk) {
      summary.atRiskCustomers += 1;
    }
    if (snapshot.isNearReward) {
      summary.nearRewardCustomers += 1;
    }
    if (snapshot.isVip) {
      summary.vipCustomers += 1;
    }
    if (snapshot.isNewCustomer) {
      summary.newCustomers += 1;
    }
  }

  customers.sort((left, right) => {
    const leftPriority = left.isAtRisk
      ? 0
      : left.isNearReward
        ? 1
        : left.isVip
          ? 2
          : left.isNewCustomer
            ? 3
            : 4;
    const rightPriority = right.isAtRisk
      ? 0
      : right.isNearReward
        ? 1
        : right.isVip
          ? 2
          : right.isNewCustomer
            ? 3
            : 4;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return right.lastVisitAt - left.lastVisitAt;
  });

  return {
    customers,
    summary,
    opportunityCards: buildOpportunityCards(summary),
    insights: buildCustomerLifecycleInsights(summary),
  };
}

export function getCustomerLifecycleStatus(
  customer: Pick<
    CustomerLifecycleSnapshot,
    'joinedDaysAgo' | 'lastVisitDaysAgo' | 'rewardProgressRatio' | 'visitCount'
  >
) {
  return resolveLifecycleStatus(customer);
}

export function getCustomersForOpportunity(
  customers: CustomerLifecycleSnapshot[],
  opportunity: RetentionOpportunityKey
) {
  switch (opportunity) {
    case 'at_risk':
      return customers.filter((customer) => customer.isAtRisk);
    case 'near_reward':
      return customers.filter((customer) => customer.isNearReward);
    case 'vip':
      return customers.filter((customer) => customer.isVip);
    case 'new_customers':
      return customers.filter((customer) => customer.isNewCustomer);
    default:
      return [];
  }
}
