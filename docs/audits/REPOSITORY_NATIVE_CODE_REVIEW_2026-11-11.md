# StampAix — Repository, Native and CI review (2026-11-11)

**Status: READ-ONLY REVIEW OF PRODUCT CODE; NOT A PRODUCTION APPROVAL.**  Source of truth: launch `b7f8676422da46667097a7d577f58d5736a496d6`, native/PWA follow-up `37c4b83fd18dc1125342ff608c28638e9634685b`. Audit branch is isolated from `main` and active development; no product code changed.

## 1. Completed isolated cleanup
- Removed seven historical items from the audit branch only: `convex/schema.ts.bak`, `convex/scanTokens.ts.bak2`, `convex/scanTokens.ts.bak3`, `fix-carousel-pagination.patch`, `scripts/patch_discovery_join.js`, `seed-output.json`, `.github/workflows/product-provider-reuse.yml`.
- The disabled workflow declared `if: false`; the carousel/discovery patch paths no longer match active source; the seed output contains historical demo IDs.
- Moved six **unchanged** historical documents to `docs/archive/legacy-development/`: `PWA_PHASE1.md`, `PWA_PHASE2.md`, `PWA_PHASE3.md`, `PWA_RELEASE_CANDIDATE.md`, `PREVIEW_GOOGLE_AUTH.md`, `PREVIEW_PROVIDER_REUSE.md`. Updated the handoff link and docs index.
- **Safety qualification:** source/CI/dependency inspection is not a full test. Do not merge without `bun test`, `bun run type-check`, RTL/Native contracts and Web export from the cleanup SHA.

## 2. Other leftovers — no deletion authorized, usage classification
| File/group | Finding | Decision |
|---|---|---|
| `scripts/patch_debug_demo_noauth.js`, `scripts/patch_debug_demo_qr.js` | Historical source-rewriting helpers targeting `convex/debug.ts`; not package scripts nor part of active examined workflows | **Likely obsolete**, verify external/manual usage before archival |
| `scripts/patch_seed_mvp_business_qr.js`, `scripts/patch_seed_mvp_debug_version.js`, `scripts/patch_seed_stable_ids.js` | Historical one-off source rewriting of `convex/seed.ts`; no package script entry | **Likely obsolete**, verify manual operations before archival |
| `metro.config.js` and `metro.config.cjs` | Duplicate Metro configurations; only `.js` includes Web icon resolver | **Keep both pending an actual Native/Web resolver test** |
| `scripts/phase3-preview/` and `scripts/phase3c1-preview-e2e.mjs` | Older isolated/synthetic QA runner, still internally linked to its fixtures and runner scripts; superseded for ordinary shared DEV acceptance | **Archive as a coordinated group only after external CI/manual references checked** |
| `scripts/reuse-existing-preview-providers.mjs` | Historical provider-copy helper; its prior workflow is retired | **Likely obsolete**, verify manual dependencies first |
| `convex/debug.ts` and `convex/seed.ts` | Export internal mutations able to change identities/business/demo data; not ordinary UI code | **Do not remove blindly**; restrict production exposure and establish administrative runbook |
| `scripts/repair-ms-package.mjs` | Invoked by `package.json` `postinstall` | **KEEP — active build dependency** |
| `patches/expo-sharing@14.0.8.patch` | Referenced in `package.json` `patchedDependencies` | **KEEP — active dependency** |

## 3. Native screen and route inventory — first-pass code review
- All eight `screens/*.tsx` are wired to route wrappers: `AdminReferralsScreen`, `AdminSupportInboxScreen`, `BusinessHelpSupportScreen`, `BusinessSettingsScreen`, `CustomerAccountDetailsScreen`, `CustomerHelpSupportScreen`, `SettingsScreen`, `StaffSettingsScreen`. **None is proven orphaned by route wiring.**
- `app/(authenticated)/merchant/onboarding/*` is **ACTIVE**: `BUSINESS_ONBOARDING_ROUTES.entry` and post-auth routing reference it. **Do not remove** the merchant directory wholesale.
- Compatibility/alias candidates to inspect before removal: `merchant/index.tsx`, `merchant/analytics.tsx`, `merchant/customers.tsx`, `merchant/qr.tsx`, `merchant/store-settings.tsx`, `merchant/profile-settings.tsx`, `merchant/support-inbox.tsx`; `(business)/programs.tsx`, `(business)/campaigns.tsx`; `(customer)/customer-card/[membershipId].tsx` and `app/preview-qa.web.tsx`. Many intentionally redirect or re-export a canonical screen, and may support deep links.
- Business and Staff both use `BusinessCustomerCardScreen` via different route files; that is intentional sharing, not proof of duplication.
- Native business/customer/staff routers and Web business/staff routers are deliberately separate. A Web alternative **does not imply** the Native screen can be removed.
- **Unresolved:** full reachability of all `app` paths, dynamic hrefs, deep links, tests and native bundle import graph. This requires a complete static AST import/route audit plus a device regression run; do not delete screens now.

## 4. Concrete code quality / correctness findings
1. **P1 — business permanent deletion vs SUMIT:** `convex/businessDeletion.ts:getRevenueCatBillingState` queries only `provider='revenuecat'` and gates deletion based on that result. Current Business Web purchases use SUMIT in `businessBillingAccounts`. This can misreport that renewal is inactive for a paid SUMIT business. A provider-neutral billing/lifecycle check and strong tests are needed *before allowing destructive business deletion*. Do not test by deleting actual business data.
2. **P1 — CI is not green:** launch SHA `b7f8676`, run 42859723770: 2,599 pass, **two source-contract tests fail** — Android settings child fallback and B2B/C2C referrals placement. Actual code uses `fallbackHref={campaignsHref}` with a canonical default, but tests expect a literal `fallbackHref=\"/(authenticated)/(business)/campaigns\"`. Confirm navigation intent, then update UI or contract test appropriately; do not hide failures.
3. **P1 — QA deployment blocked:** PWA SHA `37c4b83`, run 42871684918: verify job passed; shared-web deployment failed during `BACKEND_DRY_RUN` due to Convex WebSocket CLI communication. Environment/network cause not yet proven. No evidence the updated SHA is hosted.
4. **P2 — legacy scan service attribution:** `lib/services/scanService.ts` assigns `actorUserId: membership.userId` with an explicit placeholder comment that the true actor is staff. Verify this file is unused by authoritative scanner paths before removal; if used, it is an audit integrity issue.
5. **P2 — business inbox scope:** `app/(web-business)/business/inbox.tsx` reuses `components/WebInbox.tsx`; `convex/webInbox:list` queries `messageLog.by_toUserId` for the signed-in person, not a business-wide operational inbox. This is known UX debt, with a unified business action center planned for 2.0; do not accidentally expand privileges.
6. **Code maintainability:** several QA tests assert literal source substrings rather than only observable behavior. These can fail on safe refactors or pass without proving real UX. Keep safety contracts but add runtime/behavioral checks.

## 5. Safe route to main
- `main` `e7c2e2d` is 280 commits behind launch branch `b7f8676`.
- PWA `37c4b83` and launch have diverged: PWA has two unique commits and launch has 30 commits not in PWA; integrate/cherry-pick after review, not by blind reset or force push.
- Cleanup review is Draft PR #14 targeting launch PR #13 branch; **do not merge either until exact-candidate CI and user approval**.
- Sequence: fix CI failures and destructive billing bug; review/port PWA fixes; run Native + Web typecheck/tests/export, full E2E with original DEV and real device acceptance; complete SUMIT TEST; review one integrated PR to `main`; no Production deploy without explicit approval.

## 6. Review gaps / non-claims
This is a focused repository/route/CI inspection, **not** an exhaustive inspection of all 1,017 tracked source files, a complete AST reference analysis, a full security penetration test, or a successful Native build. No live Convex data were inspected or changed. No code was executed or deployed as part of this review.

## 7. Additional dependency inspection (same day)
- Searched the complete set of **48 tracked `scripts/` files** and **34 top-level active `docs/*.md` files** for exact names of the six archived docs and seven removed artifacts. The active handoff was the only non-archived document outside the old phase files referencing the superseded release-candidate path; it was updated in this branch.
- Legacy `scripts/lib/phase3c1-preview-guard.mjs` hardcodes paths to the former `docs/PWA_RELEASE_CANDIDATE.md` and `docs/PREVIEW_GOOGLE_AUTH.md`; `scripts/verify-web-phase2-boundaries.mjs` names the old PWA_PHASE2 path; `scripts/reuse-existing-preview-providers.mjs` names the retired workflow/doc. These are historical tooling references; **do not claim the old isolated QA scripts still operate after archiving**. They should be retired/archived as a coordinated group after confirming no manual workflow needs them.
- No references to the removed one-off patch/helper filenames were found in the scanned active scripts/docs. This is stronger than filename-only inference but does **not** prove full absence from dynamic calls, local tools or undiscovered external CI jobs.
- CI evidence from 2026-11-10: PWA run **42871684918** had a green verify job and a failed shared-web deploy; exact failure includes `SHARED_NODE_FAILED` at `BACKEND_DRY_RUN`, diagnostic word `WebSocket`. Launch run **42859723770** had 2,599 passing / 2 failing tests.
