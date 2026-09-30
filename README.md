# StampAix App

Last synced: 2026-02-18

StampAix is an Expo + React Native + Convex mobile app for customer loyalty and business scanner workflows.

## Launch billing
Native iOS and Android are a consumption and companion app. They show the current plan, status, usage, and which plan includes a locked capability. They do not sell subscriptions.
Business Web purchases and manages subscriptions through SUMIT at `/business/billing`.
Convex is the entitlement authority.
RevenueCat remains dormant rollback infrastructure. Setup notes stay in `docs/REVENUECAT_SETUP.md`.

## Stack
- Expo Router
- Convex (database + auth + server logic)
- SUMIT on Business Web for subscription purchase
- RevenueCat dormant rollback only
- RTL-first UI (Hebrew-focused)

## Quick start
1. Install dependencies:
```bash
bun install
```
2. Start Convex:
```bash
bunx convex dev
```
3. Run app:
```bash
bun dev
```

## Canonical routes
- Auth: `app/(auth)/*`
- Customer tabs: `app/(authenticated)/(customer)/*`
- Business tabs: `app/(authenticated)/(business)/*`
- Shared authenticated: `app/(authenticated)/join`, `app/(authenticated)/card/*`
- Merchant flows: `app/(authenticated)/merchant/*`

Notes:
- `/(auth)/index` redirects to `/(auth)/welcome`.
- `/(auth)/sign-in` redirects to `/(auth)/sign-up` (legacy alias).

## Environment variables
Recommended Convex variables:
- `EXPO_PUBLIC_CONVEX_URL_DEV`
- `EXPO_PUBLIC_CONVEX_URL_PROD`

Development-only compatibility Convex variable:
- `EXPO_PUBLIC_CONVEX_URL`

RevenueCat rollback variables:
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV`
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD`
- development-only compatibility values:
  - `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`
  - `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`

## Checks
```bash
bun run check
bun run type-check
```

## Documentation
- `docs/README.md`
- `docs/setup.md`
- `docs/architecture.md`
- `docs/routes.md`
- `docs/deployment.md`
- `docs/REVENUECAT_SETUP.md`
- `docs/AUTH_LINKING_QA_CHECKLIST.md`
- `docs/spec/*`
