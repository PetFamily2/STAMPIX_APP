# SUMIT billing foundation

This integration is an additive, server-authoritative foundation. It does not
remove PayPlus, change RevenueCat, configure a SUMIT account, or claim that a
production end-to-end payment has been completed.

## Runtime flow

1. `createSUMITCheckout` authenticates the actual business owner, creates a
   server-priced checkout intent, and returns a configured SUMIT hosted-page
   URL.
2. The customer enters all card data only on SUMIT.
3. A browser redirect may supply the SUMIT payment ID only as a trigger.
4. `verifySUMITCheckoutPayment` fetches the payment and recurring item from the
   documented SUMIT server APIs.
5. Amount, ILS currency, checkout reference, customer, recurring identifier,
   configured product, billing interval, provider success, and transaction
   date are checked before mapping. Document metadata is best-effort and is
   not entitlement authority.
6. The adapter calls the existing `applyVerifiedBillingEvent`. No SUMIT code
   writes an entitlement directly.

## Launch trial contract

A newly activated business receives a first-party 14-day Pro trial. The trial
starts only when business onboarding is completed, not when a draft business
record is created. It does not require a card or a SUMIT checkout up front.

Trial access is server-authoritative and is intentionally distinct from paid
provider evidence:

- `status = trialing`
- `plan = pro`
- `trialStartedAt` and `trialEndAt` are persisted on the business billing account
- `hasProviderEvidence` remains `false`
- canonical access expires from server time when `trialEndAt <= now`
- repeating onboarding cannot extend an already-started trial
- the trial does not replace the 7-day direct-provider renewal grace period,
  which applies only after a verified paid subscription later fails to renew

A trialing business may create a SUMIT checkout for Starter, Pro, or Premium.
A verified SUMIT payment transitions the canonical billing state to paid access
through the existing provider-evidence path. A browser redirect alone still
never grants access.

Until an explicit provider-verified plan-change lifecycle exists,
`createSUMITCheckout` rejects businesses that already have canonical paid
access with `SUMIT_ACTIVE_SUBSCRIPTION_EXISTS`. First-party trial access is
not treated as paid access for this guard. The guard is server-side and
uses the canonical lifecycle, including valid grace and paid cancellation
periods; the web UI is not the authority.

The `successUrl` and `cancelUrl` returned with hosted-checkout metadata state
the required redirect contract only. They do not configure the SUMIT hosted
payment page automatically. The six hosted pages/products must still be
configured externally in SUMIT with those redirect destinations.

`reconcileSUMITBilling` provides the owner-authenticated action, while
`reconcileSUMITBillingInternal` exposes the same server-only reconciliation
helper. A bounded hourly sweep is now registered: it considers at most 25
SUMIT billing accounts per run, will not reconcile the same account more often
than once every six hours, and records the last reconciliation result on the
canonical billing account. This is code-only readiness; production SUMIT
remains disabled until the explicit production cutover.

## Server-only environment contract

- `SUMIT_ENV` (`test` or `production`)
- `SUMIT_COMPANY_ID`
- `SUMIT_API_KEY`
- `SUMIT_WEB_ORIGIN`
- `SUMIT_PRODUCTS_JSON`

The official REST schema calls the server credential `APIKey`, so the adapter
uses `SUMIT_API_KEY`; it does not invent public/private key names. No
`EXPO_PUBLIC_SUMIT_*` variable is permitted.

The current foundation enables provider API and hosted-checkout operations
only when `SUMIT_ENV=test`. `SUMIT_ENV=production` is intentionally rejected
with `SUMIT_PRODUCTION_NOT_ENABLED`; missing or unknown environment values also
fail closed. SUMIT test-organization API keys, payment pages, and test terminal
must be used for E2E validation. The API hostname remains the official shared
SUMIT hostname, and no environment is inferred from credentials or URLs.

`SUMIT_PRODUCTS_JSON` must contain all six logical products. Each entry has a
SUMIT-hosted HTTPS URL and the configured SUMIT recurring product identifier:

```json
{
  "starter_monthly": { "hostedUrl": "<SUMIT hosted URL>", "productId": "<SUMIT product ID>" },
  "starter_yearly": { "hostedUrl": "<SUMIT hosted URL>", "productId": "<SUMIT product ID>" },
  "pro_monthly": { "hostedUrl": "<SUMIT hosted URL>", "productId": "<SUMIT product ID>" },
  "pro_yearly": { "hostedUrl": "<SUMIT hosted URL>", "productId": "<SUMIT product ID>" },
  "premium_monthly": { "hostedUrl": "<SUMIT hosted URL>", "productId": "<SUMIT product ID>" },
  "premium_yearly": { "hostedUrl": "<SUMIT hosted URL>", "productId": "<SUMIT product ID>" }
}
```

The three yearly SUMIT products must charge the full yearly StampAix price in
one charge and use a 12-month recurring interval. They must not be configured
as twelve monthly installments. The adapter verifies both the full amount and
`Duration_Months = 12` before granting access.

## Confirmed from official SUMIT documentation

- Hosted purchase pages and recurring products are supported.
- `externalidentifier` and `fixedprice` are supported hosted-page parameters.
- A successful redirect can include customer, payment, document, and external
  identifiers, but the redirect is not treated as payment evidence.
- Redirect identifiers may be absent for Bit. Missing identifiers are a
  neutral awaiting-verification state, never proof of failure or entitlement.
- `billing/payments/get/`, `billing/payments/list/`,
  `billing/recurring/listforcustomer/`, `billing/recurring/cancel/`, and
  `accounting/documents/getdetails/` are published REST operations.
- Payment evidence includes validity, amount, currency, date, external
  identifier, recurring identifiers, customer ID, and document ID.
- Recurring evidence includes product, price, currency, interval, status, and
  billing dates.
- Recurring statuses are parsed from SUMIT's documented numeric values:
  `0 Active`, `1 Cancelled`, `3 DisabledFailedBillingPayment`,
  `9 FinishedExpired`, `11 GracePeriod`, `12 PendingForFirstPayment`,
  `13 CancelledByCustomer`, and `14 PendingRetry`. Matching documented string
  forms are also accepted; every unknown or mismatched value fails closed.
- `billing/payments/list/` is consumed with bounded `StartIndex` pagination.
  The cursor advances by the returned row count, `HasNextPage` is required,
  and an empty continuation page or the page ceiling fails closed.
- A verified payment and recurring item are sufficient for entitlement.
  Document metadata is stored when safely available, but a document endpoint
  or parsing failure does not block paid access and does not fabricate fields.
- Renewal and recovery periods remain anchored to the prior canonical period
  end, so a late payment does not shift the original billing schedule.
- SUMIT documents that the initial-payment IPN is not sent for later automatic
  recurring charges; active reconciliation is therefore required.

## VERIFY before production E2E

- Configure and confirm the six hosted pages/products in the SUMIT account,
  including redirect URLs and exact recurring schedules.
- Confirm the exact live serialized enum forms returned by the account for
  currency, response status, and document type. Recurring status already uses
  the documented numeric mapping above. All parsers fail closed on unknown
  values.
- Validate the current bounded reconciliation cadence against real test-org
  recurring volume before production cutover. The sweep is hourly, handles up
  to 25 candidates, and enforces a six-hour minimum interval per account.
- Confirm recovery/expiry timing semantics with real recurring lifecycle data.
- SUMIT's public documentation examined for this change does not publish an
  authenticated recurring webhook/IPN contract. No SUMIT HTTP callback route
  is added.
- SUMIT documents a customer self-service payment-method update link in its UI,
  and its API exposes payment-method and redirect primitives, but the public
  API documentation reviewed here does not expose a verified contract for
  generating that dedicated self-service update link. StampAix therefore does
  not collect card details and keeps `createSUMITPaymentMethodUpdate` blocked
  with `SUMIT_CARD_UPDATE_VERIFY_REQUIRED` until that contract is confirmed.
- A documented full-refund payment endpoint and response contract were not
  confirmed. The public refund action returns
  `SUMIT_REFUND_VERIFY_REQUIRED`; only verified-refund mapping and idempotency
  foundations exist.

SUMIT can also send recurring-charge success/failure notifications according
to module settings. StampAix's planned D0/D3/D6 failure-reminder cadence must
be configured and verified as an operational billing setting before launch; no
native purchase-steering reminder is introduced by this foundation.

Never paste API keys into source, client environment variables, tests, logs, or
browser responses.
