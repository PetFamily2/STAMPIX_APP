# RevenueCat Setup (iOS + Android)

Last synced: 2026-06-20

This is the RevenueCat source of truth for the project. Setup, deployment, and integration docs should link here instead of duplicating billing configuration details.

This guide documents the variables and integration points actually used in code.

## 1) Dashboard setup (summary)
1. Create RevenueCat project.
2. Add iOS app (bundle id from `app.json`).
3. Add Android app (package name from `app.json`).
4. Create paid products for Pro and Premium.
5. Create paid entitlements for `pro` and `premium`, then attach products.

## 2) Current business plans
Internal plan keys are `starter`, `pro`, and `premium`. User-facing labels are
Starter, Pro, and Premium.

| Plan | Monthly | Yearly | Cards | Customers | Campaigns | Recurring campaigns | AI/month | Team seats |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Starter | free | free | 1 | 30 | 1 | 0 | 0 | 0 |
| Pro | ILS 129 | ILS 1238 | 5 | 2000 | 5 | 5 | 100 | 5 |
| Premium | ILS 249 | ILS 2390 | 10 | 10000 | 10 | 15 | 300 | 20 |

Starter is not a RevenueCat product. Pro and Premium are paid RevenueCat-backed
plans.

## 3) App environment variables
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
EXPO_PUBLIC_SERVER_AUTHORITATIVE_BILLING_ENABLED="true"
EXPO_PUBLIC_MOCK_PAYMENTS="false"

# Package mapping used by the upgrade/paywall flows
EXPO_PUBLIC_RC_PACKAGE_PRO_MONTHLY="pro_monthly"
EXPO_PUBLIC_RC_PACKAGE_PRO_YEARLY="pro_yearly"
EXPO_PUBLIC_RC_PACKAGE_PREMIUM_MONTHLY="premium_monthly"
EXPO_PUBLIC_RC_PACKAGE_PREMIUM_YEARLY="premium_yearly"

# Server webhook and product aliases
REVENUECAT_WEBHOOK_SECRET="whsec_..."
REVENUECAT_PRODUCT_IDS_PRO_MONTHLY="pro_monthly"
REVENUECAT_PRODUCT_IDS_PRO_YEARLY="pro_yearly,pro_annual"
REVENUECAT_PRODUCT_IDS_PREMIUM_MONTHLY="premium_monthly"
REVENUECAT_PRODUCT_IDS_PREMIUM_YEARLY="premium_yearly,premium_annual"
REVENUECAT_ENTITLEMENT_IDS_PRO="pro"
REVENUECAT_ENTITLEMENT_IDS_PREMIUM="premium"
```

Fallback (legacy single vars are still supported):
```env
EXPO_PUBLIC_CONVEX_URL="https://your-convex.convex.cloud"
EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY="appl_..."
EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY="goog_..."
```

## 4) EAS secrets (example)
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

## 5) Runtime behavior in this project
RevenueCat integration lives in `contexts/RevenueCatContext.tsx`.

Behavior:
- If `PAYMENT_SYSTEM_ENABLED` is `false`: premium preview behavior.
- If running in Expo Go: preview packages (no native purchases).
- If API keys are missing: preview packages.
- If fully configured and server-authoritative billing is enabled: native purchases and restore are enabled.
- Business subscription upgrades are now purchased with RevenueCat `appUserId` scoped to business: `business:<businessId>`.
- RevenueCat webhooks are handled at `/revenuecat/webhook` and update Convex
  `businesses` + `subscriptions` state after server validation.

Related config:
- `config/appConfig.ts`:
  - `PAYMENT_SYSTEM_ENABLED`
  - `EXPO_PUBLIC_SERVER_AUTHORITATIVE_BILLING_ENABLED`
  - `MOCK_PAYMENTS`
  - `FORCE_PROD_MODE`
- `utils/revenueCatConfig.ts` selects platform + env key.
- `convex/http.ts` registers the webhook route.
- `convex/entitlements.ts` maps product and entitlement ids to `pro` or
  `premium`.

## 6) Test flow
1. Build a development client (not Expo Go).
2. Open paywall screen.
3. Test purchase flow.
4. Test restore purchases.
5. Verify RevenueCat sends the webhook to `/revenuecat/webhook`.
6. Verify business subscription fields (`businesses` + `subscriptions`) were synced after webhook processing.

## 7) Common issues
- Purchases unavailable in Expo Go: expected behavior.
- No offerings/packages: check product-entitlement mapping in RevenueCat dashboard.
- Purchase button disabled: verify `EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED`,
  `EXPO_PUBLIC_SERVER_AUTHORITATIVE_BILLING_ENABLED`, API keys, package ids,
  and business-scoped identity.
- No Premium sync in app: verify webhook secret, product ids, entitlement ids,
  Convex connectivity, and RevenueCat event delivery.
