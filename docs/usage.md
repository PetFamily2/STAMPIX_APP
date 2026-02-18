# Usage Guide

Last synced: 2026-02-18

## Daily workflow
Start two terminals.

Terminal A (Convex):
```bash
bunx convex dev
```

Terminal B (Expo):
```bash
bun dev
```

## Common commands
- Lint/format check: `bun run check`
- Type check: `bun run type-check`
- iOS native run: `bun run ios`
- Android native run: `bun run android`

## Current navigation map (practical)
Auth entry flow:
- `/(auth)/index` -> `/(auth)/welcome`
- `/(auth)/sign-up` -> choose Google/Apple/Email
- `/(auth)/sign-up-email` -> send OTP
- `/(auth)/onboarding-client-otp` -> verify OTP
- `/(auth)/name-capture` -> required when profile is missing names

Authenticated customer:
- `/(authenticated)/(customer)/wallet`
- `/(authenticated)/(customer)/rewards`
- `/(authenticated)/(customer)/discovery`
- `/(authenticated)/(customer)/settings`

Authenticated business:
- `/(authenticated)/(business)/dashboard`
- `/(authenticated)/(business)/scanner`
- `/(authenticated)/(business)/team`
- `/(authenticated)/(business)/analytics`
- `/(authenticated)/(business)/settings`

Shared authenticated:
- `/(authenticated)/join`
- `/(authenticated)/card/[membershipId]`

## Settings and account deletion
Settings screens are role-grouped:
- Customer settings: `app/(authenticated)/(customer)/settings.tsx`
- Business settings: `app/(authenticated)/(business)/settings.tsx`

## RevenueCat usage
Use only:
- `useRevenueCat` from `contexts/RevenueCatContext.tsx`

Important flags in `config/appConfig.ts`:
- `PAYMENT_SYSTEM_ENABLED`
- `MOCK_PAYMENTS`
- `FORCE_PROD_MODE`

## Troubleshooting
- Module not found: `bun install`
- Metro cache issue: `bun dev --clear`
- Convex connection issue: verify `EXPO_PUBLIC_CONVEX_URL_DEV/PROD` or fallback `EXPO_PUBLIC_CONVEX_URL`
