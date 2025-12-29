# STAMPIX - Screen Map (MVP + Future-Ready)

עיקרון:
המסכים מאורגנים לפי Expo Router Groups.
הצגה בפועל תלויה ב-UI gating לפי roles.md (myBusinesses / myMemberships).

---

## Groups
- (auth) - התחברות והרשמה
- (authenticated) - אחרי התחברות
  - customer/* - צד לקוח
  - business/* - צד עסק (owner/staff)
  - admin/* - תמיכה/ניהול (עתידי)

---

# (auth) - Auth (MVP)
מי: כולם

- (auth)/index - Landing / entry
  חוויה: מסך פתיחה עם לוגו, CTA להתחברות/הרשמה
- (auth)/sign-in - Sign In
  חוויה: התחברות (טלפון/ספקים לפי auth בפועל)
- (auth)/sign-up - Sign Up
  חוויה: הרשמה
- (auth)/paywall - Paywall (אם קיים בטמפלייט)
  חוויה: תשלום/שדרוג חבילה (מוגדר בהמשך; לא MVP-קריטי)

---

# (authenticated)/customer - Customer (MVP)
מי: customer (וגם עסק אם יש לו memberships - לפי gating)

- (authenticated)/index - Wallet (Home)
  חוויה:
  - Header פרופיל + התראות
  - My QR section (QR אישי לשיתוף/סריקה)
  - Active memberships list (כרטיסיות פעילות עם progress)
  - כניסה לפרטי כרטיסיה בלחיצה

- (authenticated)/my-qr (Future או אם נדרש להפרדה מה-Home)
  חוויה: QR אישי גדול + Share

- (authenticated)/card/[membershipId] - Membership Details
  חוויה:
  - פרטי העסק והתכנית
  - התקדמות (stamps/max)
  - היסטוריה (events)
  - תוקף/הטבה

- (authenticated)/profile (Future אם לא קיים בטמפלייט)
  חוויה:
  - כרטיס ביקור דיגיטלי
  - אייקונים: WhatsApp/Waze/Instagram/Web/Email
  - Save Contact (VCF)

- (authenticated)/settings - Settings (MVP - קיים בטמפלייט)
  חוויה:
  - פרטי משתמש
  - שפה/תצוגה
  - התנתקות
  - מידע משפטי

---

# (authenticated)/business - Business Owner/Staff (MVP בסיסי)
מי: business_owner, business_staff (לפי businessStaff)

- (authenticated)/business/scanner (MVP)
  חוויה:
  - מצלמה פתוחה
  - זיהוי QR לקוח
  - popup עם שם לקוח
  - פעולות: Add Stamp / Redeem
  - Success state (וי ירוק + סאונד)

- (authenticated)/business/program (MVP בסיסי)
  מי: owner (ואפשר read-only ל-staff)
  חוויה:
  - הגדרת rewardName
  - maxStamps
  - icon
  - שמירה (mutation)

- (authenticated)/business/staff (Future)
  מי: owner
  חוויה:
  - רשימת עובדים
  - הוספה/הסרה
  - תפקידים
  - אכיפה לפי חבילה

---

# (authenticated)/admin - Admin/Support (Future)
מי: admin_support

מטרה: תמיכה בעסקים, שירות לקוחות, תחקור אירועים, סטטיסטיקות.

- (authenticated)/admin/index
  חוויה:
  - KPI בסיסיים
  - חיפוש משתמש/עסק
  - קיצורי דרך לפתרון בעיות נפוצות

- (authenticated)/admin/users
  חוויה:
  - רשימת משתמשים
  - חיפוש לפי email/phone/externalId
  - כניסה לפרטי משתמש

- (authenticated)/admin/businesses
  חוויה:
  - רשימת עסקים
  - חיפוש לפי name/externalId/qrCodeData
  - כניסה לפרטי עסק

- (authenticated)/admin/user/[id]
  חוויה:
  - memberships של המשתמש
  - events אחרונים
  - סטטוס/השעיה (עתידי)

- (authenticated)/admin/business/[id]
  חוויה:
  - staff
  - programs
  - סטטיסטיקות
  - אירועים חריגים
  - עזרה בתקלות סריקה / כפילות / החזרים

---

## Notes
- MVP אמיתי: auth + wallet + membership details + scanner + program basics.
- כל השאר Future, אבל המפה כאן מגדירה את המבנה כדי שלא נשבור טמפלייט.
