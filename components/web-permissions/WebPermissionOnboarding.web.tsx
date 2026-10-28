import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BrowserPushControl } from '@/components/WebPushSettings.web';
import { useUser } from '@/contexts/UserContext';
import { WEB_LEGAL_VERSION as CANONICAL_PRIVACY_VERSION } from '@/lib/legalWebContract';
import {
  type FirstVisitStep,
  firstVisitStep,
  PRIVACY_NOTICE_KEY,
  setupNoticeKey,
} from '@/lib/web-permissions/firstVisit';
import { useWebInstall } from '@/lib/web-permissions/installPrompt';
import { PERMISSION_STYLES } from './BrowserPermissionsPanel.web';
import { WebInstallSettings } from './WebInstallSettings.web';

export default function WebPermissionOnboarding() {
  const { user, isLoading } = useUser();
  const path = usePathname();
  // Stay subscribed even while notices are hidden, so install offers are not lost.
  const install = useWebInstall();
  if (
    isLoading ||
    /(?:^|\/)legal(?:\/|$)/.test(path) ||
    path.includes('scanner') ||
    path.includes('oauth-callback')
  ) {
    return null;
  }
  return (
    <FirstVisitPrompts
      key={String(user?._id ?? 'guest')}
      actorId={user?._id ?? null}
      installed={install.installed}
    />
  );
}

function FirstVisitPrompts({
  actorId,
  installed,
}: {
  actorId: string | null;
  installed: boolean;
}) {
  const [step, setStep] = useState<FirstVisitStep>(null);
  const [storageWarning, setStorageWarning] = useState('');
  const initialInstalled = useRef(installed);
  useEffect(() => {
    let privacyVersion: string | null = null;
    let setupDone = false;
    try {
      privacyVersion = localStorage.getItem(PRIVACY_NOTICE_KEY);
      setupDone =
        !!actorId && localStorage.getItem(setupNoticeKey(actorId)) === 'done';
    } catch {
      /* Still allow dismissal for this visit when storage is blocked. */
    }
    setStep(
      firstVisitStep({
        privacyVersion,
        setupDone,
        signedIn: !!actorId,
        installed: initialInstalled.current,
      })
    );
    // Installation changes do not restart the intro while the user is reading.
  }, [actorId]);
  const remember = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      setStorageWarning(
        'הדפדפן אינו מאפשר לשמור את הבחירה. הבאנר עשוי להופיע שוב בביקור הבא.'
      );
    }
  };
  const finish = () => {
    if (actorId) {
      remember(setupNoticeKey(actorId), 'done');
    }
    setStep(null);
  };
  if (!step) {
    return null;
  }
  return (
    <aside
      className="sx-permissions sx-permission-intro"
      dir="rtl"
      aria-label="הגדרה ראשונית של פרטיות והרשאות"
    >
      <style>
        {PERMISSION_STYLES}
        {`
        .sx-permission-intro{position:fixed;z-index:900;bottom:calc(86px + env(safe-area-inset-bottom,0px));inset-inline:12px;max-width:560px;margin:0 auto;max-height:calc(100dvh - 130px);overflow-y:auto;box-shadow:0 8px 32px #10193624}
        @media(min-width:900px){.sx-permission-intro{bottom:20px;inset-inline:20px auto;margin:0}}
      `}
      </style>
      {step === 'privacy' ? (
        <>
          <h2>הפרטיות שלכם ב־StampAix</h2>
          <p>
            לפני שמתחילים, עיינו במדיניות הפרטיות. גישה למצלמה ולמיקום תתבקש רק
            לפי הצורך; התראות ודיוור שיווקי דורשים אישורים נפרדים.
          </p>
          <a
            href="/legal?document=privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            קריאת מדיניות הפרטיות (נפתחת בחלון חדש)
          </a>
          <p>
            אישור קריאת הבאנר נשמר בדפדפן הזה בלבד ואינו מחליף את ההסכמות
            הנדרשות בהרשמה.
          </p>
          <div className="permission-actions">
            <button
              type="button"
              onClick={() => {
                remember(PRIVACY_NOTICE_KEY, CANONICAL_PRIVACY_VERSION);
                setStep(
                  actorId ? (installed ? 'notifications' : 'install') : null
                );
              }}
            >
              קראתי ואישרתי
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setStep(null)}
            >
              לא עכשיו
            </button>
          </div>
        </>
      ) : null}
      {step === 'install' ? (
        <>
          <h2>StampAix במסך הבית</h2>
          <WebInstallSettings onAccepted={() => setStep('notifications')} />
          <div className="permission-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setStep('notifications')}
            >
              {installed ? 'המשך להתראות' : 'בהמשך — המשך להתראות'}
            </button>
          </div>
        </>
      ) : null}
      {step === 'notifications' ? (
        <>
          <h2>רוצים לקבל עדכונים?</h2>
          <BrowserPushControl onEnabled={finish} />
          <div className="permission-actions">
            <button type="button" className="secondary" onClick={finish}>
              סיום — אפשר לשנות בהגדרות
            </button>
          </div>
        </>
      ) : null}
      {storageWarning ? (
        <output aria-live="polite">{storageWarning}</output>
      ) : null}
      {step !== 'privacy' ? (
        <p>
          כל האפשרויות זמינות גם בהגדרות ← הרשאות והתקנה. אפשר להמשיך להשתמש
          באתר ללא התקנה או התראות.
        </p>
      ) : null}
    </aside>
  );
}
