import { calculateRateLimit, DAY, MINUTE } from '@convex-dev/rate-limiter';
import { describe, expect, test } from 'bun:test';
import { ConvexError } from 'convex/values';

import {
  consumeGooglePlacesRateLimitGroup,
  GOOGLE_PLACES_LIMIT_NAMES_BY_OPERATION,
  GOOGLE_PLACES_RATE_LIMIT_DEFINITIONS,
  normalizeGooglePlacesLimiterError,
  sanitizePlacesRetryAfterMs,
} from '../googlePlacesRateLimits';

function createPolicyHarness(initialNow = 1_000_000) {
  let now = initialNow;
  let states = new Map();
  const calls = [];

  const limiter = {
    async limit(_ctx, name, options) {
      calls.push({ name, options });
      const stateKey = `${name}|${options.key ?? 'global'}`;
      const existing = states.get(stateKey) ?? null;
      const next = calculateRateLimit(
        existing,
        GOOGLE_PLACES_RATE_LIMIT_DEFINITIONS[name],
        now,
        1
      );

      if (next.retryAfter !== undefined) {
        if (options.throws) {
          throw new ConvexError({
            kind: 'RateLimited',
            name,
            retryAfter: next.retryAfter,
          });
        }
        return { ok: false, retryAfter: next.retryAfter };
      }

      states.set(stateKey, { value: next.value, ts: next.ts });
      return { ok: true };
    },
  };

  return {
    limiter,
    calls,
    advanceBy(value) {
      now += value;
    },
    async transaction(work) {
      const snapshot = new Map(states);
      try {
        return await work();
      } catch (error) {
        states = snapshot;
        throw error;
      }
    },
    getState(name, key) {
      return states.get(`${name}|${key ?? 'global'}`) ?? null;
    },
  };
}

describe('Google Places rate-limit policies', () => {
  test('defines the exact versioned autocomplete and place-details policies', () => {
    expect(GOOGLE_PLACES_RATE_LIMIT_DEFINITIONS).toEqual({
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
    });

    expect(GOOGLE_PLACES_LIMIT_NAMES_BY_OPERATION.autocomplete).toEqual([
      'placesAutocompleteUserSustainedV1',
      'placesAutocompleteUserDailyV1',
      'placesAutocompleteGlobalSustainedV1',
      'placesAutocompleteGlobalDailyV1',
    ]);
    expect(GOOGLE_PLACES_LIMIT_NAMES_BY_OPERATION.placeDetails).toEqual([
      'placesDetailsUserSustainedV1',
      'placesDetailsUserDailyV1',
      'placesDetailsGlobalSustainedV1',
      'placesDetailsGlobalDailyV1',
    ]);
  });

  test('consumes user then global buckets with reservation disabled', async () => {
    const harness = createPolicyHarness();

    await consumeGooglePlacesRateLimitGroup(
      {},
      { operation: 'autocomplete', userKey: 'issuer|user-a' },
      harness.limiter
    );

    expect(harness.calls).toEqual([
      {
        name: 'placesAutocompleteUserSustainedV1',
        options: {
          key: 'issuer|user-a',
          reserve: false,
          throws: true,
        },
      },
      {
        name: 'placesAutocompleteUserDailyV1',
        options: {
          key: 'issuer|user-a',
          reserve: false,
          throws: true,
        },
      },
      {
        name: 'placesAutocompleteGlobalSustainedV1',
        options: { reserve: false, throws: true },
      },
      {
        name: 'placesAutocompleteGlobalDailyV1',
        options: { reserve: false, throws: true },
      },
    ]);
  });

  test('keeps users and operations isolated and recovers sustained capacity', async () => {
    const harness = createPolicyHarness();

    for (let index = 0; index < 12; index += 1) {
      await harness.limiter.limit(
        {},
        'placesAutocompleteUserSustainedV1',
        { key: 'user-a', reserve: false, throws: true }
      );
    }

    await expect(
      harness.limiter.limit({}, 'placesAutocompleteUserSustainedV1', {
        key: 'user-a',
        reserve: false,
        throws: true,
      })
    ).rejects.toBeInstanceOf(ConvexError);
    await expect(
      harness.limiter.limit({}, 'placesAutocompleteUserSustainedV1', {
        key: 'user-b',
        reserve: false,
        throws: true,
      })
    ).resolves.toEqual({ ok: true });
    await expect(
      harness.limiter.limit({}, 'placesDetailsUserSustainedV1', {
        key: 'user-a',
        reserve: false,
        throws: true,
      })
    ).resolves.toEqual({ ok: true });

    harness.advanceBy(2000);
    await expect(
      harness.limiter.limit({}, 'placesAutocompleteUserSustainedV1', {
        key: 'user-a',
        reserve: false,
        throws: true,
      })
    ).resolves.toEqual({ ok: true });
  });

  test('global exhaustion applies collectively while daily and sustained state remain distinct', async () => {
    const harness = createPolicyHarness();

    for (let index = 0; index < 100; index += 1) {
      await harness.limiter.limit(
        {},
        'placesAutocompleteGlobalSustainedV1',
        { reserve: false, throws: true }
      );
    }

    await expect(
      harness.limiter.limit(
        {},
        'placesAutocompleteGlobalSustainedV1',
        { reserve: false, throws: true }
      )
    ).rejects.toBeInstanceOf(ConvexError);
    await expect(
      harness.limiter.limit({}, 'placesAutocompleteGlobalDailyV1', {
        reserve: false,
        throws: true,
      })
    ).resolves.toEqual({ ok: true });

    harness.advanceBy(200);
    await expect(
      harness.limiter.limit(
        {},
        'placesAutocompleteGlobalSustainedV1',
        { reserve: false, throws: true }
      )
    ).resolves.toEqual({ ok: true });
  });

  test('daily capacity recovers after its fixed window', async () => {
    const harness = createPolicyHarness();

    for (let index = 0; index < 30; index += 1) {
      await harness.limiter.limit({}, 'placesDetailsUserDailyV1', {
        key: 'user-a',
        reserve: false,
        throws: true,
      });
    }

    await expect(
      harness.limiter.limit({}, 'placesDetailsUserDailyV1', {
        key: 'user-a',
        reserve: false,
        throws: true,
      })
    ).rejects.toBeInstanceOf(ConvexError);

    harness.advanceBy(DAY);
    await expect(
      harness.limiter.limit({}, 'placesDetailsUserDailyV1', {
        key: 'user-a',
        reserve: false,
        throws: true,
      })
    ).resolves.toEqual({ ok: true });
  });

  test('a later global denial throws so the transaction can roll back user buckets', async () => {
    const harness = createPolicyHarness();
    for (let index = 0; index < 100; index += 1) {
      await harness.limiter.limit(
        {},
        'placesAutocompleteGlobalSustainedV1',
        { reserve: false, throws: true }
      );
    }
    const before = harness.getState(
      'placesAutocompleteUserSustainedV1',
      'issuer|user-a'
    );

    await expect(
      harness.transaction(() =>
        consumeGooglePlacesRateLimitGroup(
          {},
          { operation: 'autocomplete', userKey: 'issuer|user-a' },
          harness.limiter
        )
      )
    ).rejects.toMatchObject({
      data: { code: 'PLACES_RATE_LIMITED' },
    });

    expect(
      harness.getState(
        'placesAutocompleteUserSustainedV1',
        'issuer|user-a'
      )
    ).toEqual(before);
  });

  test('bounds retry delays and sanitizes component failures', () => {
    expect(sanitizePlacesRetryAfterMs(0)).toBe(1000);
    expect(sanitizePlacesRetryAfterMs(1000.2)).toBe(1001);
    expect(sanitizePlacesRetryAfterMs(DAY + 1)).toBe(DAY);
    expect(sanitizePlacesRetryAfterMs(Number.NaN)).toBeNull();
    expect(sanitizePlacesRetryAfterMs(Number.POSITIVE_INFINITY)).toBeNull();
    expect(sanitizePlacesRetryAfterMs(-1)).toBeNull();

    expect(
      normalizeGooglePlacesLimiterError(
        new ConvexError({
          kind: 'RateLimited',
          name: 'placesAutocompleteGlobalDailyV1',
          retryAfter: 2500.2,
        })
      ).data
    ).toEqual({ code: 'PLACES_RATE_LIMITED', retryAfterMs: 2501 });
    expect(
      normalizeGooglePlacesLimiterError(
        new ConvexError({
          kind: 'RateLimited',
          name: 'secret-bucket',
          retryAfter: Number.NaN,
        })
      ).data
    ).toEqual({ code: 'PLACES_SERVICE_UNAVAILABLE' });
    expect(
      normalizeGooglePlacesLimiterError(
        new Error('component secret-bucket failed for issuer|secret-user')
      ).data
    ).toEqual({ code: 'PLACES_SERVICE_UNAVAILABLE' });
  });
});
