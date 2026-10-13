import { useConvexConnectionState } from 'convex/react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  pendingWriteCount,
  subscribePendingWrites,
} from '@/lib/network/pendingWrites';

function uncertainty() {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (
        key?.startsWith('stampaix:web-scanner-recovery:') &&
        JSON.parse(sessionStorage.getItem(key) ?? '{}').uncertain
      )
        return true;
    }
    return false;
  } catch {
    return true;
  }
}
export default function PwaRuntime() {
  const connection = useConvexConnectionState();
  const writes = useSyncExternalStore(
    subscribePendingWrites,
    pendingWriteCount,
    () => 0
  );
  const httpBusy = useRef(false);
  httpBusy.current = writes > 0;
  const serverBusy = useRef(false);
  serverBusy.current = connection.hasInflightRequests;
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    if (
      process.env.EXPO_PUBLIC_PWA_ENABLED !== 'true' ||
      !isSecureContext ||
      location.protocol !== 'https:' ||
      !('serviceWorker' in navigator)
    )
      return;
    let disposed = false;
    const network = () => setOffline(navigator.onLine === false);
    const scanner = (event: Event) => {
      busy.current = (event as CustomEvent).detail === true;
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'CHECK_UPDATE_SAFE')
        event.source?.postMessage({
          type: 'UPDATE_SAFETY',
          nonce: event.data.nonce,
          safe:
            !busy.current &&
            !serverBusy.current &&
            !httpBusy.current &&
            !uncertainty(),
        });
    };
    const hadController = !!navigator.serviceWorker.controller;
    const changed = () => {
      if (
        hadController &&
        !busy.current &&
        !serverBusy.current &&
        !httpBusy.current &&
        !uncertainty()
      )
        location.reload();
    };
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    window.addEventListener('stampaix:scanner-busy', scanner);
    navigator.serviceWorker.addEventListener('message', message);
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    network();
    void navigator.serviceWorker
      .register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        if (disposed) return;
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (
              !disposed &&
              worker.state === 'installed' &&
              navigator.serviceWorker.controller
            )
              setWaiting(registration.waiting);
          });
        });
      })
      .catch(() => {
        /* Installation failure does not block online app use. */
      });
    return () => {
      disposed = true;
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
      window.removeEventListener('stampaix:scanner-busy', scanner);
      navigator.serviceWorker.removeEventListener('message', message);
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
    };
  }, []);
  if (!offline && !waiting) return null;
  return (
    <aside
      dir="rtl"
      aria-live="polite"
      style={{
        background: '#eff6ff',
        padding: 12,
        color: '#172033',
        textAlign: 'right',
      }}
    >
      {offline ? <p>אין חיבור לרשת. פעולות סריקה חסומות.</p> : null}
      {waiting ? (
        <button
          type="button"
          style={{ minHeight: 44, padding: '8px 12px' }}
          onClick={() => {
            if (
              !busy.current &&
              !serverBusy.current &&
              !httpBusy.current &&
              !uncertainty()
            )
              waiting.postMessage({ type: 'REQUEST_SAFE_ACTIVATION' });
          }}
        >
          גרסה חדשה זמינה — עדכון כשאין פעולה ממתינה
        </button>
      ) : null}
    </aside>
  );
}
