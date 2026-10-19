import { useState } from 'react';
import {
  requestWebInstall,
  useWebInstall,
} from '@/lib/web-permissions/installPrompt';

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
  return (
    <section className="permission-row" aria-label="התקנה למסך הבית">
      <h3>התקנה למסך הבית</h3>
      <span className="permission-status">
        {installed ? 'פועל כאפליקציה מותקנת' : 'האתר פתוח בדפדפן'}
      </span>
      <p>
        הוסיפו את StampAix למסך הבית לגישה מהירה. ההתקנה אינה מאשרת מצלמה, מיקום
        או דיוור שיווקי.
      </p>
      {!installed ? (
        <>
          {available ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void install()}
            >
              {busy ? 'פותחים התקנה…' : 'התקנה למסך הבית'}
            </button>
          ) : null}
          <p>
            {appleMobile
              ? 'ב־iPhone או iPad: פתחו את תפריט השיתוף בדפדפן, בחרו הוספה למסך הבית, ואז פתחו מהסמל החדש. התראות אתר דורשות פתיחה מהסמל ומערכת תומכת.'
              : 'אם לא מוצע כפתור התקנה, פתחו את תפריט הדפדפן וחפשו התקנת אפליקציה או הוספה למסך הבית. אם האפשרות חסרה, נסו דפדפן מעודכן.'}
          </p>
        </>
      ) : null}
      {message ? <output aria-live="polite">{message}</output> : null}
    </section>
  );
}
