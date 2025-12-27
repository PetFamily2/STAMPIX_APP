# תבנית אפליקציית מובייל (React Native & Convex)

ברוכים הבאים לתבנית הפיתוח לאפליקציית React Native עם Expo ו-Convex. תבנית זו מותאמת מראש לעברית (RTL) וכוללת מערכת אימות מלאה, ניווט ועיצוב מודרני.

## 📚 תוכן עניינים

1. [מבנה האפליקציה](#מבנה-האפליקציה)
2. [צעדים ראשונים](#צעדים-ראשונים)
3. [הגדרת מסד נתונים (Convex)](#הגדרת-מסד-נתונים-convex)
4. [התקנה והרצה](#התקנה-והרצה)
5. [פיצ'רים מרכזיים](#פיצרים-מרכזיים)

---

## 🏗 מבנה האפליקציה

האפליקציה בנויה ממספר רכיבים מרכזיים:

- **Frontend (צד לקוח):**
  - **Expo & React Native:** התשתית לפיתוח האפליקציה למובייל (iOS ו-Android).
  - **Expo Router:** מערכת ניווט מבוססת קבצים (בתיקיית `app/`).
  - **NativeWind:** ספריית עיצוב המאפשרת שימוש ב-Tailwind CSS בתוך React Native.
  - **RTL Support:** תמיכה מובנית בשפות מימין-לשמאל (עברית), כולל פתרונות היברידיים ל-Expo Go ול-Production.

- **Backend (צד שרת):**
  - **Convex:** פלטפורמת Backend-as-a-Service המספקת מסד נתונים בזמן אמת, פונקציות שרת (Server Functions) ואימות משתמשים.
  - **Convex Auth:** מערכת אימות משתמשים מאובטחת המוטמעת ישירות ב-Convex.

### תיקיות חשובות:
- `app/`: מכילה את מסכי האפליקציה והניווט.
  - `(auth)/`: מסכי התחברות והרשמה (לפני אימות).
    - `paywall/`: מסך Paywall (תשלום).
  - `(authenticated)/`: מסכים הזמינים רק למשתמשים מחוברים (האפליקציה הראשית).
- `convex/`: מכילה את לוגיקת השרת (Schema, פונקציות, הגדרות אימות).
- `components/`: רכיבי UI לשימוש חוזר.
- `config/`: קבצי קונפיגורציה מרכזיים.
  - `appConfig.ts`: דגלי תכונות וקונפיגורציה כללית.
- `contexts/`: קונטקסטים גלובליים.
  - `RevenueCatContext.tsx`: ניהול מנויים ותשלומים.
- `utils/`: כלי עזר.
  - `revenueCatConfig.ts`: קונפיגורציית RevenueCat.
- `lib/`: ספריות עזר (כגון `rtl.ts` לתמיכה בעברית).

---

## 🚀 צעדים ראשונים (עם קבלת התבנית)

כאשר אתם מקבלים את התבנית הזו, בצעו את הפעולות הבאות:

1. **שכפול/הורדת הקוד:** ודאו שכל קבצי הפרויקט נמצאים אצלכם במחשב.
2. **התקנת Bun:** הפרויקט משתמש ב-`bun` כמנהל חבילות (מהיר יותר מ-npm/yarn).
   - אם אין לכם bun, התקינו אותו: `npm i -g bun` (לאחר שהתקנתם Node.JS)
   - או עקבו אחר ההוראות ב-[bun.sh](https://bun.sh).

---

## 🗄 הגדרת מסד נתונים (Convex)

כדי שהאפליקציה תעבוד, עליכם לקשר אותה לפרויקט Convex משלכם:

1. **יצירת חשבון Convex:** הירשמו ב-[convex.dev](https://convex.dev).
2. **התחברות דרך הטרמינל:**
   הריצו את הפקודה בתיקיית הפרויקט:
   ```bash
   bunx convex login
   ```
3. **יצירת פרויקט חדש:**
   הריצו את הפקודה ליצירת פרויקט וקישורו:
   ```bash
   bunx convex dev
   ```
   פקודה זו תבקש מכם לבחור שם לפרויקט וליצור אותו. בסיום, היא תיצור קובץ `.env.local` עם כתובת השרת שלכם (`CONVEX_DEPLOYMENT` ו-`NEXT_PUBLIC_CONVEX_URL` או `EXPO_PUBLIC_CONVEX_URL`).

   **חשוב:** ודאו שבקובץ `.env.local` (או `.env`) מוגדר המשתנה `EXPO_PUBLIC_CONVEX_URL` (האפליקציה אינה קוראת את `NEXT_PUBLIC_CONVEX_URL`).
   ```env
   EXPO_PUBLIC_CONVEX_URL="https://your-convex-project-url.convex.cloud"
   ```
   (העתיקו את הכתובת ש-Convex יצר אוטומטית).

---

## 📦 התקנה והרצה

### 1. התקנת חבילות
התקינו את כל התלויות של הפרויקט באמצעות bun:
```bash
bun install
```

### 2. הרצת השרת (Convex)
פתחו טרמינל נפרד והריצו את שרת הפיתוח של Convex (כדי לסנכרן שינויים ב-Backend בזמן אמת):
```bash
bunx convex dev
```
(השאירו את הטרמינל הזה פתוח ברקע).

### 3. הרצת האפליקציה (Expo)
בטרמינל נוסף, הריצו את האפליקציה:
```bash
bun dev
```
לאחר מכן:
- לחצו `i` כדי לפתוח בסימולטור **iOS**.
- לחצו `a` כדי לפתוח באמולטור **Android**.
- או סרקו את ה-QR Code עם אפליקציית **Expo Go** במכשיר הפיזי שלכם. (חייבים להיות מחוברים לאותו שרת או Wi-Fi)

---

---

## 🎯 פיצ'רים מרכזיים

### מערכת תשלומים (RevenueCat)
האפליקציה כוללת אינטגרציה מלאה עם [RevenueCat](https://www.revenuecat.com) למערכת תשלומים:
- **Paywall Screen:** מסך תשלום בעברית עם תוכניות מנוי (חודשי, שנתי)
- **RevenueCat Context:** ניהול מנויים, רכישות ושחזור רכישות
- **Mock Payments:** מצב בדיקה שמאפשר לבדוק את ה-Paywall בלי תשלום אמיתי
- **Webhook Integration:** סנכרון אוטומטי של סטטוס מנוי ל-Convex Database

📖 **מדריך הגדרה:** ראה `docs/REVENUECAT_SETUP.md` להגדרה מפורטת ל-iOS ו-Android.

### קונפיגורציה מרכזית (`appConfig.ts`)
קובץ קונפיגורציה מרכזי לניהול דגלי תכונות:
- `PAYMENT_SYSTEM_ENABLED`: הפעלה/כיבוי של מערכת התשלומים האמיתית
- `MOCK_PAYMENTS`: מצב בדיקה לתשלומים מדומים
- `IS_DEV_MODE`: זיהוי אוטומטי של מצב פיתוח
- `FORCE_PROD_MODE`: כפיית מצב ייצור לבדיקות

### מחיקת חשבון
משתמשים יכולים למחוק את החשבון שלהם דרך מסך ההגדרות, עם אישור דו-שלבי.

---

## 💡 טיפים נוספים

- **עברית (RTL):** האפליקציה מוגדרת לעבוד מימין לשמאל. אם אתם מוסיפים מסכים חדשים, השתמשו בקבצי העזר ב-`lib/rtl.ts` כדי להבטיח התאמה מלאה.
- **אבטחה:** מפתחות API סודיים לא נשמרים בקוד אלא במשתני סביבה. ודאו שקובץ `.env` לא עולה ל-Git (הוא כבר ב-.gitignore).
- **בדיקות:** הריצו `bun run check` כדי לוודא שאין שגיאות קוד לפני ביצוע שינויים משמעותיים.
- **תשלומים:** לפני פריסה לייצור, ודאו שמוגדרים כל משתני הסביבה הנדרשים (ראה `docs/REVENUECAT_SETUP.md`).

בהצלחה בפיתוח! 🚀

