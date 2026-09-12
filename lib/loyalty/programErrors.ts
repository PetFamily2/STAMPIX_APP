export const LOYALTY_THEME_CONFLICT_CODE = 'LOYALTY_THEME_CONFLICT';

export const LOYALTY_THEME_CONFLICT_COPY = {
  edit: {
    title: 'הצבע כבר בשימוש',
    message:
      'כרטיסייה אחרת בחרה בצבע הזה. השינויים שלכם נשמרו במסך; בחרו צבע פנוי.',
  },
  create: {
    title: 'הצבע נתפס',
    message:
      'כרטיסייה אחרת בחרה בצבע הזה. הפרטים שמילאתם נשמרו; בחרו צבע פנוי.',
  },
  reactivate: {
    title: 'הצבע כבר בשימוש',
    message:
      'כרטיסייה אחרת משתמשת בצבע הזה. לא שינינו את הצבע ולא הפעלנו מחדש. אפשר להעביר את הכרטיסייה האחרת לארכיון או לנסות שוב כשהצבע יתפנה.',
  },
} as const;

export function isLoyaltyThemeConflict(error: unknown) {
  return String(error).includes(LOYALTY_THEME_CONFLICT_CODE);
}

export function loyaltyWriteErrorToHebrewMessage(error: unknown) {
  const raw = String(error);
  if (raw.includes('PROGRAM_ARCHIVED_READONLY')) {
    return 'כרטיסייה בארכיון ניתנת להפעלה מחדש בלבד. הנתונים נשמרו כמו שהם.';
  }
  if (raw.includes('PROGRAM_PUBLISH_REQUIRES_DRAFT')) {
    return 'אפשר לפרסם רק כרטיסייה שנמצאת בטיוטה.';
  }
  if (raw.includes('PROGRAM_CANNOT_BE_ARCHIVED')) {
    return 'אפשר להעביר לארכיון רק כרטיסייה פעילה.';
  }
  if (raw.includes('NOT_AUTHORIZED')) {
    return 'אין הרשאה לפעולה הזו.';
  }
  return 'לא הצלחנו להשלים את הפעולה. נסו שוב.';
}
