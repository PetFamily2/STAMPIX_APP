import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ConvexError } from 'convex/values';

import {
  autocomplete,
  buildGoogleAddressResolutionRequest,
  buildGoogleAutocompleteRequest,
  buildGoogleDetailsRequest,
  GOOGLE_ADDRESS_RESOLUTION_FIELD_MASK,
  GOOGLE_AUTOCOMPLETE_FIELD_MASK,
  GOOGLE_PLACE_DETAILS_FIELD_MASK,
  normalizeGoogleAddressResolutionResponse,
  normalizeGoogleAutocompleteResponse,
  normalizeGooglePlaceDetails,
  placeDetails,
  resolveAddress,
} from '../googlePlaces';

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalKey = process.env.GOOGLE_PLACES_API_KEY;

function buildCtx({
  authenticated = true,
  liveUserExists = true,
  tokenIdentifier = 'https://stampix.test|user_1',
  runQuery = async () => liveUserExists,
  runMutation = async () => null,
} = {}) {
  return {
    auth: {
      getUserIdentity: async () =>
        authenticated
          ? {
              subject: 'user_1',
              tokenIdentifier,
              email: 'user@example.com',
            }
          : null,
    },
    runQuery,
    runMutation,
  };
}

async function getThrownError(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }
  return null;
}

async function getErrorMessage(work) {
  try {
    await work();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

function geocodingCandidate(overrides = {}) {
  return {
    placeId: 'resolved_place_1',
    formattedAddress: 'דיזנגוף 100, תל אביב-יפו, ישראל',
    location: { latitude: 32.0801, longitude: 34.7742 },
    granularity: 'ROOFTOP',
    types: ['street_address'],
    addressComponents: [
      { longText: 'ישראל', shortText: 'IL', types: ['country', 'political'] },
      {
        longText: 'תל אביב-יפו',
        shortText: 'תל אביב-יפו',
        types: ['locality', 'political'],
      },
      { longText: 'דיזנגוף', shortText: 'דיזנגוף', types: ['route'] },
      { longText: '100', shortText: '100', types: ['street_number'] },
    ],
    ...overrides,
  };
}

const RAW_CONTROL_CASES = [
  { label: 'newline', character: '\n' },
  { label: 'carriage return', character: '\r' },
  { label: 'tab', character: '\t' },
  { label: 'null character', character: '\u0000' },
  { label: 'DEL control character', character: '\u007F' },
  { label: 'C1 control character', character: '\u0085' },
];

function autocompletePrediction({
  placeId,
  mainText,
  description,
  secondaryText,
}) {
  return {
    placePrediction: {
      placeId,
      text: { text: description },
      structuredFormat: {
        mainText: { text: mainText },
        ...(secondaryText === undefined
          ? {}
          : { secondaryText: { text: secondaryText } }),
      },
    },
  };
}

async function runStreetFallbackFilteringCase({
  selectedCity,
  prediction,
}) {
  let fetchCount = 0;
  let limiterCalls = 0;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    fetchCount += 1;
    requests.push(JSON.parse(init.body));
    return Response.json(
      fetchCount === 1
        ? { suggestions: [] }
        : { suggestions: [prediction] }
    );
  };

  const result = await autocomplete._handler(
    buildCtx({
      runMutation: async () => {
        limiterCalls += 1;
      },
    }),
    {
      query: 'הו',
      mode: 'street',
      selectedCity: { displayName: selectedCity },
    }
  );

  return { fetchCount, limiterCalls, requests, result };
}

beforeEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = 'server-only-test-key';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  if (originalKey === undefined) {
    delete process.env.GOOGLE_PLACES_API_KEY;
  } else {
    process.env.GOOGLE_PLACES_API_KEY = originalKey;
  }
});

describe('Convex Google Places actions', () => {
  test('autocomplete rejects unauthenticated callers before key usage', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    let limiterCalls = 0;

    const message = await getErrorMessage(() =>
      autocomplete._handler(
        buildCtx({
          authenticated: false,
          runMutation: async () => {
            limiterCalls += 1;
          },
        }),
        {
          query: 'coffee',
          sessionToken: 'session_1',
        }
      )
    );

    expect(message).toBe('PLACES_UNAUTHENTICATED');
    expect(limiterCalls).toBe(0);
  });

  test('all Places actions reject a deleted user JWT before limits and Google fetch', async () => {
    let limiterCalls = 0;
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return Response.json({});
    };
    const deletedUserCtx = buildCtx({
      authenticated: true,
      liveUserExists: false,
      runMutation: async () => {
        limiterCalls += 1;
      },
    });
    const calls = [
      () =>
        autocomplete._handler(deletedUserCtx, {
          query: 'coffee',
          sessionToken: 'session_1',
        }),
      () =>
        placeDetails._handler(deletedUserCtx, {
          placeId: 'place_1',
          sessionToken: 'session_1',
        }),
      () =>
        resolveAddress._handler(deletedUserCtx, {
          city: 'תל אביב-יפו',
          street: 'דיזנגוף',
          streetNumber: '100',
        }),
    ];

    for (const call of calls) {
      await expect(getErrorMessage(call)).resolves.toBe(
        'PLACES_UNAUTHENTICATED'
      );
    }
    expect(limiterCalls).toBe(0);
    expect(fetchCount).toBe(0);
  });

  test('short autocomplete query returns empty without fetch', async () => {
    let fetchCount = 0;
    let limiterCalls = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return Response.json({ suggestions: [] });
    };

    await expect(
      autocomplete._handler(
        buildCtx({
          runMutation: async () => {
            limiterCalls += 1;
          },
        }),
        {
          query: ' a ',
          sessionToken: 'session_1',
        }
      )
    ).resolves.toEqual([]);
    expect(fetchCount).toBe(0);
    expect(limiterCalls).toBe(0);
  });

  test('City autocomplete starts at two trimmed characters', async () => {
    const requests = [];
    let limiterCalls = 0;
    globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return Response.json({
        suggestions: [
          {
            placePrediction: {
              placeId: 'city_two_characters',
              text: { text: 'אבו גוש, ישראל' },
              structuredFormat: {
                mainText: { text: 'אבו גוש' },
                secondaryText: { text: 'ישראל' },
              },
            },
          },
        ],
      });
    };

    const result = await autocomplete._handler(
      buildCtx({
        runMutation: async () => {
          limiterCalls += 1;
        },
      }),
      { query: ' אב ', mode: 'city' }
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].input).toBe('אב');
    expect(requests[0].includedPrimaryTypes).toEqual(['(cities)']);
    expect(requests[0]).not.toHaveProperty('sessionToken');
    expect(limiterCalls).toBe(1);
    expect(result[0].placeId).toBe('city_two_characters');
  });

  test('autocomplete posts the New API request with Hebrew, Israel and session configuration', async () => {
    let capturedUrl;
    let capturedInit;
    let fetchCount = 0;
    const limiterArgs = [];
    globalThis.fetch = async (url, init) => {
      fetchCount += 1;
      capturedUrl = String(url);
      capturedInit = init;
      return Response.json({
        suggestions: [
          {
            placePrediction: {
              placeId: 'place_1',
              text: { text: 'Neighborhood Cafe, Tel Aviv, Israel' },
              structuredFormat: {
                mainText: { text: 'Neighborhood Cafe' },
                secondaryText: { text: 'Tel Aviv' },
              },
            },
          },
        ],
      });
    };

    const result = await autocomplete._handler(
      buildCtx({
        tokenIdentifier: 'issuer|autocomplete-user',
        runMutation: async (_reference, args) => {
          limiterArgs.push(args);
          return null;
        },
      }),
      {
        query: '  Neighborhood   Cafe ',
        sessionToken: 'session_1',
      }
    );
    const headers = new Headers(capturedInit.headers);

    expect(capturedUrl).toBe(
      'https://places.googleapis.com/v1/places:autocomplete'
    );
    expect(capturedInit.method).toBe('POST');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Goog-Api-Key')).toBe('server-only-test-key');
    expect(headers.get('X-Goog-FieldMask')).toBe(
      GOOGLE_AUTOCOMPLETE_FIELD_MASK
    );
    expect(JSON.parse(capturedInit.body)).toEqual({
      input: 'Neighborhood Cafe',
      languageCode: 'he',
      regionCode: 'il',
      includedRegionCodes: ['il'],
      sessionToken: 'session_1',
    });
    expect(capturedInit.body).not.toContain('includeQueryPredictions');
    expect(capturedUrl).not.toContain('server-only-test-key');
    expect(limiterArgs).toEqual([
      {
        operation: 'autocomplete',
        userKey: 'issuer|autocomplete-user',
      },
    ]);
    expect(fetchCount).toBe(1);
    expect(result).toEqual([
      {
        description: 'Neighborhood Cafe, Tel Aviv, Israel',
        placeId: 'place_1',
        primaryText: 'Neighborhood Cafe',
        secondaryText: 'Tel Aviv',
      },
    ]);
  });

  test('autocomplete request builder uses the exact minimal field mask', () => {
    const request = buildGoogleAutocompleteRequest({
      apiKey: 'key',
      query: 'Cafe',
      sessionToken: 'session_1',
    });
    const headers = new Headers(request.init.headers);

    expect(GOOGLE_AUTOCOMPLETE_FIELD_MASK).toBe(
      'suggestions.placePrediction.placeId,' +
        'suggestions.placePrediction.text.text,' +
        'suggestions.placePrediction.structuredFormat.mainText.text,' +
        'suggestions.placePrediction.structuredFormat.secondaryText.text'
    );
    expect(headers.get('X-Goog-FieldMask')).toBe(
      GOOGLE_AUTOCOMPLETE_FIELD_MASK
    );
    expect(headers.get('X-Goog-FieldMask')).not.toContain('*');
  });

  test('city and street modes use fixed Google types without session tokens', async () => {
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({ suggestions: [] });
    };

    await autocomplete._handler(buildCtx(), {
      query: 'תל א',
      mode: 'city',
      sessionToken: 'must_be_ignored',
      url: 'https://attacker.test',
      includedPrimaryTypes: ['establishment'],
      includedRegionCodes: ['us'],
      languageCode: 'en',
      fieldMask: '*',
    });
    await autocomplete._handler(buildCtx(), {
      query: 'דיז',
      mode: 'street',
      selectedCity: { displayName: 'תל אביב-יפו' },
      streetQueryOnly: true,
    });

    const cityBody = JSON.parse(requests[0].init.body);
    expect(cityBody).toEqual({
      input: 'תל א',
      languageCode: 'he',
      regionCode: 'il',
      includedRegionCodes: ['il'],
      includedPrimaryTypes: ['(cities)'],
    });
    expect(cityBody).not.toHaveProperty('sessionToken');

    const streetBody = JSON.parse(requests[1].init.body);
    expect(streetBody).toEqual({
      input: 'דיז תל אביב-יפו',
      languageCode: 'he',
      regionCode: 'il',
      includedRegionCodes: ['il'],
      includedPrimaryTypes: ['route'],
    });
    expect(streetBody).not.toHaveProperty('sessionToken');
  });

  test('street primary request uses query plus selected City with one fetch when predictions are valid', async () => {
    const requests = [];
    let limiterCalls = 0;
    globalThis.fetch = async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return Response.json({
        suggestions: [
          {
            placePrediction: {
              placeId: 'street_primary_1',
              text: { text: 'הנשיא, טבריה, ישראל' },
              structuredFormat: {
                mainText: { text: 'הנשיא' },
                secondaryText: { text: 'טבריה, ישראל' },
              },
            },
          },
        ],
      });
    };

    const result = await autocomplete._handler(
      buildCtx({
        runMutation: async () => {
          limiterCalls += 1;
        },
      }),
      {
        query: ' הנ ',
        mode: 'street',
        selectedCity: { displayName: ' טבריה ' },
      }
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      input: 'הנ טבריה',
      languageCode: 'he',
      regionCode: 'il',
      includedRegionCodes: ['il'],
      includedPrimaryTypes: ['route'],
    });
    expect(requests[0].input).not.toContain(',');
    expect(requests[0]).not.toHaveProperty('sessionToken');
    expect(limiterCalls).toBe(1);
    expect(result.map((suggestion) => suggestion.placeId)).toEqual([
      'street_primary_1',
    ]);
  });

  test('successful empty street primary response performs one City-filtered query-only fallback', async () => {
    const requests = [];
    let limiterCalls = 0;
    let fetchCount = 0;
    globalThis.fetch = async (_url, init) => {
      fetchCount += 1;
      requests.push(JSON.parse(init.body));
      if (fetchCount === 1) {
        return Response.json({ suggestions: [] });
      }
      return Response.json({
        suggestions: [
          {
            placePrediction: {
              placeId: 'wrong_city',
              text: { text: 'הנשיא, חיפה, ישראל' },
              structuredFormat: {
                mainText: { text: 'הנשיא' },
                secondaryText: { text: 'חיפה, ישראל' },
              },
            },
          },
          ...Array.from({ length: 6 }, (_, index) => ({
            placePrediction: {
              placeId: `tiberias_${index}`,
              text: { text: `הנשיא ${index}, טבריה, ישראל` },
              structuredFormat: {
                mainText: { text: `הנשיא ${index}` },
                secondaryText: {
                  text: index === 0 ? 'מחוז הצפון' : 'טבריה, ישראל',
                },
              },
            },
          })),
        ],
      });
    };

    const result = await autocomplete._handler(
      buildCtx({
        runMutation: async () => {
          limiterCalls += 1;
        },
      }),
      {
        query: 'הנ',
        mode: 'street',
        selectedCity: { displayName: 'טבריה' },
      }
    );

    expect(fetchCount).toBe(2);
    expect(limiterCalls).toBe(1);
    expect(requests[0].input).toBe('הנ טבריה');
    expect(requests[1]).toEqual({
      input: 'הנ',
      languageCode: 'he',
      regionCode: 'il',
      includedRegionCodes: ['il'],
      includedPrimaryTypes: ['route'],
    });
    expect(requests[1]).not.toHaveProperty('sessionToken');
    expect(result).toHaveLength(5);
    expect(result.some((suggestion) => suggestion.placeId === 'wrong_city')).toBe(
      false
    );
    expect(result.map((suggestion) => suggestion.placeId)).toEqual([
      'tiberias_1',
      'tiberias_2',
      'tiberias_3',
      'tiberias_4',
      'tiberias_5',
    ]);
  });

  for (const {
    label,
    selectedCity,
    prediction,
    expectedPlaceIds,
  } of [
    {
      label: 'retains an exact structured Tiberias locality segment',
      selectedCity: 'טבריה',
      prediction: autocompletePrediction({
        placeId: 'structured_tiberias',
        mainText: 'הופיין',
        description: 'הופיין, טבריה, ישראל',
        secondaryText: 'טבריה, ישראל',
      }),
      expectedPlaceIds: ['structured_tiberias'],
    },
    {
      label: 'rejects Haifa found only in the Kiryat Ata district segment',
      selectedCity: 'חיפה',
      prediction: autocompletePrediction({
        placeId: 'kiryat_ata_haifa_district',
        mainText: 'העצמאות',
        description: 'העצמאות, קריית אתא, מחוז חיפה, ישראל',
        secondaryText: 'קריית אתא, מחוז חיפה, ישראל',
      }),
      expectedPlaceIds: [],
    },
    {
      label: 'rejects Jerusalem found only in the Maale Adumim district segment',
      selectedCity: 'ירושלים',
      prediction: autocompletePrediction({
        placeId: 'maale_adumim_jerusalem_district',
        mainText: 'דרך קדם',
        description: 'דרך קדם, מעלה אדומים, מחוז ירושלים, ישראל',
        secondaryText: 'מעלה אדומים, מחוז ירושלים, ישראל',
      }),
      expectedPlaceIds: [],
    },
    {
      label: 'rejects a related word instead of the exact Haifa locality',
      selectedCity: 'חיפה',
      prediction: autocompletePrediction({
        placeId: 'haifai_word',
        mainText: 'הנשיא',
        description: 'הנשיא, חיפאי, ישראל',
        secondaryText: 'חיפאי, ישראל',
      }),
      expectedPlaceIds: [],
    },
    {
      label: 'rejects missing secondary text with an unparseable description',
      selectedCity: 'טבריה',
      prediction: autocompletePrediction({
        placeId: 'missing_secondary_unparseable',
        mainText: 'הופיין',
        description: 'הופיין טבריה ישראל',
      }),
      expectedPlaceIds: [],
    },
    {
      label: 'rejects malformed secondary text even with a parseable description',
      selectedCity: 'טבריה',
      prediction: {
        placePrediction: {
          placeId: 'malformed_secondary_parseable',
          text: { text: 'הופיין, טבריה, ישראל' },
          structuredFormat: {
            mainText: { text: 'הופיין' },
            secondaryText: { text: 42 },
          },
        },
      },
      expectedPlaceIds: [],
    },
  ]) {
    test(`street fallback ${label}`, async () => {
      const { fetchCount, limiterCalls, requests, result } =
        await runStreetFallbackFilteringCase({ selectedCity, prediction });

      expect(fetchCount).toBe(2);
      expect(limiterCalls).toBe(1);
      expect(requests).toHaveLength(2);
      expect(requests[0].input).toBe(`הו ${selectedCity}`);
      expect(requests[1]).toEqual({
        input: 'הו',
        languageCode: 'he',
        regionCode: 'il',
        includedRegionCodes: ['il'],
        includedPrimaryTypes: ['route'],
      });
      expect(requests[1]).not.toHaveProperty('sessionToken');
      expect(result.map((suggestion) => suggestion.placeId)).toEqual(
        expectedPlaceIds
      );
    });
  }

  for (const {
    label,
    selectedCity,
    prediction,
    expectedPlaceIds,
  } of [
    {
      label: 'accepts exact route locality and Israel description segments',
      selectedCity: 'טבריה',
      prediction: autocompletePrediction({
        placeId: 'description_tiberias',
        mainText: 'הופיין',
        description: 'הופיין, טבריה, ישראל',
      }),
      expectedPlaceIds: ['description_tiberias'],
    },
    {
      label: 'rejects a selected City found only in a later district segment',
      selectedCity: 'חיפה',
      prediction: autocompletePrediction({
        placeId: 'description_haifa_district',
        mainText: 'העצמאות',
        description: 'העצמאות, קריית אתא, מחוז חיפה, ישראל',
      }),
      expectedPlaceIds: [],
    },
    {
      label: 'rejects another City in the immediate locality segment',
      selectedCity: 'טבריה',
      prediction: autocompletePrediction({
        placeId: 'description_wrong_locality',
        mainText: 'הנשיא',
        description: 'הנשיא, חיפה, ישראל',
      }),
      expectedPlaceIds: [],
    },
    {
      label: 'rejects a description whose first segment differs from main text',
      selectedCity: 'טבריה',
      prediction: autocompletePrediction({
        placeId: 'description_main_mismatch',
        mainText: 'הנשיא',
        description: 'הופיין, טבריה, ישראל',
      }),
      expectedPlaceIds: [],
    },
    {
      label: 'rejects a description with missing structural segments',
      selectedCity: 'טבריה',
      prediction: autocompletePrediction({
        placeId: 'description_missing_segments',
        mainText: 'הופיין',
        description: 'הופיין, טבריה',
      }),
      expectedPlaceIds: [],
    },
    {
      label: 'rejects a description with an empty malformed segment',
      selectedCity: 'טבריה',
      prediction: autocompletePrediction({
        placeId: 'description_empty_segment',
        mainText: 'הופיין',
        description: 'הופיין,, טבריה, ישראל',
      }),
      expectedPlaceIds: [],
    },
  ]) {
    test(`street fallback without structured secondary ${label}`, async () => {
      const { fetchCount, limiterCalls, requests, result } =
        await runStreetFallbackFilteringCase({ selectedCity, prediction });

      expect(fetchCount).toBe(2);
      expect(limiterCalls).toBe(1);
      expect(requests).toHaveLength(2);
      expect(requests[0].input).toBe(`הו ${selectedCity}`);
      expect(requests[1]).toEqual({
        input: 'הו',
        languageCode: 'he',
        regionCode: 'il',
        includedRegionCodes: ['il'],
        includedPrimaryTypes: ['route'],
      });
      expect(requests[1]).not.toHaveProperty('sessionToken');
      expect(result.map((suggestion) => suggestion.placeId)).toEqual(
        expectedPlaceIds
      );
    });
  }

  test('failed street primary request does not run the fallback', async () => {
    let fetchCount = 0;
    let limiterCalls = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return new Response('{}', { status: 503 });
    };

    const message = await getErrorMessage(() =>
      autocomplete._handler(
        buildCtx({
          runMutation: async () => {
            limiterCalls += 1;
          },
        }),
        {
          query: 'הנ',
          mode: 'street',
          selectedCity: { displayName: 'טבריה' },
        }
      )
    );

    expect(message).toBe('PLACES_SERVICE_UNAVAILABLE');
    expect(fetchCount).toBe(1);
    expect(limiterCalls).toBe(1);
  });

  test('street limiter denial causes zero primary and fallback fetches', async () => {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return Response.json({ suggestions: [] });
    };

    const error = await getThrownError(() =>
      autocomplete._handler(
        buildCtx({
          runMutation: async () => {
            throw new ConvexError({
              code: 'PLACES_RATE_LIMITED',
              retryAfterMs: 2500,
            });
          },
        }),
        {
          query: 'הנ',
          mode: 'street',
          selectedCity: { displayName: 'טבריה' },
        }
      )
    );

    expect(error.data).toEqual({
      code: 'PLACES_RATE_LIMITED',
      retryAfterMs: 2500,
    });
    expect(fetchCount).toBe(0);
  });

  test('street mode requires only validated application city context', async () => {
    let fetchCount = 0;
    let limiterCalls = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return Response.json({ suggestions: [] });
    };

    await expect(
      getErrorMessage(() =>
        autocomplete._handler(
          buildCtx({
            runMutation: async () => {
              limiterCalls += 1;
            },
          }),
          { query: 'דיז', mode: 'street' }
        )
      )
    ).resolves.toBe('PLACES_CITY_CONTEXT_INVALID');
    expect(limiterCalls).toBe(0);
    expect(fetchCount).toBe(0);
  });

  for (const { label, character } of RAW_CONTROL_CASES) {
    test(`street mode rejects selected City context containing ${label} before limiter and fetch`, async () => {
      let fetchCount = 0;
      let limiterCalls = 0;
      globalThis.fetch = async () => {
        fetchCount += 1;
        return Response.json({ suggestions: [] });
      };

      const message = await getErrorMessage(() =>
        autocomplete._handler(
          buildCtx({
            runMutation: async () => {
              limiterCalls += 1;
            },
          }),
          {
            query: 'דיז',
            mode: 'street',
            selectedCity: { displayName: `תל${character}אביב` },
          }
        )
      );

      expect(message).toBe('PLACES_CITY_CONTEXT_INVALID');
      expect(message).not.toContain('TypeError');
      expect(message).not.toContain('control');
      expect(limiterCalls).toBe(0);
      expect(fetchCount).toBe(0);
    });
  }

  test('autocomplete filters query predictions, malformed place predictions and bounds count', () => {
    const suggestions = normalizeGoogleAutocompleteResponse({
      suggestions: [
        { queryPrediction: { text: { text: 'coffee near Tel Aviv' } } },
        { placePrediction: { placeId: '', text: { text: 'Missing ID' } } },
        ...Array.from({ length: 7 }, (_, index) => ({
          placePrediction: {
            placeId: `place_${index}`,
            text: {
              text:
                index === 0
                  ? 'Neighborhood Cafe, Tel Aviv, Israel'
                  : `Dizengoff ${index}, Tel Aviv, Israel`,
            },
            structuredFormat: {
              mainText: {
                text: index === 0 ? 'Neighborhood Cafe' : `Dizengoff ${index}`,
              },
              secondaryText: { text: 'Tel Aviv' },
            },
          },
        })),
      ],
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

  test('autocomplete action ignores malformed scalar fields without dropping valid predictions', async () => {
    globalThis.fetch = async () =>
      Response.json({
        suggestions: [
          {
            placePrediction: {
              placeId: 42,
              text: { text: 'Non-string place ID' },
            },
          },
          {
            placePrediction: {
              placeId: 'invalid_description',
              text: { text: 42 },
            },
          },
          {
            placePrediction: {
              placeId: 'valid_with_malformed_main',
              text: { text: 'Cafe Main, Tel Aviv' },
              structuredFormat: {
                mainText: { text: 42 },
                secondaryText: { text: 'Tel Aviv' },
              },
            },
          },
          {
            placePrediction: {
              placeId: 'valid_with_malformed_secondary',
              text: { text: 'Cafe Secondary, Haifa' },
              structuredFormat: {
                mainText: { text: 'Cafe Secondary' },
                secondaryText: { text: 42 },
              },
            },
          },
          {
            placePrediction: {
              placeId: 'valid_place',
              text: { text: 'Valid Cafe, Jerusalem' },
              structuredFormat: {
                mainText: { text: 'Valid Cafe' },
                secondaryText: { text: 'Jerusalem' },
              },
            },
          },
        ],
      });

    await expect(
      autocomplete._handler(buildCtx(), {
        query: 'cafe',
        sessionToken: 'session_1',
      })
    ).resolves.toEqual([
      {
        description: 'Cafe Main, Tel Aviv',
        placeId: 'valid_with_malformed_main',
        primaryText: 'Cafe Main, Tel Aviv',
        secondaryText: 'Tel Aviv',
      },
      {
        description: 'Cafe Secondary, Haifa',
        placeId: 'valid_with_malformed_secondary',
        primaryText: 'Cafe Secondary',
        secondaryText: '',
      },
      {
        description: 'Valid Cafe, Jerusalem',
        placeId: 'valid_place',
        primaryText: 'Valid Cafe',
        secondaryText: 'Jerusalem',
      },
    ]);
  });

  test('autocomplete handles empty and malformed New API responses safely', async () => {
    expect(normalizeGoogleAutocompleteResponse({})).toEqual([]);

    const message = await getErrorMessage(async () =>
      normalizeGoogleAutocompleteResponse({ suggestions: {} })
    );

    expect(message).toBe('PLACES_SERVICE_UNAVAILABLE');
    expect(message).not.toContain('server-only-test-key');
  });

  test('missing Places key is a configuration error', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    let limiterCalls = 0;

    const message = await getErrorMessage(() =>
      autocomplete._handler(
        buildCtx({
          runMutation: async () => {
            limiterCalls += 1;
          },
        }),
        {
          query: 'coffee',
          sessionToken: 'session_1',
        }
      )
    );

    expect(message).toBe('PLACES_CONFIGURATION_MISSING');
    expect(limiterCalls).toBe(0);
  });

  test('place details rejects unauthenticated callers and invalid ids', async () => {
    let limiterCalls = 0;
    await expect(
      getErrorMessage(() =>
        placeDetails._handler(
          buildCtx({
            authenticated: false,
            runMutation: async () => {
              limiterCalls += 1;
            },
          }),
          {
            placeId: 'place_1',
            sessionToken: 'session_1',
          }
        )
      )
    ).resolves.toBe('PLACES_UNAUTHENTICATED');

    await expect(
      getErrorMessage(() =>
        placeDetails._handler(
          buildCtx({
            runMutation: async () => {
              limiterCalls += 1;
            },
          }),
          {
            placeId: '',
            sessionToken: 'session_1',
          }
        )
      )
    ).resolves.toBe('PLACES_PLACE_ID_REQUIRED');
    expect(limiterCalls).toBe(0);
  });

  test('place details gets the URL-encoded New API resource with Hebrew, region and session parameters', async () => {
    let capturedUrl;
    let capturedInit;
    let fetchCount = 0;
    const limiterArgs = [];
    globalThis.fetch = async (url, init) => {
      fetchCount += 1;
      capturedUrl = String(url);
      capturedInit = init;
      return Response.json({
        id: 'place/with space?',
        formattedAddress: 'דרך מנחם בגין 132, תל אביב-יפו',
        location: { latitude: 32.074, longitude: 34.792 },
        addressComponents: [
          {
            longText: 'תל אביב-יפו',
            shortText: 'תל אביב-יפו',
            types: ['locality', 'political'],
          },
          {
            longText: 'דרך מנחם בגין',
            shortText: 'דרך מנחם בגין',
            types: ['route'],
          },
          {
            longText: '132',
            shortText: '132',
            types: ['street_number'],
          },
        ],
      });
    };

    const result = await placeDetails._handler(
      buildCtx({
        tokenIdentifier: 'issuer|details-user',
        runMutation: async (_reference, args) => {
          limiterArgs.push(args);
          return null;
        },
      }),
      {
        placeId: 'place/with space?',
        sessionToken: 'session_1',
      }
    );
    const url = new URL(capturedUrl);
    const headers = new Headers(capturedInit.headers);

    expect(url.origin + url.pathname).toBe(
      'https://places.googleapis.com/v1/places/place%2Fwith%20space%3F'
    );
    expect(url.searchParams.get('languageCode')).toBe('he');
    expect(url.searchParams.get('regionCode')).toBe('il');
    expect(url.searchParams.get('sessionToken')).toBe('session_1');
    expect(capturedInit.method).toBe('GET');
    expect(capturedInit.body).toBeUndefined();
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Goog-Api-Key')).toBe('server-only-test-key');
    expect(headers.get('X-Goog-FieldMask')).toBe(
      GOOGLE_PLACE_DETAILS_FIELD_MASK
    );
    expect(capturedUrl).not.toContain('server-only-test-key');
    expect(limiterArgs).toEqual([
      {
        operation: 'placeDetails',
        userKey: 'issuer|details-user',
      },
    ]);
    expect(fetchCount).toBe(1);
    expect(result).toEqual({
      placeId: 'place/with space?',
      formattedAddress: 'דרך מנחם בגין 132, תל אביב-יפו',
      lat: 32.074,
      lng: 34.792,
      city: 'תל אביב-יפו',
      street: 'דרך מנחם בגין',
      streetNumber: '132',
    });
  });

  test('limiter denial blocks autocomplete and place details fetches', async () => {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return Response.json({});
    };
    const deniedCtx = buildCtx({
      runMutation: async () => {
        throw new ConvexError({
          code: 'PLACES_RATE_LIMITED',
          retryAfterMs: 2500,
        });
      },
    });

    const autocompleteError = await getThrownError(() =>
      autocomplete._handler(deniedCtx, {
        query: 'coffee',
        sessionToken: 'session_1',
      })
    );
    const detailsError = await getThrownError(() =>
      placeDetails._handler(deniedCtx, {
        placeId: 'place_1',
        sessionToken: 'session_1',
      })
    );

    expect(autocompleteError.data).toEqual({
      code: 'PLACES_RATE_LIMITED',
      retryAfterMs: 2500,
    });
    expect(detailsError.data).toEqual({
      code: 'PLACES_RATE_LIMITED',
      retryAfterMs: 2500,
    });
    expect(fetchCount).toBe(0);
  });

  test('unexpected limiter failures fail closed before Google fetch', async () => {
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return Response.json({});
    };

    const error = await getThrownError(() =>
      autocomplete._handler(
        buildCtx({
          runMutation: async () => {
            throw new Error(
              'component placesAutocompleteGlobalDailyV1 failed for secret-user'
            );
          },
        }),
        {
          query: 'coffee',
          sessionToken: 'session_1',
        }
      )
    );

    expect(error.data).toEqual({ code: 'PLACES_SERVICE_UNAVAILABLE' });
    expect(JSON.stringify(error.data)).not.toContain('GlobalDaily');
    expect(JSON.stringify(error.data)).not.toContain('secret-user');
    expect(fetchCount).toBe(0);
  });

  test('place details request builder uses the exact minimal field mask', () => {
    const request = buildGoogleDetailsRequest({
      apiKey: 'key',
      placeId: 'place_1',
      sessionToken: 'session_1',
    });
    const headers = new Headers(request.init.headers);

    expect(GOOGLE_PLACE_DETAILS_FIELD_MASK).toBe(
      'id,formattedAddress,location,addressComponents'
    );
    expect(headers.get('X-Goog-FieldMask')).toBe(
      GOOGLE_PLACE_DETAILS_FIELD_MASK
    );
    expect(headers.get('X-Goog-FieldMask')).not.toContain('*');
    expect(headers.get('X-Goog-FieldMask')).not.toContain('displayName');
  });

  test('place details preserves city fallback and empty supported address fields', () => {
    const details = normalizeGooglePlaceDetails({
      id: 'place_1',
      formattedAddress: 'Azrieli Center, Tel Aviv, Israel',
      location: { latitude: 32.074, longitude: 34.792 },
      addressComponents: [
        {
          longText: 'Tel Aviv District',
          shortText: 'TA',
          types: ['administrative_area_level_1'],
        },
      ],
    });

    expect(details).toEqual({
      placeId: 'place_1',
      formattedAddress: 'Azrieli Center, Tel Aviv, Israel',
      lat: 32.074,
      lng: 34.792,
      city: 'Tel Aviv District',
      street: '',
      streetNumber: '',
    });
  });

  test('place details rejects malformed New API responses', async () => {
    await expect(
      getErrorMessage(async () =>
        normalizeGooglePlaceDetails({
          id: 'place_1',
          formattedAddress: '',
          location: { latitude: 32.08, longitude: 34.78 },
          addressComponents: [],
        })
      )
    ).resolves.toBe('PLACES_INVALID_DETAILS');

    await expect(
      getErrorMessage(async () =>
        normalizeGooglePlaceDetails({
          id: 'place_1',
          formattedAddress: 'Dizengoff 100, Tel Aviv',
          location: { latitude: Number.NaN, longitude: 34.78 },
          addressComponents: [],
        })
      )
    ).resolves.toBe('PLACES_INVALID_DETAILS');
  });

  test('place details action normalizes non-string mandatory scalar fields', async () => {
    globalThis.fetch = async () =>
      Response.json({
        id: 42,
        formattedAddress: 'Dizengoff 100, Tel Aviv',
        location: { latitude: 32.08, longitude: 34.78 },
        addressComponents: [],
      });

    const invalidIdMessage = await getErrorMessage(() =>
      placeDetails._handler(buildCtx(), {
        placeId: 'place_1',
        sessionToken: 'session_1',
      })
    );
    expect(invalidIdMessage).toBe('PLACES_INVALID_DETAILS');
    expect(invalidIdMessage).not.toContain('TypeError');

    globalThis.fetch = async () =>
      Response.json({
        id: 'place_1',
        formattedAddress: 42,
        location: { latitude: 32.08, longitude: 34.78 },
        addressComponents: [],
      });

    const invalidAddressMessage = await getErrorMessage(() =>
      placeDetails._handler(buildCtx(), {
        placeId: 'place_1',
        sessionToken: 'session_1',
      })
    );
    expect(invalidAddressMessage).toBe('PLACES_INVALID_DETAILS');
    expect(invalidAddressMessage).not.toContain('TypeError');
  });

  test('upstream HTTP and malformed JSON errors normalize without leaking the API key', async () => {
    globalThis.fetch = async () =>
      new Response('server-only-test-key', { status: 429 });
    await expect(
      getErrorMessage(() =>
        autocomplete._handler(buildCtx(), {
          query: 'coffee',
          sessionToken: 'session_1',
        })
      )
    ).resolves.toBe('PLACES_RATE_LIMITED');

    globalThis.fetch = async () => new Response('{}', { status: 503 });
    await expect(
      getErrorMessage(() =>
        placeDetails._handler(buildCtx(), {
          placeId: 'place_1',
          sessionToken: 'session_1',
        })
      )
    ).resolves.toBe('PLACES_SERVICE_UNAVAILABLE');

    globalThis.fetch = async () => new Response('{}', { status: 404 });
    await expect(
      getErrorMessage(() =>
        placeDetails._handler(buildCtx(), {
          placeId: 'missing_place',
          sessionToken: 'session_1',
        })
      )
    ).resolves.toBe('PLACES_NO_RESULTS');

    globalThis.fetch = async () => new Response('{}', { status: 403 });
    await expect(
      getErrorMessage(() =>
        autocomplete._handler(buildCtx(), {
          query: 'coffee',
          sessionToken: 'session_1',
        })
      )
    ).resolves.toBe('PLACES_SERVICE_UNAVAILABLE');

    globalThis.fetch = async () => new Response('{', { status: 200 });
    const malformedMessage = await getErrorMessage(() =>
      autocomplete._handler(buildCtx(), {
        query: 'coffee',
        sessionToken: 'session_1',
      })
    );
    expect(malformedMessage).toBe('PLACES_SERVICE_UNAVAILABLE');
    expect(malformedMessage).not.toContain('server-only-test-key');
  });

  test('address resolution uses the exact v4 structured request and minimal headers', async () => {
    let capturedUrl;
    let capturedInit;
    const limiterArgs = [];
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Response.json({ results: [geocodingCandidate()] });
    };

    const result = await resolveAddress._handler(
      buildCtx({
        tokenIdentifier: 'issuer|resolution-user',
        runMutation: async (_reference, args) => {
          limiterArgs.push(args);
          return null;
        },
      }),
      { city: ' תל  אביב-יפו ', street: ' דיזנגוף ', streetNumber: ' 100 ' }
    );
    const url = new URL(capturedUrl);
    const headers = new Headers(capturedInit.headers);

    expect(url.origin + url.pathname).toBe(
      'https://geocode.googleapis.com/v4/geocode/address'
    );
    expect(url.searchParams.get('address.addressLines')).toBe('דיזנגוף 100');
    expect(url.searchParams.get('address.locality')).toBe('תל אביב-יפו');
    expect(url.searchParams.get('address.regionCode')).toBe('IL');
    expect(url.searchParams.get('languageCode')).toBe('he');
    expect(url.searchParams.get('regionCode')).toBe('il');
    expect(capturedInit.method).toBe('GET');
    expect(capturedInit.body).toBeUndefined();
    expect(headers.get('X-Goog-Api-Key')).toBe('server-only-test-key');
    expect(headers.get('X-Goog-FieldMask')).toBe(
      GOOGLE_ADDRESS_RESOLUTION_FIELD_MASK
    );
    expect(GOOGLE_ADDRESS_RESOLUTION_FIELD_MASK).toBe(
      'results.placeId,results.location,results.granularity,' +
        'results.formattedAddress,results.addressComponents,results.types'
    );
    expect(GOOGLE_ADDRESS_RESOLUTION_FIELD_MASK).not.toContain('*');
    expect(capturedUrl).not.toContain('server-only-test-key');
    expect(limiterArgs).toEqual([
      {
        operation: 'addressResolution',
        userKey: 'issuer|resolution-user',
      },
    ]);
    expect(result).toEqual({
      status: 'resolved',
      address: {
        placeId: 'resolved_place_1',
        formattedAddress: 'דיזנגוף 100, תל אביב-יפו, ישראל',
        latitude: 32.0801,
        longitude: 34.7742,
        city: 'תל אביב-יפו',
        street: 'דיזנגוף',
        streetNumber: '100',
      },
    });
  });

  test('address candidate policy accepts exact rooftop and interpolated results', () => {
    const input = {
      city: 'תל אביב-יפו',
      street: 'דיזנגוף',
      streetNumber: '100',
    };
    expect(
      normalizeGoogleAddressResolutionResponse(
        { results: [geocodingCandidate()] },
        input
      ).status
    ).toBe('resolved');
    expect(
      normalizeGoogleAddressResolutionResponse(
        {
          results: [
            geocodingCandidate({ granularity: 'RANGE_INTERPOLATED' }),
          ],
        },
        input
      ).status
    ).toBe('resolved');
  });

  test('address candidate policy rejects approximate, wrong-country and incomplete results', () => {
    const input = {
      city: 'תל אביב-יפו',
      street: 'דיזנגוף',
      streetNumber: '100',
    };
    const withoutType = (candidate, type) => ({
      ...candidate,
      addressComponents: candidate.addressComponents.filter(
        (component) => !component.types.includes(type)
      ),
    });
    const wrongCountry = geocodingCandidate({
      addressComponents: geocodingCandidate().addressComponents.map(
        (component) =>
          component.types.includes('country')
            ? { ...component, shortText: 'US' }
            : component
      ),
    });

    for (const candidate of [
      geocodingCandidate({ granularity: 'APPROXIMATE' }),
      geocodingCandidate({ granularity: 'GEOMETRIC_CENTER' }),
      wrongCountry,
      withoutType(geocodingCandidate(), 'locality'),
      withoutType(geocodingCandidate(), 'route'),
      withoutType(geocodingCandidate(), 'street_number'),
      geocodingCandidate({ location: { latitude: Number.NaN, longitude: 34 } }),
      geocodingCandidate({ types: ['route'] }),
    ]) {
      expect(
        normalizeGoogleAddressResolutionResponse({ results: [candidate] }, input)
      ).toEqual({ status: 'notFound' });
    }
  });

  test('address candidate policy rejects mismatches and bounds ambiguity to three', () => {
    const input = {
      city: 'תל אביב-יפו',
      street: 'דיזנגוף',
      streetNumber: '100',
    };
    const mismatched = geocodingCandidate({
      addressComponents: geocodingCandidate().addressComponents.map(
        (component) =>
          component.types.includes('street_number')
            ? { ...component, longText: '101', shortText: '101' }
            : component
      ),
    });
    expect(
      normalizeGoogleAddressResolutionResponse({ results: [mismatched] }, input)
    ).toEqual({ status: 'notFound' });

    const candidates = Array.from({ length: 5 }, (_, index) =>
      geocodingCandidate({ placeId: `candidate_${index}` })
    );
    const result = normalizeGoogleAddressResolutionResponse(
      { results: candidates },
      input
    );
    expect(result.status).toBe('ambiguous');
    expect(result.candidates).toHaveLength(3);
  });

  test('address resolution validates before limits and limiter denial causes zero fetches', async () => {
    let fetchCount = 0;
    let limiterCalls = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return Response.json({});
    };

    await expect(
      getErrorMessage(() =>
        resolveAddress._handler(buildCtx({ authenticated: false }), {
          city: 'תל אביב-יפו',
          street: 'דיזנגוף',
          streetNumber: '100',
        })
      )
    ).resolves.toBe('PLACES_UNAUTHENTICATED');

    await expect(
      getErrorMessage(() =>
        resolveAddress._handler(
          buildCtx({
            runMutation: async () => {
              limiterCalls += 1;
            },
          }),
          { city: 'תל אביב', street: 'דיזנגוף', streetNumber: 'בית' }
        )
      )
    ).resolves.toBe('PLACES_INVALID_ADDRESS');
    expect(limiterCalls).toBe(0);

    delete process.env.GOOGLE_PLACES_API_KEY;
    await expect(
      getErrorMessage(() =>
        resolveAddress._handler(
          buildCtx({
            runMutation: async () => {
              limiterCalls += 1;
            },
          }),
          { city: 'תל אביב-יפו', street: 'דיזנגוף', streetNumber: '100' }
        )
      )
    ).resolves.toBe('PLACES_CONFIGURATION_MISSING');
    expect(limiterCalls).toBe(0);
    process.env.GOOGLE_PLACES_API_KEY = 'server-only-test-key';

    const denied = await getThrownError(() =>
      resolveAddress._handler(
        buildCtx({
          runMutation: async () => {
            throw new ConvexError({
              code: 'PLACES_RATE_LIMITED',
              retryAfterMs: 2500,
            });
          },
        }),
        { city: 'תל אביב-יפו', street: 'דיזנגוף', streetNumber: '100' }
      )
    );
    expect(denied.data).toEqual({
      code: 'PLACES_RATE_LIMITED',
      retryAfterMs: 2500,
    });
    expect(fetchCount).toBe(0);
  });

  for (const field of ['city', 'street', 'streetNumber']) {
    for (const { label, character } of RAW_CONTROL_CASES) {
      test(`address resolution rejects ${field} containing ${label} before limiter and fetch`, async () => {
        let fetchCount = 0;
        let limiterCalls = 0;
        globalThis.fetch = async () => {
          fetchCount += 1;
          return Response.json({ results: [] });
        };
        const input = {
          city: 'תל אביב-יפו',
          street: 'דיזנגוף',
          streetNumber: '100',
        };
        const safeValueByField = {
          city: `תל${character}אביב`,
          street: `דיז${character}נגוף`,
          streetNumber: `12${character}1`,
        };

        const message = await getErrorMessage(() =>
          resolveAddress._handler(
            buildCtx({
              runMutation: async () => {
                limiterCalls += 1;
              },
            }),
            { ...input, [field]: safeValueByField[field] }
          )
        );

        expect(message).toBe('PLACES_INVALID_ADDRESS');
        expect(message).not.toContain('TypeError');
        expect(message).not.toContain('control');
        expect(limiterCalls).toBe(0);
        expect(fetchCount).toBe(0);
      });
    }
  }

  test('address resolution sanitizes malformed JSON and network errors', async () => {
    globalThis.fetch = async () => new Response('{', { status: 200 });
    const malformed = await getErrorMessage(() =>
      resolveAddress._handler(buildCtx(), {
        city: 'תל אביב-יפו',
        street: 'דיזנגוף',
        streetNumber: '100',
      })
    );
    expect(malformed).toBe('PLACES_SERVICE_UNAVAILABLE');
    expect(malformed).not.toContain('server-only-test-key');

    globalThis.fetch = async () => {
      throw new Error('upstream headers server-only-test-key');
    };
    const network = await getErrorMessage(() =>
      resolveAddress._handler(buildCtx(), {
        city: 'תל אביב-יפו',
        street: 'דיזנגוף',
        streetNumber: '100',
      })
    );
    expect(network).toBe('PLACES_SERVICE_UNAVAILABLE');
    expect(network).not.toContain('server-only-test-key');
  });

  test('request timeout aborts the upstream request and returns the normalized timeout error', async () => {
    globalThis.setTimeout = (callback) => {
      queueMicrotask(callback);
      return 1;
    };
    globalThis.fetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => {
            const error = new Error('request aborted');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true }
        );
      });

    const message = await getErrorMessage(() =>
      autocomplete._handler(buildCtx(), {
        query: 'coffee',
        sessionToken: 'session_1',
      })
    );
    const resolutionMessage = await getErrorMessage(() =>
      resolveAddress._handler(buildCtx(), {
        city: 'תל אביב-יפו',
        street: 'דיזנגוף',
        streetNumber: '100',
      })
    );

    expect(message).toBe('PLACES_TIMEOUT');
    expect(resolutionMessage).toBe('PLACES_TIMEOUT');
    expect(message).not.toContain('server-only-test-key');
    expect(resolutionMessage).not.toContain('server-only-test-key');
  });

  test('network errors cannot expose the credential through a request URL or action error', async () => {
    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = String(url);
      throw new Error(`failed request to ${capturedUrl}`);
    };

    const message = await getErrorMessage(() =>
      placeDetails._handler(buildCtx(), {
        placeId: 'place_1',
        sessionToken: 'session_1',
      })
    );

    expect(capturedUrl).not.toContain('server-only-test-key');
    expect(message).toBe('PLACES_SERVICE_UNAVAILABLE');
    expect(message).not.toContain('server-only-test-key');
  });
});
