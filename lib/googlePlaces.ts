export type PlaceSuggestion = {
  description: string;
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

export type PlaceDetails = {
  formattedAddress: string;
  placeId: string;
  lat: number;
  lng: number;
  city: string;
  street: string;
  streetNumber: string;
};

export type PlacesErrorCode =
  | 'PLACES_UNAUTHENTICATED'
  | 'PLACES_CONFIGURATION_MISSING'
  | 'PLACES_QUERY_TOO_SHORT'
  | 'PLACES_QUERY_TOO_LONG'
  | 'PLACES_PLACE_ID_REQUIRED'
  | 'PLACES_PLACE_ID_TOO_LONG'
  | 'PLACES_SESSION_TOKEN_INVALID'
  | 'PLACES_RATE_LIMITED'
  | 'PLACES_NO_RESULTS'
  | 'PLACES_INVALID_DETAILS'
  | 'PLACES_TIMEOUT'
  | 'PLACES_SERVICE_UNAVAILABLE'
  | 'PLACES_UNKNOWN_SERVICE_ERROR';

const PLACES_ERROR_CODES = new Set<string>([
  'PLACES_UNAUTHENTICATED',
  'PLACES_CONFIGURATION_MISSING',
  'PLACES_QUERY_TOO_SHORT',
  'PLACES_QUERY_TOO_LONG',
  'PLACES_PLACE_ID_REQUIRED',
  'PLACES_PLACE_ID_TOO_LONG',
  'PLACES_SESSION_TOKEN_INVALID',
  'PLACES_RATE_LIMITED',
  'PLACES_NO_RESULTS',
  'PLACES_INVALID_DETAILS',
  'PLACES_TIMEOUT',
  'PLACES_SERVICE_UNAVAILABLE',
  'PLACES_UNKNOWN_SERVICE_ERROR',
]);

export function createPlacesSessionToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizePlacesActionError(error: unknown): PlacesErrorCode {
  const message =
    error instanceof Error ? error.message.trim() : String(error ?? '').trim();
  const maybeCode = message.includes('Uncaught Error: ')
    ? message.split('Uncaught Error: ').pop()?.trim()
    : message;

  if (maybeCode && PLACES_ERROR_CODES.has(maybeCode)) {
    return maybeCode as PlacesErrorCode;
  }

  return 'PLACES_UNKNOWN_SERVICE_ERROR';
}

export function assertValidPlaceDetails(
  value: PlaceDetails
): asserts value is PlaceDetails {
  if (
    !value.placeId.trim() ||
    !value.formattedAddress.trim() ||
    !Number.isFinite(value.lat) ||
    !Number.isFinite(value.lng)
  ) {
    throw new Error('PLACES_INVALID_DETAILS');
  }
}
