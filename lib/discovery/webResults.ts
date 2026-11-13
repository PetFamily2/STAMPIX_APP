import type { DiscoveryPlace } from '@/convex/lib/discoveryWeb';

export type DiscoveryPartner = {
  businessId: string;
  name: string;
  address: string;
  description: string;
  placeId: string | null;
  logoUrl: string | null;
};
export type DiscoveryResult = {
  key: string;
  name: string;
  address: string;
  placeId: string | null;
  partner: DiscoveryPartner | null;
  attributions: DiscoveryPlace['attributions'];
  fromGoogle: boolean;
};

export function mergeDiscoveryResults(
  partners: DiscoveryPartner[],
  places: DiscoveryPlace[]
): DiscoveryResult[] {
  const results = new Map<string, DiscoveryResult>();
  for (const partner of partners) {
    const key = partner.placeId
      ? `place:${partner.placeId}`
      : `business:${partner.businessId}`;
    if (!results.has(key)) {
      results.set(key, {
        key,
        name: partner.name,
        address: partner.address,
        placeId: partner.placeId,
        partner,
        attributions: [],
        fromGoogle: false,
      });
    }
  }
  for (const place of places) {
    const key = `place:${place.placeId}`;
    const existing = results.get(key);
    if (existing) {
      results.set(key, {
        ...existing,
        address: existing.address || place.address,
        attributions: place.attributions,
        fromGoogle: true,
      });
    } else {
      results.set(key, {
        key,
        name: place.name,
        address: place.address,
        placeId: place.placeId,
        partner: null,
        attributions: place.attributions,
        fromGoogle: true,
      });
    }
  }
  return [...results.values()];
}

export function discoveryMapsUrl(
  result: Pick<DiscoveryResult, 'name' | 'address' | 'placeId'>
) {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', `${result.name} ${result.address}`);
  if (result.placeId) {
    url.searchParams.set('query_place_id', result.placeId);
  }
  return url.toString();
}
