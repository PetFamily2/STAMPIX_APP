# StampAix launch backlog — v11 control baseline

**Baseline:** `231feb9b38828a2e4e1b3e68ebc23eadff5831b6`  
**Working base:** `pwa/phase-3-scanner-commands-20261005`  
**Status:** not launch-ready; automated evidence exists, human and device acceptance is incomplete.

## Locked decisions

- The existing Convex deployment remains the source of truth.
- Customer limits remain 250 / 3000 / 10000.
- Identity continuity issue S1-01 is closed by operator report and remains a regression check.
- All documented product features are part of the launch target.
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
| System Admin employees | MISSING | Invite, suspend, revoke, service/sales scopes, server authorization, audit trail, and responsive Admin UI exist without broad `isAdmin` grants |
| Gamification album | MISSING | Server-verified stickers and album live inside Wallet, including safe achievement sharing |
| Challenges and streaks | MISSING | Server-authoritative progress, anti-abuse rules, privacy review, and accessible reduced-motion UI |
| Leaderboards | MISSING | Consent and privacy policy prevent PII disclosure; ranking and anti-fraud rules are server-enforced |
| Paid collectible packs | MISSING | Product, tax, refund, receipt, entitlement, anti-fraud, and provider contracts are approved and tested before any sale |
| PWA and Push | PARTIAL | Install/update/offline recovery and real Push pass on Android Chrome, Samsung Internet, and iPhone Safari |
| SUMIT TEST | PARTIAL | All six products, callback, canonical receipt, failure, cancellation, invoice, reconciliation, and idempotency pass in TEST only |

## P1 — contract and launch hardening

| Workstream | Baseline | Done when |
|---|---|---|
| Staff/Admin visual consistency | PARTIAL | Accepted at 320, 390, 768, 1024, and 1440 widths including keyboard/focus states |
| Trial contract | PARTIAL | Current 14-day Pro trial and every UI/legal/landing statement agree, or a separately approved selected-plan change is implemented end-to-end |
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
- A paid pack is never sold without provider receipt, refund handling, tax treatment, and entitlement verification.
- Current price and trial copy matches the active code: 14-day Pro trial and customer limits 250 / 3000 / 10000.
- SUMIT TEST is accepted before any separately approved Production enablement.
- No secret appears in source, UI, logs, artifacts, screenshots, issues, or chat.

## Suggested parallel lanes

1. Existing-product human acceptance and physical scanner/PWA/Push.
2. Discovery.
3. Campaign wizard.
4. Admin employees.
5. Gamification album, challenges, streaks, and leaderboards.
6. Paid-pack product/provider/legal design, then implementation.
7. SUMIT TEST, landing/legal, security, monitoring, and release evidence.

Each lane uses a separate issue, `agent/<task>` branch, Draft PR, and safe verification run.
No lane may deploy merely because its CI is green.
