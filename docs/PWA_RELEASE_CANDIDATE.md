# PWA Release Candidate work — verification ledger

Branch: `pwa/phase-3-scanner-commands-20261005`. Draft PR: #10.
This document supersedes the historical Phase 3 restrictions after the user authorized
continuous RC development, additive schema work and Native command safety changes.
No Production deployment, main merge, real-data migration or store submission is authorized.

## Status

**RC acceptance is not complete.** Implementation is reviewable, but isolated remote
E2E, hosted browser journeys and physical-device gates remain unverified. An automated
unit test or source-contract check is not evidence of a live browser or server flow.
No isolated Preview URL is claimed until the manual workflow succeeds.

| Area | Implemented work | Outstanding acceptance |
| --- | --- | --- |
| Scanner | Local upstream jsQR; Web camera lifecycle; online-only HTTP commands; explicit uncertainty; durable receipt reconciliation | Six live actions and fault matrix against isolated Preview; physical camera |
| Native safety | Existing camera retained; HTTP commands replace reconnect mutation queue; one pending operation; scope fencing and receipt recovery | Native runtime regression on devices; deployed receipt API before enabling flag |
| Customer | Shared auth/onboarding/join/wallet/cards/QR/rewards routes; browser share and confirmations | Hosted authenticated journey and expiry/deletion checks |
| Business | Web dashboard/customer/team/profile/settings; loyalty/campaign/referral editor adapters; business QR; inbox | Owner/manager/staff permissions and full hosted journeys |
| PWA | Hebrew RTL SPA template, manifest, public-only worker cache, generic offline fallback, coordinated explicit updates | Hosted installability, update/offline tests; device standalone UX |
| Maps | Web Leaflet map, safe marker text, browser location and list fallback; Native maps retained | Permission/denial/location/browser layout QA |
| Web Push | Authenticated subscription ownership, provider allowlist, bounded sender, unsubscribe and generic click routing | Approved Preview VAPID configuration; actual delivery and device tests |
| Release | Feature flags, revisioned public cache, account-data cleanup, scanner/worker/push tests and protected Native contracts | Live security/role review, performance/a11y audits, green exact-revision CI |

## Architecture

The existing Expo Router app retains platform-specific adapters. Native camera, maps,
push and billing contracts are protected. Web components use browser APIs only in Web
modules. Shared screens keep their Native navigation paths and gain Web destinations.
Native Alert remains React Native Alert; Web uses an explicit, scoped confirmation dialog.
Apple and Google Web auth use the existing provider contract; provider credentials and
allowed redirect origins must be provisioned separately in the isolated environment.

Scanner writes use a short-lived `ConvexHttpClient`, `skipQueue`, bounded no-store fetch,
no background sync, no automatic retry and one operation owner. A real authenticated
read precedes transmission. WebSocket connectivity and navigator.onLine are extra
negative signals, not proofs of reachability. Success follows authenticated canonical
receipt lookup. Scope changes invalidate pending UI ownership.

`scannerCommands:execute` authorizes actor/business/program and binds an operation ID
to runtime/device/action/resource IDs. Its nested original mutation and successful
receipt commit together. A failed nested subtransaction is rolled back; a sanitized
terminal failure receipt is committed by the outer wrapper. Existing scanner/referral
mutations are unchanged. Repeating a completed operation returns the stored outcome.

Durable client metadata contains only actor/business/program/runtime/device/action/
operation IDs. It contains no QR, token, arguments or executable write intent. Reload
restores read-only reconciliation and never resubmits a write. Unknown means locked;
absence of a receipt does not prove failure. Same-operation retry is explicit and only
available while original arguments remain in memory. Raw resolve input is cleared.
Programme selection is fenced while an uncertain operation exists in the same scope.

States include IDLE, CAMERA_READY, QR_LOCKED, RESOLVING, READY_FOR_ACTION, COMMITTING,
UNKNOWN_OUTCOME, RECONCILING, SUCCESS, ERROR and OFFLINE. Reconciliation of a lost resolve
requires a fresh user decision instead of automatically stamping on reconnect.

New schema tables are additive: `scannerCommandReceipts` and `webPushSubscriptions`.
Every pre-existing schema table is checked against the Phase 2 source. Receipts are
actor/resource scoped; account deletion cleans actor/customer receipts and owned push
subscriptions. No existing production table/index/auth configuration is replaced.

## Isolation and release controls

The manual Actions workflow is the sole backend orchestration path. It requires the
exact branch SHA and a successful normal verify job, accepts only the project Preview
key, verifies the claimed deployment is Preview and fixes the name to
`stampaix-pwa-phase3-e2e`. Existing DEV and Production names are rejected. Fixtures are
synthetic and their internal functions exist only in the private staging bundle.
Ordinary authenticated actors exercise real authorization; no shared auth bypass exists.
An already populated Preview fails the freshness guard; `--preview-create` must not be
assumed to erase data. Delete/recreate only this synthetic Preview through approved
management before rerunning if necessary. No dump imports or real-data purge is used.

Normal CI has one verify job per PR revision and cancels superseded runs. It never
creates a Convex backend. The removed manual-dispatch launcher stays removed. The
isolated workflow deploys Web Preview only after its backend E2E passes.

Commands are exposed only with Preview environment, exact isolated backend and test
actor/business allowlists. Public flags are UI controls; server authorization remains
mandatory. No real-user rollout is authorized. Production Web Push is hard disabled.
PWA registration is HTTPS/flag gated. Only public fallback/icon/manifest resources are
cached; account HTML, API responses, QR URLs and writes are not cached or queued.
Every open client must consent to an update; pending HTTP writes and uncertain receipts
prevent activation/reload.

Rollback: disable scanner/PWA/push flags and restore the previous hosted Preview revision.
Do not remove additive tables or receipt records during an uncertain operation. Deploy
receipt backend before enabling receipt-enabled clients. Older backend deployments use
the no-reconnect HTTP fallback; lost legacy results remain blocked and cannot recover
across refresh without the additive backend. Do not claim full legacy recovery.

## Evidence and blockers

Local tests include real bundled QR decoder fixtures, the pinned SDK reconnect replay
reproduction, receipt owner faults, mocked backend authorization/idempotence, deletion
ownership, raw-QR worker boundaries, service-worker event handling and Web Push provider
validation. These do not replace live Convex atomicity or browser verification.

Current Work browser is signed out of GitHub and exposed connectors have no workflow
POST/dispatch capability. Secrets stay in Actions; no key is requested in chat. This
blocks isolated deployment and all downstream hosted E2E evidence. Preview OAuth and
Web Push delivery also require approved provider configuration; no credential is copied
from Production or created automatically.

Repository-wide Biome has pre-existing failures. Required `bun run check` is still run;
its failure must be disclosed, not relabelled green. Normal CI verification consists of
tests, TypeScript, RTL/protected contracts, all-platform exports and client artifact checks.

Physical gates before Production: iPhone Safari and installed PWA; Android Chrome and
installed PWA; Samsung Internet; Native iOS/Android scanner regression. Check permission
denial/no camera, rear focus, switching, duplicate QR, background/foreground, camera
release, weak network/lost response, refresh reconciliation, account/business switching,
RTL/touch/keyboard layout, install/update/offline fallback and push click/unsubscribe.
Do not infer device success from emulation or an exported bundle.

## Local validation of this work batch

- 2,279 tests passed, zero failed (155 files).
- TypeScript passed for the application and separately with the staged Preview fixture.
- Web, iOS and Android exports passed with role routing/PWA/receipt flags enabled;
  scanner commands remained disabled against the build-only placeholder backend.
- Manual RTL/config and protected camera/billing/backend-source contracts passed.
- QR lab/business assets and PWA export validation passed; known client secret-pattern
  check passed for 14 exported files (not a comprehensive secret audit).
- Changed code has zero Biome error-level diagnostics. Whole-repository `bun run check`
  reports 223 errors, including baseline debt; it is not green.
- No physical scan, live Convex E2E, hosted browser flow or Web Push delivery was tested.

## Exact-source PR execution amendment

The user authorized a direct `isolated-preview-e2e` PR job after verify. It has no
launcher or workflow_dispatch dependency. Application/backend source remains pinned to
`119c3c58bb7ed085da5ba875f939585edc312ab1`; orchestration changes are independently
verified and restricted to CI/test harness files. Other branches/forks and superseded
revisions cannot provision. Web export uses a separate checkout of the immutable SHA.

An existing nonempty Preview must have the matching ownership markers and fixture secret.
Only the internal staged reset may clear it, after checking every root table within bounded
limits, all actors against the three synthetic emails and all business/actor scopes. Unknown
rows/scopes stop before deletion. Existing synthetic JWT/QR keys are preserved, not rotated.
Rate-limiter component entries retain their normal TTL; newly seeded actor IDs are distinct.
A populated unowned Preview is rejected without modifying its environment or data.
