# EAS Infrastructure (Android + iOS)

Last synced: 2026-02-18

This project is configured for EAS build/submit on both Android and iOS.

## Build profiles (`eas.json`)
- `development`
- `ios-simulator`
- `preview`
- `production`

## Runner and scripts
- Windows-safe wrapper: `scripts/eas-run.ps1`
- `package.json` exposes ready scripts for build/submit/credentials.

## Required environment/secrets
Convex (recommended):
- `EXPO_PUBLIC_CONVEX_URL_DEV`
- `EXPO_PUBLIC_CONVEX_URL_PROD`

Convex fallback:
- `EXPO_PUBLIC_CONVEX_URL`

RevenueCat (when billing is enabled):
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD`
- optional:
  - `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV`
  - `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV`

## Main commands
Preview builds:
- `bun run eas:build:android:preview`
- `bun run eas:build:ios:preview`
- `bun run eas:build:all:preview`

Production builds:
- `bun run eas:build:android:production`
- `bun run eas:build:ios:production`
- `bun run eas:build:all:production`

Submit:
- `bun run eas:submit:android:production`
- `bun run eas:submit:ios:production`

## First-run checklist
1. `bun run eas:whoami`
2. `bun run eas:secrets:list`
3. `bunx convex deploy`
4. Configure iOS credentials if needed:
   - `bun run eas:credentials:ios:preview`
   - `bun run eas:credentials:ios:production`

## Troubleshooting
- If EAS fails early on Windows, run `bun install` and retry.
- If iOS non-interactive build fails for credentials, run the interactive credentials scripts first.
