import type { Phase, Receipt } from './command';
import type { ScannerStatus } from './state';

const ERROR_LABELS: Record<string, string> = {
  SUBSCRIPTION_INACTIVE: 'המנוי לא פעיל',
  PLAN_LIMIT_REACHED: 'המכסה מלאה',
  FEATURE_NOT_AVAILABLE: 'לא כלול במסלול',
  RATE_LIMITED: 'כבר נוספה חותמת',
  TOKEN_ALREADY_USED: 'הקוד כבר נוצל',
  EXPIRED_TOKEN: 'הקוד פג',
  INVALID_QR: 'קוד לא תקין',
  NOT_AUTHORIZED: 'אין הרשאה',
  NOT_AUTHENTICATED: 'אין הרשאה',
  CUSTOMER_NOT_FOUND: 'הלקוח לא נמצא',
  NOT_ENOUGH_STAMPS: 'אין מספיק חותמות',
  POS_ENROLL_DISABLED: 'ללקוחות קיימים',
  SELF_STAMP: 'לא לעצמכם',
  MEMBERSHIP_NOT_FOUND: 'אין כרטיס',
  SCAN_SESSION_EXPIRED: 'הסריקה פגה',
  INVALID_SCAN_SESSION: 'הסריקה פגה',
  SCAN_SESSION_FAILED: 'הסריקה פגה',
  INVALID_SCAN_ACTION: 'הסריקה פגה',
  OFFLINE: 'אין רשת',
  OFFLINE_OR_STALE: 'אין רשת',
  BUSINESS_CLOSED: 'העסק לא פעיל',
  BUSINESS_NOT_FOUND: 'העסק לא פעיל',
  PROGRAM_NOT_FOUND: 'הכרטיסייה לא זמינה',
  PROGRAM_NOT_SCANNER_ELIGIBLE: 'הכרטיסייה לא זמינה',
  UNDO_NOT_AVAILABLE: 'אי אפשר לבטל',
  UNDO_EXPIRED: 'אי אפשר לבטל',
  UNDO_NOT_ALLOWED: 'אי אפשר לבטל',
};

export function scannerPhaseLabel(
  phase: Phase,
  receipt: Receipt | null
): string {
  if (phase === 'QR_LOCKED' || phase === 'RESOLVING') {
    return 'הקוד נקרא';
  }
  if (phase === 'COMMITTING') {
    return 'שולחים';
  }
  if (phase === 'UNKNOWN_OUTCOME' || phase === 'RECONCILING') {
    return 'בודקים תוצאה';
  }
  if (phase === 'OFFLINE') {
    return 'אין רשת';
  }
  if (phase === 'SUCCESS') {
    return scannerSuccessLabel(receipt);
  }
  return '';
}

export function scannerSuccessLabel(receipt: Receipt | null): string {
  const type = receipt?.eventType;
  if (type === 'REWARD_REDEEMED') {
    return 'הפרס מומש';
  }
  if (type === 'STAMP_REVERTED' || type === 'REWARD_REDEEM_REVERTED') {
    return 'הפעולה בוטלה';
  }
  if (type === 'STAMP_ADDED') {
    return 'חותמת נוספה';
  }
  if (receipt?.status === 'redeemed') {
    return 'ההטבה מומשה';
  }
  return 'הפעולה אושרה';
}

/** Never returns a technical code. Unknown failures stay generic. */
export function scannerErrorLabel(code: string | null): string {
  if (!code) {
    return 'נסו שוב';
  }
  return ERROR_LABELS[code] ?? 'נסו שוב';
}

export function cameraStatusLabel(status: ScannerStatus): string | null {
  switch (status) {
    case 'denied':
      return 'אשרו מצלמה';
    case 'no-camera':
      return 'אין מצלמה';
    case 'insecure':
      return 'נדרש חיבור מאובטח';
    case 'unsupported':
      return 'הדפדפן לא תומך';
    case 'error':
      return 'המצלמה נעצרה';
    case 'paused':
      return 'המצלמה מושהית';
    default:
      return null;
  }
}

export function scannerNeedsSubscription(code: string | null) {
  return code === 'SUBSCRIPTION_INACTIVE';
}
