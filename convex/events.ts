import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { normalizeCustomerSegmentationConfig } from './business';
import { assertEntitlement } from './entitlements';
import { requireActorIsStaffForBusiness } from './guards';

const DAY_MS = 24 * 60 * 60 * 1000;
const RISK_WINDOW_MS = DAY_MS * 7;
const CUSTOMER_WINDOW_DAYS = 30;
const CUSTOMER_PREVIOUS_WINDOW_DAYS = 60;

export type CustomerSegment = 'frequent' | 'stable' | 'dropoff' | 'risk';

type SnapshotCustomer = {
  membershipId: Id<'memberships'>;
  customerId: Id<'users'>;
  name: string;
  phone: string | null;
  lastVisitAt: number;
  daysSinceLastVisit: number;
  visitsLast30: number;
  visitsPrev30: number;
  segment: CustomerSegment;
  isRisk: boolean;
  isVip: boolean;
  currentStamps: number;
  maxStamps: number;
};

type SnapshotSummary = {
  activeCustomers: number;
  riskCount: number;
  frequentCount: number;
  dropoffCount: number;
  stableCount: number;
};

type CustomerSegmentationThresholds = {
  riskDaysWithoutVisit: number;
  frequentVisitsLast30Days: number;
  dropPercentThreshold: number;
};

type SnapshotResponse = {
  summary: SnapshotSummary;
  insights: string[];
  customers: SnapshotCustomer[];
  segmentationConfig: {
    riskDaysWithoutVisit: number;
    frequentVisitsLast30Days: number;
    dropPercentThreshold: number;
    updatedAt: number;
  };
};

type MerchantCustomerView = {
  membershipId: Id<'memberships'>;
  customerId: Id<'users'>;
  name: string;
  phone: string | null;
  currentStamps: number;
  maxStamps: number;
  lastVisitAt: number;
  isVip: boolean;
  isRisk: boolean;
};

type MerchantCustomersResponse = {
  customers: MerchantCustomerView[];
  newCustomersLastWeek: number;
  riskCount: number;
};

type VisitStats = {
  visitsLast30: number;
  visitsPrev30: number;
};

type InternalCustomerRow = SnapshotCustomer & {
  joinedAt: number;
};

const SEGMENT_PRIORITY: Record<CustomerSegment, number> = {
  risk: 0,
  dropoff: 1,
  frequent: 2,
  stable: 3,
};

function getDaysSince(lastVisitAt: number, now: number) {
  return Math.max(0, Math.floor((now - lastVisitAt) / DAY_MS));
}

export function resolveCustomerSegment(
  args: {
    daysSinceLastVisit: number;
    visitsLast30: number;
    visitsPrev30: number;
    riskDaysWithoutVisit: number;
    frequentVisitsLast30Days: number;
    dropPercentThreshold: number;
  } & CustomerSegmentationThresholds
): CustomerSegment {
  if (args.daysSinceLastVisit >= args.riskDaysWithoutVisit) {
    return 'risk';
  }

  if (args.visitsPrev30 >= args.frequentVisitsLast30Days) {
    const dropoffLimit = Math.floor(
      args.visitsPrev30 * (1 - args.dropPercentThreshold / 100)
    );
    if (args.visitsLast30 <= dropoffLimit) {
      return 'dropoff';
    }
  }

  if (args.visitsLast30 >= args.frequentVisitsLast30Days) {
    return 'frequent';
  }

  return 'stable';
}

export function buildCustomerInsights(summary: SnapshotSummary): string[] {
  const insights: string[] = [];

  if (summary.activeCustomers === 0) {
    insights.push(
      'אין עדיין לקוחות פעילים בעסק. התחילו בסריקות כדי לבנות בסיס לקוחות.'
    );
    return insights;
  }

  if (summary.riskCount > 0) {
    insights.push(
      `זוהו ${summary.riskCount} לקוחות בסיכון נטישה. מומלץ להריץ קמפיין החזרה ממוקד.`
    );
  }

  if (summary.dropoffCount > 0) {
    insights.push(
      `זוהו ${summary.dropoffCount} לקוחות בירידה בתדירות. מומלץ לעודד חזרה עם הטבה אישית.`
    );
  }

  if (summary.frequentCount > 0) {
    insights.push(
      `${summary.frequentCount} לקוחות תדירים מזוהים כקהל נאמן. שקלו מסלול VIP או תגמול גבוה יותר.`
    );
  }

  if (insights.length === 0) {
    insights.push(
      'שימור הלקוחות יציב. המשיכו בקצב פעילות עקבי כדי לחזק נאמנות.'
    );
  }

  return insights.slice(0, 3);
}

async function buildCustomerManagementSnapshot(
  ctx: any,
  businessId: Id<'businesses'>
): Promise<{
  summary: SnapshotSummary;
  insights: string[];
  customers: InternalCustomerRow[];
  segmentationConfig: SnapshotResponse['segmentationConfig'];
}> {
  const now = Date.now();
  const business = await ctx.db.get(businessId);
  if (!business || business.isActive !== true) {
    throw new Error('BUSINESS_INACTIVE');
  }

  const segmentationConfig = normalizeCustomerSegmentationConfig(
    business.customerSegmentationConfig,
    now
  );

  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .collect();

  if (memberships.length === 0) {
    return {
      segmentationConfig,
      summary: {
        activeCustomers: 0,
        riskCount: 0,
        frequentCount: 0,
        dropoffCount: 0,
        stableCount: 0,
      },
      insights: buildCustomerInsights({
        activeCustomers: 0,
        riskCount: 0,
        frequentCount: 0,
        dropoffCount: 0,
        stableCount: 0,
      }),
      customers: [],
    };
  }

  const last30WindowStart = now - CUSTOMER_WINDOW_DAYS * DAY_MS;
  const prev30WindowStart = now - CUSTOMER_PREVIOUS_WINDOW_DAYS * DAY_MS;

  const recentStampEvents = await ctx.db
    .query('events')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) =>
      q.and(
        q.eq(q.field('type'), 'STAMP_ADDED'),
        q.gte(q.field('createdAt'), prev30WindowStart)
      )
    )
    .collect();

  const visitStatsByCustomer = new Map<string, VisitStats>();
  for (const event of recentStampEvents) {
    const key = String(event.customerUserId);
    const current = visitStatsByCustomer.get(key) ?? {
      visitsLast30: 0,
      visitsPrev30: 0,
    };
    if (event.createdAt >= last30WindowStart) {
      current.visitsLast30 += 1;
    } else {
      current.visitsPrev30 += 1;
    }
    visitStatsByCustomer.set(key, current);
  }

  const customers: InternalCustomerRow[] = [];
  const summary: SnapshotSummary = {
    activeCustomers: 0,
    riskCount: 0,
    frequentCount: 0,
    dropoffCount: 0,
    stableCount: 0,
  };

  for (const membership of memberships) {
    const [customer, program] = await Promise.all([
      ctx.db.get(membership.userId),
      ctx.db.get(membership.programId),
    ]);

    if (!customer || customer.isActive !== true) {
      continue;
    }
    if (!program || program.businessId !== businessId) {
      continue;
    }

    const lastVisitAt = membership.lastStampAt ?? membership.createdAt;
    const daysSinceLastVisit = getDaysSince(lastVisitAt, now);
    const visitStats = visitStatsByCustomer.get(String(membership.userId)) ?? {
      visitsLast30: 0,
      visitsPrev30: 0,
    };
    const segment = resolveCustomerSegment({
      daysSinceLastVisit,
      visitsLast30: visitStats.visitsLast30,
      visitsPrev30: visitStats.visitsPrev30,
      riskDaysWithoutVisit: segmentationConfig.riskDaysWithoutVisit,
      frequentVisitsLast30Days: segmentationConfig.frequentVisitsLast30Days,
      dropPercentThreshold: segmentationConfig.dropPercentThreshold,
    });
    const isRisk = segment === 'risk';
    const isVip = membership.currentStamps >= program.maxStamps;

    const row: InternalCustomerRow = {
      membershipId: membership._id,
      customerId: customer._id,
      name:
        customer.fullName ?? customer.email ?? customer.externalId ?? 'לקוח',
      phone: customer.phone ?? null,
      lastVisitAt,
      daysSinceLastVisit,
      visitsLast30: visitStats.visitsLast30,
      visitsPrev30: visitStats.visitsPrev30,
      segment,
      isRisk,
      isVip,
      currentStamps: membership.currentStamps,
      maxStamps: program.maxStamps,
      joinedAt: membership.createdAt,
    };
    customers.push(row);
    summary.activeCustomers += 1;
    if (segment === 'risk') summary.riskCount += 1;
    if (segment === 'frequent') summary.frequentCount += 1;
    if (segment === 'dropoff') summary.dropoffCount += 1;
    if (segment === 'stable') summary.stableCount += 1;
  }

  customers.sort((a, b) => {
    const bySegment = SEGMENT_PRIORITY[a.segment] - SEGMENT_PRIORITY[b.segment];
    if (bySegment !== 0) return bySegment;
    return b.lastVisitAt - a.lastVisitAt;
  });

  return {
    segmentationConfig,
    summary,
    insights: buildCustomerInsights(summary),
    customers,
  };
}

export const getCustomerManagementSnapshot = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return {
        summary: {
          activeCustomers: 0,
          riskCount: 0,
          frequentCount: 0,
          dropoffCount: 0,
          stableCount: 0,
        },
        insights: [],
        customers: [],
        segmentationConfig: normalizeCustomerSegmentationConfig({}, Date.now()),
      } satisfies SnapshotResponse;
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'canUseSmartAnalytics',
    });

    const snapshot = await buildCustomerManagementSnapshot(ctx, businessId);
    return {
      summary: snapshot.summary,
      insights: snapshot.insights,
      customers: snapshot.customers.map((customer) => ({
        membershipId: customer.membershipId,
        customerId: customer.customerId,
        name: customer.name,
        phone: customer.phone,
        lastVisitAt: customer.lastVisitAt,
        daysSinceLastVisit: customer.daysSinceLastVisit,
        visitsLast30: customer.visitsLast30,
        visitsPrev30: customer.visitsPrev30,
        segment: customer.segment,
        isRisk: customer.isRisk,
        isVip: customer.isVip,
        currentStamps: customer.currentStamps,
        maxStamps: customer.maxStamps,
      })),
      segmentationConfig: snapshot.segmentationConfig,
    } satisfies SnapshotResponse;
  },
});

export const getMerchantCustomers = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return {
        customers: [],
        newCustomersLastWeek: 0,
        riskCount: 0,
      } satisfies MerchantCustomersResponse;
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'canUseSmartAnalytics',
    });

    const snapshot = await buildCustomerManagementSnapshot(ctx, businessId);
    const weekAgo = Date.now() - RISK_WINDOW_MS;
    const newCustomersLastWeek = snapshot.customers.filter(
      (customer) => customer.joinedAt >= weekAgo
    ).length;

    return {
      customers: snapshot.customers.map((customer) => ({
        membershipId: customer.membershipId,
        customerId: customer.customerId,
        name: customer.name,
        phone: customer.phone,
        currentStamps: customer.currentStamps,
        maxStamps: customer.maxStamps,
        lastVisitAt: customer.lastVisitAt,
        isVip: customer.isVip,
        isRisk: customer.isRisk,
      })),
      newCustomersLastWeek,
      riskCount: snapshot.summary.riskCount,
    } satisfies MerchantCustomersResponse;
  },
});

type RecentActivityItem = {
  id: string;
  type: 'punch' | 'reward';
  customer: string;
  detail: string;
  time: string;
};

export const getRecentActivity = query({
  args: {
    businessId: v.optional(v.id('businesses')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { businessId, limit = 5 }) => {
    if (!businessId) {
      return [];
    }

    await requireActorIsStaffForBusiness(ctx, businessId);

    const resolvedLimit = limit ?? 5;
    const safeLimit = Math.max(1, Math.min(resolvedLimit, 10));
    const events = await ctx.db
      .query('events')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .collect();

    const sorted = events
      .filter(
        (event: Doc<'events'>) =>
          event.type === 'STAMP_ADDED' || event.type === 'REWARD_REDEEMED'
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, safeLimit);

    const activity: RecentActivityItem[] = [];

    for (const event of sorted) {
      const customer = await ctx.db.get(event.customerUserId);
      if (!customer) {
        continue;
      }

      const metadata = event.metadata as Record<string, unknown> | undefined;
      const nextPunchCount =
        typeof metadata?.next === 'number' ? metadata.next : undefined;
      const redeemedFrom =
        typeof metadata?.redeemedFrom === 'number'
          ? metadata.redeemedFrom
          : undefined;
      const detail =
        event.type === 'STAMP_ADDED'
          ? `קיבל ניקוב${nextPunchCount ? ` ${nextPunchCount}` : ''}`
          : redeemedFrom
            ? `מימש ${redeemedFrom} ניקובים`
            : 'מימש הטבה';

      const timeLabel = new Date(event.createdAt).toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
      });

      activity.push({
        id: String(event._id),
        type: event.type === 'STAMP_ADDED' ? 'punch' : 'reward',
        customer:
          customer.fullName ?? customer.email ?? customer.externalId ?? 'לקוח',
        detail,
        time: timeLabel,
      });
    }

    return activity.slice(0, safeLimit);
  },
});
