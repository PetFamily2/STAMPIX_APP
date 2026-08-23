# Setup Guide

Last synced: 2026-06-05

This is the canonical local setup and daily development guide. The older `docs/usage.md` content was merged here and the original file was archived at `docs/archive/merged/usage.md`.

## Prerequisites
- Node.js LTS
- Bun
- Expo Go for JS-only preview, or a native simulator/emulator/development build for native modules
- Convex account
- Expo account if you need EAS builds

## 1) Install dependencies
```bash
bun install
```

## 2) Start Convex
```bash
bunx convex dev
```

Run this in its own terminal during local development.

## 3) Configure environment variables
Create `.env.local` or `.env`.

Recommended Convex variables:
```env
EXPO_PUBLIC_CONVEX_URL_DEV="https://your-dev.convex.cloud"
EXPO_PUBLIC_CONVEX_URL_PROD="https://your-prod.convex.cloud"
```

Development-only compatibility fallback:
```env
EXPO_PUBLIC_CONVEX_URL="https://your-convex.convex.cloud"
```

Production builds require `EXPO_PUBLIC_CONVEX_URL_PROD` and never use the
compatibility fallback.

Optional RevenueCat variables:
```env
EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED="true"
EXPO_PUBLIC_MOCK_PAYMENTS="false"
EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV="appl_..."
EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD="appl_..."
EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV="goog_..."
EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD="goog_..."
EXPO_PUBLIC_RC_PACKAGE_PRO_MONTHLY="pro_monthly"
EXPO_PUBLIC_RC_PACKAGE_PRO_YEARLY="pro_yearly"
EXPO_PUBLIC_RC_PACKAGE_PREMIUM_MONTHLY="premium_monthly"
EXPO_PUBLIC_RC_PACKAGE_PREMIUM_YEARLY="premium_yearly"
```

RevenueCat setup details live in `docs/REVENUECAT_SETUP.md`, which is the source of truth for billing configuration.

Optional legal and public integration variables:
```env
EXPO_PUBLIC_PRIVACY_POLICY_URL="https://stampaix.app/legal/privacy"
EXPO_PUBLIC_TERMS_OF_SERVICE_URL="https://stampaix.app/legal/terms"
```

Native Google Maps keys are build-time EAS values, not runtime client values:
- `GOOGLE_MAPS_ANDROID_API_KEY`
- `GOOGLE_MAPS_IOS_API_KEY` only if iOS is changed to use Google Maps as the
  map provider.

Google Places search runs through Convex Actions. Configure
`GOOGLE_PLACES_API_KEY` separately in each Convex deployment environment.

Convex server variables:
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- `AUTH_APPLE_ID`, `AUTH_APPLE_SECRET`
- `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY` (base64/base64url encoding of exactly 32 random bytes)
- `STAMPAIX_ENV` (`development`, `preview`, or `production`; server-only)
- `CONVEX_SITE_URL`
- `SCAN_TOKEN_SECRET`
- `GOOGLE_PLACES_API_KEY`
- `APP_STORE_URL`
- `PLAY_STORE_URL`
- `REVENUECAT_WEBHOOK_SECRET` when the webhook is enabled
- `SUPPORT_EMAIL` for the public account-deletion page support contact (server-only)

Keep `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY` server-only. Do not expose it through
an `EXPO_PUBLIC_` variable. `AUTH_LOG_LEVEL=DEBUG` is allowed only when the
server-side `STAMPAIX_ENV` is explicitly `development`; missing, preview,
production, and unknown markers reject DEBUG.

The external Google Play account-deletion resource is served by the Convex HTTP
site at `/account-deletion`. Set `SUPPORT_EMAIL` separately in every deployed
Convex environment where a support contact should appear. The value must be a
valid monitored mailbox and must not use the `EXPO_PUBLIC_` prefix.

## 4) Run the app
Start two terminals.

Terminal A:
```bash
bunx convex dev
```

Terminal B:
```bash
bun dev
```

Optional native runs:
```bash
bun run ios
bun run android
```

Push notifications and native purchases require a development build or production build; they are not fully available in Expo Go.

## 5) Common commands
```bash
bun run check
bun run type-check
bun run ios
bun run android
bun dev --clear
```

Use Bun for project commands unless there is a specific reason to use another package manager.

## 6) Current navigation reference
The current generated route map is `docs/routes.md`.

High-level route groups:
- Auth: `app/(auth)/*`
- Customer: `app/(authenticated)/(customer)/*`
- Business: `app/(authenticated)/(business)/*`
- Staff: `app/(authenticated)/(staff)/*`
- Shared authenticated: `app/(authenticated)/join`, `app/(authenticated)/accept-invite`, `app/(authenticated)/card/*`
- Admin: `app/(authenticated)/admin/*`
- Merchant aliases: `app/(authenticated)/merchant/*`

## 7) Troubleshooting
- Module not found: run `bun install`.
- Metro cache issue: run `bun dev --clear`.
- Convex connection issue: verify `EXPO_PUBLIC_CONVEX_URL_DEV` locally or `EXPO_PUBLIC_CONVEX_URL_PROD` for production. The unsuffixed compatibility variable is development-only.
- RevenueCat purchase issue: check `docs/REVENUECAT_SETUP.md`.
- EAS build issue: check `docs/deployment.md`.

## Notes
- `/(auth)/index` redirects to `/(auth)/welcome`.
- `/(auth)/sign-in` is a legacy alias redirect to `/(auth)/sign-up`.
- Route access depends on auth status, onboarding state, active business, role, and app mode.
