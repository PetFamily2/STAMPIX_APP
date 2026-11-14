import { useConvexConnectionState } from 'convex/react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import WebPermissionOnboarding from '@/components/web-permissions/WebPermissionOnboarding.web';
import {
  pendingWriteCount,
  subscribePendingWrites,
} from '@/lib/network/pendingWrites';

const UPDATE_INTERVAL_MS = 15 * 60 * 1000;
const RELOAD_GUARD_KEY = 'stampaix:pwa-reload-at';
const RELOAD_GUARD_MS = 8000;

function uncertainty() {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (
        key?.startsWith('stampaix:web-scanner-recovery:') &&
        JSON.parse(sessionStorage.getItem(key) ?? '{}').uncertain
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

function paymentInProgress() {
  const path = location.pathname;
  return path.startsWith('/billing/sumit') || path.includes('/billing/sumit/');
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
  const [dismissed, setDismissed] = useState<ServiceWorker | null>(null);
  const [held, setHeld] = useState(false);
  const [applying, setApplying] = useState(false);
  const [offline, setOffline] = useState(false);
  const busy = useRef(false);
  const attempt = useRef('');
  const safeNow = useRef<() => boolean>(() => false);
  safeNow.current = () =>
    !busy.current &&
    !serverBusy.current &&
    !httpBusy.current &&
    !uncertainty() &&
    !paymentInProgress();
  useEffect(() => {
    if (
      process.env.EXPO_PUBLIC_PWA_ENABLED !== 'true' ||
      !isSecureContext ||
      location.protocol !== 'https:' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }
    let disposed = false;
    let timer = 0;
    let registration: ServiceWorkerRegistration | null = null;
    const network = () => setOffline(navigator.onLine === false);
    const scanner = (event: Event) => {
      busy.current = (event as CustomEvent).detail === true;
    };
    const publishWaiting = (worker: ServiceWorker | null) => {
      if (
        disposed ||
        !worker ||
        !navigator.serviceWorker.controller ||
        worker === navigator.serviceWorker.controller
      ) {
        return;
      }
      setWaiting(worker);
    };
    const checkForUpdate = () => {
      if (
        !registration ||
        navigator.onLine === false ||
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      void registration.update().catch(() => {
        /* A failed check leaves the current version running. */
      });
    };
    const arm = () => {
      window.clearInterval(timer);
      if (document.visibilityState === 'hidden') {
        return;
      }
      timer = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        window.clearInterval(timer);
        return;
      }
      checkForUpdate();
      arm();
    };
    const onOnline = () => {
      network();
      checkForUpdate();
    };
    const answerSafety = (nonce: string) => {
      const payload = {
        type: 'UPDATE_SAFETY',
        nonce,
        safe: safeNow.current(),
      };
      void navigator.serviceWorker.getRegistration().then((next) => {
        next?.waiting?.postMessage(payload);
        next?.active?.postMessage(payload);
      });
    };
    const channel =
      typeof BroadcastChannel === 'function'
        ? new BroadcastChannel('stampaix-pwa-update')
        : null;
    const onChannel = (event: MessageEvent) => {
      if (event.data?.type === 'CHECK_UPDATE_SAFE') {
        answerSafety(event.data.nonce);
      }
    };
    channel?.addEventListener('message', onChannel);
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'CHECK_UPDATE_SAFE') {
        answerSafety(event.data.nonce);
        event.source?.postMessage({
          type: 'UPDATE_SAFETY',
          nonce: event.data.nonce,
          safe: safeNow.current(),
        });
        return;
      }
      if (event.data?.type === 'UPDATE_BLOCKED') {
        setHeld(true);
      }
    };
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const changed = () => {
      if (
        reloaded ||
        !hadController ||
        busy.current ||
        httpBusy.current ||
        uncertainty() ||
        paymentInProgress()
      ) {
        return;
      }
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
        if (Date.now() - last < RELOAD_GUARD_MS) {
          return;
        }
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      } catch {
        /* Reload still proceeds once in this document. */
      }
      reloaded = true;
      attempt.current = '';
      location.reload();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', network);
    window.addEventListener('stampaix:scanner-busy', scanner);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker.addEventListener('message', message);
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    network();
    void navigator.serviceWorker
      .register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
      .then((next) => {
        if (disposed) {
          return;
        }
        registration = next;
        publishWaiting(next.waiting);
        next.addEventListener('updatefound', () => {
          const worker = next.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
              publishWaiting(next.waiting);
            }
          });
        });
        checkForUpdate();
        arm();
      })
      .catch(() => {
        /* Installation failure does not block online app use. */
      });
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', network);
      window.removeEventListener('stampaix:scanner-busy', scanner);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker.removeEventListener('message', message);
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      channel?.removeEventListener('message', onChannel);
      channel?.close();
    };
  }, []);
  const update = () => {
    if (!waiting) {
      return;
    }
    if (!safeNow.current()) {
      setApplying(false);
      setHeld(true);
      return;
    }
    const nonce = crypto.randomUUID();
    attempt.current = nonce;
    setHeld(false);
    setApplying(true);
    waiting.postMessage({ type: 'REQUEST_SAFE_ACTIVATION', nonce });
    waiting.postMessage({
      type: 'UPDATE_SAFETY',
      nonce,
      safe: true,
    });
    if (typeof BroadcastChannel === 'function') {
      const channel = new BroadcastChannel('stampaix-pwa-update');
      channel.postMessage({ type: 'CHECK_UPDATE_SAFE', nonce });
      channel.close();
    }
    window.setTimeout(() => {
      if (attempt.current === nonce) {
        setApplying(false);
        setHeld(true);
      }
    }, 2500);
  };
  const showUpdate = waiting != null && waiting !== dismissed;
  return (
    <>
      <WebPermissionOnboarding />
      {offline ? (
        <p dir="rtl" style={offlineStyle}>
          אין חיבור לרשת. פעולות סריקה חסומות.
        </p>
      ) : null}
      {showUpdate ? (
        <aside aria-live="polite" dir="rtl" style={bannerStyle}>
          <strong style={titleStyle}>🚀 גרסה חדשה זמינה</strong>
          <span style={actionsStyle}>
            <button type="button" onClick={update} style={updateButtonStyle}>
              {applying && !held ? 'מעדכנים…' : 'עדכון עכשיו'}
            </button>
            <button
              type="button"
              aria-label="סגירת הודעת העדכון"
              onClick={() => setDismissed(waiting)}
              style={closeButtonStyle}
            >
              ×
            </button>
          </span>
          {held ? <p style={heldStyle}>העדכון יתאפשר בסיום הפעולה</p> : null}
        </aside>
      ) : null}
    </>
  );
}

const bannerStyle = {
  position: 'fixed' as const,
  zIndex: 2000,
  top: 12,
  insetInline: 12,
  marginInline: 'auto',
  width: 'min(440px, calc(100% - 24px))',
  display: 'flex',
  flexWrap: 'wrap' as const,
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 14,
  border: '1px solid #D5DBE6',
  background: '#FFFFFF',
  color: '#101936',
  boxShadow: '0 8px 24px #10193614',
  textAlign: 'right' as const,
};
const titleStyle = { fontSize: 14, lineHeight: '20px', fontWeight: 700 };
const actionsStyle = { display: 'flex', alignItems: 'center', gap: 6 };
const updateButtonStyle = {
  minHeight: 36,
  padding: '6px 12px',
  border: 0,
  borderRadius: 999,
  background: '#1230A8',
  color: '#FFFFFF',
  font: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
};
const closeButtonStyle = {
  width: 36,
  height: 36,
  border: 0,
  borderRadius: 10,
  background: 'transparent',
  color: '#475569',
  font: 'inherit',
  fontSize: 20,
  cursor: 'pointer',
};
const heldStyle = {
  flexBasis: '100%',
  margin: 0,
  color: '#475569',
  fontSize: 12,
  lineHeight: '17px',
};
const offlineStyle = {
  margin: 0,
  padding: '6px 12px',
  background: '#FFF7ED',
  color: '#9A3412',
  textAlign: 'right' as const,
  fontSize: 13,
};
