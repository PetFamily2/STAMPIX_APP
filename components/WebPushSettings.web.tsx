import { useAuthToken } from '@convex-dev/auth/react';
import { useEffect, useRef, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import {
  isAppleMobile,
  pushAvailability,
  pushFailureMessage,
} from '@/lib/web-permissions/browserPermissions';
import { useWebInstall } from '@/lib/web-permissions/installPrompt';
import { createHttpTransport } from '@/lib/web-scanner/httpTransport';
import { getConvexUrl } from '@/utils/convexConfig';
import { SystemTeamEntry } from './system-team/SystemTeamEntry.web';
import { PUSH_OWNER_KEY } from './WebPushLifecycle.web';
import { BrowserPermissionsPanel } from './web-permissions/BrowserPermissionsPanel.web';

export default function WebPushSettings() {
  const { user } = useUser();
  return (
    <>
      <BrowserPermissionsPanel>
        <BrowserPushControl key={String(user?._id ?? 'none')} />
      </BrowserPermissionsPanel>
      <SystemTeamEntry />
    </>
  );
}

export function BrowserPushControl({ onEnabled }: { onEnabled?: () => void }) {
  const { user } = useUser();
  const token = useAuthToken();
  const current = useRef({ user, token });
  current.current = { user, token };
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const { installed } = useWebInstall();
  const [config, setConfig] = useState<{
    enabled: boolean;
    publicKey: string | null;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [permission, setPermission] =
    useState<NotificationPermission>('default');
  const [checking, setChecking] = useState(true);
  const refreshRef = useRef<() => void>(() => {});
  const accountId = user?._id;
  const [busy, setBusy] = useState(false),
    [enabled, setEnabled] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    let revision = 0;
    const refresh = async () => {
      if (inFlight.current) {
        return;
      }
      const version = ++revision;
      const valid = () => !disposed && version === revision;
      setChecking(true);
      setConfig(null);
      setEnabled(false);
      try {
        const reason = pushAvailability({
          secure: window.isSecureContext,
          appleMobile: isAppleMobile(
            navigator.userAgent,
            navigator.maxTouchPoints
          ),
          standalone: installed,
          supported:
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window,
        });
        if (reason) {
          throw new Error(reason);
        }
        if (valid()) {
          setPermission(Notification.permission);
        }
        if (!accountId || !token) {
          if (valid()) {
            setEnabled(false);
          }
          return;
        }
        if (navigator.onLine === false) {
          throw new Error('OFFLINE');
        }
        const registration = await navigator.serviceWorker.getRegistration('/');
        if (!registration?.active) {
          throw new Error('INSTALL_REQUIRED');
        }
        const subscription = await registration.pushManager.getSubscription();
        let owner: string | null;
        try {
          owner = localStorage.getItem(PUSH_OWNER_KEY);
        } catch {
          throw new Error('STORAGE_UNAVAILABLE');
        }
        if (valid()) {
          setEnabled(
            !!subscription &&
              Notification.permission === 'granted' &&
              owner === String(accountId)
          );
        }
        const next = await createHttpTransport({
          url: getConvexUrl(),
          token: () => current.current.token,
          valid: () => valid() && current.current.user?._id === accountId,
          online: () => navigator.onLine !== false,
        }).request(
          {
            actorId: accountId,
            businessId: '',
            programId: '',
            runtimeId: '',
            deviceId: '',
          },
          'query',
          'webPush:configuration',
          {}
        );
        if (valid()) {
          setConfig(next);
          setFailure(next.enabled && next.publicKey ? null : 'NOT_CONFIGURED');
        }
      } catch (error) {
        if (valid()) {
          setFailure(error instanceof Error ? error.message : 'UNKNOWN');
        }
      } finally {
        if (valid()) {
          setChecking(false);
        }
      }
    };
    const visible = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    refreshRef.current = () => void refresh();
    void refresh();
    window.addEventListener('focus', visible);
    window.addEventListener('online', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      ++revision;
      window.removeEventListener('focus', visible);
      window.removeEventListener('online', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [accountId, token, installed]);
  const toggle = async () => {
    if (inFlight.current || checking || !user || !token) {
      return;
    }
    if (
      !enabled &&
      (!config?.enabled || !config.publicKey || permission === 'denied')
    ) {
      return;
    }
    inFlight.current = true;
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
      valid: () => mounted.current && current.current.user?._id === actorId,
      online: () => navigator.onLine !== false,
    });
    const valid = () =>
      mounted.current && current.current.user?._id === actorId;
    try {
      if (
        !isSecureContext ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        throw new Error('UNSUPPORTED');
      }
      if (navigator.onLine === false) {
        throw new Error('OFFLINE');
      }
      // Keep the permission prompt in the original click, before the first await.
      const permissionRequest =
        enabled || Notification.permission === 'granted'
          ? Promise.resolve(Notification.permission)
          : Notification.requestPermission();
      const nextPermission = await permissionRequest;
      if (!valid()) {
        return;
      }
      setPermission(nextPermission);
      if (!enabled && nextPermission !== 'granted') {
        throw new Error(nextPermission === 'denied' ? 'DENIED' : 'DISMISSED');
      }
      const registration = await navigator.serviceWorker.getRegistration('/');
      if (!valid()) {
        return;
      }
      if (!registration?.active) {
        throw new Error('INSTALL_REQUIRED');
      }
      let previous = await registration.pushManager.getSubscription();
      if (!valid()) {
        return;
      }
      if (
        previous &&
        localStorage.getItem(PUSH_OWNER_KEY) !== String(actorId)
      ) {
        await previous.unsubscribe();
        if (!valid()) {
          return;
        }
        previous = null;
        localStorage.removeItem(PUSH_OWNER_KEY);
      }
      if (enabled && previous) {
        await http.request(scope, 'mutation', 'webPush:unsubscribe', {
          endpoint: previous.endpoint,
        });
        if (!valid()) {
          return;
        }
        await previous.unsubscribe();
        if (!valid()) {
          return;
        }
        localStorage.removeItem(PUSH_OWNER_KEY);
        setEnabled(false);
        setMessage(
          'חיבור ההתראות לחשבון כובה. אפשר לבטל גם את הרשאת הדפדפן בהגדרות האתר.'
        );
        return;
      }
      if (!config?.enabled || !config.publicKey) {
        throw new Error('NOT_CONFIGURED');
      }
      const key = Uint8Array.from(
        atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/')),
        (c) => c.charCodeAt(0)
      );
      try {
        localStorage.setItem(PUSH_OWNER_KEY, String(actorId));
      } catch {
        throw new Error('STORAGE_UNAVAILABLE');
      }
      const subscription =
        previous ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      if (!valid()) {
        await subscription.unsubscribe();
        return;
      }
      const serialized = subscription.toJSON();
      try {
        await http.request(scope, 'mutation', 'webPush:subscribe', {
          endpoint: subscription.endpoint,
          p256dh: serialized.keys?.p256dh,
          auth: serialized.keys?.auth,
        });
      } catch {
        await subscription.unsubscribe();
        if (valid()) {
          localStorage.removeItem(PUSH_OWNER_KEY);
        }
        throw new Error('REGISTRATION_FAILED');
      }
      if (valid()) {
        setEnabled(true);
        setMessage('ההתראות מחוברות לחשבון. העדפת דיוור שיווקי לא השתנתה.');
        onEnabled?.();
      }
    } catch (error) {
      if (valid()) {
        setMessage(
          pushFailureMessage(error instanceof Error ? error.message : 'UNKNOWN')
        );
      }
    } finally {
      inFlight.current = false;
      if (valid()) {
        setBusy(false);
      }
    }
  };
  return (
    <section dir="rtl" className="permission-row" aria-label="הרשאת התראות">
      <h3>התראות בדפדפן</h3>
      <output className="permission-status" aria-live="polite">
        {checking
          ? 'בודקים את מצב ההתראות…'
          : enabled
            ? 'התראות מחוברות לחשבון'
            : permission === 'denied'
              ? 'חסומות בדפדפן'
              : permission === 'granted'
                ? 'הרשאה אושרה; החיבור לחשבון אינו פעיל'
                : 'התראות אינן פעילות'}
      </output>
      <p>אישור התראות אינו מפעיל דיוור שיווקי ואינו שולח הודעת בדיקה.</p>
      {failure ? (
        <output aria-live="polite">{pushFailureMessage(failure)}</output>
      ) : null}
      {permission === 'denied' ? <p>{pushFailureMessage('DENIED')}</p> : null}
      {!user ? <p>התחברו לחשבון כדי להפעיל התראות.</p> : null}
      <div className="permission-actions">
        <button
          type="button"
          disabled={
            busy ||
            checking ||
            !user ||
            !token ||
            (!enabled &&
              (!!failure || !config?.enabled || permission === 'denied'))
          }
          onClick={() => void toggle()}
        >
          {busy
            ? 'מעדכנים…'
            : enabled
              ? 'כיבוי התראות לחשבון'
              : 'אישור והפעלת התראות'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || checking}
          onClick={() => {
            setMessage('');
            refreshRef.current();
          }}
        >
          בדיקה מחדש
        </button>
      </div>
      {message ? <output aria-live="polite">{message}</output> : null}
    </section>
  );
}
