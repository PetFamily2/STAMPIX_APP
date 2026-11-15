import { afterEach, describe, expect, test } from 'bun:test';

import {
  claimQueuedPush,
  disablePushToken,
  expireQueuedPushClaim,
  finishQueuedPush,
  registerPushToken,
  sendPushNotificationToUser,
} from '../pushNotifications';

const USER_ID = 'user_push_1';
const BUSINESS_ID = 'business_push_1';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createMockCtx(initial = {}, authUserId = USER_ID) {
  const tableNames = [
    'users',
    'pushTokens',
    'pushDeliveryLog',
    'pushDeliveryOutbox',
  ];
  const state = Object.fromEntries(
    tableNames.map((tableName) => [
      tableName,
      new Map((initial[tableName] ?? []).map((row) => [row._id, { ...row }])),
    ])
  );

  if (!state.users.has(authUserId)) {
    state.users.set(authUserId, {
      _id: authUserId,
      name: 'Push User',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  const rows = (tableName) => Array.from(state[tableName].values());
  const buildResult = (tableName, indexFilters = [], predicates = []) => {
    const filtered = rows(tableName).filter(
      (row) =>
        indexFilters.every(([field, value]) => row[field] === value) &&
        predicates.every((predicate) => predicate(row))
    );

    return {
      filter: (buildFilter) => {
        const q = {
          field: (field) => field,
          eq: (field, value) => (row) => row[field] === value,
        };
        const predicate = buildFilter(q);
        return buildResult(
          tableName,
          indexFilters,
          typeof predicate === 'function'
            ? [...predicates, predicate]
            : predicates
        );
      },
      collect: async () => filtered,
      first: async () => filtered[0] ?? null,
    };
  };

  return {
    db: {
      get: async (id) => {
        for (const tableName of tableNames) {
          const row = state[tableName].get(id);
          if (row) {
            return row;
          }
        }
        return null;
      },
      insert: async (tableName, doc) => {
        const id = doc._id ?? `${tableName}_${state[tableName].size + 1}`;
        state[tableName].set(id, { _id: id, ...doc });
        return id;
      },
      patch: async (id, patch) => {
        for (const tableName of tableNames) {
          const row = state[tableName].get(id);
          if (row) {
            state[tableName].set(id, { ...row, ...patch });
            return;
          }
        }
        throw new Error(`UNKNOWN_PATCH_TARGET:${id}`);
      },
      query: (tableName) => ({
        withIndex: (_indexName, buildIndex) => {
          const indexFilters = [];
          const q = {
            eq(field, value) {
              indexFilters.push([field, value]);
              return q;
            },
          };
          buildIndex(q);
          return buildResult(tableName, indexFilters);
        },
        collect: async () => rows(tableName),
        first: async () => rows(tableName)[0] ?? null,
      }),
    },
    auth: {
      getUserIdentity: async () => ({
        subject: `${authUserId}|session_push_1`,
      }),
    },
    rows,
    scheduled: [],
    scheduler: {
      runAfter: async () => {},
    },
  };
}

function buildPushToken(overrides = {}) {
  const now = Date.now();
  return {
    _id: 'push_token_1',
    userId: USER_ID,
    token: 'ExponentPushToken[test-token]',
    platform: 'ios',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastRegisteredAt: now,
    ...overrides,
  };
}

describe('push token registration', () => {
  test('registers the authenticated user token without client-side delivery side effects', async () => {
    const ctx = createMockCtx();

    const result = await registerPushToken._handler(ctx, {
      token: '  ExponentPushToken[new-token]  ',
      platform: 'android',
    });

    expect(result.ok).toBeTrue();
    expect(ctx.rows('pushTokens')).toHaveLength(1);
    expect(ctx.rows('pushTokens')[0]).toMatchObject({
      userId: USER_ID,
      token: 'ExponentPushToken[new-token]',
      platform: 'android',
      isActive: true,
    });
    expect(ctx.rows('pushDeliveryLog')).toHaveLength(0);
  });

  test('disables only the authenticated user token', async () => {
    const ctx = createMockCtx({
      pushTokens: [
        buildPushToken(),
        buildPushToken({
          _id: 'push_token_other',
          userId: 'user_other',
          token: 'ExponentPushToken[other-token]',
        }),
      ],
    });

    await disablePushToken._handler(ctx, {
      token: 'ExponentPushToken[test-token]',
    });
    await disablePushToken._handler(ctx, {
      token: 'ExponentPushToken[other-token]',
    });

    expect(ctx.rows('pushTokens')).toContainEqual(
      expect.objectContaining({
        token: 'ExponentPushToken[test-token]',
        isActive: false,
      })
    );
    expect(ctx.rows('pushTokens')).toContainEqual(
      expect.objectContaining({
        token: 'ExponentPushToken[other-token]',
        isActive: true,
      })
    );
  });
});

describe('transactional push outbox', () => {
  test('enqueue does not contact an external provider during a mutation', async () => {
    const ctx = createMockCtx({ pushTokens: [buildPushToken()] });
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error('transport must not run in a mutation');
    };
    const first = await sendPushNotificationToUser(ctx, {
      businessId: BUSINESS_ID,
      toUserId: USER_ID,
      campaignId: 'campaign_1',
      title: 'Campaign',
      body: 'Hello',
    });
    const again = await sendPushNotificationToUser(ctx, {
      businessId: BUSINESS_ID,
      toUserId: USER_ID,
      campaignId: 'campaign_1',
      title: 'Campaign',
      body: 'Hello',
    });
    expect(first.queued).toBeTrue();
    expect(again.queued).toBeFalse();
    expect(calls).toBe(0);
    expect(ctx.rows('pushDeliveryOutbox')).toHaveLength(1);
    expect(ctx.rows('pushDeliveryLog')).toHaveLength(0);
  });

  test('a claimed message cannot be claimed or sent twice', async () => {
    const ctx = createMockCtx({ pushTokens: [buildPushToken()] });
    await sendPushNotificationToUser(ctx, {
      businessId: BUSINESS_ID,
      toUserId: USER_ID,
      title: 'Campaign',
      body: 'Hello',
    });
    const outboxId = ctx.rows('pushDeliveryOutbox')[0]._id;
    const first = await claimQueuedPush._handler(ctx, { outboxId });
    expect(first.tokens).toHaveLength(1);
    expect(await claimQueuedPush._handler(ctx, { outboxId })).toBeNull();
    const written = await finishQueuedPush._handler(ctx, {
      outboxId,
      status: 'sent',
      deliveries: [
        {
          pushTokenId: 'push_token_1',
          token: 'ExponentPushToken[test-token]',
          status: 'sent',
        },
      ],
    });
    expect(written).toBeTrue();
    expect(await claimQueuedPush._handler(ctx, { outboxId })).toBeNull();
    expect(ctx.rows('pushDeliveryLog')).toHaveLength(1);
  });

  test('separate recurring runs deliver distinct intents while a replay is deduplicated', async () => {
    const ctx = createMockCtx({ pushTokens: [buildPushToken()] });
    const args = {
      businessId: BUSINESS_ID,
      campaignId: 'campaign_1',
      toUserId: USER_ID,
      title: 'Recurring campaign',
      body: 'Hello again',
    };
    expect(
      (await sendPushNotificationToUser(ctx, {
        ...args,
        dedupeKey: 'campaign_automation:campaign_1:run_1',
      })).queued
    ).toBe(true);
    expect(
      (await sendPushNotificationToUser(ctx, {
        ...args,
        dedupeKey: 'campaign_automation:campaign_1:run_1',
      })).queued
    ).toBe(false);
    expect(
      (await sendPushNotificationToUser(ctx, {
        ...args,
        dedupeKey: 'campaign_automation:campaign_1:run_2',
      })).queued
    ).toBe(true);
    expect(ctx.rows('pushDeliveryOutbox')).toHaveLength(2);
  });

  test('stale claimed delivery is terminal unknown, never re-queued', async () => {
    const ctx = createMockCtx({ pushTokens: [buildPushToken()] });
    await sendPushNotificationToUser(ctx, {
      businessId: BUSINESS_ID,
      toUserId: USER_ID,
      title: 'Reward',
      body: 'Hello',
    });
    const job = ctx.rows('pushDeliveryOutbox')[0];
    await claimQueuedPush._handler(ctx, { outboxId: job._id });
    await ctx.db.patch(job._id, { claimedAt: Date.now() - 16 * 60 * 1000 });
    expect(
      await expireQueuedPushClaim._handler(ctx, {
        outboxId: job._id,
      })
    ).toBeTrue();
    expect(ctx.rows('pushDeliveryOutbox')[0].status).toBe('unknown');
    expect(
      await claimQueuedPush._handler(ctx, { outboxId: job._id })
    ).toBeNull();
  });

  test('no active token produces an outbox record, not an HTTP call', async () => {
    const ctx = createMockCtx({
      pushTokens: [buildPushToken({ isActive: false })],
    });
    await sendPushNotificationToUser(ctx, {
      businessId: BUSINESS_ID,
      toUserId: USER_ID,
      title: 'Reward',
      body: 'Hello',
    });
    const job = ctx.rows('pushDeliveryOutbox')[0];
    const claim = await claimQueuedPush._handler(ctx, { outboxId: job._id });
    expect(claim.tokens).toHaveLength(0);
    await finishQueuedPush._handler(ctx, {
      outboxId: job._id,
      status: 'skipped',
      deliveries: [],
    });
    expect(ctx.rows('pushDeliveryLog')[0].status).toBe('skipped_no_push_token');
  });
});
