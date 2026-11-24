# Ordinary Web/PWA Preview audit — 2026-10-08

GitHub is authoritative. Base: `72eee2ec06c43e7f77c78132ce7d00cc157581e5`, PR #10, run 37752724058. That successful run proves synthetic regression, not ordinary provider authentication or launch acceptance. New run evidence is uploaded as `product-preview-evidence.json` and `rc-hosted-evidence.json`.

## Scope and evidence boundaries

The complete source route inventory below was searched for placeholder, TODO, mock, synthetic, unsupported and “בקרוב” paths. Input placeholders and camera compatibility/error states are real UI, not unfinished features. Existing Business Web modules call authenticated backend queries/mutations; legacy Native routes and companions remain intact. Admin has an explicit server-backed `isAdmin` gate and is outside the four ordinary-user acceptance journeys. No administrative account was provisioned.

This is a source review plus selected hosted browser regression. It does **not** assert that every route, modal, loading, empty and error permutation was visually accepted. Ordinary new-account/business/invitation acceptance remains blocked until a provider and address verification are configured. These limits must remain visible in the handoff.

## Changes

- Keep Hebrew document language/direction, put React Native Web manual layouts on one LTR flex baseline, and keep Hebrew text/HTML islands RTL. Native RTL configuration is unchanged. Body modal portals receive the same baseline.
- Center auth/onboarding and Customer surfaces at bounded widths; workspace shells retain their responsive sidebar. Add visible keyboard focus, normal QR action icon, and usable Web navigation targets.
- Guard direct email entry with server provider availability, including a fresh check before sending. Native behavior is unchanged.
- Hide QA terminology and QR injection unless the dedicated manual QA flag is enabled. Ordinary Product Preview sets it false, uses an isolated backend with no fixtures/reset, and retains normal Convex Auth and RBAC.
- Ordinary Preview scanner availability accepts authenticated business actors without fixture allowlists. Resolve, commit, outcome reconciliation and canonical receipts use the same backend and permissions as before. No auth or write bypass was introduced.
- Billing reads an authenticated owner-only readiness boolean; malformed/missing SUMIT configuration disables checkout. Unsupported card update CTA is removed; plan-change limitations are stated clearly. No payment is performed by provisioning or public QA.
- Correct the in-app technical privacy/subscription summaries to describe SUMIT and canonical Convex entitlement state. Public canonical contract identifiers and existing acceptance records are unchanged; this is a factual product-summary correction, not a newly approved legal contract. Public Preview smoke also opens the legal document through its UI link.
- Public ordinary Preview smoke checks 320/390/1440px and rejects leaked QA entry, double RTL baseline, overflow and runtime errors. Authenticated read-only layout regression checks Customer, Owner, Manager and Staff surfaces at the same widths, tab order and desktop sidebar order. Existing CI checks camera state machine, actions, reconciliation, PWA, maps and modal/permission flows on synthetic accounts separately.

## Real journeys and providers

Customer, Owner, Manager and Staff ordinary journeys, invitation acceptance and real UI scanning are **EXTERNAL_CONFIGURATION_REQUIRED** until ordinary authentication is actually completed. Provider readiness booleans alone are not acceptance. No ordinary account or business was inserted into the database to manufacture proof.

The `stampaix-product-preview` backend is authorized with the existing project Preview key. DEV, Production and the synthetic backend are denied. Existing owned Product Preview secrets are preserved; unowned reuse and credential replacement fail closed. Fresh Preview secrets are generated once. No existing secrets are rotated.

Configure on this exact Product Preview, using the backend URL in its evidence:

1. Email: dedicated Resend key and verified sender (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`). Verify delivery, resend limits, expiry, incorrect codes and logout/login through the UI.
2. Google/Apple: dedicated Preview credentials, provider callback at `<backend>.convex.site/api/auth/callback/google` or `/apple`, exact current Web origin, approved test audience. Complete callback and account-linking journeys; do not assume configuration proves valid login.
3. Business address: server-only `GOOGLE_PLACES_API_KEY`, with the provider's API access/billing restrictions. Discovery Leaflet/list fallback does not prove business-address creation.
4. Billing: SUMIT **test** company/API key and all six logical products, hosted official URLs and current `SUMIT_WEB_ORIGIN`. Run UI trial, monthly/yearly selection, checkout, return, server verification, documents and cancellation with test-only payment data.

Direct server configuration on the owned Product Preview is retained. Copying from EAS Preview requires the specific binding `PRODUCT_PREVIEW_AUTH_APPROVED_URL`, `PRODUCT_PREVIEW_PLACES_APPROVED_URL` or `PRODUCT_PREVIEW_SUMIT_APPROVED_URL` to equal that backend URL; absent bindings copy nothing. SUMIT must be test. Never place provider secrets in client variables, source, chat or artifacts.

## Release readiness

**Not Pilot-ready until ordinary acceptance and physical verification pass.**

Cloud regression covers exports for all platforms, TypeScript, protected RTL/camera/maps/push/billing contracts, permission rejection, scanner duplicate/expiry/UNKNOWN_OUTCOME/reconciliation, browser location allow/deny/unavailable, PWA public cache/offline/update safety and synthetic hosted UI actions. Exact pass/fail belongs to the new GitHub run, not this source checklist.

Production remains blocked by real provider acceptance, SUMIT Production cutover (currently intentionally fail-closed), physical verification and operator release review. No Production deployment, main merge, store submission or real charge is authorized. Preview hosting does not verify owned production-domain DNS, provider redirect registrations or Production secrets. Existing redirect validation, permission and rate-limit tests are regression evidence; production limits/abuse monitoring and error reporting require an operator review with live service configuration. A complete product CSP/security-header policy is not currently established by the SPA export; the separate QR lab CSP is not product security proof. Confirm CSP and hosted headers before rollout. Retain rollout flags/rollback, account deletion/recovery and legal review as release gates; no destructive user-data test was performed on this ordinary Preview.

## Physical checklist

Platforms: Android Chrome, Samsung Internet, iPhone Safari, installed iPhone/Android PWA, Native Android/iOS.

- Allow/deny camera; rear camera focus; customer QR scanned between two devices; stamp, redeem, undo, duplicate.
- Background/foreground; weak network/lost response; refresh during UNKNOWN_OUTCOME; reconcile before new writes.
- Install/update PWA; offline/online recovery; real Push receive/click routing.
- RTL, touch, keyboard and Native camera/maps/push regression.

## Source route inventory

“Listed” means source inventory/search, not authenticated visual acceptance.

- `app/(auth)/_layout.tsx`
- `app/(auth)/index.tsx`
- `app/(auth)/legal.tsx`
- `app/(auth)/name-capture.tsx`
- `app/(auth)/oauth-callback.tsx`
- `app/(auth)/onboarding-business-cadence.tsx`
- `app/(auth)/onboarding-business-campaign-relevance.tsx`
- `app/(auth)/onboarding-business-discovery.tsx`
- `app/(auth)/onboarding-business-name.tsx`
- `app/(auth)/onboarding-business-plan.tsx`
- `app/(auth)/onboarding-business-reason.tsx`
- `app/(auth)/onboarding-business-role.tsx`
- `app/(auth)/onboarding-business-type.tsx`
- `app/(auth)/onboarding-business-usage-area.tsx`
- `app/(auth)/onboarding-client-fit.tsx`
- `app/(auth)/onboarding-client-frequency.tsx`
- `app/(auth)/onboarding-client-interests.tsx`
- `app/(auth)/onboarding-client-otp.tsx`
- `app/(auth)/onboarding-client-return-motivation.tsx`
- `app/(auth)/onboarding-client-usage-area.tsx`
- `app/(auth)/paywall/index.tsx`
- `app/(auth)/paywall/legal.tsx`
- `app/(auth)/sign-in.tsx`
- `app/(auth)/sign-up-email.tsx`
- `app/(auth)/sign-up.tsx`
- `app/(auth)/welcome.tsx`
- `app/(auth)/welcome.web.tsx`
- `app/(authenticated)/(business)/_layout.tsx`
- `app/(authenticated)/(business)/analytics.tsx`
- `app/(authenticated)/(business)/campaigns.tsx`
- `app/(authenticated)/(business)/cards/[programId].tsx`
- `app/(authenticated)/(business)/cards/_layout.tsx`
- `app/(authenticated)/(business)/cards/campaign/[campaignId].tsx`
- `app/(authenticated)/(business)/cards/campaigns.tsx`
- `app/(authenticated)/(business)/cards/index.tsx`
- `app/(authenticated)/(business)/cards/new.tsx`
- `app/(authenticated)/(business)/customer/[customerUserId].tsx`
- `app/(authenticated)/(business)/customers.tsx`
- `app/(authenticated)/(business)/dashboard.tsx`
- `app/(authenticated)/(business)/programs.tsx`
- `app/(authenticated)/(business)/qr.tsx`
- `app/(authenticated)/(business)/scanner.tsx`
- `app/(authenticated)/(business)/settings-business-account-data.tsx`
- `app/(authenticated)/(business)/settings-business-account.tsx`
- `app/(authenticated)/(business)/settings-business-address.tsx`
- `app/(authenticated)/(business)/settings-business-help.tsx`
- `app/(authenticated)/(business)/settings-business-invite-businesses.tsx`
- `app/(authenticated)/(business)/settings-business-profile-complete.tsx`
- `app/(authenticated)/(business)/settings-business-profile.tsx`
- `app/(authenticated)/(business)/settings-business-referrals.tsx`
- `app/(authenticated)/(business)/settings-business-subscription.tsx`
- `app/(authenticated)/(business)/settings.tsx`
- `app/(authenticated)/(business)/team/add.tsx`
- `app/(authenticated)/(business)/team/index.tsx`
- `app/(authenticated)/(customer)/_layout.tsx`
- `app/(authenticated)/(customer)/account-details.tsx`
- `app/(authenticated)/(customer)/business/[businessId].tsx`
- `app/(authenticated)/(customer)/customer-card/[membershipId].tsx`
- `app/(authenticated)/(customer)/discovery.tsx`
- `app/(authenticated)/(customer)/help-support.tsx`
- `app/(authenticated)/(customer)/referrals.tsx`
- `app/(authenticated)/(customer)/rewards.tsx`
- `app/(authenticated)/(customer)/settings.tsx`
- `app/(authenticated)/(customer)/show-qr.tsx`
- `app/(authenticated)/(customer)/wallet.tsx`
- `app/(authenticated)/(staff)/_layout.tsx`
- `app/(authenticated)/(staff)/customer/[customerUserId].tsx`
- `app/(authenticated)/(staff)/customers.tsx`
- `app/(authenticated)/(staff)/promotions.tsx`
- `app/(authenticated)/(staff)/scanner.tsx`
- `app/(authenticated)/(staff)/settings.tsx`
- `app/(authenticated)/_layout.tsx`
- `app/(authenticated)/accept-invite.tsx`
- `app/(authenticated)/admin/_layout.tsx`
- `app/(authenticated)/admin/referrals.tsx`
- `app/(authenticated)/admin/support-inbox.tsx`
- `app/(authenticated)/business-permanent-deletion.tsx`
- `app/(authenticated)/business-recovery.tsx`
- `app/(authenticated)/card/[membershipId].tsx`
- `app/(authenticated)/card/index.tsx`
- `app/(authenticated)/inbox.tsx`
- `app/(authenticated)/join.tsx`
- `app/(authenticated)/merchant/_layout.tsx`
- `app/(authenticated)/merchant/analytics.tsx`
- `app/(authenticated)/merchant/customers.tsx`
- `app/(authenticated)/merchant/index.tsx`
- `app/(authenticated)/merchant/onboarding/_layout.tsx`
- `app/(authenticated)/merchant/onboarding/business-basics.tsx`
- `app/(authenticated)/merchant/onboarding/create-business.tsx`
- `app/(authenticated)/merchant/onboarding/create-program.tsx`
- `app/(authenticated)/merchant/onboarding/index.tsx`
- `app/(authenticated)/merchant/onboarding/preview-card.tsx`
- `app/(authenticated)/merchant/profile-settings.tsx`
- `app/(authenticated)/merchant/qr.tsx`
- `app/(authenticated)/merchant/store-settings.tsx`
- `app/(authenticated)/merchant/support-inbox.tsx`
- `app/(authenticated)/settings-legal.tsx`
- `app/(web-admin)/admin/_layout.tsx`
- `app/(web-admin)/admin/billing.tsx`
- `app/(web-admin)/admin/business/[businessId].tsx`
- `app/(web-admin)/admin/deletions.tsx`
- `app/(web-admin)/admin/index.tsx`
- `app/(web-admin)/admin/support.tsx`
- `app/(web-business)/business/_layout.tsx`
- `app/(web-business)/business/analytics.tsx`
- `app/(web-business)/business/billing.tsx`
- `app/(web-business)/business/billing.web.tsx`
- `app/(web-business)/business/campaign/[campaignId].tsx`
- `app/(web-business)/business/campaigns.tsx`
- `app/(web-business)/business/cards/[programId].tsx`
- `app/(web-business)/business/cards/new.tsx`
- `app/(web-business)/business/customers.tsx`
- `app/(web-business)/business/inbox.tsx`
- `app/(web-business)/business/index.tsx`
- `app/(web-business)/business/loyalty.tsx`
- `app/(web-business)/business/qr.tsx`
- `app/(web-business)/business/referrals.tsx`
- `app/(web-business)/business/scanner-preview.tsx`
- `app/(web-business)/business/scanner-preview.web.tsx`
- `app/(web-business)/business/settings.tsx`
- `app/(web-business)/business/team.tsx`
- `app/(web-staff)/staff/_layout.tsx`
- `app/(web-staff)/staff/index.tsx`
- `app/(web-staff)/staff/scanner-preview.tsx`
- `app/(web-staff)/staff/scanner-preview.web.tsx`
- `app/(web-staff)/staff/settings.tsx`
- `app/+html.tsx`
- `app/+not-found.tsx`
- `app/_layout.tsx`
- `app/billing/sumit/cancel.tsx`
- `app/billing/sumit/cancel.web.tsx`
- `app/billing/sumit/success.tsx`
- `app/billing/sumit/success.web.tsx`
- `app/preview-qa.tsx`
- `app/preview-qa.web.tsx`
- `app/r/[code].tsx`
