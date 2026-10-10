export function validCoordinate(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}
export function mapZoom(latitudeDelta: number) {
  return Math.max(
    3,
    Math.min(
      18,
      Math.round(
        Math.log2(
          360 /
            Math.max(
              0.002,
              Number.isFinite(latitudeDelta) ? Math.abs(latitudeDelta) : 0.03
            )
        )
      )
    )
  );
}
