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

type NominatimSearchResponseItem = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    footway?: string;
    path?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    county?: string;
    state_district?: string;
    state?: string;
  };
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

function buildGooglePlacesUrl(path: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return `https://maps.googleapis.com/maps/api/place/${path}/json?${searchParams.toString()}`;
}

function buildNominatimUrl(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return `https://nominatim.openstreetmap.org/search?${searchParams.toString()}`;
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

function getNominatimCity(
  address: NominatimSearchResponseItem['address'] | undefined
) {
  return (
    address?.city ||
    address?.town ||
    address?.village ||
    address?.hamlet ||
    address?.municipality ||
    address?.county ||
    address?.state_district ||
    address?.state ||
    ''
  );
}

function getNominatimStreet(
  address: NominatimSearchResponseItem['address'] | undefined
) {
  return (
    address?.road ||
    address?.pedestrian ||
    address?.footway ||
    address?.path ||
    address?.neighbourhood ||
    address?.suburb ||
    ''
  );
}

function buildNominatimPrimaryText(
  street: string,
  streetNumber: string,
  city: string,
  description: string
) {
  const streetLine = [street, streetNumber].filter(Boolean).join(' ').trim();
  if (streetLine) {
    return streetLine;
  }
  if (city) {
    return city;
  }
  return description.split(',')[0]?.trim() || description;
}

function buildNominatimSecondaryText(description: string, primaryText: string) {
  const normalizedDescription = description.trim();
  if (!normalizedDescription) {
    return '';
  }
  if (
    normalizedDescription === primaryText ||
    !normalizedDescription.startsWith(primaryText)
  ) {
    return normalizedDescription;
  }

  return normalizedDescription
    .slice(primaryText.length)
    .replace(/^,\s*/, '')
    .trim();
}

function encodeNominatimPlaceId(details: PlaceDetails) {
  return `nominatim:${encodeURIComponent(JSON.stringify(details))}`;
}

function decodeNominatimPlaceId(placeId: string) {
  if (!placeId.startsWith('nominatim:')) {
    return null;
  }

  try {
    const encodedPayload = placeId.slice('nominatim:'.length);
    const payload = JSON.parse(
      decodeURIComponent(encodedPayload)
    ) as Partial<PlaceDetails>;

    if (
      typeof payload.formattedAddress !== 'string' ||
      typeof payload.placeId !== 'string' ||
      typeof payload.lat !== 'number' ||
      typeof payload.lng !== 'number' ||
      typeof payload.city !== 'string' ||
      typeof payload.street !== 'string' ||
      typeof payload.streetNumber !== 'string'
    ) {
      throw new Error('PLACE_DETAILS_INCOMPLETE');
    }

    return payload as PlaceDetails;
  } catch {
    throw new Error('PLACE_DETAILS_INCOMPLETE');
  }
}

function toNominatimPlaceDetails(
  item: NominatimSearchResponseItem
): PlaceDetails | null {
  const formattedAddress = item.display_name?.trim() ?? '';
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  const city = getNominatimCity(item.address);
  const street = getNominatimStreet(item.address);
  const streetNumber = item.address?.house_number?.trim() ?? '';

  if (!formattedAddress || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const details = {
    formattedAddress,
    placeId: '',
    lat,
    lng,
    city,
    street,
    streetNumber,
  };

  return {
    ...details,
    placeId: encodeNominatimPlaceId(details),
  };
}

export function createPlacesSessionToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function fetchGooglePlaceSuggestions(
  input: string,
  sessionToken: string
) {
  const response = await fetch(
    buildGooglePlacesUrl('autocomplete', {
      input,
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

async function fetchNominatimSuggestions(input: string) {
  const response = await fetch(
    buildNominatimUrl({
      q: input,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
      'accept-language': 'he',
    }),
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('PLACES_AUTOCOMPLETE_REQUEST_FAILED');
  }

  const payload = (await response.json()) as NominatimSearchResponseItem[];

  return payload
    .map((item) => {
      const details = toNominatimPlaceDetails(item);
      if (!details) {
        return null;
      }

      const primaryText = buildNominatimPrimaryText(
        details.street,
        details.streetNumber,
        details.city,
        details.formattedAddress
      );
      const secondaryText = buildNominatimSecondaryText(
        details.formattedAddress,
        primaryText
      );

      return {
        description: details.formattedAddress,
        placeId: details.placeId,
        primaryText,
        secondaryText,
      } satisfies PlaceSuggestion;
    })
    .filter((item): item is PlaceSuggestion => item !== null);
}

export async function fetchPlaceSuggestions(
  input: string,
  sessionToken: string
) {
  const trimmedInput = input.trim();
  if (trimmedInput.length < 2) {
    return [];
  }

  if (!GOOGLE_PLACES_API_KEY) {
    return fetchNominatimSuggestions(trimmedInput);
  }

  return fetchGooglePlaceSuggestions(trimmedInput, sessionToken);
}

function normalizeGooglePlaceDetails(
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

  const nominatimDetails = decodeNominatimPlaceId(trimmedPlaceId);
  if (nominatimDetails) {
    return nominatimDetails;
  }

  const response = await fetch(
    buildGooglePlacesUrl('details', {
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

  return normalizeGooglePlaceDetails(payload);
}
