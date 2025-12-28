// ============================================================================
// קונפיגורציית CONVEX
// ============================================================================
// ניהול כתובות Convex לפי הסביבה

import { APP_ENV } from '@/config/appConfig';

/**
 * קבלת כתובת Convex המתאימה לפי הסביבה הנוכחית
 * סדר עדיפויות:
 * 1. כתובת ספציפית לסביבה (פיתוח/ייצור)
 * 2. נפילה לכתובת יחידה ישנה
 */
export function getConvexUrl(): string {
  const devUrl = process.env.EXPO_PUBLIC_CONVEX_URL_DEV;
  const prodUrl = process.env.EXPO_PUBLIC_CONVEX_URL_PROD;
  const legacyUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

  if (APP_ENV === 'prod' && prodUrl) {
    return prodUrl;
  }

  if (APP_ENV === 'dev' && devUrl) {
    return devUrl;
  }

  // נפילה לכתובת יחידה ישנה לתאימות לאחור
  if (legacyUrl) {
    return legacyUrl;
  }

  throw new Error(
    'חסרה כתובת Convex. הגדר EXPO_PUBLIC_CONVEX_URL או כתובות ספציפיות לסביבה ב-.env'
  );
}
