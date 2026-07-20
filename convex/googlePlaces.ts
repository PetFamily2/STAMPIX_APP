import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action } from './_generated/server';
import { normalizeGooglePlacesLimiterError } from './googlePlacesRateLimits';

type GooglePlacesAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: {
        text?: string;
      };
      structuredFormat?: {
        mainText?: {
          text?: string;
        };
        secondaryText?: {
          text?: string;
        };
      };
    };
  }>;
};

type GooglePlacesDetailsResponse = {
  id?: string;
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
};

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

const GOOGLE_PLACES_BASE_URL = 'https://places.googleapis.com/v1';
const REQUEST_TIMEOUT_MS = 5000;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;
const MAX_PLACE_ID_LENGTH = 256;
const MAX_SESSION_TOKEN_LENGTH = 128;
const MAX_SUGGESTIONS = 5;

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

async function consumePlacesRateLimit(
  ctx: any,
  operation: 'autocomplete' | 'placeDetails',
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
  sessionToken: string;
}) {
  return {
    url: `${GOOGLE_PLACES_BASE_URL}/places:autocomplete`,
    init: {
      method: 'POST',
      headers: buildGooglePlacesHeaders(
        args.apiKey,
        GOOGLE_AUTOCOMPLETE_FIELD_MASK
      ),
      body: JSON.stringify({
        input: args.query,
        languageCode: 'he',
        regionCode: 'il',
        includedRegionCodes: ['il'],
        sessionToken: args.sessionToken,
      }),
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

function getAddressComponent(components: AddressComponent[], type: string) {
  return components.find(
    (component) =>
      component &&
      Array.isArray(component.types) &&
      component.types.includes(type)
  );
}

function getLongAddressComponentText(
  components: AddressComponent[],
  type: string
) {
  const longText = getAddressComponent(components, type)?.longText;
  return typeof longText === 'string' ? longText.trim() : '';
}

function getTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeGoogleAutocompleteResponse(
  payload: GooglePlacesAutocompleteResponse
) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    (payload.suggestions !== undefined &&
      !Array.isArray(payload.suggestions))
  ) {
    throw new Error('PLACES_SERVICE_UNAVAILABLE');
  }

  return (payload.suggestions ?? [])
    .map((suggestion) => {
      const prediction = suggestion?.placePrediction;
      const description = getTrimmedString(prediction?.text?.text);
      const placeId = getTrimmedString(prediction?.placeId);
      if (!description || !placeId) {
        return null;
      }
      return {
        description,
        placeId,
        primaryText:
          getTrimmedString(
            prediction?.structuredFormat?.mainText?.text
          ) || description,
        secondaryText:
          getTrimmedString(
            prediction?.structuredFormat?.secondaryText?.text
          ),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
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
    getLongAddressComponentText(
      components,
      'administrative_area_level_2'
    ) ||
    getLongAddressComponentText(
      components,
      'administrative_area_level_1'
    ) ||
    '';
  const street = getLongAddressComponentText(components, 'route');
  const streetNumber = getLongAddressComponentText(
    components,
    'street_number'
  );

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
    if ([400, 401, 403].includes(response.status)) {
      throw new Error('PLACES_SERVICE_UNAVAILABLE');
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
    const identity = await requireAuthenticatedIdentity(ctx);
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery) {
      return [];
    }
    const normalizedSessionToken = normalizeSessionToken(sessionToken);
    const apiKey = getGooglePlacesApiKey();
    await consumePlacesRateLimit(
      ctx,
      'autocomplete',
      identity.tokenIdentifier
    );
    const request = buildGoogleAutocompleteRequest({
      apiKey,
      query: normalizedQuery,
      sessionToken: normalizedSessionToken,
    });
    const payload = (await fetchJsonWithTimeout(
      request.url,
      request.init
    )) as GooglePlacesAutocompleteResponse;

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
    const identity = await requireAuthenticatedIdentity(ctx);
    const normalizedPlaceId = normalizePlaceId(placeId);
    const normalizedSessionToken = normalizeSessionToken(sessionToken);
    const apiKey = getGooglePlacesApiKey();
    await consumePlacesRateLimit(
      ctx,
      'placeDetails',
      identity.tokenIdentifier
    );
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
