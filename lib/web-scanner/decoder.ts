export type QrFrame = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
};
export type Decoder = {
  decode(frame: QrFrame): Promise<{ length: number } | null>;
  destroy(): void;
};

/** Same-origin, pinned worker. No payload, error text or image leaves the worker. */
export function createLocalDecoder(): Decoder {
  const worker = new Worker('/scanner-lab/qr-worker.js');
  let pending:
    | {
        resolve: (value: { length: number } | null) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  let destroyed = false;
  const fail = () => {
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('QR decoder unavailable'));
      pending = undefined;
    }
  };
  worker.onmessage = (event: MessageEvent) => {
    if (!pending) {
      return;
    }
    const operation = pending;
    pending = undefined;
    clearTimeout(operation.timer);
    if (event.data?.type === 'error') {
      operation.reject(new Error('QR decoder unavailable'));
      return;
    }
    const length = event.data?.length;
    operation.resolve(
      Number.isInteger(length) && length > 0 && length <= 10000
        ? { length }
        : null
    );
  };
  worker.onerror = () => {
    destroyed = true;
    worker.terminate();
    fail();
  };
  worker.onmessageerror = () => {
    destroyed = true;
    worker.terminate();
    fail();
  };
  return {
    decode(frame) {
      if (destroyed || pending) {
        return Promise.reject(new Error('QR decoder unavailable'));
      }
      return new Promise((resolve, reject) => {
        pending = {
          resolve,
          reject,
          timer: setTimeout(() => {
            destroyed = true;
            worker.terminate();
            fail();
          }, 4000),
        };
        try {
          worker.postMessage(frame, [frame.pixels.buffer as ArrayBuffer]);
        } catch {
          fail();
        }
      });
    },
    destroy() {
      destroyed = true;
      worker.terminate();
      fail();
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
    },
  };
}

export function createFrameCapture(video: HTMLVideoElement) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return () => {
    if (!context || video.readyState < 2 || !video.videoWidth) {
      return null;
    }
    const scale = Math.min(
      1,
      640 / Math.max(video.videoWidth, video.videoHeight)
    );
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
      width: canvas.width,
      height: canvas.height,
    };
  };
}
