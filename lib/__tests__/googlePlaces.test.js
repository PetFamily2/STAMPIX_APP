import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const originalFetch = globalThis.fetch;
const originalKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

beforeEach(() => {
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  } else {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = originalKey;
  }
});

describe('google places helper', () => {
  test('autocomplete supports business names and restricts to Israel in Hebrew', async () => {
    const seenUrls = [];
    globalThis.fetch = async (url) => {
      seenUrls.push(String(url));
      return Response.json({
        status: 'OK',
        predictions: [
          {
            description: 'קפה השכונה, תל אביב-יפו, ישראל',
            place_id: 'business_place_1',
            structured_formatting: {
              main_text: 'קפה השכונה',
              secondary_text: 'תל אביב-יפו',
            },
          },
        ],
      });
    };

    const { fetchPlaceSuggestions } = await import('../googlePlaces');
    const suggestions = await fetchPlaceSuggestions('קפה השכונה', 'session_1');

    expect(suggestions[0].placeId).toBe('business_place_1');
    expect(seenUrls[0]).toContain('/autocomplete/json?');
    expect(seenUrls[0]).toContain('language=he');
    expect(seenUrls[0]).toContain('region=il');
    expect(seenUrls[0]).toContain('components=country%3Ail');
    expect(seenUrls[0]).not.toContain('types=address');
  });

  test('autocomplete still accepts street-address results', async () => {
    globalThis.fetch = async () =>
      Response.json({
        status: 'OK',
        predictions: [
          {
            description: 'דיזנגוף 100, תל אביב-יפו, ישראל',
            place_id: 'address_place_1',
            structured_formatting: {
              main_text: 'דיזנגוף 100',
              secondary_text: 'תל אביב-יפו',
            },
          },
        ],
      });

    const { fetchPlaceSuggestions } = await import('../googlePlaces');
    const suggestions = await fetchPlaceSuggestions('דיזנגוף 100', 'session_1');

    expect(suggestions).toEqual([
      {
        description: 'דיזנגוף 100, תל אביב-יפו, ישראל',
        placeId: 'address_place_1',
        primaryText: 'דיזנגוף 100',
        secondaryText: 'תל אביב-יפו',
      },
    ]);
  });

  test('place details require formatted address and coordinates', async () => {
    globalThis.fetch = async () =>
      Response.json({
        status: 'OK',
        result: {
          place_id: 'place_1',
          formatted_address: '',
          geometry: { location: { lat: 32.08, lng: 34.78 } },
          address_components: [],
        },
      });

    const { fetchPlaceDetails } = await import('../googlePlaces');

    await expect(fetchPlaceDetails('place_1', 'session_1')).rejects.toThrow(
      'PLACE_DETAILS_INCOMPLETE'
    );
  });

  test('missing optional street number remains valid', async () => {
    globalThis.fetch = async () =>
      Response.json({
        status: 'OK',
        result: {
          place_id: 'place_1',
          formatted_address: 'קניון עזריאלי, תל אביב-יפו, ישראל',
          geometry: { location: { lat: 32.074, lng: 34.792 } },
          address_components: [
            { long_name: 'תל אביב-יפו', short_name: 'תל אביב', types: ['locality'] },
            { long_name: 'מנחם בגין', short_name: 'בגין', types: ['route'] },
          ],
        },
      });

    const { fetchPlaceDetails } = await import('../googlePlaces');
    const details = await fetchPlaceDetails('place_1', 'session_1');

    expect(details.formattedAddress).toBe('קניון עזריאלי, תל אביב-יפו, ישראל');
    expect(details.lat).toBe(32.074);
    expect(details.lng).toBe(34.792);
    expect(details.streetNumber).toBe('');
  });
});
