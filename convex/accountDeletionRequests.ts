import {
  DAY,
  isRateLimitError,
  MINUTE,
  RateLimiter,
  type RateLimitReturns,
} from '@convex-dev/rate-limiter';
import { ConvexError, v } from 'convex/values';

import { components } from './_generated/api';
import {
  internalMutation,
  mutation,
  query,
} from './_generated/server';
import { requireCurrentUser } from './guards';
import { normalizeEmailAddress } from './lib/email';

const ACCOUNT_DELETION_REFERENCE_PATTERN = /^ADR-[A-Za-z0-9_-]{16,64}$/;
const EMAIL_LOCAL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const EMAIL_DOMAIN_PATTERN =
  /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const MAX_EMAIL_LENGTH = 254;
const HANDLED_RETENTION_MS = 30 * DAY;
export const ACCOUNT_DELETION_CLEANUP_BATCH_SIZE = 50;
const ADMIN_LIST_PER_STATUS_LIMIT = 100;
export const ACCOUNT_DELETION_EMAIL_RATE_LIMIT_NAME =
  'accountDeletionRequestEmailDailyV1' as const;

export const ACCOUNT_DELETION_RATE_LIMIT_DEFINITIONS = {
  [ACCOUNT_DELETION_EMAIL_RATE_LIMIT_NAME]: {
    kind: 'fixed window',
    rate: 3,
    period: DAY,
  },
  accountDeletionRequestGlobalHourlyV1: {
    kind: 'fixed window',
    rate: 100,
    period: 60 * MINUTE,
    shards: 5,
  },
} as const;

type AccountDeletionLimitName =
  keyof typeof ACCOUNT_DELETION_RATE_LIMIT_DEFINITIONS;

type LimiterLike = {
  limit: (
    ctx: any,
    name: AccountDeletionLimitName,
    options: {
      key?: string;
      reserve: false;
      throws: true;
    }
  ) => Promise<RateLimitReturns>;
};

type ResetLimiterLike = {
  reset: (
    ctx: any,
    name: typeof ACCOUNT_DELETION_EMAIL_RATE_LIMIT_NAME,
    args: { key: string }
  ) => Promise<void>;
};

const rateLimiter = new RateLimiter(
  components.rateLimiter,
  ACCOUNT_DELETION_RATE_LIMIT_DEFINITIONS
);

function getErrorData(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as {
    data?: unknown;
    cause?: { data?: unknown };
  };
  const data = candidate.data ?? candidate.cause?.data;
  return data && typeof data === 'object'
    ? (data as Record<string, unknown>)
    : null;
}

export function isAccountDeletionRateLimitError(error: unknown) {
  if (isRateLimitError(error)) {
    return true;
  }
  return getErrorData(error)?.code === 'ACCOUNT_DELETION_REQUEST_RATE_LIMITED';
}

export function normalizeAccountDeletionEmail(value: string) {
  const email = normalizeEmailAddress(value);
  const parts = email?.split('@') ?? [];
  const [localPart, domainPart] = parts;
  if (
    !email ||
    parts.length !== 2 ||
    !localPart ||
    !domainPart ||
    email.length > MAX_EMAIL_LENGTH ||
    localPart.length > 64 ||
    localPart.startsWith('.') ||
    localPart.endsWith('.') ||
    localPart.includes('..') ||
    !EMAIL_LOCAL_PATTERN.test(localPart) ||
    !EMAIL_DOMAIN_PATTERN.test(domainPart)
  ) {
    throw new Error('INVALID_EMAIL');
  }
  return email;
}

export async function resetAccountDeletionEmailRateLimit(
  ctx: any,
  email: string,
  limiter: ResetLimiterLike = rateLimiter as ResetLimiterLike
) {
  const normalizedEmail = normalizeAccountDeletionEmail(email);
  try {
    await limiter.reset(ctx, ACCOUNT_DELETION_EMAIL_RATE_LIMIT_NAME, {
      key: normalizedEmail,
    });
  } catch {
    throw new Error('ACCOUNT_DELETION_EMAIL_RATE_LIMIT_RESET_FAILED');
  }
}

async function consumeRateLimit(
  ctx: any,
  limiter: LimiterLike,
  name: AccountDeletionLimitName,
  key?: string
) {
  const status = await limiter.limit(ctx, name, {
    ...(key ? { key } : {}),
    reserve: false,
    throws: true,
  });
  if (!status.ok) {
    throw new ConvexError({
      code: 'ACCOUNT_DELETION_REQUEST_RATE_LIMITED' as const,
    });
  }
}

export async function submitAccountDeletionRequestImpl(
  ctx: any,
  args: { email: string; requestReference: string },
  limiter: LimiterLike = rateLimiter as LimiterLike
) {
  const email = normalizeAccountDeletionEmail(args.email);
  if (!ACCOUNT_DELETION_REFERENCE_PATTERN.test(args.requestReference)) {
    throw new Error('INVALID_REQUEST_REFERENCE');
  }

  try {
    await consumeRateLimit(
      ctx,
      limiter,
      ACCOUNT_DELETION_EMAIL_RATE_LIMIT_NAME,
      email
    );
    await consumeRateLimit(
      ctx,
      limiter,
      'accountDeletionRequestGlobalHourlyV1'
    );
  } catch (error) {
    if (isAccountDeletionRateLimitError(error)) {
      throw new ConvexError({
        code: 'ACCOUNT_DELETION_REQUEST_RATE_LIMITED' as const,
      });
    }
    throw error;
  }

  const timestamp = Date.now();
  const requestId = await ctx.db.insert('accountDeletionRequests', {
    email,
    status: 'new',
    source: 'google_play_web',
    requestReference: args.requestReference,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return { requestId, requestReference: args.requestReference };
}

export const submitExternalRequestInternal = internalMutation({
  args: {
    email: v.string(),
    requestReference: v.string(),
  },
  handler: submitAccountDeletionRequestImpl,
});

async function requireAdmin(ctx: any) {
  const user = await requireCurrentUser(ctx);
  if (user.isAdmin !== true) {
    throw new Error('NOT_AUTHORIZED');
  }
  return user;
}

export async function listAccountDeletionRequestsImpl(ctx: any) {
  await requireAdmin(ctx);

  const statuses = ['new', 'in_review', 'handled'] as const;
  const batches = await Promise.all(
    statuses.map((status) =>
      ctx.db
        .query('accountDeletionRequests')
        .withIndex('by_status_createdAt', (q: any) => q.eq('status', status))
        .order('desc')
        .take(ADMIN_LIST_PER_STATUS_LIMIT)
    )
  );

  return batches
    .flat()
    .sort((a: any, b: any) => b.createdAt - a.createdAt)
    .slice(0, ADMIN_LIST_PER_STATUS_LIMIT * 2);
}

export const list = query({
  args: {},
  handler: listAccountDeletionRequestsImpl,
});

export async function setAccountDeletionRequestStatusImpl(
  ctx: any,
  args: {
    requestId: any;
    status: 'in_review' | 'handled';
  },
  now = Date.now()
) {
  await requireAdmin(ctx);
  const request = await ctx.db.get(args.requestId);
  if (!request) {
    throw new Error('REQUEST_NOT_FOUND');
  }

  await ctx.db.patch(args.requestId, {
    status: args.status,
    updatedAt: now,
    handledAt: args.status === 'handled' ? now : undefined,
    purgeAfter: args.status === 'handled' ? now + HANDLED_RETENTION_MS : undefined,
  });

  return args.requestId;
}

export const setStatus = mutation({
  args: {
    requestId: v.id('accountDeletionRequests'),
    status: v.union(v.literal('in_review'), v.literal('handled')),
  },
  handler: setAccountDeletionRequestStatusImpl,
});

export async function purgeExpiredHandledRequestsImpl(
  ctx: any,
  now = Date.now(),
  resetEmailRateLimit: (
    ctx: any,
    email: string
  ) => Promise<void> = resetAccountDeletionEmailRateLimit
) {
  const candidates = await ctx.db
    .query('accountDeletionRequests')
    .withIndex('by_purgeAfter', (q: any) =>
      q.gte('purgeAfter', 0).lte('purgeAfter', now)
    )
    .take(ACCOUNT_DELETION_CLEANUP_BATCH_SIZE);

  let deleted = 0;
  const affectedEmails = new Set<string>();
  for (const request of candidates) {
    if (
      request.status === 'handled' &&
      typeof request.purgeAfter === 'number' &&
      request.purgeAfter <= now
    ) {
      await ctx.db.delete(request._id);
      affectedEmails.add(normalizeAccountDeletionEmail(request.email));
      deleted += 1;
    }
  }

  let resetEmailLimits = 0;
  for (const email of affectedEmails) {
    const survivingRequest = await ctx.db
      .query('accountDeletionRequests')
      .withIndex('by_email', (q: any) => q.eq('email', email))
      .first();
    if (!survivingRequest) {
      try {
        await resetEmailRateLimit(ctx, email);
        resetEmailLimits += 1;
      } catch {
        throw new Error('ACCOUNT_DELETION_EMAIL_RATE_LIMIT_RESET_FAILED');
      }
    }
  }

  return { examined: candidates.length, deleted, resetEmailLimits };
}

export const purgeExpiredHandledRequestsInternal = internalMutation({
  args: {},
  handler: async (ctx) => await purgeExpiredHandledRequestsImpl(ctx),
});
