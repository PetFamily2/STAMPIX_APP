# STAMPIX Docs

## What this project is
- Single Expo/React Native app for both customers and business staff.
- RTL-first (Hebrew) UI with explicit RTL helpers.
- Convex backend for auth, realtime data, and server-side rules.
- QR-driven loyalty: customers join businesses via QR and show a customer QR to be stamped.
- RevenueCat paywall is integrated but can run in preview mode.

## Core principles
- One app, two roles: customer and business flows are isolated by routing groups and role guards.
- Server-authoritative QR: scan tokens are signed and validated on the server.
- RTL is a first-class constraint: layouts align right and do not rely on I18nManager.
- Safe defaults: payment system disabled by default; demo seed data is available.
- Minimal routing surprises: wrappers preserve legacy screen paths.

## MVP scope (current)
Customer
- Wallet with memberships (api.memberships.byCustomer) and demo seed (api.seed.seedMvp).
- Join via business QR (app/(authenticated)/join.tsx).
- Card details with customer scan token QR (app/(authenticated)/card/[membershipId].tsx).
- Tabs: Wallet, Rewards, Discovery, Settings.

Business
- Dashboard with analytics summary (api.analytics.getBusinessActivity).
- Scanner flow: resolve scan token + add stamp (api.scanner.resolveScan, api.scanner.addStamp).
- Team management: list staff and invite by email (api.business.listBusinessStaff, inviteBusinessStaff).
- Business QR for customer join (app/(authenticated)/merchant/qr.tsx).
- Merchant onboarding: create business + program (app/(authenticated)/merchant/onboarding/*).

Platform
- Expo Router with typed routes and separate tab groups for customer and business.
- Convex Auth (Password provider) and user bootstrap on first authenticated load.

## Known gaps / placeholders
- Settings items for support/legal/delete account are UI-only (onPress is empty).
- Dashboard activity feed and some CTA tiles are static placeholders.
- RevenueCat production purchases require keys and flags; preview packages are used in Expo Go or when not configured.

## Quick start
1. Install deps
   - `bun install`
2. Start Convex and create a project
   - `bunx convex dev`
   - Copy the URL in `.env` or `.env.local` to `EXPO_PUBLIC_CONVEX_URL` (see docs/setup.md)
3. Run the app
   - `bun dev`
   - Optional: `bun run ios` or `bun run android`

## Quality checks
- `bun run check` (Biome format + lint)
- `bun run type-check`

## Environment variables
App (Expo, public)
- `EXPO_PUBLIC_CONVEX_URL_DEV`
- `EXPO_PUBLIC_CONVEX_URL_PROD`
- `EXPO_PUBLIC_CONVEX_URL` (legacy fallback)
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV`
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD`
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` (legacy)
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` (legacy)
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`
- `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`

Backend (Convex)
- `SCAN_TOKEN_SECRET` (HMAC secret used to sign scan tokens)

Config flags (code)
- `config/appConfig.ts`: `PAYMENT_SYSTEM_ENABLED`, `MOCK_PAYMENTS`, `FORCE_PROD_MODE`, `APP_ENV`

## Docs map
- docs/architecture.md - system overview and data flows
- docs/decisions.md - ADRs and rationale
- docs/devlog.md - recent history and current status
- docs/setup.md - first-time setup (Hebrew)
- docs/usage.md - local usage tips (Hebrew)
- docs/deployment.md - EAS/production notes
- docs/EAS_INFRASTRUCTURE.md - ready-to-run Android/iOS EAS build and submit flow
- docs/REVENUECAT_SETUP.md - payment setup
- docs/spec/* - deeper specs (roles, data model, screens, scanner contract)
