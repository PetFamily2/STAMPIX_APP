# מדריך הגדרת RevenueCat - iOS ו-Android

מדריך זה מסביר כיצד להגדיר את מערכת התשלומים RevenueCat עבור iOS ו-Android מאפס ועד סוף.

## תוכן עניינים

1. [דרישות מקדימות](#דרישות-מקדימות)
2. [הגדרת iOS (App Store Connect)](#הגדרת-ios-app-store-connect)
3. [הגדרת Android (Google Play Console)](#הגדרת-android-google-play-console)
4. [הגדרת RevenueCat Dashboard](#הגדרת-revenuecat-dashboard)
5. [הגדרת משתני סביבה](#הגדרת-משתני-סביבה)
6. [בדיקות](#בדיקות)
7. [פתרון בעיות](#פתרון-בעיות)

---

## דרישות מקדימות

לפני שתתחילו, ודאו שיש לכם:

- [ ] חשבון **Apple Developer** (99$ לשנה) - נדרש ל-iOS
- [ ] חשבון **Google Play Console** (25$ חד-פעמי) - נדרש ל-Android
- [ ] חשבון **RevenueCat** (חינמי) - [הירשמו כאן](https://app.revenuecat.com/signup)
- [ ] אפליקציה שנוצרה ב-**App Store Connect** (iOS)
- [ ] אפליקציה שנוצרה ב-**Google Play Console** (Android)
- [ ] Bundle ID / Package Name מוגדרים ב-`app.json`

---

## הגדרת iOS (App Store Connect)

### שלב 1: יצירת אפליקציה ב-App Store Connect

1. היכנסו ל-[App Store Connect](https://appstoreconnect.apple.com)
2. לחצו על **"+ My App"** → **New App**
3. מלאו את הפרטים:
   - **Platform**: iOS
   - **Name**: שם האפליקציה שלכם
   - **Primary Language**: English (או שפה אחרת)
   - **Bundle ID**: בחרו את ה-Bundle ID שלכם (או צרו חדש)
   - **SKU**: מזהה ייחודי (למשל: `your-app-ios`)
4. לחצו **Create**

### שלב 2: יצירת מוצר In-App Purchase

1. ב-App Store Connect, פתחו את האפליקציה שיצרתם
2. לחצו על **Features** → **In-App Purchases** → **+ Create**
3. בחרו **Auto-Renewable Subscription**
4. מלאו את הפרטים:
   - **Product ID**: `premium_monthly` (או מזהה אחר)
   - **Reference Name**: Premium Monthly
   - **Subscription Group**: צרו קבוצה חדשה "Premium"
   - **Subscription Duration**: 1 Month (או תקופה אחרת)
   - **Price**: בחרו מחיר (למשל: ₪34.90)
5. לחצו **Save** (אין צורך לשלוח לבדיקה בשלב זה)

**הערה:** ניתן ליצור גם תוכנית שנתית (`premium_annual`) באותו אופן.

### שלב 3: יצירת App Store Connect API Key

1. ב-App Store Connect, לחצו על **Users and Access** → **Keys** → **App Store Connect API**
2. לחצו על **Generate API Key**
3. מלאו:
   - **Name**: `RevenueCat Integration`
   - **Access**: Admin
4. לחצו **Generate**
5. **הורידו** את קובץ ה-`.p8` (תזדקקו לו בהמשך!)
6. **שימו לב** ל-**Key ID** (מוצג ברשימה)
7. **שימו לב** ל-**Issuer ID** (מוצג בראש העמוד)

**חשוב:** שמרו את הקובץ `.p8` במקום בטוח - לא תוכלו להוריד אותו שוב!

---

## הגדרת Android (Google Play Console)

### שלב 1: יצירת אפליקציה ב-Play Console

1. היכנסו ל-[Google Play Console](https://play.google.com/console)
2. לחצו על **Create app**
3. מלאו את הפרטים:
   - **App name**: שם האפליקציה שלכם
   - **Default language**: English (או שפה אחרת)
   - **App or game**: App
   - **Free or paid**: Free
4. לחצו **Create**

### שלב 2: יצירת מוצר Subscription

1. ב-Play Console, פתחו את האפליקציה שיצרתם
2. לחצו על **Monetize** → **Products** → **Subscriptions**
3. לחצו על **Create subscription**
4. מלאו את הפרטים:
   - **Product ID**: `premium_monthly` (או מזהה אחר)
   - **Name**: Premium Monthly
   - **Billing period**: 1 month (או תקופה אחרת)
   - **Price**: בחרו מחיר (למשל: ₪34.90)
5. לחצו **Save** (אין צורך להפעיל בשלב זה)

**הערה:** ניתן ליצור גם תוכנית שנתית (`premium_annual`) באותו אופן.

### שלב 3: יצירת Service Account ל-RevenueCat

1. היכנסו ל-[Google Cloud Console](https://console.cloud.google.com)
2. צרו פרויקט חדש (או בחרו קיים)
3. הפעילו את **Google Play Android Developer API**:
   - לחצו על **APIs & Services** → **Library**
   - חפשו "Google Play Android Developer API"
   - לחצו **Enable**
4. צרו Service Account:
   - לחצו על **IAM & Admin** → **Service Accounts**
   - לחצו **Create Service Account**
   - **Name**: `RevenueCat Integration`
   - לחצו **Create and Continue**
   - תנו תפקיד: **Editor** (או תפקיד מותאם אישית עם גישה ל-Play Console)
   - לחצו **Done**
5. הורידו את מפתח ה-JSON:
   - לחצו על ה-Service Account שיצרתם
   - לחצו על **Keys** → **Add Key** → **Create new key**
   - בחרו **JSON**
   - לחצו **Create**
   - **הורידו** את קובץ ה-JSON (תזדקקו לו בהמשך!)

**חשוב:** שמרו את קובץ ה-JSON במקום בטוח!

### שלב 4: קישור Service Account ל-Play Console

1. ב-**Play Console**, לחצו על **Setup** → **API access**
2. מצאו את ה-Service Account שיצרתם
3. לחצו **Grant access**
4. תנו הרשאות:
   - ✅ **View financial data**
   - ✅ **Manage orders**
5. לחצו **Invite user**

---

## הגדרת RevenueCat Dashboard

### שלב 1: יצירת פרויקט ב-RevenueCat

1. היכנסו ל-[RevenueCat Dashboard](https://app.revenuecat.com)
2. הירשמו או התחברו
3. לחצו על **+ New Project** (אם אין לכם פרויקט)
4. תנו שם לפרויקט ולחצו **Create**

### שלב 2: הוספת אפליקציית iOS

1. ב-RevenueCat Dashboard, לחצו על **Apps** → **+ New App** → **iOS**
2. מלאו את הפרטים:
   - **App Name**: שם האפליקציה שלכם (iOS)
   - **Bundle ID**: ה-Bundle ID מהאפליקציה ב-App Store Connect
   - **App Store Connect API Key**: העלו את קובץ ה-`.p8` שיצרתם
   - **Key ID**: הדביקו את ה-Key ID מ-App Store Connect
   - **Issuer ID**: הדביקו את ה-Issuer ID מ-App Store Connect
3. לחצו **Save**
4. **העתיקו** את ה-iOS API Key (מתחיל ב-`appl_`) - תזדקקו לו בהמשך!

### שלב 3: הוספת אפליקציית Android

1. ב-RevenueCat Dashboard, לחצו על **Apps** → **+ New App** → **Android**
2. מלאו את הפרטים:
   - **App Name**: שם האפליקציה שלכם (Android)
   - **Package Name**: ה-Package Name מהאפליקציה ב-Play Console
   - **Service Account JSON**: העלו את קובץ ה-JSON שיצרתם
3. לחצו **Save**
4. **העתיקו** את ה-Android API Key (מתחיל ב-`goog_`) - תזדקקו לו בהמשך!

### שלב 4: הגדרת Entitlement

1. ב-RevenueCat Dashboard, לחצו על **Entitlements**
2. לחצו **+ New** (אם אין לכם entitlement)
3. מלאו:
   - **Identifier**: `premium`
   - **Display Name**: Premium
4. לחצו **Save**
5. קישרו מוצרים ל-Entitlement:
   - לחצו על ה-Entitlement `premium`
   - תחת **Products**, לחצו **+ Add Product**
   - בחרו את המוצרים שיצרתם:
     - iOS: `premium_monthly` (ו-`premium_annual` אם יצרתם)
     - Android: `premium_monthly` (ו-`premium_annual` אם יצרתם)
   - לחצו **Save**

---

## הגדרת משתני סביבה

### לפתח מקומי (אופציונלי)

צרו קובץ `.env.local` בתיקיית הפרויקט:

```bash
# Convex
EXPO_PUBLIC_CONVEX_URL=https://your-convex-url.convex.cloud

# RevenueCat - iOS
EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV=appl_...
EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD=appl_...

# RevenueCat - Android
EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV=goog_...
EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD=goog_...
```

**הערה:** ניתן להשתמש במפתח יחיד לכל סביבה (ללא `_DEV`/`_PROD`) אם אתם לא מפרידים בין סביבות.

### ל-EAS Builds (Production)

הגדירו את המשתנים כ-EAS Secrets:

```bash
# Convex
eas secret:create --scope project --name EXPO_PUBLIC_CONVEX_URL --value "https://your-convex-url.convex.cloud"

# RevenueCat - iOS Production
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD --value "appl_..."

# RevenueCat - Android Production
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD --value "goog_..."

# RevenueCat - iOS Development (אופציונלי)
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV --value "appl_..."

# RevenueCat - Android Development (אופציונלי)
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV --value "goog_..."
```

**אלטרנטיבה:** ניתן להגדיר דרך האתר של Expo תחת **Project Settings** → **Secrets**.

---

## בדיקות

### שלב 1: בניית Development Build

לפני שתבדקו רכישות, עליכם לבנות Development Build (לא Expo Go):

```bash
# iOS
eas build --platform ios --profile development

# Android
eas build --platform android --profile development
```

**הערה:** בנייה ל-iOS דורשת חשבון Apple Developer פעיל.

### שלב 2: התקנה על מכשיר

**iOS:**
1. סרקו את ה-QR Code שמופיע לאחר הבנייה
2. התקינו את האפליקציה
3. פתחו **Settings** → **General** → **VPN & Device Management**
4. בחרו את אישור המפתח והאמינו בו

**Android:**
1. הורידו את קובץ ה-`.apk` או סרקו QR Code
2. אפשרו התקנה ממקורות לא ידועים (אם נדרש)
3. התקינו את האפליקציה

### שלב 3: בדיקת רכישות

**iOS (Sandbox Account):**
1. במכשיר ה-iPhone, פתחו **Settings** → **[Your Name]** → **Media & Purchases**
2. גללו למטה → **Sandbox Account**
3. התחברו עם Apple ID בדיקה (או צרו חדש)
4. פתחו את האפליקציה
5. נסו לרכוש מנוי
6. השתמשו ב-Sandbox Account להשלמת הרכישה

**Android (Test Account):**
1. ב-Play Console, הוסיפו חשבון בדיקה תחת **Internal Testing**
2. במכשיר ה-Android, התחברו עם חשבון הבדיקה
3. פתחו את האפליקציה
4. נסו לרכוש מנוי
5. השתמשו בחשבון הבדיקה להשלמת הרכישה

### שלב 4: אימות ב-RevenueCat Dashboard

לאחר רכישה מוצלחת:

1. היכנסו ל-RevenueCat Dashboard
2. לחצו על **Customers**
3. חפשו את המשתמש לפי ה-User ID (מה-Convex/Convex Auth)
4. ודאו שהמנוי מופיע כ-**Active**

---

## פתרון בעיות

### "No apps found" ב-RevenueCat

**פתרון:** ודאו שיצרתם את האפליקציה ב-RevenueCat Dashboard (שלבים 2-3 בהגדרת RevenueCat).

### "Invalid API key" error

**פתרון:** 
- ודאו שאתם משתמשים ב-API Key מ-RevenueCat Dashboard (לא מ-App Store Connect או Play Console)
- ודאו שהמפתח מוגדר נכון ב-EAS Secrets או `.env.local`

### Build נכשל עם "Missing credentials"

**פתרון:** 
```bash
# iOS
eas credentials --platform ios

# Android
eas credentials --platform android
```

עקבו אחרי ההוראות להגדרת אישורים.

### רכישה לא עובדת ב-Development Build

**פתרון:**
1. ודאו ש-Sandbox Account (iOS) או Test Account (Android) מוגדרים
2. בדקו ב-RevenueCat Dashboard שהלקוח מופיע
3. ודאו שה-Product ID תואם: `premium_monthly` (או המזהה שיצרתם)

### Premium Status לא מתעדכן

**פתרון:**
1. בדקו ב-Convex Database שהמשתמש קיים
2. ודאו שה-User ID תואם בין RevenueCat ל-Convex
3. בדקו את הלוגים ב-Convex: `bunx convex logs`

---

## רשימת בדיקה מהירה

### App Store Connect / Play Console
- [ ] אפליקציה נוצרה ב-App Store Connect
- [ ] In-App Purchase `premium_monthly` נוצר (iOS)
- [ ] Subscription `premium_monthly` נוצר (Android)
- [ ] App Store Connect API Key נוצר והורד (iOS)
- [ ] Google Play Service Account נוצר והורד (Android)

### RevenueCat Dashboard
- [ ] אפליקציית iOS נוספה עם Bundle ID נכון
- [ ] אפליקציית Android נוספה עם Package Name נכון
- [ ] App Store Connect API Key הועלה (iOS)
- [ ] Google Play Service Account JSON הועלה (Android)
- [ ] Entitlement `premium` נוצר
- [ ] מוצרים קושרו ל-Entitlement
- [ ] iOS API Key הועתק
- [ ] Android API Key הועתק

### EAS / Environment
- [ ] RevenueCat API Keys מוגדרים כ-EAS Secrets
- [ ] Development Build Profile מוגדר
- [ ] מוכנים לבנות!

---

## שלבים הבאים

לאחר שבדקתם שהכל עובד:

1. **בניית Preview Build:** בדיקות ב-TestFlight (iOS) או Internal Testing (Android)
2. **בניית Production Build:** מוכן לשליחה לחנויות
3. **שליחה לחנויות:** העלאה ל-App Store ו-Google Play

---

## משאבים נוספים

- [תיעוד RevenueCat](https://docs.revenuecat.com/)
- [תיעוד App Store Connect](https://developer.apple.com/app-store-connect/)
- [תיעוד Google Play Console](https://support.google.com/googleplay/android-developer/)

---

**בהצלחה! 🚀**
