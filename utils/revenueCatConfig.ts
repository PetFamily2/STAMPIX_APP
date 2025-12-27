// ============================================================================
// קונפיגורציית REVENUECAT
// ============================================================================
// ניהול מפתחות RevenueCat API לפי פלטפורמה וסביבה

import { Platform } from 'react-native';
import { APP_ENV } from '@/config/appConfig';

type RevenueCatPlatform = 'ios' | 'android';

/**
 * קבלת מפתח RevenueCat API המתאים לפי פלטפורמה וסביבה
 * סדר עדיפויות:
 * 1. מפתח ספציפי לסביבה (פיתוח/ייצור)
 * 2. נפילה למפתח יחיד ישן
 * 3. מחזיר null אם לא מוגדר מפתח (מאפשר פיתוח ללא מפתחות)
 */
export function getRevenueCatApiKey(
  platform: RevenueCatPlatform
): string | null {
  if (platform === 'ios') {
    const devKey = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV;
    const prodKey = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD;
    const legacyKey = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY;

    if (APP_ENV === 'prod' && prodKey) {
      return prodKey;
    }
    if (APP_ENV === 'dev' && devKey) {
      return devKey;
    }
    if (legacyKey) {
      return legacyKey;
    }

    return null;
  }

  if (platform === 'android') {
    const devKey = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV;
    const prodKey = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD;
    const legacyKey = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY;

    if (APP_ENV === 'prod' && prodKey) {
      return prodKey;
    }
    if (APP_ENV === 'dev' && devKey) {
      return devKey;
    }
    if (legacyKey) {
      return legacyKey;
    }

    return null;
  }

  return null;
}

/**
 * קבלת מפתח RevenueCat API עבור הפלטפורמה הנוכחית
 */
export function getCurrentPlatformRevenueCatApiKey(): string | null {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  return getRevenueCatApiKey(platform);
}

/**
 * בדיקה האם RevenueCat מוגדר כראוי עבור הפלטפורמה הנוכחית
 */
export function isRevenueCatConfigured(): boolean {
  return getCurrentPlatformRevenueCatApiKey() !== null;
}
