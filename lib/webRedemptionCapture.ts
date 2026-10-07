/** Web DOM adapter. Native retains react-native-view-shot and its native capture path. */
export async function captureRedemptionArtboard(
  element: unknown
): Promise<string> {
  if (
    typeof HTMLElement === 'undefined' ||
    !(element instanceof HTMLElement) ||
    !element.isConnected
  )
    throw new Error('CAPTURE_UNAVAILABLE');
  const bounds = element.getBoundingClientRect();
  if (!Number.isFinite(bounds.width) || bounds.width < 1 || bounds.height < 1)
    throw new Error('CAPTURE_UNAVAILABLE');
  await document.fonts.ready;
  const { default: html2canvas } = await import('html2canvas');
  const rendered = await html2canvas(element, {
    logging: false,
    allowTaint: false,
    useCORS: true,
    imageTimeout: 5000,
    scale: 1080 / bounds.width,
    backgroundColor: null,
  });
  const output = document.createElement('canvas');
  output.width = 1080;
  output.height = 1920;
  const context = output.getContext('2d');
  if (!context) throw new Error('CAPTURE_UNAVAILABLE');
  try {
    context.drawImage(rendered, 0, 0, 1080, 1920);
    return output.toDataURL('image/png');
  } finally {
    // Canvas pixels and DOM reference are ephemeral; never cache a receipt image.
    rendered.width = 0;
    rendered.height = 0;
    output.width = 0;
    output.height = 0;
  }
}
