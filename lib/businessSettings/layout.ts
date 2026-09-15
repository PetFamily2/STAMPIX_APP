export function getSettingsContentWidth(
  viewportWidth: number,
  maxWidth: number,
  horizontalPadding: number
) {
  return Math.max(
    0,
    Math.min(Math.max(0, viewportWidth), maxWidth) - horizontalPadding * 2
  );
}
