'use node';
import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import webpush from 'web-push';
import { productionWebEnabled } from '../lib/pwa/releaseGate';
import type { Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';

/** Internal Node action; private VAPID key never reaches the browser bundle. */
export const send = internalAction({
  args: {
    userId: v.id('users'),
    outboxId: v.optional(v.id('pushDeliveryOutbox')),
  },
  returns: v.object({ sent: v.number(), failed: v.number() }),
  handler: async (ctx, args) => {
    if (
      process.env.WEB_PUSH_ENABLED !== 'true' ||
      !(
        process.env.STAMPAIX_ENV === 'preview' ||
        productionWebEnabled(
          process.env.STAMPAIX_ENV,
          process.env.PWA_RELEASE_GATE
        )
      )
    ) {
      return { sent: 0, failed: 0 };
    }
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
      privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
      subject = process.env.WEB_PUSH_VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) {
      return { sent: 0, failed: 0 };
    }
    // Legacy tasks created before this change do not carry an outbox ID.
    // New tasks must atomically claim their exact intent before network I/O.
    if (args.outboxId) {
      const claimed = await ctx.runMutation(
        makeFunctionReference<'mutation'>('webPush:claimWebDelivery'),
        { outboxId: args.outboxId, userId: args.userId }
      );
      if (!claimed) return { sent: 0, failed: 0 };
    }
    const finish = async (
      status: 'sent' | 'failed' | 'unknown' | 'skipped'
    ) => {
      if (args.outboxId)
        await ctx.runMutation(
          makeFunctionReference<'mutation'>('webPush:finishWebDelivery'),
          { outboxId: args.outboxId, status }
        );
    };
    const targets: Array<{
      id: Id<'webPushSubscriptions'>;
      endpoint: string;
      p256dh: string;
      auth: string;
    }> = await ctx.runQuery(
      makeFunctionReference<'query'>('webPush:deliveryTargets'),
      { userId: args.userId }
    );
    let sent = 0,
      failed = 0,
      ambiguous = false;
    for (const target of targets) {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          JSON.stringify({ href: '/inbox', tag: 'stampaix-inbox' }),
          {
            vapidDetails: { publicKey, privateKey, subject },
            contentEncoding: 'aes128gcm',
            TTL: 300,
            timeout: 10000,
          }
        );
        sent++;
      } catch (error) {
        failed++;
        const status = (error as { statusCode?: number }).statusCode;
        if (status !== 404 && status !== 410) ambiguous = true;
        if (status === 404 || status === 410)
          await ctx.runMutation(
            makeFunctionReference<'mutation'>('webPush:retire'),
            { id: target.id }
          );
        // Never log subscription, payload, keys, provider body or raw error.
      }
    }
    await finish(
      ambiguous
        ? 'unknown'
        : sent > 0
          ? 'sent'
          : failed > 0
            ? 'failed'
            : 'skipped'
    );
    return { sent, failed };
  },
});
