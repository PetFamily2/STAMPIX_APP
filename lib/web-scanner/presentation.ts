import type { ScannerStatus } from './state';

export function cameraDisplayName(label: string, index: number) {
  if (/back|rear|environment|אחורית/i.test(label)) {
    return `מצלמה אחורית ${index + 1}`;
  }
  if (/front|user|פנימית|קדמית/i.test(label)) {
    return `מצלמה קדמית ${index + 1}`;
  }
  return `מצלמה ${index + 1}`;
}

export function cameraStatusMessage(status: ScannerStatus) {
  const messages: Record<ScannerStatus, string> = {
    idle: 'הפעילו את המצלמה כדי לסרוק קוד של לקוח',
    requesting: 'ממתינים לאישור המצלמה…',
    scanning: 'מקמו את קוד הלקוח בתוך המסגרת',
    locked: 'הקוד נקרא. בודקים את פרטי הלקוח…',
    paused: 'המצלמה נעצרה. אפשר להפעיל אותה שוב',
    denied: 'אין הרשאה למצלמה. אפשרו גישה בהגדרות האתר ונסו שוב.',
    'no-camera': 'לא נמצאה מצלמה במכשיר הזה.',
    insecure: 'המצלמה זמינה רק בחיבור מאובטח. פתחו את כתובת האתר המאובטחת.',
    unsupported: 'הדפדפן הזה אינו תומך בסריקה. נסו לפתוח בדפדפן אחר.',
    error: 'לא הצלחנו להפעיל את המצלמה. בדקו שאינה בשימוש ונסו שוב.',
  };
  return messages[status];
}
