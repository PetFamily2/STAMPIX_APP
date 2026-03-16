# RevenueCat Setup (iOS + Android)

Last synced: 2026-03-16

This guide documents the variables and integration points actually used in code.

## 1) Dashboard setup (summary)
1. Create RevenueCat project.
2. Add iOS app (bundle id from `app.json`).
3. Add Android app (package name from `app.json`).
4. Create products (for example `premium_monthly`, `premium_annual`).
5. Create entitlement (for example `premium`) and attach products.

## 2) App environment variables
Recommended (env-separated):
```env
# Convex
EXPO_PUBLIC_CONVEX_URL_DEV="https://your-dev.convex.cloud"
EXPO_PUBLIC_CONVEX_URL_PROD="https://your-prod.convex.cloud"

# RevenueCat iOS
EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV="appl_..."
EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD="appl_..."

# RevenueCat Android
EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV="goog_..."
EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD="goog_..."

# Billing gates
EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED="true"
EXPO_PUBLIC_MOCK_PAYMENTS="false"

# Package mapping used by the upgrade/paywall flows
EXPO_PUBLIC_RC_PACKAGE_PRO_MONTHLY="pro_monthly"
EXPO_PUBLIC_RC_PACKAGE_PRO_YEARLY="pro_yearly"
EXPO_PUBLIC_RC_PACKAGE_PREMIUM_MONTHLY="premium_monthly"
EXPO_PUBLIC_RC_PACKAGE_PREMIUM_YEARLY="premium_yearly"

# Optional webhook secret
REVENUECAT_WEBHOOK_SECRET="whsec_..."
```

Fallback (legacy single vars are still supported):
```env
EXPO_PUBLIC_CONVEX_URL="https://your-convex.convex.cloud"
EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY="appl_..."
EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY="goog_..."
```

## 3) EAS secrets (example)
```bash
# Convex (recommended)
bunx eas-cli secret:create --scope project --name EXPO_PUBLIC_CONVEX_URL_DEV --value "https://your-dev.convex.cloud"
bunx eas-cli secret:create --scope project --name EXPO_PUBLIC_CONVEX_URL_PROD --value "https://your-prod.convex.cloud"

# RevenueCat production
bunx eas-cli secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD --value "appl_..."
bunx eas-cli secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD --value "goog_..."

# RevenueCat optional dev keys
bunx eas-cli secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV --value "appl_..."
bunx eas-cli secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV --value "goog_..."

# Optional webhook
bunx eas-cli secret:create --scope project --name REVENUECAT_WEBHOOK_SECRET --value "whsec_..."
```

## 4) Runtime behavior in this project
RevenueCat integration lives in `contexts/RevenueCatContext.tsx`.

Behavior:
- If `PAYMENT_SYSTEM_ENABLED` is `false`: premium preview behavior.
- If running in Expo Go: preview packages (no native purchases).
- If API keys are missing: preview packages.
- If fully configured: native purchases and restore are enabled.
- Business subscription upgrades are now purchased with RevenueCat `appUserId` scoped to business: `business:<businessId>`.

Related config:
- `config/appConfig.ts`:
  - `PAYMENT_SYSTEM_ENABLED`
  - `MOCK_PAYMENTS`
  - `FORCE_PROD_MODE`
- `utils/revenueCatConfig.ts` selects platform + env key.

## 5) Test flow
1. Build a development client (not Expo Go).
2. Open paywall screen.
3. Test purchase flow.
4. Test restore purchases.
5. Verify user subscription fields were updated in Convex.
6. Verify business subscription fields (`businesses` + `subscriptions`) were synced after upgrade.

## 6) Common issues
- Purchases unavailable in Expo Go: expected behavior.
- No offerings/packages: check product-entitlement mapping in RevenueCat dashboard.
- No premium sync in app: verify Convex connectivity and authenticated user context.
