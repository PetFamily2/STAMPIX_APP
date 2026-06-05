# Route Map

Generated from `app/` route files on 2026-06-05.

This file replaces the older root-level `ROUTES_REPORT.md` and `docs/spec/screens.md` snapshots. Historical route snapshots are archived under `docs/archive/route-snapshots/`.

## Root
- `app/_layout.tsx`
- `app/+not-found.tsx`

## Auth Routes
- `app/(auth)/_layout.tsx`
- `app/(auth)/index.tsx`
- `app/(auth)/welcome.tsx`
- `app/(auth)/sign-in.tsx`
- `app/(auth)/sign-up.tsx`
- `app/(auth)/sign-up-email.tsx`
- `app/(auth)/oauth-callback.tsx`
- `app/(auth)/legal.tsx`
- `app/(auth)/name-capture.tsx`
- `app/(auth)/paywall/index.tsx`
- `app/(auth)/onboarding-client-otp.tsx`
- `app/(auth)/onboarding-client-fit.tsx`
- `app/(auth)/onboarding-client-frequency.tsx`
- `app/(auth)/onboarding-client-interests.tsx`
- `app/(auth)/onboarding-client-return-motivation.tsx`
- `app/(auth)/onboarding-client-usage-area.tsx`
- `app/(auth)/onboarding-business-role.tsx`
- `app/(auth)/onboarding-business-type.tsx`
- `app/(auth)/onboarding-business-name.tsx`
- `app/(auth)/onboarding-business-plan.tsx`
- `app/(auth)/onboarding-business-reason.tsx`
- `app/(auth)/onboarding-business-discovery.tsx`
- `app/(auth)/onboarding-business-usage-area.tsx`
- `app/(auth)/onboarding-business-cadence.tsx`
- `app/(auth)/onboarding-business-campaign-relevance.tsx`

## Authenticated Shell
- `app/(authenticated)/_layout.tsx`
- `app/(authenticated)/join.tsx`
- `app/(authenticated)/accept-invite.tsx`
- `app/(authenticated)/card/index.tsx`
- `app/(authenticated)/card/[membershipId].tsx`

## Customer Routes
- `app/(authenticated)/(customer)/_layout.tsx`
- `app/(authenticated)/(customer)/wallet.tsx`
- `app/(authenticated)/(customer)/rewards.tsx`
- `app/(authenticated)/(customer)/discovery.tsx`
- `app/(authenticated)/(customer)/show-qr.tsx`
- `app/(authenticated)/(customer)/settings.tsx`
- `app/(authenticated)/(customer)/account-details.tsx`
- `app/(authenticated)/(customer)/help-support.tsx`
- `app/(authenticated)/(customer)/referrals.tsx`
- `app/(authenticated)/(customer)/business/[businessId].tsx`
- `app/(authenticated)/(customer)/customer-card/[membershipId].tsx`

## Business Routes
- `app/(authenticated)/(business)/_layout.tsx`
- `app/(authenticated)/(business)/dashboard.tsx`
- `app/(authenticated)/(business)/scanner.tsx`
- `app/(authenticated)/(business)/analytics.tsx`
- `app/(authenticated)/(business)/customers.tsx`
- `app/(authenticated)/(business)/customer/[customerUserId].tsx`
- `app/(authenticated)/(business)/campaigns.tsx`
- `app/(authenticated)/(business)/programs.tsx`
- `app/(authenticated)/(business)/qr.tsx`
- `app/(authenticated)/(business)/settings.tsx`
- `app/(authenticated)/(business)/settings-business-account.tsx`
- `app/(authenticated)/(business)/settings-business-address.tsx`
- `app/(authenticated)/(business)/settings-business-profile.tsx`
- `app/(authenticated)/(business)/settings-business-referrals.tsx`
- `app/(authenticated)/(business)/settings-business-subscription.tsx`
- `app/(authenticated)/(business)/team/index.tsx`
- `app/(authenticated)/(business)/team/add.tsx`
- `app/(authenticated)/(business)/cards/_layout.tsx`
- `app/(authenticated)/(business)/cards/index.tsx`
- `app/(authenticated)/(business)/cards/[programId].tsx`
- `app/(authenticated)/(business)/cards/campaigns.tsx`
- `app/(authenticated)/(business)/cards/campaign/[campaignId].tsx`

## Staff Routes
- `app/(authenticated)/(staff)/_layout.tsx`
- `app/(authenticated)/(staff)/scanner.tsx`
- `app/(authenticated)/(staff)/customers.tsx`
- `app/(authenticated)/(staff)/customer/[customerUserId].tsx`
- `app/(authenticated)/(staff)/promotions.tsx`
- `app/(authenticated)/(staff)/settings.tsx`

## Admin Routes
- `app/(authenticated)/admin/_layout.tsx`
- `app/(authenticated)/admin/referrals.tsx`

## Merchant Alias Routes
- `app/(authenticated)/merchant/_layout.tsx`
- `app/(authenticated)/merchant/index.tsx`
- `app/(authenticated)/merchant/analytics.tsx`
- `app/(authenticated)/merchant/customers.tsx`
- `app/(authenticated)/merchant/qr.tsx`
- `app/(authenticated)/merchant/profile-settings.tsx`
- `app/(authenticated)/merchant/store-settings.tsx`
- `app/(authenticated)/merchant/support-inbox.tsx`
- `app/(authenticated)/merchant/onboarding/_layout.tsx`
- `app/(authenticated)/merchant/onboarding/index.tsx`
- `app/(authenticated)/merchant/onboarding/create-business.tsx`
- `app/(authenticated)/merchant/onboarding/create-program.tsx`
- `app/(authenticated)/merchant/onboarding/preview-card.tsx`

## Canonical Notes
- Auth entry still lives under `app/(auth)`.
- Customer, business, and staff experiences are separate route groups under `app/(authenticated)`.
- Merchant routes are compatibility/alias surfaces around business-role flows.
- Shared authenticated routes include join, invite acceptance, and card details.
- Some public paths intentionally duplicate after Expo Router group segments are removed, such as customer and business `settings` routes.
