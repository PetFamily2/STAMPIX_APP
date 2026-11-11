# StampAix release hardening — execution ledger

Status: IN PROGRESS. No Production approval, merge, real charge or real business deletion.

## Verified starting state

- Main: e7c2e2d4835115cc88ce2b2ea4f673933ac511d5.
- Launch / Draft PR #13: b7f8676422da46667097a7d577f58d5736a496d6; clean local tree before work.
- PWA: 37c4b83fd18dc1125342ff608c28638e9634685b; two unique commits (ad5fca0, 37c4b83), both co-authored with Cursor. These are scanner/onboarding follow-ups, not the protected unpublished game branch. Integration requires semantic review first.
- Cleanup / Draft PR #14: 275ce6caa47276c710eea1a586f3bd996086e375; seven removed artifacts and six archived documents already exist there. Do not redo or count them as new removals.
- Work branch: integration/release-hardening-20261111, created from the clean launch HEAD. No branch reset or force push.
- Cursor worktree remains agent/game-album-001 with uncommitted album, character assets, wallet/navigation, memberships and routing-test work. Read-only inventory confirmed it; no edits or integration. Remote game branch was not returned by ls-remote.
- Read root AGENTS, current architecture, handoff and the prior native review from cleanup branch. Current verified state overrides historical handoff SHAs.

## Critical remediation

| Area | Finding | Change / evidence | Status |
|---|---|---|---|
| Issue #15 | RevenueCat-only permanent deletion gate omitted SUMIT canonical account | Provider-neutral read gate: active/trialing/past_due, missing/duplicate account, unverified checkout including local expiry, failed reconciliation, inconsistent cancellation and stale proof all block. Recent processed cancellation must match business, recurring item and canonical event. Legacy RevenueCat renewal remains blocked. Pristine never-billed canonical account remains eligible. | CODE IMPLEMENTED; review/types/integration pending |
| Existing deletion jobs | A job accepted by the old gate could still enter the worker | Pre-safety-version jobs must pass the new gate before purging. New jobs retain a versioned authorization snapshot for bounded continuation. | LOCAL TEST PASS |
| Checkout race | A direct checkout-record helper lacked an explicit deletion-state guard | Reject checkout during queued/running/in-progress/failed deletion. No new provider calls. | LOCAL TEST PASS |
| Deletion UI | Unknown billing could still show an enabled destructive action | Honor server deletionEligible and show verification/pending-payment recovery guidance. No delete action executed. | TYPES / browser pending |
| CI tests | Two tests asserted obsolete literal JSX rather than Native fallback plus Web override | Canonical pure destination resolver, runtime Native/Web assertions and source wiring checks preserve C2C/B2B distinction. | 27 focused tests PASS |
| CI infrastructure | PWA run 42871684918 verify PASS; hosting failed at BACKEND_DRY_RUN with WebSocket diagnostic | No evidence yet proving code or network cause. Do not bypass dry-run or broaden deployment-key permissions. | INVESTIGATING |
| Biome performance | Generated exports/dependencies were included in repository scans | Exclude only .tmp, _tmp, node_modules, .tools, dist and web-build. Actual application source remains covered; existing style debt is not waived. | BASELINE SCAN pending |

94 local deletion/SUMIT tests passed before the destination-resolver change. Full baseline: 2,613 passed / 3 failed; two real source-contract failures above plus a local safe.directory execution failure. The identity test passed with a per-command safe.directory override; no global Git trust change. These tests use local test harnesses, not a new Convex database or product acceptance fixtures.

## Remaining ordered work

1. Finish critical review, negative tests, exact-candidate types and full regression. No destructive live test.
2. Diagnose backend dry-run transport; preserve the guard and separate external failure from code failure.
3. Review/integrate the named PWA and cleanup changes in this integration branch; do not integrate the protected game worktree.
4. Generate a complete route/dependency inventory. No route becomes ORPHAN merely because no import was found.
5. Verify retirement/archive candidates with CI/script/deep-link references; preserve unknown/manual dependencies.
6. Complete scoped security, QR, billing, privacy, operations and dependency review; assess Native build availability without store publication.
7. Inventory project-local/Drive material by evidence, without deleting or moving external/synced assets. Drive search found a current 2.0 master document and an older untitled document; content classification remains pending.
8. Carry forward the requested compact business settings: collapsed groups and real consent controls, with an owner-only deletion entry only after the safety gate is verified. No permissions changed yet.
9. Exact integration CI, QA export, physical-device and payment acceptance; prepare Draft PR. Stop before main merge and any Production action.

## External acceptance still open

SUMIT TEST checkout/lifecycle/refund; original-data new-user and owner onboarding; physical two-phone QR/PWA/Push; provider/role/campaign acceptance; monitoring, backup/restore and rollback; permanent domains and explicit Production authorization. Existing-account Email OTP was accepted on 10 November; Apple is unconfigured and hidden in Web. GAME-01/02 stay Post-launch.
