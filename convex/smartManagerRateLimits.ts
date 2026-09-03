import {
  HOUR,
  isRateLimitError,
  RateLimiter,
  type RateLimitReturns,
} from '@convex-dev/rate-limiter';
import { ConvexError, v } from 'convex/values';

import { components } from './_generated/api';
import { internalMutation, type MutationCtx } from './_generated/server';

export const SMART_MANAGER_RATE_LIMIT_DEFINITIONS = {
  smartManagerExplicitRegenerationActorBusinessV1: {
    kind: 'fixed window',
    rate: 3,
    period: HOUR,
  },
  smartManagerGenerationBusinessV1: {
    kind: 'fixed window',
    rate: 10,
    period: HOUR,
  },
} as const;

type SmartManagerLimitName = keyof typeof SMART_MANAGER_RATE_LIMIT_DEFINITIONS;

type LimiterLike = {
  limit: (
    ctx: MutationCtx,
    name: SmartManagerLimitName,
    options: { key: string; reserve: false; throws: true }
  ) => Promise<RateLimitReturns>;
};

const rateLimiter = new RateLimiter(
  components.rateLimiter,
  SMART_MANAGER_RATE_LIMIT_DEFINITIONS
);

function safeRateLimitedError() {
  return new ConvexError({ code: 'AI_RATE_LIMITED' as const });
}

async function consumeOne(
  ctx: MutationCtx,
  limiter: LimiterLike,
  name: SmartManagerLimitName,
  key: string
) {
  const result = await limiter.limit(ctx, name, {
    key,
    reserve: false,
    throws: true,
  });
  if (!result.ok) {
    throw safeRateLimitedError();
  }
}

export async function consumeSmartManagerGenerationRateLimits(
  ctx: MutationCtx,
  args: {
    businessId: string;
    actorUserId: string;
    explicitRegeneration: boolean;
  },
  limiter: LimiterLike = rateLimiter as LimiterLike
) {
  try {
    if (args.explicitRegeneration) {
      await consumeOne(
        ctx,
        limiter,
        'smartManagerExplicitRegenerationActorBusinessV1',
        `${args.actorUserId}:${args.businessId}`
      );
    }
    await consumeOne(
      ctx,
      limiter,
      'smartManagerGenerationBusinessV1',
      args.businessId
    );
  } catch (error) {
    if (isRateLimitError(error)) {
      throw safeRateLimitedError();
    }
    const data = (error as { data?: { code?: unknown } } | null)?.data;
    if (data?.code === 'AI_RATE_LIMITED') {
      throw safeRateLimitedError();
    }
    throw error;
  }
}

export const consumeGenerationInternal = internalMutation({
  args: {
    businessId: v.id('businesses'),
    actorUserId: v.id('users'),
    explicitRegeneration: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await consumeSmartManagerGenerationRateLimits(ctx, {
      businessId: String(args.businessId),
      actorUserId: String(args.actorUserId),
      explicitRegeneration: args.explicitRegeneration,
    });
    return null;
  },
});
