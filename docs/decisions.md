# Architectural Decisions

Last synced: 2026-02-18

## Decision: Remove page-header subtitles across screens
- Date: 2026-03-26
- Decision: Page-level headers no longer display subtitle text.
- Scope:
  - Applies to reusable page headers (`BrandPageHeader` / `BusinessScreenHeader`).
  - Applies to custom top-of-screen subtitle text blocks in auth and join/invite screens.
- Rationale: Keep top areas cleaner and maintain one clear title focus per screen.
- Implications:
  - New screens should not add subtitle text under the page title.
  - Existing explanatory copy should move into body content when needed.

## Decision: Canonical routing uses group trees only
- Date: 2026-02-18
- Decision: Keep canonical business/customer routes in Expo Router groups only.
- Details:
  - Canonical customer tabs live in `app/(authenticated)/(customer)/*`.
  - Canonical business tabs live in `app/(authenticated)/(business)/*`.
  - No wrapper re-export route trees are maintained.
- Rationale: Reduces routing drift and prevents stale duplicate paths.
- Implications: New tab screens must be created directly in the matching group.

## Decision: Keep auth entry explicit and avoid hidden route locks
- Date: 2026-02-18
- Decision:
  - `/(auth)/index` redirects to `/(auth)/welcome`.
  - `/(auth)/sign-in` stays as a legacy alias redirect to `/(auth)/sign-up`.
  - Redirect logic remains centralized in `app/(auth)/_layout.tsx` and `app/(authenticated)/_layout.tsx`.
- Rationale: Predictable navigation behavior and easier debugging.
- Implications: Feature screens should avoid introducing extra cross-tree redirects.

## Decision: Persist appMode (customer vs business) in SecureStore
- Date: 2026-01-19
- Decision: Store appMode locally and use it to drive initial routing/tab context.
- Rationale: Prevent role-sync timing issues from causing loops/flicker.
- Implications: Settings and auth bootstrap must keep role and appMode consistent.

## Decision: Convex Auth with multi-provider identity linking
- Date: 2026-02-18
- Decision: Use Convex Auth with Email OTP, Password, Google, and Apple.
- Linking strategy:
  - Match by provider providerUserId.
  - Fallback to verified email match.
  - Create user only if no safe match exists.
- Rationale: Prevent duplicate accounts while keeping linking strict.
- Implications: `userIdentities` is required and part of account lifecycle.

## Decision: Bootstrap user record during authenticated layout
- Date: 2026-01-05
- Decision: `app/(authenticated)/_layout.tsx` loads/bootstraps user before final route redirect.
- Rationale: Role, onboarding, and name-capture all depend on a concrete `users` record.
- Implications: Loading state is mandatory before routing to tab trees.

## Decision: Server-signed scan tokens
- Date: 2025-12-30
- Decision: Generate and validate signed scan tokens server-side with replay protection.
- Rationale: Prevent forged or replayed customer QR payloads.
- Implications:
  - `SCAN_TOKEN_SECRET` is mandatory.
  - Scanner UI must call resolve first, then stamp/redeem mutations.

## Decision: RevenueCat integration must fail safe in dev
- Date: 2025-12-29
- Decision: Use centralized RevenueCat context with preview behavior when payments are disabled or unconfigured.
- Rationale: Keep local/dev usable without live billing setup.
- Implications: Production requires env keys plus explicit payment flags.

## Decision: Layered environment variables for Convex and RevenueCat
- Date: 2025-12-29
- Decision: Prefer env-specific vars (`*_DEV`, `*_PROD`) with legacy fallback vars.
- Rationale: Smooth migration and safer multi-environment operation.
- Implications: `APP_ENV` + `FORCE_PROD_MODE` select active values at runtime.

## Decision: Prefer Bun-based tooling
- Date: 2025-12-29
- Decision: Standardize docs and scripts on Bun (`bun install`, `bun run ...`, `bunx ...`).
- Rationale: Faster installs and a single operational path.
- Implications: npm/yarn are fallback only, not first-line docs path.

## Decision: Explicit RTL strategy
- Date: 2025-12-29
- Decision: Combine Expo Localization RTL flags with explicit screen-level RTL handling.
- Rationale: Expo Go behavior is not always reliable with automatic RTL inversion.
- Implications: New screens must explicitly keep RTL-safe alignment/direction behavior.
