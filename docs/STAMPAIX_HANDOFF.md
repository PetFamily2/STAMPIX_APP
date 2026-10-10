# StampAix — Project Handoff / Single Source of Truth

Last updated: 2026-10-10  
Repository: `PetFamily2/STAMPIX_APP`

> This document is the current handoff for StampAix.  
> When older planning docs conflict with current code, current code and the exact active branch/CI evidence win.

---

## 1. Current operating state

### Active work branch
- Branch: `pwa/phase-3-scanner-commands-20261005`
- Latest verified HEAD at this handoff: `f19c497744455211fa7c6e9fbdad1d87435dd351`
- PR: #10 — Draft
- PR base: `pwa/phase-2-qr-foundation-20261005`
- Do **not** merge to `main` without explicit user approval.

### Latest verified CI
- GitHub Actions run: `38041562924`
- Result: SUCCESS
- 2,404 tests across 169 files
- TypeScript passed
- Web / iOS / Android JS exports passed
- protected Native / RTL contracts passed
- PWA artifact checks passed
- client secret-pattern checks passed
- shared Web deployment job passed

### Current live Web/PWA Preview
- Web: `https://stampaix-business--2wcjl53ie8.expo.app/welcome`
- Shared non-production backend: `https://utmost-fennec-280.convex.cloud`

### Critical architecture decision — supersedes older Preview isolation work
As of 2026-10-10 the operator explicitly rejected isolated Preview databases/provider copies.

Current rule:
- one existing non-production Convex database for the ordinary app and Web/PWA: `utmost-fennec-280`
- use the original existing accounts, memberships, businesses and history
- no synthetic QA accounts for product acceptance
- no fixture seeding/reset for ordinary Preview
- no extra OAuth client/provider key/database unless truly required
- reuse existing provider credentials/configuration where permitted
- `/preview-qa` is no longer the product test entry; it redirects to ordinary sign-in
- scanner QR injection used for synthetic QA was removed
- ordinary scanner and customer QR use normal auth, normal RBAC and the same backend data

Do not re-introduce isolation unless the user explicitly changes this decision.

---

## 2. Product goal right now

The goal is not another technical simulation. The goal is:

**A complete StampAix Web/PWA product that can be used and accepted like the existing APK flow, using real ordinary accounts and the original shared backend.**

Immediate success criteria:
1. user signs in through ordinary auth
2. original wallet/history are visible for an existing account
3. a new Customer can complete onboarding
4. an Owner can complete business onboarding and manage a business
5. Owner can invite Manager and Staff accounts
6. Customer can join a business and receive/use a loyalty card
7. Customer QR and Business/Manager/Staff scanner work through the ordinary UI
8. stamp / redeem / undo use the real backend and canonical receipts
9. campaigns / referrals / inbox / settings / maps work through normal UI
10. PWA can be installed and behaves correctly on real devices

Synthetic automation may remain as regression coverage only. It must never be treated as product acceptance.

---

## 3. What changed in the latest shared-Web pivot

The current PR now uses the existing original backend instead of isolated Preview deployments.

Implemented:
- ordinary Web/PWA points at `utmost-fennec-280`
- backend sync runs against the existing deployment
- no table import/copy/reset
- no synthetic actors seeded
- old synthetic login path is disabled
- scanner test QR injection removed
- customer and business/staff scanner share normal Convex Auth and backend permissions
- install-to-home-screen banner added to public welcome/application
- supported browsers get user-initiated install flow
- iPhone/iPad Safari get Add to Home Screen instructions
- standalone-installed mode hides install banner
- OAuth readiness now normalizes the existing provider-token encryption key consistently with provider storage
- existing key was not rotated

Server readiness reported by the latest PR evidence:
- Google: available
- Email: available
- Apple: unavailable and currently not a blocker

Important:
Deployment success is **not** ordinary-user acceptance.
The original account's wallet/history and the full role journeys still require sign-in and real manual acceptance.

---

## 4. Current launch plan — only 2 stages

### Stage 1 — make Web/PWA a complete ordinary product
Finish and accept:
- ordinary sign-in/sign-up
- customer onboarding
- business onboarding
- original-data continuity
- Customer flows
- Owner flows
- Manager flows
- Staff flows
- loyalty program lifecycle
- QR
- scanner
- customers
- campaigns
- referrals
- inbox
- settings
- maps/location
- billing UI/test path
- RTL/responsive/visual quality
- PWA install/update/offline behavior

Stage 1 is complete only when these are testable through normal UI with ordinary accounts and the shared backend.

### Stage 2 — physical verification + release readiness
Verify on:
- Android Chrome
- Samsung Internet
- iPhone Safari
- installed Android PWA
- installed iPhone PWA
- Native Android
- Native iOS

Then close:
- real camera / QR between devices
- background/foreground
- weak network / lost response / reconciliation
- PWA install/update
- real Push receive/click
- touch / keyboard / RTL
- Native regression
- final provider configuration
- SUMIT test then explicit Production cutover
- observability/security/rollback
- Pilot approval
- Production only after explicit approval

---

## 5. Remaining launch blockers

### Ordinary acceptance
Still required:
- ordinary real sign-in on the shared Web app
- verify an existing user's original wallet/history are recognized
- real Customer journey
- real Owner journey
- real Manager invitation/acceptance
- real Staff invitation/acceptance
- real UI scanner acceptance between normal accounts

No synthetic journey can substitute for these.

### Physical device verification
Still required:
- camera grant/deny/retry
- rear camera/focus
- physical QR scan
- stamp
- redeem
- undo
- duplicate handling
- background → foreground
- weak network
- response loss
- UNKNOWN_OUTCOME refresh
- read-only reconciliation
- PWA install
- PWA update
- offline → online
- Push receive and click
- touch / keyboard / RTL
- Native iOS/Android regression

### External/provider work
Use existing configuration whenever possible. Minimize user intervention.

Current rules:
- Resend: use existing `RESEND_API_KEY` and `RESEND_FROM_EMAIL`; do not create a new account/key merely for Preview
- Google: use existing OAuth client unless technically impossible; add required current origin/callback only
- Places: use existing key and allowed origin/restrictions
- Apple: do not block current Web acceptance if Google/Email already work
- SUMIT: use existing TEST configuration for acceptance; never perform a real Production charge without explicit approval
- Push: real device/provider acceptance still required

Never ask the user to paste secrets into chat.
Do not print secrets in logs, docs, CI artifacts or assistant output.

### Production blockers
Before Production:
- ordinary acceptance complete
- physical device checklist complete
- provider callbacks/origins verified
- SUMIT Production explicitly approved and configured
- hosted security/CSP review
- monitoring/error reporting review
- rate-limit/abuse review
- rollback path verified
- explicit user approval for Production
- explicit user approval for merge to `main`

---

## 6. Tech stack / important package baseline

Source: current `package.json`.

Core:
- Expo: `~54.0.37`
- React Native: `0.81.5`
- React: `19.1.0`
- React DOM: `19.1.0`
- React Native Web: `^0.21.0`
- Expo Router: `~6.0.24`
- TypeScript: `~5.9.3`
- Convex: `^1.31.2`
- Convex Auth: `^0.0.90`
- Convex rate limiter: `0.3.2`
- NativeWind: `^4.2.1`

Key app packages:
- `expo-camera ~17.0.10`
- `expo-location ~19.0.8`
- `expo-notifications ~0.32.17`
- `expo-updates ~29.0.20`
- `react-native-maps 1.20.1`
- `react-native-qrcode-svg ^6.3.21`
- `leaflet 1.9.4`
- `web-push 3.6.7`
- `react-native-purchases 9.7.6` — dormant rollback infrastructure, not the current Business Web purchase path

App version:
- `1.0.0`
- iOS bundle: `com.stampaix.app`
- Android package: `com.stampaix.app`
- scheme: `stampaix`
- canonical domain: `stampaix.com`

Landing site is a separate repository:
- `PetFamily2/STAMAIX-landing-PAGE`
Do not mix landing work with the app repository unless explicitly requested.

---

## 7. Roles and route behavior

### Customer
Every authenticated ordinary user has Customer capabilities:
- onboarding
- wallet
- loyalty cards
- business join
- show personal QR
- rewards/inbox
- discovery/maps
- referrals
- settings/account/help/legal

### Owner
Business owner:
- dashboard
- scanner
- customers
- loyalty programs/cards
- campaigns
- referrals
- inbox
- analytics
- settings
- team
- billing/subscription

### Manager
Broad operational access, subject to server permission checks.
Manager is not the billing owner.

### Staff
Scanner-first restricted shell.
Must not receive owner-only permissions.

### Admin
Admin routes exist separately and require server-backed admin authorization.
Admin is not part of the four ordinary-user launch acceptance journeys unless explicitly included.

Default mode behavior is determined by actual session/business role state; do not hardcode user role for QA.

---

## 8. Auth

Convex Auth providers in code:
- Email OTP via Resend
- Google
- Apple
- Password provider exists for internal/synthetic regression history but is not the ordinary product acceptance path

Email OTP:
- server variables: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- code sends a 6-digit code
- OTP validity: 3 minutes

Current Web goal:
- ordinary auth on shared backend
- no isolated auth database
- no copied synthetic accounts
- use existing provider configuration
- preserve account linking rules
- verify that existing account resolves to the same original user/data

OAuth:
- Production Web origin in code: `https://business.stampaix.com`
- Preview EAS origins are allowlisted by pattern
- do not create a new OAuth client unless the existing client truly cannot be extended

---

## 9. Backend and data principles

Convex is canonical for:
- user/session state
- business/staff roles
- loyalty programs
- memberships
- scanner writes
- campaigns
- referrals
- billing entitlement state
- inbox/message log
- push ownership/state
- deletion/recovery

Current ordinary Web/PWA uses the same original non-production database as the existing app.

Never:
- fabricate ordinary acceptance data directly in the DB
- seed synthetic identities to claim a real journey passed
- reset original user/business data
- copy original data into another Preview merely for testing
- create a second source of truth

When a real journey is being accepted, create/modify data through the normal UI/backend functions that a real user would use.

---

## 10. Scanner safety contract

This is a critical POS/data-integrity area.

Principles already implemented and protected:
- Web scanner decodes QR locally
- server remains authoritative
- online-only commit path
- no automatic queued write on reconnect
- one pending operation per scope
- authenticated authorization before action
- canonical command/receipt identity
- success only after canonical server outcome/receipt
- response loss can produce `UNKNOWN_OUTCOME`
- unknown state must reconcile read-only before any new write
- reload may restore reconciliation identity, never executable original write arguments
- duplicate/double-click and reconnect must not create a second transaction

Do not regress to ordinary Convex React mutation queuing for scanner commits.

Physical acceptance must still prove:
- camera behavior
- real QR between devices
- weak network
- lost response
- refresh/reconciliation
- background/foreground

---

## 11. PWA/Web

Current capabilities:
- ordinary hosted Web/PWA
- PWA manifest
- service worker
- public-only offline/update safety rules
- install banner
- standalone detection
- iPhone/iPad Safari install instructions
- update safety around scanner uncertainty
- browser location/maps support
- responsive Web shells

Service worker rules:
- do not cache private account HTML/data
- do not cache QR payloads
- do not cache scanner write requests
- do not background-sync scanner writes

Still requires physical verification for actual installed PWA behavior.

---

## 12. RTL and visual rules

StampAix is Hebrew-first.

Native:
- manual RTL architecture
- Expo/native forced RTL remains disabled
- `supportsRTL: false`
- `forcesRTL: false`
- use `lib/rtl.ts`

Web:
- avoid double RTL inversion
- current Web strategy uses a stable flex baseline and Hebrew RTL text/islands
- do not blindly combine document `dir=rtl` with manual `row-reverse` logic
- verify visual order, not only text alignment

Visual product requirements:
- simple
- clear
- premium
- consistent typography
- no oversized desktop/browser proportions
- no clipped settings edges
- correct back-arrow semantics
- visible button borders/CTAs where required
- scanner icons equal and selected state clearly bordered
- headers aligned correctly in Hebrew
- `StampAix` may be an LTR island inside RTL text
- avoid multiple competing fonts
- align app typography with the chosen landing-page visual direction

The ugly/reversed Web screenshots from earlier QA were treated as a systemic problem, not a few isolated bugs. Continue checking the full route tree, not only previously reported screens.

---

## 13. Onboarding

### Customer
Current onboarding includes:
- name capture
- interests/preferences
- fit/frequency/usage/return-motivation related steps

Ordinary acceptance must start from a normal user account and finish through UI.

### Business
Current onboarding includes:
- role
- business type
- business name
- plan/trial path
- reason/discovery/usage/cadence/campaign relevance
- profile/address requirements
- first program/card setup

Business readiness depends on real business profile data, including description/phone/service classifications where required.

Do not use fixture completion as proof of onboarding acceptance.

---

## 14. Loyalty / celebration / sharing UX context

Loyalty:
- program lifecycle: draft → active → archived
- archived programs preserve members/history
- active operational limits are enforced server-side
- customer wallet and card views remain canonical product surfaces

Redemption/stamp celebration:
- celebration and sharing code exists and has prior regression coverage
- image/share output exists in the product
- ordinary shared-backend and device acceptance are still required
- do not remove celebration/share behavior while fixing Web unless explicitly requested
- visual treatment should remain polished and not look like a debug/test surface

Sharing/referrals:
- canonical referral URL origin: `https://stampaix.com/r/<opaque-code>`
- first valid referral wins
- B2B referral is separate from customer marketing campaign quota
- referral rewards do not directly grant entitlement; billing/provider confirmation stays authoritative

---

## 15. Billing / plans — code is source of truth

Canonical code:
`convex/lib/billing/productionContract.ts`

Current contract version:
`1.1.0`

Current plan table:

| Plan | Monthly | Yearly | Cards | Customers | Campaigns | Retention | AI/mo | Team |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Starter | ₪149 | ₪1,490 | 1 | 250 | 1 | 0 | 0 | 0 |
| Pro | ₪299 | ₪2,990 | 5 | 3,000 | 5 | 5 | 100 | 5 |
| Premium | ₪499 | ₪4,990 | 10 | 10,000 | 10 | 15 | 300 | 20 |

Current code also has:
- general free trial enabled
- 14 days
- trial plan: Pro
- no free Starter
- additional business creation disabled for MVP
- direct-provider renewal grace: 7 days
- store grace policy constant: 16 days

Important documentation inconsistency:
some older billing prose still says “No general free trial” while current canonical code explicitly enables a 14-day Pro trial. **Use the code contract unless the user explicitly changes the product decision, and clean stale docs when touching this area.**

Billing launch direction:
- Business Web = purchase/billing surface
- SUMIT = current direct Web billing path
- Convex = canonical entitlement authority
- Native iOS/Android = consumption/companion; no launch purchase UI
- RevenueCat = dormant rollback infrastructure

No Production charge without explicit approval.

---

## 16. Campaigns / AI / quotas

Campaigns:
- customer-facing C2C campaigns count against plan quota
- B2B business invite/referral flow is a separate domain
- drafts should not be confused with active/sent operational usage rules; follow current server contract

AI:
- Starter: 0
- Pro: 100/month
- Premium: 300/month
- backend/provider failures must degrade safely
- AI must not block core loyalty operations

Retention:
- Starter 0
- Pro 5
- Premium 15 active retention actions

---

## 17. Maps / Places

Native maps remain supported.
Web uses browser-friendly map/location behavior.

Current acceptance requirements:
- allow location
- deny location
- unavailable location
- list fallback
- marker behavior
- directions
- real business address flow

Use the existing Google Places key/configuration when possible.
Do not create a second Places key solely for Preview unless unavoidable.

---

## 18. Push

Native Push and Web Push code exist, but real device acceptance is not complete.

Still required:
- real subscription on supported device/browser
- receive notification
- click routing
- unsubscribe/logout cleanup
- installed iOS PWA Web Push behavior
- Android PWA behavior
- Native regression

Do not claim cloud synthetic worker events prove real OS delivery.

---

## 19. Security / secrets

Never expose:
- API keys
- deploy keys
- OAuth secrets
- Resend keys
- SUMIT keys
- VAPID private keys
- JWT private keys
- scanner signing secrets

Never ask the user to paste secrets into chat.

Prefer:
- reuse existing connected/configured credentials
- inspect presence/status without printing values
- preserve existing permissions
- no credential rotation unless explicitly approved

Forbidden without explicit approval:
- destructive migrations
- real-user data deletion
- credential rotation
- Production deployment
- merge to `main`
- store submission
- real payment

---

## 20. CI / build / test policy

Normal verification:
- targeted tests for changed area
- TypeScript
- Web/iOS/Android JS exports where relevant
- scanner safety contracts
- Native camera/maps/push/billing protected contracts
- RTL contracts
- `git diff --check`

Repository-wide Biome has historical debt.
Do not falsely report `bun run check` as globally green if unrelated baseline issues remain.
Fix formatting/lint in changed files without broad unrelated refactors.

Build policy:
- batch related changes
- one Preview build/deploy after a meaningful batch
- do not waste time/tokens on a build after every tiny UI change

---

## 21. Working style with the user

Language:
- Hebrew by default
- concise and operational

For UI/setup guidance:
- one action per step
- wait for user confirmation/screenshot before the next action
- explain English UI labels briefly when useful

For Cursor/agent commands:
- one action per step
- state whether it is Bash, Cursor agent, or Work instruction
- put model/reasoning/mode outside copy blocks if relevant
- do not invent model names/settings

Saving:
- do not save/commit/push changes the user has not approved
- an explicit request to update a file/document is approval for that requested change
- after approved implementation, commit/push in a controlled batch

Do not overwhelm the user with technical theory when a concrete next action is available.

---

## 22. ChatGPT Work continuity / stuck-task rule

ChatGPT Work has repeatedly shown stuck “running” states/network errors.

Important:
- the chat UI is not the source of truth for repository progress
- a desktop restart does not necessarily cancel a cloud Work task
- do not claim to know what a Work task is doing internally unless there is direct evidence
- check GitHub branch HEAD, recent commits and Actions to determine whether repository work is actually progressing
- if Work appears stuck but GitHub has no new activity, treat it as a stale/stuck task state
- a replacement Work task must first read current GitHub HEAD and PR #10 and continue from there
- GitHub is authoritative over old Work summaries

At this handoff the last verified repository activity is:
- HEAD `f19c497744455211fa7c6e9fbdad1d87435dd351`
- latest successful main verification/deployment run: `38041562924`

If either has changed, refresh this handoff before continuing.

---

## 23. Historical PWA phase status

Phase 1:
- Web role/session/onboarding routing
- complete

Phase 2:
- Web QR camera/decoder foundation
- local jsQR worker
- complete

Phase 3:
- scanner command safety / receipts / reconciliation
- expanded into full Web/PWA release-candidate work
- earlier isolated Preview/synthetic QA approach is now superseded by shared ordinary backend strategy

Do not resume the old isolated-preview roadmap blindly.
Continue from the shared-Web state described in `docs/SHARED_WEB.md`.

---

## 24. Current “do next” order

1. Sign into the latest ordinary Web Preview with the existing normal account.
2. Verify original wallet/cards/history continuity.
3. Fix any auth/data-continuity issue before adding new test infrastructure.
4. Run the real Customer journey.
5. Run the real Owner journey.
6. Invite/accept Manager and Staff through normal UI.
7. Verify real UI QR/scanner between ordinary accounts.
8. Complete physical-device PWA/camera/push acceptance.
9. Verify SUMIT TEST flow.
10. Final release/security/rollback review.
11. Pilot.
12. Production only after explicit approval.

No new isolation layer. No new synthetic acceptance system.

---

## 25. Key references

Current state:
- `docs/SHARED_WEB.md`
- PR #10
- active branch `pwa/phase-3-scanner-commands-20261005`

Release / Web:
- `docs/PWA_RELEASE_CANDIDATE.md`
- `docs/WEB_PRODUCT_AUDIT.md`
- `docs/WEB_OPERATIONS_LAUNCH_CHECKLIST.md`

Billing:
- `convex/lib/billing/productionContract.ts` — canonical code contract
- `docs/BILLING_REFERRAL_PRODUCTION_LOCK.md`
- `docs/SUMIT_BILLING_FOUNDATION.md`

Store readiness:
- `docs/STORE_LAUNCH_READINESS_2026-10.md`
- `docs/STORE_SUBMISSION_CHECKLIST_2026-10.md`
- `docs/STORE_PRIVACY_DATA_SAFETY_REVIEW.md`

Auth:
- `convex/auth.ts`
- `docs/AUTH_LINKING_QA_CHECKLIST.md`

Architecture:
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/routes.md`
- `docs/spec/scanner-contract.md`

---

## 26. Final guardrail

The next agent should optimize for **a working launchable product**, not for producing more reports, harnesses or isolated simulations.

When there is a choice between:
- another synthetic proof, or
- making the ordinary real user flow work,

choose the ordinary real user flow, while keeping existing regression tests intact.

The project is close to launch, but it is **not yet Pilot-ready** until ordinary shared-backend acceptance and physical-device verification are complete.
