# Integrations Audit and Execution Log

Last updated: 2026-03-16

## Scope
- Full integration map for mobile app + Convex backend.
- Production-readiness status (implemented, partial, missing).
- Execution backup: what was done, what remains, and external operations needed.

## Locked Decisions
- Priority order: production blockers first.
- Billing ownership model: per business.
- Settings notifications toggle: controls all push notifications.

## Execution Status Snapshot
- Phase 1: documentation baseline: `completed`.
- Phase 2: public release blockers (store/legal): `completed in code`, `pending external publishing`.
- Phase 3: auth completeness (Apple): `partially completed` (fail-fast config added), `pending env + Apple portal`.
- Phase 4: billing redesign + RevenueCat readiness: `partially completed` (business-scoped appUserId), `pending webhook lifecycle sync`.
- Phase 5: push notifications end-to-end: `completed in code`.
- Phase 6: analytics provider: `pending`.

## Integrations Map

### Convex Cloud + Auth
- Status: `live`.
- Implemented:
  - Convex auth routes and provider config.
  - OAuth redirect safety in auth callbacks.
  - Identity linking by provider and verified email.
- Gap:
  - Confirm production env contains `AUTH_APPLE_ID` and `AUTH_APPLE_SECRET`.

### Resend (Email OTP)
- Status: `live`.
- Implemented:
  - OTP generation and email send flow in Convex auth provider.
- Gap:
  - none for baseline OTP.

### RevenueCat
- Status: `partial but improved`.
- Implemented:
  - Runtime config is now env-driven (`EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED`, `EXPO_PUBLIC_MOCK_PAYMENTS`).
  - Package mapping remains env-driven (`EXPO_PUBLIC_RC_PACKAGE_*`).
  - Business upgrade flow now purchases with business-scoped RevenueCat app user id (`business:<businessId>`).
- Gap:
  - Webhook-based lifecycle sync (cancel/downgrade/refund) is still missing.
  - Final entitlement naming in dashboard must match plan inference contract.

### Push Notifications (Expo)
- Status: `implemented end-to-end in app + backend`.
- Implemented:
  - Added `expo-notifications` dependency and Expo plugin.
  - Added `PushNotificationsProvider`:
    - permission flow,
    - Expo push token retrieval,
    - token registration to Convex,
    - disable flow on toggle off.
  - Settings toggle now controls real backend token state (not local-only flag).
  - Added server mutation `disableAllMyPushTokens` for robust disable.
- Gap:
  - Production testing on physical devices + APNs/FCM credentials in EAS.

### Google Places API
- Status: `partial`.
- Implemented:
  - code paths and UI handling exist.
- Gap:
  - production `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` still needed.

### Deep Links / Universal Links / App Links
- Status: `partial`.
- Implemented:
  - app scheme and route handling.
  - `/join` landing page.
- Gap:
  - domain verification + hosted AASA/assetlinks.

### Store Fallback Links
- Status: `fixed in code`.
- Implemented:
  - `/join` now uses env-resolved store URLs:
    - `APP_STORE_URL` (or `EXPO_PUBLIC_APP_STORE_URL` fallback),
    - `PLAY_STORE_URL` (or `EXPO_PUBLIC_PLAY_STORE_URL` fallback).
  - Default Android fallback now uses correct package id (`com.stampix.stampix`).
- Gap:
  - final App Store URL must be set after listing approval.

### Legal URLs
- Status: `fixed in code`.
- Implemented:
  - removed `yourdomain.com` fallbacks.
  - legal URLs now normalize to public defaults:
    - `https://stampix.app/legal/privacy`
    - `https://stampix.app/legal/terms`
  - sign-up, paywall, and settings now open external legal URLs.
- Gap:
  - publish final legal pages and final legal text review.

### Analytics Provider
- Status: `pending`.
- Gap:
  - provider selection and real implementation (PostHog/Firebase/etc.).

## Completed Changes (This Execution)

### Push
- Added: `contexts/PushNotificationsContext.tsx`
- Updated provider tree: `app/_layout.tsx`
- Updated customer settings integration: `screens/SettingsScreen.tsx`
- Added backend helper mutation: `convex/pushNotifications.ts`
- Added Expo plugin: `app.json`
- Added dependency: `expo-notifications` in `package.json`

### Billing / RevenueCat
- Updated env-based gating and legal URL aliases: `config/appConfig.ts`
- Updated business upgrade purchase identity model: `components/subscription/UpgradeModal.tsx`
- Updated purchase API shape for scoped purchase behavior: `contexts/RevenueCatContext.tsx`

### Public release blockers
- Updated legal URL defaults and sanitization: `config/legalUrls.ts`
- Updated join landing store links to env-based values: `convex/http.ts`
- Updated user-facing legal links:
  - `app/(auth)/sign-up.tsx`
  - `app/(auth)/paywall/index.tsx`
  - `screens/SettingsScreen.tsx`

### Auth safety
- Added fail-fast auth domain resolution in Convex auth config:
  - `convex/auth.config.ts`

### Documentation updates
- `docs/README.md`
- `docs/setup.md`
- `docs/REVENUECAT_SETUP.md`
- `docs/INTEGRATIONS_AUDIT.md` (this file)

## Remaining Work (Priority Order)

### P0 - External production blockers
- Set final store listing URLs in env:
  - `APP_STORE_URL` / `PLAY_STORE_URL` (Convex env), or public fallback vars if preferred.
- Publish legal pages on public domain and legal-review final text.
- Validate deep link domain ownership files (AASA + assetlinks).

### P1 - Auth + Billing correctness
- Configure and verify Apple auth env in Convex:
  - `AUTH_APPLE_ID`
  - `AUTH_APPLE_SECRET`
- Implement RevenueCat webhook endpoint and signature verification.
- Map webhook events to `businesses` + `subscriptions` lifecycle updates.

### P1 - Push production readiness
- Configure APNs/FCM credentials in EAS.
- Test notification opt-in/out and delivery on real devices (iOS + Android).

### P2 - Observability
- Replace analytics console fallback with real provider and env-driven initialization.

## Required Environment Variables

### Public app (Expo)
- `EXPO_PUBLIC_CONVEX_URL_DEV`
- `EXPO_PUBLIC_CONVEX_URL_PROD` or `EXPO_PUBLIC_CONVEX_URL`
- `EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED`
- `EXPO_PUBLIC_MOCK_PAYMENTS`
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV`
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD`
- `EXPO_PUBLIC_RC_PACKAGE_PRO_MONTHLY`
- `EXPO_PUBLIC_RC_PACKAGE_PRO_YEARLY`
- `EXPO_PUBLIC_RC_PACKAGE_PREMIUM_MONTHLY`
- `EXPO_PUBLIC_RC_PACKAGE_PREMIUM_YEARLY`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`
- `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`

### Convex server
- `CONVEX_SITE_URL`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_APPLE_ID`
- `AUTH_APPLE_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `SCAN_TOKEN_SECRET`
- `APP_STORE_URL` (optional override for `/join`)
- `PLAY_STORE_URL` (optional override for `/join`)
- `REVENUECAT_WEBHOOK_SECRET` (when webhook is implemented)

## Verification Checklist
- `bun run check`
- `bun run type-check`
- Push test on physical device:
  - enable toggle -> token registered,
  - disable toggle -> tokens disabled,
  - send campaign push -> delivery log created.
- Billing test (dev build):
  - business upgrade triggers RevenueCat purchase with business-scoped identity,
  - Convex business subscription sync mutation updates plan/status.
