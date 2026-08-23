# StampAix Documentation

Last synced: 2026-06-05

This is the canonical documentation hub for the project. Start here, then follow the specific source-of-truth document for the area you are working on.

## Project summary
StampAix is an Expo + React Native + Convex mobile app for customer loyalty, QR join flows, scanner workflows, business dashboards, staff workflows, subscriptions, referrals, campaigns, and support surfaces.

Core platform pieces:
- Expo Router file-based navigation.
- Convex Auth and Convex backend functions.
- RevenueCat subscriptions.
- RTL-first Hebrew-focused UI.
- EAS build and submit infrastructure.

## Canonical docs
- `docs/setup.md` - local setup, daily workflow, commands, env basics, and troubleshooting.
- `docs/architecture.md` - runtime architecture, provider stack, routing model, auth, permissions, data flows, storage, and payments overview.
- `docs/routes.md` - current generated route map from `app/`.
- `docs/deployment.md` - EAS build/submit infrastructure, production deployment, secrets, release checklist, and build troubleshooting.
- `docs/REVENUECAT_SETUP.md` - RevenueCat source of truth for billing setup, variables, package mapping, runtime behavior, and tests.
- `docs/spec/data-model.md` - Convex data model reference.
- `docs/spec/roles.md` - roles and permissions reference.
- `docs/spec/scanner-contract.md` - scanner UI-to-Convex contract.
- `docs/AUTH_LINKING_QA_CHECKLIST.md` - auth and identity-linking QA scenarios.
- `docs/decisions.md` - architectural decisions.
- `docs/INTEGRATIONS_AUDIT.md` - integration readiness snapshot and remaining external work.

## Current route model
Use `docs/routes.md` for the full current route map.

High-level route groups:
- `app/(auth)/*`
- `app/(authenticated)/(customer)/*`
- `app/(authenticated)/(business)/*`
- `app/(authenticated)/(staff)/*`
- `app/(authenticated)/admin/*`
- `app/(authenticated)/merchant/*`
- shared authenticated routes for join, invite acceptance, and cards

## Environment references
Local setup and common variables are documented in `docs/setup.md`.

RevenueCat billing variables and package mapping are documented in `docs/REVENUECAT_SETUP.md`.

Deployment/EAS secret expectations are documented in `docs/deployment.md`.

## Archive policy
Stale but useful historical material lives under `docs/archive/` instead of being deleted.

Archive areas:
- `docs/archive/merged/` - old docs whose content was merged into active docs.
- `docs/archive/route-snapshots/` - old generated route and architecture snapshots.
- `docs/archive/history/` - delivery history and devlog material.
- `docs/archive/runbooks/` - release or migration runbooks.
- `docs/archive/specs/` - stale product or implementation handoff specs.
- `docs/archive/build-logs/` - meaningful historical build logs.

Only clearly temporary artifacts such as tiny queue logs and checksum files should be deleted.

## Recent cleanup
On 2026-06-05:
- `docs/usage.md` was merged into `docs/setup.md`.
- `docs/EAS_INFRASTRUCTURE.md` was merged into `docs/deployment.md`.
- `docs/spec/architecture.md` was merged into `docs/architecture.md`.
- `ROUTES_REPORT.md` and `docs/spec/screens.md` were replaced by `docs/routes.md`.
- Historical stale docs and useful build logs were moved into `docs/archive/`.
