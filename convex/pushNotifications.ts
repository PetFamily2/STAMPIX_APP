import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from './_generated/server';
import { requireCurrentUser } from './guards';
import { scheduleWebPush, webPushDeliveryConfigured } from './webPush';

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
  id?: string;
  details?: { error?: string };
};

export type ExpoPushFailureKind =
  | 'http_rejected'
  | 'transport_ambiguous'
  | 'malformed_response';

export type ExpoPushTransportResult =
  | { ok: true; tickets: ExpoPushTicket[] }
  | {
      ok: false;
      errorMessage: string;
      failureKind: 'http_rejected';
      statusCode: number;
    }
  | {
      ok: false;
      errorMessage: string;
      failureKind: 'transport_ambiguous' | 'malformed_response';
    };

export async function sendExpoPushMessages(
  messages: ExpoPushMessage[]
): Promise<ExpoPushTransportResult> {
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

    if (!response.ok) {
      return {
        ok: false as const,
        errorMessage: `expo_push_http_${response.status}`,
        failureKind: 'http_rejected' as const,
        statusCode: response.status,
      };
    }
    if (!Array.isArray(result?.data)) {
      return {
        ok: false as const,
        errorMessage: 'expo_push_malformed_response',
        failureKind: 'malformed_response' as const,
      };
    }
    return { ok: true as const, tickets: result.data };
  } catch {
    return {
      ok: false as const,
      errorMessage: 'expo_push_transport_ambiguous',
      failureKind: 'transport_ambiguous' as const,
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

// Enqueue with the business mutation. External HTTP is NEVER attempted in
// that mutation. A claimed delivery gets at most one Expo API attempt;
// unknown provider outcomes are terminal until manually reconciled.
const PUSH_CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
const PUSH_OUTBOX_RECOVERY_PAGE_SIZE = 25;

type PushOutboxClaim = {
  businessId: Id<'businesses'>;
  campaignId?: Id<'campaigns'>;
  toUserId: Id<'users'>;
  title: string;
  body: string;
  tokens: Array<{ pushTokenId: Id<'pushTokens'>; token: string }>;
};
type PushOutboxDeliveryResult = {
  pushTokenId: Id<'pushTokens'>;
  token: string;
  status: 'sent' | 'failed' | 'unknown';
  errorMessage?: string;
};
const deliverQueuedPushRef = makeFunctionReference<'action'>(
  'pushNotifications:deliverQueuedPush'
);
const claimQueuedPushRef = makeFunctionReference<'mutation'>(
  'pushNotifications:claimQueuedPush'
);
const expireQueuedPushClaimRef = makeFunctionReference<'mutation'>(
  'pushNotifications:expireQueuedPushClaim'
);
const finishQueuedPushRef = makeFunctionReference<'mutation'>(
  'pushNotifications:finishQueuedPush'
);

export async function sendPushNotificationToUser(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    toUserId: Id<'users'>;
    title: string;
    body: string;
    campaignId?: Id<'campaigns'>;
    dedupeKey?: string;
  }
) {
  const deliveryKey = args.dedupeKey
    ? `event:${args.toUserId}:${args.dedupeKey}`
    : args.campaignId
      ? `campaign:${args.campaignId}:${args.toUserId}`
      : undefined;
  if (deliveryKey) {
    const previous = await ctx.db
      .query('pushDeliveryOutbox')
      .withIndex('by_deliveryKey', (q: any) => q.eq('deliveryKey', deliveryKey))
      .first();
    if (previous) return { queued: false };
  }
  const now = Date.now();
  const outboxId = await ctx.db.insert('pushDeliveryOutbox', {
    businessId: args.businessId,
    campaignId: args.campaignId,
    toUserId: args.toUserId,
    deliveryKey,
    title: args.title,
    body: args.body,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, deliverQueuedPushRef, {
    outboxId,
  });
  await scheduleWebPush(ctx, args.toUserId, outboxId);
  return { queued: true };
}

export const claimQueuedPush = internalMutation({
  args: { outboxId: v.id('pushDeliveryOutbox') },
  handler: async (ctx, { outboxId }) => {
    const job = await ctx.db.get(outboxId);
    if (!job || job.status !== 'pending') return null;
    const tokens = await ctx.db
      .query('pushTokens')
      .withIndex('by_userId', (q) => q.eq('userId', job.toUserId))
      .filter((q) => q.eq(q.field('isActive'), true))
      .collect();
    const now = Date.now();
    await ctx.db.patch(outboxId, {
      status: 'sending',
      claimedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      PUSH_CLAIM_TIMEOUT_MS,
      expireQueuedPushClaimRef,
      { outboxId }
    );
    return {
      businessId: job.businessId,
      campaignId: job.campaignId,
      toUserId: job.toUserId,
      title: job.title,
      body: job.body,
      tokens: tokens.map((token) => ({
        pushTokenId: token._id,
        token: token.token,
      })),
    };
  },
});

export const expireQueuedPushClaim = internalMutation({
  args: { outboxId: v.id('pushDeliveryOutbox') },
  handler: async (ctx, { outboxId }) => {
    const job = await ctx.db.get(outboxId);
    if (
      job?.status !== 'sending' ||
      typeof job.claimedAt !== 'number' ||
      job.claimedAt > Date.now() - PUSH_CLAIM_TIMEOUT_MS
    )
      return false;
    await ctx.db.patch(outboxId, {
      status: 'unknown',
      outcome: 'claim_expired_after_possible_send',
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return true;
  },
});

const outboxDeliveryResultValidator = v.object({
  pushTokenId: v.id('pushTokens'),
  token: v.string(),
  status: v.union(v.literal('sent'), v.literal('failed'), v.literal('unknown')),
  errorMessage: v.optional(v.string()),
});

export const finishQueuedPush = internalMutation({
  args: {
    outboxId: v.id('pushDeliveryOutbox'),
    status: v.union(
      v.literal('sent'),
      v.literal('failed'),
      v.literal('unknown'),
      v.literal('skipped')
    ),
    outcome: v.optional(v.string()),
    deliveries: v.array(outboxDeliveryResultValidator),
  },
  handler: async (ctx, { outboxId, status, outcome, deliveries }) => {
    const job = await ctx.db.get(outboxId);
    if (!job || job.status !== 'sending') return false;
    const now = Date.now();
    await ctx.db.patch(outboxId, {
      status,
      outcome,
      completedAt: now,
      updatedAt: now,
    });
    if (deliveries.length === 0) {
      await insertPushLog(ctx, {
        businessId: job.businessId,
        campaignId: job.campaignId,
        toUserId: job.toUserId,
        status: 'skipped_no_push_token',
      });
    }
    for (const entry of deliveries) {
      await insertPushLog(ctx, {
        businessId: job.businessId,
        campaignId: job.campaignId,
        toUserId: job.toUserId,
        token: entry.token,
        status: entry.status,
        errorMessage: entry.errorMessage,
      });
      if (entry.errorMessage === 'DeviceNotRegistered') {
        const token = await ctx.db.get(entry.pushTokenId);
        if (token?.token === entry.token && token.isActive === true) {
          await ctx.db.patch(token._id, {
            isActive: false,
            updatedAt: now,
          });
        }
      }
    }
    return true;
  },
});

export const deliverQueuedPush = internalAction({
  args: { outboxId: v.id('pushDeliveryOutbox') },
  handler: async (ctx, { outboxId }) => {
    const claim = (await ctx.runMutation(claimQueuedPushRef, {
      outboxId,
    })) as PushOutboxClaim | null;
    if (!claim) return { status: 'already_claimed_or_finished' };
    if (claim.tokens.length === 0) {
      await ctx.runMutation(finishQueuedPushRef, {
        outboxId,
        status: 'skipped',
        deliveries: [],
      });
      return { status: 'skipped' };
    }
    const response = await sendExpoPushMessages(
      claim.tokens.map((target) => ({
        to: target.token,
        title: claim.title,
        body: claim.body,
        sound: 'default' as const,
        channelId: EXPO_PUSH_DEFAULT_CHANNEL_ID,
        data: {
          businessId: String(claim.businessId),
          campaignId: claim.campaignId ? String(claim.campaignId) : null,
        },
      }))
    );
    const deliveries: PushOutboxDeliveryResult[] = claim.tokens.map(
      (target, index) => {
        if (!response.ok) {
          return {
            ...target,
            status: 'unknown' as const,
            errorMessage: response.errorMessage,
          };
        }
        if (response.tickets.length !== claim.tokens.length) {
          return {
            ...target,
            status: 'unknown' as const,
            errorMessage: 'expo_push_ticket_count_mismatch',
          };
        }
        const ticket = response.tickets[index];
        const sent = ticket?.status === 'ok';
        return {
          ...target,
          status: sent ? ('sent' as const) : ('failed' as const),
          errorMessage: sent
            ? undefined
            : (ticket?.details?.error ?? 'expo_push_ticket_rejected'),
        };
      }
    );
    const ambiguous = deliveries.some((entry) => entry.status === 'unknown');
    const status: 'sent' | 'failed' | 'unknown' = ambiguous
      ? ('unknown' as const)
      : deliveries.some((entry) => entry.status === 'sent')
        ? ('sent' as const)
        : ('failed' as const);
    await ctx.runMutation(finishQueuedPushRef, {
      outboxId,
      status,
      outcome: ambiguous ? 'provider_result_uncertain' : undefined,
      deliveries,
    });
    return { status };
  },
});

// Recover only unsent pending jobs; a stale claimed job may ALREADY have
// reached Expo, and is marked unknown, never automatically sent again.
export const recoverPendingPushOutbox = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query('pushDeliveryOutbox')
      .withIndex('by_status_createdAt', (q) => q.eq('status', 'pending'))
      .take(PUSH_OUTBOX_RECOVERY_PAGE_SIZE);
    for (const job of pending) {
      await ctx.scheduler.runAfter(0, deliverQueuedPushRef, {
        outboxId: job._id,
      });
    }
    const stale = await ctx.db
      .query('pushDeliveryOutbox')
      .withIndex('by_status_claimedAt', (q) =>
        q
          .eq('status', 'sending')
          .lte('claimedAt', Date.now() - PUSH_CLAIM_TIMEOUT_MS)
      )
      .take(PUSH_OUTBOX_RECOVERY_PAGE_SIZE);
    for (const job of stale) {
      await ctx.db.patch(job._id, {
        status: 'unknown',
        outcome: 'claim_expired_after_possible_send',
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    const webPending = webPushDeliveryConfigured()
      ? await ctx.db
          .query('pushDeliveryOutbox')
          .withIndex('by_web_status_createdAt', (q) =>
            q.eq('webDeliveryStatus', 'pending')
          )
          .take(PUSH_OUTBOX_RECOVERY_PAGE_SIZE)
      : [];
    for (const job of webPending) {
      await ctx.scheduler.runAfter(
        0,
        makeFunctionReference<'action'>('webPushDelivery:send'),
        { userId: job.toUserId, outboxId: job._id }
      );
    }
    const webStale = await ctx.db
      .query('pushDeliveryOutbox')
      .withIndex('by_web_status_claimedAt', (q) =>
        q
          .eq('webDeliveryStatus', 'sending')
          .lte('webClaimedAt', Date.now() - PUSH_CLAIM_TIMEOUT_MS)
      )
      .take(PUSH_OUTBOX_RECOVERY_PAGE_SIZE);
    for (const job of webStale)
      await ctx.db.patch(job._id, { webDeliveryStatus: 'unknown' });
    return {
      scheduled: pending.length,
      unknown: stale.length,
      webScheduled: webPending.length,
      webUnknown: webStale.length,
    };
  },
});

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
