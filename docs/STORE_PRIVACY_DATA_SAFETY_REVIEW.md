# StampAix — Store Privacy / Data Safety Review Matrix

Updated: 2026-10-03

This is a review aid, not a legal determination and not a completed App Store or
Google Play questionnaire. Final answers must match the exact Production
configuration and provider behavior.

| Area | Current product purpose | Submission review |
| --- | --- | --- |
| Email / account identity | Authentication, account recovery, profile and support | Confirm exact fields retained and linked to account |
| Name / phone | Optional or flow-specific account/profile information | Confirm collection paths in submitted build |
| Approximate location | Nearby-business discovery | Confirm no fine/background location is present in final binary |
| Camera | Customer/business QR scanning | Confirm camera-only use and permission copy |
| Push token | Notification delivery | Confirm token handling, retention and provider disclosure |
| Business profile | Business identity, address, programs and team management | Confirm owner/staff access controls |
| Loyalty activity | Stamps, memberships, reward/redemption history | Confirm account linkage and retention behavior |
| Campaign/message activity | Inbox/push delivery and campaign operation | Confirm analytics/diagnostic fields actually retained |
| Subscription state | Business entitlement and billing lifecycle | Card data must remain at hosted payment provider |
| Support request | User-requested support | Confirm retention and deletion schedule |
| Account deletion request | Public deletion intake / operational handling | Confirm public URL and authenticated deletion behavior |
| Diagnostics | Delivery/provider/technical logs that exist in Production | Review for PII minimization before declaring |

## Final questionnaire procedure

1. Build the exact Production candidates.
2. Inspect generated iOS and Android permission manifests.
3. Inventory Production network destinations.
4. Compare every collected field to the final privacy policy.
5. Complete Apple App Privacy from the real behavior.
6. Complete Google Data Safety from the real behavior.
7. Re-run this review after any analytics, advertising, crash-reporting or
   attribution SDK is added.

No advertising SDK or production analytics provider should be declared as
present unless it is actually part of the submitted binary.
