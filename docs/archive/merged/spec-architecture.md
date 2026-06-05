# STAMPAIX - Architecture Spec

Last synced: 2026-02-18

## Goal
Ship a reliable mobile MVP while keeping room for growth in:
- multi-provider auth
- role-aware routing
- business staffing
- subscription/paywall control
- audit-friendly scanner flows

## Layering
1. UI layer (Expo Router screens in `app/*`)
2. App service layer (contexts + hooks orchestration)
3. Backend domain rules (Convex functions in `convex/*`)
4. Data schema layer (`convex/schema.ts`)

## Runtime boundaries
- Client decides view/state transitions.
- Convex enforces permissions, role rules, and write integrity.
- Sensitive decisions (scanner authorization, token validation, account linking) stay server-side.

## Routing architecture
- `app/(auth)/_layout.tsx` handles pre-auth redirects with explicit allow-list exceptions.
- `app/(authenticated)/_layout.tsx` is the authenticated gate:
  - auth check
  - user bootstrap/read
  - onboarding/name capture guard
  - role/appMode-aware destination routing
- Tab trees are split:
  - `app/(authenticated)/(customer)`
  - `app/(authenticated)/(business)`

## Auth architecture
- Convex Auth providers:
  - Email OTP
  - Password
  - Google
  - Apple
- Identity linking strategy:
  - provider+providerUserId match first,
  - verified-email match second,
  - create new user otherwise.
- Mapping table: `userIdentities`.

## Scanner architecture
- Customer card generates signed scan token.
- Business scanner resolves token server-side.
- Server checks:
  - signature
  - expiry
  - replay prevention
  - business staff authorization
- Mutations write audit events into `events` and usage records into `scanTokenEvents`.

## Payments architecture
- `RevenueCatContext` is the single integration point for package fetch, purchase, restore, and sync.
- Fail-safe behavior:
  - preview in Expo Go
  - preview when keys missing
  - production flow only when explicitly enabled via flags and keys.

## Persistence
- SecureStore:
  - auth token storage (Convex auth provider)
  - appMode persistence
- AsyncStorage:
  - pending join deep-link payload
  - onboarding/activation helper state

## Non-goals in current MVP
- Dedicated admin route tree/UI
- Full campaign orchestration UI
- Full enterprise API management UI
