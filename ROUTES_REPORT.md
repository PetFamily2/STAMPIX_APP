# ROUTES_REPORT

Generated: 2026-02-06 18:57

## 1) All Route Files (current)

- `app/(auth)/_layout.tsx`
- `app/(auth)/flow-map.tsx`
- `app/(auth)/index.tsx`
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
- `app/(authenticated)/(business)/_layout.tsx`
- `app/(authenticated)/(business)/analytics.tsx`
- `app/(authenticated)/(business)/business/analytics.tsx`
- `app/(authenticated)/(business)/business/dashboard.tsx`
- `app/(authenticated)/(business)/business/qr.tsx`
- `app/(authenticated)/(business)/business/scanner.tsx`
- `app/(authenticated)/(business)/business/team.tsx`
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
- `app/(authenticated)/business/_layout.tsx`
- `app/(authenticated)/business/analytics.tsx`
- `app/(authenticated)/business/dashboard.tsx`
- `app/(authenticated)/business/scanner.tsx`
- `app/(authenticated)/business/team.tsx`
- `app/(authenticated)/card/[membershipId].tsx`
- `app/(authenticated)/card/index.tsx`
- `app/(authenticated)/index.tsx`
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
- `app/(authenticated)/role.tsx`
- `app/(authenticated)/SettingsScreen.tsx`
- `app/_layout.tsx`
- `app/+not-found.tsx`

## 2) Duplicate Public Paths (group segments removed)

- **/_layout.**
  - `app/(auth)/_layout.tsx`
  - `app/(authenticated)/(business)/_layout.tsx`
  - `app/(authenticated)/(customer)/_layout.tsx`
  - `app/(authenticated)/_layout.tsx`
  - `app/_layout.tsx`
- **/business/analytics.**
  - `app/(authenticated)/(business)/business/analytics.tsx`
  - `app/(authenticated)/business/analytics.tsx`
- **/business/dashboard.**
  - `app/(authenticated)/(business)/business/dashboard.tsx`
  - `app/(authenticated)/business/dashboard.tsx`
- **/business/scanner.**
  - `app/(authenticated)/(business)/business/scanner.tsx`
  - `app/(authenticated)/business/scanner.tsx`
- **/business/team.**
  - `app/(authenticated)/(business)/business/team.tsx`
  - `app/(authenticated)/business/team.tsx`
- **/index.**
  - `app/(auth)/index.tsx`
  - `app/(authenticated)/index.tsx`
- **/settings.**
  - `app/(authenticated)/(business)/settings.tsx`
  - `app/(authenticated)/(customer)/settings.tsx`

## 3) Canonical vs Legacy Decisions

- **/business/analytics**  
  - Canonical route (stays active): `app/(authenticated)/(business)/analytics.tsx` (public path `/analytics`)  
  - Move to `_legacy` (deactivate public `/business/analytics` path):  
    - `app/(authenticated)/(business)/business/analytics.tsx`  
    - `app/(authenticated)/business/analytics.tsx`
- **/business/dashboard**  
  - Canonical route (stays active): `app/(authenticated)/(business)/dashboard.tsx` (public path `/dashboard`)  
  - Move to `_legacy`:  
    - `app/(authenticated)/(business)/business/dashboard.tsx`  
    - `app/(authenticated)/business/dashboard.tsx`
- **/business/scanner**  
  - Canonical route (stays active): `app/(authenticated)/(business)/scanner.tsx` (public path `/scanner`)  
  - Move to `_legacy`:  
    - `app/(authenticated)/(business)/business/scanner.tsx`  
    - `app/(authenticated)/business/scanner.tsx`
- **/business/team**  
  - Canonical route (stays active): `app/(authenticated)/(business)/team.tsx` (public path `/team`)  
  - Move to `_legacy`:  
    - `app/(authenticated)/(business)/business/team.tsx`  
    - `app/(authenticated)/business/team.tsx`
- **/settings**  
  - Intentional duplicate (customer vs business). Both stay active as separate tab trees:  
    - `app/(authenticated)/(customer)/settings.tsx`  
    - `app/(authenticated)/(business)/settings.tsx`
- **/index**  
  - Intentional duplicate (auth vs authenticated). Both stay active:  
    - `app/(auth)/index.tsx`  
    - `app/(authenticated)/index.tsx`
- **/_layout**  
  - Expected duplicates (layout files across groups). All stay active.

Additional non-canonical routes (not duplicates) to remove from route map without deletion:
- `app/(authenticated)/SettingsScreen.tsx` → move to `screens/SettingsScreen.tsx` (not a route).
- Entire `app/(authenticated)/business/` folder → move to `_legacy` (canonical business routes live under `app/(authenticated)/(business)`).
- Entire `app/(authenticated)/(business)/business/` folder → move to `_legacy`.
