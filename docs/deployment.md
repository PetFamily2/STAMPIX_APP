# Deployment Guide

Last synced: 2026-08-01

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

Development-only compatibility fallback:
- `EXPO_PUBLIC_CONVEX_URL`

Production builds fail closed unless `EXPO_PUBLIC_CONVEX_URL_PROD` is set.
Legacy and development Convex URLs are not accepted by the production profile.

RevenueCat when billing is enabled:
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_PROD`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_PROD`
- `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_DEV`
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_DEV`
- `EXPO_PUBLIC_RC_PACKAGE_PRO_MONTHLY`
- `EXPO_PUBLIC_RC_PACKAGE_PRO_YEARLY`
- `EXPO_PUBLIC_RC_PACKAGE_PREMIUM_MONTHLY`
- `EXPO_PUBLIC_RC_PACKAGE_PREMIUM_YEARLY`

Other public integration values:
- `EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED`
- `EXPO_PUBLIC_SERVER_AUTHORITATIVE_BILLING_ENABLED`
- `EXPO_PUBLIC_MOCK_PAYMENTS`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`
- `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`
- `EXPO_PUBLIC_APP_STORE_URL` and `EXPO_PUBLIC_PLAY_STORE_URL` only as optional join-page fallbacks.
- `EXPO_PUBLIC_ANALYTICS_PROVIDER` if a non-console analytics provider is enabled.

EAS native build values:
- `GOOGLE_MAPS_ANDROID_API_KEY`
- `GOOGLE_MAPS_IOS_API_KEY` only if the app is changed to use Google Maps as
  the iOS map provider. The current iOS map usage does not set a Google
  provider.

Convex server values:
- `CONVEX_SITE_URL`
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- `AUTH_APPLE_ID`, `AUTH_APPLE_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `SCAN_TOKEN_SECRET`
- `SCAN_TOKEN_KID` when scan-token key ids are used.
- `APP_STORE_URL`
- `PLAY_STORE_URL`
- `REVENUECAT_WEBHOOK_SECRET` when webhook sync is enabled
- `REVENUECAT_PRODUCT_IDS_PRO_MONTHLY`
- `REVENUECAT_PRODUCT_IDS_PRO_YEARLY`
- `REVENUECAT_PRODUCT_IDS_PREMIUM_MONTHLY`
- `REVENUECAT_PRODUCT_IDS_PREMIUM_YEARLY`
- `REVENUECAT_ENTITLEMENT_IDS_PRO`
- `REVENUECAT_ENTITLEMENT_IDS_PREMIUM`
- `GOOGLE_PLACES_API_KEY`
- `SUPPORT_EMAIL` (required in production; monitored support mailbox shown on the public account-deletion page)
- `OPENROUTER_API_KEY` and `OPENROUTER_SITE_URL` if AI recommendations are enabled.

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
- `bunx expo config --type public` and `bunx expo config --type prebuild`
  complete for the target env.
- EAS secrets contain the intended Convex URL values.
- Google OAuth production client is configured for the Convex Auth callback URL.
- Apple Sign In production client and secret are configured for the Convex Auth callback URL.
- RevenueCat production keys and package ids are configured if payments are enabled.
- Push notification APNs/FCM credentials are configured in EAS for production testing.
- A dedicated Android notification icon asset is added before store release.
- Store fallback URLs are configured through `APP_STORE_URL` and `PLAY_STORE_URL` when available.
- Legal URLs point to published public pages.
- The production Convex HTTP site serves `/account-deletion`, and `SUPPORT_EMAIL`
  is configured to a monitored production mailbox.
- Deep-link domain verification files are hosted for the production domain.

## EAS local build readiness

This repo is ready for local EAS readiness checks, but C5.1 does not run cloud
EAS builds or configure external credentials.

Local validation before any EAS build:
```bash
bunx expo config --type public
bunx expo config --type prebuild
bun run type-check
bun test convex/__tests__
```

Also verify:
- `bun run eas:whoami` returns the Expo account with access to project
  `74e10cc1-aece-4da6-8049-e62cc8adf17d`.
- `bun run eas:secrets:list` shows the required variables for the selected EAS
  environment.
- `app.config.ts` injects the Android native Google Maps key from
  `GOOGLE_MAPS_ANDROID_API_KEY`; generated native config must not contain the
  literal env var name.
- Google Places web-service requests run through Convex Actions and require
  `GOOGLE_PLACES_API_KEY` in each Convex deployment environment.
- The native Maps key should be restricted to the Android package and signing
  identity. The Places key is server-side and belongs only in Convex env.
- The ignored local `android/` folder must be regenerated before trusted local
  native testing.
- Generated prebuild config still blocks `RECORD_AUDIO` and
  `WRITE_EXTERNAL_STORAGE`.
- Android notification config uses channel `default` and color `#2F6BFF`; a
  dedicated notification icon asset is still missing.
- Bundle/package/domain values remain `com.stampaix.app`, `stampaix`, and
  `stampaix.com`.
- C5.2 cleared the previous Expo prebuild warnings by matching the Android
  status bar and splash colors and enabling Android edge-to-edge.

Preview build checklist:
- EAS profile: `preview`.
- Distribution: internal.
- Android artifact: APK.
- iOS artifact: physical-device internal build, not simulator.
- Channel: `preview`.
- Android RTL source guard, before starting a preview build:
  ```bash
  bun run verify:rtl-build-source
  git status --short
  ```
  `bun run eas:build:android:preview` also runs the strict source guard and blocks
  Android builds when the git working tree is dirty. Commit the intended RTL
  source changes before building so the APK can be traced to the same code that
  was reviewed.
  The guard enforces the manual-RTL contract from
  `config/rtlArchitecture.json`, including canonical marker
  `stampaix-rtl-manual-row-right-v1`, root-layout bundle retention, and static
  RTL/visible-Hebrew scanning across `app/`, `components/`, `screens/`, `lib/`,
  `constants/`, and `config/`. The obsolete native-RTL marker is rejected.
- Commands, after local checks pass:
  ```bash
  bun run eas:build:android:preview
  bun run eas:build:ios:preview
  bun run eas:build:all:preview
  ```
- Before installing an Android preview APK for RTL QA, verify that the artifact
  contains the canonical manual-RTL architecture marker and, when embedded app
  config is present, the expected Android package and app scheme:
  ```bash
  bun run verify:android:rtl-apk -- path-or-url/to/preview.apk
  ```
  This artifact verification is intentionally deferred until an approved APK
  exists. Complete shared-screen RTL visual QA on both Android and iOS devices
  at that later runtime checkpoint.
- If iOS credentials need an interactive setup pass:
  ```bash
  bun run eas:credentials:ios:preview
  bun run eas:build:ios:preview:interactive
  ```
- Required external readiness: APNs/FCM credentials for push QA, restricted
  Maps/Places key, Convex preview/prod URL choice, OAuth provider callbacks,
  RevenueCat sandbox products if billing is tested, and legal/store fallback
  URLs if join fallback is tested.

Production build checklist:
- EAS profile: `production`.
- Distribution: store build.
- Android artifact: app bundle.
- iOS artifact: App Store/TestFlight build, not simulator.
- Channel: `production`.
- Versioning: EAS remote app version source with production auto-increment.
- Commands, after preview QA and local checks pass:
  ```bash
  bun run eas:build:android:production
  bun run eas:build:ios:production
  bun run eas:build:all:production
  ```
- Submit commands, only after store listings and credentials are ready:
  ```bash
  bun run eas:submit:android:production
  bun run eas:submit:ios:production
  bun run testflight
  ```
- Required external readiness: App Store Connect and Google Play app records,
  production APNs/FCM credentials, hosted AASA and assetlinks files, production
  OAuth clients, RevenueCat production products/webhook secret, public legal
  pages, final store URLs, Resend sender/domain, scan-token secret, and any
  enabled AI/analytics provider secrets.

## Legal and policy readiness

The app includes Hebrew in-app fallback screens for:
- Privacy Policy.
- Terms of Service.
- Account Deletion.

These screens are intended to keep the app readable when a public page is not
available from the device. They do not replace the hosted legal pages required
by App Store Connect and Google Play.

The repository's Convex HTTP application provides unauthenticated public HTML
handlers at:
- `/legal/privacy`
- `/legal/terms`

External production domain routing, DNS, and TLS configuration are still
required for `https://stampaix.com/legal/privacy` and
`https://stampaix.com/legal/terms` to resolve to these handlers.

Before store submission:
- Publish the privacy policy at `EXPO_PUBLIC_PRIVACY_POLICY_URL` or the default
  `https://stampaix.com/legal/privacy`.
- Publish the terms of service at `EXPO_PUBLIC_TERMS_OF_SERVICE_URL` or the
  default `https://stampaix.com/legal/terms`.
- Confirm both hosted pages match the in-app behavior for Convex Auth, account
  deletion, camera QR scanning, location/maps, push tokens, purchases,
  referrals, analytics, support requests, and any enabled AI features.
- Keep account deletion routed through the existing in-app deletion flow; the
  policy page must not describe a different deletion rule than
  `deleteMyAccountHard`.

### External account-deletion request workflow

The Google Play Account deletion URL is:
`<CONVEX_SITE_URL>/account-deletion` (or the same path on the attached production
domain). Confirm this URL is publicly reachable on phone and desktop before store
submission. Do not enter a temporary deployment hostname in the store listing.

The operator workflow is:

1. The user submits the public account-deletion request without needing the app.
2. The request appears in the existing admin support inbox.
3. Support verifies account ownership through the approved support process. Merely
   receiving a request for an email address is not proof of ownership.
4. Business-ownership and store-subscription blockers are resolved when applicable.
   StampAix must not claim to cancel App Store or Google Play subscriptions on the
   user's behalf.
5. Support fulfills the request through the existing authenticated StampAix
   personal-deletion process and its established operational controls.
6. Support marks the request handled. The request record is then scheduled for
   automatic deletion after 30 days.

The public form is an intake channel only. It must never be used as authority to
invoke `deleteMyAccountHard` based only on a submitted email address.

## OAuth production readiness

Convex Auth owns the provider callback URLs. The native app starts OAuth and
returns to the app through `stampaix://oauth-callback`, but Google and Apple must
redirect back to the Convex HTTP site first.

Production app identity:
- iOS bundle id: `com.stampaix.app`.
- Android package: `com.stampaix.app`.
- App scheme: `stampaix`.
- Production web/domain assumption: `stampaix.com`.

Convex production environment:
- `STAMPAIX_ENV` must be set to `production` as a server-side Convex variable.
- `CONVEX_SITE_URL` must be the deployed Convex HTTP site origin, with no path.
- `SITE_URL` is only a fallback for auth helpers; prefer `CONVEX_SITE_URL`.
- `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` must come from the production Google OAuth client.
- `AUTH_APPLE_ID` and `AUTH_APPLE_SECRET` must come from the production Apple Sign In configuration.
- `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY` must be the base64 or base64url encoding
  of exactly 32 random bytes and must remain server-only.
- `AUTH_LOG_LEVEL` must not be `DEBUG`; DEBUG fails closed unless
  `STAMPAIX_ENV` is explicitly `development`.

Google Cloud Console:
- Configure the OAuth consent screen for production use.
- Add the OAuth consent authorized domain for the Convex callback host.
- Create a Web application OAuth client for Convex Auth.
- Add authorized redirect URI:
  `<CONVEX_SITE_URL>/api/auth/callback/google`.
- Store the Web client id in `AUTH_GOOGLE_ID`.
- Store the Web client secret in `AUTH_GOOGLE_SECRET`.

Apple Developer:
- Enable Sign in with Apple for the App ID matching `com.stampaix.app`.
- Configure a Services ID/client id for the web callback used by Convex Auth.
- Link the Services ID to the app identifier when required by Apple.
- Add return URL:
  `<CONVEX_SITE_URL>/api/auth/callback/apple`.
- Register and verify the callback domain if Apple requires domain verification.
- Store the Apple client id in `AUTH_APPLE_ID`.
- Store the generated Sign in with Apple client-secret JWT in
  `AUTH_APPLE_SECRET`. This JWT is not permanent: track its `exp`, rotate it
  before that expiration, and verify the newly configured value is valid during
  deployment so authentication token exchange and future revocation jobs keep
  working. Never commit the Apple private key or a generated production JWT to
  source control.

Redirect safety:
- Production allows app redirects such as `stampaix://oauth-callback`.
- Production blocks Expo development redirects: `exp://`, `exps://`, and
  `https://auth.expo.io/`.
- Expo development redirects are allowed only outside production environments.

## Push notification readiness

The app registers Expo push tokens only on supported native iOS/Android runtimes
with notification permission granted and an EAS project id available. Expo Go is
treated as unsupported for production push registration.

Native config:
- Android default FCM channel id: `default`.
- Runtime Android channel name: `StampAix`.
- Android notification tint color: `#2F6BFF`.
- Expo config references `./google-services.json`; obtain the real Firebase
  Android client file for `com.stampaix.app` before building. Do not substitute
  the private FCM service-account JSON.
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
- Firebase Android client `google-services.json` present at the configured path.
- Real iOS and Android device tests using preview/production builds.
- Large queued fanout/retry infrastructure is not wired in C3.2.

## Deep link domain verification

Universal links and Android app links require files hosted by the production
web domain. Do not place secrets in these files.

iOS:
- Host `https://stampaix.com/.well-known/apple-app-site-association`.
- Serve it as `application/json`, with no redirect.
- Include the production app id in the form `<APPLE_TEAM_ID>.com.stampaix.app`.
- Scope matching to the `/join*` path.

Android:
- Host `https://stampaix.com/.well-known/assetlinks.json`.
- Serve it as `application/json`, with no redirect.
- Include package `com.stampaix.app`.
- Include the production Android signing certificate SHA-256 fingerprints.
- Use relation `delegate_permission/common.handle_all_urls`.

## Troubleshooting
- If EAS fails early on Windows, run `bun install` and retry.
- If Metro cache causes confusing behavior, run `bun dev --clear`.
- If iOS non-interactive builds fail for credentials, run the interactive credential scripts first.
- If RevenueCat pods/packages fail during iOS builds, verify `react-native-purchases` and `react-native-purchases-ui` versions match and retry with a clean EAS cache.
- Historical build logs were archived under `docs/archive/build-logs/`.
