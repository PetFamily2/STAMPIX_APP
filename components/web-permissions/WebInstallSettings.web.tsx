import { useState } from 'react';
import {
  requestWebInstall,
  useWebInstall,
} from '@/lib/web-permissions/installPrompt';
import { PermissionIcon } from './PermissionIcon.web';

export function WebInstallSettings({
  onAccepted,
}: {
  onAccepted?: () => void;
}) {
  const { installed, appleMobile, available } = useWebInstall();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const install = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await requestWebInstall();
      setMessage(
        result === 'accepted'
          ? 'בקשת ההתקנה אושרה. ההתקנה הושלמה רק כשהסמל מופיע במסך הבית.'
          : result === 'dismissed'
            ? 'ההתקנה לא אושרה. אפשר להמשיך בדפדפן ולהתקין בהמשך דרך תפריט הדפדפן.'
            : 'התקנה ישירה אינה זמינה כרגע. השתמשו בתפריט הדפדפן כמוסבר כאן.'
      );
      if (result === 'accepted') {
        onAccepted?.();
      }
    } catch {
      setMessage(
        'לא הצלחנו לפתוח את בקשת ההתקנה. אפשר להשתמש בתפריט הדפדפן או להמשיך ללא התקנה.'
      );
    } finally {
      setBusy(false);
    }
  };
  const hint = installed
    ? ''
    : available
      ? ''
      : appleMobile
        ? 'בתפריט השיתוף בחרו ״הוספה למסך הבית״.'
        : 'בתפריט הדפדפן בחרו התקנה או הוספה למסך הבית.';
  return (
    <div>
      <div className="permission-row">
        <span className="permission-main">
          <PermissionIcon name="install" />
          <span className="permission-name">התקנה למסך הבית</span>
        </span>
        {installed ? (
          <span className="permission-name">מותקן</span>
        ) : (
          <button
            type="button"
            className="install-button"
            disabled={busy || !available}
            onClick={() => void install()}
          >
            {busy ? 'פותחים…' : 'התקנה'}
          </button>
        )}
      </div>
      {hint || message ? (
        <p className="permission-note">{message || hint}</p>
      ) : null}
    </div>
  );
}
