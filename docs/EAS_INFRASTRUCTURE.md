# EAS Infrastructure (Android + iOS)

This project is configured to build and submit both Android and iOS apps via EAS.

## What was set up

- `eas.json` profiles for:
  - `development` (Android APK + iOS device dev client)
  - `ios-simulator` (iOS simulator build)
  - `preview` (internal distribution)
  - `production` (Android AAB + iOS production)
- Windows-safe EAS runner: `scripts/eas-run.ps1`
  - If your local Node is `24+`, it automatically runs EAS with Node `22` to avoid Metro config loader issues on Windows.
- Ready-to-use scripts in `package.json` for Android/iOS build and submit.

## Required secrets / environment

At minimum:

- `EXPO_PUBLIC_CONVEX_URL`

If payments are enabled:

- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD`
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV` (optional but recommended)
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV` (optional but recommended)

References:

- `docs/setup.md`
- `docs/deployment.md`
- `docs/REVENUECAT_SETUP.md`

## Build commands

Preview builds:

- `bun run eas:build:android:preview`
- `bun run eas:build:ios:preview`
- `bun run eas:build:ios:preview:interactive` (first iOS setup only)
- `bun run eas:build:all:preview`

Production builds:

- `bun run eas:build:android:production`
- `bun run eas:build:ios:production`
- `bun run eas:build:ios:production:interactive` (if iOS credentials are not ready yet)
- `bun run eas:build:all:production`

iOS simulator:

- `bun run eas:build:ios:simulator`

## Submit commands

- `bun run eas:submit:android:production`
- `bun run eas:submit:ios:production`

## First-run checklist

1. `bun run eas:whoami`
2. `bun run eas:secrets:list`
3. `bunx convex deploy`
4. One-time iOS credentials setup:
   - `bun run eas:credentials:ios:preview`
   - `bun run eas:credentials:ios:production`
5. Run preview build for each platform
6. Run production build and submit

## Troubleshooting

- If EAS fails early with `Error loading Metro config ... Received protocol 'c:'` on Windows:
  - run `npm install --legacy-peer-deps`
  - then run the EAS command again
- If iOS preview build fails with missing credentials in non-interactive mode:
  - run `bun run eas:credentials:ios:preview` (interactive)
  - if needed, also run `bun run eas:credentials:ios:production` (interactive)
  - then re-run `bun run eas:build:ios:preview`
