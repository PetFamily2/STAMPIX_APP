import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import QRCode from 'qrcode';
import {
  attachCameraLifecycle,
  WebQrController,
} from '../web-scanner/controller';
import {
  cameraConstraints,
  cameraErrorStatus,
  decodeDelay,
  initialScannerState,
  isScannerLabEnabled,
  scannerReducer,
} from '../web-scanner/state';

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};
function fixture(overrides = {}) {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const track = Object.assign(new EventTarget(), {
    stopped: 0,
    stop() {
      this.stopped++;
    },
    getCapabilities: () => ({}),
    getSettings: () => ({ deviceId: 'rear-1' }),
  });
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const video = {
    currentTime: 1,
    readyState: 2,
    videoWidth: 640,
    videoHeight: 480,
    pause: () => {},
    play: () => Promise.resolve(),
    srcObject: null,
  };
  let requests = 0;
  let decoderDestroyed = 0;
  let decodeResult = null;
  let decodeCalls = 0;
  let visible = true;
  const camera = new WebQrController({
    video,
    media: {
      getUserMedia: () => {
        requests++;
        return Promise.resolve(stream);
      },
      enumerateDevices: () =>
        Promise.resolve([
          { kind: 'videoinput', deviceId: 'rear-1', label: 'Rear' },
        ]),
    },
    secure: true,
    isVisible: () => visible,
    capture: () => ({ pixels: new Uint8ClampedArray(4), width: 1, height: 1 }),
    createDecoder: () => ({
      decode: () => {
        decodeCalls++;
        return Promise.resolve(decodeResult);
      },
      destroy: () => {
        decoderDestroyed++;
      },
    }),
    onState: () => {},
    now: () => now,
    schedule: (callback, delay) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    cancel: (id) => timers.delete(id),
    ...overrides,
  });
  return {
    camera,
    track,
    stream,
    video,
    timers,
    requests: () => requests,
    destroyed: () => decoderDestroyed,
    decodes: () => decodeCalls,
    result: (value) => {
      decodeResult = value;
    },
    visible: (value) => {
      visible = value;
    },
    advance: async (delta) => {
      now += delta;
      const entry = [...timers.entries()].sort(
        (a, b) => a[1].delay - b[1].delay
      )[0];
      if (entry) {
        timers.delete(entry[0]);
        entry[1].callback();
        await flush();
      }
    },
  };
}

describe('permission, local state and rollout', () => {
  test.each([
    'production',
    'development',
    '',
    undefined,
  ])('lab absent outside Preview: %s', (environment) => {
    expect(isScannerLabEnabled(environment, 'true')).toBe(false);
  });
  test.each([
    'false',
    undefined,
    'TRUE',
    '1',
  ])('lab closed for flag: %s', (flag) => {
    expect(isScannerLabEnabled('preview', flag)).toBe(false);
  });
  test('explicit Preview flag is required', () =>
    expect(isScannerLabEnabled('preview', 'true')).toBe(true));
  test('rear preference and no audio; exact camera selected only explicitly', () => {
    expect(cameraConstraints().video.facingMode).toEqual({
      ideal: 'environment',
    });
    expect(cameraConstraints().audio).toBe(false);
    expect(cameraConstraints('rear-2').video.deviceId).toEqual({
      exact: 'rear-2',
    });
  });
  test.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no-camera'],
    ['NotReadableError', 'error'],
  ])('camera error %s becomes %s', (name, status) => {
    expect(cameraErrorStatus(new DOMException('sensitive error', name))).toBe(
      status
    );
  });
  test('single result locks until explicit reset; state contains metadata only', () => {
    const scanning = scannerReducer(initialScannerState, {
      type: 'status',
      status: 'scanning',
    });
    const locked = scannerReducer(scanning, { type: 'decoded', length: 20 });
    expect(locked.result).toEqual({ format: 'QR', length: 20 });
    expect(scannerReducer(locked, { type: 'decoded', length: 50 })).toBe(
      locked
    );
    expect(scannerReducer(locked, { type: 'reset' }).result).toBeUndefined();
  });
  test('slow decodes reduce frequency without unbounded delay', () => {
    expect(decodeDelay(20)).toBe(250);
    expect(decodeDelay(200)).toBe(600);
    expect(decodeDelay(10000)).toBe(1000);
  });
  test.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'no-camera'],
  ])('permission failure %s does not retry automatically', async (name, status) => {
    let count = 0;
    const f = fixture({
      media: {
        getUserMedia: () => {
          count++;
          return Promise.reject(new DOMException('', name));
        },
        enumerateDevices: async () => [],
      },
    });
    await f.camera.start();
    f.camera.resume();
    expect(f.camera.state.status).toBe(status);
    expect(count).toBe(1);
    expect(f.timers.size).toBe(0);
    f.camera.destroy();
  });
  test.each([
    { secure: false },
    { media: undefined },
  ])('unsupported/insecure never opens camera', async (options) => {
    const f = fixture(options);
    await f.camera.start();
    expect(f.requests()).toBe(0);
    f.camera.destroy();
  });
});

describe('camera lifecycle and cancellation', () => {
  test('background while video.play is pending cancels playback and can recover', async () => {
    const f = fixture();
    f.video.play = () => new Promise(() => {});
    const starting = f.camera.start();
    await flush();
    f.camera.suspend();
    await starting;
    f.video.play = () => Promise.resolve();
    f.camera.resume();
    await flush();
    expect(f.camera.state.status).toBe('scanning');
    expect(f.requests()).toBe(2);
    f.camera.destroy();
  });
  test('successful start, camera enumeration, duplicate suppression and reset', async () => {
    const f = fixture();
    f.result({ length: 36 });
    await f.camera.start();
    expect(f.camera.state.status).toBe('scanning');
    expect(f.camera.state.cameras).toHaveLength(1);
    expect(f.video.playsInline).toBe(true);
    expect(f.video.muted).toBe(true);
    await f.advance(250);
    expect(f.camera.state.status).toBe('locked');
    expect(f.decodes()).toBe(1);
    expect(f.track.stopped).toBe(1);
    expect(f.destroyed()).toBe(1);
    await f.camera.start();
    expect(f.requests()).toBe(1);
    f.camera.reset();
    await f.camera.start();
    expect(f.requests()).toBe(2);
    f.camera.destroy();
  });
  test('late permission after unmount is stopped and never decoded', async () => {
    let resolve;
    const permission = new Promise((done) => {
      resolve = done;
    });
    const f = fixture({
      media: {
        getUserMedia: () => permission,
        enumerateDevices: async () => [],
      },
    });
    const starting = f.camera.start();
    f.camera.destroy();
    resolve(f.stream);
    await starting;
    expect(f.track.stopped).toBe(1);
    expect(f.decodes()).toBe(0);
    expect(f.video.srcObject).toBeNull();
    expect(f.timers.size).toBe(0);
  });
  test('stop during decode drops late results', async () => {
    let resolve;
    const decoding = new Promise((done) => {
      resolve = done;
    });
    const f = fixture({
      createDecoder: () => ({ decode: () => decoding, destroy: () => {} }),
    });
    await f.camera.start();
    await f.advance(250);
    f.camera.stop();
    resolve({ length: 25 });
    await flush();
    expect(f.camera.state.result).toBeUndefined();
    expect(f.camera.state.status).toBe('idle');
    expect(f.timers.size).toBe(0);
  });
  test('visibility/pagehide stop resources; foreground resumes; listeners detach', async () => {
    const f = fixture();
    const doc = new EventTarget();
    doc.visibilityState = 'visible';
    const win = new EventTarget();
    const detach = attachCameraLifecycle(f.camera, doc, win);
    await f.camera.start();
    f.visible(false);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(f.track.stopped).toBe(1);
    expect(f.camera.state.status).toBe('paused');
    f.visible(true);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(f.requests()).toBe(2);
    win.dispatchEvent(new Event('pagehide'));
    win.dispatchEvent(new Event('pageshow'));
    await flush();
    expect(f.requests()).toBe(3);
    detach();
    win.dispatchEvent(new Event('pageshow'));
    await flush();
    expect(f.requests()).toBe(3);
    expect(f.timers.size).toBe(0);
  });
  test('manual stop does not resume on foreground', async () => {
    const f = fixture();
    await f.camera.start();
    f.camera.stop();
    f.camera.resume();
    expect(f.requests()).toBe(1);
    f.camera.destroy();
  });
  test('camera switching releases the old stream before reopening', async () => {
    const f = fixture();
    await f.camera.start();
    await f.camera.start('rear-2');
    expect(f.track.stopped).toBe(1);
    expect(f.requests()).toBe(2);
    f.camera.destroy();
  });
  test('ended track pauses; retry can restart', async () => {
    const f = fixture();
    await f.camera.start();
    f.track.dispatchEvent(new Event('ended'));
    expect(f.camera.state.status).toBe('paused');
    await f.camera.start();
    expect(f.requests()).toBe(2);
    f.camera.destroy();
  });
  test('stalled frames fail gracefully; restart is possible', async () => {
    const f = fixture();
    await f.camera.start();
    await f.advance(250);
    await f.advance(9000);
    expect(f.camera.state.status).toBe('error');
    expect(f.timers.size).toBe(0);
    await f.camera.start();
    expect(f.camera.state.status).toBe('scanning');
    f.camera.destroy();
  });
  test('decoder failure stops the camera without exposing error text', async () => {
    const f = fixture({
      createDecoder: () => ({
        decode: () => Promise.reject(new Error('private')),
        destroy: () => {},
      }),
    });
    await f.camera.start();
    await f.advance(250);
    expect(f.camera.state.status).toBe('error');
    expect(JSON.stringify(f.camera.state)).not.toContain('private');
    f.camera.destroy();
  });
  test('idle 2 minute session stops rather than growing decoder memory indefinitely', async () => {
    const f = fixture();
    await f.camera.start();
    await f.advance(120001);
    expect(f.camera.state.status).toBe('paused');
    expect(f.track.stopped).toBe(1);
    f.camera.destroy();
  });
});

describe('real pinned worker QR decode, no raw result across boundary', () => {
  function decodePayload(payload, options = {}) {
    const qr = QRCode.create(payload, {
      errorCorrectionLevel: 'M',
      ...options,
    });
    const scale = 3;
    const quiet = 4;
    const width = (qr.modules.size + quiet * 2) * scale;
    const pixels = new Uint8ClampedArray(width * width * 4);
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        const mx = Math.floor(x / scale) - quiet;
        const my = Math.floor(y / scale) - quiet;
        const dark =
          mx >= 0 &&
          my >= 0 &&
          mx < qr.modules.size &&
          my < qr.modules.size &&
          qr.modules.get(my, mx);
        const offset = (y * width + x) * 4;
        pixels[offset] =
          pixels[offset + 1] =
          pixels[offset + 2] =
            dark ? 0 : 255;
        pixels[offset + 3] = 255;
      }
    }
    const output = [];
    const scope = {
      Uint8ClampedArray,
      self: { postMessage: (data) => output.push(data) },
    };
    const context = vm.createContext(scope);
    scope.importScripts = (url) => {
      expect(url).toBe('./jsqr-1.4.0.js');
      vm.runInContext(
        readFileSync('vendor/jsqr/jsqr-1.4.0.js', 'utf8'),
        context
      );
    };
    vm.runInContext(
      readFileSync('web/scanner-lab/qr-worker.js', 'utf8'),
      context
    );
    scope.self.onmessage({ data: { pixels, width, height: width } });
    return output[0];
  }
  test.each([
    'PHASE2-QR-ONLY',
    'https://example.invalid/qr-test',
    'בדיקת סריקה מקומית',
    'fixture-'.repeat(80),
  ])('decodes fixture %# and returns only format metadata', (payload) => {
    const result = decodePayload(payload);
    expect(result).toEqual({ type: 'result', length: payload.length });
    expect(JSON.stringify(result)).not.toContain(payload);
  });
  test('dense version 20 fixture also decodes', () =>
    expect(decodePayload('fixture-v20', { version: 20 })).toEqual({
      type: 'result',
      length: 11,
    }));
  test.each(
    Array.from({ length: 40 }, (_, index) => index + 1)
  )('independent encoder fixture for standard QR version %i', (version) => {
    expect(decodePayload('QR-ONLY', { version })).toEqual({
      type: 'result',
      length: 7,
    });
  });
  test('decoder is the unmodified upstream distribution', () => {
    const source = readFileSync('vendor/jsqr/jsqr-1.4.0.js');
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      'bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859'
    );
  });
});
