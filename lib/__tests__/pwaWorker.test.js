import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function worker() {
  const handlers = {},
    notices = [],
    messages = [],
    navigations = [],
    cacheCalls = [];
  let clients = [
    {
      id: 'one',
      url: 'https://preview.example/wallet',
      postMessage: (m) => messages.push(m),
      navigate: async (href) => navigations.push(href),
      focus: async () => {},
    },
  ];
  let activations = 0,
    failNetwork = false;
  const cached = new Response('public offline');
  runInNewContext(readFileSync('public/service-worker.js', 'utf8'), {
    self: {
      location: { origin: 'https://preview.example' },
      addEventListener: (type, callback) => {
        handlers[type] = callback;
      },
      skipWaiting: async () => {
        activations++;
      },
      clients: {
        matchAll: async () => clients,
        claim: async () => {},
        openWindow: async (href) => navigations.push(href),
      },
      registration: {
        showNotification: async (title, data) =>
          notices.push({ title, ...data }),
      },
    },
    URL,
    Response,
    Set,
    crypto: { randomUUID: () => 'audit' },
    caches: {
      match: async (path) => {
        cacheCalls.push(path);
        return cached;
      },
      open: async () => ({ addAll: async (paths) => cacheCalls.push(paths) }),
      keys: async () => [],
      delete: async () => {},
    },
    fetch: async () => {
      if (failNetwork) throw new Error('offline');
      return new Response('network');
    },
  });
  async function emit(type, input = {}) {
    let wait;
    const event = {
      ...input,
      waitUntil: (promise) => {
        wait = promise;
      },
    };
    handlers[type](event);
    await wait;
  }
  function request(path, options = {}) {
    let response;
    handlers.fetch({
      request: {
        method: 'GET',
        mode: 'cors',
        headers: new Headers(),
        url: `https://preview.example${path}`,
        ...options,
      },
      respondWith: (value) => {
        response = value;
      },
    });
    return response;
  }
  return {
    emit,
    request,
    notices,
    messages,
    navigations,
    cacheCalls,
    activations: () => activations,
    clients: (value) => {
      clients = value;
    },
    offline: () => {
      failNetwork = true;
    },
  };
}
describe('public-only PWA worker', () => {
  test('does not intercept API, writes, authorization or QR parameters', async () => {
    const w = worker();
    for (const path of [
      '/api/mutation',
      '/api/query',
      '/join?qr=secret',
      '/pwa/icon.png?token=secret',
    ])
      expect(w.request(path)).toBeUndefined();
    expect(
      w.request('/manifest.webmanifest', { method: 'POST' })
    ).toBeUndefined();
    expect(
      w.request('/manifest.webmanifest', {
        headers: new Headers({ authorization: 'Bearer fake' }),
      })
    ).toBeUndefined();
    expect(
      w.request('/manifest.webmanifest', {
        url: 'https://other.example/manifest.webmanifest',
      })
    ).toBeUndefined();
    expect(w.cacheCalls).toHaveLength(0);
  });
  test('offline navigation uses generic fallback and never caches navigation', async () => {
    const w = worker();
    w.offline();
    expect(
      await (await w.request('/wallet', { mode: 'navigate' })).text()
    ).toBe('public offline');
    expect(w.cacheCalls).toEqual(['/pwa/offline.html']);
  });
  test('precaches only public static resources', async () => {
    const w = worker();
    await w.emit('install');
    expect(w.cacheCalls).toEqual([
      ['/pwa/offline.html', '/pwa/icon.png', '/manifest.webmanifest'],
    ]);
    expect(w.activations()).toBe(0);
  });
  test('busy or missing clients prevent activation, all safe clients allow it', async () => {
    const w = worker();
    w.clients([
      { id: 'one', postMessage: () => {} },
      { id: 'two', postMessage: () => {} },
    ]);
    await w.emit('message', { data: { type: 'REQUEST_SAFE_ACTIVATION' } });
    await w.emit('message', {
      source: { id: 'one' },
      data: { type: 'UPDATE_SAFETY', nonce: 'audit', safe: true },
    });
    expect(w.activations()).toBe(0);
    await w.emit('message', {
      source: { id: 'two' },
      data: { type: 'UPDATE_SAFETY', nonce: 'audit', safe: false },
    });
    expect(w.activations()).toBe(0);
    await w.emit('message', { data: { type: 'REQUEST_SAFE_ACTIVATION' } });
    for (const id of ['one', 'two'])
      await w.emit('message', {
        source: { id },
        data: { type: 'UPDATE_SAFETY', nonce: 'audit', safe: true },
      });
    expect(w.activations()).toBe(1);
  });
  test('new client appearing during update must consent as well', async () => {
    const w = worker();
    await w.emit('message', { data: { type: 'REQUEST_SAFE_ACTIVATION' } });
    w.clients([{ id: 'one' }, { id: 'new' }]);
    await w.emit('message', {
      source: { id: 'one' },
      data: { type: 'UPDATE_SAFETY', nonce: 'audit', safe: true },
    });
    expect(w.activations()).toBe(0);
  });
  test.each([
    'https://evil.example',
    '//evil.example',
    '/inbox?qr=secret',
    '/wallet#secret',
    '/\\evil.example',
    '/business/private',
  ])('push routing sanitizes %s and hides payload', async (href) => {
    const w = worker();
    await w.emit('push', {
      data: {
        json: () => ({ href, title: 'private customer', body: 'sensitive' }),
      },
    });
    expect(w.notices[0].body).toBe('יש עדכון חדש עבורך');
    expect(w.notices[0].title).toBe('StampAix');
    expect(w.notices[0].data.href).toBe(
      href.startsWith('/inbox?') ? '/inbox' : '/wallet'
    );
  });
  test('notification click routes and focuses same-origin client', async () => {
    const w = worker();
    await w.emit('notificationclick', {
      notification: { close: () => {}, data: { href: '/inbox' } },
    });
    expect(w.navigations).toEqual(['/inbox']);
  });
});
