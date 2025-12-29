# STAMPIX - Architecture (MVP + Future-Ready)

## Goal
Build an MVP fast, but keep foundations for:
- multi-business, multi-staff
- auditability (events)
- API integrations for large companies (clients/keys, external IDs)
- future messaging/campaigns without changing core tables

---

## Layers
1) UI (Expo Router screens)
2) Application Services (orchestrate use-cases)
3) Domain (entities + rules, no IO)
4) Data (Convex queries/mutations, adapters)

---

## Identity strategy (important for enterprise/API)
We separate:
- internal ids: Convex `_id` values (Id<'table'>)
- external ids: stable strings for integrations (e.g. `externalId`, `qrCodeData`)

Rules:
- every Business has `externalId`
- every User has `externalId` (optional in MVP, but scaffold)
- integrations should reference externalId, not Convex _id

---

## Core concepts (MVP)
- User (customer / business_owner / business_staff / admin_support)
- Business
- LoyaltyProgram (a business can have many; MVP UI exposes 1)
- Membership (user wallet per business/program)
- Event log (audit): every stamp/redeem writes an event

---

## Future concepts (scaffold only)
- Campaigns (birthday, winback, promotions)
- MessageLog (track deliveries, channels)
- API Clients + API Keys (B2B integrations)
- POS integration mapping tables

---

## Permissions & role gating
Role gating happens in router layer and in Convex functions:
- customer: wallet, profile
- business_owner: scanner, program settings
- business_staff: scanner only
- admin_support: cross-business support + analytics (future)


---

## Scanner Permissions (MVP decision)
- Scanner actions (add stamp, redeem) זמינות ל:
  - business_owner
  - business_staff
- אין הבחנה בהרשאות סריקה בין owner ל-staff.
- האכיפה מתבצעת בצד השרת (Convex) לפי קיום businessStaff פעיל.
- כל פעולה נרשמת בטבלת events עם actorUserId לצורכי audit ותמיכה.

הערה:
הפרדה עתידית (למשל staff בלי redeem) תתבצע רק אם תהיה דרישה עסקית אמיתית, ולא ב-MVP.
