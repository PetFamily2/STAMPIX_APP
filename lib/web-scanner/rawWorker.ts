import type { Decoder } from './decoder';
/** The decoded QR is handed off in memory only. No payload/error logging or persistence. */
export function createRawWorkerDecoder(
  onRaw: (value: string) => void
): Decoder {
  const worker = new Worker('/scanner-business-assets/qr-worker.js');
  let pending: {
    resolve: (result: { length: number } | null) => void;
    reject: (error: Error) => void;
  } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  const fail = () => {
    destroyed = true;
    clearTimeout(timer);
    worker.terminate();
    pending?.reject(new Error('DECODER_UNAVAILABLE'));
    pending = null;
  };
  worker.onmessage = (event) => {
    if (!pending || destroyed) return;
    const request = pending;
    pending = null;
    clearTimeout(timer);
    if (event.data?.type === 'error') {
      request.reject(new Error('DECODER_UNAVAILABLE'));
      return;
    }
    const value = event.data?.data;
    if (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 10000
    ) {
      onRaw(value);
      request.resolve({ length: value.length });
    } else request.resolve(null);
  };
  worker.onerror = fail;
  worker.onmessageerror = fail;
  return {
    decode: (frame) => {
      if (destroyed || pending)
        return Promise.reject(new Error('DECODER_UNAVAILABLE'));
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        timer = setTimeout(fail, 4000);
        try {
          worker.postMessage(frame, [frame.pixels.buffer as ArrayBuffer]);
        } catch {
          fail();
        }
      });
    },
    destroy: () => {
      fail();
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
    },
  };
}
