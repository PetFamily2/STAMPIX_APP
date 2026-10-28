# StampAix launch backlog — v11 control baseline

**Baseline:** `231feb9b38828a2e4e1b3e68ebc23eadff5831b6`  
**Working base:** `pwa/phase-3-scanner-commands-20261005`  
**Status:** not launch-ready; automated evidence exists, human and device acceptance is incomplete.

## Execution update — 2026-10-28 (supersedes historical baseline decisions)

- Work branch: `agent/launch-completion-20261028`, HEAD `ffaaca2f5c5fe3067df3af8b884e53cd3bea48da`; Draft PR #13 remains open and unmerged. Its CI passed and the shared existing-DEV Preview is https://stampaix-business--znwu2cs4wv.expo.app/welcome .
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
- All documented product features are part of the launch target.
- Scope amendment, explicitly approved by the user on 2026-10-28: paid collectible
  pack sales are excluded from launch. All other feature targets remain. Track
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
| Gamification album — Cursor | LOCAL DEVELOPMENT, reported by user | Server-verified album/stickers, safe sharing, published Cursor branch and authorized integration |
| Challenges and streaks — Cursor | CURSOR OWNED / unaccepted | Server-authoritative progress, anti-abuse rules, privacy review, and accessible reduced-motion UI |
| Leaderboards — Cursor | CURSOR OWNED / unaccepted | Consent and privacy policy prevent PII disclosure; ranking and anti-fraud rules are server-enforced |
| Paid collectible packs | EXCLUDED by user on 2026-10-28 | No pack sales, checkout, or marketing promise in this launch |
| PWA and Push | PARTIAL | Install/update/offline recovery and real Push pass on Android Chrome, Samsung Internet, and iPhone Safari |
| SUMIT TEST | PARTIAL | All six products, callback, canonical receipt, failure, cancellation, invoice, reconciliation, and idempotency pass in TEST only |

## P1 — contract and launch hardening

| Workstream | Baseline | Done when |
|---|---|---|
| Staff/Admin visual consistency | PARTIAL | Accepted at 320, 390, 768, 1024, and 1440 widths including keyboard/focus states |
| Paid onboarding and 14-day refund contract | CHANGE REQUIRED | Immediate verified card charge before business activation, full-refund request through service in the first 14 days, and matching server/UI/legal/marketing; no free trial |
| Apple OAuth | PARTIAL | Provider and ordinary login acceptance pass, unless explicitly accepted as a non-blocker |
| Landing/domain/SEO | PARTIAL | Separate repository, DNS, canonical metadata, AASA/assetlinks, legal identity, support, and deletion links are verified |
| Security and operations | PARTIAL | Authorization, rate limits, CSP/headers, monitoring, incident response, backups, and rollback receive release evidence |
| Production readiness | BLOCKED | Every required launch feature and gate is accepted, then exact merge and Production approvals are issued separately |

## Acceptance invariants

- An existing customer signs in with Google or Email and sees the original wallet without duplication.
- Owner, Manager, and Staff behavior follows `businessPermissions.ts`; direct URL access cannot bypass server authorization.
- Stamp, redemption, and undo produce one authoritative receipt; `UNKNOWN_OUTCOME` reconciles before another write.
- Discovery is nationwide and useful without GPS, with list as the default and no duplicate branches.
- Campaign creation saves a draft without sending and exposes the real plan quota.
- System Admin workers receive narrow service/sales capabilities, not broad `isAdmin`.
- Wallet achievements are derived from server evidence; leaderboards do not expose personal data without consent.
- Paid collectible-pack sales are excluded from this launch; no pack sale or checkout promise is added.
- Paid activation and copy match the approved contract: immediate card charge, 14 days with a full-refund option through customer service, and 250 / 3000 / 10000 customer limits. No zero-charge free trial is granted to a newly activated Web business.
- SUMIT TEST is accepted before any separately approved Production enablement.
- No secret appears in source, UI, logs, artifacts, screenshots, issues, or chat.

## Assigned lanes

1. Existing-product human acceptance and physical scanner/PWA/Push.
2. Discovery.
3. Campaign wizard.
4. Admin employees.
5. Cursor only: album, stickers, PaperSeal, cards, avatars, achievements, challenges, streaks and leaderboards.
6. Work: immediate paid activation, 14-day service refund workflow, SUMIT TEST, Cloudflare hosting, landing/legal, security, monitoring, and release evidence.

Each lane uses a separate issue, `agent/<task>` branch, Draft PR, and safe verification run.
No lane may deploy merely because its CI is green.
