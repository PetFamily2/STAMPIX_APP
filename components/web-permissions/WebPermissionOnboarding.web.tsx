import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  BrowserPushControl,
  type PushActivationHandle,
} from '@/components/WebPushSettings.web';
import { useUser } from '@/contexts/UserContext';
import { WEB_LEGAL_VERSION } from '@/lib/legalWebContract';
import {
  checkCameraAccess,
  checkLocationAccess,
} from '@/lib/web-permissions/browserPermissions';
import {
  firstVisitStep,
  PRIVACY_NOTICE_KEY,
  setupNoticeKey,
} from '@/lib/web-permissions/firstVisit';
import { useWebInstall } from '@/lib/web-permissions/installPrompt';
import {
  permissionPlan,
  runPermissionSetup,
  type SetupPermission,
  type SetupRole,
} from '@/lib/web-permissions/permissionSetup';
import { PERMISSION_STYLES } from './BrowserPermissionsPanel.web';
import { WebInstallSettings } from './WebInstallSettings.web';

export default function WebPermissionOnboarding() {
  const { user, sessionContext, isLoading } = useUser();
  const path = usePathname();
  const install = useWebInstall();
  if (
    isLoading ||
    /(?:^|\/)legal(?:\/|$)/.test(path) ||
    path.includes('scanner') ||
    path.includes('oauth-callback')
  )
    return null;
  const role = sessionContext?.activeMode ?? user?.activeMode ?? 'customer';
  return (
    <FirstVisitPrompts
      key={`${user?._id ?? 'guest'}:${role}:${path}`}
      actorId={user?._id ?? null}
      role={role}
      installed={install.installed}
    />
  );
}

const CAPABILITIES = {
  notifications: {
    title: 'התראות',
    description: 'עדכונים על פעילות החשבון והמועדון.',
  },
  camera: {
    title: 'מצלמה',
    description: 'לסריקת קוד הלקוח בקופה, ללא גישה למיקרופון.',
  },
  location: {
    title: 'מיקום',
    description: 'למציאת עסקים בסביבה. המיקום אינו נשמר בבדיקת ההרשאה.',
  },
};

function FirstVisitPrompts({
  actorId,
  role: initialRole,
  installed,
}: {
  actorId: string | null;
  role: SetupRole;
  installed: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [role, setRole] = useState(initialRole);
  const [selected, setSelected] = useState<SetupPermission[]>(() =>
    permissionPlan(initialRole)
  );
  const [results, setResults] = useState<
    Partial<Record<SetupPermission, string>>
  >({});
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const cancelled = useRef(false);
  const push = useRef<PushActivationHandle>(null);
  const initialInstalled = useRef(installed);
  useEffect(() => {
    mounted.current = true;
    let privacyVersion: string | null = null;
    let setupDone = false;
    try {
      privacyVersion = localStorage.getItem(PRIVACY_NOTICE_KEY);
      setupDone =
        !!actorId &&
        localStorage.getItem(setupNoticeKey(actorId, initialRole)) === 'done';
    } catch {
      /* Keep controls usable when storage is unavailable. */
    }
    setVisible(
      !!firstVisitStep({
        privacyVersion,
        setupDone,
        signedIn: !!actorId,
        installed: initialInstalled.current,
      })
    );
    return () => {
      mounted.current = false;
    };
  }, [actorId, initialRole]);
  const remember = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      setStorageWarning(
        'לא ניתן לשמור את הבחירה בדפדפן הזה. ייתכן שנציג אותה שוב בביקור הבא.'
      );
    }
  };
  const finish = () => {
    cancelled.current = true;
    if (actorId) remember(setupNoticeKey(actorId, role), 'done');
    setVisible(false);
  };
  const activate = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    remember(PRIVACY_NOTICE_KEY, WEB_LEGAL_VERSION);
    try {
      await runPermissionSetup(selected, {
        valid: () => mounted.current && !cancelled.current,
        notifications: () => push.current?.enable() ?? Promise.resolve(false),
        camera: () => {
          if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
            return Promise.reject();
          return checkCameraAccess(navigator.mediaDevices);
        },
        location: () => {
          if (!window.isSecureContext || !navigator.geolocation)
            return Promise.reject();
          return checkLocationAccess(navigator.geolocation);
        },
        result: (kind, result) =>
          setResults((previous) => ({
            ...previous,
            [kind]:
              result === 'ready'
                ? kind === 'notifications'
                  ? 'ההתראות מחוברות לחשבון'
                  : 'הגישה אושרה'
                : kind === 'notifications'
                  ? 'החיבור לא הושלם. פרטים מופיעים בהמשך.'
                  : 'הגישה לא אושרה או אינה זמינה. אפשר לבדוק בהגדרות האתר בדפדפן.',
          })),
      });
    } finally {
      inFlight.current = false;
      if (mounted.current && !cancelled.current) {
        setBusy(false);
        setAttempted(true);
      }
    }
  };
  if (!visible) return null;
  return (
    <aside
      className="sx-permissions sx-permission-intro"
      dir="rtl"
      aria-label="הגדרה ראשונית של פרטיות והרשאות"
    >
      <style>
        {PERMISSION_STYLES}
        {`
        .sx-permission-intro{position:fixed;z-index:900;bottom:calc(86px + env(safe-area-inset-bottom,0px));inset-inline:12px;max-width:560px;margin:0 auto;max-height:calc(100dvh - 130px);overflow-y:auto;box-shadow:0 8px 32px #10193624;padding:22px}
        .sx-permission-intro h2{font-size:22px}.sx-permission-choice{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #E4E8F0;cursor:pointer}
        .sx-permission-choice input{width:20px;height:20px;flex:none;accent-color:#1834AD;margin-top:5px}.sx-permission-choice strong,.sx-permission-choice small{display:block}.sx-permission-choice small{color:#536078}.sx-permission-intro .permission-actions button{flex:1}
        @media(min-width:900px){.sx-permission-intro{bottom:20px;inset-inline:20px auto;margin:0}}
      `}
      </style>
      <h2>מתחילים בדרך שלכם</h2>
      <p>
        {role === 'business'
          ? 'סריקה בקופה ועדכוני המועדון — בוחרים מה להפעיל וממשיכים.'
          : 'עסקים בסביבה ועדכוני המועדונים — בוחרים מה להפעיל וממשיכים.'}
      </p>
      {!actorId ? (
        <fieldset
          className="permission-actions"
          aria-label="סוג השימוש"
          style={{ border: 0, padding: 0 }}
        >
          {(['customer', 'business'] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={role === value ? '' : 'secondary'}
              aria-pressed={role === value}
              disabled={busy}
              onClick={() => {
                setRole(value);
                setSelected(permissionPlan(value));
                setResults({});
                setAttempted(false);
              }}
            >
              {value === 'customer' ? 'ללקוחות' : 'לעסקים'}
            </button>
          ))}
        </fieldset>
      ) : null}
      {permissionPlan(role).map((kind) => (
        <label className="sx-permission-choice" key={kind}>
          <input
            type="checkbox"
            checked={selected.includes(kind)}
            disabled={busy}
            onChange={(event) => {
              setSelected((previous) =>
                event.target.checked
                  ? [...previous, kind]
                  : previous.filter((value) => value !== kind)
              );
              setAttempted(false);
            }}
          />
          <span>
            <strong>{CAPABILITIES[kind].title}</strong>
            <small>{CAPABILITIES[kind].description}</small>
            {results[kind] ? (
              <output aria-live="polite">{results[kind]}</output>
            ) : null}
          </span>
        </label>
      ))}
      <p>
        בלחיצה מאשרים שקראתם את{' '}
        <a
          href="/legal?document=privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          מדיניות הפרטיות
        </a>
        . הדפדפן יבקש אישור לכל הרשאה בנפרד. דיוור שיווקי נבחר בנפרד בהרשמה או
        בהגדרות.
      </p>
      <div className="permission-actions">
        <button type="button" disabled={busy} onClick={() => void activate()}>
          {busy
            ? 'משלימים את ההגדרה…'
            : attempted
              ? 'ניסיון נוסף'
              : 'אישור והפעלת האפשרויות'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={
            attempted
              ? finish
              : () => {
                  cancelled.current = true;
                  setVisible(false);
                }
          }
        >
          {attempted ? 'סיום והמשך' : busy ? 'המשך בלי להשלים' : 'בהמשך'}
        </button>
      </div>
      <p>אפשר לשנות בכל עת בהגדרות ← הרשאות והתקנה.</p>
      {selected.includes('notifications') ? (
        <BrowserPushControl activationRef={push} compact={true} />
      ) : null}
      <details>
        <summary>גישה מהירה ממסך הבית</summary>
        <WebInstallSettings />
      </details>
      {storageWarning ? (
        <output aria-live="polite">{storageWarning}</output>
      ) : null}
    </aside>
  );
}
