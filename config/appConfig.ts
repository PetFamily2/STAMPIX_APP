// ============================================================================
// קונפיגורציית האפליקציה
// ============================================================================
// קובץ קונפיגורציה מרכזי לשליטה במצבי האפליקציה
// מבוסס על הדפוס של GluCause

// הצהרה על משתנה גלובלי של React Native
declare const __DEV__: boolean;

// ============================================================================
// מצב סביבה
// ============================================================================

// 🚨 קריטי: דגל זה מכריח מצב ייצור
// ⚠️  אל תתן לאוטומציה לשנות את זה
// 👤 נדרשת פעולת משתמש: הגדר ידנית ל-true/false לפי הצורך:
//    - הגדר ל-TRUE לבדיקות ייצור (משתמש ב-Convex + RevenueCat של ייצור)
//    - הגדר ל-FALSE לפיתוח (משתמש בסביבת פיתוח)
export const FORCE_PROD_MODE = false;

// דגל מצב פיתוח נגזר - מכבד את דריסת FORCE_PROD_MODE
export const IS_DEV_MODE = FORCE_PROD_MODE ? false : __DEV__;

// סוג סביבת האפליקציה
export type AppEnv = 'dev' | 'prod';

// סביבת האפליקציה הנוכחית - נגזרת מהדגלים למעלה
export const APP_ENV: AppEnv = IS_DEV_MODE ? 'dev' : 'prod';

// ============================================================================
// קונפיגורציית מערכת התשלומים
// ============================================================================

// 🚨 קריטי: דגל זה קובע האם מערכת התשלומים פעילה
// ⚠️  אל תתן לאוטומציה לשנות את זה
// 👤 נדרשת פעולת משתמש: הגדר ידנית ל-true/false לפי הצורך:
//    - הגדר ל-TRUE לבניות ייצור (תשלומים אמיתיים)
//    - הגדר ל-FALSE לפיתוח/בדיקות (גישה חופשית לתכונות פרימיום)
export const PAYMENT_SYSTEM_ENABLED = false;

// 🚨 קריטי: דגל זה קובע האם התשלומים מדומים
// ⚠️  אל תתן לאוטומציה לשנות את זה
// 👤 נדרשת פעולת משתמש: הגדר ידנית ל-true/false לפי הצורך:
//    - הגדר ל-TRUE לבדיקות ממשק (זרימת רכישה מדומה, ללא חיובים אמיתיים)
//    - הגדר ל-FALSE לייצור (רכישות RevenueCat אמיתיות דרך חנויות האפליקציות)
export const MOCK_PAYMENTS = false;

export type BusinessPlan = 'starter' | 'pro' | 'unlimited';
export type BillingPeriod = 'monthly' | 'yearly';
export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: 'חודשי',
  yearly: 'שנתי',
};

export const REVENUECAT_PACKAGE_BY_PLAN_PERIOD: Record<
  Exclude<BusinessPlan, 'starter'>,
  Record<BillingPeriod, string | null>
> = {
  pro: {
    monthly: process.env.EXPO_PUBLIC_RC_PACKAGE_PRO_MONTHLY ?? null,
    yearly: process.env.EXPO_PUBLIC_RC_PACKAGE_PRO_YEARLY ?? null,
  },
  unlimited: {
    monthly: process.env.EXPO_PUBLIC_RC_PACKAGE_UNLIMITED_MONTHLY ?? null,
    yearly: process.env.EXPO_PUBLIC_RC_PACKAGE_UNLIMITED_YEARLY ?? null,
  },
};

// ============================================================================
// קישורי תנאי שימוש ומדיניות פרטיות
// ============================================================================

// 👤 נדרשת פעולת משתמש: עדכן את הקישורים לדפי תנאי השימוש ומדיניות הפרטיות שלך
// הקישורים צריכים להוביל לדפי Landing Page שלך (לא בתוך האפליקציה)
export const TERMS_URL = 'https://yourdomain.com/terms';
export const PRIVACY_URL = 'https://yourdomain.com/privacy';
