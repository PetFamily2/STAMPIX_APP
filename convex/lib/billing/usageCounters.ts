import type { Id } from '../../_generated/dataModel';
import { monthKeyFromTimestamp } from '../recommendationUtils';
import type { LimitKey } from './productionContract';

type CounterDoc = {
  _id: Id<'businessUsageCounters'>;
  businessId: Id<'businesses'>;
  nonArchivedCards: number;
  activeUniqueCustomers: number;
  teamSeats: number;
  activeCampaigns: number;
  activeRetentionActions: number;
  aiMonthKey: string;
  aiExecutionsThisMonth: number;
  version: number;
  updatedAt: number;
};

const EMPTY_COUNTER = {
  nonArchivedCards: 0,
  activeUniqueCustomers: 0,
  teamSeats: 0,
  activeCampaigns: 0,
  activeRetentionActions: 0,
  aiExecutionsThisMonth: 0,
};

function counterFieldForLimit(limitKey: LimitKey): keyof typeof EMPTY_COUNTER {
  if (limitKey === 'maxCards') {
    return 'nonArchivedCards';
  }
  if (limitKey === 'maxCustomers') {
    return 'activeUniqueCustomers';
  }
  if (limitKey === 'maxTeamSeats') {
    return 'teamSeats';
  }
  if (limitKey === 'maxCampaigns') {
    return 'activeCampaigns';
  }
  if (limitKey === 'maxActiveRetentionActions') {
    return 'activeRetentionActions';
  }
  return 'aiExecutionsThisMonth';
}

export async function getOrCreateUsageCounter(
  ctx: any,
  businessId: Id<'businesses'>,
  now = Date.now()
): Promise<CounterDoc> {
  const existing = await ctx.db
    .query('businessUsageCounters')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .first();
  if (existing) {
    const monthKey = monthKeyFromTimestamp(now);
    if (existing.aiMonthKey !== monthKey) {
      await ctx.db.patch(existing._id, {
        aiMonthKey: monthKey,
        aiExecutionsThisMonth: 0,
        version: Number(existing.version ?? 0) + 1,
        updatedAt: now,
      });
      return {
        ...existing,
        aiMonthKey: monthKey,
        aiExecutionsThisMonth: 0,
        version: Number(existing.version ?? 0) + 1,
        updatedAt: now,
      };
    }
    return existing;
  }

  const id = await ctx.db.insert('businessUsageCounters', {
    businessId,
    ...EMPTY_COUNTER,
    aiMonthKey: monthKeyFromTimestamp(now),
    version: 0,
    updatedAt: now,
  });
  const created = await ctx.db.get(id);
  return created;
}

export async function reserveUsageSlot(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    limitKey: LimitKey;
    limitValue: number;
    currentObserved?: number;
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  const counter = await getOrCreateUsageCounter(ctx, args.businessId, now);
  const field = counterFieldForLimit(args.limitKey);
  const current =
    typeof args.currentObserved === 'number'
      ? Math.max(0, args.currentObserved)
      : counter[field];
  if (current >= args.limitValue) {
    return { reserved: false as const, current, counter };
  }
  await ctx.db.patch(counter._id, {
    [field]: current + 1,
    version: Number(counter.version ?? 0) + 1,
    updatedAt: now,
  });
  return { reserved: true as const, current: current + 1, counter };
}

export async function releaseUsageSlot(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    limitKey: LimitKey;
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  const counter = await getOrCreateUsageCounter(ctx, args.businessId, now);
  const field = counterFieldForLimit(args.limitKey);
  const next = Math.max(0, Number(counter[field] ?? 0) - 1);
  await ctx.db.patch(counter._id, {
    [field]: next,
    version: Number(counter.version ?? 0) + 1,
    updatedAt: now,
  });
}

export async function reconcileUsageCounter(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    snapshot: Partial<typeof EMPTY_COUNTER> & { aiMonthKey?: string };
    now?: number;
  }
) {
  const now = args.now ?? Date.now();
  const counter = await getOrCreateUsageCounter(ctx, args.businessId, now);
  await ctx.db.patch(counter._id, {
    nonArchivedCards:
      args.snapshot.nonArchivedCards ?? counter.nonArchivedCards,
    activeUniqueCustomers:
      args.snapshot.activeUniqueCustomers ?? counter.activeUniqueCustomers,
    teamSeats: args.snapshot.teamSeats ?? counter.teamSeats,
    activeCampaigns: args.snapshot.activeCampaigns ?? counter.activeCampaigns,
    activeRetentionActions:
      args.snapshot.activeRetentionActions ?? counter.activeRetentionActions,
    aiMonthKey: args.snapshot.aiMonthKey ?? counter.aiMonthKey,
    aiExecutionsThisMonth:
      args.snapshot.aiExecutionsThisMonth ?? counter.aiExecutionsThisMonth,
    version: Number(counter.version ?? 0) + 1,
    updatedAt: now,
  });
}
