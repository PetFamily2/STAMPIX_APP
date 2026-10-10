# General free trial launch contract — product decision 2026-10-10

**Status: APPROVED PRODUCT DECISION / CURRENT CODE DOES NOT YET MATCH.**

## Canonical product rule

- Every **eligible new business** receives **one 14-day free trial** in the tier it selected at onboarding: **Starter, Pro or Premium**.
- During that trial, entitlement, plan limits and feature access match the **selected tier**, NOT an unconditional Pro grant.
- A business may indicate monthly or annual future billing; both selections get the same 14 days. There is **no card upfront, no commitment, and no automatic charge at expiration**.
- A tier or billing-cadence selection change must never reset the trial start/end timestamps, create another trial, or bypass business eligibility.
- At or after expiration the owner can choose the same or another tier and pay through **SUMIT hosted checkout**. Operational paid access requires **server-verified payment**, never browser return metadata.
- Expiration without payment stops paid operational features while **preserving existing programs, memberships, customers, loyalty records, history, business identity and customer wallets**.
- The existing **seven-day grace** applies only to failed renewals of an already paying customer. It is not part of this 14-day free-trial policy.
- Only **active C2C** campaign quota counts; B2B invites/referrals do not count as C2C campaigns.

## Approved tiers and limits

| Tier | Monthly ILS | Annual ILS | Cards | Customers | Active campaigns | Retention | AI/month | Team seats |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Starter | 149 | 1490 | 1 | 30 | 1 | 0 | 0 | 0 |
| Pro | 299 | 2990 | 5 | 2000 | 5 | 5 | 100 | 5 |
| Premium | 499 | 4990 | 10 | 10000 | 10 | 15 | 300 | 20 |

## Current source mismatch (do NOT mark implemented)

- `convex/lib/billing/productionContract.ts`: `GENERAL_FREE_TRIAL_DAYS=14` and `GENERAL_FREE_TRIAL_PLAN='pro'` currently grant Pro trial by default.
- Current `maxCustomers` contract is **250 / 3,000 / 10,000**, unlike approved **30 / 2,000 / 10,000**.
- Changing this document does not alter code or live subscriptions. Stage 1 tasks **S1-05** and **S1-06** track server, UI, onboarding, tests, landing copy and compatibility adjustments.
- Preserve pre-existing businesses/trials; do not retroactively reset or repeat free trials. Define and test safe migration/compatibility rules before any write migration, which requires separate approval.

## Server authority

- Trial creation belongs to authenticated server-side first-business onboarding, once per eligible business, not opening Billing or selecting a tier in the browser.
- Trial is first-party evidence; `hasProviderEvidence` stays false until a verified provider transaction.
- Checkout creates server-priced intent and only verified payment activates a paid plan.
- Validate plan/cadence before trial creation and when selecting a paid plan; fail closed for invalid tiers or inconsistent state.
- On tier switching within the trial: change tier entitlements safely without extending trial or deleting records; block only *new* over-cap activity where applicable.
- No real charges or SUMIT Production enablement without explicit authorization.

## Required acceptance tests

1. New Starter/Pro/Premium businesses each get exactly **14 days** and their own limits/features.
2. Monthly vs yearly preselection does not change free-trial duration.
3. No card, checkout, provider event or automatic charge is required to start or end a trial.
4. Existing business, re-login, billing reopen and tier switching do not generate a new trial.
5. Cross-tier switching respects quotas without deleting existing memberships/programs/history.
6. At expiry, operational paid actions are blocked; profile, history, billing and customer wallets are preserved.
7. Payment TEST starts paid state only with canonical provider evidence, for all six products.
8. Canceled/failed renewal behavior and seven-day grace remain independent.
9. Code, server fixtures/contracts, Native read-only status, Business Web, onboarding, emails and marketing copy align.
10. Ordinary user journey on the original shared backend is verified; synthetic regression is not a substitute.

## Canonical marketing copy

**"14 ימים חינם בכל מסלול. ללא כרטיס אשראי, ללא התחייבות וללא חיוב אוטומטי."**

Source-of-truth roadmap: `docs/LAUNCH_EXECUTION_PLAN_3_STAGES_2026-10-10.md`.
