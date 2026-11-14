import { type ReactNode, useEffect, useRef, useState } from 'react';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import {
  type BrowserPermissionState,
  checkCameraAccess,
  checkLocationAccess,
  readBrowserPermission,
} from '@/lib/web-permissions/browserPermissions';
import { PermissionIcon } from './PermissionIcon.web';
import { WebInstallSettings } from './WebInstallSettings.web';

export const PERMISSION_STYLES = `
  .sx-permissions{direction:rtl;text-align:right;background:${TOKENS.colors.elevatedSurface};color:${TOKENS.colors.textPrimary};border:1px solid ${TOKENS.colors.border};border-radius:${TOKENS.radii.lg}px;padding:8px 14px 10px;margin:12px 0;font:inherit;line-height:1.35}
  .sx-permissions h2{font-size:16px;line-height:22px;font-weight:700;margin:8px 0 2px}
  .sx-permissions .permission-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px}
  .sx-permissions .permission-main{display:flex;align-items:center;gap:10px;min-width:0}
  .sx-permissions .permission-icon{width:18px;height:18px;flex:none;color:${TOKENS.colors.textSecondary}}
  .sx-permissions .permission-name{font-size:15px;line-height:20px;font-weight:600}
  .sx-permissions .permission-note{margin:0 28px 8px 0;color:${TOKENS.colors.textSecondary};font-size:12px;line-height:17px}
  .sx-permissions button.sx-switch{width:44px;height:44px;min-height:44px;padding:0;border:0;border-radius:12px;background:transparent;color:inherit;display:flex;align-items:center;justify-content:center;flex:none;cursor:pointer}
  .sx-permissions button.sx-switch span{width:46px;height:28px;border-radius:999px;background:${TOKENS.colors.borderStrong};display:flex;align-items:center;padding:2px;box-sizing:border-box}
  .sx-permissions button.sx-switch[aria-checked=true] span{background:${TOKENS.colors.primary};justify-content:flex-end}
  .sx-permissions button.sx-switch i{width:24px;height:24px;border-radius:50%;background:${TOKENS.colors.elevatedSurface};display:block}
  .sx-permissions button.install-button{min-height:36px;height:36px;padding:0 12px;border:0;border-radius:999px;background:${TOKENS.colors.primary};color:${TOKENS.colors.elevatedSurface};font:inherit;font-size:13px;font-weight:700;cursor:pointer;flex:none}
  .sx-permissions button:disabled{opacity:.55;cursor:default}
  .sx-permissions button:focus-visible{outline:3px solid ${TOKENS.colors.primary};outline-offset:3px}
  .sx-permissions output{display:block}
`;

function DevicePermission({ kind }: { kind: 'camera' | 'geolocation' }) {
  const camera = kind === 'camera';
  const [state, setState] = useState<BrowserPermissionState>('unknown');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let revision = 0;
    let status: PermissionStatus | undefined;
    const refresh = async () => {
      const version = ++revision;
      const supported =
        window.isSecureContext &&
        (camera
          ? !!navigator.mediaDevices?.getUserMedia
          : !!navigator.geolocation);
      const next = supported
        ? await readBrowserPermission(navigator.permissions, kind)
        : 'unsupported';
      if (mounted.current && version === revision) {
        setState(next);
      }
    };
    const visible = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    void refresh();
    void navigator.permissions
      ?.query({ name: kind as PermissionName })
      .then((value) => {
        if (disposed) {
          return;
        }
        status = value;
        status.addEventListener('change', visible);
      })
      .catch(() => {});
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false;
      disposed = true;
      ++revision;
      status?.removeEventListener('change', visible);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [camera, kind]);
  const request = async () => {
    if (inFlight.current || state === 'denied' || state === 'unsupported') {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (camera) {
        await checkCameraAccess(navigator.mediaDevices);
      } else {
        await checkLocationAccess(navigator.geolocation);
      }
      if (mounted.current) {
        setState('granted');
        setMessage(
          camera
            ? 'הגישה אושרה. מצלמת הבדיקה כבר כובתה; אפשר לחזור לסריקה.'
            : 'הגישה אושרה. מיקום הבדיקה לא נשמר ולא נשלח.'
        );
      }
    } catch (error) {
      if (!mounted.current) {
        return;
      }
      const name = error instanceof Error ? error.name : '';
      const code = (error as { code?: number })?.code;
      const denied = name === 'NotAllowedError' || code === 1;
      const nextState = await readBrowserPermission(
        navigator.permissions,
        kind
      );
      if (mounted.current) {
        setState(nextState);
      }
      if (mounted.current) {
        setMessage(
          denied
            ? 'הגישה לא אושרה. אם היא חסומה, שנו את ההרשאה בהגדרות האתר בדפדפן ואז חזרו לכאן.'
            : camera
              ? 'לא הצלחנו לגשת למצלמה. ודאו שיש מצלמה זמינה ושאינה בשימוש בחלון אחר, ואז נסו שוב.'
              : 'לא התקבל מיקום בזמן. בדקו ששירותי המיקום במכשיר פעילים ונסו שוב.'
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
      }
    }
  };
  const granted = state === 'granted';
  const label = camera ? 'מצלמה לסריקה' : 'מיקום';
  const blocked =
    state === 'denied'
      ? `ה${camera ? 'מצלמה' : 'מיקום'} חסום. שנו את ההרשאה בהגדרות האתר בדפדפן.`
      : state === 'unsupported'
        ? 'הדפדפן לא תומך באפשרות הזו.'
        : '';
  const turnOff = () => {
    setMessage(
      camera
        ? 'כיבוי המצלמה נעשה בהגדרות האתר בדפדפן.'
        : 'כיבוי המיקום נעשה בהגדרות האתר בדפדפן.'
    );
  };
  return (
    <div>
      <div className="permission-row">
        <span className="permission-main">
          <PermissionIcon name={camera ? 'camera' : 'location'} />
          <span className="permission-name">{label}</span>
        </span>
        <button
          type="button"
          className="sx-switch"
          role="switch"
          aria-checked={granted}
          aria-label={label}
          disabled={busy || state === 'unsupported' || state === 'denied'}
          onClick={() => {
            if (granted) {
              turnOff();
              return;
            }
            void request();
          }}
        >
          <span>
            <i />
          </span>
        </button>
      </div>
      {blocked || message ? (
        <p className="permission-note">{message || blocked}</p>
      ) : null}
    </div>
  );
}

export function BrowserPermissionsPanel({ children }: { children: ReactNode }) {
  return (
    <section
      id="browser-permissions"
      className="sx-permissions"
      aria-label="הרשאות והתקנה"
      dir="rtl"
    >
      <style>{PERMISSION_STYLES}</style>
      <h2>הרשאות והתקנה</h2>
      {children}
      <DevicePermission kind="camera" />
      <DevicePermission kind="geolocation" />
      <WebInstallSettings />
    </section>
  );
}
