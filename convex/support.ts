import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireCurrentUser } from './guards';

const SUPPORT_MESSAGE_MAX_LENGTH = 1200;

function resolveDisplayName(user: Doc<'users'>) {
  const fullName = user.fullName?.trim();
  if (fullName) {
    return fullName;
  }

  const first = user.firstName?.trim() ?? '';
  const last = user.lastName?.trim() ?? '';
  const composed = `${first} ${last}`.trim();
  if (composed) {
    return composed;
  }

  const emailPrefix = user.email?.split('@')[0]?.trim();
  if (emailPrefix) {
    return emailPrefix;
  }

  return 'STAMPAIX User';
}

function normalizeSupportMessage(value: string) {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) {
    throw new Error('MESSAGE_REQUIRED');
  }
  if (normalized.length > SUPPORT_MESSAGE_MAX_LENGTH) {
    throw new Error('MESSAGE_TOO_LONG');
  }
  return normalized;
}

function requireAdmin(user: Doc<'users'>) {
  if (user.isAdmin !== true) {
    throw new Error('NOT_AUTHORIZED');
  }
}

export const sendSupportRequest = mutation({
  args: {
    message: v.string(),
  },
  handler: async (ctx, { message }) => {
    const user = await requireCurrentUser(ctx);
    const normalizedMessage = normalizeSupportMessage(message);
    const timestamp = Date.now();

    const requestId = await ctx.db.insert('supportRequests', {
      userId: user._id,
      name: resolveDisplayName(user),
      email: user.email?.trim() || undefined,
      phone: user.phone?.trim() || undefined,
      message: normalizedMessage,
      status: 'new',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return {
      requestId,
      status: 'new' as const,
      createdAt: timestamp,
    };
  },
});

export const listSupportRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    requireAdmin(user);

    const requests = await ctx.db.query('supportRequests').collect();

    return requests.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const setSupportRequestStatus = mutation({
  args: {
    requestId: v.id('supportRequests'),
    status: v.union(v.literal('new'), v.literal('handled')),
  },
  handler: async (ctx, { requestId, status }) => {
    const user = await requireCurrentUser(ctx);
    requireAdmin(user);

    const request = await ctx.db.get(requestId);
    if (!request) {
      throw new Error('REQUEST_NOT_FOUND');
    }

    await ctx.db.patch(requestId, {
      status,
      updatedAt: Date.now(),
    });

    return requestId;
  },
});
