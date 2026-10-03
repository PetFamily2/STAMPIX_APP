# StampAix launch trial policy — 2026-10

This document is the source of truth for the launch free-trial behavior until
it is folded into the wider launch documentation after the active launch
branches are merged.

## Product decision

- Trial length: **14 days**
- Trial plan: **Pro**
- Card required to start: **No**
- Trial start: only after business onboarding is completed
- Trial renewal: never automatic without a verified paid checkout
- After trial: business features require a paid Starter, Pro, or Premium plan
- Paid renewal failure grace: **7 days**, separate from the free trial
- Native purchase UI: remains disabled
- Paid checkout: Business Web only, through SUMIT hosted checkout
- Production SUMIT: remains disabled until explicit production approval

## Authority and safety

The trial is first-party StampAix state in Convex. It must never be represented
as payment-provider evidence.

Canonical trial fields live on `businessBillingAccounts`:

- `status = trialing`
- `plan = pro`
- `trialStartedAt`
- `trialEndAt`
- `trialSource = business_onboarding`
- `hasProviderEvidence = false`

Operational access is granted only while server time is strictly before
`trialEndAt`. At expiry, entitlement evaluation fails closed even if a legacy
business mirror has not yet been rewritten.

## Lifecycle

```text
business draft
→ onboarding completed
→ 14-day Pro trial
→ verified SUMIT checkout
→ paid active subscription
→ failed paid renewal (if it occurs)
→ 7-day renewal grace
→ inactive if unrecovered
```

If no checkout is verified by the end of the trial:

```text
14-day Pro trial
→ inactive business entitlement
→ choose paid plan on Business Web
→ verified SUMIT payment
→ active paid entitlement
```

## Anti-extension rules

- Completing onboarding again does not restart the trial.
- A billing account with `trialStartedAt` cannot receive another onboarding
  trial.
- A billing account with provider evidence cannot receive a first-party trial.
- The trial is scoped to the launch MVP assumption of one business per owner.
  Broader multi-business / anti-abuse policy is deferred until that MVP
  restriction changes.

## Conversion to paid

During the trial, the owner may choose any paid launch plan:

- Starter monthly / yearly
- Pro monthly / yearly
- Premium monthly / yearly

SUMIT remains authoritative for paid evidence. Redirect success is not
sufficient. Amount, currency, logical product, recurring evidence and provider
success must be verified server-side before paid entitlement is granted.

## Customer-facing copy

Approved factual promise:

> 14 ימי ניסיון במסלול Pro ללא כרטיס מראש.

Do not describe the trial as a statutory cancellation right or legal
requirement. Legal cancellation rights and terms remain a separate legal
review item.

## Required launch QA

- New business receives Pro access only after onboarding completes.
- Draft business does not consume trial time.
- Trial start and end are server timestamps.
- Trial has no provider evidence.
- Trial cannot be extended by repeated onboarding.
- Pro limits/features apply during trial.
- Exactly at expiry, operational entitlement is inactive.
- SUMIT checkout is available during trial for all six products.
- Verified payment converts trial to paid canonical state.
- Unverified redirect never converts trial to paid.
- Existing paid subscription cannot open a second recurring checkout.
- 7-day grace remains limited to verified paid renewal failure.
- Business Web shows trial status and end date.
- Native remains purchase-free.
