import { describe, expect, test } from 'bun:test';

import { monthKeyFromTimestamp } from '../lib/recommendationUtils';
import { reserveUsageSlot } from '../lib/billing/usageCounters';

function createCounterCtx(initial = 0) {
  const state = {
    counters: [
      {
        _id: 'counter_1',
        businessId: 'biz_1',
        nonArchivedCards: initial,
        activeUniqueCustomers: initial,
        teamSeats: initial,
        activeCampaigns: initial,
        activeRetentionActions: initial,
        aiMonthKey: monthKeyFromTimestamp(Date.now()),
        aiExecutionsThisMonth: initial,
        version: 0,
        updatedAt: 1,
      },
    ],
  };
  return {
    ctx: {
      db: {
        query: () => {
          const chain = {
            withIndex: () => chain,
            first: async () => state.counters[0],
          };
          return chain;
        },
        patch: async (_id, patch) => {
          state.counters[0] = { ...state.counters[0], ...patch };
        },
        insert: async () => 'counter_1',
        get: async () => state.counters[0],
      },
    },
    state,
  };
}

describe('usage counters', () => {
  test('final card slot cannot exceed the cap', async () => {
    const { ctx, state } = createCounterCtx(0);
    const first = await reserveUsageSlot(ctx, {
      businessId: 'biz_1',
      limitKey: 'maxCards',
      limitValue: 1,
    });
    const second = await reserveUsageSlot(ctx, {
      businessId: 'biz_1',
      limitKey: 'maxCards',
      limitValue: 1,
    });
    expect(first.reserved).toBe(true);
    expect(second.reserved).toBe(false);
    expect(state.counters[0].nonArchivedCards).toBe(1);
  });

  test('AI executions are per business counter', async () => {
    const { ctx } = createCounterCtx(299);
    const last = await reserveUsageSlot(ctx, {
      businessId: 'biz_1',
      limitKey: 'maxAiExecutionsPerMonth',
      limitValue: 300,
    });
    const overflow = await reserveUsageSlot(ctx, {
      businessId: 'biz_1',
      limitKey: 'maxAiExecutionsPerMonth',
      limitValue: 300,
    });
    expect(last.reserved).toBe(true);
    expect(overflow.reserved).toBe(false);
  });

  test('observed usage reconciles a stale counter after capacity is released', async () => {
    const { ctx, state } = createCounterCtx(5);
    const reservation = await reserveUsageSlot(ctx, {
      businessId: 'biz_1',
      limitKey: 'maxCampaigns',
      limitValue: 5,
      currentObserved: 4,
    });
    expect(reservation.reserved).toBe(true);
    expect(state.counters[0].activeCampaigns).toBe(5);
  });
});
