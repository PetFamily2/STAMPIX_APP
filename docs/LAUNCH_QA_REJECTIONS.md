# Launch QA rejections

QA branch: `qa/cloudflare-scanner-onboarding-20261110`.
Base: Work launch tip `ffaaca2` on `agent/launch-completion-20261028`.
The two scanner and onboarding commits `ad5fca0` and `37c4b83` are applied on that base.
Uncommitted gamification files in the game worktree were not included, and that branch was not updated.
Data source: original Convex deployment `utmost-fennec-280`. No billing write, no new database, and no entitlement bypass.
Deployed SHA: `72826eb6f39ad177ad59e828ded0841281a6e365`.
Cloudflare Pages project: `stampaix-web-qa`, deployment `48a82e7b`, environment Preview.
Phone check on 2026-11-10 showed a scan-state panel after a read. That panel is removed. The camera starts with the screen. Device retest is still required.
Phone URL: https://qa-cloudflare-scanner-onboar.stampaix-web-qa.pages.dev/welcome
Exact deployment URL: https://48a82e7b.stampaix-web-qa.pages.dev
The hosted bundle is `index-cb29dd1f5523f310468f925a1316b259.js` and uses `utmost-fennec-280`. `aware-llama-850` appears only inside a denylist. The marketing project and the Work launch branch were not updated.
No defect below is `CLOSED`.

Statuses: `OPEN`, `REPRODUCED`, `FIXED`, `VERIFIED`, `CLOSED`, `REOPENED`.
A defect is not `CLOSED` without the evidence named in its test row. A real camera check also needs device UAT.

## QA-SCAN-001 — New-customer stamp returns SUBSCRIPTION_INACTIVE

- Severity: Critical
- Surface: Android Web/PWA scanner, business «חתוכה פיצוחים», card «שניצל בחלה» (10 stamps, active, POS enroll allowed)
- Status: `FIXED`
- Recovery: sign in as the business, open the Web scanner, choose the active card, scan a customer who is not yet a member of that business, confirm the stamp.
- Root cause: the canonical billing account `td7cqm4pe25xptav0e44c2204d8fjwd0` is `inactive`, `hasProviderEvidence` is false, and there is no StampAix trial. `resolveCanonicalBillingState` therefore sets `operationalAccess` to false. A new customer has no business membership, so `applyStamp` calls `assertEntitlement` for `maxCustomers` and the server returns `SUBSCRIPTION_INACTIVE`. The legacy `subscriptions` row (`provider: manual`, premium, yearly, no end date) and `businesses.subscriptionStatus: active` do not grant access. The block is the billing contract, not a scanner or permission miss.
- Fix: the block stays. The scanner no longer shows the technical code. The owner sees «המנוי לא פעיל» and «ניהול מנוי» (`/business/billing`). Staff without `manage_subscription` see «פנו לבעלים».
- Automated test: passed in `lib/__tests__/webScannerUserMessage.test.js` and `lib/__tests__/scannerPosFlow.test.js` (`bun test`, 178 pass in the focused run).
- Browser check: not executed against a signed-in hosted session in this revision.
- Device retest: not required to judge the entitlement. Required only to confirm the new copy on a phone.
- Not done: no subscription was created or marked paid.

## QA-SCAN-002 — Scanner camera stops during a session

- Severity: High
- Surface: Web/PWA scanner camera
- Status: `FIXED`
- Recovery: open the business scanner on Android Chrome/PWA, allow the camera once, leave the page visible, and scan more than one code without reloading.
- Root cause: a `mute` event stopped the stream immediately; a frozen `currentTime` skipped decoding and then treated a live track as stalled; the two-minute guard destroyed the camera; `pagehide` called `stop()`, which cleared the resume flag.
- Fix: mute no longer stops the camera. A live track keeps decoding when `currentTime` is stuck. An ended or muted-frozen stream restarts once. After two minutes the decoder is recycled and the stream stays open. The scanner starts the camera when the card is ready, and leaving the page only suspends it.
- Automated test: `lib/__tests__/webQrFoundation.test.js`
- Browser check: unit lifecycle only. No physical camera was attached in this session.
- Device retest: still required. See QA-SCAN-003.

## QA-SCAN-003 — Physical camera, duplicate stamp, reward, and network UAT

- Severity: High
- Surface: Android Web/PWA, real camera
- Status: `OPEN`
- Recovery: on one phone, scan a new customer, scan the same customer again within 30 seconds, complete a full card and redeem, then retry with the network disabled after a code is read.
- Root cause: these paths already exist on the server (`RATE_LIMITED`, redemption checks, offline command guard). The Web copy now says «כבר נוספה חותמת», «הפרס מומש», «אין רשת», and «נסו שוב» without technical codes. Redeem, undo, and referral ask for a second confirmation.
- Fix: copy and confirmation only. No change to the 30-second duplicate rule or the receipt contract.
- Automated test: message mapping in `lib/__tests__/webScannerUserMessage.test.js`. Command safety tests were not changed.
- Browser check: not a substitute for the camera.
- Device retest: required before this item can leave `OPEN`.

## QA-ONB-001 — Customer onboarding is cramped and inconsistent on a phone

- Severity: Medium
- Surface: Web/PWA customer onboarding, 320–430px
- Status: `FIXED`
- Recovery: create a customer account and walk name, code, interests, and wallet-ready. Use the same back action on each step and return to the previous step.
- Root cause: the back control and progress shared one tight row, helper copy was long, choice labels were forced to one shrinking line, and spacing came from the older cream layout.
- Fix: on Web the progress bar sits under the shared back header. Copy is shorter. Choice labels align right and can use two lines. Registration, consent, saved answers, and back targets are unchanged.
- Automated test: none for visual layout. Existing onboarding mutations were not edited.
- Browser check: not run against a hosted build in this session.
- Device retest: one phone pass of the four customer steps.

## QA-SCAN-004 — Empty scanner chrome

- Severity: Medium
- Surface: Web/PWA scanner
- Status: `FIXED`
- Recovery: open the scanner on a 320–430px viewport with one card selected.
- Root cause: the page stacked a title, a tall 4:3 video, and a second column of explanations.
- Fix: the video is capped on a phone, status is one short line, and actions sit directly under the camera. Camera permission text appears only when the camera is blocked.
- Automated test: copy helpers above. Layout is source-level.
- Browser check: not run against a hosted build in this session.
- Device retest: included in QA-SCAN-003.
