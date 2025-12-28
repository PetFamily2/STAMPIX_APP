/**
 * כלי עזר ל-RTL - תמיכה מפורשת בימין-לשמאל שעובדת ב:
 * - Expo Go (פיתוח)
 * - Development builds
 * - Production builds
 * - iOS ו-Android באופן עקבי
 *
 * מודול זה לא מסתמך על I18nManager מהסיבות הבאות:
 * 1. I18nManager.forceRTL() דורש הפעלה מחדש של האפליקציה
 * 2. הוא לא עובד ב-Expo Go
 * 3. iOS ו-Android מתנהגים בצורה שונה
 *
 * במקום זאת, אנו מגדירים במפורש סגנונות RTL ומשתמשים בהם ישירות.
 */

import type { FlexStyle, TextStyle, ViewStyle } from 'react-native'; // ייבוא טיפוסים של סגנונות

// קונפיגורציית האפליקציה - שנה ל-true עבור שפות RTL (עברית, ערבית וכו')
export const IS_RTL = true;

/**
 * קבלת כיוון ה-Flex הנכון עבור שורות
 * ב-RTL: הפריטים צריכים לזרום מימין לשמאל
 */
export const flexDirection = {
  row: (IS_RTL ? 'row-reverse' : 'row') as FlexStyle['flexDirection'],
  rowReverse: (IS_RTL ? 'row' : 'row-reverse') as FlexStyle['flexDirection'],
  col: 'column' as FlexStyle['flexDirection'],
  colReverse: 'column-reverse' as FlexStyle['flexDirection'],
};

/**
 * קבלת יישור הטקסט הנכון
 * ב-RTL: הטקסט צריך להיות מיושר לימין
 */
export const textAlign = {
  start: (IS_RTL ? 'right' : 'left') as TextStyle['textAlign'],
  end: (IS_RTL ? 'left' : 'right') as TextStyle['textAlign'],
  center: 'center' as TextStyle['textAlign'],
};

/**
 * קבלת יישור התוכן (Justify Content) הנכון
 * ב-RTL: 'start' משמעותו צד ימין
 */
export const justifyContent = {
  start: (IS_RTL ? 'flex-end' : 'flex-start') as FlexStyle['justifyContent'],
  end: (IS_RTL ? 'flex-start' : 'flex-end') as FlexStyle['justifyContent'],
  center: 'center' as FlexStyle['justifyContent'],
  between: 'space-between' as FlexStyle['justifyContent'],
  around: 'space-around' as FlexStyle['justifyContent'],
  evenly: 'space-evenly' as FlexStyle['justifyContent'],
};

/**
 * קבלת יישור הפריטים (Align Items) הנכון
 */
export const alignItems = {
  start: (IS_RTL ? 'flex-end' : 'flex-start') as FlexStyle['alignItems'],
  end: (IS_RTL ? 'flex-start' : 'flex-end') as FlexStyle['alignItems'],
  center: 'center' as FlexStyle['alignItems'],
  stretch: 'stretch' as FlexStyle['alignItems'],
};

/**
 * כלי מרווח (Spacing) שמכבדים RTL
 * השתמש באלה במקום marginLeft/marginRight, paddingLeft/paddingRight
 */
export const spacing = {
  /** צד ההתחלה (ימין ב-RTL, שמאל ב-LTR) */
  marginStart: (value: number): ViewStyle =>
    IS_RTL ? { marginRight: value } : { marginLeft: value },

  /** צד הסיום (שמאל ב-RTL, ימין ב-LTR) */
  marginEnd: (value: number): ViewStyle =>
    IS_RTL ? { marginLeft: value } : { marginRight: value },

  /** ריפוד צד ההתחלה */
  paddingStart: (value: number): ViewStyle =>
    IS_RTL ? { paddingRight: value } : { paddingLeft: value },

  /** ריפוד צד הסיום */
  paddingEnd: (value: number): ViewStyle =>
    IS_RTL ? { paddingLeft: value } : { paddingRight: value },
};

/**
 * כלי מיקום (Position) שמכבדים RTL
 */
export const position = {
  /** מיקום התחלה (ימין ב-RTL, שמאל ב-LTR) */
  start: (value: number): ViewStyle =>
    IS_RTL ? { right: value } : { left: value },

  /** מיקום סיום (שמאל ב-RTL, ימין ב-LTR) */
  end: (value: number): ViewStyle =>
    IS_RTL ? { left: value } : { right: value },
};

/**
 * עזרי NativeWind/Tailwind עבור RTL
 * השתמש באלה כדי לקבל את מחלקות ה-Tailwind הנכונות לפריסות RTL
 */
export const tw = {
  /** שורת Flex שמכבדת RTL */
  flexRow: IS_RTL ? 'flex-row-reverse' : 'flex-row',

  /** יישור טקסט לתוכן ראשי */
  textStart: IS_RTL ? 'text-right' : 'text-left',
  textEnd: IS_RTL ? 'text-left' : 'text-right',

  /** יישור תוכן (Justify) */
  justifyStart: IS_RTL ? 'justify-end' : 'justify-start',
  justifyEnd: IS_RTL ? 'justify-start' : 'justify-end',

  /** יישור פריטים (Items) */
  itemsStart: IS_RTL ? 'items-end' : 'items-start',
  itemsEnd: IS_RTL ? 'items-start' : 'items-end',

  /** יישור עצמי (Self) */
  selfStart: IS_RTL ? 'self-end' : 'self-start',
  selfEnd: IS_RTL ? 'self-start' : 'self-end',

  /** ריפוד (Padding) - צד ההתחלה */
  ps: (size: number | string) => (IS_RTL ? `pr-${size}` : `pl-${size}`),
  pe: (size: number | string) => (IS_RTL ? `pl-${size}` : `pr-${size}`),

  /** שוליים (Margin) - צד ההתחלה */
  ms: (size: number | string) => (IS_RTL ? `mr-${size}` : `ml-${size}`),
  me: (size: number | string) => (IS_RTL ? `ml-${size}` : `mr-${size}`),
};

/**
 * פונקציית עזר ליצירת אובייקטי סגנון מותאמי RTL
 */
export function rtlStyle<T extends ViewStyle | TextStyle>(
  ltrStyle: T,
  rtlStyle: T
): T {
  return IS_RTL ? rtlStyle : ltrStyle;
}

/**
 * שינוי טרנספורמציה (סיבוב) לאייקונים/חיצים שצריכים להתהפך ב-RTL
 * למשל: חץ חזרה, חץ המורה לכיוון מסוים
 */
export const iconTransform = {
  /** היפוך אופקי עבור RTL (למשל, חץ חזרה) */
  flipHorizontal: IS_RTL ? [{ scaleX: -1 }] : [],

  /** סיבוב ב-180 מעלות עבור RTL */
  rotate180: IS_RTL ? [{ rotate: '180deg' }] : [],
};
