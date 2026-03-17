import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import {
  buildCustomerLifecycleInsights,
  buildCustomerLifecycleSnapshotForBusiness,
} from './customerLifecycle';
import { assertEntitlement } from './entitlements';
import { requireActorIsStaffForBusiness } from './guards';

type SnapshotResponse = Awaited<
  ReturnType<typeof buildCustomerLifecycleSnapshotForBusiness>
>;

type MerchantCustomersResponse = {
  customers: SnapshotResponse['customers'];
  newCustomersLastWeek: number;
  riskCount: number;
  nearRewardCount: number;
  vipCount: number;
};

export const buildCustomerInsights = buildCustomerLifecycleInsights;

export const getCustomerManagementSnapshot = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return {
        summary: {
          totalCustomers: 0,
          activeCustomers: 0,
          atRiskCustomers: 0,
          nearRewardCustomers: 0,
          vipCustomers: 0,
          newCustomers: 0,
        },
        insights: [],
        opportunityCards: [],
        customers: [],
      } satisfies SnapshotResponse;
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'smartAnalytics',
    });

    return await buildCustomerLifecycleSnapshotForBusiness(ctx, businessId);
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
        nearRewardCount: 0,
        vipCount: 0,
      } satisfies MerchantCustomersResponse;
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'smartAnalytics',
    });

    const snapshot = await buildCustomerLifecycleSnapshotForBusiness(
      ctx,
      businessId
    );

    return {
      customers: snapshot.customers,
      newCustomersLastWeek: snapshot.summary.newCustomers,
      riskCount: snapshot.summary.atRiskCustomers,
      nearRewardCount: snapshot.summary.nearRewardCustomers,
      vipCount: snapshot.summary.vipCustomers,
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
    const programCache = new Map<string, Doc<'loyaltyPrograms'> | null>();

    for (const event of sorted) {
      const customer = await ctx.db.get(event.customerUserId);
      if (!customer) {
        continue;
      }

      const programIdKey = String(event.programId);
      let program = programCache.get(programIdKey);
      if (program === undefined) {
        program =
          (await ctx.db.get(
            event.programId as Doc<'loyaltyPrograms'>['_id']
          )) ?? null;
        programCache.set(programIdKey, program);
      }

      const metadata = event.metadata as Record<string, unknown> | undefined;
      const previousPunchCount =
        typeof metadata?.previous === 'number' ? metadata.previous : undefined;
      const nextPunchCount =
        typeof metadata?.next === 'number' ? metadata.next : undefined;
      const redeemedFrom =
        typeof metadata?.redeemedFrom === 'number'
          ? metadata.redeemedFrom
          : undefined;
      const maxStamps =
        typeof program?.maxStamps === 'number' ? program.maxStamps : null;
      const unlockedRewardByCompletion =
        event.type === 'STAMP_ADDED' &&
        typeof previousPunchCount === 'number' &&
        typeof nextPunchCount === 'number' &&
        typeof maxStamps === 'number' &&
        previousPunchCount < maxStamps &&
        nextPunchCount >= maxStamps;
      const detail =
        event.type === 'STAMP_ADDED'
          ? `קיבל ניקוב${nextPunchCount ? ` ${nextPunchCount}` : ''}`
          : redeemedFrom
            ? `מימש ${redeemedFrom} ניקובים`
            : 'מימש הטבה';

      const displayDetail =
        unlockedRewardByCompletion && event.type === 'STAMP_ADDED'
          ? program?.rewardName
            ? `השלים כרטיסיה וזכאי ל${program.rewardName}`
            : 'השלים כרטיסיה וזכאי להטבה'
          : detail;
      const activityType: RecentActivityItem['type'] =
        event.type === 'REWARD_REDEEMED' || unlockedRewardByCompletion
          ? 'reward'
          : 'punch';

      const timeLabel = new Date(event.createdAt).toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
      });

      activity.push({
        id: String(event._id),
        type: activityType,
        customer:
          customer.fullName ?? customer.email ?? customer.externalId ?? 'לקוח',
        detail: displayDetail,
        time: timeLabel,
      });
    }

    return activity.slice(0, safeLimit);
  },
});
