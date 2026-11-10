import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { WEB_LEGAL_VERSION } from '@/lib/legalWebContract';
import {
  canShowPermissionIntro,
  PRIVACY_NOTICE_KEY,
} from '@/lib/web-permissions/firstVisit';
import { useWebInstall } from '@/lib/web-permissions/installPrompt';

export default function WebPermissionOnboarding() {
  const { user, sessionContext, isLoading } = useUser();
  const path = usePathname();
  // Capture the browser's install offer for settings; this never opens a prompt.
  useWebInstall();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      setVisible(
        localStorage.getItem(PRIVACY_NOTICE_KEY) !== WEB_LEGAL_VERSION
      );
    } catch {
      setVisible(true);
    }
  }, []);
  if (isLoading || !visible || !canShowPermissionIntro(path, !!user))
    return null;
  const business =
    sessionContext?.activeMode === 'business' ||
    user?.activeMode === 'business';
  const settingsHref = path.startsWith('/staff')
    ? '/staff/settings#browser-permissions'
    : business
      ? '/business/settings#browser-permissions'
      : '/settings#browser-permissions';
  const accept = () => {
    // Acknowledges this notice only; device access and marketing stay independently controlled.
    try {
      localStorage.setItem(PRIVACY_NOTICE_KEY, WEB_LEGAL_VERSION);
    } catch {
      /* Dismiss for this visit even when browser storage is blocked. */
    }
    setVisible(false);
  };
  return (
    <aside
      className="sx-privacy-notice"
      dir="rtl"
      aria-label="פרטיות וקובצי Cookie"
    >
      <style>{`
        .sx-privacy-notice{box-sizing:border-box;position:fixed;z-index:900;inset-inline-start:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));width:min(360px,calc(100vw - 32px));padding:18px;background:#fff;color:#101936;border:1px solid #DFE5F0;border-radius:16px;box-shadow:0 6px 24px #1019361a;font:inherit;text-align:right;line-height:1.5}
        .sx-privacy-notice h2{font:inherit;font-weight:700;font-size:16px;margin:0 0 6px}.sx-privacy-notice p{font-size:14px;color:#536078;margin:0 0 12px}.sx-privacy-notice nav{display:flex;gap:14px;flex-wrap:wrap;font-size:14px;margin-bottom:12px}.sx-privacy-notice a{color:#1834AD;text-underline-offset:3px}.sx-privacy-notice button{display:block;width:100%;min-height:44px;border:0;border-radius:10px;background:#1834AD;color:white;font:inherit;font-weight:600;cursor:pointer}.sx-privacy-notice a:focus-visible,.sx-privacy-notice button:focus-visible{outline:3px solid #6D90FF;outline-offset:3px}
        @media(max-width:600px){.sx-privacy-notice{inset-inline:12px;width:calc(100% - 24px);bottom:calc(82px + env(safe-area-inset-bottom,0px));padding:14px}}
      `}</style>
      <h2>פרטיות וקובצי Cookie</h2>
      <p>
        מידע על השימוש בנתונים ובקובצי Cookie נמצא במדיניות הפרטיות. את ההרשאות
        אפשר לנהל בהגדרות.
      </p>
      <nav aria-label="מידע ובחירות פרטיות">
        <a
          href="/legal?document=privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          מדיניות הפרטיות
        </a>
        <a href={settingsHref}>הרשאות והגדרות</a>
      </nav>
      <button type="button" onClick={accept}>
        אישור
      </button>
    </aside>
  );
}
