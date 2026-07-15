import { v } from 'convex/values';

import { action } from './_generated/server';

type GooglePlacesPredictionResponse = {
  predictions?: Array<{
    description?: string;
    place_id?: string;
    structured_formatting?: {
      main_text?: string;
      secondary_text?: string;
    };
  }>;
  status?: string;
};

type GooglePlacesDetailsResponse = {
  result?: {
    place_id?: string;
    formatted_address?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
    address_components?: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
  };
  status?: string;
};

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const REQUEST_TIMEOUT_MS = 5000;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;
const MAX_PLACE_ID_LENGTH = 256;
const MAX_SESSION_TOKEN_LENGTH = 128;
const MAX_SUGGESTIONS = 5;

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
  return identity;
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

function normalizeSessionToken(sessionToken: string) {
  const normalized = sessionToken.trim();
  if (!normalized || normalized.length > MAX_SESSION_TOKEN_LENGTH) {
    throw new Error('PLACES_SESSION_TOKEN_INVALID');
  }
  return normalized;
}

function buildGooglePlacesUrl(path: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return `${GOOGLE_PLACES_BASE_URL}/${path}/json?${searchParams.toString()}`;
}

export function buildGoogleAutocompleteUrl(args: {
  apiKey: string;
  query: string;
  sessionToken: string;
}) {
  return buildGooglePlacesUrl('autocomplete', {
    input: args.query,
    key: args.apiKey,
    language: 'he',
    region: 'il',
    sessiontoken: args.sessionToken,
    components: 'country:il',
  });
}

export function buildGoogleDetailsUrl(args: {
  apiKey: string;
  placeId: string;
  sessionToken: string;
}) {
  return buildGooglePlacesUrl('details', {
    place_id: args.placeId,
    key: args.apiKey,
    language: 'he',
    sessiontoken: args.sessionToken,
    fields: 'place_id,formatted_address,geometry,address_component',
  });
}

function getAddressComponent(components: AddressComponent[], type: string) {
  return components.find((component) => component.types.includes(type));
}

function toGoogleServiceError(status: string | undefined) {
  switch (status) {
    case undefined:
    case 'OK':
      return null;
    case 'ZERO_RESULTS':
      return 'PLACES_NO_RESULTS';
    case 'OVER_QUERY_LIMIT':
    case 'RESOURCE_EXHAUSTED':
      return 'PLACES_RATE_LIMITED';
    case 'REQUEST_DENIED':
    case 'INVALID_REQUEST':
      return 'PLACES_SERVICE_UNAVAILABLE';
    default:
      return 'PLACES_UNKNOWN_SERVICE_ERROR';
  }
}

export function normalizeGoogleAutocompleteResponse(
  payload: GooglePlacesPredictionResponse
) {
  const serviceError = toGoogleServiceError(payload.status);
  if (serviceError === 'PLACES_NO_RESULTS') {
    return [];
  }
  if (serviceError) {
    throw new Error(serviceError);
  }

  return (payload.predictions ?? [])
    .map((prediction) => {
      const description = prediction.description?.trim() ?? '';
      const placeId = prediction.place_id?.trim() ?? '';
      if (!description || !placeId) {
        return null;
      }
      return {
        description,
        placeId,
        primaryText:
          prediction.structured_formatting?.main_text?.trim() || description,
        secondaryText:
          prediction.structured_formatting?.secondary_text?.trim() || '',
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, MAX_SUGGESTIONS);
}

export function normalizeGooglePlaceDetails(
  payload: GooglePlacesDetailsResponse
) {
  const serviceError = toGoogleServiceError(payload.status);
  if (serviceError) {
    throw new Error(serviceError);
  }

  const result = payload.result;
  const lat = result?.geometry?.location?.lat;
  const lng = result?.geometry?.location?.lng;
  const formattedAddress = result?.formatted_address?.trim();
  const placeId = result?.place_id?.trim();
  const components = result?.address_components ?? [];

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
    getAddressComponent(components, 'locality')?.long_name ||
    getAddressComponent(components, 'administrative_area_level_2')?.long_name ||
    getAddressComponent(components, 'administrative_area_level_1')?.long_name ||
    '';
  const street = getAddressComponent(components, 'route')?.long_name || '';
  const streetNumber =
    getAddressComponent(components, 'street_number')?.long_name || '';

  return {
    formattedAddress,
    placeId,
    lat,
    lng,
    city,
    street,
    streetNumber,
  };
}

async function fetchJsonWithTimeout(url: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 429) {
      throw new Error('PLACES_RATE_LIMITED');
    }
    if (response.status >= 500) {
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
    sessionToken: v.string(),
  },
  returns: v.array(PLACE_SUGGESTION_VALIDATOR),
  handler: async (ctx, { query, sessionToken }) => {
    await requireAuthenticatedIdentity(ctx);
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
      return [];
    }
    const normalizedSessionToken = normalizeSessionToken(sessionToken);
    const apiKey = getGooglePlacesApiKey();
    const payload = (await fetchJsonWithTimeout(
      buildGoogleAutocompleteUrl({
        apiKey,
        query: normalizedQuery,
        sessionToken: normalizedSessionToken,
      })
    )) as GooglePlacesPredictionResponse;

    return normalizeGoogleAutocompleteResponse(payload);
  },
});

export const placeDetails = action({
  args: {
    placeId: v.string(),
    sessionToken: v.string(),
  },
  returns: PLACE_DETAILS_VALIDATOR,
  handler: async (ctx, { placeId, sessionToken }) => {
    await requireAuthenticatedIdentity(ctx);
    const normalizedPlaceId = normalizePlaceId(placeId);
    const normalizedSessionToken = normalizeSessionToken(sessionToken);
    const apiKey = getGooglePlacesApiKey();
    const payload = (await fetchJsonWithTimeout(
      buildGoogleDetailsUrl({
        apiKey,
        placeId: normalizedPlaceId,
        sessionToken: normalizedSessionToken,
      })
    )) as GooglePlacesDetailsResponse;

    return normalizeGooglePlaceDetails(payload);
  },
});
