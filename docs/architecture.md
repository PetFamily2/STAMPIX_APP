# Architecture Overview

Last synced: 2026-02-18

## System overview
- Mobile: Expo + React Native + Expo Router (typed routes).
- Backend: Convex (auth, database, mutations/queries, permissions).

## App entry and providers
- `app/_layout.tsx` composes:
  - `SafeAreaProvider`
  - `ConvexAuthProvider` (token storage via `expo-secure-store`)
  - `UserProvider`
  - `AppModeProvider`
  - `RevenueCatProvider`
- Convex URL resolution is centralized in `utils/convexConfig.ts`.

## Routing and layout
- Auth tree (`app/(auth)/*`):
  - Welcome, sign-up, sign-up-email, sign-in alias, legal, paywall,
    onboarding steps, name-capture.
- Authenticated tree (`app/(authenticated)/*`):
  - `/(customer)` tabs: wallet, rewards, discovery, settings.
  - `/(business)` tabs: dashboard, scanner, team, analytics, settings (+ qr route file).
  - Shared authenticated routes: `join`, `card/index`, `card/[membershipId]`.
  - Merchant routes: onboarding and business profile flows under `merchant/*`.

## Auth and redirect behavior
- Auth providers (`convex/auth.ts`):
  - Email OTP, Password, Google OAuth, Apple OAuth.
- `app/(auth)/_layout.tsx`:
  - Redirects authenticated users to `/(authenticated)/(customer)/wallet`.
  - Exceptions: paywall, preview/map mode, onboarding routes, name-capture.
- `app/(authenticated)/_layout.tsx`:
  - Guards unauthenticated access.
  - Loads user and appMode before routing.
  - Forces name capture when required.
  - Routes business roles to `/(authenticated)/(business)/dashboard`.
  - Routes customer role to `/(authenticated)/(customer)/wallet`.
- `/(auth)/sign-in` currently redirects to `/(auth)/sign-up` (legacy compatibility).

## Identity model and linking
- `users` row is authoritative profile + role + subscription state.
- `userIdentities` maps provider identities (`google`, `apple`, `email`) to one user.
- Linking policy:
  - direct provider match first,
  - then verified email match,
  - then create user if no match.

## Core data flows
- Join by business QR/deep link:
  - `app/(authenticated)/join.tsx` -> `api.memberships.joinByBusinessQr`.
- Customer scan token QR:
  - `app/(authenticated)/card/[membershipId].tsx` -> `api.scanner.createScanToken`.
- Business scanning flow:
  - `api.scanner.resolveScan` -> `api.scanner.addStamp`/`api.scanner.redeemReward`.
- Team management:
  - `api.business.listBusinessStaff`
  - `api.business.inviteBusinessStaff` (owner-only invite).

## Security and permissions
- Scanner operations are server-authorized in Convex guards.
- Signed scan tokens use `SCAN_TOKEN_SECRET` and replay protection via `scanTokenEvents`.
- Auth redirect URLs are validated against `CONVEX_SITE_URL` and safe app prefixes.

## Storage
- SecureStore:
  - auth tokens,
  - appMode.
- AsyncStorage:
  - pending deep-link join payload,
  - onboarding analytics/session helper state.

## Payments
- `contexts/RevenueCatContext.tsx` is the single integration point.
- If payments are disabled/not configured/Expo Go, app falls back to preview behavior.
- User subscription state is persisted in `users` (`subscriptionPlan`, `subscriptionStatus`, etc.).

## Key folders
- `app/` routing and screens
- `convex/` backend schema and server functions
- `contexts/` app-level state providers
- `lib/` domain + helpers (navigation, RTL, onboarding, deep links)
- `utils/` environment/config selectors
- `docs/` project documentation
