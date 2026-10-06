/* Public static assets only. No API cache, offline write queue, Sync or credentials. */
const CACHE = 'stampaix-public-rc-v1';
const PUBLIC = ['/pwa/offline.html', '/pwa/icon.png', '/manifest.webmanifest'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC)));
  // Activation waits for closed clients or an explicit unanimous safe-update handshake.
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('stampaix-public-') && key !== CACHE)
          await caches.delete(key);
      await self.clients.claim();
    })()
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    request.headers.has('authorization')
  )
    return;
  if (!url.search && PUBLIC.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(url.pathname);
        return cached ?? fetch(request, { cache: 'no-store' });
      })()
    );
  } else if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(
        async () =>
          (await caches.match('/pwa/offline.html')) ??
          new Response('Offline', { status: 503 })
      )
    );
  }
  // All other requests are untouched, including Convex HTTP/WebSocket/auth/QR/analytics.
});
let audit = null;
self.addEventListener('message', (event) => {
  if (event.data?.type === 'REQUEST_SAFE_ACTIVATION') {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        if (!clients.length) return;
        audit = {
          nonce: crypto.randomUUID(),
          ids: new Set(clients.map((c) => c.id)),
          safe: new Set(),
        };
        for (const client of clients)
          client.postMessage({ type: 'CHECK_UPDATE_SAFE', nonce: audit.nonce });
      })()
    );
  } else if (
    event.data?.type === 'UPDATE_SAFETY' &&
    audit &&
    event.data.nonce === audit.nonce &&
    event.source &&
    audit.ids.has(event.source.id)
  ) {
    if (event.data.safe !== true) {
      audit = null;
      return;
    }
    audit.safe.add(event.source.id);
    if (audit.safe.size === audit.ids.size)
      event.waitUntil(
        (async () => {
          const current = audit;
          const clients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          if (current && clients.every((c) => current.safe.has(c.id)))
            await self.skipWaiting();
          if (audit === current) audit = null;
        })()
      );
  }
});
function destination(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  )
    return '/wallet';
  const url = new URL(value, self.location.origin);
  return ['/wallet', '/rewards', '/business/campaigns', '/inbox'].includes(
    url.pathname
  )
    ? url.pathname
    : '/wallet';
}
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data?.json() ?? {};
      } catch {
        /* No raw payload reporting. */
      }
      await self.registration.showNotification('StampAix', {
        body: 'יש עדכון חדש עבורך',
        icon: '/pwa/icon.png',
        badge: '/pwa/icon.png',
        tag:
          typeof data.tag === 'string'
            ? data.tag.slice(0, 64)
            : 'stampaix-update',
        data: { href: destination(data.href) },
      });
    })()
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const href = destination(event.notification.data?.href);
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const client = clients.find(
        (c) => new URL(c.url).origin === self.location.origin
      );
      if (client) {
        await client.navigate(href);
        await client.focus();
      } else await self.clients.openWindow(href);
    })()
  );
});
