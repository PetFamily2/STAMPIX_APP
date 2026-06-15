# Deployment Guide

Last synced: 2026-06-05

This is the canonical deployment and EAS infrastructure guide. The older `docs/EAS_INFRASTRUCTURE.md` content was merged here and the original file was archived at `docs/archive/merged/EAS_INFRASTRUCTURE.md`.

## Prerequisites
- Expo account with access to the project.
- EAS project linked through `eas.json`.
- Required EAS secrets configured for the target environment.
- Convex production deployment and server environment variables configured.

## EAS build profiles
Profiles are defined in `eas.json`:
- `development`
- `ios-simulator`
- `preview`
- `production`

The configured EAS project id lives in `app.json`.

## Preferred command path
Use Bun scripts from `package.json`:
```bash
bun run eas:whoami
bun run eas:secrets:list
```

The scripts call the Windows-safe wrapper at `scripts/eas-run.ps1`.

If direct CLI access is needed:
```bash
bunx eas-cli <command>
```

## Required secrets
Convex:
- `EXPO_PUBLIC_CONVEX_URL_DEV`
- `EXPO_PUBLIC_CONVEX_URL_PROD`

Legacy Convex fallback:
- `EXPO_PUBLIC_CONVEX_URL`

RevenueCat when billing is enabled:
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD`
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV`

Other public integration values:
- `EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED`
- `EXPO_PUBLIC_MOCK_PAYMENTS`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`
- `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`

Convex server values:
- `CONVEX_SITE_URL`
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- `AUTH_APPLE_ID`, `AUTH_APPLE_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `SCAN_TOKEN_SECRET`
- `APP_STORE_URL`
- `PLAY_STORE_URL`
- `REVENUECAT_WEBHOOK_SECRET` when webhook sync is enabled

RevenueCat remains documented in detail in `docs/REVENUECAT_SETUP.md`.

## Build commands
Development:
```bash
bun run eas:build:android:development
bun run eas:build:ios:development
bun run eas:build:ios:simulator
```

Preview:
```bash
bun run eas:build:android:preview
bun run eas:build:ios:preview
bun run eas:build:all:preview
```

Production:
```bash
bun run eas:build:android:production
bun run eas:build:ios:production
bun run eas:build:all:production
```

Interactive iOS credential setup:
```bash
bun run eas:credentials:ios:preview
bun run eas:credentials:ios:production
```

## Submit commands
```bash
bun run eas:submit:android:production
bun run eas:submit:ios:production
```

Combined TestFlight path:
```bash
bun run testflight
```

## Convex production deploy
```bash
bunx convex deploy
```

## Pre-release checklist
- `bun run check` passes.
- `bun run type-check` passes.
- EAS secrets contain the intended Convex URL values.
- RevenueCat production keys and package ids are configured if payments are enabled.
- Push notification APNs/FCM credentials are configured in EAS for production testing.
- A dedicated Android notification icon asset is added before store release.
- Store fallback URLs are configured through `APP_STORE_URL` and `PLAY_STORE_URL` when available.
- Legal URLs point to published public pages.
- Deep-link domain verification files are hosted for the production domain.

## Push notification readiness

The app registers Expo push tokens only on supported native iOS/Android runtimes
with notification permission granted and an EAS project id available. Expo Go is
treated as unsupported for production push registration.

Native config:
- Android default FCM channel id: `default`.
- Runtime Android channel name: `STAMPAIX`.
- Android notification tint color: `#2F6BFF`.
- No notification icon is configured yet because the repo does not contain a
  dedicated 96x96 all-white transparent Android notification icon asset.

Backend behavior:
- Active tokens are stored in Convex `pushTokens`.
- Disabled tokens are marked inactive.
- Sends with no active token log `skipped_no_push_token`.
- Expo send failures are logged in `pushDeliveryLog`.
- `DeviceNotRegistered` responses deactivate the token.
- Campaigns with `push` in their channel list keep creating the inbox
  `messageLog` row and attempt best-effort push delivery.
- Referral reward notifications keep the existing inbox flow and attempt
  best-effort push delivery.

Production credential blockers:
- APNs key/certificate configured through EAS credentials.
- FCM V1 credentials configured through EAS credentials.
- Real iOS and Android device tests using preview/production builds.
- Large queued fanout/retry infrastructure is not wired in C3.2.

## Deep link domain verification

Universal links and Android app links require files hosted by the production
web domain. Do not place secrets in these files.

iOS:
- Host `https://stampix.app/.well-known/apple-app-site-association`.
- Serve it as `application/json`, with no redirect.
- Include the production app id in the form `<APPLE_TEAM_ID>.com.stampix.stampix`.
- Scope matching to the `/join*` path.

Android:
- Host `https://stampix.app/.well-known/assetlinks.json`.
- Serve it as `application/json`, with no redirect.
- Include package `com.stampix.stampix`.
- Include the production Android signing certificate SHA-256 fingerprints.
- Use relation `delegate_permission/common.handle_all_urls`.

## Troubleshooting
- If EAS fails early on Windows, run `bun install` and retry.
- If Metro cache causes confusing behavior, run `bun dev --clear`.
- If iOS non-interactive builds fail for credentials, run the interactive credential scripts first.
- If RevenueCat pods/packages fail during iOS builds, verify `react-native-purchases` and `react-native-purchases-ui` versions match and retry with a clean EAS cache.
- Historical build logs were archived under `docs/archive/build-logs/`.
