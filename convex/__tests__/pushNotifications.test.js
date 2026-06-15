import { afterEach, describe, expect, test } from 'bun:test';

import {
  disablePushToken,
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
  const tableNames = ['users', 'pushTokens', 'pushDeliveryLog'];
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

describe('push delivery logging', () => {
  test('skips delivery and logs when the user has no active token', async () => {
    const ctx = createMockCtx({
      pushTokens: [buildPushToken({ isActive: false })],
    });

    const result = await sendPushNotificationToUser(ctx, {
      businessId: BUSINESS_ID,
      toUserId: USER_ID,
      title: 'Reward',
      body: 'You have a new reward',
    });

    expect(result).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(ctx.rows('pushDeliveryLog')[0]).toMatchObject({
      businessId: BUSINESS_ID,
      toUserId: USER_ID,
      status: 'skipped_no_push_token',
    });
  });

  test('logs Expo HTTP failures without deactivating the token', async () => {
    const ctx = createMockCtx({
      pushTokens: [buildPushToken()],
    });
    let sentPayload = null;
    globalThis.fetch = async (_url, init) => {
      sentPayload = JSON.parse(init.body);
      return new Response(JSON.stringify({ errors: ['temporary'] }), {
        status: 500,
      });
    };

    const result = await sendPushNotificationToUser(ctx, {
      businessId: BUSINESS_ID,
      toUserId: USER_ID,
      title: 'Reward',
      body: 'You have a new reward',
    });

    expect(result).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(sentPayload).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[test-token]',
        channelId: 'default',
      }),
    ]);
    expect(ctx.rows('pushDeliveryLog')[0]).toMatchObject({
      token: 'ExponentPushToken[test-token]',
      status: 'failed',
      errorMessage: 'expo_push_http_500',
    });
    expect(ctx.rows('pushTokens')[0].isActive).toBeTrue();
  });

  test('deactivates tokens rejected as DeviceNotRegistered', async () => {
    const ctx = createMockCtx({
      pushTokens: [buildPushToken()],
    });
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              status: 'error',
              details: { error: 'DeviceNotRegistered' },
            },
          ],
        }),
        { status: 200 }
      );

    const result = await sendPushNotificationToUser(ctx, {
      businessId: BUSINESS_ID,
      toUserId: USER_ID,
      title: 'Reward',
      body: 'You have a new reward',
    });

    expect(result).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(ctx.rows('pushDeliveryLog')[0]).toMatchObject({
      token: 'ExponentPushToken[test-token]',
      status: 'failed',
      errorMessage: 'DeviceNotRegistered',
    });
    expect(ctx.rows('pushTokens')[0].isActive).toBeFalse();
  });
});
