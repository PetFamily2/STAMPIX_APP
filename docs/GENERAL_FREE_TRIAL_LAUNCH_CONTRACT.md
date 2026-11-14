# General free trial launch contract

Last updated: 2026-10-03

## Product decision

- New businesses receive a 14-day free trial.
- No payment card is required to start the trial.
- Trial entitlements use the Pro plan limits and features.
- There is no automatic charge when the trial ends.
- The owner may choose Starter, Pro or Premium and complete hosted SUMIT checkout at any point.
- If no verified payment exists when the trial ends, operational paid-plan access stops.
- The existing 7-day grace period is separate and applies only to a failed renewal for an already paying customer.

## Authority and safety

- Trial access is first-party StampAix evidence, not payment-provider evidence.
- `hasProviderEvidence` remains false during the free trial.
- Browser redirects never grant trial or paid entitlement.
- A trial is created only on first business creation, never by reopening Billing.
- Trial expiry is enforced by entitlement resolution and an hourly bounded sweep.
- Paid access still requires verified provider evidence.

## Lifecycle

```text
new business
→ Pro trialing (14 days, no card)
→ verified SUMIT checkout at any time
→ active paid subscription

or

new business
→ Pro trialing
→ day 14 without verified payment
→ inactive
→ owner selects a paid plan
→ verified SUMIT checkout
→ active paid subscription

paid renewal failure
→ past_due
→ 7-day grace
→ recovery or inactive
```

## Launch QA

- New business receives exactly 14 days.
- Existing business does not receive a new trial by opening Billing.
- Trial uses Pro limits/features.
- Trial expiry removes operational paid-plan access.
- Trial never creates payment-provider evidence.
- Checkout remains available during the trial.
- Successful checkout replaces trial state with provider-verified paid state.
- All six monthly/yearly products remain selectable from trial.
- Renewal grace remains 7 days and is not the free-trial duration.
