import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';

import { assertEntitlement } from './entitlements';
import { requireActorIsStaffForBusiness } from './guards';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = DAY_MS * 7;
const DAYS_TO_SHOW = 7;
const WEEKS_TO_SHOW = 5;
const TRAFFIC_WINDOW_DAYS = 56;
const TRAFFIC_MIN_VISITS = 40;
const TRAFFIC_MIN_ACTIVE_DAYS = 14;
const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';
const ISRAEL_HOUR_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: ISRAEL_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});
const ISRAEL_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: ISRAEL_TIME_ZONE,
  weekday: 'short',
});
const WEEKDAY_LABELS_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;
const WEEKDAY_INDEX_BY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

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

export type TrafficStrengthClass = 'strong' | 'weak' | 'neutral';

export type WeekdayTrafficBucket = {
  weekdayIndex: number;
  label: (typeof WEEKDAY_LABELS_HE)[number];
  visits: number;
  classification: TrafficStrengthClass;
};

export type HourTrafficBucket = {
  blockIndex: number;
  startHour: number;
  endHour: number;
  label: string;
  visits: number;
  classification: TrafficStrengthClass;
};

export type TrafficWindowsSummary = {
  hasEnoughData: boolean;
  reason: 'ok' | 'not_enough_visits' | 'not_enough_days';
  minVisitsRequired: number;
  minActiveDaysRequired: number;
  visitsConsidered: number;
  activeDaysConsidered: number;
  weekday: WeekdayTrafficBucket[];
  hourBlocks: HourTrafficBucket[];
  strongestWeekdays: WeekdayTrafficBucket[];
  weakestWeekdays: WeekdayTrafficBucket[];
  strongestHourBlocks: HourTrafficBucket[];
  weakestHourBlocks: HourTrafficBucket[];
};

type BusinessActivityResponse = {
  daily: ActivityPeriod[];
  weekly: ActivityPeriod[];
  totals: ActivityTotals;
  trafficWindows: TrafficWindowsSummary;
};

type MerchantActivityResponse = BusinessActivityResponse & {
  growthPercent: number;
};

function buildEmptyTrafficWindowsSummary(): TrafficWindowsSummary {
  const weekday: WeekdayTrafficBucket[] = WEEKDAY_LABELS_HE.map(
    (label, weekdayIndex) => ({
      weekdayIndex,
      label,
      visits: 0,
      classification: 'neutral',
    })
  );
  const hourBlocks: HourTrafficBucket[] = Array.from(
    { length: 12 },
    (_unused, blockIndex) => {
      const startHour = blockIndex * 2;
      const endHour = startHour + 1;
      return {
        blockIndex,
        startHour,
        endHour,
        label: `${String(startHour).padStart(2, '0')}:00-${String(endHour).padStart(2, '0')}:59`,
        visits: 0,
        classification: 'neutral',
      };
    }
  );
  return {
    hasEnoughData: false,
    reason: 'not_enough_visits',
    minVisitsRequired: TRAFFIC_MIN_VISITS,
    minActiveDaysRequired: TRAFFIC_MIN_ACTIVE_DAYS,
    visitsConsidered: 0,
    activeDaysConsidered: 0,
    weekday,
    hourBlocks,
    strongestWeekdays: [],
    weakestWeekdays: [],
    strongestHourBlocks: [],
    weakestHourBlocks: [],
  };
}

const emptyResponse: BusinessActivityResponse = {
  daily: [],
  weekly: [],
  totals: {
    stamps: 0,
    redemptions: 0,
    uniqueCustomers: 0,
  },
  trafficWindows: buildEmptyTrafficWindowsSummary(),
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

function getIsraelHour(timestamp: number) {
  const raw = ISRAEL_HOUR_FORMATTER.formatToParts(new Date(timestamp));
  const hourPart = raw.find((part) => part.type === 'hour');
  if (!hourPart) {
    return 0;
  }
  const parsed = Number(hourPart.value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 23) {
    return 0;
  }
  return parsed;
}

function getIsraelWeekdayIndex(timestamp: number) {
  const shortLabel = ISRAEL_WEEKDAY_FORMATTER.format(new Date(timestamp));
  const mapped = WEEKDAY_INDEX_BY_SHORT[shortLabel];
  if (Number.isFinite(mapped)) {
    return mapped;
  }
  return new Date(timestamp).getUTCDay();
}

function classifyThreshold(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return {
    mean,
    threshold: Math.max(1, stdDev * 0.5),
  };
}

export function classifyTrafficValues(
  values: number[]
): TrafficStrengthClass[] {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }
  const { mean, threshold } = classifyThreshold(values);
  return values.map((value) => {
    if (value >= mean + threshold) {
      return 'strong';
    }
    if (value <= mean - threshold) {
      return 'weak';
    }
    return 'neutral';
  });
}

function selectTrafficExtremes<
  T extends { visits: number; classification: TrafficStrengthClass },
>(buckets: T[], classification: 'strong' | 'weak') {
  return buckets
    .filter((bucket) => bucket.classification === classification)
    .sort((left, right) => {
      if (classification === 'strong') {
        return right.visits - left.visits;
      }
      return left.visits - right.visits;
    })
    .slice(0, 3);
}

export function buildTrafficWindowsFromEvents(
  events: Array<{
    type: string;
    createdAt: number;
  }>
): TrafficWindowsSummary {
  const template = buildEmptyTrafficWindowsSummary();
  if (!Array.isArray(events) || events.length === 0) {
    return template;
  }

  const visitEvents = events.filter((event) => event.type === 'STAMP_ADDED');
  const visitsConsidered = visitEvents.length;
  const activeDaysSet = new Set<number>();
  const weekdayVisits = Array.from({ length: 7 }, () => 0);
  const hourBlockVisits = Array.from({ length: 12 }, () => 0);

  for (const event of visitEvents) {
    const weekdayIndex = getIsraelWeekdayIndex(event.createdAt);
    const hour = getIsraelHour(event.createdAt);
    const hourBlockIndex = Math.floor(hour / 2);
    if (
      Number.isFinite(weekdayIndex) &&
      weekdayIndex >= 0 &&
      weekdayIndex < weekdayVisits.length
    ) {
      weekdayVisits[weekdayIndex] += 1;
    }
    if (
      Number.isFinite(hourBlockIndex) &&
      hourBlockIndex >= 0 &&
      hourBlockIndex < hourBlockVisits.length
    ) {
      hourBlockVisits[hourBlockIndex] += 1;
    }
    activeDaysSet.add(startOfUTCDay(event.createdAt));
  }

  const activeDaysConsidered = activeDaysSet.size;
  const hasEnoughVisits = visitsConsidered >= TRAFFIC_MIN_VISITS;
  const hasEnoughDays = activeDaysConsidered >= TRAFFIC_MIN_ACTIVE_DAYS;
  const hasEnoughData = hasEnoughVisits && hasEnoughDays;

  const weekdayClassifications = hasEnoughData
    ? classifyTrafficValues(weekdayVisits)
    : Array.from({ length: weekdayVisits.length }, () => 'neutral' as const);
  const hourClassifications = hasEnoughData
    ? classifyTrafficValues(hourBlockVisits)
    : Array.from({ length: hourBlockVisits.length }, () => 'neutral' as const);

  const weekday = WEEKDAY_LABELS_HE.map((label, weekdayIndex) => ({
    weekdayIndex,
    label,
    visits: weekdayVisits[weekdayIndex],
    classification: weekdayClassifications[weekdayIndex],
  }));
  const hourBlocks: HourTrafficBucket[] = hourBlockVisits.map(
    (visits, blockIndex) => {
      const startHour = blockIndex * 2;
      const endHour = startHour + 1;
      return {
        blockIndex,
        startHour,
        endHour,
        label: `${String(startHour).padStart(2, '0')}:00-${String(endHour).padStart(2, '0')}:59`,
        visits,
        classification: hourClassifications[blockIndex],
      };
    }
  );

  return {
    hasEnoughData,
    reason: hasEnoughData
      ? 'ok'
      : !hasEnoughVisits
        ? 'not_enough_visits'
        : 'not_enough_days',
    minVisitsRequired: TRAFFIC_MIN_VISITS,
    minActiveDaysRequired: TRAFFIC_MIN_ACTIVE_DAYS,
    visitsConsidered,
    activeDaysConsidered,
    weekday,
    hourBlocks,
    strongestWeekdays: hasEnoughData
      ? selectTrafficExtremes(weekday, 'strong')
      : [],
    weakestWeekdays: hasEnoughData
      ? selectTrafficExtremes(weekday, 'weak')
      : [],
    strongestHourBlocks: hasEnoughData
      ? selectTrafficExtremes(hourBlocks, 'strong')
      : [],
    weakestHourBlocks: hasEnoughData
      ? selectTrafficExtremes(hourBlocks, 'weak')
      : [],
  };
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
  const trafficWindowStart = startOfUTCDay(
    now - (TRAFFIC_WINDOW_DAYS - 1) * DAY_MS
  );
  const earliestTimestamp = Math.min(
    dailyWindowStart,
    weeklyWindowStart,
    trafficWindowStart
  );

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
  const trafficWindows = buildTrafficWindowsFromEvents(
    events.filter((event: any) => event.createdAt >= trafficWindowStart)
  );

  return {
    daily,
    weekly,
    totals: {
      stamps: totalStamps,
      redemptions: totalRedemptions,
      uniqueCustomers: totalCustomers.size,
    },
    trafficWindows,
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
    await assertEntitlement(ctx, businessId, {
      featureKey: 'canSeeAdvancedReports',
    });
    const activity = await collectBusinessActivity(ctx, businessId);
    return {
      ...activity,
      growthPercent: calculateGrowthPercent(activity.weekly),
    };
  },
});
