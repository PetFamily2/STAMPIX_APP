# StampAix store launch readiness

Last updated: 2026-10-03

This document is the release-control checklist for the current web-only business
billing launch model. It is intentionally separate from app bug triage.

## Locked launch model

- Native iOS and Android are consumption companions.
- Native surfaces do not sell subscriptions, show provider checkout, restore
  purchases, or steer users to external purchasing.
- Business subscription purchase and management live on Business Web.
- Convex is the canonical entitlement authority.
- SUMIT is the direct Business Web billing provider.
- RevenueCat remains dormant rollback infrastructure until store approval and a
  stable post-launch window.
- Production billing stays fail-closed until an explicit production cutover.

## Store identity

| Field | Canonical value |
| --- | --- |
| Product name | StampAix |
| iOS bundle id | `com.stampaix.app` |
| Android package | `com.stampaix.app` |
| App scheme | `stampaix` |
| Universal/App Link host | `stampaix.com` |
| iOS associated domain | `applinks:stampaix.com` |
| Android verified paths | `/join`, `/r` |
| Current version | `1.0.0` |

## Draft store positioning

### Short product description

StampAix helps customers collect digital loyalty stamps and rewards, while
participating businesses manage loyalty programs, customers and campaigns.

### Store subtitle / short description candidates

- כרטיסיות נאמנות דיגיטליות לעסקים וללקוחות
- מועדוני לקוחות, QR והטבות במקום אחד

Final copy must be reviewed in the actual store consoles for current character
limits before submission.

### Core screenshots to prepare

1. Customer wallet with joined loyalty cards.
2. Customer card progress toward a reward.
3. Customer QR ready for scanning.
4. Business dashboard.
5. Business scanner before/after stamp.
6. Reward-ready state and redemption.
7. Business customer management.
8. Campaign/recommendation experience where supported by the launch build.

Use real product UI and non-sensitive test data. Do not fabricate ratings,
customer counts, reviews, business logos, testimonials, or awards.

## Privacy / data-disclosure working matrix

This is a technical inventory, not the final App Store Connect or Play Console
answer. The final declarations must be checked against the exact production
build and enabled services.

| Data / capability | Current product use | Store-review action |
| --- | --- | --- |
| Account identifiers | Authentication, session, ownership and staff access | Declare account/auth use as applicable |
| Email / phone | Account, OTP/support and business contact flows | Verify exact collection and linkage |
| Name / avatar | Profile and account display | Verify optional vs required collection |
| Approximate location | Nearby business discovery | Declare approximate location only if production behavior matches |
| Camera | QR scanning | Permission purpose is QR scanning |
| Push token | Notifications | Declare device/notification identifier use as applicable |
| Purchase/subscription state | Business entitlement and billing status | Native app consumes entitlement; card data is not collected by StampAix |
| Support messages | User-requested support | Declare support/customer service use as applicable |
| Referral activity | Referral qualification/reward flows | Verify linkage and retention |
| Business profile/address | Business setup and discovery | Business-provided operational data |
| AI inputs/outputs | Smart Manager/recommendations when enabled | Verify production provider and exact transmitted fields before declaring |
| Analytics | Production provider currently not enabled | Do not claim third-party analytics until one is intentionally enabled |

## Account deletion

- In-app personal deletion remains the authoritative authenticated flow.
- A public deletion-request intake page exists for users who cannot access the
  app.
- Public email submission is never sufficient authority to delete an account.
- Sole-owner/business blockers are handled by the existing deletion workflow.
- Store account-deletion URL must use the final public StampAix domain.

## Push / native service readiness

Before store submission:

- Verify APNs on a physical iPhone/iPad.
- Verify FCM on a physical Android device.
- Verify notification permission denial, enable, disable and re-enable.
- Verify notification tap routing.
- Confirm Preview and Production Android Firebase files remain separate.
- Confirm the dedicated Android notification icon renders correctly.
- Confirm Maps/Places keys are restricted to the intended app/server use.

## Billing readiness

Already implemented in code:

- Server-priced SUMIT checkout intents.
- Hosted checkout only; StampAix does not collect card details.
- Server-side provider verification before entitlement.
- Cancellation verification.
- Billing documents surfaced when safely available.
- Seven-day canonical grace support.
- Bounded automatic SUMIT reconciliation with admin health visibility.
- Native purchasing/steering disabled for the store candidate.

External/test blockers:

- Final Business Web origin and `SUMIT_WEB_ORIGIN`.
- Configure success/cancel destinations on all six SUMIT hosted products.
- Complete SUMIT test-organization E2E for all six plan/cadence products.
- Verify renewal, failed payment, grace, cancellation, invoice/document and Bit
  no-identifier behavior.
- Confirm operational failure-notification cadence.
- Confirm a documented provider-side card-update contract before enabling that
  action.
- Keep refund execution blocked until the provider operation/response contract
  is verified.
- Keep plan/cadence changes unavailable until provider-verified lifecycle
  semantics are implemented.
- Explicit approval is required before enabling SUMIT Production.

## Web/domain readiness

Required before store submission:

- `stampaix.com` serves directly over HTTPS.
- `www.stampaix.com` redirects to the apex domain, not the reverse.
- `/.well-known/apple-app-site-association` returns the final Apple Team ID
  configuration with no redirect.
- `/.well-known/assetlinks.json` returns the final Play signing fingerprint
  configuration with no redirect.
- Privacy, terms, support and account-deletion pages are publicly reachable.
- Final App Store and Play Store URLs are configured only after listings exist.
- Business Web destination is final and HTTPS.

## Security gate

Before production cutover:

- Complete final source and dependency review.
- Rotate any credentials known to have been exposed previously, without placing
  replacement values in source, logs, tickets or chat.
- Re-run authentication/authorization tests for owner, manager, staff, customer
  and admin.
- Verify admin remains server-authorized and that sensitive operational writes
  are not exposed without an audit path.
- Verify production Convex fails closed on missing/incorrect environment.
- Verify production SUMIT stays blocked until the explicit cutover operation.

## Submission gate

Do not submit until all of these are true:

- Preview physical-device QA is complete.
- Store screenshots and metadata match the actual candidate build.
- Privacy/Data Safety declarations match actual production data flows.
- Public legal/support/deletion URLs are final.
- Universal Links/App Links validate on the final domain.
- APNs/FCM and OAuth production credentials are validated.
- Production Convex and billing configuration pass prebuild verification.
- Production build is created from a clean, reviewed commit.
- Store submission is separately approved.
