# Architecture Overview

## System overview
- Mobile client: Expo + React Native + Expo Router (typed routes).
- Backend: Convex (database, server functions, auth).

## App entry and providers
- app/_layout.tsx: SafeAreaProvider, ConvexAuthProvider (SecureStore), UserProvider, AppModeProvider, RevenueCatProvider.
- Convex URL is selected via utils/convexConfig.ts based on APP_ENV.

## Routing and layout
- app/(auth)/: sign-in, sign-up, onboarding steps, paywall.
- app/(authenticated)/: root Stack for logged-in users.
  - app/(authenticated)/(customer)/: Tabs (wallet, rewards, discovery, settings).
  - app/(authenticated)/(business)/: Tabs that point to business/* wrappers.
  - app/(authenticated)/join: QR join flow.
  - app/(authenticated)/card/*: card details and preview.
- app/(authenticated)/(business)/business/*: wrapper files that re-export legacy screens in app/(authenticated)/business/* so tab routes stay valid.
- app/(authenticated)/merchant/*: business onboarding, profile, QR (role-guarded).

## Auth and role guard flow
- Convex Auth in convex/auth.ts with Password provider.
- app/(auth)/_layout.tsx redirects authenticated users into /(authenticated), except preview/paywall.
- app/(authenticated)/_layout.tsx bootstraps a user record via api.auth.createOrUpdateUser and then redirects by appMode.
- contexts/UserContext.tsx queries api.users.getCurrentUser.
- lib/hooks/useRoleGuard.ts and business/_layout.tsx enforce business-only access.

## Core data flows
- Customer wallet: api.memberships.byCustomer -> list memberships.
- Demo seed: api.seed.seedMvp -> create demo business/program/membership.
- Join by business QR: app/(authenticated)/join.tsx -> api.memberships.joinByBusinessQr.
- Customer scan token: app/(authenticated)/card/[membershipId].tsx -> api.scanner.createScanToken -> QR.
- Business scanner: app/(authenticated)/business/scanner.tsx -> api.scanner.resolveScan + api.scanner.addStamp.
  - api.scanner.redeemReward exists but is not used by the UI yet.
- Business analytics: api.analytics.getBusinessActivity -> aggregates events for dashboards.
- Staff management: api.business.listBusinessStaff and api.business.inviteBusinessStaff.

## Data model
Core tables in convex/schema.ts:
- users, businesses, businessStaff, loyaltyPrograms, memberships
- events (stamp/redeem audit)
- scanTokenEvents (anti-replay for scan tokens)
See docs/spec/data-model.md for full field details.

## Payments
- RevenueCatContext provides packages and purchase/restore helpers.
- Uses preview packages in Expo Go or when keys are missing.
- User subscription state is stored in users (subscriptionPlan, subscriptionStatus).

## RTL strategy
- app.json enables Expo Localization RTL support.
- lib/rtl.ts provides explicit helpers and Tailwind class helpers for RTL layout.
- UI components use text-right or RTL-aware helpers; do not rely on I18nManager in Expo Go.

## Storage and secrets
- Auth tokens stored via expo-secure-store (ConvexAuthProvider storage).
- AppMode stored in SecureStore (contexts/AppModeContext.tsx).
- Remembered email uses AsyncStorage (sign-in only).
- SCAN_TOKEN_SECRET is required in Convex environment for signed QR tokens.

## Folder map (high level)
- app/: Expo Router screens and layouts
- convex/: backend schema + server functions
- contexts/: global state (AppMode, User, RevenueCat, Onboarding)
- components/: shared UI and utilities (QrScanner, etc.)
- config/: app-level flags and legal URLs
- lib/: domain types and helpers (rtl, navigation)
- utils/: env config helpers
- docs/: project documentation
- reference-ui/: design reference assets (not runtime)
- scripts/: one-off patch helpers for seed/demo data
