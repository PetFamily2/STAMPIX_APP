import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { v } from 'convex/values';

import { requireActorIsStaffForBusiness } from './guards';

const DAY_MS = 24 * 60 * 60 * 1000;
const RISK_WINDOW_MS = DAY_MS * 7;

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
      };
    }

    await requireActorIsStaffForBusiness(ctx, businessId);

    const now = Date.now();
    const weekAgo = now - RISK_WINDOW_MS;

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    let newCustomersLastWeek = 0;
    const customers: MerchantCustomerView[] = [];

    for (const membership of memberships) {
      if (membership.createdAt >= weekAgo) {
        newCustomersLastWeek += 1;
      }

      const customer = await ctx.db.get(membership.userId);
      if (!customer || customer.isActive !== true) {
        continue;
      }

      const program = await ctx.db.get(membership.programId);
      if (!program || program.businessId !== businessId) {
        continue;
      }

      const lastVisitAt = membership.lastStampAt ?? membership.createdAt;
      const isRisk = now - lastVisitAt >= RISK_WINDOW_MS;
      const isVip = membership.currentStamps >= program.maxStamps;

      customers.push({
        membershipId: membership._id,
        customerId: customer._id,
        name: customer.fullName ?? customer.email ?? customer.externalId ?? 'לקוח',
        phone: customer.phone ?? null,
        currentStamps: membership.currentStamps,
        maxStamps: program.maxStamps,
        lastVisitAt,
        isVip,
        isRisk,
      });
    }

    customers.sort((a, b) => b.lastVisitAt - a.lastVisitAt);
    const riskCount = customers.filter((customer) => customer.isRisk).length;

    return {
      customers,
      newCustomersLastWeek,
      riskCount,
    };
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
      .filter((event) => event.type === 'STAMP_ADDED' || event.type === 'REWARD_REDEEMED')
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
      const redeemedFrom = typeof metadata?.redeemedFrom === 'number' ? metadata.redeemedFrom : undefined;
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
        customer: customer.fullName ?? customer.email ?? customer.externalId ?? 'לקוח',
        detail,
        time: timeLabel,
      });
    }

    return activity.slice(0, safeLimit);
  },
});

