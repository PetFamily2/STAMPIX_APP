import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  autocomplete,
  buildGoogleAutocompleteUrl,
  buildGoogleDetailsUrl,
  normalizeGoogleAutocompleteResponse,
  normalizeGooglePlaceDetails,
  placeDetails,
} from '../googlePlaces';

const originalFetch = globalThis.fetch;
const originalKey = process.env.GOOGLE_PLACES_API_KEY;

function buildCtx({ authenticated = true } = {}) {
  return {
    auth: {
      getUserIdentity: async () =>
        authenticated ? { subject: 'user_1', email: 'user@example.com' } : null,
    },
  };
}

async function getErrorMessage(work) {
  try {
    await work();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

beforeEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = 'server-only-test-key';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.GOOGLE_PLACES_API_KEY;
  } else {
    process.env.GOOGLE_PLACES_API_KEY = originalKey;
  }
});

describe('Convex Google Places actions', () => {
  test('autocomplete rejects unauthenticated callers before key usage', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;

    const message = await getErrorMessage(() =>
      autocomplete._handler(buildCtx({ authenticated: false }), {
        query: 'coffee',
        sessionToken: 'session_1',
      })
    );

    expect(message).toBe('PLACES_UNAUTHENTICATED');
  });

  test('short autocomplete query returns empty without fetch', async () => {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return Response.json({ status: 'OK', predictions: [] });
    };

    await expect(
      autocomplete._handler(buildCtx(), {
        query: ' a ',
        sessionToken: 'session_1',
      })
    ).resolves.toEqual([]);
    expect(fetchCount).toBe(0);
  });

  test('autocomplete includes Israel, Hebrew and session token without address-only filter', async () => {
    const url = buildGoogleAutocompleteUrl({
      apiKey: 'key',
      query: 'Neighborhood Cafe',
      sessionToken: 'session_1',
    });

    expect(url).toContain('/autocomplete/json?');
    expect(url).toContain('language=he');
    expect(url).toContain('region=il');
    expect(url).toContain('components=country%3Ail');
    expect(url).toContain('sessiontoken=session_1');
    expect(url).not.toContain('types=address');
  });

  test('autocomplete supports business and street-address results and bounds count', () => {
    const suggestions = normalizeGoogleAutocompleteResponse({
      status: 'OK',
      predictions: Array.from({ length: 7 }, (_, index) => ({
        description:
          index === 0
            ? 'Neighborhood Cafe, Tel Aviv, Israel'
            : `Dizengoff ${index}, Tel Aviv, Israel`,
        place_id: `place_${index}`,
        structured_formatting: {
          main_text: index === 0 ? 'Neighborhood Cafe' : `Dizengoff ${index}`,
          secondary_text: 'Tel Aviv',
        },
      })),
    });

    expect(suggestions).toHaveLength(5);
    expect(suggestions[0]).toEqual({
      description: 'Neighborhood Cafe, Tel Aviv, Israel',
      placeId: 'place_0',
      primaryText: 'Neighborhood Cafe',
      secondaryText: 'Tel Aviv',
    });
    expect(suggestions[1].primaryText).toBe('Dizengoff 1');
  });

  test('autocomplete zero results and service errors normalize safely', async () => {
    expect(
      normalizeGoogleAutocompleteResponse({
        status: 'ZERO_RESULTS',
        predictions: undefined,
      })
    ).toEqual([]);

    const message = await getErrorMessage(async () =>
      normalizeGoogleAutocompleteResponse({
        status: 'REQUEST_DENIED',
      })
    );

    expect(message).toBe('PLACES_SERVICE_UNAVAILABLE');
    expect(message).not.toContain('server-only-test-key');
  });

  test('missing Places key is a configuration error', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;

    const message = await getErrorMessage(() =>
      autocomplete._handler(buildCtx(), {
        query: 'coffee',
        sessionToken: 'session_1',
      })
    );

    expect(message).toBe('PLACES_CONFIGURATION_MISSING');
  });

  test('place details rejects unauthenticated callers and invalid ids', async () => {
    await expect(
      getErrorMessage(() =>
        placeDetails._handler(buildCtx({ authenticated: false }), {
          placeId: 'place_1',
          sessionToken: 'session_1',
        })
      )
    ).resolves.toBe('PLACES_UNAUTHENTICATED');

    await expect(
      getErrorMessage(() =>
        placeDetails._handler(buildCtx(), {
          placeId: '',
          sessionToken: 'session_1',
        })
      )
    ).resolves.toBe('PLACES_PLACE_ID_REQUIRED');
  });

  test('place details URL includes session token and requested fields', () => {
    const url = buildGoogleDetailsUrl({
      apiKey: 'key',
      placeId: 'place_1',
      sessionToken: 'session_1',
    });

    expect(url).toContain('/details/json?');
    expect(url).toContain('place_id=place_1');
    expect(url).toContain('language=he');
    expect(url).toContain('sessiontoken=session_1');
    expect(url).toContain('fields=place_id%2Cformatted_address%2Cgeometry');
  });

  test('place details parses business and street address fields', () => {
    const details = normalizeGooglePlaceDetails({
      status: 'OK',
      result: {
        place_id: 'place_1',
        formatted_address: 'Azrieli Center, Tel Aviv, Israel',
        geometry: { location: { lat: 32.074, lng: 34.792 } },
        address_components: [
          {
            long_name: 'Tel Aviv',
            short_name: 'Tel Aviv',
            types: ['locality'],
          },
          {
            long_name: 'Menachem Begin',
            short_name: 'Begin',
            types: ['route'],
          },
        ],
      },
    });

    expect(details).toEqual({
      placeId: 'place_1',
      formattedAddress: 'Azrieli Center, Tel Aviv, Israel',
      lat: 32.074,
      lng: 34.792,
      city: 'Tel Aviv',
      street: 'Menachem Begin',
      streetNumber: '',
    });
  });

  test('place details rejects missing address and non-finite coordinates', async () => {
    await expect(
      getErrorMessage(async () =>
        normalizeGooglePlaceDetails({
          status: 'OK',
          result: {
            place_id: 'place_1',
            formatted_address: '',
            geometry: { location: { lat: 32.08, lng: 34.78 } },
            address_components: [],
          },
        })
      )
    ).resolves.toBe('PLACES_INVALID_DETAILS');

    await expect(
      getErrorMessage(async () =>
        normalizeGooglePlaceDetails({
          status: 'OK',
          result: {
            place_id: 'place_1',
            formatted_address: 'Dizengoff 100, Tel Aviv',
            geometry: { location: { lat: Number.NaN, lng: 34.78 } },
            address_components: [],
          },
        })
      )
    ).resolves.toBe('PLACES_INVALID_DETAILS');
  });

  test('place details service errors never include the API key', async () => {
    const message = await getErrorMessage(async () =>
      normalizeGooglePlaceDetails({
        status: 'OVER_QUERY_LIMIT',
      })
    );

    expect(message).toBe('PLACES_RATE_LIMITED');
    expect(message).not.toContain('server-only-test-key');
  });
});
