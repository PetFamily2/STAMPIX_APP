# STAMPIX Docs

Last synced: 2026-02-18

## What this project is
- Single Expo/React Native app for both customer and business experiences.
- RTL-first UI (Hebrew focused) with explicit RTL helpers.
- Convex backend for auth, realtime data, and server-side permissions.
- QR-based loyalty: customer join via business QR and stamp flow via signed customer QR.
- RevenueCat integration with preview-safe behavior when keys are missing.

## Current routing model (source of truth)
- Canonical route trees:
  - `app/(auth)/*`
  - `app/(authenticated)/(customer)/*`
  - `app/(authenticated)/(business)/*`
  - `app/(authenticated)/join`
  - `app/(authenticated)/card/*`
  - `app/(authenticated)/merchant/*`
- `/(auth)/sign-in` is a legacy alias and currently redirects to `/(auth)/sign-up`.
- No legacy wrapper route tree under `app/(authenticated)/business/*` or `app/(authenticated)/(business)/business/*`.

## Core product scope (current)
- Customer:
  - Wallet, rewards, discovery, settings tabs.
  - Join business by QR/deep link.
  - Membership card with signed scan-token QR.
- Business:
  - Dashboard, scanner, team, analytics, settings tabs.
  - Business QR screen.
  - Merchant onboarding (create business + create program + preview card).
- Platform:
  - Convex Auth (Email OTP, Password, Google, Apple).
  - Identity linking via provider IDs and verified email.
  - Role-aware routing and name-capture onboarding gate.

## Environment variables
Public app vars (Expo):
- Convex:
  - `EXPO_PUBLIC_CONVEX_URL_DEV`
  - `EXPO_PUBLIC_CONVEX_URL_PROD`
  - `EXPO_PUBLIC_CONVEX_URL` (legacy fallback)
- RevenueCat:
  - `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV`
  - `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD`
  - `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` (legacy fallback)
  - `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV`
  - `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD`
  - `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` (legacy fallback)
- Legal URLs:
  - `EXPO_PUBLIC_PRIVACY_POLICY_URL`
  - `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`

Convex server vars:
- `SCAN_TOKEN_SECRET`
- `RESEND_API_KEY` (for email OTP)
- `RESEND_FROM_EMAIL` (for email OTP)
- `CONVEX_SITE_URL` (auth redirect safety)

## Quick start
1. Install dependencies:
   - `bun install`
2. Start Convex local dev:
   - `bunx convex dev`
3. Run app:
   - `bun dev`
4. Optional native runs:
   - `bun run ios`
   - `bun run android`

## Quality checks
- `bun run check`
- `bun run type-check`

## Docs map
- `docs/architecture.md` - runtime architecture and routing behavior
- `docs/decisions.md` - architectural decisions (ADRs)
- `docs/devlog.md` - delivery history
- `docs/setup.md` - local setup
- `docs/usage.md` - daily usage workflow
- `docs/deployment.md` - deployment flow
- `docs/EAS_INFRASTRUCTURE.md` - EAS commands and environment
- `docs/REVENUECAT_SETUP.md` - RevenueCat setup details
- `docs/AUTH_LINKING_QA_CHECKLIST.md` - auth-linking QA scenarios
- `docs/spec/*` - functional specs
