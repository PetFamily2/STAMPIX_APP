# Phase 3 — Preview Web scanner commands

Base: `9afcfac8b5b68d3f72212f7866e0aad9c897b094`.
Branch: `pwa/phase-3-scanner-commands-20261005`.
Target: `pwa/phase-2-qr-foundation-20261005`. No main merge or Production deployment.

## Status and deployment boundary

Web implementation and automated verification are available for review.
The additive query has NOT been deployed: this execution context has no
identified, authenticated Convex deployment whose approved DEV/Preview
isolation can be established. An EAS environment named Preview or a public
flag saying verified-dev does not establish that fact. No deployment key was
used and no Convex sync/deploy is added to CI. Web Preview deploys with
`EXPO_PUBLIC_WEB_SCANNER_COMMANDS=false`.

Before activating a test flow, independently verify the approved Convex
deployment is DEV/Preview (not Production), its URL differs from Production,
its auth/data are appropriate for tests, and its credentials target precisely
that deployment. Deploy/review the additive query there, validate its function
contract, then rebuild Preview with explicit test actor/business allowlists.
Public flags are rollout controls, not server authorization.

Web commands remain disabled for real users. DEVICE VERIFY is required for
Safari iPhone, Chrome Android, Samsung Internet and separately iPhone
home-screen mode. No production readiness, Native binary QA or physical
camera scan is claimed. Phase 4 has not started.

## Pre-phase decoder decision

The Phase 2 local jsQR alignment patch is removed. No standard reproducible
fixture established an upstream failure fixed by that change. The unmodified
upstream distribution decodes all forty version fixtures, including version
23. A coordinate-table assertion alone did not justify a fork.
The restored SHA-256 exactly matches upstream npm jsQR 1.4.0:
`bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`.
Provenance/license and export integrity checks are retained. Phase 2 docs are
historical; this decision supersedes their local-patch recommendation.

## Transport architecture and SDK research

The locked SDK is Convex **1.31.5**. Its actual
`src/browser/sync/request_manager.ts` stores NotSent/Requested mutations in
memory and `restart()` replays them. React `useMutation` uses that sync client.
The SDK replay preserves the request identity; this is not evidence that it
creates duplicate transactions. It does permit an offline command to execute
after connectivity returns, outside this scanner's required online-only policy.

The new Web path uses a short-lived `ConvexHttpClient` per request with
`mutation(..., {skipQueue:true})`, a custom bounded fetch, no logger, no cache,
no redirects, no keepalive and no retry. A fresh authenticated, actor/business/
program scoped HTTP probe precedes a write. The scope and online/visibility
signals are checked again immediately before fetch. `navigator.onLine` is
only a negative signal; a successful authenticated server response is also
required. There is one command in flight per engine. A Web Lock prevents
simultaneous same-account/business tabs in the same browser origin; absence
of Web Locks disables this Preview tester rather than using an unsafe fallback.

Timeout/abort after invocation is UNKNOWN, never proof of rollback. A well-
formed Convex UDF error response establishes rejection of that specific call.
Malformed responses/network/HTTP failures are not classified by their message.
Only a safe uppercase code is retained; raw error payloads are not reported.
No write arguments or operation are persisted. No Background Sync, WebSocket
mutation client, automatic write retry or submit-on-reconnect is used.

Primary documentation reviewed 2026-10-05:

- https://docs.convex.dev/api/modules/browser (HttpMutationOptions.skipQueue)
- https://docs.convex.dev/api/classes/browser.ConvexHttpClient
- https://docs.convex.dev/understanding/overview (in-memory mutations)
- https://github.com/get-convex/convex-js/blob/main/src/browser/sync/request_manager.ts
- https://github.com/get-convex/convex-js/blob/main/src/browser/http_client.ts

Local pinned SDK source and executable tests determine behavior for this app;
current documentation is not assumed to describe every historical SDK version.

## State machine

`IDLE → CAMERA_READY → QR_LOCKED → RESOLVING → READY_FOR_ACTION → COMMITTING`

- Explicit user confirmation selects the compatible action; stamps are not
  auto-committed when a camera callback fires.
- Commit response → RECONCILING → SUCCESS only with an action-specific,
  scoped canonical server receipt.
- Connection loss/ambiguous response → UNKNOWN_OUTCOME; no new QR, second
  action, reset, automatic retry or inferred final failure.
- Reconnect → read-only RECONCILING. Unknown reads keep the lock.
- Pre-send offline/invalid scope → OFFLINE/ERROR, with no queued command.
- Account/business/program changes invalidate generations. Stale responses
  never produce success for the new scope. The old uncertainty checkpoint
  remains associated with the original actor/business/program.

Canonical reconciliation is conservative: a row marked ready, or its elapsed
expiry, does not establish that an already-sent transaction failed. Existing
mutation handlers patch failed/expired then throw; Convex transaction rollback
means those patches cannot be assumed durable solely from a nontransactional
test double. No shared mutations are changed to fix that behavior here.

## Action-specific reconciliation contract

`webScanner:getOutcome` is a new authenticated read-only query with args/returns
validators, active scanner capability guard, actor/session/business/program/
runtime/device checks and bounded indexed reads. It returns minimal receipt
summaries, never token signature/nonce/raw QR. The HTTP-only server clock is
advisory; the query is not used as a reactive time-driven subscription.

| Operation | Durable proof / key | Retry contract |
| --- | --- | --- |
| resolve | One exact runtime/device scoped scanSessions row; ready/unexpired; discovered using existing runtime index | No resolve retry, no raw QR replay. Zero/multiple matches stay UNKNOWN |
| stamp | committed session.result, matching action/actor/scope | Existing same scanSessionId idempotency |
| redeem | committed session.result, matching action/actor/scope | Existing same scanSessionId idempotency |
| completed-stamp-redeem | result.continuationRedeemResult on same stamp session | Distinct stored continuation receipt, not primary stamp receipt |
| undo | Bound original event and its actor/runtime/device scoped scanner_undo reversal | Same eventId/runtime/device; existing timing/continuity/referral rules remain authoritative |
| referral benefit | Same customer reward, redeemedByUserId and matching canonical event/runtime/device | Resource idempotency by rewardId; not the stamp session contract |

A manual retry button is available only for stamp/redeem/continuation/undo,
using exactly the original IDs after a canonical read. It never creates a new
resolve/session. A rejection of this retry does not prove that the earlier
unknown request failed. Resolve and referral have no generic retry button.

### Conservative limitations

The existing referral handler can mark a reward redeemed without an event if
its target program is unavailable. It also returns a reused receipt for a
previously redeemed reward without binding that receipt to the current actor/
runtime. The new query confirms only the matching original actor/runtime event.
Unprovable cases stay UNKNOWN, with no false success or final failure.
There is no authorized mutation/schema change to introduce a new command log.

Refresh recovery persists only opaque runtime/device identities and an
uncertainty boolean in sessionStorage, scoped to actor/business/program. It
does not store resource IDs, operation names, arguments or QR; it cannot replay
a write. After reload during a write, the operation identity is intentionally
lost. Read-only discovery may show server history, but the primary stamp cannot
be mistaken for proof that an unknown undo/referral completed. The scanner stays
blocked for external/manual review. Fully automatic recovery of all operation
types would require a separately approved durable operation receipt design.
Unavailable/malformed storage fails closed. Nothing uses QR in a URL/storage.

These are explicit usability limitations, not claims that complete end-to-end
recovery is finished. Suspended/revoked actors and deleted business/programs
may also lose reconciliation access and require authorized external review.

## QR memory handling and camera

The Phase 2 lab worker is unchanged and still returns only length. A separate
Preview business worker returns a QR string to volatile memory for resolve.
Camera/controller state keeps only length. The transient reference is cleared
before handing control to the command engine; request arguments are cleared
after resolve finishes/fails, reset/unmount drops transient references and
stale results are discarded. Fetch necessarily holds its serialized request
until completion/abort; JavaScript strings cannot be securely zeroed or their
garbage collection guaranteed. No raw QR enters React state, logs, analytics,
storage, URL, CacheStorage, service worker or error reporting.

Rear preference, switching, inline muted playback, 640px worker decode,
single-frame pacing and visibility/page lifecycle cleanup reuse the Phase 2
Web-only controller without modifying Native. The business Worker also has
a 4s watchdog and is terminated on exit/error/scan lock.

## Native finding — no fix made

Confirmed from pinned SDK source and an executable RequestManager test:
React mutations are held while disconnected and replayed on reconnect.
The Native scanner uses these hooks for resolve, commits, undo and referral.

Scenario: cashier scans/confirms while the socket is disconnected (or loses it
before acknowledgment); SDK retains the request; cashier backgrounds or switches
business; reconnection submits/replays the retained command. UI generation
guards ignore stale results but do not cancel the SDK's pending request.
If the original actor still has server permission and timing/contracts allow,
the old business operation can execute. Same-session idempotency protects
primary commits against repeated application; it does not prohibit delayed
first execution. Actor/business server checks still apply.

Severity: high for cashier workflow integrity; not an unauthenticated bypass
or proven duplicate stamp. No physical/network-on-device reproduction is
claimed. Recommended minimal separate fix: an online-only native command
adapter, explicit UNKNOWN/reconciliation and scope invalidation, retaining
camera behavior and existing server idempotency. It needs user approval and
is not part of this change. Original Native scanner files remain byte-identical.

## Verification and CI

Automated checks cover all 20 requested scenarios through command fixtures,
actual SDK fetch/RequestManager execution, real existing backend handlers and
the additive query with a fake DB. Fake DB tests do not establish production
OCC/rollback/network timing. No business mutation was issued to a live backend.
Real browser/DEV end-to-end tests await isolated deployment and tester IDs.

The existing single verify/Preview workflow adds Phase 3 and targets Phase 2.
Cancellation and verify-before-preview remain; no push duplicate or Convex
deployment. Preview commands are explicitly false in CI even if public EAS
settings later change. Production gating and cleanup of reused asset output
are tested. Native/config/billing/schema/shared mutation boundaries are enforced.

## Next step

Finish Phase 3 first: identify/verify approved isolated DEV + test actor/business,
deploy the query there, activate allowlisted Preview, and test real authenticated
HTTP flows and unknown-result recovery. Collect DEVICE VERIFY afterward.
Do not approve real-user Web scanning or start Phase 4 on this evidence alone.
