import {
  DAY,
  isRateLimitError,
  MINUTE,
  RateLimiter,
  type RateLimitReturns,
} from '@convex-dev/rate-limiter';
import { ConvexError, v } from 'convex/values';

import { components } from './_generated/api';
import { internalMutation } from './_generated/server';

export type GooglePlacesOperation =
  | 'autocomplete'
  | 'placeDetails'
  | 'addressResolution';

export const GOOGLE_PLACES_RATE_LIMIT_DEFINITIONS = {
  placesAutocompleteUserSustainedV1: {
    kind: 'token bucket',
    rate: 30,
    period: MINUTE,
    capacity: 12,
  },
  placesAutocompleteUserDailyV1: {
    kind: 'fixed window',
    rate: 200,
    period: DAY,
  },
  placesAutocompleteGlobalSustainedV1: {
    kind: 'token bucket',
    rate: 300,
    period: MINUTE,
    capacity: 100,
    shards: 5,
  },
  placesAutocompleteGlobalDailyV1: {
    kind: 'fixed window',
    rate: 5000,
    period: DAY,
    shards: 5,
  },
  placesDetailsUserSustainedV1: {
    kind: 'token bucket',
    rate: 6,
    period: MINUTE,
    capacity: 3,
  },
  placesDetailsUserDailyV1: {
    kind: 'fixed window',
    rate: 30,
    period: DAY,
  },
  placesDetailsGlobalSustainedV1: {
    kind: 'token bucket',
    rate: 60,
    period: MINUTE,
    capacity: 20,
    shards: 5,
  },
  placesDetailsGlobalDailyV1: {
    kind: 'fixed window',
    rate: 1000,
    period: DAY,
    shards: 5,
  },
  placesAddressResolutionUserSustainedV1: {
    kind: 'token bucket',
    rate: 6,
    period: MINUTE,
    capacity: 3,
  },
  placesAddressResolutionUserDailyV1: {
    kind: 'fixed window',
    rate: 30,
    period: DAY,
  },
  placesAddressResolutionGlobalSustainedV1: {
    kind: 'token bucket',
    rate: 60,
    period: MINUTE,
    capacity: 20,
    shards: 5,
  },
  placesAddressResolutionGlobalDailyV1: {
    kind: 'fixed window',
    rate: 1000,
    period: DAY,
    shards: 5,
  },
} as const;

export const GOOGLE_PLACES_LIMIT_NAMES_BY_OPERATION = {
  autocomplete: [
    'placesAutocompleteUserSustainedV1',
    'placesAutocompleteUserDailyV1',
    'placesAutocompleteGlobalSustainedV1',
    'placesAutocompleteGlobalDailyV1',
  ],
  placeDetails: [
    'placesDetailsUserSustainedV1',
    'placesDetailsUserDailyV1',
    'placesDetailsGlobalSustainedV1',
    'placesDetailsGlobalDailyV1',
  ],
  addressResolution: [
    'placesAddressResolutionUserSustainedV1',
    'placesAddressResolutionUserDailyV1',
    'placesAddressResolutionGlobalSustainedV1',
    'placesAddressResolutionGlobalDailyV1',
  ],
} as const;

type GooglePlacesLimitName =
  (typeof GOOGLE_PLACES_LIMIT_NAMES_BY_OPERATION)[GooglePlacesOperation][number];

type LimiterLike = {
  limit: (
    ctx: any,
    name: GooglePlacesLimitName,
    options: {
      key?: string;
      reserve: false;
      throws: true;
    }
  ) => Promise<RateLimitReturns>;
};

const rateLimiter = new RateLimiter(
  components.rateLimiter,
  GOOGLE_PLACES_RATE_LIMIT_DEFINITIONS
);

const MIN_RETRY_AFTER_MS = 1000;
const MAX_RETRY_AFTER_MS = DAY;

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

export function sanitizePlacesRetryAfterMs(value: unknown): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null;
  }

  return Math.min(
    MAX_RETRY_AFTER_MS,
    Math.max(MIN_RETRY_AFTER_MS, Math.ceil(value))
  );
}

export function normalizeGooglePlacesLimiterError(error: unknown) {
  let retryAfterMs: number | null = null;

  if (isRateLimitError(error)) {
    retryAfterMs = sanitizePlacesRetryAfterMs(error.data.retryAfter);
  } else {
    const data = getErrorData(error);
    if (data?.code === 'PLACES_RATE_LIMITED') {
      retryAfterMs = sanitizePlacesRetryAfterMs(data.retryAfterMs);
    }
  }

  if (retryAfterMs !== null) {
    return new ConvexError({
      code: 'PLACES_RATE_LIMITED' as const,
      retryAfterMs,
    });
  }

  return new ConvexError({
    code: 'PLACES_SERVICE_UNAVAILABLE' as const,
  });
}

async function consumeLimit(
  ctx: any,
  limiter: LimiterLike,
  name: GooglePlacesLimitName,
  key?: string
) {
  const status = await limiter.limit(ctx, name, {
    ...(key ? { key } : {}),
    reserve: false,
    throws: true,
  });

  if (!status.ok) {
    const retryAfterMs = sanitizePlacesRetryAfterMs(status.retryAfter);
    if (retryAfterMs === null) {
      throw new ConvexError({
        code: 'PLACES_SERVICE_UNAVAILABLE' as const,
      });
    }
    throw new ConvexError({
      code: 'PLACES_RATE_LIMITED' as const,
      retryAfterMs,
    });
  }
}

export async function consumeGooglePlacesRateLimitGroup(
  ctx: any,
  args: {
    operation: GooglePlacesOperation;
    userKey: string;
  },
  limiter: LimiterLike = rateLimiter as LimiterLike
) {
  const names = GOOGLE_PLACES_LIMIT_NAMES_BY_OPERATION[args.operation];

  try {
    await consumeLimit(ctx, limiter, names[0], args.userKey);
    await consumeLimit(ctx, limiter, names[1], args.userKey);
    await consumeLimit(ctx, limiter, names[2]);
    await consumeLimit(ctx, limiter, names[3]);
  } catch (error) {
    throw normalizeGooglePlacesLimiterError(error);
  }
}

export const consume = internalMutation({
  args: {
    operation: v.union(
      v.literal('autocomplete'),
      v.literal('placeDetails'),
      v.literal('addressResolution')
    ),
    userKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await consumeGooglePlacesRateLimitGroup(ctx, args);
    return null;
  },
});
