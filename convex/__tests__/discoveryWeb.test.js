import { afterEach, describe, expect, test } from 'bun:test';
import { getFunctionName } from 'convex/server';
import {
  discoveryMapsUrl,
  mergeDiscoveryResults,
} from '../../lib/discovery/webResults';
import { partners, searchPlaces } from '../discoveryWeb';
import {
  normalizeDiscoveryQuery,
  parseDiscoveryPlaces,
  validateDiscoveryLocation,
  withinDiscoveryRadius,
} from '../lib/discoveryWeb';

const originalFetch = globalThis.fetch;
const originalKey = process.env.GOOGLE_PLACES_API_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.GOOGLE_PLACES_API_KEY;
  } else {
    process.env.GOOGLE_PLACES_API_KEY = originalKey;
  }
});

const rawPlace = (overrides = {}) => ({
  id: 'place_1',
  displayName: { text: 'בית קפה' },
  formattedAddress: 'טבריה, ישראל',
  addressComponents: [{ types: ['country'], shortText: 'IL' }],
  location: { latitude: 32.79, longitude: 35.53 },
  businessStatus: 'OPERATIONAL',
  ...overrides,
});
const partner = (overrides = {}) => ({
  businessId: 'business_1',
  name: 'שם השותף',
  address: 'כתובת מהעסק',
  description: '',
  placeId: 'place_1',
  logoUrl: null,
  ...overrides,
});
function actionContext({ authenticated = true, active = true } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      getUserIdentity: async () =>
        authenticated ? { subject: 'user_1|session_1' } : null,
    },
    runQuery: async (ref) => {
      const name = getFunctionName(ref);
      calls.push(name);
      return name.endsWith(':activeViewer') ? active : [partner()];
    },
    runMutation: async (_ref, args) => {
      calls.push(args);
    },
  };
}

describe('national discovery normalization and privacy', () => {
  test('bounds query before whitespace normalization and rejects control characters', () => {
    expect(normalizeDiscoveryQuery('  קפה   טבריה ')).toBe('קפה טבריה');
    for (const term of ['x'.repeat(121), 'קפה\nטבריה', '\u0000', '\u0085']) {
      expect(() => normalizeDiscoveryQuery(term)).toThrow(
        'DISCOVERY_QUERY_INVALID'
      );
    }
  });
  test('keeps Israeli open places, valid coordinates and distinct place IDs only', () => {
    const response = parseDiscoveryPlaces({
      places: [
        rawPlace(),
        rawPlace(),
        rawPlace({
          id: 'abroad',
          addressComponents: [{ types: ['country'], shortText: 'US' }],
        }),
        rawPlace({ id: 'closed', businessStatus: 'CLOSED_PERMANENTLY' }),
        rawPlace({ id: 'nan', location: { latitude: NaN, longitude: 0 } }),
        rawPlace({ id: 'outside', location: { latitude: 91, longitude: 0 } }),
        rawPlace({ id: '' }),
        rawPlace({ id: 'branch_2' }),
      ],
      nextPageToken: 'next',
    });
    expect(response.places.map((row) => row.placeId)).toEqual([
      'place_1',
      'branch_2',
    ]);
    expect(response.nextPageToken).toBe('next');
  });
  test('does not truncate identities into collisions and caps provider pages', () => {
    expect(
      parseDiscoveryPlaces({ places: [rawPlace({ id: 'x'.repeat(257) })] })
        .places
    ).toHaveLength(0);
    expect(
      parseDiscoveryPlaces({
        places: Array.from({ length: 30 }, (_, index) =>
          rawPlace({ id: String(index) })
        ),
      }).places
    ).toHaveLength(20);
    expect(
      parseDiscoveryPlaces({ places: [], nextPageToken: 'x'.repeat(2049) })
        .nextPageToken
    ).toBeNull();
  });
  test('retains only safe attribution links and handles malformed provider fields', () => {
    const places = parseDiscoveryPlaces({
      places: [
        rawPlace({
          attributions: [
            { provider: 'מקור', providerUri: 'https://example.org/source' },
            { provider: 'script', providerUri: 'javascript:alert(1)' },
            {
              provider: 'credentials',
              providerUri: 'https://user:password@example.org',
            },
          ],
        }),
        rawPlace({
          id: 'malformed',
          addressComponents: [{ types: 42, shortText: 'IL' }],
        }),
      ],
    }).places;
    expect(places).toHaveLength(1);
    expect(places[0].attributions).toEqual([
      { provider: 'מקור', uri: 'https://example.org/source' },
    ]);
  });
  test('validates optional radius and filters actual distance rather than treating bias as a guarantee', () => {
    expect(validateDiscoveryLocation()).toBeUndefined();
    const center = { lat: 32.79, lng: 35.53, radius: 3000 };
    expect(withinDiscoveryRadius(center, center)).toBe(true);
    expect(withinDiscoveryRadius({ lat: 31.77, lng: 35.21 }, center)).toBe(
      false
    );
    for (const changes of [
      { lat: 91 },
      { lng: Infinity },
      { radius: 0 },
      { radius: 50001 },
    ]) {
      expect(() =>
        validateDiscoveryLocation({ ...center, ...changes })
      ).toThrow('DISCOVERY_LOCATION_INVALID');
    }
  });
  test('merges a partner with its Google place, keeps branches and local-only businesses distinct', () => {
    const google = parseDiscoveryPlaces({
      places: [rawPlace(), rawPlace({ id: 'branch_2' })],
    }).places;
    const merged = mergeDiscoveryResults(
      [
        partner(),
        partner(),
        partner({ businessId: 'business_2', placeId: null }),
      ],
      google
    );
    expect(merged).toHaveLength(3);
    expect(merged[0].name).toBe('שם השותף');
    expect(merged[0].partner.businessId).toBe('business_1');
    expect(merged[0].fromGoogle).toBe(true);
    expect(merged[1].fromGoogle).toBe(false);
    expect(merged[2].partner).toBeNull();
    expect(
      new URL(
        discoveryMapsUrl({
          name: 'https://evil.test',
          address: '',
          placeId: 'a&b',
        })
      ).hostname
    ).toBe('www.google.com');
    expect(
      new URL(
        discoveryMapsUrl({ name: 'קפה', address: '', placeId: 'a&b' })
      ).searchParams.get('query_place_id')
    ).toBe('a&b');
  });
});

describe('discovery provider boundary (mock transport)', () => {
  test('unauthenticated and inactive accounts cannot consume quota or call Google', async () => {
    let fetches = 0;
    globalThis.fetch = async () => {
      fetches += 1;
      return Response.json({});
    };
    for (const options of [{ authenticated: false }, { active: false }]) {
      const ctx = actionContext(options);
      await expect(searchPlaces._handler(ctx, { term: 'קפה' })).rejects.toThrow(
        'NOT_AUTHENTICATED'
      );
      expect(ctx.calls.some((call) => typeof call === 'object')).toBe(false);
    }
    expect(fetches).toBe(0);
  });
  test('rejects malformed input and missing configuration before paid provider requests', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    await expect(
      searchPlaces._handler(actionContext(), { term: 'קפה' })
    ).rejects.toThrow('PLACES_CONFIGURATION_MISSING');
    for (const args of [
      { term: 'א' },
      { term: 'קפה', pageToken: 'x'.repeat(2049) },
      { term: 'קפה', location: { lat: 32, lng: 34, radius: -1 } },
    ]) {
      const ctx = actionContext();
      await expect(searchPlaces._handler(ctx, args)).rejects.toThrow();
      expect(ctx.calls).toHaveLength(1);
    }
  });
  test('uses an explicit field mask, Hebrew, Israel, bounded pagination and a dedicated quota', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'unit-test-key';
    let request;
    globalThis.fetch = async (url, init) => {
      request = { url, ...init };
      return Response.json({ places: [rawPlace()], nextPageToken: 'next' });
    };
    const ctx = actionContext();
    const result = await searchPlaces._handler(ctx, {
      term: 'קפה',
      pageToken: 'previous',
    });
    expect(request.url).toBe(
      'https://places.googleapis.com/v1/places:searchText'
    );
    expect(request.headers['X-Goog-FieldMask']).toContain(
      'places.attributions'
    );
    expect(request.headers['X-Goog-FieldMask']).not.toContain('*');
    expect(JSON.parse(request.body)).toEqual({
      textQuery: 'קפה ישראל',
      languageCode: 'he',
      regionCode: 'IL',
      pageSize: 20,
      pageToken: 'previous',
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(ctx.calls[1]).toEqual({
      operation: 'discoverySearch',
      userKey: 'user_1',
    });
    expect(result.places).toHaveLength(1);
    expect(result.partners).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('unit-test-key');
  });
  test('provider failures are bounded and do not leak provider bodies or credentials', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'unit-test-key';
    for (const fetcher of [
      async () => {
        throw new Error('secret');
      },
      async () => new Response('secret', { status: 403 }),
      async () => new Response('not-json'),
    ]) {
      globalThis.fetch = fetcher;
      await expect(
        searchPlaces._handler(actionContext(), { term: 'קפה' })
      ).rejects.toThrow('PLACES_SERVICE_UNAVAILABLE');
    }
  });
  test('nearby search uses explicit coordinates, then filters outside the chosen radius', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'unit-test-key';
    let body;
    globalThis.fetch = async (_url, init) => {
      body = JSON.parse(init.body);
      return Response.json({
        places: [
          rawPlace(),
          rawPlace({
            id: 'far',
            location: { latitude: 31.77, longitude: 35.21 },
          }),
        ],
      });
    };
    const result = await searchPlaces._handler(actionContext(), {
      term: 'קפה',
      location: { lat: 32.79, lng: 35.53, radius: 3000 },
    });
    expect(body.locationBias.circle.center).toEqual({
      latitude: 32.79,
      longitude: 35.53,
    });
    expect(result.places.map((row) => row.placeId)).toEqual(['place_1']);
  });
  test('partner query requires an active viewer and returns a bounded public projection', async () => {
    const calls = [];
    const rows = [
      {
        _id: 'business_1',
        name: 'קפה',
        ownerUserId: 'private-owner',
        businessPhone: 'private',
        formattedAddress: 'טבריה',
        isActive: true,
      },
      {
        _id: 'deleting',
        name: 'מחיקה',
        permanentDeletionStatus: 'in_progress',
      },
    ];
    const chain = {
      withIndex: (name) => {
        calls.push(name);
        return chain;
      },
      order: () => chain,
      paginate: async (opts) => {
        calls.push(opts);
        return { page: rows, isDone: true, continueCursor: 'end' };
      },
    };
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: 'user_1|session_1' }) },
      db: {
        get: async () => ({ _id: 'user_1', isActive: true }),
        query: () => chain,
      },
    };
    const result = await partners._handler(ctx, {
      term: '',
      paginationOpts: { numItems: 1000, cursor: null },
    });
    expect(calls).toEqual(['by_isActive', { numItems: 30, cursor: null }]);
    expect(result.page).toHaveLength(1);
    expect(result.page[0]).not.toHaveProperty('ownerUserId');
    expect(result.page[0]).not.toHaveProperty('businessPhone');
    ctx.db.get = async () => ({ _id: 'user_1', isActive: false });
    await expect(
      partners._handler(ctx, {
        term: '',
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).rejects.toThrow('NOT_AUTHENTICATED');
  });
});
