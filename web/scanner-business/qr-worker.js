/* Business Preview only: raw result stays in volatile memory for resolve. */
importScripts('./jsqr-1.4.0.js');
self.onmessage = (event) => {
  const { pixels, width, height } = event.data;
  if (
    !(pixels instanceof Uint8ClampedArray) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
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
    self.postMessage({ type: 'result', data: result?.data ?? null });
  } catch {
    self.postMessage({ type: 'error' });
  }
};
