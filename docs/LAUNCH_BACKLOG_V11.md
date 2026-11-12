# Execution override — 2026-11-11

Follow-up status: SUMIT wire fix 3a426be is CI-verified and live on original DEV. TEST payment form and physical-phone Push opt-in require the user's response; neither is accepted yet. Scoped dependency updates have 2,645 passing local tests/types and 12 remaining audit records, with exact CI pending. Backup dashboard is unauthenticated; no restore/clone/export was performed.

Current advancement: Push configuration and verified-candidate QA/original-DEV sync completed without data reset/import or Production. Delivery/device tests remain open. New provider-wire defect (numeric SUMIT success and ILS enums) fixed with negative tests; latest exact CI/sync is required. Existing TEST charges are declined and cannot close paid entitlement/onboarding acceptance.

Owner settings/route acceptance advanced: existing business and collapsed groups observed; Campaigns and Referrals open canonical Web routes. Do not mark phone More-menu or all onboarding accepted. Push requires original-DEV configuration first: enable/environment and all three VAPID settings are empty in a read-only presence audit. No configuration was changed; delivery remains a launch gate.

Resolved CI follow-up: f76c9af / run 43166643585 passed 2,641 tests, types, Web/iOS/Android JavaScript exports, PWA/client checks and both original-DEV dry-runs without deployment. Keep live-backend/provider, owner settings and physical-device/Push acceptance open; do not infer them from CI.

12 November: retain open gates for exact-candidate CI/export, owner-account settings and Push delivery. c4f1a19 has 2,640 passing tests and passing types, but the historical dependency guard stopped the run before export/dry-run; the narrowly reviewed auth-version transitions require a follow-up CI. Current QA login reaches a customer account without a linked business, not owner acceptance.

Safety remediation and reviewed branch integration are tracked in [the release hardening ledger](audits/RELEASE_HARDENING_EXECUTION_20261111.md), Draft PR #16. SUMIT deletion safety is implemented locally; live backend/provider acceptance is still open. Preserve all backlog requirements, GAME-01/02 as Post-launch and unpublished Cursor work. Global lint, exact-candidate CI/export, payment acceptance and physical-device tests must not be inferred from earlier passing revisions.

# StampAix launch backlog — v11 control baseline

## 2026-11-10 execution update

- Existing-account Email OTP acceptance PASSED: user confirmed success; authenticated browser reached /business on QA 0ce6a74 with original business and 147 stamps/9 redemptions. Provider reported delivered for the latest attempt. Earlier bounced/suppressed attempts are not claimed globally fixed; new-user, expired/incorrect-code and recovery acceptance remain separate. be229a6 is deployed to stable QA / immutable https://f8ebbb4a.stampaix-web-qa.pages.dev and hides unconfigured Apple on Web only. Apple connection remains unconfigured; no paid Developer enrollment or Native changes.

- Authentication incident: original DEV readiness confirms Google/Email configured, Apple not configured. Presence-only audit confirms missing Apple ID/secret; Web must hide unconfigured Apple, preserving Native. User has no confirmed Developer account. This does not complete Apple integration.
- Email provider read APIs succeed and sender domain is verified (not sandbox). One login OTP today hard-bounced Permanent/General without detailed cause; recipient/code/key were not exposed. User reports no code arrival. Existing-address delivery and complete OTP login remain unaccepted; a browser form is prepared for user testing. Fifty-nine focused availability/OTP/address tests pass. Configuration presence is not delivery acceptance.

- Follow-up visual acceptance: 0ce6a74 deployed to stable review and immutable https://9b4cdd6c.stampaix-web-qa.pages.dev . Authenticated browser at 390×844 confirmed referral customer tab, menu-to-campaign navigation and active/inactive/archive filters with original 1/10/20 counts. Restore control was observed but not executed; no settings save or campaign sending occurred. Eleven focused tests, types, scoped style and Web/PWA export passed; exact-revision full CI remains unconfirmed and physical-device acceptance remains open.

- User confirmed the affected More entries are Campaigns and Referrals. Navigation correction 882467a is deployed to QA. Follow-up replaces the legacy campaign hub with a dedicated Web surface retaining scopes, quota, lifecycle filtering, timing/audience, editor links, referral entry and existing restore action. Referral settings now opt into Web presentation while preserving original Native defaults and existing save/query behavior. Visual QA of that follow-up is pending deployment.

- Stable QA: https://review.stampaix-web-qa.pages.dev/welcome ; 8abb944 passed CI 42849220495. Existing business login and safe PWA update were observed. The compact privacy notice persists after acknowledgment; installation offer follows it.
- Mobile More navigation: top-level destinations are Web routes; shared referral content retained legacy permission/back destinations and shared upgrade actions led to the legacy subscription screen. Web-specific destinations and a Web billing adapter correct those exits, preserving Native defaults. Focused regression tests pass; QA publication and phone acceptance of the reported item remain open. Shared legacy presentation is not claimed redesigned.
- No payment, onboarding, physical-device, security/operations or Production gate is closed by this navigation correction. GAME-01/02 remain Post-launch and Cursor-owned.

**Baseline:** `231feb9b38828a2e4e1b3e68ebc23eadff5831b6`  
**Working base:** `pwa/phase-3-scanner-commands-20261005`  
**Status:** not launch-ready; automated evidence exists, human and device acceptance is incomplete.

## Execution update — 2026-10-28 (supersedes historical baseline decisions)

- Work branch: `agent/launch-completion-20261028`; recovered HEAD `ffaaca2`, then Cloudflare preparation committed as `4c6fae48853302770707d8a76217e646969ae272`. Draft PR #13 remains open and unmerged. CI for `4c6fae4` passed: https://github.com/PetFamily2/STAMPIX_APP/actions/runs/40734542749 . Corresponding existing-DEV Preview: https://stampaix-business--khk17cr6wf.expo.app/welcome . Paid-activation changes described below are a subsequent candidate until their own exact-revision CI passes.
- Business owners must pay by card immediately. The first 14 days allow a full refund through customer service; there is no uncharged free trial. Server entitlement gates, onboarding, billing, legal and marketing must all be aligned before acceptance. The historical free Pro trial below is obsolete as a target, even where legacy code still implements it.
- Monthly prices remain ₪149 / ₪299 / ₪499, with 250 / 3000 / 10000 customer limits. Previously approved annual prices remain unless separately changed.
- All Web/PWA application routes use `business.stampaix.com`; marketing uses `stampaix.com`. Hosting is Cloudflare in the existing account, without a new paid hosting service. Convex remains the original data source, without reset or synthetic databases.
- Work may preserve changes and update Draft PRs. A main merge, Production DNS change, database transition, real charge or Production deployment requires separate explicit approval.

## Mandatory ownership and collision boundaries

- Cursor owns GAME-01 and GAME-02: stickers, album, PaperSeal, cards, avatars, characters, achievements, challenges, streaks and leaderboards.
- Cursor worktree: `C:/STAMPIX_FOLDER/STAMPIX_GAME_ALBUM`; branch `agent/game-album-001`; base `ffaaca2f5c5fe3067df3af8b884e53cd3bea48da`. The user reports local album, `listStickerAlbumBusinesses`, sticker history and PaperSeal work, not yet on GitHub. Artwork in the external `STAMPIX_ART_CONCEPTS` folder is not Work's edit scope.
- Work owns other launch streams. Do not edit album/PaperSeal/stickerAlbum/paperSealVariant files or `listStickerAlbumBusinesses`. Avoid shared wallet/customer navigation files and `convex/memberships.ts`; isolate and report any necessary shared change before integration.
- Do not merge or cherry-pick Cursor work without authorization and conflict review. Preserve all local work.

## Locked decisions

- The existing Convex deployment remains the source of truth.
- Customer limits remain 250 / 3000 / 10000.
- Identity continuity issue S1-01 is closed by operator report and remains a regression check.
- Documented requirements are retained; launch scope follows the explicit amendments below.
- Scope amendment, explicitly approved by the user on 2026-10-28: paid collectible
  pack sales are excluded from launch. GAME-01 and GAME-02 are also deferred to Post-launch by the subsequent explicit decision below. Track
  current execution in `docs/LAUNCH_EXECUTION_20261028.md`.
- No database reset, fixture acceptance, merge, shared Preview deployment, Production
  deployment, real charge, or destructive action occurs without its explicit gate.

## Status vocabulary

- **TESTED:** implemented, automated checks pass, and human/device acceptance exists for the exact SHA.
- **IMPLEMENTED:** code and automated coverage exist; human acceptance is missing.
- **PARTIAL:** only part of the documented launch contract exists.
- **MISSING:** no product implementation exists.

Nothing is TESTED at this baseline because no post-`231feb9` human/device evidence is attached.

## P0 — launch implementation and acceptance

| Workstream | Baseline | Done when |
|---|---|---|
| Existing Web acceptance | IMPLEMENTED / unaccepted | Customer, Owner, Manager, Staff, and Admin journeys have role-specific evidence on the exact SHA |
| Physical loyalty flow | IMPLEMENTED / unaccepted | QR scan across two devices covers stamp, redemption, undo, duplicate, expiry, weak network, and reconciliation |
| National Discovery | PARTIAL | Works without GPS, list-first, Google Maps/Places, all businesses plus Convex partners, Place ID deduplication, partner filtering, and business details before join |
| Five-step campaign wizard | PARTIAL | Draft-first five-step flow uses existing server permissions and real quotas; no send without explicit user action |
| System Admin employees | IMPLEMENTED in ffaaca2 / unaccepted | Invite, suspend, revoke, service/sales scopes, server authorization, audit trail, and responsive Admin UI; ordinary-account acceptance remains |
| Paid collectible packs | EXCLUDED by user on 2026-10-28 | No pack sales, checkout, or marketing promise in this launch |
| PWA and Push | PARTIAL | Install/update/offline recovery and real Push pass on Android Chrome, Samsung Internet, and iPhone Safari |
| SUMIT TEST | PARTIAL | All six products, callback, canonical receipt, failure, cancellation, invoice, reconciliation, and idempotency pass in TEST only |

## P1 — contract and launch hardening

| Workstream | Baseline | Done when |
|---|---|---|
| Staff/Admin visual consistency | PARTIAL | Accepted at 320, 390, 768, 1024, and 1440 widths including keyboard/focus states |
| Paid onboarding and 14-day refund contract | IMPLEMENTED / real payment acceptance pending | New business is inactive, Web publication requires verified paid access, current business terms accepted before checkout, first-payment 14-day full-refund service policy matches Web/legal/marketing; SUMIT TEST and service execution remain open |
| Apple OAuth | PARTIAL | Provider and ordinary login acceptance pass, unless explicitly accepted as a non-blocker |
| Landing/domain/SEO | PARTIAL | Separate repository, DNS, canonical metadata, AASA/assetlinks, legal identity, support, and deletion links are verified |
| Security and operations | PARTIAL | Authorization, rate limits, CSP/headers, monitoring, incident response, backups, and rollback receive release evidence |
| Production readiness | BLOCKED by essential gates only | All essential launch gates below are accepted; GAME-01/02 and Cursor integration are not dependencies. Exact merge and Production approvals are issued separately |

## Acceptance invariants

- An existing customer signs in with Google or Email and sees the original wallet without duplication.
- Owner, Manager, and Staff behavior follows `businessPermissions.ts`; direct URL access cannot bypass server authorization.
- Stamp, redemption, and undo produce one authoritative receipt; `UNKNOWN_OUTCOME` reconciles before another write.
- Discovery is nationwide and useful without GPS, with list as the default and no duplicate branches.
- Campaign creation saves a draft without sending and exposes the real plan quota.
- System Admin workers receive narrow service/sales capabilities, not broad `isAdmin`.
- Post-launch invariant for Cursor's separate release: wallet achievements are derived from server evidence; leaderboards do not expose personal data without consent. This is not a gate for the core loyalty wallet launch.
- Paid collectible-pack sales are excluded from this launch; no pack sale or checkout promise is added.
- Paid activation and copy match the approved contract: immediate card charge, 14 days with a full-refund option through customer service, and 250 / 3000 / 10000 customer limits. No zero-charge free trial is granted to a newly activated Web business.
- SUMIT TEST is accepted before any separately approved Production enablement.
- No secret appears in source, UI, logs, artifacts, screenshots, issues, or chat.

## Assigned lanes

1. Existing-product human acceptance and physical scanner/PWA/Push.
2. Discovery.
3. Campaign wizard.
4. Admin employees.
5. Post-launch, Cursor only: album, stickers, PaperSeal, cards, avatars, advanced achievements, challenges, streaks and leaderboards. No launch dependency on publication or integration of that branch.
6. Work: immediate paid activation, 14-day service refund workflow, SUMIT TEST, Cloudflare hosting, landing/legal, security, monitoring, and release evidence.

Each lane uses a separate issue, `agent/<task>` branch, Draft PR, and safe verification run.
No lane may deploy merely because its CI is green.

## Subsequent execution evidence

Paid activation implemented in 37f1e99; full CI and the shared DEV deployment passed (run 40738650459), Preview https://stampaix-business--jrq5tmix1j.expo.app/welcome . Marketing 47db1ba and Draft PR #3 passed CI run 40739785204. Real payment/onboarding acceptance remains open. Cloudflare Device Authorization succeeded in the owner-approved existing StampAix account; its isolated project is stampaix-web-qa (Production branch production-disabled). The earlier empty project belongs to the separate MCP account and is not the deployment target. Current billing terms must be readable in-app before consent; Production website copy is not assumed current.

## Binding scope amendment — GAME-01/02 are Post-launch (2026-10-28)

This decision supersedes any historical wording that all v11 features must ship together. No requirement is deleted. The core loyalty product may pass its Production gate without the album, character cards, advanced achievements, challenges, streaks or leaderboards, and without integrating Cursor's branch.

| Deferred workstream | Status | Retained acceptance contract |
|---|---|---|
| GAME-01 — stickers, album, sticker history, PaperSeal, character cards, avatars, advanced achievements | POST-LAUNCH / Cursor-owned; local development reported, not accepted | Server-verified entitlement, safe sharing, privacy, accessibility, published branch and explicitly authorized conflict-reviewed integration |
| GAME-02 — challenges, streaks and leaderboards | POST-LAUNCH / Cursor-owned; unaccepted | Server-authoritative progress, anti-abuse and ranking rules, participation consent, PII protection and accessible reduced-motion UI |

The protected worktree `C:/STAMPIX_FOLDER/STAMPIX_GAME_ALBUM` and branch `agent/game-album-001` remain untouched. Do not merge/cherry-pick or edit protected album/PaperSeal/sticker queries. Shared wallet, customer navigation and memberships edits still require isolation and conflict reporting before integration. Paid collectible packs remain excluded from this launch.

### Essential release gates (all remain binding)

1. PAY-01/02: real provider TEST evidence for immediate card payment, accurate prices/documents, callbacks, server verification, cancellation/failure/duplicates/renewal and service refund execution. No real charge without explicit authorization.
2. SEC-01/ONB-01: new/existing identity continuity, saved draft, inactive business before verified payment and complete onboarding acceptance.
3. Core wallet/QR: preserve existing wallet; two-device stamp/redemption/undo/duplicate/weak-network reconciliation. Gamification is not needed for this acceptance.
4. DISC-01/CAMP-01: real discovery provider/configuration and campaign draft/audience/content/scheduling/quota/winback journeys; no unapproved campaign sending.
5. PWA-01/ADM-01: role-aware permissions, real installation/Push and server-enforced Owner/Manager/Staff/service/sales scopes.
6. SEC-02/OPS-01/REL-01: security exposure review, bounded operations, monitoring, backup/restore and exact-version rollback evidence.
7. WEB-01: app and marketing Cloudflare artifacts, permanent domains/HTTPS, correct Auth origins and commercial/legal/support/deletion flows. Production DNS changes require separate explicit approval.
8. UAT-01/PROD-01: exact-candidate CI, human/device product acceptance, and separate explicit merge/Production authorization. GAME-01/02 are not prerequisites.

Current evidence: app `88517dd` CI passed (run 40742400781), live Preview https://7776ff07.stampaix-web-qa.pages.dev/welcome ; marketing `b1e194e` passed 29 tests/types/static build/CI (run 40743963263), live Preview https://b5def800.stampaix-marketing-qa.pages.dev . Public HTTP routes, legal version, join forwarding and vendor asset bytes were checked. Logged-in business data is visible; device, payment and complete role acceptance remain open. These are QA deployments on the original DEV backend, not Production readiness claims.

Immediate Work sequence: finish the role-aware unified permission setup and Welcome separation; preserve and verify that batch; continue SUMIT TEST, onboarding, QR/discovery/campaign/role acceptance, security/operations, device UAT and release preparation. Cursor remains a separate Post-launch lane.

SUMIT TEST configuration update (2026-10-29): all six hosted catalogs now have single-product/no-quantity/no-VAT settings and the stable QA success return. Read-back of all six confirmed no VAT and QA return. The original DEV deployment has test environment/company plus QA origin/product mapping configured; its existing key was not exposed. An authenticated read-only SUMIT API request succeeded (HTTP 200, provider Status 0). No charge occurred. PAY-01 remains OPEN until the actual in-product TEST checkout, server entitlement verification and failure/lifecycle acceptance pass. The next dependency is user login on the stable QA origin, not gamification.
