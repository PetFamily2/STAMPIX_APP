# Current Product Status

Last scanned: 2026-06-11

This report is based on the current codebase, especially `app/`, `screens/`,
`components/`, `contexts/`, `lib/`, `config/`, `convex/`, `app.json`, and
`package.json`. It intentionally does not rely on older planning documents.

## 1. Current Product Overview

STAMPAIX is an Expo React Native loyalty platform for Hebrew/RTL mobile use. The
app supports customers who collect stamps and rewards, businesses that create
loyalty programs and campaigns, staff who scan customer QR codes, and admins who
handle platform-level referral/support operations.

The product is substantially implemented as a Convex-backed mobile app with
authentication, customer wallet/discovery, business onboarding, QR scan flows,
campaigns, referrals, push notifications, RevenueCat billing hooks, and AI
recommendation modules. The code still contains production-risk dev utilities
and several external-service gaps that block store-ready release.

## 2. Current User Roles

- Customer: every authenticated user has customer access. Customer screens show
  wallet, rewards, discovery, business details, QR code, referrals, settings,
  account details, and support.
- Business owner: an active `businessStaff` record with `staffRole: "owner"`.
  Owners can access business dashboard, scanner, analytics, customers,
  campaigns, programs/cards, QR, settings, subscription, referrals, and team
  management.
- Business manager: an active `businessStaff` record with `staffRole:
  "manager"`. Managers have broad operational access but are restricted from
  billing/subscription management, destructive campaign actions, and some owner
  settings by `lib/domain/businessPermissions.ts`.
- Staff: an active `businessStaff` record with `staffRole: "staff"`. Staff are
  routed to the staff shell and can use scanner/customer/promotions/settings
  flows, with limited permissions.
- Admin: a user with `isAdmin === true`. Admin-only routes and queries guard
  referral admin tools and support inbox data.

## 3. Current Screen Map

### Root And Auth

- `app/_layout.tsx`: root providers for Convex Auth, user/session context,
  push notifications, active business, app mode, onboarding, and RevenueCat.
- `app/(auth)/welcome.tsx`, `sign-in.tsx`, `sign-up.tsx`,
  `sign-up-email.tsx`, `oauth-callback.tsx`, `legal.tsx`, `name-capture.tsx`.
- Customer onboarding screens:
  `onboarding-client-otp.tsx`, `onboarding-client-fit.tsx`,
  `onboarding-client-frequency.tsx`, `onboarding-client-interests.tsx`,
  `onboarding-client-return-motivation.tsx`,
  `onboarding-client-usage-area.tsx`.
- Business onboarding screens:
  `onboarding-business-role.tsx`, `onboarding-business-type.tsx`,
  `onboarding-business-name.tsx`, `onboarding-business-plan.tsx`,
  `onboarding-business-reason.tsx`, `onboarding-business-discovery.tsx`,
  `onboarding-business-usage-area.tsx`, `onboarding-business-cadence.tsx`,
  `onboarding-business-campaign-relevance.tsx`.
- `app/(auth)/paywall/index.tsx`: subscription/paywall screen.

### Authenticated Shared

- `app/(authenticated)/_layout.tsx`: session gate, onboarding gate, active mode
  routing, and business/staff shell routing.
- `app/(authenticated)/join.tsx`: business/customer referral join handling.
- `app/(authenticated)/accept-invite.tsx`: staff invite acceptance.
- `app/(authenticated)/card/index.tsx` and `card/[membershipId].tsx`: shared
  card routes.

### Customer Shell

- `wallet.tsx`: customer wallet, pending invite banner, and referral summary.
- `rewards.tsx`: campaign/reward inbox.
- `discovery.tsx`: map/location based business discovery.
- `show-qr.tsx`: customer QR for scanning.
- `business/[businessId].tsx`: business detail and join programs.
- `customer-card/[membershipId].tsx`: membership card view.
- `referrals.tsx`: customer referral dashboard.
- `settings.tsx`, `account-details.tsx`, `help-support.tsx`.

### Business Shell

- `dashboard.tsx`: business overview, KPIs, activity, AI recommendations,
  referral summaries, shortcuts.
- `scanner.tsx`: QR scan, stamp/redeem, undo.
- `analytics.tsx`: analytics dashboard.
- `customers.tsx`, `customer/[customerUserId].tsx`: customer list/detail.
- `campaigns.tsx`: alias into campaigns management.
- `programs.tsx`: alias into card/program management.
- `cards/index.tsx`, `cards/[programId].tsx`, `cards/campaigns.tsx`,
  `cards/campaign/[campaignId].tsx`: loyalty program/card/campaign stack.
- `qr.tsx`: business join QR/code.
- `team/index.tsx`, `team/add.tsx`: team and staff invitation management.
- `settings.tsx`, `settings-business-account.tsx`,
  `settings-business-address.tsx`, `settings-business-profile.tsx`,
  `settings-business-referrals.tsx`, `settings-business-subscription.tsx`.

### Staff Shell

- `scanner.tsx`: staff scanner.
- `customers.tsx`, `customer/[customerUserId].tsx`: customer lookup/detail.
- `promotions.tsx`: staff promotions/campaign access.
- `settings.tsx`: staff settings.

### Admin And Legacy Merchant Alias

- `admin/_layout.tsx`: admin guard.
- `admin/referrals.tsx`: referral administration.
- `merchant/*`: older merchant alias routes for dashboard, analytics,
  customers, QR, profile/store settings, support inbox, and onboarding. The
  support inbox route renders `AdminSupportInboxScreen` and relies on runtime
  admin checks.

## 4. Current Customer Flows

- Sign in or sign up through Convex Auth using email OTP/password, Google, or
  Apple providers.
- Complete name capture and customer onboarding.
- Open wallet and view joined businesses and loyalty cards.
- Join a business via `/join` deep link, business QR, manual join code, or
  referral link.
- Discover nearby businesses using current location and Google Maps/Places
  support.
- Open a business, select loyalty programs, and join selected programs.
- Show a signed QR code for a business scanner to stamp or redeem.
- View rewards and campaign messages.
- Share customer referral links and review referral rewards/history.
- Manage account details, notifications, marketing opt-in, help/support, legal
  links, sign-out, and account deletion.

## 5. Current Business Flows

- Start as a customer, choose business onboarding, create a business, choose a
  plan, configure business profile/address, create a first program, preview a
  card, and publish.
- Switch into business mode when the authenticated user has an active business
  staff membership.
- View dashboard metrics, recent activity, referral credits, and AI
  recommendations.
- Create, edit, publish, archive, restore, and delete loyalty programs/cards.
- Scan customer QR codes, apply stamps, redeem rewards, undo recent scanner
  actions, and redeem referral benefits.
- Manage customers and inspect customer membership/activity.
- Create campaign drafts, estimate audience, schedule, send now, archive, and
  restore campaigns.
- Review analytics and customer lifecycle metrics.
- Configure business QR/join code, profile, address, referral settings,
  subscription, and team.

## 6. Current Admin/Staff Flows

- Staff users are routed to the staff shell for scanner-first operation and can
  access customers, customer detail, promotions, and settings.
- Managers and owners are routed to the business shell and receive broader
  management access according to permission checks.
- Admin users can open referral admin tools and, through the merchant support
  inbox route, review and mark support requests as new or handled.
- Staff invitations can be created by owners/managers and accepted by invited
  users through the shared invite route.

## 7. Existing Backend Modules

- Auth/session/users: `convex/auth.ts`, `auth.config.ts`, `users.ts`,
  `guards.ts`, `otp.ts`.
- Business/team/onboarding: `business.ts`, `onboarding.ts`,
  `lib/staffPermissions.ts`.
- Loyalty/memberships/cards/scanner: `loyaltyPrograms.ts`,
  `memberships.ts`, `customerCards.ts`, `scanner.ts`, `scanTokens.ts`,
  `events.ts`.
- Campaigns/retention/analytics/dashboard: `campaigns.ts`, `retention.ts`,
  `analytics.ts`, `dashboard.ts`, `customerLifecycle.ts`.
- Billing/entitlements: `entitlements.ts`.
- Referrals: `referrals.ts`.
- Push/support/AI: `pushNotifications.ts`, `support.ts`,
  `aiRecommendations.ts`.
- Operations: `crons.ts`, `http.ts`, `seed.ts`, `debug.ts`, migrations under
  `convex/migrations/`, generated Convex files under `convex/_generated/`.

Main schema tables include users, businesses, businessStaff, loyaltyPrograms,
memberships, events, scanSessions, campaigns, subscriptions, referrals,
messageLog, AI snapshots/recommendations/cache/ledger, push tokens/logs,
support requests, API clients/keys, staff invites/events, email OTPs, and
Convex Auth tables.

## 8. Existing Integrations

- Expo/React Native: Expo 54, React Native 0.81, Expo Router, Secure Store,
  Notifications, Camera, Image Picker, Location, Linking, Web Browser,
  Localization, Updates, Dev Client.
- Convex: database, functions, cron jobs, HTTP routes, Convex Auth.
- Convex Auth providers: email OTP, password, Google, Apple.
- RevenueCat: `react-native-purchases`, `react-native-purchases-ui`,
  `RevenueCatProvider`, business upgrade modal, package id config, and
  development-gated mock payment mode.
- Google Maps/Places: address autocomplete, geocoding, discovery/map features.
- Expo Push Notifications: client token registration and Convex delivery via
  Expo push API.
- Resend: email OTP delivery for auth/onboarding.
- OpenRouter: AI recommendation generation.
- EAS: build and submit scripts plus EAS project id in `app.json`.
- Analytics: abstraction exists, but current providers are console/stub level.

## 9. Features That Appear Implemented

- Auth provider wiring, OAuth callback handling, secure token storage, and
  authenticated route gating.
- Customer onboarding/name capture and customer app shell.
- Business onboarding draft flow and initial business/program setup.
- Active business/mode switching for customer, owner, manager, and staff users.
- Customer wallet, membership cards, QR display, rewards inbox, discovery,
  business detail, referrals, account details, support, and settings.
- Business dashboard, scanner, customers, customer detail, analytics, campaigns,
  program/card management, QR, subscription/settings, referrals, and team.
- Staff scanner/customer/promotions/settings shell.
- Admin referral tooling and support inbox screen guarded by `isAdmin`.
- Loyalty program lifecycle and membership join flows.
- Signed scan token generation and scanner commit/undo flow.
- Campaign draft/send/schedule/archive/restore flows and campaign automation
  cron.
- Referral configuration, customer referrals, business referrals, admin audit,
  reward expiration, and credit sweeps.
- Push token registration, token disabling, delivery logging, and Expo push
  send action.
- Business entitlements and plan-limit enforcement modules.
- Scoped current-user account deletion implementation and local session cleanup.
- Convex tests for scanner, staff permissions, referrals, entitlements,
  deletion, business, analytics, customer lifecycle, and migrations.

## 10. Features That Appear Partially Implemented

- RevenueCat billing: production purchase/restore entry points are intentionally
  blocked before RevenueCat SDK purchase calls, and public client-side
  subscription writes fail closed until a server-authoritative RevenueCat
  webhook route is implemented. No RevenueCat webhook route is present in
  `convex/http.ts`, so renewals, cancellations, refunds, and cross-device
  lifecycle changes are not fully server-authoritative.
- Analytics: `lib/analytics/index.ts` defaults to console logging; PostHog and
  Firebase providers are placeholders.
- AI recommendations: Convex module is substantial, but it depends on
  `OPENROUTER_API_KEY` and should degrade cleanly when disabled or exhausted.
- Discovery/address search: Google Maps/Places code exists. Native Google Maps
  keys are injected by dynamic Expo config from
  `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` when set, and `app.json` declares the
  permission copy. The app still needs a configured and restricted key plus
  real-device build verification.
- Push notifications: app and backend code exist, but production readiness
  depends on APNs/FCM/EAS credential configuration and real-device testing.
- Store/deep-link landing: `convex/http.ts` serves `/join`, preserves join and
  referral params, and opens the app through `stampix://join`. App Store URL
  still defaults to an App Store search URL unless a real listing URL is
  configured.
- Admin support: support backend and admin UI exist, but the route is currently
  under `merchant/support-inbox.tsx` rather than the guarded `admin/` route
  tree.
- Legacy retention module: several legacy APIs intentionally return disabled or
  migration messages while the newer campaigns flow is used.
- Payment identity: paid production purchasing is disabled until Phase B. Any
  future business upgrade flow should continue to use `business:<businessId>`
  identity and server-authoritative entitlement writes.

## 11. Features That Appear Broken Or Incomplete

- Email sign-up for a new email appears blocked: `sign-up-email.tsx` checks
  `api.auth.getEmailSignInStatus` and shows an account-not-found state instead
  of sending OTP for a new account.
- Production account deletion now uses scoped current-user deletion, preserves
  business-owned scan/event/referral history by redacting deleted user
  references, and blocks sole active business owners from orphaning a business.
  A separate explicit business deletion/transfer flow is still needed for
  owners who want to remove or transfer a business.
- Referral, customer-card, dashboard, lifecycle, analytics, and AI readers now
  tolerate redacted user references without fetching missing users or counting
  synthetic `undefined` customer/staff identities.
- Seed/debug maintenance operations have been internalized and the customer
  wallet demo seed action was removed. Development seed/debug access now needs
  server-side internal invocation or local tooling rather than public client
  calls.
- No server-side RevenueCat webhook means subscription state can drift after
  cancellation, refund, renewal failure, or purchase outside the current device.
- Native permission declarations in `app.json` now cover the used camera,
  image picker/photo library, foreground location, maps, and notification
  flows. Store disclosure copy and generated native build verification are
  still required.
- App Store/Google Play legal and store URLs depend on external pages and
  listings that are not verifiable from the codebase.
- Generated Convex `fullApi` still lists modules for typing, but seed/debug
  functions are internal-only and filtered out of the public `api` surface.

## 12. Missing MVP Flows

- Safe new-user email OTP registration flow.
- Server-authoritative billing lifecycle sync from RevenueCat webhooks.
- Real production analytics provider with privacy-safe event tracking.
- Explicit business deletion or ownership-transfer flow for sole active owners.
- End-to-end App Store/Play deep-link verification for `/join`, including
  hosted AASA and Android asset links files.
- Verified legal pages for privacy policy, terms, camera, location, push,
  purchases, and account deletion.
- Store-ready permission prompts and native permission strings.
- Full purchase QA for business plans, restore purchases, cancellation, refund,
  and entitlement downgrade.
- Admin support route under the current admin route tree, if support inbox is
  intended to be a live admin MVP tool.

## 13. Production Blockers

1. New email sign-up appears blocked for users without existing accounts.
2. Billing has no RevenueCat webhook endpoint for authoritative subscription
   lifecycle updates.
3. Analytics is not production-grade; provider integrations are placeholders.
4. Native permissions were added to `app.json`, but store disclosure
   configuration and generated native build verification are still required for
   camera, location, media/photo selection, notifications, and maps.
5. Store URLs, legal URLs, universal links, and Android app links require
   production verification outside the codebase.
6. Push notification credentials and real-device delivery need production QA.
7. EAS production builds and submissions have scripts, but no current build
    result is proven by this code scan.

## 14. App Store / Google Play Blockers

- App requires camera, location, notifications, image picker/photo access, and
  in-app purchases. `app.json` now contains native permission declarations for
  the used camera/location/photo/notification/map capabilities, but generated
  native builds and store privacy disclosures still need verification.
- The iOS App Store URL defaults to a search URL in backend join fallback code;
  a final app listing URL must be configured before release.
- Privacy policy and terms URLs default to `https://stampix.app/legal/privacy`
  and `/terms`; those pages must be live and match app behavior.
- Sole-owner business transfer/deletion UX must be completed before store
  review if owners need to remove their account while owning a business.
- RevenueCat products, offerings, entitlements, sandbox tests, and production
  product ids must match the app config.
- Apple and Google OAuth production client configuration must match bundle id,
  package name, redirects, and associated domains.
- Universal links require a valid Apple App Site Association file at
  `https://stampix.app/.well-known/apple-app-site-association`; Android app
  links require `https://stampix.app/.well-known/assetlinks.json` with valid
  production SHA-256 fingerprints.
- Push notifications require APNs/FCM setup and real-device tests.
- Store privacy labels/data safety forms must reflect Convex Auth, location,
  camera QR scanning, push tokens, purchases, referrals, analytics, support
  requests, and AI usage.

## 15. Recommended Next 30 Tasks

1. Fix new-user email OTP sign-up in `sign-up-email.tsx`.
2. Add tests for new email sign-up, existing email sign-in, and OAuth account
   linking.
3. Add a RevenueCat webhook HTTP route and verify lifecycle sync.
4. Make business billing identity consistent across onboarding, paywall,
   upgrade modal, restore, and entitlement checks.
5. Add explicit business ownership transfer and business deletion flows for
   sole active owners.
6. Configure real RevenueCat products, offerings, package ids, and sandbox QA.
7. Verify generated native builds and store disclosure copy for the `app.json`
   camera, location, photo/media, maps, and notification configuration.
8. Verify Apple/Google OAuth production redirect and bundle/package settings.
9. Configure and restrict Google Maps/Places API keys.
10. Configure Resend production sender/domain and OTP deliverability.
11. Configure `SCAN_TOKEN_SECRET` and key rotation policy for production.
12. Configure APNs/FCM/EAS push credentials and test push delivery on devices.
13. Replace analytics console/stub providers with a real provider or disable
    analytics UI/events explicitly for MVP.
14. Decide whether OpenRouter AI is an MVP requirement; configure it or hide AI
    recommendation surfaces when unavailable.
15. Move admin support inbox to an explicit admin route or document the
    merchant alias route as intentional.
16. Audit all route aliases under `merchant/` and remove or redirect stale ones
    before release.
17. Verify role permissions on every business/staff screen with owner, manager,
    staff, admin, and customer accounts.
18. Run end-to-end QA for business onboarding through first published program.
19. Run end-to-end QA for customer join, referral attribution, stamp, redeem,
    and undo.
20. Run end-to-end QA for campaign draft, audience estimate, send now,
    scheduled automation, push delivery, and reward inbox display.
21. Run end-to-end QA for team invite, accept invite, staff routing, and staff
    scanner.
22. Verify legal pages, privacy/data-safety disclosures, and account deletion
    copy against actual app behavior.
23. Verify universal links and Android app links for `/join`.
24. Run `bun run check:full` and the available Convex/lib tests on a clean
    checkout.
25. Produce EAS preview builds for iOS and Android and test on real devices.
26. Prepare App Store/Google Play metadata, screenshots, review notes, privacy
    forms, and production environment variables.
