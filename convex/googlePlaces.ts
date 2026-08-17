import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalQuery } from './_generated/server';
import { normalizeGooglePlacesLimiterError } from './googlePlacesRateLimits';
import { getCurrentUserOrNull } from './guards';

export type GooglePlacesAutocompleteMode = 'default' | 'city' | 'street';

type GooglePlacesAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
};

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GooglePlacesDetailsResponse = {
  id?: string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: AddressComponent[];
};

type GoogleGeocodingResult = {
  placeId?: string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  granularity?: string;
  addressComponents?: AddressComponent[];
  types?: string[];
};

type GoogleGeocodingResponse = {
  results?: GoogleGeocodingResult[];
};

export type ResolvedBusinessAddress = {
  placeId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  city: string;
  street: string;
  streetNumber: string;
};

const GOOGLE_PLACES_BASE_URL = 'https://places.googleapis.com/v1';
const GOOGLE_GEOCODING_ADDRESS_URL =
  'https://geocode.googleapis.com/v4/geocode/address';
const REQUEST_TIMEOUT_MS = 5000;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;
const MAX_PLACE_ID_LENGTH = 256;
const MAX_SESSION_TOKEN_LENGTH = 128;
const MAX_SUGGESTIONS = 5;
const MAX_AUTOCOMPLETE_PREDICTIONS_TO_INSPECT = 10;
const MAX_PREDICTION_TEXT_LENGTH_TO_COMPARE = 240;
const MAX_ADDRESS_FIELD_LENGTH = 120;
const MAX_STREET_NUMBER_LENGTH = 16;
const MAX_GEOCODING_RESULTS_TO_INSPECT = 10;
const MAX_ACCEPTED_GEOCODING_CANDIDATES = 3;
const RAW_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F]/;
const hasLiveUserForPlacesRef = makeFunctionReference<
  'query',
  Record<string, never>,
  boolean
>('googlePlaces:hasLiveUserForPlaces');

export const GOOGLE_AUTOCOMPLETE_FIELD_MASK = [
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.text.text',
  'suggestions.placePrediction.structuredFormat.mainText.text',
  'suggestions.placePrediction.structuredFormat.secondaryText.text',
].join(',');

export const GOOGLE_PLACE_DETAILS_FIELD_MASK = [
  'id',
  'formattedAddress',
  'location',
  'addressComponents',
].join(',');

export const GOOGLE_ADDRESS_RESOLUTION_FIELD_MASK = [
  'results.placeId',
  'results.location',
  'results.granularity',
  'results.formattedAddress',
  'results.addressComponents',
  'results.types',
].join(',');

const PLACE_SUGGESTION_VALIDATOR = v.object({
  description: v.string(),
  placeId: v.string(),
  primaryText: v.string(),
  secondaryText: v.string(),
});

const PLACE_DETAILS_VALIDATOR = v.object({
  formattedAddress: v.string(),
  placeId: v.string(),
  lat: v.number(),
  lng: v.number(),
  city: v.string(),
  street: v.string(),
  streetNumber: v.string(),
});

const SELECTED_BUSINESS_ADDRESS_VALIDATOR = v.object({
  placeId: v.string(),
  formattedAddress: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  city: v.string(),
  street: v.string(),
  streetNumber: v.string(),
});

const ADDRESS_RESOLUTION_RESULT_VALIDATOR = v.union(
  v.object({
    status: v.literal('resolved'),
    address: SELECTED_BUSINESS_ADDRESS_VALIDATOR,
  }),
  v.object({
    status: v.literal('ambiguous'),
    candidates: v.array(SELECTED_BUSINESS_ADDRESS_VALIDATOR),
  }),
  v.object({ status: v.literal('notFound') })
);

function getGooglePlacesApiKey() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('PLACES_CONFIGURATION_MISSING');
  }
  return apiKey;
}

async function requireAuthenticatedIdentity(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error('PLACES_UNAUTHENTICATED');
  }
  const hasLiveUser = await ctx.runQuery(hasLiveUserForPlacesRef, {});
  if (!hasLiveUser) {
    throw new Error('PLACES_UNAUTHENTICATED');
  }
  return identity;
}

export const hasLiveUserForPlaces = internalQuery({
  args: {},
  handler: async (ctx) => (await getCurrentUserOrNull(ctx)) !== null,
});

async function consumePlacesRateLimit(
  ctx: any,
  operation: 'autocomplete' | 'placeDetails' | 'addressResolution',
  userKey: string
) {
  try {
    await ctx.runMutation(internal.googlePlacesRateLimits.consume, {
      operation,
      userKey,
    });
  } catch (error) {
    throw normalizeGooglePlacesLimiterError(error);
  }
}

function normalizeQuery(query: string) {
  const normalized = query.trim().replace(/\s+/g, ' ');
  if (normalized.length < MIN_QUERY_LENGTH) {
    return '';
  }
  if (normalized.length > MAX_QUERY_LENGTH) {
    throw new Error('PLACES_QUERY_TOO_LONG');
  }
  return normalized;
}

function normalizeSelectedCityDisplayName(value: string) {
  assertNoRawControlCharacters(value, 'PLACES_CITY_CONTEXT_INVALID');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (
    normalized.length < MIN_QUERY_LENGTH ||
    normalized.length > MAX_ADDRESS_FIELD_LENGTH
  ) {
    throw new Error('PLACES_CITY_CONTEXT_INVALID');
  }
  return normalized;
}

function assertNoRawControlCharacters(value: string, errorCode: string) {
  if (RAW_CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new Error(errorCode);
  }
}

function normalizePlaceId(placeId: string) {
  const normalized = placeId.trim();
  if (!normalized) {
    throw new Error('PLACES_PLACE_ID_REQUIRED');
  }
  if (normalized.length > MAX_PLACE_ID_LENGTH) {
    throw new Error('PLACES_PLACE_ID_TOO_LONG');
  }
  return normalized;
}

function normalizeSessionToken(sessionToken: string | undefined) {
  const normalized = sessionToken?.trim() ?? '';
  if (!normalized || normalized.length > MAX_SESSION_TOKEN_LENGTH) {
    throw new Error('PLACES_SESSION_TOKEN_INVALID');
  }
  return normalized;
}

function buildGooglePlacesHeaders(apiKey: string, fieldMask: string) {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': fieldMask,
  };
}

export function buildGoogleAutocompleteRequest(args: {
  apiKey: string;
  query: string;
  sessionToken?: string;
  mode?: GooglePlacesAutocompleteMode;
  selectedCityDisplayName?: string;
  streetQueryOnly?: boolean;
}) {
  const mode = args.mode ?? 'default';
  const input =
    mode === 'street' && !args.streetQueryOnly
      ? `${args.query} ${args.selectedCityDisplayName ?? ''}`.trim()
      : args.query;
  const body = {
    input,
    languageCode: 'he',
    regionCode: 'il',
    includedRegionCodes: ['il'],
    ...(mode === 'city'
      ? { includedPrimaryTypes: ['(cities)'] }
      : mode === 'street'
        ? { includedPrimaryTypes: ['route'] }
        : { sessionToken: args.sessionToken }),
  };

  return {
    url: `${GOOGLE_PLACES_BASE_URL}/places:autocomplete`,
    init: {
      method: 'POST',
      headers: buildGooglePlacesHeaders(
        args.apiKey,
        GOOGLE_AUTOCOMPLETE_FIELD_MASK
      ),
      body: JSON.stringify(body),
    } satisfies RequestInit,
  };
}

export function buildGoogleDetailsRequest(args: {
  apiKey: string;
  placeId: string;
  sessionToken: string;
}) {
  const searchParams = new URLSearchParams({
    languageCode: 'he',
    regionCode: 'il',
    sessionToken: args.sessionToken,
  });

  return {
    url: `${GOOGLE_PLACES_BASE_URL}/places/${encodeURIComponent(
      args.placeId
    )}?${searchParams.toString()}`,
    init: {
      method: 'GET',
      headers: buildGooglePlacesHeaders(
        args.apiKey,
        GOOGLE_PLACE_DETAILS_FIELD_MASK
      ),
    } satisfies RequestInit,
  };
}

export function buildGoogleAddressResolutionRequest(args: {
  apiKey: string;
  city: string;
  street: string;
  streetNumber: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set(
    'address.addressLines',
    `${args.street} ${args.streetNumber}`
  );
  searchParams.set('address.locality', args.city);
  searchParams.set('address.regionCode', 'IL');
  searchParams.set('languageCode', 'he');
  searchParams.set('regionCode', 'il');

  return {
    url: `${GOOGLE_GEOCODING_ADDRESS_URL}?${searchParams.toString()}`,
    init: {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': args.apiKey,
        'X-Goog-FieldMask': GOOGLE_ADDRESS_RESOLUTION_FIELD_MASK,
      },
    } satisfies RequestInit,
  };
}

function getAddressComponent(components: AddressComponent[], type: string) {
  return components.find(
    (component) =>
      component &&
      Array.isArray(component.types) &&
      component.types.every((item) => typeof item === 'string') &&
      component.types.includes(type)
  );
}

function getLongAddressComponentText(
  components: AddressComponent[],
  type: string
) {
  return getTrimmedString(getAddressComponent(components, type)?.longText);
}

function getTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeGoogleAutocompleteResponse(
  payload: GooglePlacesAutocompleteResponse,
  maximumSuggestions = MAX_SUGGESTIONS,
  rejectMalformedSecondaryText = false
) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    (payload.suggestions !== undefined && !Array.isArray(payload.suggestions))
  ) {
    throw new Error('PLACES_SERVICE_UNAVAILABLE');
  }

  const boundedMaximum = Math.min(
    Math.max(0, maximumSuggestions),
    MAX_AUTOCOMPLETE_PREDICTIONS_TO_INSPECT
  );

  return (payload.suggestions ?? [])
    .slice(0, MAX_AUTOCOMPLETE_PREDICTIONS_TO_INSPECT)
    .map((suggestion) => {
      const prediction = suggestion?.placePrediction;
      const description = getTrimmedString(prediction?.text?.text);
      const placeId = getTrimmedString(prediction?.placeId);
      const rawSecondaryText =
        prediction?.structuredFormat?.secondaryText?.text;
      if (
        !description ||
        !placeId ||
        (rejectMalformedSecondaryText &&
          rawSecondaryText !== undefined &&
          typeof rawSecondaryText !== 'string')
      ) {
        return null;
      }
      return {
        description,
        placeId,
        primaryText:
          getTrimmedString(prediction?.structuredFormat?.mainText?.text) ||
          description,
        secondaryText: getTrimmedString(rawSecondaryText),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, boundedMaximum);
}

function normalizeAutocompleteGeographicSegment(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PREDICTION_TEXT_LENGTH_TO_COMPARE) {
    return '';
  }
  return trimmed
    .normalize('NFKC')
    .toLocaleLowerCase('he')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function splitBoundedPredictionSegments(
  value: string,
  preserveEmptySegments = false
) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PREDICTION_TEXT_LENGTH_TO_COMPARE) {
    return [];
  }
  const segments = trimmed
    .split(',')
    .map(normalizeAutocompleteGeographicSegment);
  return preserveEmptySegments ? segments : segments.filter(Boolean);
}

function isSuggestionAssociatedWithSelectedCity(
  suggestion: ReturnType<typeof normalizeGoogleAutocompleteResponse>[number],
  selectedCity: string
) {
  const normalizedSelectedCity =
    normalizeAutocompleteGeographicSegment(selectedCity);
  if (!normalizedSelectedCity) {
    return false;
  }

  if (suggestion.secondaryText) {
    const secondarySegments = splitBoundedPredictionSegments(
      suggestion.secondaryText
    );
    return secondarySegments[0] === normalizedSelectedCity;
  }

  const normalizedMainText = normalizeAutocompleteGeographicSegment(
    suggestion.primaryText
  );
  const descriptionSegments = splitBoundedPredictionSegments(
    suggestion.description,
    true
  );
  if (
    !normalizedMainText ||
    descriptionSegments.length !== 3 ||
    descriptionSegments[0] !== normalizedMainText ||
    descriptionSegments[1] !== normalizedSelectedCity
  ) {
    return false;
  }

  return ['ישראל', 'israel'].includes(descriptionSegments[2]);
}

function filterStreetSuggestionsForSelectedCity(
  suggestions: ReturnType<typeof normalizeGoogleAutocompleteResponse>,
  selectedCity: string
) {
  return suggestions
    .filter((suggestion) =>
      isSuggestionAssociatedWithSelectedCity(suggestion, selectedCity)
    )
    .slice(0, MAX_SUGGESTIONS);
}

export function normalizeGooglePlaceDetails(
  payload: GooglePlacesDetailsResponse
) {
  const lat = payload?.location?.latitude;
  const lng = payload?.location?.longitude;
  const formattedAddress = getTrimmedString(payload?.formattedAddress);
  const placeId = getTrimmedString(payload?.id);
  const components = Array.isArray(payload?.addressComponents)
    ? payload.addressComponents
    : [];

  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !formattedAddress ||
    !placeId
  ) {
    throw new Error('PLACES_INVALID_DETAILS');
  }

  const city =
    getLongAddressComponentText(components, 'locality') ||
    getLongAddressComponentText(components, 'administrative_area_level_2') ||
    getLongAddressComponentText(components, 'administrative_area_level_1') ||
    '';

  return {
    formattedAddress,
    placeId,
    lat,
    lng,
    city,
    street: getLongAddressComponentText(components, 'route'),
    streetNumber: getLongAddressComponentText(components, 'street_number'),
  };
}

function normalizeAddressComparison(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('he')
    .trim()
    .replace(/[\u05F3\u05F4'\u2019".,]/g, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ');
}

function normalizeStreetNumberComparison(value: string) {
  return normalizeAddressComparison(value).replace(/\s+/g, '');
}

function componentMatches(
  input: string,
  component: AddressComponent,
  normalizer: (value: string) => string = normalizeAddressComparison
) {
  const expected = normalizer(input);
  return [component.longText, component.shortText].some(
    (value) => typeof value === 'string' && normalizer(value) === expected
  );
}

function normalizeAddressResolutionInput(args: {
  city: string;
  street: string;
  streetNumber: string;
}) {
  assertNoRawControlCharacters(args.city, 'PLACES_INVALID_ADDRESS');
  assertNoRawControlCharacters(args.street, 'PLACES_INVALID_ADDRESS');
  assertNoRawControlCharacters(args.streetNumber, 'PLACES_INVALID_ADDRESS');

  const city = args.city.trim().replace(/\s+/g, ' ');
  const street = args.street.trim().replace(/\s+/g, ' ');
  const streetNumber = args.streetNumber.trim().replace(/\s+/g, ' ');

  if (
    !city ||
    city.length > MAX_ADDRESS_FIELD_LENGTH ||
    !street ||
    street.length > MAX_ADDRESS_FIELD_LENGTH ||
    !streetNumber ||
    streetNumber.length > MAX_STREET_NUMBER_LENGTH ||
    !/[0-9]/.test(streetNumber) ||
    !/^[0-9A-Za-z\u05D0-\u05EA\u05F3\u05F4 /-]+$/.test(streetNumber)
  ) {
    throw new Error('PLACES_INVALID_ADDRESS');
  }

  return { city, street, streetNumber };
}

function normalizeGeocodingCandidate(
  result: GoogleGeocodingResult,
  input: { city: string; street: string; streetNumber: string }
): ResolvedBusinessAddress | null {
  if (!result || typeof result !== 'object') {
    return null;
  }
  const placeId = getTrimmedString(result.placeId);
  const formattedAddress = getTrimmedString(result.formattedAddress);
  const latitude = result.location?.latitude;
  const longitude = result.location?.longitude;
  const components = Array.isArray(result.addressComponents)
    ? result.addressComponents
    : [];
  const types = Array.isArray(result.types)
    ? result.types.filter((type): type is string => typeof type === 'string')
    : [];
  const countryComponent = getAddressComponent(components, 'country');
  const cityComponent = getAddressComponent(components, 'locality');
  const routeComponent = getAddressComponent(components, 'route');
  const numberComponent = getAddressComponent(components, 'street_number');
  const city = getTrimmedString(cityComponent?.longText);
  const street = getTrimmedString(routeComponent?.longText);
  const streetNumber = getTrimmedString(numberComponent?.longText);
  const hasExactAddressType = types.some((type) =>
    ['street_address', 'premise', 'subpremise'].includes(type)
  );
  const allowedGranularity =
    result.granularity === 'ROOFTOP' ||
    result.granularity === 'RANGE_INTERPOLATED';

  if (
    !placeId ||
    !formattedAddress ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    getTrimmedString(countryComponent?.shortText).toUpperCase() !== 'IL' ||
    !city ||
    !street ||
    !streetNumber ||
    !hasExactAddressType ||
    !allowedGranularity ||
    !componentMatches(input.city, cityComponent!) ||
    !componentMatches(input.street, routeComponent!) ||
    !componentMatches(
      input.streetNumber,
      numberComponent!,
      normalizeStreetNumberComparison
    )
  ) {
    return null;
  }

  return {
    placeId,
    formattedAddress,
    latitude,
    longitude,
    city,
    street,
    streetNumber,
  };
}

export function normalizeGoogleAddressResolutionResponse(
  payload: GoogleGeocodingResponse,
  input: { city: string; street: string; streetNumber: string }
):
  | { status: 'resolved'; address: ResolvedBusinessAddress }
  | { status: 'ambiguous'; candidates: ResolvedBusinessAddress[] }
  | { status: 'notFound' } {
  if (
    !payload ||
    typeof payload !== 'object' ||
    (payload.results !== undefined && !Array.isArray(payload.results))
  ) {
    throw new Error('PLACES_SERVICE_UNAVAILABLE');
  }

  const candidates: ResolvedBusinessAddress[] = [];
  for (const result of (payload.results ?? []).slice(
    0,
    MAX_GEOCODING_RESULTS_TO_INSPECT
  )) {
    const candidate = normalizeGeocodingCandidate(result, input);
    if (candidate) {
      candidates.push(candidate);
    }
    if (candidates.length === MAX_ACCEPTED_GEOCODING_CANDIDATES) {
      break;
    }
  }

  if (candidates.length === 1) {
    return { status: 'resolved', address: candidates[0] };
  }
  if (candidates.length > 1) {
    return { status: 'ambiguous', candidates };
  }
  return { status: 'notFound' };
}

async function fetchJsonWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.status === 429) {
      throw new Error('PLACES_RATE_LIMITED');
    }
    if (response.status === 404) {
      throw new Error('PLACES_NO_RESULTS');
    }
    if ([400, 401, 403].includes(response.status) || response.status >= 500) {
      throw new Error('PLACES_SERVICE_UNAVAILABLE');
    }
    if (!response.ok) {
      throw new Error('PLACES_UNKNOWN_SERVICE_ERROR');
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('PLACES_')) {
        throw error;
      }
      if (error.name === 'AbortError') {
        throw new Error('PLACES_TIMEOUT');
      }
    }
    throw new Error('PLACES_SERVICE_UNAVAILABLE');
  } finally {
    clearTimeout(timeoutId);
  }
}

export const autocomplete = action({
  args: {
    query: v.string(),
    sessionToken: v.optional(v.string()),
    mode: v.optional(
      v.union(v.literal('default'), v.literal('city'), v.literal('street'))
    ),
    selectedCity: v.optional(v.object({ displayName: v.string() })),
  },
  returns: v.array(PLACE_SUGGESTION_VALIDATOR),
  handler: async (ctx, args) => {
    const identity = await requireAuthenticatedIdentity(ctx);
    const normalizedQuery = normalizeQuery(args.query);
    if (!normalizedQuery) {
      return [];
    }
    const mode = args.mode ?? 'default';
    const normalizedSessionToken =
      mode === 'default' ? normalizeSessionToken(args.sessionToken) : undefined;
    const selectedCityDisplayName =
      mode === 'street'
        ? normalizeSelectedCityDisplayName(args.selectedCity?.displayName ?? '')
        : undefined;
    const apiKey = getGooglePlacesApiKey();
    await consumePlacesRateLimit(ctx, 'autocomplete', identity.tokenIdentifier);
    const request = buildGoogleAutocompleteRequest({
      apiKey,
      query: normalizedQuery,
      mode,
      ...(normalizedSessionToken
        ? { sessionToken: normalizedSessionToken }
        : {}),
      ...(selectedCityDisplayName ? { selectedCityDisplayName } : {}),
    });
    const payload = (await fetchJsonWithTimeout(
      request.url,
      request.init
    )) as GooglePlacesAutocompleteResponse;
    const primarySuggestions = normalizeGoogleAutocompleteResponse(payload);

    if (mode !== 'street' || primarySuggestions.length > 0) {
      return primarySuggestions;
    }

    const fallbackRequest = buildGoogleAutocompleteRequest({
      apiKey,
      query: normalizedQuery,
      mode: 'street',
      streetQueryOnly: true,
    });
    const fallbackPayload = (await fetchJsonWithTimeout(
      fallbackRequest.url,
      fallbackRequest.init
    )) as GooglePlacesAutocompleteResponse;
    const fallbackSuggestions = normalizeGoogleAutocompleteResponse(
      fallbackPayload,
      MAX_AUTOCOMPLETE_PREDICTIONS_TO_INSPECT,
      true
    );

    return filterStreetSuggestionsForSelectedCity(
      fallbackSuggestions,
      selectedCityDisplayName ?? ''
    );
  },
});

export const placeDetails = action({
  args: {
    placeId: v.string(),
    sessionToken: v.string(),
  },
  returns: PLACE_DETAILS_VALIDATOR,
  handler: async (ctx, { placeId, sessionToken }) => {
    const identity = await requireAuthenticatedIdentity(ctx);
    const normalizedPlaceId = normalizePlaceId(placeId);
    const normalizedSessionToken = normalizeSessionToken(sessionToken);
    const apiKey = getGooglePlacesApiKey();
    await consumePlacesRateLimit(ctx, 'placeDetails', identity.tokenIdentifier);
    const request = buildGoogleDetailsRequest({
      apiKey,
      placeId: normalizedPlaceId,
      sessionToken: normalizedSessionToken,
    });
    const payload = (await fetchJsonWithTimeout(
      request.url,
      request.init
    )) as GooglePlacesDetailsResponse;

    return normalizeGooglePlaceDetails(payload);
  },
});

export const resolveAddress = action({
  args: {
    city: v.string(),
    street: v.string(),
    streetNumber: v.string(),
  },
  returns: ADDRESS_RESOLUTION_RESULT_VALIDATOR,
  handler: async (ctx, args) => {
    const identity = await requireAuthenticatedIdentity(ctx);
    const normalizedInput = normalizeAddressResolutionInput(args);
    const apiKey = getGooglePlacesApiKey();
    await consumePlacesRateLimit(
      ctx,
      'addressResolution',
      identity.tokenIdentifier
    );
    const request = buildGoogleAddressResolutionRequest({
      apiKey,
      ...normalizedInput,
    });
    const payload = (await fetchJsonWithTimeout(
      request.url,
      request.init
    )) as GoogleGeocodingResponse;

    return normalizeGoogleAddressResolutionResponse(payload, normalizedInput);
  },
});
