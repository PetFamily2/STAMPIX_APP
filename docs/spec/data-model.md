# Data Model (Convex) - MVP + Future-Ready

העיקרון:
- users = זהות (Identity)
- הרשאות ותפקידים נקבעים לפי קשרים (Relations)

---

## Core Tables (MVP)
### users
מטרה: פרטים אישיים של אדם, בלי "role" יחיד.
שדות מומלצים:
- externalId (string, future)
- fullName (optional)
- email/phone (לפי auth בפועל)
- avatarUrl (optional)
- isActive (boolean)
- createdAt, updatedAt (number)

הערה: אין כאן customer/business_owner וכו'. זה נקבע בקשרים למטה.

### businesses
מטרה: ישות עסקית.
שדות:
- ownerUserId (Id<'users'>) - בעלים ראשי (נוח ל-MVP)
- externalId (string, חובה לעתיד API)
- name, logoUrl (optional), colors (optional)
- isActive, createdAt, updatedAt

### businessStaff
מטרה: עובדים ושיוך הרשאות לעסק.
שדות:
- businessId (Id<'businesses'>)
- userId (Id<'users'>)
- staffRole ('owner' | 'staff')
- isActive
- createdAt
אינדקסים:
- by_businessId
- by_userId
- unique (businessId, userId)

### loyaltyPrograms
מטרה: תכניות ניקוב של עסק. (MVP מציג 1 אבל תשתית תומכת ברבים)
שדות:
- businessId
- title (e.g. "Coffee Club")
- rewardName (e.g. "Free Coffee")
- maxStamps (number)
- stampIcon (string)
- isActive
- createdAt, updatedAt
אינדקסים:
- by_businessId
- by_isActive

### memberships
מטרה: "הארנק" של לקוח ביחס לתכנית/עסק.
שדות:
- userId
- businessId
- programId
- currentStamps (number)
- lastStampAt (optional)
- isActive
- createdAt, updatedAt
אינדקסים:
- by_userId
- by_businessId
- by_userId_businessId
- by_userId_programId

### events (audit log)
מטרה: כל פעולה חשובה נרשמת (stamp/redeem וכו') כדי לאפשר תמיכה, תחקור, וסטטיסטיקות בעתיד.
שדות:
- type ('STAMP_ADDED' | 'REWARD_REDEEMED' | future...)
- businessId
- programId
- membershipId
- actorUserId (מי ביצע, עובד/בעלים)
- customerUserId (מי קיבל)
- metadata (optional object)
- createdAt
אינדקסים:
- by_businessId
- by_customerUserId
- by_createdAt

---

## Future Tables (Scaffold only, not MVP UI)
### campaigns
- businessId
- type ('birthday' | 'winback' | 'promo')
- rules (object)
- channels (array: 'push' | 'sms' | 'email' | 'whatsapp')
- isActive
- createdAt, updatedAt

### messageLog
- businessId
- campaignId (optional)
- toUserId
- channel
- status
- providerMessageId (optional)
- createdAt

### apiClients
- businessId
- name
- isActive
- createdAt

### apiKeys
- clientId
- hashedKey
- scopes (array)
- lastUsedAt (optional)
- createdAt

---

## MVP Clarifications
- משתמש יכול להיות גם לקוח וגם עובד וגם בעלים במקביל.
- ה-UI יקבע מה להציג לפי:
  - האם יש לו memberships פעילים (לקוח)
  - האם הוא מופיע ב-businessStaff לעסק כלשהו (עובד/בעלים)
