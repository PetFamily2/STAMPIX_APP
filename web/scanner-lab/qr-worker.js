/* QR-only local decoder. No raw QR is posted, logged or persisted. */
importScripts('./jsqr-1.4.0.js');
self.onmessage = (event) => {
  const { pixels, width, height } = event.data;
  if (
    !(pixels instanceof Uint8ClampedArray) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 640 ||
    height > 640 ||
    pixels.length !== width * height * 4
  ) {
    self.postMessage({ type: 'error' });
    return;
  }
  try {
    const result = self.jsQR(pixels, width, height, {
      inversionAttempts: 'attemptBoth',
    });
    self.postMessage({ type: 'result', length: result?.data?.length ?? 0 });
  } catch {
    self.postMessage({ type: 'error' });
  }
};
