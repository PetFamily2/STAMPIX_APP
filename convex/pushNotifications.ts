import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireCurrentUser } from './guards';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_DEFAULT_CHANNEL_ID = 'default';

type PushPlatform = 'ios' | 'android';

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: string;
  data?: Record<string, unknown>;
};

export type ExpoPushTicket = {
  status?: string;
  details?: { error?: string };
};

export async function sendExpoPushMessages(messages: ExpoPushMessage[]) {
  if (messages.length === 0) {
    return { ok: true as const, tickets: [] as ExpoPushTicket[] };
  }

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const result = (await response.json().catch(() => null)) as {
      data?: ExpoPushTicket[];
    } | null;

    if (!response.ok || !Array.isArray(result?.data)) {
      return {
        ok: false as const,
        errorMessage: `expo_push_http_${response.status}`,
      };
    }
    return { ok: true as const, tickets: result.data };
  } catch (error) {
    return {
      ok: false as const,
      errorMessage:
        error instanceof Error ? error.message : 'push_delivery_failed',
    };
  }
}

function normalizePushToken(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('PUSH_TOKEN_REQUIRED');
  }
  return normalized;
}

async function upsertPushTokenRecord(
  ctx: any,
  userId: Id<'users'>,
  token: string,
  platform: PushPlatform
) {
  const existing = await ctx.db
    .query('pushTokens')
    .withIndex('by_token', (q: any) => q.eq('token', token))
    .first();
  const now = Date.now();

  if (existing) {
    await ctx.db.patch(existing._id, {
      userId,
      platform,
      isActive: true,
      updatedAt: now,
      lastRegisteredAt: now,
    });
    return existing._id;
  }

  return await ctx.db.insert('pushTokens', {
    userId,
    token,
    platform,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastRegisteredAt: now,
  });
}

async function insertPushLog(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    campaignId?: Id<'campaigns'>;
    toUserId: Id<'users'>;
    token?: string;
    status: string;
    errorMessage?: string;
  }
) {
  await ctx.db.insert('pushDeliveryLog', {
    businessId: args.businessId,
    campaignId: args.campaignId,
    toUserId: args.toUserId,
    token: args.token,
    status: args.status,
    errorMessage: args.errorMessage,
    createdAt: Date.now(),
  });
}

export async function sendPushNotificationToUser(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    toUserId: Id<'users'>;
    title: string;
    body: string;
    campaignId?: Id<'campaigns'>;
  }
) {
  const tokens = await ctx.db
    .query('pushTokens')
    .withIndex('by_userId', (q: any) => q.eq('userId', args.toUserId))
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .collect();

  if (tokens.length === 0) {
    await insertPushLog(ctx, {
      businessId: args.businessId,
      campaignId: args.campaignId,
      toUserId: args.toUserId,
      status: 'skipped_no_push_token',
    });
    return {
      sent: 0,
      failed: 0,
      skipped: 1,
    };
  }

  const payload: ExpoPushMessage[] = tokens.map((tokenRow: any) => ({
    to: tokenRow.token,
    title: args.title,
    body: args.body,
    sound: 'default',
    channelId: EXPO_PUSH_DEFAULT_CHANNEL_ID,
    data: {
      businessId: String(args.businessId),
      campaignId: args.campaignId ? String(args.campaignId) : null,
    },
  }));

  const transportResult = await sendExpoPushMessages(payload);
  if (!transportResult.ok) {
    for (const tokenRow of tokens) {
      await insertPushLog(ctx, {
        businessId: args.businessId,
        campaignId: args.campaignId,
        toUserId: args.toUserId,
        token: tokenRow.token,
        status: 'failed',
        errorMessage: transportResult.errorMessage,
      });
    }
    return {
      sent: 0,
      failed: tokens.length,
      skipped: 0,
    };
  }

  let sent = 0;
  let failed = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const tokenRow = tokens[index];
    const ticket = transportResult.tickets[index];
    const errorCode = ticket?.details?.error;
    const status = ticket?.status === 'ok' ? 'sent' : 'failed';

    if (status === 'sent') {
      sent += 1;
    } else {
      failed += 1;
    }

    await insertPushLog(ctx, {
      businessId: args.businessId,
      campaignId: args.campaignId,
      toUserId: args.toUserId,
      token: tokenRow.token,
      status,
      errorMessage: errorCode,
    });

    if (errorCode === 'DeviceNotRegistered') {
      await ctx.db.patch(tokenRow._id, {
        isActive: false,
        updatedAt: Date.now(),
      });
    }
  }

  return { sent, failed, skipped: 0 };
}

export const registerPushToken = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal('ios'), v.literal('android')),
  },
  handler: async (ctx, { token, platform }) => {
    const user = await requireCurrentUser(ctx);
    const normalizedToken = normalizePushToken(token);
    const pushTokenId = await upsertPushTokenRecord(
      ctx,
      user._id,
      normalizedToken,
      platform
    );

    return {
      ok: true,
      pushTokenId,
    };
  },
});

export const disablePushToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, { token }) => {
    const user = await requireCurrentUser(ctx);
    const normalizedToken = normalizePushToken(token);
    const existing = await ctx.db
      .query('pushTokens')
      .withIndex('by_token', (q: any) => q.eq('token', normalizedToken))
      .first();

    if (!existing || String(existing.userId) !== String(user._id)) {
      return { ok: true };
    }

    await ctx.db.patch(existing._id, {
      isActive: false,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const disableAllMyPushTokens = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const tokens = await ctx.db
      .query('pushTokens')
      .withIndex('by_userId', (q: any) => q.eq('userId', user._id))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    const now = Date.now();
    for (const token of tokens) {
      await ctx.db.patch(token._id, {
        isActive: false,
        updatedAt: now,
      });
    }

    return {
      ok: true,
      disabledCount: tokens.length,
    };
  },
});

export const getMyPushTokenState = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const tokens = await ctx.db
      .query('pushTokens')
      .withIndex('by_userId', (q: any) => q.eq('userId', user._id))
      .collect();

    return {
      activeTokenCount: tokens.filter((token) => token.isActive === true)
        .length,
      tokens: tokens.map((token) => ({
        pushTokenId: token._id,
        platform: token.platform,
        isActive: token.isActive,
        lastRegisteredAt: token.lastRegisteredAt,
      })),
    };
  },
});
