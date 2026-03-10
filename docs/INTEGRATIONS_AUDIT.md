# Integrations Audit

Last audited: 2026-03-10

## Scope
- Full application mapping across mobile app, Convex backend, routing, onboarding, billing, QR flows, and external services.
- Local repository inspection plus limited runtime configuration checks.
- Focus: what is integrated, what is partially integrated, and what is still missing for production readiness.

## Executive Summary
- Core architecture is in place and coherent: Expo app, Convex backend, role-aware routing, QR loyalty flows, business entitlements, and onboarding.
- The app is functional as a product skeleton, but several external integrations are still partial or fail-safe only.
- Main production blockers are:
  - RevenueCat is implemented but intentionally disabled.
  - Push notifications have backend support but no client-side registration flow.
  - Apple Sign-In appears supported in code but was not confirmed in backend environment configuration.
  - Legal/public URLs and store fallback links still contain placeholders.
  - Google Places depends on a public API key that is not present locally.
  - Analytics is instrumented in code but still routes to console fallback.

## System Map

### App Shell
- Root providers are composed in `app/_layout.tsx`.
- App state is centered around:
  - Convex auth/session
  - user/session context
  - active business context
  - app mode context
  - onboarding context
  - RevenueCat context

### Route Trees
- Auth routes: `app/(auth)/*`
- Customer routes: `app/(authenticated)/(customer)/*`
- Business routes: `app/(authenticated)/(business)/*`
- Shared authenticated routes:
  - `app/(authenticated)/join`
  - `app/(authenticated)/card/*`
  - `app/(authenticated)/accept-invite`
- Merchant/onboarding routes: `app/(authenticated)/merchant/*`

### Core Product Flows
- Auth:
  - Email OTP
  - Google OAuth
  - Apple OAuth
  - name-capture gate
- Customer:
  - wallet
  - rewards/inbox
  - discovery by location
  - join business by QR / deep link / join code
  - personal signed QR for scan/stamp
- Business:
  - dashboard
  - scanner
  - team invites
  - analytics
  - subscription gating
  - business QR/deep link generation
- Backend:
  - Convex schema, queries, mutations, auth routes, HTTP join landing page

## External Integrations Inventory

### 1) Convex Cloud
- Status: live
- Purpose:
  - database
  - auth
  - backend mutations/queries
  - HTTP routes
- Code:
  - `app/_layout.tsx`
  - `utils/convexConfig.ts`
  - `convex/*`
- Required config:
  - `EXPO_PUBLIC_CONVEX_URL_DEV`
  - `EXPO_PUBLIC_CONVEX_URL_PROD`
  - or legacy `EXPO_PUBLIC_CONVEX_URL`
- Current findings:
  - Local `.env.local` contains dev and legacy Convex URL values.
  - Local env does not contain `EXPO_PUBLIC_CONVEX_URL_PROD`.
- Gap:
  - Production URL should be explicitly set and verified in EAS/public env.

### 2) Convex Auth
- Status: live
- Providers implemented:
  - Email OTP
  - Password
  - Google OAuth
  - Apple OAuth
- Code:
  - `convex/auth.ts`
  - `convex/auth.config.ts`
  - `app/(auth)/sign-up.tsx`
  - `app/(auth)/sign-up-email.tsx`
  - `app/(auth)/onboarding-client-otp.tsx`
  - `lib/auth/googleOAuth.ts`
- Current findings:
  - Google OAuth is configured in backend environment.
  - Email OTP dependencies are configured in backend environment.
  - Apple OAuth support exists in code but was not confirmed in backend environment.
- Gaps:
  - Confirm and configure `AUTH_APPLE_ID` and `AUTH_APPLE_SECRET`.
  - Confirm `CONVEX_SITE_URL` is used instead of relying only on `SITE_URL`.

### 3) Resend
- Status: live for email OTP path
- Purpose:
  - send OTP emails
- Code:
  - `convex/auth.ts`
  - `app/(auth)/sign-up-email.tsx`
  - `app/(auth)/onboarding-client-otp.tsx`
- Current findings:
  - Backend environment contains Resend variables.
- Gaps:
  - None for baseline OTP flow.
  - Optional cleanup: `convex/otp.ts` appears to be a parallel OTP implementation not used by the main auth flow.

### 4) RevenueCat
- Status: partial, disabled in runtime
- Purpose:
  - paid plans
  - purchases
  - restore purchases
  - customer center
- Code:
  - `contexts/RevenueCatContext.tsx`
  - `utils/revenueCatConfig.ts`
  - `app/(auth)/paywall/index.tsx`
  - `components/subscription/UpgradeModal.tsx`
  - `config/appConfig.ts`
- Current findings:
  - Integration code exists and is centralized.
  - App intentionally falls back to preview mode when billing is disabled, keys are missing, or app runs in Expo Go.
  - `PAYMENT_SYSTEM_ENABLED` is currently `false`.
  - Package mapping depends on:
    - `EXPO_PUBLIC_RC_PACKAGE_PRO_MONTHLY`
    - `EXPO_PUBLIC_RC_PACKAGE_PRO_YEARLY`
    - `EXPO_PUBLIC_RC_PACKAGE_PREMIUM_MONTHLY`
    - `EXPO_PUBLIC_RC_PACKAGE_PREMIUM_YEARLY`
  - These package mapping vars are used by code but are not documented in setup docs.
  - Paywall code hardcodes `requiredEntitlementIdentifier: 'stampix_pro'`.
  - Subscription plan inference depends on entitlement ids containing `pro` or `premium`.
- Gaps:
  - Enable billing intentionally in `config/appConfig.ts`.
  - Add RevenueCat public API keys for both platforms and environments.
  - Add package mapping env vars and document them.
  - Verify entitlement naming matches code expectations.
  - Implement webhook or server-side sync path if external subscription state must stay authoritative.
  - Implement cancellation/downgrade sync; a TODO already exists in `convex/users.ts`.

### 5) Google Places API
- Status: partial
- Purpose:
  - address autocomplete
  - place details
  - business address entry
- Code:
  - `lib/googlePlaces.ts`
  - `hooks/useGooglePlaceAutocomplete.ts`
  - `app/(authenticated)/merchant/onboarding/create-business.tsx`
  - `app/(authenticated)/(business)/settings-business-address.tsx`
- Required config:
  - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
- Current findings:
  - The UI already detects and reports missing key state.
  - Local env does not contain the key.
- Gap:
  - Add valid Google Maps/Places key with the correct API restrictions.

### 6) Expo Location
- Status: live
- Purpose:
  - nearby business discovery
- Code:
  - `hooks/useCurrentLocation.ts`
  - `app/(authenticated)/(customer)/discovery.tsx`
- Current findings:
  - Permission handling exists.
  - Discovery flow queries nearby businesses only after coordinates are resolved.
- Gap:
  - No major code gap for baseline usage.

### 7) Expo Camera
- Status: live
- Purpose:
  - QR scanning for join flow and business scanner flow
- Code:
  - `components/QrScanner.tsx`
  - `app/(authenticated)/join.tsx`
  - `app/(authenticated)/(business)/scanner.tsx`
- Current findings:
  - Permission request flow exists.
  - Android camera permission is declared in `app.json`.
- Gap:
  - No major integration gap for baseline scanning.

### 8) Signed QR Scan Tokens
- Status: live
- Purpose:
  - protect customer QR payloads
  - prevent forgery and replay
- Code:
  - `convex/scanner.ts`
  - `convex/scanTokens.ts`
  - `app/(authenticated)/card/[membershipId].tsx`
  - `app/(authenticated)/(customer)/show-qr.tsx`
- Required config:
  - `SCAN_TOKEN_SECRET`
- Current findings:
  - Backend environment contains the secret.
  - Replay protection is implemented through `scanTokenEvents`.
- Gap:
  - No major gap for baseline production use.

### 9) Deep Links / Universal Links / App Links
- Status: partial
- Purpose:
  - open app from business join QR
  - defer join flow across authentication
- Code:
  - `app.json`
  - `app/(authenticated)/_layout.tsx`
  - `app/(authenticated)/join.tsx`
  - `lib/deeplink/pendingJoin.ts`
  - `convex/http.ts`
- Current findings:
  - App scheme exists: `stampix`
  - iOS associated domain exists: `applinks:stampix.app`
  - Android intent filter exists for `https://stampix.app/join`
  - Deferred join storage is implemented.
  - Convex HTTP landing page exists for `/join`.
- Gaps:
  - Verify domain ownership and deployment for universal link files:
    - Apple App Site Association
    - Android Asset Links
  - Verify `stampix.app` actually routes to the Convex or hosting endpoint serving `/join`.

### 10) Store Fallback Links
- Status: broken/incomplete
- Purpose:
  - open app store pages from landing page fallback
- Code:
  - `convex/http.ts`
- Current findings:
  - App Store URL uses placeholder id.
  - Google Play URL uses `com.stampix.app`.
  - Actual Android package in `app.json` is `com.stampix.stampix`.
- Gap:
  - Replace both store URLs with real production store listings.

### 11) Expo Push Notifications
- Status: backend only, client integration missing
- Purpose:
  - push campaigns
  - retention notifications
  - message delivery logging
- Code:
  - `convex/pushNotifications.ts`
  - `convex/retention.ts`
  - `convex/campaigns.ts`
  - `screens/SettingsScreen.tsx`
- Current findings:
  - Backend can store tokens, disable tokens, send pushes through Expo Push API, and log delivery.
  - Customer rewards/inbox uses in-app messages through Convex query flow.
  - No client-side notification library usage was found.
  - No permission request, token retrieval, or mutation call to `registerPushToken` was found.
  - Settings toggle only persists a local boolean in `AsyncStorage`.
- Gaps:
  - Add `expo-notifications`.
  - Request OS notification permissions.
  - Fetch Expo push token.
  - Register and disable tokens via Convex mutations.
  - Decide how in-app toggle maps to actual token registration and marketing consent.

### 12) Analytics Provider
- Status: instrumented, provider not connected
- Purpose:
  - onboarding analytics
  - join/scanner analytics
  - paywall analytics
- Code:
  - `lib/analytics/index.ts`
  - `lib/onboarding/useOnboardingTracking.ts`
  - multiple app screens
- Current findings:
  - Analytics calls are widespread.
  - Provider resolution supports `console`, `posthog`, and `firebase`.
  - PostHog and Firebase implementations are placeholders that fall back to console.
- Gaps:
  - Choose and implement a real analytics provider.
  - Add provider-specific keys and initialization.
  - Remove production reliance on console logging.

### 13) Legal Documents / Public URLs
- Status: incomplete
- Purpose:
  - privacy policy
  - terms of service
  - review-safe legal surface
- Code:
  - `config/legalUrls.ts`
  - `config/appConfig.ts`
  - `app/(auth)/legal.tsx`
  - `components/WebViewModal.tsx`
- Current findings:
  - Public URL config exists but falls back to placeholder domains.
  - WebView modal exists but is not wired into a real legal document flow.
  - The legal screen itself is a long placeholder text with missing fields.
- Gaps:
  - Replace placeholder legal text with final reviewed content.
  - Publish privacy policy and terms at real public URLs.
  - Remove `yourdomain.com` placeholders from config.

### 14) Expo EAS / OTA Updates
- Status: configured
- Code:
  - `app.json`
  - `eas.json`
  - `scripts/eas-run.ps1`
- Current findings:
  - EAS project id, owner, channels, and runtime version are configured.
  - OTA updates are enabled through Expo Updates.
  - Local wrapper script for EAS may fail on Windows if a bundled Node runtime file is locked.
- Gaps:
  - Verify production EAS environment variables/secrets outside the repo.
  - Resolve or simplify the Windows helper flow if it becomes operationally noisy.

## Environment Variables Map

### Public App Variables
- Convex:
  - `EXPO_PUBLIC_CONVEX_URL_DEV`
  - `EXPO_PUBLIC_CONVEX_URL_PROD`
  - `EXPO_PUBLIC_CONVEX_URL`
- RevenueCat API keys:
  - `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV`
  - `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD`
  - `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`
  - `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV`
  - `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD`
  - `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`
- RevenueCat package mapping:
  - `EXPO_PUBLIC_RC_PACKAGE_PRO_MONTHLY`
  - `EXPO_PUBLIC_RC_PACKAGE_PRO_YEARLY`
  - `EXPO_PUBLIC_RC_PACKAGE_PREMIUM_MONTHLY`
  - `EXPO_PUBLIC_RC_PACKAGE_PREMIUM_YEARLY`
- Google Places:
  - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
- Legal/public pages:
  - `EXPO_PUBLIC_PRIVACY_POLICY_URL`
  - `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`
- Analytics:
  - `EXPO_PUBLIC_ANALYTICS_PROVIDER`

### Convex Server Variables
- Auth:
  - `AUTH_GOOGLE_ID`
  - `AUTH_GOOGLE_SECRET`
  - `AUTH_APPLE_ID`
  - `AUTH_APPLE_SECRET`
  - `CONVEX_SITE_URL`
  - `SITE_URL`
- Email:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
- QR signing:
  - `SCAN_TOKEN_SECRET`
- RevenueCat optional:
  - `REVENUECAT_WEBHOOK_SECRET`

## Production Readiness Gaps by Priority

### Critical
- RevenueCat is still disabled by app flag.
- Push notifications are not connected on the client.
- Store fallback links are incorrect.
- Legal/public policy surfaces are still placeholder-based.

### High
- Apple Sign-In backend configuration is unconfirmed and likely missing.
- Google Places key is missing locally.
- RevenueCat package mapping and entitlement contract are under-documented.
- No external cancellation/webhook sync exists for subscription lifecycle.

### Medium
- Analytics provider is still console fallback.
- `convex/otp.ts` looks redundant relative to the active auth flow.
- EAS audit was only partially validated from the local machine.

## Notes From Configuration Checks
- Local `.env.local` contains Convex URL values only.
- Backend environment inspection confirmed:
  - Google OAuth present
  - Resend present
  - scan token secret present
- Backend environment inspection did not confirm Apple OAuth variables.
- EAS environment audit could not be completed from the local wrapper flow; direct CLI output was incomplete.

## Recommended Next Workstreams
- Workstream A: production billing readiness
  - enable RevenueCat intentionally
  - add package mappings
  - verify entitlements
  - add webhook/sync strategy
- Workstream B: notification readiness
  - add client notification permissions and token registration
  - connect settings toggle to real notification state
- Workstream C: public release hygiene
  - fix store links
  - publish legal URLs
  - verify universal link hosting
- Workstream D: auth/provider completeness
  - finish Apple Sign-In setup
- Workstream E: observability
  - connect a real analytics provider

