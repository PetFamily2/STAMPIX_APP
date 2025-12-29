# Roles & Permissions (MVP + Future-Ready)

עיקרון:
אין "role" יחיד על user.
למשתמש יכולים להיות כמה תפקידים במקביל, שנגזרים מהקשרים שלו בנתונים.

---

## Role Signals (איך מזהים תפקיד)
### Customer (לקוח)
- יש לו לפחות Membership פעיל אחד ב-`memberships`
- או שהוא נכנס לאפליקציה כמשתמש רגיל ומציג "My QR" גם בלי memberships (MVP מאפשר)

### Business Owner / Staff (עסק)
- קיים רשומה ב-`businessStaff` עבור (userId, businessId)
- staffRole:
  - owner: בעלים
  - staff: עובד

### Admin Support (עתידי)
- לא נקבע מטבלת users.
- ייקבע בעתיד דרך מנגנון נפרד (למשל allowlist / claim ב-auth / טבלת adminUsers).

---

## Permissions (MVP)
### Customer
- Wallet: לראות memberships
- My QR: להציג QR אישי
- Membership Details: היסטוריה/התקדמות

### Business Staff (staff)
- Scanner: add stamp
- Scanner: redeem reward (מאושר)
- לראות "תוצאה" וסטטוס פעולה

### Business Owner (owner)
- כל מה שיש ל-staff
- Program settings בסיסיים (rewardName, maxStamps, icon)

---

## Plan Limits (עתידי, אבל ביסודות)
- Starter: עד 2 עובדים (businessStaff)
- Pro: יותר עובדים
אכיפה מתבצעת בצד השרת (Convex) ולא רק ב-UI.

---

## UI Gating (איך האפליקציה מחליטה מה להציג)
בכניסה ל-(authenticated):
1) טוענים "contexts":
   - myBusinesses: כל businesses שהמשתמש משויך אליהם דרך businessStaff
   - myMemberships: כל memberships של המשתמש
2) אם יש myBusinesses:
   - מאפשרים Business Tabs/Routes (Scanner, Program)
3) אם יש myMemberships (או תמיד):
   - מאפשרים Customer Tabs/Routes (Wallet, My QR, Settings)

מסקנה:
משתמש אחד יכול לראות גם "Wallet" וגם "Scanner" בהתאם לשיוכים.
