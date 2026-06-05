# Architecture Overview

Last synced: 2026-06-05

This is the canonical architecture document. The older `docs/spec/architecture.md` content was merged here and the original file was archived at `docs/archive/merged/spec-architecture.md`.

## System overview
- Mobile app: Expo + React Native + Expo Router with typed routes.
- Backend: Convex for auth, database, server functions, permissions, and realtime data.
- Billing: RevenueCat through one app-level context.
- UI direction: RTL-first, Hebrew-focused screens with explicit RTL helpers.

## Layering
1. UI layer: Expo Router screens in `app/*`.
2. App orchestration: providers, contexts, hooks, and local persistence.
3. Backend domain rules: Convex queries, mutations, actions, guards, and migrations.
4. Data schema: `convex/schema.ts`.

Client code can choose screens and local state transitions. Convex remains the authority for permissions, scanner token validation, account linking, writes, and business rules.

## App entry and providers
`app/_layout.tsx` composes the root app shell:
- `SafeAreaProvider`
- `ConvexAuthProvider` with token storage through `expo-secure-store`
- `UserProvider`
- `PushNotificationsProvider`
- `ActiveBusinessProvider`
- `AppModeProvider`
- `OnboardingProvider`
- `RevenueCatProvider`
- root error boundary and route slot

Convex URL resolution is centralized in `utils/convexConfig.ts`.

## Routing model
The generated route source of truth is `docs/routes.md`.

Current route groups:
- `app/(auth)/*` for pre-auth, onboarding, legal, paywall, and auth callback routes.
- `app/(authenticated)/(customer)/*` for customer wallet, discovery, rewards, QR, referrals, account, support, and customer card flows.
- `app/(authenticated)/(business)/*` for business dashboard, scanner, analytics, customers, campaigns, programs/cards, team, QR, and business settings.
- `app/(authenticated)/(staff)/*` for staff scanner, customers, promotions, and settings.
- `app/(authenticated)/admin/*` for admin-only surfaces.
- `app/(authenticated)/merchant/*` for merchant alias and onboarding routes.
- Shared authenticated routes include join, accept-invite, and card routes.

## Auth and redirect behavior
Convex Auth providers are configured in `convex/auth.ts` and `convex/auth.config.ts`:
- Email OTP
- Password
- Google OAuth
- Apple OAuth

`app/(auth)/_layout.tsx` controls pre-auth route behavior and redirects authenticated users out of the auth tree except for explicit preview, onboarding, callback, paywall, and name-capture cases.

`app/(authenticated)/_layout.tsx` protects authenticated routes, loads user/session context, coordinates app mode and active business state, preserves join/card flows, and redirects users to the correct customer, business, staff, onboarding, or name-capture destination.

`/(auth)/sign-in` remains a legacy alias redirect to `/(auth)/sign-up`.

## Identity model and linking
- `users` is the authoritative application profile and stores app-level state.
- `userIdentities` maps provider identities (`google`, `apple`, `email`) to one user.
- Linking order is provider id match first, verified email match second, create user only if no safe match exists.
- Deprecated user fields may remain in schema for migration compatibility, but current onboarding should prefer timestamp/state fields where available.

## Role and business access model
There are two related signals:
- `users.role` as an app-level role hint.
- `businessStaff` as the business-specific authorization source.

Business and staff route access depends on the active business shell, active staff membership, onboarding state, and app mode. Server-side Convex guards remain the security boundary for mutations.

## Core data flows
Join by business QR/deep link:
- `app/(authenticated)/join.tsx`
- Convex membership join functions

Customer scan token QR:
- customer card routes
- scanner token creation and validation

Business/staff scanner:
- resolve scan
- validate signed token, expiry, replay, business, program, and staff authorization
- add stamp or redeem reward
- write audit events and scanner tracking rows

Team/invite:
- business staff listing and invite mutations
- invite acceptance route
- staff shell routing after active business resolution

Campaigns, referrals, recommendations, push, and support now have active schema and route surfaces; see `docs/routes.md`, `docs/spec/data-model.md`, and `convex/README.md` for the current references.

## Security and permissions
- Scanner operations are server-authorized in Convex guards.
- Signed scan tokens use `SCAN_TOKEN_SECRET` and replay protection tables.
- OAuth redirect URLs are validated against `CONVEX_SITE_URL` and safe app prefixes.
- Sensitive values should not be stored in AsyncStorage.
- SecureStore is used for auth token storage and app mode persistence.

## Persistence
SecureStore:
- Convex auth token storage
- app mode persistence

AsyncStorage:
- pending deep-link join payload
- onboarding and activation helper state

## Payments
- `contexts/RevenueCatContext.tsx` is the single runtime integration point for package loading, purchase, restore, and subscription sync.
- If payments are disabled, unconfigured, or running in Expo Go, the app falls back to preview behavior.
- RevenueCat configuration is documented in `docs/REVENUECAT_SETUP.md`.

## Non-goals for this document
- Detailed EAS deployment steps: use `docs/deployment.md`.
- Full billing setup: use `docs/REVENUECAT_SETUP.md`.
- Exhaustive route listing: use `docs/routes.md`.
- Historical generated architecture snapshots: see `docs/archive/route-snapshots/ARCHITECTURAL_MAP.md`.

## Key folders
- `app/` routing and screens
- `components/` reusable UI
- `contexts/` app-level state providers
- `convex/` backend schema, auth, server functions, and migrations
- `hooks/` app hooks
- `lib/` domain helpers, navigation, RTL, onboarding, and deep links
- `utils/` environment and config selectors
- `docs/` active project documentation
- `docs/archive/` historical documentation and build logs
