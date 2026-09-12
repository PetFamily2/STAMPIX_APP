# StampAix Billing + Referral Production Lock

Canonical launch contract for StampAix MVP store launch.
Version: 1.0.0
Frozen product decisions. Do not reopen pricing, free Starter, Referral, or multi-business billing.

Stale docs that previously described free Starter or old prices must defer to this file.

## Frozen plan table

Currency: ILS. No free plan. No general free trial.

| Plan | Monthly | Yearly | Cards | Customers | Campaigns | Retention | AI / month | Team seats |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Starter | 149 | 1,490 | 1 | 250 | 1 | 0 | 0 | 0 |
| Pro | 299 | 2,990 | 5 | 3,000 | 5 | 5 | 100 | 5 |
| Premium | 499 | 4,990 | 10 | 10,000 | 10 | 15 | 300 | 20 |

`advancedReports` is false for all launch plans. Comparison UI may only show functionality that exists.

## Feature matrix

- Starter: team false, marketingHub true, smartAnalytics true, smartRetentionManager true, AI assist false, advancedReports false
- Pro / Premium: team true, marketingHub true, smartAnalytics true, smartRetentionManager true, AI assist true, advancedReports false

Do not advertise דוחות מתקדמים, בקרוב, V2 insights, future automation, or Pro Max.

Yearly UI may say "חוסכים חודשיים" or "12 חודשים במחיר של 10" only when Store-localized monthly/yearly metadata preserve that relationship. Checkout always uses Store `priceString`.

## No free Starter

Unpaid, expired, refunded, revoked, or unmapped businesses have **no** operational paid entitlement. Last plan is kept for UI, resubscribe, and history only.

Setup before payment is allowed: account, profile, onboarding fields, first loyalty card draft, preview. Operational business mode requires a provider-backed Starter, Pro, or Premium subscription confirmed by the server.

## Business billing model

One business = one billing entity = one subscription state = one RevenueCat customer identity.

Canonical table: `businessBillingAccounts` (unique per business).

Entitlement resolution: `businessId` → billing account → provider subscription → product mapping → plan/limits.

Owner-level billing is not used. Manager personal billing cannot authorize a managed business.

`providerAppUserId` is opaque (`ba_` + token), non-PII, stable forever for that business. Legacy `business:<convexId>` remains accepted. Do not log in as a user identity for billing.

## RevenueCat

- Entitlement: `business_access` only. Plan is never inferred from entitlement names.
- Offering: `business_plans`
- Logical products: `starter_monthly`, `starter_yearly`, `pro_monthly`, `pro_yearly`, `premium_monthly`, `premium_yearly`
- Unknown state-changing product IDs fail closed.
- Client `CustomerInfo` / `purchasePackage()` success is not authorization.

## Store mapping (intended if not already live)

Preserve existing live identifiers. Map them via env aliases.

### App Store — CONSOLE REQUIRED / UNVERIFIED until inspected in App Store Connect

Subscription group: StampAix Business

Intended product IDs:

- `com.stampaix.app.starter.monthly` / `.yearly`
- `com.stampaix.app.pro.monthly` / `.yearly`
- `com.stampaix.app.premium.monthly` / `.yearly`

Levels: Premium highest, Pro middle, Starter lowest. No general trial. No launch intro offer. Billing Grace Period: 16 days.

### Google Play — CONSOLE REQUIRED / UNVERIFIED until inspected in Play Console

Subscriptions: `stampaix_starter`, `stampaix_pro`, `stampaix_premium`
Base plans: `monthly`, `yearly`
Grace: 16 days. Pause off. Resubscribe on if the current Play model supports it. Account Hold: Play production recovery (typically 30–60 days minus grace).

### RevenueCat — CONSOLE REQUIRED

Apps: iOS `com.stampaix.app`, Android `com.stampaix.app`
Attach all six products to `business_access` and offering `business_plans`.
Webhook: Convex `/revenuecat/webhook` with `REVENUECAT_WEBHOOK_SECRET`.
Server secret API key required for Google deferral: `REVENUECAT_SECRET_API_KEY` (server-only, never print).

## Purchase flow

choose plan/period → log in canonical `providerAppUserId` → Store purchase → RevenueCat → webhook → Convex billing account → client entitlement query refresh.

If Store succeeds and webhook lags, show **מאמתים את המנוי**. Allow refresh/restore. Do not repurchase. Do not grant access from client state.

## Lifecycle

States: `active`, `past_due`, `canceled`, `inactive` (`trialing` compatibility only; no trial sold).

- Canceled with `currentPeriodEndAt > now`: full access until period end. Copy: "המנוי יבוטל בתאריך …"
- Past due during verified provider grace: access until `gracePeriodEndAt`
- After grace / expired / refunded / revoked: no operational access. Data preserved.

Grace is provider timestamps, never `now + 16 days`.

Management: owner "ניהול המנוי" uses Store / RevenueCat `managementURL`. Restore is owner-only and explicit.

## Roles

- Owner: view/purchase/restore/manage/redeem billing rewards
- Manager: operational quotas, upgrade-required messages, `invite_businesses`. No billing view/purchase/restore/manage/redeem
- Staff: none

## Limits and downgrade

Draft + active + other non-archived programs count toward `maxCards`. Archived does not. Archive releases card slot and Theme. Reactivation needs slot + Theme.

Customers: distinct active membership users. Existing activity is not a new unique customer. Over-cap blocks new unique joins only.

Campaigns: customer marketing campaigns 1/5/10. B2B Referral is a separate domain and does not consume `maxCampaigns`.

Retention: 0/5/15 automatic executions. Starter may still see deterministic guidance.

Team: owner not counted. Active manager + staff + non-expired pending invites count. Downgrade does not delete memberships.

AI: per business per calendar month. Cache hits do not consume.

Downgrade never deletes cards, customers, campaigns, team records, or history.

Inactive subscription: owner keeps data, settings, billing, referral history. Operational writes blocked. Customer wallets remain.

## Multi-business MVP

Flag: `MVP_FEATURE_FLAGS.additionalBusinessCreationEnabled = false`.
Hide and server-deny additional business creation. Preserve historical businesses. No `maxBusinesses`.

## Referral engine

Canonical URL: `https://stampaix.com/r/<opaque-code>`

First valid referral wins. No retroactive referral after first paid subscription.

Fraud: block self-referral, same-owner referral, duplicate referred business, multi-referrer credit.

Who may share: owner; manager with `invite_businesses`. Reward belongs to the referring **business**. Only owner redeems billing rewards.

### Referrer reward

- Referred monthly, after 3 provider-confirmed paid months: 1 free month
- Referred yearly, after 3 valid months inside paid annual term without refund/revocation: 2 free months
- Period at qualification time decides 1 vs 2. No double reward.

Referrer monthly redemption: visible immediately, redeemable after 6 paid months of the referrer (reward/free months excluded).
Referrer yearly redemption: visible immediately, applied at annual term boundary via provider mechanics.

### Referred business reward

One-time: 1 free month after 12 paid months (monthly) or after first paid annual term (yearly).
Copy: "הצטרפו דרך עסק וקבלו חודש StampAix במתנה לאחר 12 חודשי מנוי בתשלום"
Never "30 ימים חינם". Never discount first checkout price.

### Wallet

Cap 24 unredeemed months (`earned`/`scheduled`/`redeemable`/`redeeming`). Pending does not consume. Redeemed frees cap. Earned rewards survive inactivity but do not grant entitlement.

Reward is **not** entitlement. New rewards must not patch `subscriptionEndAt`.

### Provider redemption

- Google: RevenueCat subscriber subscription defer (`extend_by_days`) or Play Developer deferral. Server-only credentials.
- Apple: StoreKit / RevenueCat promotional offers for 1 and 2 months. Owner action "מימוש ההטבה". Do not mark redeemed until provider confirmation.

Docs:

- https://www.revenuecat.com/docs/customers/identifying-customers
- https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
- https://www.revenuecat.com/docs/subscription-guidance/subscription-offers
- https://developer.android.com/google/play/billing/lifecycle/subscriptions
- https://developer.apple.com/documentation/storekit/subscriptionoffer

If a Store API cannot apply the approved reward, report EXTERNAL IMPLEMENTATION BLOCKER. Do not fake Convex access.

## Website

`/r/[code]` is implemented on the landing site (mobile-first, Hebrew RTL). Invalid codes still allow normal StampAix onboarding without benefit. Deferred deep link is not assumed; landing shows "קוד ההזמנה שלכם" with copy fallback. App onboarding copy: "יש לכם קוד הזמנה?"

## Analytics (non-PII)

`referral_hub_viewed`, `referral_share_opened`, `referral_shared`, `referral_link_opened`, `referral_claimed`, `referral_onboarding_started`, `referral_subscription_started`, `referral_qualification_completed`, `referral_reward_earned`, `referral_reward_redeem_started`, `referral_reward_redeemed`, `referred_business_anniversary_reward_earned`

## Migrations

Read-only audit: `migrations/auditLegacyBilling`.
Idempotent backfill (do not run in this task): `migrations/backfillBusinessBillingAccounts`.

Historical Starter/Pro/Premium without provider evidence → inactive, data preserved, last-plan metadata kept. Do not fabricate paid access.

Legacy `b2bCreditMonthsEarned` / Convex `subscriptionEndAt` extensions are history only. Map to ledger as `needs_reconciliation` when not provider-proven.

## Prebuild gates

`bun run prebuild:preview`
`bun run prebuild:production`

Fail if frozen prices/limits change, free Starter exists, `business_access` missing, six products missing, MOCK_PAYMENTS true, server-authoritative billing false, 30-day-free copy, referral entitlement grant, or Premium maxCards > 10 Themes.

## Environment (Preview/Production)

Presence required, never print secrets:

```
EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED=true
EXPO_PUBLIC_MOCK_PAYMENTS=false
EXPO_PUBLIC_SERVER_AUTHORITATIVE_BILLING_ENABLED=true
EXPO_PUBLIC_RC_PACKAGE_STARTER_MONTHLY
EXPO_PUBLIC_RC_PACKAGE_STARTER_YEARLY
EXPO_PUBLIC_RC_PACKAGE_PRO_MONTHLY
EXPO_PUBLIC_RC_PACKAGE_PRO_YEARLY
EXPO_PUBLIC_RC_PACKAGE_PREMIUM_MONTHLY
EXPO_PUBLIC_RC_PACKAGE_PREMIUM_YEARLY
EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY_*
EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY_*
REVENUECAT_WEBHOOK_SECRET
REVENUECAT_SECRET_API_KEY
REVENUECAT_APPLE_PROMO_OFFER_1_MONTH
REVENUECAT_APPLE_PROMO_OFFER_2_MONTH
```

Mock payments must never grant entitlements.

## Physical QA

Android + iOS: new business setup, Starter/Pro/Premium purchase, monthly/yearly localized prices, upgrade/downgrade, cancel-until-end, restore per business, grace, expiration read-only, refund access removed with data preserved.

Referral: owner/manager share, staff blocked, WhatsApp image+link, story creative, installed/uninstalled open, manual code fallback, first-valid lock, self-referral block, monthly/annual qualification, wallet, 6-month and annual maturity, 12-month referred reward, Google defer, Apple promo, refund, 24-month cap, notifications, hub/history/dashboard.

Website: `/r/<valid>`, `/r/<invalid>`, mobile Safari/Chrome, installed/not installed, copy code, OG, WhatsApp, no 404, no redirect loop.

## Source of truth in code

`convex/lib/billing/productionContract.ts`
