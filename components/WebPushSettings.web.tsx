import { useAuthToken } from '@convex-dev/auth/react';
import { useEffect, useRef, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { createHttpTransport } from '@/lib/web-scanner/httpTransport';
import { getConvexUrl } from '@/utils/convexConfig';
import { PUSH_OWNER_KEY } from './WebPushLifecycle.web';

export default function WebPushSettings() {
  const { user } = useUser();
  const token = useAuthToken();
  const current = useRef({ user, token });
  current.current = { user, token };
  const [busy, setBusy] = useState(false),
    [enabled, setEnabled] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    let disposed = false;
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker
        .getRegistration('/')
        .then(async (registration) => {
          const subscription =
            await registration?.pushManager.getSubscription();
          if (!disposed)
            setEnabled(
              !!subscription &&
                typeof Notification !== 'undefined' &&
                Notification.permission === 'granted' &&
                localStorage.getItem(PUSH_OWNER_KEY) === String(user?._id)
            );
        });
    return () => {
      disposed = true;
    };
  }, [user?._id]);
  const toggle = async () => {
    if (busy || !user || !token) return;
    setBusy(true);
    setMessage('');
    const actorId = user._id;
    const scope = {
      actorId,
      businessId: '',
      programId: '',
      runtimeId: '',
      deviceId: '',
    };
    const http = createHttpTransport({
      url: getConvexUrl(),
      token: () => current.current.token,
      valid: () => current.current.user?._id === actorId,
      online: () => navigator.onLine !== false,
    });
    try {
      if (
        !isSecureContext ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      )
        throw new Error('UNSUPPORTED');
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration?.active) throw new Error('INSTALL_REQUIRED');
      let previous = await registration.pushManager.getSubscription();
      if (
        previous &&
        localStorage.getItem(PUSH_OWNER_KEY) !== String(actorId)
      ) {
        await previous.unsubscribe();
        previous = null;
        localStorage.removeItem(PUSH_OWNER_KEY);
      }
      if (enabled && previous) {
        await http.request(scope, 'mutation', 'webPush:unsubscribe', {
          endpoint: previous.endpoint,
        });
        await previous.unsubscribe();
        localStorage.removeItem(PUSH_OWNER_KEY);
        setEnabled(false);
        return;
      }
      const config = await http.request(
        scope,
        'query',
        'webPush:configuration',
        {}
      );
      if (!config.enabled || !config.publicKey)
        throw new Error('NOT_CONFIGURED');
      // Permission is requested only from this explicit user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('DENIED');
      if (current.current.user?._id !== actorId) throw new Error('STALE');
      const key = Uint8Array.from(
        atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/')),
        (c) => c.charCodeAt(0)
      );
      localStorage.setItem(PUSH_OWNER_KEY, String(actorId));
      const subscription =
        previous ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      const serialized = subscription.toJSON();
      try {
        await http.request(scope, 'mutation', 'webPush:subscribe', {
          endpoint: subscription.endpoint,
          p256dh: serialized.keys?.p256dh,
          auth: serialized.keys?.auth,
        });
      } catch {
        await subscription.unsubscribe();
        localStorage.removeItem(PUSH_OWNER_KEY);
        throw new Error('REGISTRATION_FAILED');
      }
      if (current.current.user?._id === actorId) setEnabled(true);
    } catch {
      if (current.current.user?._id === actorId)
        setMessage(
          'לא ניתן להפעיל התראות כרגע. ב-iPhone נדרשת התקנה למסך הבית והרשאה; אפשר להמשיך לקרוא עדכונים בתיבת ההודעות.'
        );
    } finally {
      if (current.current.user?._id === actorId) setBusy(false);
    }
  };
  return (
    <section dir="rtl" style={{ padding: 16 }}>
      <h2>התראות בדפדפן</h2>
      <button type="button" disabled={busy} onClick={() => void toggle()}>
        {busy ? 'מעדכנים…' : enabled ? 'כיבוי התראות' : 'הפעלת התראות'}
      </button>
      {message ? <output>{message}</output> : null}
    </section>
  );
}
