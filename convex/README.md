# Convex Backend Notes

Last synced: 2026-02-18

This folder contains the backend schema and server functions for STAMPAIX.

## Main files
- `schema.ts` - full data model
- `auth.ts` - Convex Auth providers + identity linking
- `users.ts` - profile/name/subscription/account actions
- `business.ts` - business creation, staff listing, invite flow
- `memberships.ts` - join and membership operations
- `scanner.ts` - scan resolve/stamp/redeem flow
- `guards.ts` - auth and role/business permission guards

## Auth model
Providers configured in `auth.ts`:
- Email OTP
- Password
- Google
- Apple

Identity linking table:
- `userIdentities`

Linking order:
1. provider + providerUserId
2. verified email match
3. create new user

## Scanner/security model
- Customer QR is a signed scan token.
- `resolveScan` validates signature, expiry, and replay.
- `addStamp` and `redeemReward` require active staff membership.

## Required environment variables (Convex side)
- `SCAN_TOKEN_SECRET`
- `CONVEX_SITE_URL`
- `RESEND_API_KEY` (for email OTP)
- `RESEND_FROM_EMAIL` (for email OTP)

## Local workflow
From project root:
```bash
bunx convex dev
```

Deploy backend functions/schema:
```bash
bunx convex deploy
```
