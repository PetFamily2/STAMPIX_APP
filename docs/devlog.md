# Devlog (aligned with MVP roadmap)

## How to use this devlog
- After each session, append a section with a date and milestone name.
- Keep entries brief and focused on product, architecture, or data changes.
- Track why a change happened and what remains.

## Milestone 0 - Base template and specs (2025-12-29)
- Status: Done
- What changed:
  - Initial Expo + Convex scaffold, RTL utilities, and RevenueCat context.
  - Added specs in docs/spec and reference-ui assets.
- Why: Establish the baseline for an RTL-first mobile template with payments and backend.
- Remaining: None for baseline; future work builds on this foundation.
- Links: docs/README.md, docs/spec/*

## Milestone 1 - Scanner scaffold and schema updates (2025-12-30)
- Status: Done
- What changed:
  - Added scan token generation/validation and scanner mutations.
  - Expanded schema to include scanTokenEvents and supporting specs.
- Why: Enable QR-based stamping with replay protection.
- Remaining: Hook scanner UI to the new pipeline (completed later).
- Links: convex/scanTokens.ts, convex/scanner.ts, docs/spec/scanner-contract.md

## Milestone 2 - Auth source of truth and scanner authorization (2026-01-05)
- Status: Done
- What changed:
  - Fixed auth flow to rely on Convex Auth identity.
  - Added role guard utility and enforced scanner authorization.
  - Added card route entry and improved wallet flow handling.
- Why: Prevent unauthorized scanner actions and stabilize auth.
- Remaining: Continue hardening routing and role-based UX.
- Links: convex/auth.ts, lib/hooks/useRoleGuard.ts

## Milestone 3 - Business dashboards and onboarding UX (2026-01-14)
- Status: Done
- What changed:
  - Expanded business dashboards, analytics query, and onboarding screens.
  - Improved UI components and customer membership domain logic.
- Why: Support business-side operations and metrics.
- Remaining: Replace any mocked dashboard content and finalize UX copy.
- Links: app/(authenticated)/business/*, convex/analytics.ts

## Milestone 4 - Join flow and QR UX improvements (2026-01-17 to 2026-01-18)
- Status: Done
- What changed:
  - Added join screen, QR scanner component, and seed helpers.
  - Improved scanner and card flows to support scan tokens and QR rendering.
- Why: Enable the core customer join and scan experience.
- Remaining: None for the flow; polish and error handling are ongoing.
- Links: app/(authenticated)/join.tsx, components/QrScanner.tsx, convex/seed.ts

## Milestone 5 - Customer/business routing split (2026-01-19 to 2026-01-20)
- Status: Done
- What changed:
  - Introduced AppModeContext and persisted appMode.
  - Split customer and business stacks into separate tab groups.
  - Added wrapper routes for legacy business screens.
- Why: Eliminate tab conflicts and routing loops across personas.
- Remaining: Keep wrappers in sync as new business routes are added.
- Links: app/(authenticated)/_layout.tsx, contexts/AppModeContext.tsx

## Current status (as of 2026-01-27)
- Working: Auth, customer wallet + join + card QR, business scanner, analytics summaries, team invites, business onboarding.
- In progress: Replace static dashboard activity feed with real data.
- Remaining:
  - Wire Settings actions for support, terms, privacy, and delete account.
  - Connect RevenueCat production keys and enable PAYMENT_SYSTEM_ENABLED when ready.
  - Remove debug logs/temporary UI once flows stabilize.
