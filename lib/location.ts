export function formatDistance(distanceKm: number) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return '';
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }

  return `${distanceKm.toFixed(1)}km`;
}
