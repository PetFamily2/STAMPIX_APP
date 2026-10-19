export type BrowserPermissionState =
  | PermissionState
  | 'unknown'
  | 'unsupported';

export async function readBrowserPermission(
  permissions: Pick<Permissions, 'query'> | undefined,
  name: 'camera' | 'geolocation'
): Promise<BrowserPermissionState> {
  try {
    return (
      (await permissions?.query({ name: name as PermissionName }))?.state ??
      'unknown'
    );
  } catch {
    // Unsupported query does not mean the permission itself was denied.
    return 'unknown';
  }
}

export const permissionLabels: Record<BrowserPermissionState, string> = {
  granted: 'מאושרת בדפדפן',
  denied: 'חסומה בדפדפן',
  prompt: 'טרם אושרה',
  unknown: 'נדרשת בדיקת גישה',
  unsupported: 'לא זמינה בדפדפן הזה',
};

export function isAppleMobile(userAgent: string, touchPoints: number) {
  return (
    /iPhone|iPad|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && touchPoints > 1)
  );
}

export function pushAvailability(input: {
  secure: boolean;
  appleMobile: boolean;
  standalone: boolean;
  supported: boolean;
}) {
  if (!input.secure) {
    return 'INSECURE';
  }
  if (input.appleMobile && !input.standalone) {
    return 'HOME_SCREEN_REQUIRED';
  }
  return input.supported ? null : 'UNSUPPORTED';
}

export function pushFailureMessage(code: string) {
  switch (code) {
    case 'INSECURE':
      return 'הרשאות זמינות רק בכתובת מאובטחת (HTTPS). פתחו את כתובת האתר המאובטחת.';
    case 'HOME_SCREEN_REQUIRED':
      return 'במכשיר Apple זה יש להוסיף את האתר למסך הבית, לפתוח אותו מהסמל ואז לאשר התראות. אם האפשרות לא מופיעה, בדקו שהמערכת מעודכנת.';
    case 'UNSUPPORTED':
      return 'הדפדפן הזה אינו תומך בהתראות אתר. נסו דפדפן מעודכן; העדכונים בתיבת ההודעות נשארים זמינים.';
    case 'DENIED':
      return 'ההתראות חסומות בהגדרות האתר בדפדפן. שנו שם את הרשאת ההתראות ואז חזרו ובדקו שוב.';
    case 'DISMISSED':
      return 'בקשת ההרשאה לא אושרה. אפשר לנסות שוב כשמתאים לכם.';
    case 'INSTALL_REQUIRED':
      return 'רכיב ההתראות של האתר עדיין אינו מוכן. המתינו לסיום טעינת האתר ולחצו על בדיקה מחדש.';
    case 'NOT_CONFIGURED':
      return 'שירות ההתראות אינו זמין לחשבון או לסביבה הזו כרגע. זו אינה בעיית הרשאה בטלפון; אפשר להמשיך לקרוא הודעות בתוך האפליקציה.';
    case 'OFFLINE':
      return 'אין חיבור לרשת. התחברו ולחצו על בדיקה מחדש.';
    case 'STORAGE_UNAVAILABLE':
      return 'הדפדפן חוסם שמירה מקומית הדרושה לחיבור התראות לחשבון הזה. אפשרו נתוני אתר או השתמשו בחלון רגיל.';
    case 'REGISTRATION_FAILED':
      return 'הרשאת הדפדפן אושרה, אך חיבור ההתראות לחשבון לא הושלם. לחצו על בדיקה מחדש ואז נסו להפעיל שוב.';
    default:
      return 'לא הצלחנו להשלים את חיבור ההתראות. בדקו חיבור לרשת ולחצו על בדיקה מחדש. הרשאה שאושרה בדפדפן אינה מבטיחה שהשירות מחובר.';
  }
}

/** Only called by an explicit settings button; never retain a live camera here. */
export async function checkCameraAccess(
  media: Pick<MediaDevices, 'getUserMedia'>
) {
  const stream = await media.getUserMedia({ video: true, audio: false });
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

/** Coordinates are neither retained nor sent by this permission check. */
export function checkLocationAccess(
  geo: Pick<Geolocation, 'getCurrentPosition'>
) {
  return new Promise<void>((resolve, reject) => {
    geo.getCurrentPosition(() => resolve(), reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}
