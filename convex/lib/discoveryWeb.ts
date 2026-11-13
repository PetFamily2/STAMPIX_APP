export type DiscoveryPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  attributions: Array<{ provider: string; uri: string }>;
};

export function normalizeDiscoveryQuery(value: string) {
  if (
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159);
    })
  ) {
    throw new Error('DISCOVERY_QUERY_INVALID');
  }
  const term = value.trim().replace(/\s+/g, ' ');
  if (term.length > 120) {
    throw new Error('DISCOVERY_QUERY_INVALID');
  }
  return term;
}

export type DiscoveryLocation = { lat: number; lng: number; radius: number };

export function validateDiscoveryLocation(location?: DiscoveryLocation) {
  if (!location) {
    return undefined;
  }
  if (
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lng) ||
    !Number.isFinite(location.radius) ||
    Math.abs(location.lat) > 90 ||
    Math.abs(location.lng) > 180 ||
    location.radius < 1000 ||
    location.radius > 50000
  ) {
    throw new Error('DISCOVERY_LOCATION_INVALID');
  }
  return location;
}

export function withinDiscoveryRadius(
  place: Pick<DiscoveryPlace, 'lat' | 'lng'>,
  center: DiscoveryLocation
) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((place.lat - center.lat) * rad) / 2) ** 2 +
    Math.cos(center.lat * rad) *
      Math.cos(place.lat * rad) *
      Math.sin(((place.lng - center.lng) * rad) / 2) ** 2;
  return (
    6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))) <=
    center.radius
  );
}

export function parseDiscoveryPlaces(value: unknown): {
  places: DiscoveryPlace[];
  nextPageToken: string | null;
} {
  if (!value || typeof value !== 'object' || !('places' in value)) {
    return { places: [], nextPageToken: null };
  }
  const data = value as { places?: unknown; nextPageToken?: unknown };
  if (!Array.isArray(data.places)) {
    throw new Error('DISCOVERY_RESPONSE_INVALID');
  }
  const seen = new Set<string>();
  const places: DiscoveryPlace[] = [];
  for (const raw of data.places.slice(0, 20)) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const place = raw as Record<string, unknown>;
    const location = place.location as
      | { latitude?: unknown; longitude?: unknown }
      | undefined;
    const displayName = place.displayName as { text?: unknown } | undefined;
    const components = place.addressComponents;
    const inIsrael =
      Array.isArray(components) &&
      components.some(
        (component) =>
          component &&
          typeof component === 'object' &&
          Array.isArray(component.types) &&
          component.types.includes('country') &&
          component.shortText === 'IL'
      );
    if (
      !inIsrael ||
      place.businessStatus === 'CLOSED_PERMANENTLY' ||
      typeof place.id !== 'string' ||
      place.id.length === 0 ||
      place.id.length > 256 ||
      seen.has(place.id) ||
      typeof displayName?.text !== 'string' ||
      typeof place.formattedAddress !== 'string' ||
      typeof location?.latitude !== 'number' ||
      typeof location.longitude !== 'number' ||
      !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      Math.abs(location.latitude) > 90 ||
      Math.abs(location.longitude) > 180
    ) {
      continue;
    }
    seen.add(place.id);
    const attributions: DiscoveryPlace['attributions'] = [];
    if (Array.isArray(place.attributions)) {
      for (const attribution of place.attributions.slice(0, 10)) {
        if (
          typeof attribution?.provider !== 'string' ||
          typeof attribution?.providerUri !== 'string'
        ) {
          continue;
        }
        try {
          const uri = new URL(attribution.providerUri);
          if (uri.protocol === 'https:' && !uri.username && !uri.password) {
            attributions.push({
              provider: attribution.provider.slice(0, 200),
              uri: uri.toString(),
            });
          }
        } catch {
          /* Omit malformed attribution links. */
        }
      }
    }
    places.push({
      placeId: place.id,
      name: displayName.text.slice(0, 300),
      address: place.formattedAddress.slice(0, 500),
      lat: location.latitude,
      lng: location.longitude,
      attributions,
    });
  }
  return {
    places,
    nextPageToken:
      typeof data.nextPageToken === 'string' &&
      data.nextPageToken.length <= 2048
        ? data.nextPageToken
        : null,
  };
}
