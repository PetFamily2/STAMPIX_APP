# Setup Guide

Last synced: 2026-03-16

## Prerequisites
- Node.js (LTS)
- Bun
- Expo Go (or native simulator/emulator)
- Convex account

## 1) Install dependencies
```bash
bun install
```

## 2) Start Convex and create/connect project
```bash
bunx convex dev
```

## 3) Configure environment variables
Create `.env.local` (or `.env`) with one of these Convex options:

Recommended (env-separated):
```env
EXPO_PUBLIC_CONVEX_URL_DEV="https://your-dev.convex.cloud"
EXPO_PUBLIC_CONVEX_URL_PROD="https://your-prod.convex.cloud"
```

Legacy fallback (single URL):
```env
EXPO_PUBLIC_CONVEX_URL="https://your-convex.convex.cloud"
```

Optional RevenueCat keys:
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

Optional legal/public URLs:
```env
EXPO_PUBLIC_PRIVACY_POLICY_URL="https://stampix.app/legal/privacy"
EXPO_PUBLIC_TERMS_OF_SERVICE_URL="https://stampix.app/legal/terms"
```

## 4) Auth provider setup (if needed)
- For Email OTP in Convex:
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
- For Google/Apple OAuth in Convex auth config:
  - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
  - `AUTH_APPLE_ID`, `AUTH_APPLE_SECRET`
- Required for safe OAuth redirect resolution:
  - `CONVEX_SITE_URL`
- Join landing optional store overrides (Convex env):
  - `APP_STORE_URL`
  - `PLAY_STORE_URL`

## 5) Run app
```bash
bun dev
```

Optional native runs:
```bash
bun run ios
bun run android
```

## 6) Checks
```bash
bun run check
bun run type-check
```

## Notes
- `/(auth)/index` redirects to `/(auth)/welcome`.
- `/(auth)/sign-in` is a legacy alias redirect to `/(auth)/sign-up`.
- Push notifications now use `expo-notifications` and require a development build or production build (not Expo Go).
