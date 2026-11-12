# StampAix release hardening — execution ledger

Status: IN PROGRESS. No Production approval, merge, real charge or real business deletion.

## Current checkpoint — 12 November

- Exact source `c4f1a19` CI run `43161510608`: **2,640 tests PASS / zero FAIL**, types and RTL checks PASS. The boundary step rejected the two intentional authentication security updates before exports/dry-runs; this is not an export or backend transport failure. The follow-up preserves every frozen source check and dependency pin, permitting only the exact reviewed old-to-new transitions for `@auth/core` and `@convex-dev/auth`. Negative regression cases reject ranges, later releases, a different baseline, dependency removal and Expo/RN changes. Local boundary check PASS; a new exact-revision CI is required.
- Authenticated QA browser reached the customer wallet/settings. Permissions start collapsed and expand/collapse correctly; marketing remains an accessible switch. The current session has no linked business and `/business` redirects to the wallet. Owner settings acceptance remains pending the user's account clarification; no business was created, permission granted, setting saved, payment made or data deleted. Push availability reports unavailable for this account/environment, so delivery is not accepted.

- Source `6b72a0a9c50e6690126527bc4509e1e368db2525` passed **all** CI jobs in [run 43082344271](https://github.com/PetFamily2/STAMPIX_APP/actions/runs/43082344271): 2,629 tests, types, Native/RTL/scanner boundaries, Web/iOS/Android JavaScript exports, PWA artifact checks and client-secret pattern checks. Both original-DEV backend dry-runs (CLI 1.31.5 and 1.49.0) passed with existing restricted access. Neither deployed code or read private environment values; the old WebSocket error did not reproduce and its original cause remains unproven.
- That verified Web artifact was deployed to **QA only**: https://d7426237.stampaix-web-qa.pages.dev and stable https://review.stampaix-web-qa.pages.dev . Rechecked Cloudflare's existing project/account and `production-disabled` branch before upload; no domains/DNS changed. The connector was authorized for a different account, so the previously authenticated CLI connection was used without expanding access. Public sign-in loaded and a safe no-pending-action PWA update completed. Authenticated settings acceptance awaits the owner's login; the tab was explicitly made visible after the owner reported it was hidden.
- Subsequent candidate adds **per-batch** billing revalidation, including already-versioned jobs. New active SUMIT, new pending checkout or renewed legacy billing stops before the next destructive batch. Legacy terminal evidence may survive only the deliberate removal of its own old subscription rows; canonical account and new payment/renewal checks remain live. No real deletion was attempted.
- Subsequent dependency candidate pins compatible Auth peers, resolves critical package advisories, applies reviewed same-major security updates and backports the vendor's linear URI decoder while preserving the old CommonJS/form API. [Dependency report](DEPENDENCY_HARDENING_20261112.md) records exact scope and remaining advisories. The application's shared dependency junction is preserved; installations and patches are isolated from Cursor/original source.
- Full local checkpoint after the security pins and per-batch gate: **2,638 PASS / zero FAIL**, 200 files, 13,054 assertions; types PASS. The later URI backport adds two meaningful regression cases and Metro's alternate entry becomes a compatibility wrapper; these require their own final full CI/export/dry-run. Focused URI/Bearer/quote/archive tests: five PASS.
- [External material inventory](EXTERNAL_MATERIAL_INVENTORY_20261112.md) is complete for the stated local directories and two discovered Drive documents. No external assets or credentials were moved or copied into Git. Candidate/snapshot folders remain distinct from the protected active game worktree.
- Four global Biome baseline errors in three frozen source files remain visible; no lint/safety rule was disabled. Native signed builds are BLOCKED on this Windows host: Java/ADB/Gradle/Xcode executables were not available. This is distinct from passing Native JavaScript exports and still-open physical-device acceptance.

Latest changes after `6b72a0a` are not yet represented by the hosted QA code or live original DEV backend. Do not infer authentication/provider/deletion acceptance from the older QA artifact or a dry-run.

## Integrated milestone (11 November)

- Draft integration PR: https://github.com/PetFamily2/STAMPIX_APP/pull/16 (base main). Initial safety commit `7fda7a2` passed GitHub verification run `43078848906`; later changes require their own CI.
- `e239d19` merged the reviewed two PWA commits. Conflicts were resolved semantically: retain program tiles, saved-permission-only camera startup, current empty/error guidance and recovery locks; add bounded camera restart/decoder recycling, short subscription guidance and explicit reward/undo confirmation. Confirmation is cleared when command state changes. Unknown success receipts no longer claim a stamp was added. Billing navigation is injected by the route, keeping the scanner independent of Expo routing.
- `497e465` integrated PR #14 without redoing its cleanup: seven removed artifacts and six unchanged archived documents. Remaining historical script path strings are historical change allowlists, not reads of missing documents; do not rewrite their authorization history or execute their synthetic provisioning flows.
- Complete static route inventory: 144 files, 89 ACTIVE, 46 COMPATIBILITY, nine UNKNOWN. This is not physical-device acceptance and authorizes no screen removal. Merchant onboarding is retained.
- Latest full local regression after integrated PWA, cleanup, scoped quality fixes and compact settings: **2,626 PASS / zero FAIL**, 198 files, 13,009 assertions. TypeScript PASS. Later dry-run mode tests: **17 PASS / zero FAIL** across three focused files, including existing permission and icon boundary tests. Full exact-candidate CI remains required.
- Address resolution callbacks now have complete dependencies; delayed work still uses generation and address-selection checks. Address input validation retains the same C0/C1 control-character rejection with Unicode Cc. Recommendation own-property checks avoid inherited keys; test-only assignment expressions and implicit Bun global were corrected.
- Safe formatting/import cleanup applied to 125 reviewed candidate files. No formatter was applied to the protected Cursor paths or frozen Native camera/billing/push files. The icon dependency test now parses named exports with TypeScript AST rather than assuming single-line exports; upstream glyph, symbol-set and barrel restrictions remain enforced.
- Business profile groups and browser permissions now start collapsed, preserving mounted form state. The account Push subscription is a real accessible switch. Camera/location still reflect browser-owned permissions and are not represented by a fake revocation toggle. Deletion entry points were not expanded before backend acceptance.
- Global Biome has **four retained baseline errors in three frozen files** (`config/appConfig.ts`, `contexts/PushNotificationsContext.tsx`, `convex/scanner.ts`), plus existing warnings. The global lint gate is not claimed PASS. No rule was disabled to hide them.
- Added an exact-revision, same-repository integration CI dry-run for Convex CLI 1.31.5 and isolated 1.49.0. Both use existing DEV deployment access without added permissions; neither can enter backend sync, hosting, EAS private-env pull or Production. The application SDK/lockfile are unchanged. This comparison is diagnostic, not evidence that an upgrade fixes WebSocket transport.

No live backend deployment, real payment, business deletion, Production/DNS action or main merge occurred. Issue #15 remains open until exact-candidate backend and provider verification.

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
| Issue #15 | RevenueCat-only permanent deletion gate omitted SUMIT canonical account | Provider-neutral read gate: active/trialing/past_due, missing/duplicate account, unverified checkout including local expiry, failed reconciliation, inconsistent cancellation and stale proof all block. Recent processed cancellation must match business, recurring item and canonical event. Legacy RevenueCat renewal remains blocked. Pristine never-billed canonical account remains eligible. | LOCAL TYPES/TESTS PASS; latest exact CI and live backend acceptance pending |
| Existing deletion jobs | A job accepted by the old gate or changed billing could still enter a batch | Every batch now revalidates billing transactionally; terminal legacy evidence is retained only after its deliberate source-row purge. | LOCAL TEST PASS; no real deletion |
| Checkout race | A direct checkout-record helper lacked an explicit deletion-state guard | Reject checkout during queued/running/in-progress/failed deletion. No new provider calls. | LOCAL TEST PASS |
| Deletion UI | Unknown billing could still show an enabled destructive action | Honor server deletionEligible and show verification/pending-payment recovery guidance. No delete action executed. | TYPES / browser pending |
| CI tests | Two tests asserted obsolete literal JSX rather than Native fallback plus Web override | Canonical pure destination resolver, runtime Native/Web assertions and source wiring checks preserve C2C/B2B distinction. | 27 focused tests PASS |
| CI infrastructure | PWA run 42871684918 verify PASS; hosting failed at BACKEND_DRY_RUN with WebSocket diagnostic | Both CLI versions pass current same-key, existing-DEV dry-runs. Original cause remains unproven; guard preserved, no permission expansion. | CURRENT DRY-RUN PASS |
| Biome performance | Generated exports/dependencies were included in repository scans | Exclude only .tmp, _tmp, node_modules, .tools, dist and web-build. Actual application source remains covered; existing style debt is not waived. | Four retained baseline errors; global check FAIL |

94 local deletion/SUMIT tests passed before the destination-resolver change. Full baseline: 2,613 passed / 3 failed; two real source-contract failures above plus a local safe.directory execution failure. The identity test passed with a per-command safe.directory override; no global Git trust change. These tests use local test harnesses, not a new Convex database or product acceptance fixtures.

## Remaining ordered work

1. Finish critical review, negative tests, exact-candidate types and full regression. No destructive live test.
2. Diagnose backend dry-run transport; preserve the guard and separate external failure from code failure.
3. DONE: reviewed/integrated named PWA (`e239d19`) and cleanup (`497e465`); protected game worktree remains untouched.
4. DONE static route inventory; retain UNKNOWN/dynamic/deep-link candidates for acceptance. No route becomes ORPHAN merely because no import was found.
5. DONE for the seven removed artifacts and six archived docs. Keep historical/manual tooling whose retirement is not proven.
6. Complete scoped security, QR, billing, privacy, operations and dependency review; assess Native build availability without store publication.
7. DONE within the stated read-only local/Drive inventory scope; no external/synced asset removals.
8. IMPLEMENTED compact settings and account Push switch; browser/phone acceptance awaits login. Browser-owned permissions remain truthful and separate. No deletion entry expansion before backend safety acceptance.
9. Exact integration CI, QA export, physical-device and payment acceptance; prepare Draft PR. Stop before main merge and any Production action.

## External acceptance still open

SUMIT TEST checkout/lifecycle/refund; original-data new-user and owner onboarding; physical two-phone QR/PWA/Push; provider/role/campaign acceptance; monitoring, backup/restore and rollback; permanent domains and explicit Production authorization. Existing-account Email OTP was accepted on 10 November; Apple is unconfigured and hidden in Web. GAME-01/02 stay Post-launch.
