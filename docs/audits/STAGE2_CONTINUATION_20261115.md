# Stage 2 continuation — 15 November 2026

## Working source

- Worktree: `C:/Users/Barak Perez/.codex/.chatgpt-projects/g-p-6915fa700f2881919d81d988ba93806d/STAMPIX_UI`
- Branch: `performance/stage2-stability`
- HEAD after the first closure commit: `2df345f`
- The worktree is clean at that commit before any subsequent work.

Do not edit `C:/STAMPIX_FOLDER/STAMPIX_APP`: it is the preserved dirty historical QA worktree. The canonical worktree's `origin` is currently the local preserved worktree, not GitHub. GitHub's `performance/stage2-stability` ref is still `92538d201acc0225e9ce6f4f9ae1489c8aab80f2`; do not push until a safe GitHub remote/branch relationship is explicitly restored and the newer canonical history is reconciled.

## Completed in `2df345f`

- Corrected Git-backed CI tests to use an actual blob SHA (`git rev-parse <commit>:<path>` and `git cat-file blob`) and to set only the current worktree as safe for each subprocess invocation.
- Corrected the identity test's `git ls-files` invocation for the same Windows ownership condition.
- Formatted the Stage 2 campaign/referral test fixtures required by Biome.
- Retired unsafe legacy array admin search and audit contracts after authorization. The supported UI already uses cursor APIs; retired callers receive `ADMIN_SEARCH_PAGINATION_REQUIRED` or `ADMIN_AUDIT_PAGINATION_REQUIRED` rather than causing global `.collect()` reads.
- Updated the Stage 2 audit MD/JSON and regression coverage for sparse matching, authorization, deleted-business projection, and legacy retirement.

## Evidence

- `bun test --max-concurrency 2`: 2,691 passing tests across 210 files after the Git test fixes.
- `bun run type-check`: passed.
- `bun run check`: exit 0; repository has existing Biome warnings (no error diagnostics).
- Focused Stage 2 suite: 48 passing tests.
- `git diff --check`: passed before the commit.

## Remaining code work

1. Replace direct generic push delivery: `convex/pushNotifications.ts` performs Expo HTTP, and mutation paths in `campaigns.ts`, `referrals.ts`, `business.ts`, and `businessReferralEngine.ts` call it. Reuse the claim/action/finalize model in `convex/smartManagerDelivery.ts` to create a generic transactional outbox with stable delivery keys, leases, known-failure retry limits, no automatic ambiguous retry, recovery of pending/expired leases, and delivery logs.
2. Finding 61 remains open: `convex/business.ts:getBusinessesNearby` reads every active business. Add a maintained geographic-cell field/index plus a batched, idempotent backfill path; query only intersecting cells and retain exact Haversine sort/filter. Existing rows must remain discoverable while the backfill runs.
3. Findings 52–53 and 56–57 remain open: campaign audience and campaign history still use full reads. Design a paginated/materialized run contract before changing limits; preserve consent filtering and repeat-run identity.
4. Findings classified `improvement_required` in `STAGE2_COLLECT_REVIEW.{md,json}` still require individual aggregate/cursor redesigns or evidence-backed closure.
5. `STAGE2_FORM_INVENTORY.md` still lists persistent form surfaces without shared dirty/route/PWA guards or server-side versions. Do not claim the 69-surface requirement complete.

## External acceptance gates

- No isolated approved Convex environment was used; no synthetic data, production data, backend deployment, or schema migration was run.
- No physical Web/PWA, Android, or iOS device validation was performed.
- No real SUMIT terminal transaction was performed.
- PR #18 and GitHub Actions cannot be updated from this worktree until its remote mismatch is resolved safely.
