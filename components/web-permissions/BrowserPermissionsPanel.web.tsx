import { type ReactNode, useEffect, useRef, useState } from 'react';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import {
  type BrowserPermissionState,
  checkCameraAccess,
  checkLocationAccess,
  permissionLabels,
  readBrowserPermission,
} from '@/lib/web-permissions/browserPermissions';
import { WebInstallSettings } from './WebInstallSettings.web';

export const PERMISSION_STYLES = `
  .sx-permissions{direction:rtl;text-align:right;background:${TOKENS.colors.elevatedSurface};color:${TOKENS.colors.textPrimary};border:1px solid ${TOKENS.colors.border};border-radius:${TOKENS.radii.lg}px;padding:16px;margin:16px 0;font:inherit;line-height:1.6;overflow-wrap:anywhere}
  .sx-permissions h2{font-size:18px;margin:0 0 8px}.sx-permissions h3{font-size:16px;margin:0}
  .sx-permissions p{margin:8px 0;color:${TOKENS.colors.textSecondary}}
  .sx-permissions .permission-row{padding:16px 0;border-top:1px solid ${TOKENS.colors.border};margin-top:12px}
  .sx-permissions .permission-status{display:block;font-weight:600;color:${TOKENS.colors.primary}}
  .sx-permissions .permission-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .sx-permissions button,.sx-permissions a.permission-link{font:inherit;font-weight:600;min-height:44px;border:1px solid ${TOKENS.colors.primary};border-radius:12px;background:${TOKENS.colors.primary};color:${TOKENS.colors.elevatedSurface};padding:10px 16px;cursor:pointer;text-decoration:none;box-sizing:border-box;max-width:100%;white-space:normal}
  .sx-permissions button.secondary{background:${TOKENS.colors.elevatedSurface};color:${TOKENS.colors.primary}}
  .sx-permissions button[role=switch]{display:inline-flex;align-items:center;gap:12px;background:transparent;color:inherit;border:0;padding-inline:0}
  .sx-permissions button[role=switch]::before{content:"";width:46px;height:28px;border-radius:20px;background:#CBD5E1;box-shadow:inset 0 0 0 1px #64748B}
  .sx-permissions button[role=switch]::after{content:"";position:absolute;width:20px;height:20px;border-radius:50%;background:white;right:4px;top:50%;transform:translateY(-50%);pointer-events:none}
  .sx-permissions button[role=switch]{position:relative}
  .sx-permissions button[role=switch][aria-checked=true]::before{background:${TOKENS.colors.primary}}
  .sx-permissions button[role=switch][aria-checked=true]::after{right:22px}
  .sx-permissions button:disabled{opacity:.55;cursor:default}
  .sx-permissions button:focus-visible,.sx-permissions a:focus-visible,.sx-permissions summary:focus-visible{outline:3px solid ${TOKENS.colors.primary};outline-offset:3px}
  .sx-permissions output{display:block;margin-top:12px;color:${TOKENS.colors.textSecondary}}
  .sx-permissions summary{cursor:pointer;min-height:44px;align-content:center;font-weight:600}
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
  return (
    <section
      className="permission-row"
      aria-label={camera ? 'הרשאת מצלמה' : 'הרשאת מיקום'}
    >
      <h3>{camera ? 'מצלמה' : 'מיקום'}</h3>
      <output className="permission-status" aria-live="polite">
        {permissionLabels[state]}
      </output>
      <p>
        {camera
          ? 'לסריקת קוד לקוח. בדיקת הגישה אינה מצלמת או מקליטה.'
          : 'למציאת עסקים בסביבה. בדיקת הגישה אינה שומרת או שולחת מיקום.'}
      </p>
      {state === 'denied' ? (
        <p>
          פתחו את הרשאות האתר בדפדפן או את הגדרות האפליקציה המותקנת ואפשרו{' '}
          {camera ? 'מצלמה' : 'מיקום'}. אחר כך חזרו לכאן.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy || state === 'unsupported'}
          onClick={() => void request()}
        >
          {busy
            ? 'בודקים גישה…'
            : state === 'granted'
              ? 'בדיקת גישה'
              : `אישור ${camera ? 'מצלמה' : 'מיקום'}`}
        </button>
      )}
      {message ? <output aria-live="polite">{message}</output> : null}
    </section>
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
      <details>
        <summary>הרשאות והתקנה</summary>
        <p>
          בחרו מה להפעיל. שינוי או ביטול הרשאת מצלמה ומיקום נעשים בהגדרות האתר
          בדפדפן.
        </p>
        {children}
        <DevicePermission kind="camera" />
        <DevicePermission kind="geolocation" />
        <WebInstallSettings />
        <details>
          <summary>איך משנים או מבטלים הרשאה?</summary>
          <p>
            בדפדפן: פתחו את פרטי האתר ליד שורת הכתובת, בחרו הרשאות או הגדרות אתר
            ושנו את ההרשאה הרצויה. באפליקציה שהותקנה למסך הבית, בדקו גם את
            הגדרות המכשיר עבור האפליקציה או הדפדפן. חזרו למסך הזה כדי לרענן את
            המצב.
          </p>
          <p>
            אישור התראות אינו אישור לדיוור שיווקי. העדפת הדיוור מנוהלת בנפרד
            בהגדרות החשבון.
          </p>
        </details>
        <p>
          <a
            href="/legal?document=privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            מדיניות הפרטיות (נפתחת בחלון חדש)
          </a>
        </p>
      </details>
    </section>
  );
}
