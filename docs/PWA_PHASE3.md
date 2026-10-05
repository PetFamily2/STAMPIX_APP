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

## Phase 3B verification — 2026-10-05

Phase 3B continues from `93b4414f37ef1a037a586b1482848cf3ecd4ebd2`.
Only verification tests and this documentation change. Native, Web runtime,
the additive query, existing mutations, schema, rollout flags and CI remain
unchanged. No Phase 4 work is authorized or started.

### Deployment and live-test blocker

This session has no Convex deployment key, selected deployment, CLI login or
EAS login/token. The available Convex connector provides setup/scaling guidance,
not deployment introspection or execution. The authorized dashboard was opened;
secure authentication was offered, but subsequent verification at the Convex
origin still showed its sign-in screen. No approved deployment identity, type,
URL, Production comparator or authenticated test actor/business was established.
No deploy, Convex sync, live mutation or commands-enabled Preview was attempted.

Automatic review rejected an attempted post-handoff observation on a Google
account origin: the handoff did not establish provider authorization. The
provider was not inspected or bypassed. Verification navigated directly to the
authorized Convex origin and confirmed the sign-in wall. This is an access
blocker, not evidence that any known deployment is Production or DEV.

Convex deployment is project-wide (functions, indexes and schema), not a CLI
single-query upload. Before a future push, prove the exact DEV/Preview target
and scoped credential, fetch the remote code baseline, compare it with this
checkout, and review the dry-run/configuration diff. Proceed only if the sole
effective backend change is `webScanner:getOutcome`, with unchanged schema,
indexes, auth, components and existing mutation modules. A different remote
baseline must not be overwritten under the query-only authorization.
See https://docs.convex.dev/cli/reference/deploy and the actual pinned CLI.

### Reproducible Native verdict

Run `bun test lib/__tests__/webScannerCommands.test.js -t "Phase 3B"`.
Seventeen added checks execute the pinned SDK RequestManager and original
transaction-generation helpers. For each of resolveScan, commitStamp,
commitRedeem, commitCompletedStampRedeem, undoLastScannerAction and
referrals.redeemReferralBenefit, they prove both NotSent retention and
Requested-without-acknowledgment replay. The original requestId/arguments are
retained, with one in-flight mutation, not a new SDK transaction per retry.

The tests also prove generation invalidation can suppress the eventual result
without cancelling the SDK request, acknowledged success is retained until its
server timestamp is reflected, and definitive rejection removes the request.
Source checks bind all six hooks to React mutations and show Staff reuses the
business scanner. These are executable SDK/protocol reproductions, not physical
Native or live Convex reproductions. Synthetic acknowledgments do not prove a
server commit. Account changes do not establish an auth bypass; server auth and
session-actor checks remain authoritative.

Verdict: high-severity delayed-first-execution risk remains in Native. Recommend
a separately approved scanner-only online HTTP adapter with UNKNOWN/reconciliation,
one pending command and scope invalidation, retaining the camera and server
idempotency. Do not merely add navigator.onLine: it cannot remove an already
queued React mutation. Do not close the app-wide Convex client to cancel one
scanner write. No Native fix was implemented.

### Refresh: minimal recommendation, not implemented

For positive reconciliation after reload, a new schema is not initially needed.
Before sending, atomically persist a versioned **read-only reconciliation
descriptor** containing operation kind, opaque session/event/reward lookup IDs,
actor/business/program/runtime/device and uncertainty. Never persist QR, auth,
mutation arguments, a submit instruction or a serialized request. A restored
descriptor must feed only queries; it must never reconstruct or dispatch a
write or enable retry-after-reload. Validate it, bind scope on the server and
keep UNKNOWN locked until the action-specific existing receipt is confirmed.

Existing scanSession.result, continuation receipt and event reversal provide
durable positive proofs. Lost resolve can use the existing exact-runtime
discovery. Missing/ambiguous proof still stays UNKNOWN; a descriptor alone
cannot establish durable failure or fix eventless referrals. A dedicated durable
command-receipt design may be needed for fully automatic terminal recovery,
but a new receipt table/optional schema fields are not prerequisites for this
minimal positive-recovery option. No descriptor or schema change was made.

Rollback: preserve the existing opaque uncertainty checkpoint; unknown/new
descriptor versions fail closed and are never deleted to silently unlock.
Old clients continue using the old conservative recovery. No stored write can
replay because the restored descriptor has no write path.

### Referral: minimal recommendation, not implemented

Existing executable tests in `convex/__tests__/referralRedemptionSemantics.test.js`
confirm active-program event creation, inactive/missing-program redemption
without an event, repeated active redemption reusing one event, and eventless
repeat rejection. The reconciliation query cannot infer runtime/device identity
from redeemedAt/redeemedBy alone. This is not fixable by broadening the query to
accept any redeemed reward as same-operation success.

The smallest preventive fix is to reject an unavailable/missing/mismatched
target program before changing a granted reward, and atomically create the
canonical event and redeemed reward together for permitted new redemptions.
It needs no schema addition, but changes an existing shared mutation's behavior
(including Native). Phase 3B authorizes neither that mutation change nor Native
behavior changes, so it is only proposed. Keep legacy eventless rows UNKNOWN
for authorized manual review; never fabricate historical proof or reopen a
redeemed reward automatically.

If product semantics must continue permitting eventless redemption, durable
scoped operation evidence is required. A no-schema candidate is an optional
scanSessionId argument, validated against actor/business/customer/runtime/device,
using the already-defined reward.redemptionScanSessionId and session.result
(v.any) to store a versioned immutable referral receipt in the same transaction.
This still requires an explicitly approved mutation/query contract change and
design review; legacy calls remain supported and cannot be retroactively proven.
Alternatively use an optional reward receipt field or dedicated receipt table;
that is an additive schema proposal and implementation must stop for approval.

Rollback/backward compatibility: do not delete receipts or rewrite old rows.
Deploy tolerant receipt readers first, then optional writers; old argument
shapes remain valid. Rolling writers back means old eventless behavior can
reappear, so keep Web disabled or require review rather than claiming safety.
No retroactive receipt, migration, mutation or schema implementation occurred.

### A/B recommendation

A. Phase 3 Web is **not closed**: no approved target, query deployment or live
authenticated all-action/network E2E evidence. Commands remain disabled.
B. Recommend a separate approved Native reconnect fix before Phase 4; its
delayed-execution risk is verified at SDK level and the fallback remains affected.
Do not approve Phase 4 or real-user Web rollout on the current evidence.


## Phase 3C-1 — guarded GitHub Actions DEV audit

Authorized scope: use the existing `CONVEX_DEV_DEPLOY_KEY` repository secret only
inside Actions, with EAS Preview public DEV configuration. No local credential
transfer, Native fix, Production deploy, main merge, schema or mutation changes.

The known dashboard Development deployment is `utmost-fennec-280`; the separate
Production deployment is `aware-llama-850`. `dev/brq-prts` is its dashboard
reference. Hostname alone does not establish deployment kind: the exact existing
key must match `dev:utmost-fennec-280|…`, with a nonempty secret suffix. Neither
the key nor any environment/CLI RPC response is printed.

`business-web-preview-deploy.yml` now contains only `workflow_dispatch`. It
requires the exact current Phase 3 branch/SHA, existing successful verify job,
repository owner, and explicit known DEV confirmation. It does not create a
duplicate verify or automatic push/PR backend deployment. Because no workflow
currently exists on main, the first remote audit can also be invoked by a
targeted manual rerun of the existing Preview job. That path permits **audit
only**, never sync. Initial PR runs still build commands-disabled Preview.

Preflight fails closed for malformed/ambiguous URLs, paths, query strings,
userinfo, ports, other deployment targets, Production equality, stale selectors
and any key mismatch. It reads remote module/config hashes and attempts the
read-only function-spec contract using the existing key. If its least-privilege
permissions do not allow that query, it records the limitation without expanding
access.

Before sync, the pinned 1.31.5 CLI privately bundles a baseline with the sole new
query excluded. A complete dry-run finish diff must show zero existing backend,
schema, index, auth, cron, runtime or component changes. The candidate must add
exactly `webScanner.js`, with no removal or replacement, while component, Node
and app configuration bundles remain identical. Unknown RPC fields fail closed.
Any drift stops the phase; no baseline is overwritten to force deployment.

The pinned CLI's `start_push`/`wait_for_schema`/`finish_push` protocol is used with
`dryRun: true` for the audit. These requests evaluate staged configuration without
activating it; they are not business writes. Actual activation is allowed only
for `workflow_dispatch` sync mode, after rechecking target/key and remote hashes
immediately before activation. Private start-push payloads contain credentials
and deployment environment values: they are memory-only; the temporary generated
request is kept in a 0700 directory, chmod 0600, then deleted. The only uploaded
artifact is sanitized status, identifiers, hashes and contract metadata.

Commands stay false until the guarded query deployment and approved synthetic
test actor/business access are established. Live E2E, network fault injection and
physical device verification must never be inferred from passing unit tests or
from successful configuration inspection. Phase 3C-2 / Phase 4 have not started.

The Actions-only manual audit launcher has no Convex/Expo credentials. Its first
PR run is a no-op; a targeted owner-initiated rerun can dispatch the historically
registered workflow against the exact verified/current branch revision. The bot
is allowed only to dispatch audit mode, never sync. Real sync still requires an
owner-initiated dispatch and all deployment guards. The first audit attempt at
79065a0 stopped before remote access because Preview checkout was shallow. Full
history checkout fixes that local ancestor check. Node runtime and dependency
metadata are also compared explicitly, since the component diff alone does not
cover every external Node configuration field.
