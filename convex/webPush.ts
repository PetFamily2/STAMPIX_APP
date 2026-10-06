import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { requireCurrentUser } from './guards';

export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      value.length <= 2048 &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      (url.hostname === 'fcm.googleapis.com' ||
        url.hostname === 'updates.push.services.mozilla.com' ||
        url.hostname.endsWith('.push.apple.com'))
    );
  } catch {
    return false;
  }
}
const fingerprint = (value: string) =>
  bytesToHex(sha256(new TextEncoder().encode(value)));
export const enabled = () =>
  process.env.WEB_PUSH_ENABLED === 'true' &&
  process.env.STAMPAIX_ENV === 'preview';
export const configuration = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    publicKey: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const configured =
      !!publicKey &&
      !!process.env.WEB_PUSH_VAPID_PRIVATE_KEY &&
      !!process.env.WEB_PUSH_VAPID_SUBJECT;
    return {
      enabled: user.isActive === true && enabled() && configured,
      publicKey:
        user.isActive === true && enabled() && configured ? publicKey! : null,
    };
  },
});
export const subscribe = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    if (user.isActive !== true || !enabled())
      throw new Error('WEB_PUSH_DISABLED');
    if (
      !allowedPushEndpoint(args.endpoint) ||
      !/^[A-Za-z0-9_-]{87}=?$/.test(args.p256dh) ||
      !/^[A-Za-z0-9_-]{22}={0,2}$/.test(args.auth)
    )
      throw new Error('INVALID_PUSH_SUBSCRIPTION');
    const endpointHash = fingerprint(args.endpoint);
    const existing = await ctx.db
      .query('webPushSubscriptions')
      .withIndex('by_endpointHash', (q) => q.eq('endpointHash', endpointHash))
      .unique();
    if (existing && existing.userId !== user._id)
      throw new Error('PUSH_SUBSCRIPTION_SCOPE_MISMATCH');
    if (!existing) {
      const owned = await ctx.db
        .query('webPushSubscriptions')
        .withIndex('by_user_active', (q) =>
          q.eq('userId', user._id).eq('active', true)
        )
        .take(10);
      if (owned.length >= 10) throw new Error('PUSH_SUBSCRIPTION_LIMIT');
    }
    const value = {
      userId: user._id,
      endpointHash,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      active: true,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, value);
    else
      await ctx.db.insert('webPushSubscriptions', {
        ...value,
        createdAt: Date.now(),
      });
    return null;
  },
});
export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const row = await ctx.db
      .query('webPushSubscriptions')
      .withIndex('by_endpointHash', (q) =>
        q.eq('endpointHash', fingerprint(args.endpoint))
      )
      .unique();
    if (row?.userId === user._id) await ctx.db.delete(row._id);
    return null;
  },
});
export const deliveryTargets = internalQuery({
  args: { userId: v.id('users') },
  returns: v.array(
    v.object({
      id: v.id('webPushSubscriptions'),
      endpoint: v.string(),
      p256dh: v.string(),
      auth: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user?.isActive !== true || !enabled()) return [];
    const rows = await ctx.db
      .query('webPushSubscriptions')
      .withIndex('by_user_active', (q) =>
        q.eq('userId', args.userId).eq('active', true)
      )
      .take(10);
    return rows.map((row) => ({
      id: row._id,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
    }));
  },
});
export const retire = internalMutation({
  args: { id: v.id('webPushSubscriptions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});
export async function scheduleWebPush(ctx: any, userId: string) {
  if (!enabled()) return;
  await ctx.scheduler.runAfter(
    0,
    makeFunctionReference<'action'>('webPushDelivery:send'),
    { userId }
  );
}
