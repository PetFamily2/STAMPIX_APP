# Deployment Guide (EAS)

Last synced: 2026-02-18

## Prerequisites
- Expo account (`expo.dev`)
- EAS access
- Project already linked (`eas.json` exists)

## Preferred command path
Use project scripts (Bun):
- `bun run eas:whoami`
- `bun run eas:secrets:list`

If direct CLI is needed:
- `bunx eas-cli <command>`

## Required secrets
Convex (recommended separated):
- `EXPO_PUBLIC_CONVEX_URL_DEV`
- `EXPO_PUBLIC_CONVEX_URL_PROD`

Legacy fallback supported:
- `EXPO_PUBLIC_CONVEX_URL`

RevenueCat (if payments enabled):
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD`
- optional dev keys:
  - `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV`
  - `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV`

## Build commands
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

## Submit commands
```bash
bun run eas:submit:android:production
bun run eas:submit:ios:production
```

## Convex production deploy
```bash
bunx convex deploy
```

## Pre-release checklist
- `config/appConfig.ts` flags are set intentionally.
- Correct Convex URL vars are present in EAS secrets.
- RevenueCat production keys are present if payments are enabled.
- `bun run check` and `bun run type-check` pass.

## Troubleshooting
- Windows Metro/EAS issues: run `bun install` and retry EAS command.
- iOS credential issue in non-interactive mode:
  - `bun run eas:credentials:ios:preview`
  - or `bun run eas:credentials:ios:production`
