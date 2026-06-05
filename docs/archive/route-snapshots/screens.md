# STAMPAIX - Screen Map (Current)

Last synced: 2026-02-18

## Route groups
- `(auth)` - pre-auth onboarding and sign-in/up flow
- `(authenticated)` - post-auth app
  - `(customer)` - customer tabs
  - `(business)` - business tabs
  - shared authenticated routes (`join`, `card/*`, `merchant/*`)

## Auth routes (`app/(auth)`)
- `/(auth)/index` -> redirects to `/(auth)/welcome`
- `/(auth)/welcome` - landing/start screen
- `/(auth)/sign-up` - auth method selection (Google/Apple/Email)
- `/(auth)/sign-up-email` - email entry to request OTP
- `/(auth)/onboarding-client-otp` - OTP verification
- `/(auth)/name-capture` - first/last name capture gate
- `/(auth)/onboarding-client-role`
- `/(auth)/onboarding-client-details`
- `/(auth)/onboarding-client-fit`
- `/(auth)/onboarding-client-frequency`
- `/(auth)/onboarding-client-interests`
- `/(auth)/onboarding-client-return-motivation`
- `/(auth)/onboarding-client-usage-area`
- `/(auth)/onboarding-business-role`
- `/(auth)/onboarding-business-name`
- `/(auth)/onboarding-business-reason`
- `/(auth)/onboarding-business-discovery`
- `/(auth)/onboarding-business-usage-area`
- `/(auth)/legal`
- `/(auth)/paywall`
- `/(auth)/sign-in` (legacy alias redirect to `/(auth)/sign-up`)

## Authenticated customer routes (`app/(authenticated)/(customer)`)
- `/(authenticated)/(customer)/wallet`
- `/(authenticated)/(customer)/rewards`
- `/(authenticated)/(customer)/discovery`
- `/(authenticated)/(customer)/settings`

## Authenticated business routes (`app/(authenticated)/(business)`)
- `/(authenticated)/(business)/dashboard`
- `/(authenticated)/(business)/scanner`
- `/(authenticated)/(business)/team`
- `/(authenticated)/(business)/analytics`
- `/(authenticated)/(business)/settings`
- `/(authenticated)/(business)/qr` (route file exists; tab visibility controlled by layout/screen options)

## Shared authenticated routes (`app/(authenticated)`)
- `/(authenticated)/join`
- `/(authenticated)/card/index`
- `/(authenticated)/card/[membershipId]`

## Merchant routes (`app/(authenticated)/merchant`)
- `/(authenticated)/merchant/index`
- `/(authenticated)/merchant/qr`
- `/(authenticated)/merchant/profile-settings`
- `/(authenticated)/merchant/store-settings`
- `/(authenticated)/merchant/onboarding/index`
- `/(authenticated)/merchant/onboarding/create-business`
- `/(authenticated)/merchant/onboarding/create-program`
- `/(authenticated)/merchant/onboarding/preview-card`

## Notes
- Canonical business/customer navigation is under grouped routes only.
- Legacy wrapper route trees are not part of the current source of truth.
- Route access still depends on auth status, role, onboarding flags, and appMode.
