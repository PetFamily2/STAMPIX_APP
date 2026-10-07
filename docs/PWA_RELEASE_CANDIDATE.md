# StampAix PWA Release Candidate — acceptance and operations

Branch: `pwa/phase-3-scanner-commands-20261005`.
Draft PR: https://github.com/PetFamily2/STAMPIX_APP/pull/10.
This is a Preview candidate. A green cloud run does not authorize Production, main merge,
store submission, SUMIT Production or physical-device claims.

## Exact revision and evidence

Use the latest completed **Verify and Web Preview** run for the exact branch HEAD.
Both `verify` and `isolated-preview-e2e` must succeed. The sanitized
`phase3c1-preview-evidence` artifact contains backend/hosting identity and hosted QA;
`RC_DIAGNOSTICS` in job logs contains fixed failure families, public performance and
violation counts. Do not substitute an older green backend run for a failed hosted run.

The control revision pins an immutable application/backend source. Hosting exports that
source, and `/pwa/release.json` identifies it. Source, Preview backend, actor allowlists
and EAS export must be used together. Synthetic reset rotates fixture IDs, so old hosted
exports must not be used with new fixture identities. Final PR evidence records the
actual source/control SHAs, paired URLs, run and measurements.

## Architecture and scope

Expo Router preserves iOS and Android with isolated Web adapters. Native camera, maps,
push, billing and manual RTL configurations are protected by source contracts.
Web uses stable synchronous route loading; async route chunks had a reproduced hosted
loading error and were not retained. The Web-only icon resolver uses identical pinned
glyphs, delegates Native unchanged, and local Heebo is bundled with its OFL license.
The public `/welcome` entry is exported as a usable HTML document with real sign-in
and registration links. Its markup is shared with the Web client route, and application
JavaScript loads on navigation into the app. The public document contains no account
data or authentication code. Its optional worker registration never activates an update;
its own consent is denied when receipt metadata is unknown or unreadable. Each other
client must independently consent to an update. Protected routes still wait for
authenticated role/scope resolution; Native's original welcome/image/font gates remain.

Web sign-up checks server-owned provider readiness booleans before starting OAuth or
email authentication. Missing providers are disabled rather than sent to a broken
authorization URL; this is not evidence that an external provider accepts the client.
Native OAuth remains unchanged. Dedicated Preview Google configuration and its exact
callback binding are described in `PREVIEW_GOOGLE_AUTH.md`.

Web QR decoding uses upstream jsQR 1.4.0 in a same-origin worker, with no runtime CDN or
unproved decoder patch. MediaDevices lifecycle includes HTTPS, rear-camera preference,
playsInline, denied/no-camera states, track release, background/foreground recovery,
bounded frame size and adaptive decode intervals. Cloud media errors and decode-result
injection do not prove physical scanning.

Scanner writes use short-lived ConvexHttpClient HTTP requests with skipQueue, no-store
fetch, authenticated reachability/scope checks, one pending operation, no persisted
write intent, no Background Sync and no automatic write retry on reconnect.
Success requires a canonical authenticated server receipt. Raw QR is volatile, cleared
after resolve/reset, and absent from logs, analytics, URLs, storage and caches.

The additive scannerCommands wrapper binds actor/business/program/runtime/device/
operation IDs. Existing scanner/referral business mutations are preserved. The nested
business transaction and its success receipt are atomic; failed nested writes roll back
and produce a sanitized terminal receipt. Explicit same-ID retry is idempotent.
Read-only reconciliation includes eventless referral outcomes and committed lost responses.

Client durable metadata contains only receipt identity/scope, never QR, token or command
arguments. Refresh restores UNKNOWN_OUTCOME and read-only reconciliation. An absent
receipt **does not prove failure**. Original-ID retry requires an explicit action and
original arguments still in memory. If a request never reached the server and arguments
are lost on refresh, preserve the unknown fence and require canonical operator review;
do not invent success/failure, submit a new transaction or delete uncertainty metadata.

States: IDLE, CAMERA_READY, QR_LOCKED, RESOLVING, READY_FOR_ACTION, COMMITTING,
UNKNOWN_OUTCOME, RECONCILING, SUCCESS, ERROR, OFFLINE.
Uncertain operations fence reset, program switching and update/reload. Scope changes
invalidate UI ownership; account-specific receipts remain inaccessible to other actors.

Only scannerCommandReceipts and webPushSubscriptions are additive tables. Original
tables are source-checked against Phase 2. Native reconnect queue behavior was reproduced
against the pinned Convex SDK; Native scanner commands use the no-queue HTTP adapter.
Native camera implementation remains protected. JavaScript exports do not prove device
or store builds.

## CI and isolated backend

There is one normal verify per PR revision, superseded-run cancellation, no duplicate
push/PR verification and no launcher/default-branch dispatch dependency. The dedicated
isolated-preview-e2e PR job runs after verify, checks exact branch/actor/repository,
rejects superseded HEAD before credentials, and proves the immutable source delta.

Only CONVEX_PREVIEW_DEPLOY_KEY is used. Authoritative deployment type must be Preview,
logical name **stampaix-pwa-phase3-e2e**, with canonical HTTPS Convex URL. Known DEV and
Production targets are rejected. No data dumps or real actors are imported.

Synthetic fixtures are internal functions materialized only in a private Preview staging
bundle. The runner authorizes and reuses the fixed named Preview before attempting
creation; only authoritative not-found permits creation. Reset verifies ownership,
the known .invalid test actor names and synthetic businesses, bounds deletions and
rejects unknown data. A deleted disposable actor's staff acceptance event is accepted
only with its matching canonical synthetic invitation, business, role, actor and time;
that proof cannot authorize unrelated actor references. Existing synthetic
signing/VAPID keys are retained. Password-provider automation uses real authenticated
sessions and ordinary authorization; no public password login or auth bypass is added.
Private runner files are restricted and deleted. Artifacts omit QR, tokens, passwords,
deploy keys, private VAPID material, customer payloads and authenticated traces.

Backend six-action and fault E2E must pass before EAS Preview deployment. Hosted QA then
exercises customer, owner, manager and staff journeys; connected scanner canonical UI;
offline/lost-response/reconciliation/refresh/expiry/scope switch; campaigns to actual
customer Inbox; sharing actual PNG; staff invite and account deletion; access control;
maps/location; service-worker/update safety; and Push integration.

## PWA, location, Push and performance

Manifest is Hebrew RTL, standalone and same-origin. Worker cache is public-only:
offline.html, icon.png and manifest.webmanifest. No account HTML, APIs, QR or writes are
cached/queued. Update activation requires all open clients' consent; pending requests
and unknown scanner receipts block reload.

Web Leaflet uses safe marker text and grant/denied/unavailable location states with list
fallback. Native maps/location are unchanged. Web redemption capture uses local
html2canvas with bounded 1080×1920 output and volatile image data; Native capture remains.

Web Push uses server-only VAPID private keys, actor ownership, duplicate detection,
ten-subscription quota, provider allowlist/SSRF protection, unsubscribe/deletion cleanup,
generic notification content, allowed click paths and a bounded sender. Cloud
PushManager.subscribe may return LIVE_DELIVERY_DEVICE_BLOCKED. Synthetic OS-event
delivery exercises the served worker handler, not real OS delivery.

Public welcome Lighthouse cloud budget: LCP ≤4000ms, TBT ≤750ms, CLS ≤0.1,
accessibility 100 and best practices ≥90. Keep actual measurements in run evidence;
performance audit execution alone is not a pass. Axe checks seven authenticated screens,
responsive checks cover widths 320/360/390/768/1280 and scanner controls have ≥44px targets.
Historical global Biome debt is not a passing gate; do not conceal it or open a general
refactor to repair unrelated debt.

## External configuration gates

Presence-only Preview audit checks RESEND_API_KEY, RESEND_FROM_EMAIL, AUTH_GOOGLE_ID,
AUTH_GOOGLE_SECRET, AUTH_APPLE_ID and AUTH_APPLE_SECRET. Missing providers are
EXTERNAL_CONFIGURATION_REQUIRED. Configure approved Preview credentials/origins, then
verify real email delivery, Google/Apple callback/logout/linking and recovery. Existing
redirect allowlists and account-linking boundaries must remain fail closed.
Password automation permits other hosted journeys to run without these providers.

## Rollout and rollback

All Production features remain OFF by default. Future pilot activation requires exact
`device-verified-pilot-v1` attestation, separate Production authorization and matching
server/client flags. The attestation is not proof or authorization by itself.
Web role routing requires its flag; scanner additionally requires a canonical explicitly
verified Production URL, rejection of the Preview/DEV URLs and actor+business pilot
allowlists. Preview instead requires exact paired Preview URL and synthetic allowlists.
Push requires separate server gate and enabled flag. Never copy Preview identities/keys
into Production or turn on scanner before physical acceptance.

Rollback first disables scanner/Push/PWA/role-routing flags, then restores a matching
previous hosted revision. Keep receipt support and additive tables while outcomes are
uncertain. Never downgrade to queued scanner writes or erase unknown metadata/receipts.
Use backward-compatible server functions before exposing clients. No Production operation
or merge is performed by this Preview workflow.

## Physical acceptance checklist

Test iPhone Safari and installed PWA; Android Chrome and installed PWA; Samsung Internet;
Native iOS; Native Android:

- Camera grant/deny/retry, rear lens and focus, physical QR, duplicates, background/
  foreground and track release.
- Weak network and disconnect before/during commit, committed response loss, zero
  reconnect writes, canonical reconciliation and UNKNOWN refresh with the same receipt.
- PWA install/standalone, offline/return online, update available and safe activation while
  idle versus pending/UNKNOWN; keyboard/touch and Hebrew RTL.
- Real Push subscribe/delivery/click/unsubscribe/logout/account privacy. iOS Web Push is
  tested in an installed PWA; browser tab presents installation guidance.
- Native six scanner actions/reconnect regression plus camera, maps, push and billing
  runtime regression. Preserve iOS/Android support.

Cloud readiness plus provider/device gates is a candidate for final acceptance, not a
Production-readiness claim. Production rollout requires those gates and explicit approval.
