import { afterEach, expect, test } from 'bun:test';
import { createRawWorkerDecoder } from '../web-scanner/rawWorker';

const original = globalThis.Worker;
let worker;
class FakeWorker {
  constructor(path) {
    this.path = path;
    worker = this;
  }
  postMessage(frame) {
    this.frame = frame;
  }
  terminate() {
    this.stopped = true;
  }
}
afterEach(() => {
  globalThis.Worker = original;
});
const frame = () => ({
  pixels: new Uint8ClampedArray(16),
  width: 2,
  height: 2,
});
test('QR crosses only the memory callback; controller receives metadata and stop releases worker', async () => {
  globalThis.Worker = FakeWorker;
  let raw;
  const decoder = createRawWorkerDecoder((value) => {
    raw = value;
  });
  const pending = decoder.decode(frame());
  worker.onmessage({ data: { data: 'synthetic-memory-only' } });
  expect(await pending).toEqual({ length: 21 });
  expect(raw).toBe('synthetic-memory-only');
  expect(worker.path).toBe('/scanner-business-assets/qr-worker.js');
  decoder.destroy();
  expect(worker.stopped).toBe(true);
  expect(worker.onmessage).toBeNull();
});
test('duplicate decode is rejected and overlong payload never reaches consumer', async () => {
  globalThis.Worker = FakeWorker;
  let calls = 0;
  const decoder = createRawWorkerDecoder(() => calls++);
  const pending = decoder.decode(frame());
  await expect(decoder.decode(frame())).rejects.toThrow('UNAVAILABLE');
  worker.onmessage({ data: { data: 'a'.repeat(10001) } });
  expect(await pending).toBeNull();
  expect(calls).toBe(0);
  decoder.destroy();
});
test('worker failure rejects without passing provider error or QR to consumer', async () => {
  globalThis.Worker = FakeWorker;
  let calls = 0;
  const decoder = createRawWorkerDecoder(() => calls++);
  const pending = decoder.decode(frame());
  worker.onerror({ message: 'sensitive' });
  await expect(pending).rejects.toThrow('DECODER_UNAVAILABLE');
  expect(calls).toBe(0);
  expect(worker.stopped).toBe(true);
  decoder.destroy();
});
