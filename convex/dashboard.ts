import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { getBusinessSettings } from './business';
import {
  buildDashboardLifecycleCountsFromStampEvents,
  type DashboardStampEvent,
} from './customerLifecycle';
import { getBusinessUsageSummary } from './entitlements';
import {
  requireActorHasBusinessCapability,
  requireActorIsStaffForBusiness,
} from './guards';
import {
  loadBusinessRecommendationFacts,
  type CampaignLifecycleFactValue,
} from './recommendations';

const DAY_MS = 24 * 60 * 60 * 1000;
const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';
const DATE_PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: ISRAEL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const TIME_ZONE_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: ISRAEL_TIME_ZONE,
  timeZoneName: 'longOffset',
  hour: '2-digit',
  minute: '2-digit',
});
const TEMP_DASHBOARD_LARGE_NUMBERS = false;

type DayBounds = {
  dayKey: string;
  startMs: number;
  endMs: number;
  year: number;
  month: number;
  day: number;
};

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function resolveProgramLifecycle(program: {
  status?: unknown;
  isArchived?: unknown;
}) {
  if (
    program.status === 'draft' ||
    program.status === 'active' ||
    program.status === 'archived'
  ) {
    return program.status;
  }

  if (program.isArchived === true) {
    return 'archived' as const;
  }

  return 'active' as const;
}

function getIsraelDateParts(timestamp: number) {
  const values = new Map<string, string>();
  for (const part of DATE_PARTS_FORMATTER.formatToParts(new Date(timestamp))) {
    if (part.type !== 'literal') {
      values.set(part.type, part.value);
    }
  }

  return {
    year: Number(values.get('year') ?? '1970'),
    month: Number(values.get('month') ?? '01'),
    day: Number(values.get('day') ?? '01'),
  };
}

function getIsraelDayKey(timestamp: number) {
  const { year, month, day } = getIsraelDateParts(timestamp);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(
    2,
    '0'
  )}-${String(day).padStart(2, '0')}`;
}

function getIsraelOffsetMs(timestamp: number) {
  const offsetLabel =
    TIME_ZONE_OFFSET_FORMATTER.formatToParts(new Date(timestamp)).find(
      (part) => part.type === 'timeZoneName'
    )?.value ?? 'GMT+00:00';
  const match = offsetLabel.match(/GMT([+-])(\d{2}):(\d{2})/);

  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3])) * 60 * 1000;
}

function zonedDateTimeToUtcTimestamp(input: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
}) {
  const baseUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour ?? 0,
    input.minute ?? 0,
    input.second ?? 0,
    input.millisecond ?? 0
  );

  let guess = baseUtc;
  for (let index = 0; index < 3; index += 1) {
    const offsetMs = getIsraelOffsetMs(guess);
    const nextGuess = baseUtc - offsetMs;
    if (nextGuess === guess) {
      break;
    }
    guess = nextGuess;
  }

  return guess;
}

function shiftCivilDate(
  input: { year: number; month: number; day: number },
  days: number
) {
  const shifted = new Date(
    Date.UTC(input.year, input.month - 1, input.day + days)
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function getIsraelDayBounds(timestamp: number): DayBounds {
  const parts = getIsraelDateParts(timestamp);
  const startMs = zonedDateTimeToUtcTimestamp(parts);
  const nextDayParts = shiftCivilDate(parts, 1);
  const nextDayStartMs = zonedDateTimeToUtcTimestamp(nextDayParts);

  return {
    dayKey: getIsraelDayKey(timestamp),
    startMs,
    endMs: nextDayStartMs - 1,
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

function buildSelectedReferenceTimes(dayStart: number, actualNow: number) {
  const selectedBounds = getIsraelDayBounds(dayStart);
  const isToday = selectedBounds.dayKey === getIsraelDayKey(actualNow);
  const referenceNow = isToday
    ? Math.min(actualNow, selectedBounds.endMs)
    : selectedBounds.endMs;
  const previousDayReferenceNow = selectedBounds.startMs - 1;

  return {
    selectedBounds,
    referenceNow,
    previousDayReferenceNow,
    isToday,
  };
}

function applyTemporaryLargeNumberSummary(metrics: {
  totalStampsAllTime: number;
  totalRedemptionsAllTime: number;
  totalCustomersJoinedAllTime: number;
  returningCustomersAllTime: number;
}) {
  if (!TEMP_DASHBOARD_LARGE_NUMBERS) {
    return metrics;
  }

  return {
    totalStampsAllTime: 999_999,
    totalRedemptionsAllTime: 999_999,
    totalCustomersJoinedAllTime: 999_999,
    returningCustomersAllTime: 999_999,
  };
}

function applyTemporaryLargeNumberLifetimeChanges(changes: {
  stampsLast7Days: number;
  redemptionsLast7Days: number;
  joinedCustomersLast7Days: number;
  returningCustomersLast7Days: number;
}) {
  if (!TEMP_DASHBOARD_LARGE_NUMBERS) {
    return changes;
  }

  return {
    stampsLast7Days: 999,
    redemptionsLast7Days: 999,
    joinedCustomersLast7Days: 999,
    returningCustomersLast7Days: 999,
  };
}

function applyTemporaryLargeNumberDay(kpis: {
  stamps: { value: number; previousValue: number };
  redemptions: { value: number; previousValue: number };
  activeCustomers: number;
  activeCustomersPreviousDay: number;
  atRiskCustomers: number;
  atRiskCustomersPreviousDay: number;
}) {
  if (!TEMP_DASHBOARD_LARGE_NUMBERS) {
    return kpis;
  }

  return {
    stamps: {
      value: 999_999,
      previousValue: 999_999,
    },
    redemptions: {
      value: 999_999,
      previousValue: 999_999,
    },
    activeCustomers: 999_999,
    activeCustomersPreviousDay: 999_999,
    atRiskCustomers: 999_999,
    atRiskCustomersPreviousDay: 999_999,
  };
}

function applyTemporaryLargeNumberActivitySummary(summary: {
  shouldRender: boolean;
  staffScans: number;
  campaignRecipients: number;
  activePrograms: number;
  rewardsRedeemed: number;
}) {
  if (!TEMP_DASHBOARD_LARGE_NUMBERS) {
    return summary;
  }

  return {
    shouldRender: true,
    staffScans: 999_999,
    campaignRecipients: 999_999,
    activePrograms: 999_999,
    rewardsRedeemed: 999_999,
  };
}

const optionalIdKey = (value: unknown) => (value ? String(value) : null);

export function collectLifetimeMetrics(
  events: Array<{
    type?: string;
    customerUserId?: unknown;
    createdAt?: number;
  }>,
  memberships: Array<{ userId?: unknown }>
) {
  const stampCountsByCustomer = new Map<string, number>();
  let totalStampsAllTime = 0;
  let totalRedemptionsAllTime = 0;

  for (const event of events) {
    if (event.type === 'STAMP_ADDED') {
      totalStampsAllTime += 1;
      const customerKey = optionalIdKey(event.customerUserId);
      if (customerKey) {
        stampCountsByCustomer.set(
          customerKey,
          (stampCountsByCustomer.get(customerKey) ?? 0) + 1
        );
      }
      continue;
    }

    if (event.type === 'REWARD_REDEEMED') {
      totalRedemptionsAllTime += 1;
    }
  }

  const uniqueCustomers = new Set(
    memberships.map((membership) => String(membership.userId))
  );
  const returningCustomersAllTime = [...stampCountsByCustomer.values()].filter(
    (count) => count >= 2
  ).length;

  return {
    totalStampsAllTime,
    totalRedemptionsAllTime,
    totalCustomersJoinedAllTime: uniqueCustomers.size,
    returningCustomersAllTime,
  };
}

export function collectLifetimeMetricChanges(args: {
  events: Array<{
    type?: string;
    customerUserId?: unknown;
    createdAt?: number;
  }>;
  memberships: Array<{
    userId?: unknown;
    createdAt?: number;
    _creationTime?: number;
  }>;
  now: number;
  windowDays?: number;
}) {
  const windowStart = args.now - (args.windowDays ?? 7) * DAY_MS;
  let stampsLast7Days = 0;
  let redemptionsLast7Days = 0;
  let joinedCustomersLast7Days = 0;
  let returningCustomersLast7Days = 0;
  const customerStampCounts = new Map<string, number>();

  const sortedEvents = [...args.events].sort(
    (left, right) =>
      safeNumber(left.createdAt, 0) - safeNumber(right.createdAt, 0)
  );

  for (const membership of args.memberships) {
    const createdAt = safeNumber(
      membership.createdAt ?? membership._creationTime,
      0
    );
    if (createdAt >= windowStart && createdAt <= args.now) {
      joinedCustomersLast7Days += 1;
    }
  }

  for (const event of sortedEvents) {
    const createdAt = safeNumber(event.createdAt, 0);
    if (event.type === 'STAMP_ADDED') {
      if (createdAt >= windowStart && createdAt <= args.now) {
        stampsLast7Days += 1;
      }

      const customerKey = optionalIdKey(event.customerUserId);
      if (customerKey) {
        const nextCount = (customerStampCounts.get(customerKey) ?? 0) + 1;
        customerStampCounts.set(customerKey, nextCount);
        if (
          nextCount === 2 &&
          createdAt >= windowStart &&
          createdAt <= args.now
        ) {
          returningCustomersLast7Days += 1;
        }
      }
      continue;
    }

    if (
      event.type === 'REWARD_REDEEMED' &&
      createdAt >= windowStart &&
      createdAt <= args.now
    ) {
      redemptionsLast7Days += 1;
    }
  }

  return {
    stampsLast7Days,
    redemptionsLast7Days,
    joinedCustomersLast7Days,
    returningCustomersLast7Days,
  };
}

function buildUsageWarnings(args: {
  cardsUsed: number;
  cardsLimit: number;
  customersUsed: number;
  customersLimit: number;
  campaignsUsed: number | null;
  campaignsLimit: number | null;
}) {
  const warnings: string[] = [];

  const addLimitState = (
    key: 'cards' | 'customers' | 'campaigns',
    used: number | null,
    limit: number | null
  ) => {
    if (used === null || limit === null || limit <= 0) {
      return;
    }
    const ratio = used / limit;
    if (used >= limit) {
      warnings.push(`${key}_limit_reached`);
      return;
    }
    if (ratio >= 0.8) {
      warnings.push(`${key}_limit_near`);
    }
  };

  addLimitState('cards', args.cardsUsed, args.cardsLimit);
  addLimitState('customers', args.customersUsed, args.customersLimit);
  addLimitState('campaigns', args.campaignsUsed, args.campaignsLimit);

  return warnings;
}

export function shouldEmitTransitionalCreateFirstCampaign(input: {
  campaignFacts: CampaignLifecycleFactValue | null;
  activeProgramsCount: number;
  activeCustomerCount: number | null;
  canCreateCampaigns: boolean;
}) {
  return (
    input.campaignFacts?.totalNonarchivedCampaigns === 0 &&
    input.activeProgramsCount > 0 &&
    input.activeCustomerCount !== null &&
    input.activeCustomerCount > 0 &&
    input.canCreateCampaigns
  );
}

export const getBusinessDashboardSummary = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (
    ctx: any,
    { businessId }: { businessId?: Id<'businesses'> }
  ) => {
    if (!businessId) {
      return null;
    }

    const authorization = await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_dashboard'
    );

    const safeRun = async <T>(fn: () => Promise<T>, fallback: T) => {
      try {
        return await fn();
      } catch {
        return fallback;
      }
    };

    const now = Date.now();
    const [
      businessSettings,
      usageSummary,
      recommendationFacts,
      allEvents,
      allMemberships,
    ] = await Promise.all([
      safeRun(
        () =>
          ctx.runQuery(getBusinessSettings, {
            businessId,
          }),
        null
      ),
      safeRun(
        () =>
          ctx.runQuery(getBusinessUsageSummary, {
            businessId,
          }),
        null
      ),
      loadBusinessRecommendationFacts(
        ctx,
        businessId,
        authorization,
        now
      ),
      ctx.db
        .query('events')
        .withIndex('by_businessId_createdAt', (q: any) =>
          q.eq('businessId', businessId)
        )
        .collect(),
      ctx.db
        .query('memberships')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .collect(),
    ]);

    const lifetimeMetrics = applyTemporaryLargeNumberSummary(
      collectLifetimeMetrics(
        Array.isArray(allEvents) ? allEvents : [],
        Array.isArray(allMemberships) ? allMemberships : []
      )
    );
    const lifetimeMetricChanges = applyTemporaryLargeNumberLifetimeChanges(
      collectLifetimeMetricChanges({
        events: Array.isArray(allEvents) ? allEvents : [],
        memberships: Array.isArray(allMemberships) ? allMemberships : [],
        now,
        windowDays: 7,
      })
    );
    const campaignQuota =
      recommendationFacts.facts.campaignQuota.state === 'known'
        ? recommendationFacts.facts.campaignQuota.value
        : null;
    const usageWarnings = buildUsageWarnings({
      cardsUsed: safeNumber((usageSummary as any)?.cardsUsed, 0),
      cardsLimit: safeNumber((usageSummary as any)?.limits?.maxCards, 0),
      customersUsed: safeNumber((usageSummary as any)?.customersUsed, 0),
      customersLimit: safeNumber(
        (usageSummary as any)?.limits?.maxCustomers,
        0
      ),
      campaignsUsed: campaignQuota?.campaignDefinitionUsage ?? null,
      campaignsLimit: campaignQuota?.campaignDefinitionLimit ?? null,
    });
    const profileIncomplete =
      (businessSettings as any)?.profileCompletion?.isComplete === false;
    const missingFieldsCount = safeNumber(
      (businessSettings as any)?.profileCompletion?.missingFields?.length,
      0
    );
    return {
      businessId,
      business: {
        businessId,
        businessName: String((businessSettings as any)?.name ?? ''),
        logoUrl: ((businessSettings as any)?.logoUrl ?? null) as string | null,
        plan: String((usageSummary as any)?.plan ?? 'starter'),
        profileIncomplete,
        missingFieldsCount,
      },
      lifetimeMetrics,
      lifetimeMetricChanges,
      usageWarnings,
      freshness: {
        generatedAt: now,
      },
    };
  },
});

export const getBusinessDashboardDay = query({
  args: {
    businessId: v.optional(v.id('businesses')),
    dayStart: v.number(),
    rangeDays: v.optional(v.number()),
  },
  handler: async (
    ctx: any,
    {
      businessId,
      dayStart,
      rangeDays,
    }: { businessId?: Id<'businesses'>; dayStart: number; rangeDays?: number }
  ) => {
    if (!businessId) {
      return null;
    }

    await requireActorIsStaffForBusiness(ctx, businessId);

    const actualNow = Date.now();
    const { selectedBounds, referenceNow, previousDayReferenceNow, isToday } =
      buildSelectedReferenceTimes(dayStart, actualNow);
    const effectiveRangeDays =
      rangeDays === 7 || rangeDays === 30 ? rangeDays : 1;
    const currentRangeStartParts = shiftCivilDate(
      {
        year: selectedBounds.year,
        month: selectedBounds.month,
        day: selectedBounds.day,
      },
      -(effectiveRangeDays - 1)
    );
    const currentRangeStartMs = zonedDateTimeToUtcTimestamp(
      currentRangeStartParts
    );
    const comparisonRangeEndMs =
      effectiveRangeDays === 1
        ? previousDayReferenceNow
        : currentRangeStartMs - 1;
    const comparisonRangeEndBounds = getIsraelDayBounds(comparisonRangeEndMs);
    const comparisonRangeStartParts = shiftCivilDate(
      {
        year: comparisonRangeEndBounds.year,
        month: comparisonRangeEndBounds.month,
        day: comparisonRangeEndBounds.day,
      },
      -(effectiveRangeDays - 1)
    );
    const comparisonRangeStartMs = zonedDateTimeToUtcTimestamp(
      comparisonRangeStartParts
    );

    const [events, messageLog, activePrograms] = await Promise.all([
      ctx.db
        .query('events')
        .withIndex('by_businessId_createdAt', (q: any) =>
          q.eq('businessId', businessId).lte('createdAt', referenceNow)
        )
        .collect(),
      ctx.db
        .query('messageLog')
        .withIndex('by_businessId_createdAt', (q: any) =>
          q.eq('businessId', businessId).lte('createdAt', referenceNow)
        )
        .collect(),
      ctx.db
        .query('loyaltyPrograms')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .filter((q: any) => q.eq(q.field('isActive'), true))
        .collect(),
    ]);

    const stampEvents = (Array.isArray(events) ? events : []).filter(
      (event: any) => event.type === 'STAMP_ADDED'
    ) as DashboardStampEvent[];
    const lifecycleCounts = buildDashboardLifecycleCountsFromStampEvents(
      stampEvents,
      referenceNow
    );
    const previousLifecycleCounts =
      buildDashboardLifecycleCountsFromStampEvents(
        stampEvents,
        comparisonRangeEndMs
      );

    let stamps = 0;
    let stampsPreviousDay = 0;
    let redemptions = 0;
    let redemptionsPreviousDay = 0;
    const staffActors = new Set<string>();

    for (const event of Array.isArray(events) ? events : []) {
      const createdAt = safeNumber(event.createdAt, 0);
      if (createdAt >= currentRangeStartMs && createdAt <= referenceNow) {
        if (event.type === 'STAMP_ADDED') {
          stamps += 1;
          const actorKey = optionalIdKey(event.actorUserId);
          if (actorKey) {
            staffActors.add(actorKey);
          }
        } else if (event.type === 'REWARD_REDEEMED') {
          redemptions += 1;
          const actorKey = optionalIdKey(event.actorUserId);
          if (actorKey) {
            staffActors.add(actorKey);
          }
        }
      } else if (
        createdAt >= comparisonRangeStartMs &&
        createdAt <= comparisonRangeEndMs
      ) {
        if (event.type === 'STAMP_ADDED') {
          stampsPreviousDay += 1;
        } else if (event.type === 'REWARD_REDEEMED') {
          redemptionsPreviousDay += 1;
        }
      }
    }

    const campaignRecipients = new Set<string>();
    for (const row of Array.isArray(messageLog) ? messageLog : []) {
      const createdAt = safeNumber(row.createdAt, 0);
      if (createdAt >= currentRangeStartMs && createdAt <= referenceNow) {
        campaignRecipients.add(String(row.toUserId));
      }
    }

    const activeProgramsCount = (
      Array.isArray(activePrograms) ? activePrograms : []
    ).filter(
      (program: any) => resolveProgramLifecycle(program) === 'active'
    ).length;
    const shouldRenderActivitySummary =
      staffActors.size > 0 || campaignRecipients.size > 0 || redemptions > 0;

    const kpis = applyTemporaryLargeNumberDay({
      stamps: {
        value: stamps,
        previousValue: stampsPreviousDay,
      },
      redemptions: {
        value: redemptions,
        previousValue: redemptionsPreviousDay,
      },
      activeCustomers: lifecycleCounts.activeCustomers,
      activeCustomersPreviousDay: previousLifecycleCounts.activeCustomers,
      atRiskCustomers: lifecycleCounts.atRiskCustomers,
      atRiskCustomersPreviousDay: previousLifecycleCounts.atRiskCustomers,
    });

    return {
      businessId,
      dateContext: {
        dayKey: selectedBounds.dayKey,
        dayStart: selectedBounds.startMs,
        dayEnd: selectedBounds.endMs,
        rangeDays: effectiveRangeDays,
        rangeStart: currentRangeStartMs,
        rangeEnd: referenceNow,
        referenceNow,
        isToday,
      },
      kpis,
      activitySummary: applyTemporaryLargeNumberActivitySummary({
        shouldRender: shouldRenderActivitySummary,
        staffScans: staffActors.size,
        campaignRecipients: campaignRecipients.size,
        activePrograms: activeProgramsCount,
        rewardsRedeemed: redemptions,
      }),
    };
  },
});
