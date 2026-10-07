# StampAix PWA Release Candidate — verification ledger

Branch: `pwa/phase-3-scanner-commands-20261005`. Draft PR: https://github.com/PetFamily2/STAMPIX_APP/pull/10.
No Production or DEV deployment, main merge, store submission, SUMIT Production,
real customer data or existing credential rotation is authorized.

## Acceptance status

RC cloud acceptance is still in progress. Six live scanner actions and seventeen fault
scenarios passed, but the hosted browser suite has identified issues that are being
fixed and rerun. Do not infer RC completion from the backend suite or unit tests alone.

Latest completed evidence: https://github.com/PetFamily2/STAMPIX_APP/actions/runs/37565414433.
Its normal verify passed, including Web/iOS/Android exports. Its hosted QA did not pass.
The corresponding application source was `7e3f1a745f8892488a6dcd6c8b07035c31f44c92`.
Preview backend: `valuable-ant-605`, type `preview`, logical name `stampaix-pwa-phase3-e2e`.
Web: https://stampaix-business--gkovlo696d.expo.app.
Later fixture resets invalidate older exports' actor allowlists; use the latest paired
backend/export and its sanitized Actions artifacts for acceptance.

## Architecture

Expo Router retains iOS and Android alongside platform-specific Web adapters. Native
camera, maps, push, billing and manual RTL configurations are protected. Web uses stable synchronous route loading after async chunks produced live AsyncRequireError.
Web has a smaller brand image, an unmodified local Heebo font with OFL license, and does
not block rendering on SpaceMono. No runtime font CDN is required.
The direct customer business route uses an optional Web tab-height context while Native
still calls its original hook. Web scanner reset awaits release of its previous browser
lock before acquiring a new lease.

Scanner commands use short-lived ConvexHttpClient requests with skipQueue, bounded
no-store fetch, an authenticated reachability/authorization probe, one pending owner,
no persistence of write intent, no Background Sync and no automatic mutation retry.
Success requires an authenticated canonical receipt. Account/business/program changes
invalidate stale UI ownership. Raw QR remains in volatile memory and is cleared after
resolve/reset; it is not logged, cached, sent to analytics or placed in URLs/storage.

The additive scannerCommands wrapper authorizes and binds actor/business/program/
runtime/device/operation IDs. Existing scanner/referral mutations are unchanged. The
nested business transaction and its success receipt commit atomically; failed nested
writes roll back and the wrapper records a sanitized terminal failure. Same-operation
retries return the stored result. Read-only receipt reconciliation covers lost responses,
refresh and referral redemption without an original event.

Durable client metadata contains only scope and receipt identity, never QR, tokens,
command arguments or an executable write. Web uses sessionStorage; Native uses its
metadata adapter. Refresh restores UNKNOWN_OUTCOME and read-only reconciliation, never
an automatic write. Absent receipt does not prove failure. Original-ID retry requires an
explicit decision and original arguments still in memory. Unknown operations fence reset,
program switching and unsafe updates.

States: IDLE, CAMERA_READY, QR_LOCKED, RESOLVING, READY_FOR_ACTION, COMMITTING,
UNKNOWN_OUTCOME, RECONCILING, SUCCESS, ERROR, OFFLINE.

Additive tables: scannerCommandReceipts and webPushSubscriptions. Every original table
is source-checked against the Phase 2 schema. Account deletion cleans owned subscriptions
and affected receipt metadata. Native's React mutation reconnect risk was reproduced
against the pinned SDK and scanner commands were moved to the no-queue HTTP transport;
physical Native execution is a separate gate.

## Isolation and CI

One normal verify per PR revision, cancel superseded runs, no duplicate push/PR workflow
and no launcher. The exact-branch isolated-preview-e2e job runs directly after verify;
there is no workflow_dispatch/default-branch dependency. It rejects forks, unauthorized
branches, superseded revisions and non-control deltas from its immutable source pin.

Only CONVEX_PREVIEW_DEPLOY_KEY is used. The project Preview key, Preview deployment type,
logical name, canonical URL and exact source ancestry are proved before provisioning.
Known DEV and Production deployments are rejected. No data dumps are imported.

Synthetic-only internal fixture functions are materialized in a private staging bundle,
never in the ordinary backend or client. Reset is bounded and atomic, verifies the prior
Preview ownership marker and exactly five .invalid actor emails/two synthetic business
markers, and rejects unknown scopes/data before deletion. Existing synthetic signing and
VAPID keys are preserved. New fixtures have distinct IDs; ordinary Password-provider
sessions exercise real actor authorization, with no public password UI or auth bypass.

Backend six-action/fault E2E must pass before the immutable source is exported to EAS
Preview. Playwright/axe/Lighthouse are installed separately in temporary QA tooling,
without changing application dependencies. Private runner files are permission-restricted
and removed; only sanitized fixed-code/boolean/count evidence is uploaded, no passwords,
auth/deploy tokens, QR, customer payloads, VAPID private keys or authenticated traces.

## PWA, maps and Push

Manifest: Hebrew RTL, standalone, same-origin scope and icons. Public-only service-worker
cache holds offline.html, icon.png and manifest.webmanifest. Account HTML, API, QR URLs
and writes are not cached or queued. Update activation requires consent from every open
client; pending HTTP/React requests and uncertain scanner receipts block reload.

Web Leaflet markers use safe text; browser location supports grant/denial/unavailable
and a saved-business list. Native maps/location sources are unchanged.

Preview Web Push has server-only VAPID private material, authenticated ownership,
provider validation, duplicate protection, ten-subscription quota, unsubscribe/deletion
cleanup and a bounded sequential sender. Notifications have generic content and allowed
click destinations. Production Push remains disabled. A real cloud PushManager.subscribe
attempt returned AbortError: LIVE_DELIVERY_DEVICE_BLOCKED. This does not prove physical
Push delivery or OS click behavior; served-worker handler integration is tested separately.

## Evidence and remaining gates

Live backend PASS: resolve, stamp, redeem, completed-stamp-redeem, undo, referral benefit.
Fault PASS: offline before resolve; refresh during write with same receipt/no auto write;
eventless referral; disconnect before/during commit; same-session retry; lost committed
response/retry without extra write; duplicate callback/double click; concurrency; account/
business switching before and after send; unauthorized request; suspended staff;
unavailable program; real-clock session expiry.

Hosted roles, connected UI, safe updates/offline, maps, live Push limits/sender, redirect
policy, account deletion and accessibility are rerun after fixes. Their complete suite is
not yet green. Latest Lighthouse performance was 50, accessibility 100, best practices 100;
performance fixes must be measured, not inferred from bundle size. Physical scans are not
claimed by fake camera/decode-boundary tests.

External Preview provider presence (values never printed): RESEND_API_KEY,
RESEND_FROM_EMAIL, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_APPLE_ID and AUTH_APPLE_SECRET
were absent. These providers are EXTERNAL_CONFIGURATION_REQUIRED. Password automation
allows other hosted journeys to continue. Real provider callbacks/linking/email delivery
remain external configuration gates; no Production credentials are copied.

Local revised batch: 2,286 tests / 0 failures / 10,805 assertions; TypeScript and protected
Native/backend boundaries passed. CI repeats full tests and all-platform exports. Global
Biome still has historical debt (205 errors in the latest run); changed files have no
error-level diagnostics. Do not call the global formatting check green or open a general
refactor to hide historical debt.

## Rollout and rollback

Scanner requires Preview app environment, exact isolated backend and synthetic actor/
business allowlists. Public flags do not replace server authorization. Real-user access
stays disabled pending device QA and separate Production authorization.

Rollback: disable scanner/PWA/Push flags and restore a matching prior hosted revision.
Deploy receipt support before enabling clients; keep additive tables and receipts while
outcomes are uncertain. Do not delete a pending receipt or downgrade to queued writes.
Older no-queue clients remain compatible; legacy lost results cannot be claimed recovered
unless they have an operation receipt.

## Required physical checklist

Test iPhone Safari and installed PWA, Android Chrome and installed PWA, Samsung Internet,
Native iOS and Native Android. Verify camera permission/denial/retry, rear lens/focus,
physical QR decode, duplicate suppression, background/foreground and track release;
weak/disconnected network and lost response, no reconnect write, canonical reconciliation,
refresh of UNKNOWN with same receipt; install/standalone/offline/return-online and safe
updates with pending/unknown operations; real Push delivery/click/unsubscribe/logout/account
privacy; Hebrew RTL/touch/keyboard. Native additionally needs scanner six-action/reconnect,
camera/maps/push/billing runtime regression. Export success does not replace device proof.
