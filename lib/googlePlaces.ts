type GooglePlacesPredictionResponse = {
  predictions?: Array<{
    description: string;
    place_id: string;
    structured_formatting?: {
      main_text?: string;
      secondary_text?: string;
    };
  }>;
  status?: string;
  error_message?: string;
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
  error_message?: string;
};

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

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

const GOOGLE_PLACES_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

function getApiKey() {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY_MISSING');
  }
  return GOOGLE_PLACES_API_KEY;
}

function buildUrl(path: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return `https://maps.googleapis.com/maps/api/place/${path}/json?${searchParams.toString()}`;
}

function resolveResponseError(
  status: string | undefined,
  errorMessage: string | undefined
) {
  if (!status || status === 'OK') {
    return null;
  }
  if (status === 'ZERO_RESULTS') {
    return status;
  }
  return errorMessage?.trim() || status;
}

function getAddressComponent(components: AddressComponent[], type: string) {
  return components.find((component) => component.types.includes(type));
}

export function createPlacesSessionToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function fetchPlaceSuggestions(
  input: string,
  sessionToken: string
) {
  const trimmedInput = input.trim();
  if (trimmedInput.length < 2) {
    return [];
  }

  const response = await fetch(
    buildUrl('autocomplete', {
      input: trimmedInput,
      key: getApiKey(),
      language: 'he',
      sessiontoken: sessionToken,
      types: 'address',
    })
  );

  if (!response.ok) {
    throw new Error('PLACES_AUTOCOMPLETE_REQUEST_FAILED');
  }

  const payload = (await response.json()) as GooglePlacesPredictionResponse;
  const resolvedError = resolveResponseError(
    payload.status,
    payload.error_message
  );
  if (resolvedError && resolvedError !== 'ZERO_RESULTS') {
    throw new Error(resolvedError);
  }

  return (payload.predictions ?? []).map(
    (prediction): PlaceSuggestion => ({
      description: prediction.description,
      placeId: prediction.place_id,
      primaryText:
        prediction.structured_formatting?.main_text || prediction.description,
      secondaryText: prediction.structured_formatting?.secondary_text || '',
    })
  );
}

function normalizePlaceDetails(
  payload: GooglePlacesDetailsResponse
): PlaceDetails {
  const result = payload.result;
  const lat = result?.geometry?.location?.lat;
  const lng = result?.geometry?.location?.lng;
  const formattedAddress = result?.formatted_address?.trim();
  const placeId = result?.place_id?.trim();
  const components = result?.address_components ?? [];

  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !formattedAddress ||
    !placeId
  ) {
    throw new Error('PLACE_DETAILS_INCOMPLETE');
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

export async function fetchPlaceDetails(placeId: string, sessionToken: string) {
  const trimmedPlaceId = placeId.trim();
  if (!trimmedPlaceId) {
    throw new Error('PLACE_ID_REQUIRED');
  }

  const response = await fetch(
    buildUrl('details', {
      place_id: trimmedPlaceId,
      key: getApiKey(),
      language: 'he',
      sessiontoken: sessionToken,
      fields: 'place_id,formatted_address,geometry,address_component',
    })
  );

  if (!response.ok) {
    throw new Error('PLACE_DETAILS_REQUEST_FAILED');
  }

  const payload = (await response.json()) as GooglePlacesDetailsResponse;
  const resolvedError = resolveResponseError(
    payload.status,
    payload.error_message
  );
  if (resolvedError) {
    throw new Error(resolvedError);
  }

  return normalizePlaceDetails(payload);
}
