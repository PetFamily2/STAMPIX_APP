import { gridDisk, latLngToCell } from 'h3-js';

export const DISCOVERY_H3_RESOLUTION = 5;

type Location = { lat: number; lng: number };

function isValidLocation(location: Location) {
  return (
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    location.lat >= -90 &&
    location.lat <= 90 &&
    location.lng >= -180 &&
    location.lng <= 180
  );
}

export function getDiscoveryH3Cell(location: Location) {
  if (!isValidLocation(location)) {
    return null;
  }
  return latLngToCell(location.lat, location.lng, DISCOVERY_H3_RESOLUTION);
}

/**
 * H3 average edges vary by latitude; this deliberately over-covers the
 * requested radius and lets the existing Haversine check discard extras.
 */
export function getDiscoveryH3Cells(location: Location, radiusKm: number) {
  const origin = getDiscoveryH3Cell(location);
  if (!origin) {
    return [];
  }
  const rings = Math.max(1, Math.ceil(radiusKm / 8) + 2);
  return [...new Set(gridDisk(origin, rings))];
}
