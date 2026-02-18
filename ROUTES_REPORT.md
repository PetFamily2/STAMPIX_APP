# ROUTES_REPORT

Generated: 2026-02-18

## 1) All route files (current)

- `app/(auth)/_layout.tsx`
- `app/(auth)/flow-map.tsx`
- `app/(auth)/index.tsx`
- `app/(auth)/legal.tsx`
- `app/(auth)/name-capture.tsx`
- `app/(auth)/onboarding-business-discovery.tsx`
- `app/(auth)/onboarding-business-name.tsx`
- `app/(auth)/onboarding-business-reason.tsx`
- `app/(auth)/onboarding-business-role.tsx`
- `app/(auth)/onboarding-business-usage-area.tsx`
- `app/(auth)/onboarding-client-details.tsx`
- `app/(auth)/onboarding-client-fit.tsx`
- `app/(auth)/onboarding-client-frequency.tsx`
- `app/(auth)/onboarding-client-interests.tsx`
- `app/(auth)/onboarding-client-otp.tsx`
- `app/(auth)/onboarding-client-return-motivation.tsx`
- `app/(auth)/onboarding-client-role.tsx`
- `app/(auth)/onboarding-client-usage-area.tsx`
- `app/(auth)/paywall/index.tsx`
- `app/(auth)/sign-in.tsx`
- `app/(auth)/sign-up.tsx`
- `app/(auth)/sign-up-email.tsx`
- `app/(auth)/welcome.tsx`
- `app/(authenticated)/(business)/_layout.tsx`
- `app/(authenticated)/(business)/analytics.tsx`
- `app/(authenticated)/(business)/dashboard.tsx`
- `app/(authenticated)/(business)/qr.tsx`
- `app/(authenticated)/(business)/scanner.tsx`
- `app/(authenticated)/(business)/settings.tsx`
- `app/(authenticated)/(business)/team.tsx`
- `app/(authenticated)/(customer)/_layout.tsx`
- `app/(authenticated)/(customer)/discovery.tsx`
- `app/(authenticated)/(customer)/rewards.tsx`
- `app/(authenticated)/(customer)/settings.tsx`
- `app/(authenticated)/(customer)/wallet.tsx`
- `app/(authenticated)/_layout.tsx`
- `app/(authenticated)/card/[membershipId].tsx`
- `app/(authenticated)/card/index.tsx`
- `app/(authenticated)/join.tsx`
- `app/(authenticated)/merchant/_layout.tsx`
- `app/(authenticated)/merchant/analytics.tsx`
- `app/(authenticated)/merchant/index.tsx`
- `app/(authenticated)/merchant/onboarding/_layout.tsx`
- `app/(authenticated)/merchant/onboarding/create-business.tsx`
- `app/(authenticated)/merchant/onboarding/create-program.tsx`
- `app/(authenticated)/merchant/onboarding/index.tsx`
- `app/(authenticated)/merchant/onboarding/preview-card.tsx`
- `app/(authenticated)/merchant/profile-settings.tsx`
- `app/(authenticated)/merchant/qr.tsx`
- `app/(authenticated)/merchant/store-settings.tsx`
- `app/_layout.tsx`

## 2) Duplicate public paths (group segments removed)

- `/_layout`
  - `app/(auth)/_layout.tsx`
  - `app/(authenticated)/(business)/_layout.tsx`
  - `app/(authenticated)/(customer)/_layout.tsx`
  - `app/(authenticated)/_layout.tsx`
  - `app/_layout.tsx`
- `/settings`
  - `app/(authenticated)/(business)/settings.tsx`
  - `app/(authenticated)/(customer)/settings.tsx`

## 3) Canonical path notes

- `/(auth)/index` is a redirect entrypoint to `/(auth)/welcome`.
- `/(auth)/sign-in` is a legacy alias redirect to `/(auth)/sign-up`.
- `/settings` duplication is intentional (separate customer and business tab trees).
- No legacy wrapper route trees are present under:
  - `app/(authenticated)/business/*`
  - `app/(authenticated)/(business)/business/*`
