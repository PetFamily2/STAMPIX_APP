import { expect, test } from 'bun:test';

import { getRecentActivity } from '../events';

function createCtx(events) {
  const tables = {
    users: [
      { _id: 'owner', isActive: true },
      { _id: 'customer', fullName: 'Customer' },
    ],
    businesses: [{ _id: 'biz_1', isActive: true }],
    businessStaff: [
      {
        _id: 'staff_1',
        businessId: 'biz_1',
        userId: 'owner',
        status: 'active',
        staffRole: 'owner',
        isActive: true,
      },
    ],
    loyaltyPrograms: [
      {
        _id: 'program_1',
        title: 'Coffee',
        maxStamps: 10,
        rewardName: 'Coffee reward',
      },
    ],
    events,
  };
  const indexCalls = [];
  let fullCollectCount = 0;
  return {
    auth: {
      getUserIdentity: async () => ({ subject: 'owner|session' }),
    },
    db: {
      get: async (id) =>
        Object.values(tables)
          .flat()
          .find((row) => row._id === id) ?? null,
      query: (table) => {
        let conditions = [];
        let descending = false;
        const q = {
          withIndex: (indexName, build) => {
            const matches = [];
            const eq = {
              eq: (name, value) => {
                matches.push({ name, value });
                return eq;
              },
            };
            if (build) {
              build(eq);
            }
            indexCalls.push({ table, indexName, matches });
            conditions = matches;
            return q;
          },
          order: (direction) => {
            descending = direction === 'desc';
            return q;
          },
          first: async () =>
            (tables[table] ?? []).find((row) =>
              conditions.every((entry) => row[entry.name] === entry.value)
            ) ?? null,
          take: async (limit) => {
            const filtered = (tables[table] ?? []).filter((row) =>
              conditions.every((entry) => row[entry.name] === entry.value)
            );
            return [...filtered]
              .sort((a, b) =>
                descending
                  ? b.createdAt - a.createdAt
                  : a.createdAt - b.createdAt
              )
              .slice(0, limit);
          },
          collect: async () => {
            fullCollectCount += 1;
            return tables[table] ?? [];
          },
        };
        return q;
      },
    },
    indexCalls,
    getFullCollectCount: () => fullCollectCount,
  };
}

test('recent activity merges two timestamp-indexed partitions, excluding old and other-tenant events', async () => {
  const now = Date.now();
  const events = Array.from({ length: 1500 }, (_, i) => ({
    _id: `irrelevant_${i}`,
    type: 'STAMP_UNDONE',
    businessId: 'biz_1',
    createdAt: now + i,
  }));
  events.push(
    {
      _id: 'stamp_latest',
      type: 'STAMP_ADDED',
      businessId: 'biz_1',
      customerUserId: 'customer',
      programId: 'program_1',
      createdAt: now + 500,
    },
    {
      _id: 'reward_next',
      type: 'REWARD_REDEEMED',
      businessId: 'biz_1',
      customerUserId: 'customer',
      programId: 'program_1',
      createdAt: now + 300,
    },
    {
      _id: 'backdated_stamp',
      type: 'STAMP_ADDED',
      businessId: 'biz_1',
      customerUserId: 'customer',
      programId: 'program_1',
      createdAt: now - 500,
    },
    {
      _id: 'other_business',
      type: 'STAMP_ADDED',
      businessId: 'biz_2',
      customerUserId: 'customer',
      programId: 'program_1',
      createdAt: now + 600,
    }
  );
  const ctx = createCtx(events);
  const items = await getRecentActivity._handler(ctx, {
    businessId: 'biz_1',
    limit: 2,
  });
  expect(items.map((item) => item.id)).toEqual(['stamp_latest', 'reward_next']);
  expect(ctx.getFullCollectCount()).toBe(0);
  expect(ctx.indexCalls).toContainEqual({
    table: 'events',
    indexName: 'by_businessId_type_createdAt',
    matches: [
      { name: 'businessId', value: 'biz_1' },
      { name: 'type', value: 'STAMP_ADDED' },
    ],
  });
  expect(ctx.indexCalls).toContainEqual({
    table: 'events',
    indexName: 'by_businessId_type_createdAt',
    matches: [
      { name: 'businessId', value: 'biz_1' },
      { name: 'type', value: 'REWARD_REDEEMED' },
    ],
  });
});
