import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { v } from 'convex/values';

import { requireActorIsStaffForBusiness } from './guards';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = DAY_MS * 7;
const DAYS_TO_SHOW = 7;
const WEEKS_TO_SHOW = 5;

type ActivityPeriod = {
  start: number;
  stamps: number;
  redemptions: number;
  uniqueCustomers: number;
};

type ActivityTotals = {
  stamps: number;
  redemptions: number;
  uniqueCustomers: number;
};

type BusinessActivityResponse = {
  daily: ActivityPeriod[];
  weekly: ActivityPeriod[];
  totals: ActivityTotals;
};

type MerchantActivityResponse = BusinessActivityResponse & {
  growthPercent: number;
};

const emptyResponse: BusinessActivityResponse = {
  daily: [],
  weekly: [],
  totals: {
    stamps: 0,
    redemptions: 0,
    uniqueCustomers: 0,
  },
};

const emptyMerchantResponse: MerchantActivityResponse = {
  ...emptyResponse,
  growthPercent: 0,
};

function startOfUTCDay(timestamp: number) {
  const day = new Date(timestamp);
  day.setUTCHours(0, 0, 0, 0);
  return day.getTime();
}

function startOfUTCWeek(timestamp: number) {
  const week = new Date(timestamp);
  const dayOfWeek = week.getUTCDay();
  week.setUTCDate(week.getUTCDate() - dayOfWeek);
  week.setUTCHours(0, 0, 0, 0);
  return week.getTime();
}

type EventBucket = {
  stamps: number;
  redemptions: number;
  customers: Set<string>;
};

const ensureBucket = (map: Map<number, EventBucket>, key: number) => {
  if (!map.has(key)) {
    map.set(key, { stamps: 0, redemptions: 0, customers: new Set() });
  }
  return map.get(key)!;
};

async function collectBusinessActivity(
  ctx: any,
  businessId: Id<'businesses'>
): Promise<BusinessActivityResponse> {
  const now = Date.now();
  const dailyWindowStart = startOfUTCDay(now - (DAYS_TO_SHOW - 1) * DAY_MS);
  const weeklyWindowStart = startOfUTCWeek(now - (WEEKS_TO_SHOW - 1) * WEEK_MS);
  const earliestTimestamp = Math.min(dailyWindowStart, weeklyWindowStart);

  const events = await ctx.db
    .query('events')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) => q.gte(q.field('createdAt'), earliestTimestamp))
    .collect();

  const dailyBuckets = new Map<number, EventBucket>();
  const weeklyBuckets = new Map<number, EventBucket>();
  const totalCustomers = new Set<string>();
  let totalStamps = 0;
  let totalRedemptions = 0;

  for (const event of events) {
    const customerKey = String(event.customerUserId);
    const dayKey = startOfUTCDay(event.createdAt);
    const weekKey = startOfUTCWeek(event.createdAt);
    const dailyBucket = ensureBucket(dailyBuckets, dayKey);
    const weeklyBucket = ensureBucket(weeklyBuckets, weekKey);

    if (event.type === 'STAMP_ADDED') {
      dailyBucket.stamps += 1;
      weeklyBucket.stamps += 1;
      totalStamps += 1;
    } else if (event.type === 'REWARD_REDEEMED') {
      dailyBucket.redemptions += 1;
      weeklyBucket.redemptions += 1;
      totalRedemptions += 1;
    } else {
      continue;
    }

    dailyBucket.customers.add(customerKey);
    weeklyBucket.customers.add(customerKey);
    totalCustomers.add(customerKey);
  }

  const daily: ActivityPeriod[] = [];
  for (let offset = DAYS_TO_SHOW - 1; offset >= 0; offset -= 1) {
    const dayStart = startOfUTCDay(now - offset * DAY_MS);
    const bucket = dailyBuckets.get(dayStart);
    daily.push({
      start: dayStart,
      stamps: bucket?.stamps ?? 0,
      redemptions: bucket?.redemptions ?? 0,
      uniqueCustomers: bucket?.customers.size ?? 0,
    });
  }

  const weekly: ActivityPeriod[] = [];
  for (let offset = WEEKS_TO_SHOW - 1; offset >= 0; offset -= 1) {
    const weekStart = startOfUTCWeek(now - offset * WEEK_MS);
    const bucket = weeklyBuckets.get(weekStart);
    weekly.push({
      start: weekStart,
      stamps: bucket?.stamps ?? 0,
      redemptions: bucket?.redemptions ?? 0,
      uniqueCustomers: bucket?.customers.size ?? 0,
    });
  }

  return {
    daily,
    weekly,
    totals: {
      stamps: totalStamps,
      redemptions: totalRedemptions,
      uniqueCustomers: totalCustomers.size,
    },
  };
}

function calculateGrowthPercent(weekly: ActivityPeriod[]) {
  const latestWeek = weekly[weekly.length - 1]?.stamps ?? 0;
  const previousWeek = weekly[weekly.length - 2]?.stamps ?? 0;
  if (previousWeek === 0) {
    return 0;
  }
  return Math.round(((latestWeek - previousWeek) / previousWeek) * 100);
}

export const getBusinessActivity = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return emptyResponse;
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    return collectBusinessActivity(ctx, businessId);
  },
});

export const getMerchantActivity = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return emptyMerchantResponse;
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    const activity = await collectBusinessActivity(ctx, businessId);
    return {
      ...activity,
      growthPercent: calculateGrowthPercent(activity.weekly),
    };
  },
});
