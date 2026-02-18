# Devlog (aligned with MVP roadmap)

Last synced: 2026-02-18

## How to use this devlog
- Append one dated section per milestone/session.
- Keep entries focused on shipped behavior and open work.
- Prefer links to exact files touched.

## Milestone 0 - Base template and specs (2025-12-29)
- Status: Done
- What changed:
  - Initial Expo + Convex scaffold, RTL helpers, RevenueCat context.
  - Added docs/spec and reference UI assets.
- Links: `docs/README.md`, `docs/spec/*`

## Milestone 1 - Scanner scaffold and schema updates (2025-12-30)
- Status: Done
- What changed:
  - Signed scan token flow and scanner mutations.
  - Added `scanTokenEvents` and related schema support.
- Links: `convex/scanTokens.ts`, `convex/scanner.ts`

## Milestone 2 - Auth source of truth and scanner authorization (2026-01-05)
- Status: Done
- What changed:
  - Auth flow aligned to Convex auth identity.
  - Added role guard utility and scanner authorization checks.
- Links: `convex/auth.ts`, `convex/guards.ts`, `lib/hooks/useRoleGuard.ts`

## Milestone 3 - Business dashboards and onboarding UX (2026-01-14)
- Status: Done
- What changed:
  - Expanded business dashboard and analytics coverage.
  - Added onboarding screens for business and customer paths.
- Links: `app/(authenticated)/(business)/*`, `convex/analytics.ts`

## Milestone 4 - Join flow and QR UX improvements (2026-01-17 to 2026-01-18)
- Status: Done
- What changed:
  - Added join flow with QR/deep-link handling.
  - Improved card QR + scanner interoperability.
- Links: `app/(authenticated)/join.tsx`, `components/QrScanner.tsx`, `convex/seed.ts`

## Milestone 5 - Customer/business routing split (2026-01-19 to 2026-01-20)
- Status: Done
- What changed:
  - Introduced `AppModeContext` with persistence.
  - Split customer and business tabs into dedicated route groups.
- Links: `app/(authenticated)/_layout.tsx`, `contexts/AppModeContext.tsx`

## Milestone 6 - Multi-provider auth + identity linking (2026-02-06 to 2026-02-18)
- Status: Done
- What changed:
  - Added Google and Apple auth providers.
  - Added `userIdentities` linking and safer account merge logic.
  - Added `name-capture` onboarding gate with required first/last name.
  - Added auth-linking QA checklist.
- Links: `convex/auth.ts`, `convex/schema.ts`, `app/(auth)/name-capture.tsx`, `docs/AUTH_LINKING_QA_CHECKLIST.md`

## Milestone 7 - Documentation sync to runtime behavior (2026-02-18)
- Status: Done
- What changed:
  - Removed stale docs references to wrapper route trees.
  - Updated route map and architecture docs to current canonical navigation.
  - Updated setup/deployment/RevenueCat docs to current env layering.
- Links: `docs/README.md`, `docs/architecture.md`, `docs/decisions.md`, `ROUTES_REPORT.md`

## Current status (as of 2026-02-18)
- Working:
  - Auth (Email OTP + Google + Apple + Password)
  - Customer wallet/join/card QR
  - Business dashboard/scanner/team/analytics
  - Name-capture onboarding gate
- Remaining:
  - Replace static dashboard placeholder blocks with fully live data.
  - Finalize production RevenueCat + payment flags before store release.
  - Keep docs synced whenever route/auth behavior changes.
