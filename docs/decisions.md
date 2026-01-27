# Architectural Decisions

## Decision: Use Expo Router with grouped stacks and wrapper routes
- Date: 2026-01-19
- Decision: Keep file-based routing with separate (customer) and (business) tab groups, and add wrapper routes under app/(authenticated)/(business)/business/*.
- Rationale: Expo Router expects physical files for tab routes. Wrappers preserve legacy paths without moving existing screens.
- Alternatives: One tab layout with conditional routes; move legacy business screens into the new group.
- Implications: New screens must live under the correct group; wrappers must be maintained when adding new business tabs.

## Decision: Persist appMode (customer vs business) in SecureStore
- Date: 2026-01-19
- Decision: Store appMode locally and use it to drive initial routing and tab selection.
- Rationale: Role changes can lag server updates and cause routing loops; appMode gives predictable UX on app restart.
- Alternatives: Drive routing only from server role.
- Implications: Settings must update both the server role and appMode; root layout must guard redirects.

## Decision: Convex as backend and Convex Auth (Password provider)
- Date: 2026-01-05
- Decision: Use Convex for database, server functions, and auth with Password provider.
- Rationale: Unified realtime backend and auth reduces infrastructure and keeps business rules server-side.
- Alternatives: Firebase/Auth0 + custom API; custom backend.
- Implications: Client uses Convex queries/mutations; schema and functions live in convex/.

## Decision: Bootstrap user records on first authenticated load
- Date: 2026-01-05
- Decision: Call api.auth.createOrUpdateUser in app/(authenticated)/_layout.tsx when no user record exists.
- Rationale: Ensures a users row exists for role, subscription, and membership flows.
- Alternatives: Create users on sign-up only; rely on client-side profile storage.
- Implications: App must handle bootstrap errors and loading states before routing.

## Decision: Server-signed scan tokens with HMAC secret
- Date: 2025-12-30
- Decision: Generate scan tokens in Convex (scanTokens.ts) and validate signature + expiry server-side.
- Rationale: Prevents client-side spoofing and replay of scan codes.
- Alternatives: Unsigned QR payloads; client-only validation.
- Implications: SCAN_TOKEN_SECRET is required; scanner flow must call resolveScan before addStamp.

## Decision: Keep legacy business screens and re-export via wrappers
- Date: 2026-01-20
- Decision: Leave app/(authenticated)/business/* in place and re-export them from app/(authenticated)/(business)/business/*.
- Rationale: Avoid breaking existing imports and reduce migration risk.
- Alternatives: Move or duplicate all screens.
- Implications: Two layers exist; changes should remain in the legacy screens to avoid divergence.

## Decision: RevenueCat integration with preview mode and flags
- Date: 2025-12-29
- Decision: Use RevenueCatContext to centralize subscriptions, with preview packages in Expo Go or when keys are missing.
- Rationale: Lets UI work without payments in development while supporting real purchases in production.
- Alternatives: Build custom in-app purchase logic; gate paywall in app only.
- Implications: PAYMENT_SYSTEM_ENABLED and API keys must be set before production testing.

## Decision: Environment variable layering for Convex and RevenueCat
- Date: 2025-12-29
- Decision: Read DEV/PROD keys first and fall back to legacy single-key variables.
- Rationale: Supports separate environments without breaking older setups.
- Alternatives: Single variable per service.
- Implications: APP_ENV and FORCE_PROD_MODE determine which variables are used.

## Decision: Prefer Bun for tooling
- Date: 2025-12-29
- Decision: Use bun for install and scripts in docs and tooling.
- Rationale: Faster installs and consistent scripts (bun run check, bun dev).
- Alternatives: npm, yarn, pnpm.
- Implications: Keep bun.lock current; npm still works but is not the recommended path.

## Decision: Explicit RTL utilities plus Expo Localization
- Date: 2025-12-29
- Decision: Combine expo-localization RTL flags with lib/rtl.ts helpers.
- Rationale: Expo Go does not reliably respect I18nManager; explicit RTL styling is required.
- Alternatives: Rely only on I18nManager.
- Implications: New UI should use rtl helpers or text-right alignment.

## Decision: SecureStore for sensitive tokens and appMode
- Date: 2025-12-29
- Decision: Store auth tokens and appMode in expo-secure-store.
- Rationale: Avoids AsyncStorage for sensitive data.
- Alternatives: AsyncStorage for all persistence.
- Implications: SecureStore is required in app.json plugins and dev builds.
