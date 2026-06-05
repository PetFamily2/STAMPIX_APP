# STAMPIX_APP Architectural Map

## 1. Global Navigation Map

### Root route tree

- `app/_layout.tsx`
  - Root stack shell for the full app.
  - Declares:
    - `"(auth)"`
    - `"(authenticated)"`
    - `"+not-found"`

- `app/(auth)/_layout.tsx`
  - Auth route-control layout.
  - Loads `api.users.getCurrentUser`.
  - Redirects authenticated users toward `/(authenticated)/(customer)/wallet` unless preview/onboarding exceptions apply.
  - Stack routes mounted:
    - `welcome`
    - `sign-in`
    - `sign-up`
    - `sign-up-email`
    - `name-capture`
    - `onboarding-client-interests`
    - `onboarding-client-fit`
    - `onboarding-client-usage-area`
    - `onboarding-client-frequency`
    - `onboarding-client-return-motivation`
    - `onboarding-client-otp`
    - `onboarding-business-role`
    - `onboarding-business-discovery`
    - `onboarding-business-reason`
    - `onboarding-business-usage-area`
    - `onboarding-business-name`
    - `onboarding-business-plan`
    - `oauth-callback`
    - `legal`
    - `paywall/index`

- `app/(authenticated)/_layout.tsx`
  - Authenticated route-control layout.
  - Loads:
    - `api.users.getCurrentUser`
    - `api.users.getSessionContext`
  - Uses:
    - `useAppMode`
    - `useActiveBusiness`
  - Redirects users among customer, business, staff, name capture, onboarding, join, and card routes.
  - Mounted stack routes:
    - `"(customer)"`
    - `"(business)"`
    - `"(staff)"`
    - `join`
    - `accept-invite`
    - `card/index`
    - `card/[membershipId]`
    - `merchant`

### Customer shell

- `app/(authenticated)/(customer)/_layout.tsx`
  - Bottom-tab shell.
  - Visible tabs:
    - `settings`
    - `rewards`
    - `show-qr`
    - `discovery`
    - `wallet`
  - Hidden routes:
    - `account-details`
    - `help-support`
    - `business/[businessId]`
    - `customer-card/[membershipId]`

### Business shell

- `app/(authenticated)/(business)/_layout.tsx`
  - Bottom-tab shell with route-control.
  - Loads `api.users.getSessionContext`.
  - Redirects users to auth, customer wallet, staff shell, or business onboarding entry.
  - Visible tabs:
    - `settings`
    - `cards`
    - `scanner`
    - `analytics`
    - `dashboard`
  - Hidden routes:
    - `qr`
    - `team`
    - `team/index`
    - `team/add`
    - `customers`
    - `customer/[customerUserId]`
    - `settings-business-profile`
    - `settings-business-account`
    - `settings-business-subscription`
    - `settings-business-address`

- `app/(authenticated)/(business)/cards/_layout.tsx`
  - Cards stack shell for loyalty programs and campaigns.

### Staff shell

- `app/(authenticated)/(staff)/_layout.tsx`
  - Bottom-tab shell with route-control.
  - Loads `api.users.getSessionContext`.
  - Visible tabs:
    - `settings`
    - `promotions`
    - `scanner`
    - `customers`
  - Hidden route:
    - `customer/[customerUserId]`

### Merchant shell

- `app/(authenticated)/merchant/_layout.tsx`
  - Alias route-control shell for business roles.
  - Uses `useRoleGuard(BUSINESS_ROLES)`.
  - Allows onboarding routes and merchant alias routes.

- `app/(authenticated)/merchant/onboarding/_layout.tsx`
  - Stack shell for merchant onboarding routes.

### Major explicit navigation targets

- Auth flow:
  - `/(auth)/welcome` -> `/(auth)/sign-up`
  - `/(auth)/sign-up` -> `/(auth)/sign-up-email` or `/(auth)/oauth-callback`
  - `/(auth)/sign-up-email` -> `/(auth)/onboarding-client-otp`
  - `/(auth)/name-capture` -> `/(auth)/onboarding-client-interests`
  - Client onboarding final route -> `/(authenticated)/(customer)/wallet`

- Customer flow:
  - `wallet` -> `join`, `accept-invite`, `business/[businessId]`
  - `discovery` -> `business/[businessId]`
  - `business/[businessId]` -> `customer-card/[membershipId]`
  - `show-qr` -> `customer-card/[membershipId]` after new stamp event
  - `customer-card/[membershipId]` -> back to wallet

- Business flow:
  - `dashboard` -> cards, campaigns, customers, analytics, QR, onboarding, upgrade modal CTAs
  - `cards/index` -> `cards/[programId]`, `cards/campaigns`
  - `cards/campaigns` -> `cards/campaign/[campaignId]`
  - `customers` -> `customer/[customerUserId]`
  - `settings` -> business profile, business address, account, QR, subscription, team

- Staff flow:
  - `customers` -> `customer/[customerUserId]`
  - `scanner` reuses business scanner route implementation
  - `settings` can switch to customer mode or leave business

- Merchant aliases:
  - `merchant/index` -> business dashboard implementation
  - `merchant/analytics` -> business analytics implementation
  - `merchant/customers` -> business customers implementation
  - `merchant/qr` -> redirect to business QR
  - `merchant/profile-settings` -> redirect to business account settings
  - `merchant/store-settings` -> redirect to business profile settings

## 2. Screen List

### Root

- `app/_layout.tsx` -> route group `root`
- `app/+not-found.tsx` -> route group `root`

### Auth

- `app/(auth)/_layout.tsx` -> route group `(auth)`
- `app/(auth)/index.tsx` -> route group `(auth)`
- `app/(auth)/welcome.tsx` -> route group `(auth)`
- `app/(auth)/sign-in.tsx` -> route group `(auth)`
- `app/(auth)/sign-up.tsx` -> route group `(auth)`
- `app/(auth)/sign-up-email.tsx` -> route group `(auth)`
- `app/(auth)/oauth-callback.tsx` -> route group `(auth)`
- `app/(auth)/name-capture.tsx` -> route group `(auth)`
- `app/(auth)/legal.tsx` -> route group `(auth)`
- `app/(auth)/paywall/index.tsx` -> route group `(auth)/paywall`
- `app/(auth)/onboarding-client-otp.tsx` -> route group `(auth)`
- `app/(auth)/onboarding-client-interests.tsx` -> route group `(auth)`
- `app/(auth)/onboarding-client-fit.tsx` -> route group `(auth)`
- `app/(auth)/onboarding-client-usage-area.tsx` -> route group `(auth)`
- `app/(auth)/onboarding-client-frequency.tsx` -> route group `(auth)`
- `app/(auth)/onboarding-client-return-motivation.tsx` -> route group `(auth)`
- `app/(auth)/onboarding-business-role.tsx` -> route group `(auth)`
- `app/(auth)/onboarding-business-discovery.tsx` -> route group `(auth)`
- `app/(auth)/onboarding-business-reason.tsx` -> route group `(auth)`
- `app/(auth)/onboarding-business-usage-area.tsx` -> route group `(auth)`
- `app/(auth)/onboarding-business-name.tsx` -> route group `(auth)`
- `app/(auth)/onboarding-business-plan.tsx` -> route group `(auth)`

### Authenticated shared

- `app/(authenticated)/_layout.tsx` -> route group `(authenticated)`
- `app/(authenticated)/join.tsx` -> route group `(authenticated)`
- `app/(authenticated)/accept-invite.tsx` -> route group `(authenticated)`
- `app/(authenticated)/card/index.tsx` -> route group `(authenticated)/card`
- `app/(authenticated)/card/[membershipId].tsx` -> route group `(authenticated)/card`

### Customer

- `app/(authenticated)/(customer)/_layout.tsx` -> route group `(authenticated)/(customer)`
- `app/(authenticated)/(customer)/wallet.tsx`
- `app/(authenticated)/(customer)/discovery.tsx`
- `app/(authenticated)/(customer)/rewards.tsx`
- `app/(authenticated)/(customer)/show-qr.tsx`
- `app/(authenticated)/(customer)/settings.tsx`
- `app/(authenticated)/(customer)/account-details.tsx`
- `app/(authenticated)/(customer)/help-support.tsx`
- `app/(authenticated)/(customer)/business/[businessId].tsx`
- `app/(authenticated)/(customer)/customer-card/[membershipId].tsx`

### Business

- `app/(authenticated)/(business)/_layout.tsx`
- `app/(authenticated)/(business)/dashboard.tsx`
- `app/(authenticated)/(business)/analytics.tsx`
- `app/(authenticated)/(business)/scanner.tsx`
- `app/(authenticated)/(business)/customers.tsx`
- `app/(authenticated)/(business)/customer/[customerUserId].tsx`
- `app/(authenticated)/(business)/qr.tsx`
- `app/(authenticated)/(business)/settings.tsx`
- `app/(authenticated)/(business)/settings-business-account.tsx`
- `app/(authenticated)/(business)/settings-business-address.tsx`
- `app/(authenticated)/(business)/settings-business-profile.tsx`
- `app/(authenticated)/(business)/settings-business-subscription.tsx`
- `app/(authenticated)/(business)/cards/_layout.tsx`
- `app/(authenticated)/(business)/cards/index.tsx`
- `app/(authenticated)/(business)/cards/[programId].tsx`
- `app/(authenticated)/(business)/cards/campaigns.tsx`
- `app/(authenticated)/(business)/cards/campaign/[campaignId].tsx`
- `app/(authenticated)/(business)/team/index.tsx`
- `app/(authenticated)/(business)/team/add.tsx`

### Staff

- `app/(authenticated)/(staff)/_layout.tsx`
- `app/(authenticated)/(staff)/scanner.tsx`
- `app/(authenticated)/(staff)/customers.tsx`
- `app/(authenticated)/(staff)/customer/[customerUserId].tsx`
- `app/(authenticated)/(staff)/promotions.tsx`
- `app/(authenticated)/(staff)/settings.tsx`

### Merchant

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

## 3. Detailed Screen Analysis

### SCREEN

* Screen name: Root Layout
* Route path: `/`
* Route group: `root`

### PURPOSE

* Mounts the root stack and delegates navigation into auth, authenticated, and not-found trees.

### UI STRUCTURE

* Block name: Root stack
* Component file: `app/_layout.tsx`
* What it displays: No standalone visible UI; stack registration only
* What interaction it supports: Route mounting

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: None

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `(auth)`, `(authenticated)`, `+not-found`
* Where users arrive from: App entry point

### FILES INVOLVED

* `app/_layout.tsx`

---

### SCREEN

* Screen name: Not Found
* Route path: `+not-found`
* Route group: `root`

### PURPOSE

* Displays the fallback screen for unmatched routes.

### UI STRUCTURE

* Block name: Not found message
* Component file: `app/+not-found.tsx`
* What it displays: Missing route message and navigation affordance
* What interaction it supports: Navigation back through Expo Router link

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: None

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Navigate to root
* Mutation called: None
* Files where logic lives: `app/+not-found.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: root link
* Where users arrive from: Unmatched routes

### FILES INVOLVED

* `app/+not-found.tsx`

---

### SCREEN

* Screen name: Auth Layout
* Route path: `/(auth)`
* Route group: `(auth)`

### PURPOSE

* Gates auth routes and redirects authenticated users toward the authenticated shell unless explicit exceptions apply.

### UI STRUCTURE

* Block name: Route-control layout
* Component file: `app/(auth)/_layout.tsx`
* What it displays: Loading screen during auth check; otherwise stack registration
* What interaction it supports: Redirect and route registration

### DATA SOURCES

* Convex query used: `api.users.getCurrentUser`
* Table(s) used: `users`
* Derived calculations: `didRedirectToAuthenticated` module flag, preview/onboarding exception checks

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(customer)/wallet`, onboarding routes, paywall, oauth callback
* Where users arrive from: Root layout

### FILES INVOLVED

* `app/(auth)/_layout.tsx`

---

### SCREEN

* Screen name: Auth Index Redirect
* Route path: `/(auth)`
* Route group: `(auth)`

### PURPOSE

* Redirects the auth index route to the welcome screen.

### UI STRUCTURE

* Block name: Redirect
* Component file: `app/(auth)/index.tsx`
* What it displays: No standalone UI
* What interaction it supports: Immediate redirect

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: None

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/welcome`
* Where users arrive from: Root auth path

### FILES INVOLVED

* `app/(auth)/index.tsx`

---

### SCREEN

* Screen name: Welcome
* Route path: `/(auth)/welcome`
* Route group: `(auth)`

### PURPOSE

* Introduces the application and starts the sign-up flow.

### UI STRUCTURE

* Block name: Preview banner
* Component file: `app/(auth)/welcome.tsx`
* What it displays: Preview mode close banner when preview params are set
* What interaction it supports: Exit preview
* Block name: Header row
* Component file: `app/(auth)/welcome.tsx`
* What it displays: Back button
* What interaction it supports: Back navigation to sign-in
* Block name: Logo section
* Component file: `app/(auth)/welcome.tsx`
* What it displays: `STAMPAIX_IMAGE_LOGO`
* What interaction it supports: None
* Block name: Title section
* Component file: `app/(auth)/welcome.tsx`
* What it displays: Marketing title and subtitle text
* What interaction it supports: None
* Block name: Feature cards
* Component file: `app/(auth)/welcome.tsx`
* What it displays: Customer engagement card and business growth card
* What interaction it supports: None
* Block name: CTA section
* Component file: `app/(auth)/welcome.tsx`
* What it displays: Start button and existing account link
* What interaction it supports: Push to sign-up

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: `isPreviewMode` from query params

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Back button
* Mutation called: None
* Files where logic lives: `app/(auth)/welcome.tsx`, `lib/navigation.ts`
* Button / interaction: Get started
* Mutation called: None
* Files where logic lives: `app/(auth)/welcome.tsx`, `lib/onboarding/useOnboardingTracking.ts`
* Button / interaction: Existing account link
* Mutation called: None
* Files where logic lives: `app/(auth)/welcome.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/sign-up`, `/(auth)/sign-in`
* Where users arrive from: `/(auth)`, `safeBack` fallbacks

### FILES INVOLVED

* `app/(auth)/welcome.tsx`
* `components/BackButton.tsx`
* `components/PreviewModeBanner.tsx`
* `lib/navigation.ts`
* `lib/onboarding/useOnboardingTracking.ts`

---

### SCREEN

* Screen name: Sign In Redirect
* Route path: `/(auth)/sign-in`
* Route group: `(auth)`

### PURPOSE

* Redirects the sign-in route to the sign-up screen.

### UI STRUCTURE

* Block name: Redirect
* Component file: `app/(auth)/sign-in.tsx`
* What it displays: No standalone UI
* What interaction it supports: Immediate redirect

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: None

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/sign-up`
* Where users arrive from: explicit replaces to sign-in from settings and auth back paths

### FILES INVOLVED

* `app/(auth)/sign-in.tsx`

---

### SCREEN

* Screen name: Sign Up
* Route path: `/(auth)/sign-up`
* Route group: `(auth)`

### PURPOSE

* Lets the user choose an authentication method.

### UI STRUCTURE

* Block name: Preview banner
* Component file: `app/(auth)/sign-up.tsx`
* What it displays: Preview close banner when preview params are active
* What interaction it supports: Exit preview
* Block name: Header
* Component file: `app/(auth)/sign-up.tsx`
* What it displays: Back button
* What interaction it supports: Back to welcome
* Block name: Title section
* Component file: `app/(auth)/sign-up.tsx`
* What it displays: Sign-up title text
* What interaction it supports: None
* Block name: Auth options
* Component file: `app/(auth)/sign-up.tsx`
* What it displays: Apple, Google, and Email options
* What interaction it supports: Select auth method and trigger OAuth or email route
* Block name: Footer
* Component file: `app/(auth)/sign-up.tsx`
* What it displays: Continue button and legal document text link
* What interaction it supports: Continue with selected method; open legal URL

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: `isPreviewMode`, selected auth method, OAuth loading state

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Select Apple / Google / Email
* Mutation called: None
* Files where logic lives: `app/(auth)/sign-up.tsx`
* Button / interaction: Continue
* Mutation called: Convex auth `signIn` through provider helper
* Files where logic lives: `app/(auth)/sign-up.tsx`, `lib/auth/googleOAuth.ts`
* Button / interaction: Open legal document
* Mutation called: None
* Files where logic lives: `app/(auth)/sign-up.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/welcome`, `/(auth)/sign-up-email`, `/(auth)/oauth-callback`
* Where users arrive from: `/(auth)/welcome`, redirects from sign-in

### FILES INVOLVED

* `app/(auth)/sign-up.tsx`
* `components/BackButton.tsx`
* `components/ContinueButton.tsx`
* `components/PreviewModeBanner.tsx`
* `lib/auth/googleOAuth.ts`
* `lib/onboarding/useOnboardingTracking.ts`

---

### SCREEN

* Screen name: Sign Up Email
* Route path: `/(auth)/sign-up-email`
* Route group: `(auth)`

### PURPOSE

* Collects an email address and requests an OTP sign-in code.

### UI STRUCTURE

* Block name: Preview banner
* Component file: `app/(auth)/sign-up-email.tsx`
* What it displays: Preview close banner when preview mode is active
* What interaction it supports: Exit preview
* Block name: Header
* Component file: `app/(auth)/sign-up-email.tsx`
* What it displays: Back button
* What interaction it supports: Back to sign-up
* Block name: Title section
* Component file: `app/(auth)/sign-up-email.tsx`
* What it displays: Email auth title
* What interaction it supports: None
* Block name: Email form
* Component file: `app/(auth)/sign-up-email.tsx`
* What it displays: Email label and text input
* What interaction it supports: Enter email
* Block name: Footer actions
* Component file: `app/(auth)/sign-up-email.tsx`
* What it displays: Send code button, error text, back text
* What interaction it supports: Request OTP and navigate to OTP route

### DATA SOURCES

* Convex query used: None
* Table(s) used: None directly from screen
* Derived calculations: email validity regex, `canSubmit`

### METRICS / CALCULATIONS

* Metric name: `canSubmit`
* Exact calculation: `isValidEmail(email)`
* Data source table: none

### USER ACTIONS

* Button / interaction: Send code
* Mutation called: Convex auth `signIn('email', { email })`
* Files where logic lives: `app/(auth)/sign-up-email.tsx`
* Button / interaction: Back
* Mutation called: None
* Files where logic lives: `app/(auth)/sign-up-email.tsx`, `lib/navigation.ts`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/sign-up`, `/(auth)/onboarding-client-otp`
* Where users arrive from: `/(auth)/sign-up`

### FILES INVOLVED

* `app/(auth)/sign-up-email.tsx`
* `components/BackButton.tsx`
* `components/PreviewModeBanner.tsx`
* `lib/navigation.ts`

---

### SCREEN

* Screen name: OAuth Callback
* Route path: `/(auth)/oauth-callback`
* Route group: `(auth)`

### PURPOSE

* Handles post-OAuth callback routing into name capture or authenticated flows.

### UI STRUCTURE

* Block name: Callback loader
* Component file: `app/(auth)/oauth-callback.tsx`
* What it displays: Loading/transition state
* What interaction it supports: None

### DATA SOURCES

* Convex query used: auth/user state checks in route
* Table(s) used: `users`
* Derived calculations: callback redirect decision

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/name-capture`, authenticated shells
* Where users arrive from: `/(auth)/sign-up`

### FILES INVOLVED

* `app/(auth)/oauth-callback.tsx`

---

### SCREEN

* Screen name: Name Capture
* Route path: `/(auth)/name-capture`
* Route group: `(auth)`

### PURPOSE

* Captures the user's first and last name and bootstraps a user record when required.

### UI STRUCTURE

* Block name: Loading state
* Component file: `app/(auth)/name-capture.tsx`
* What it displays: Activity indicator and loading text while auth/user bootstrap is unresolved
* What interaction it supports: None
* Block name: Header
* Component file: `app/(auth)/name-capture.tsx`
* What it displays: Back button and onboarding progress
* What interaction it supports: Back navigation
* Block name: Name form
* Component file: `app/(auth)/name-capture.tsx`
* What it displays: First name and last name inputs
* What interaction it supports: Text input
* Block name: Footer
* Component file: `app/(auth)/name-capture.tsx`
* What it displays: Continue button
* What interaction it supports: Save name and move to next onboarding step

### DATA SOURCES

* Convex query used: `api.users.getCurrentUser`
* Table(s) used: `users`
* Derived calculations:
  - OAuth autofill from `externalId`, `firstName`, `lastName`, `fullName`
  - `canContinue = firstName.trim().length > 0 && lastName.trim().length > 0`

### METRICS / CALCULATIONS

* Metric name: `canContinue`
* Exact calculation: first and last name trimmed non-empty
* Data source table: none

### USER ACTIONS

* Button / interaction: Continue
* Mutation called: `api.users.setMyName`
* Files where logic lives: `app/(auth)/name-capture.tsx`
* Button / interaction: User bootstrap
* Mutation called: `api.auth.createOrUpdateUser`
* Files where logic lives: `app/(auth)/name-capture.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/sign-up`, `/(auth)/onboarding-client-interests`
* Where users arrive from: auth layout redirect logic, OAuth callback flow

### FILES INVOLVED

* `app/(auth)/name-capture.tsx`
* `components/BackButton.tsx`
* `components/ContinueButton.tsx`
* `components/OnboardingProgress.tsx`
* `lib/navigation.ts`

---

### SCREEN

* Screen name: Legal
* Route path: `/(auth)/legal`
* Route group: `(auth)`

### PURPOSE

* Displays legal content route mounted in the auth stack.

### UI STRUCTURE

* Block name: Legal content page
* Component file: `app/(auth)/legal.tsx`
* What it displays: Terms/privacy/legal text content
* What interaction it supports: Scroll and back navigation

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: None

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Back navigation
* Mutation called: None
* Files where logic lives: `app/(auth)/legal.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: Back to auth routes
* Where users arrive from: auth stack

### FILES INVOLVED

* `app/(auth)/legal.tsx`

---

### SCREEN

* Screen name: Paywall
* Route path: `/(auth)/paywall`
* Route group: `(auth)/paywall`

### PURPOSE

* Displays available subscription plans and RevenueCat purchase flow inside the auth tree.

### UI STRUCTURE

* Block name: Plan sales panel
* Component file: `app/(auth)/paywall/index.tsx`
* What it displays: Plan comparison, billing selection, and purchase CTA
* What interaction it supports: Select plan and purchase
* Block name: Purchase/loading feedback
* Component file: `app/(auth)/paywall/index.tsx`
* What it displays: Purchase progress and error states
* What interaction it supports: Retry or close

### DATA SOURCES

* Convex query used: `api.entitlements.getPlanCatalog`
* Table(s) used: `subscriptions`
* Derived calculations:
  - normalized plan catalog
  - comparison rows
  - RevenueCat offering state

### METRICS / CALCULATIONS

* Metric name: Plan comparison rows
* Exact calculation: `buildComparisonRows(normalizePlanCatalog(planCatalog))`
* Data source table: `subscriptions`

### USER ACTIONS

* Button / interaction: Select plan / billing period / purchase
* Mutation called: RevenueCat purchase flow and subscription update flow
* Files where logic lives: `app/(auth)/paywall/index.tsx`, `contexts/RevenueCatContext.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: Auth continuation after purchase
* Where users arrive from: auth layout exceptions and business onboarding

### FILES INVOLVED

* `app/(auth)/paywall/index.tsx`
* `components/subscription/SubscriptionSalesPanel.tsx`
* `components/subscription/UpgradeModal.tsx`
* `contexts/RevenueCatContext.tsx`

---

### SCREEN

* Screen name: Client OTP
* Route path: `/(auth)/onboarding-client-otp`
* Route group: `(auth)`

### PURPOSE

* Verifies the OTP code sent for email authentication and advances onboarding.

### UI STRUCTURE

* Block name: Header
* Component file: `app/(auth)/onboarding-client-otp.tsx`
* What it displays: Back button and onboarding progress
* What interaction it supports: Back navigation
* Block name: OTP title/subtitle
* Component file: `app/(auth)/onboarding-client-otp.tsx`
* What it displays: Verification text and contact details
* What interaction it supports: None
* Block name: OTP digit row
* Component file: `app/(auth)/onboarding-client-otp.tsx`
* What it displays: Six separate digit inputs
* What interaction it supports: Enter code, auto-advance, auto-submit
* Block name: Footer actions
* Component file: `app/(auth)/onboarding-client-otp.tsx`
* What it displays: Continue button, resend button, edit details button, error text
* What interaction it supports: Verify code, resend code, return to email edit

### DATA SOURCES

* Convex query used: None
* Table(s) used indirectly through auth OTP flow: `emailOtps`, `users`
* Derived calculations:
  - `isComplete = digits.every(digit => digit.length === 1)`
  - resend cooldown seconds
  - channel derived from `contact` param

### METRICS / CALCULATIONS

* Metric name: `isComplete`
* Exact calculation: six OTP inputs all length 1
* Data source table: none
* Metric name: Resend cooldown
* Exact calculation: countdown from `RESEND_COOLDOWN_SECONDS`
* Data source table: none

### USER ACTIONS

* Button / interaction: Verify OTP
* Mutation called: Convex auth verification flow
* Files where logic lives: `app/(auth)/onboarding-client-otp.tsx`
* Button / interaction: Resend code
* Mutation called: Convex auth `signIn('email', { email })`
* Files where logic lives: `app/(auth)/onboarding-client-otp.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: next client onboarding route, back to sign-up-email
* Where users arrive from: `/(auth)/sign-up-email`

### FILES INVOLVED

* `app/(auth)/onboarding-client-otp.tsx`
* `components/BackButton.tsx`
* `components/ContinueButton.tsx`
* `components/OnboardingProgress.tsx`

---

### SCREEN

* Screen name: Client Interests
* Route path: `/(auth)/onboarding-client-interests`
* Route group: `(auth)`

### PURPOSE

* Lets the user choose customer interest categories as the first client onboarding step.

### UI STRUCTURE

* Block name: Header with progress
* Component file: `app/(auth)/onboarding-client-interests.tsx`
* What it displays: Back button and onboarding progress
* What interaction it supports: Back navigation
* Block name: Choice list
* Component file: `app/(auth)/onboarding-client-interests.tsx`
* What it displays: Interest options using `OnboardingChoiceButton`
* What interaction it supports: Select interest values
* Block name: Continue footer
* Component file: `app/(auth)/onboarding-client-interests.tsx`
* What it displays: Continue button
* What interaction it supports: Advance to next onboarding route

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: selected interest state and `canContinue`

### METRICS / CALCULATIONS

* Metric name: `canContinue`
* Exact calculation: at least one selected interest
* Data source table: none

### USER ACTIONS

* Button / interaction: Select interest
* Mutation called: None
* Files where logic lives: `app/(auth)/onboarding-client-interests.tsx`
* Button / interaction: Continue
* Mutation called: None
* Files where logic lives: `app/(auth)/onboarding-client-interests.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/onboarding-client-fit`
* Where users arrive from: `/(auth)/name-capture`

### FILES INVOLVED

* `app/(auth)/onboarding-client-interests.tsx`
* `components/OnboardingChoiceButton.tsx`
* `components/ContinueButton.tsx`
* `components/OnboardingProgress.tsx`

---

### SCREEN

* Screen name: Client Fit
* Route path: `/(auth)/onboarding-client-fit`
* Route group: `(auth)`

### PURPOSE

* Captures how well digital loyalty fits the customer.

### UI STRUCTURE

* Block name: Header with progress
* Component file: `app/(auth)/onboarding-client-fit.tsx`
* What it displays: Back button and onboarding progress
* What interaction it supports: Back navigation
* Block name: Choice list
* Component file: `app/(auth)/onboarding-client-fit.tsx`
* What it displays: Fit options
* What interaction it supports: Select one option
* Block name: Continue footer
* Component file: `app/(auth)/onboarding-client-fit.tsx`
* What it displays: Continue button
* What interaction it supports: Advance to next step

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: selection state

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Select fit option
* Mutation called: None
* Files where logic lives: `app/(auth)/onboarding-client-fit.tsx`
* Button / interaction: Continue
* Mutation called: None
* Files where logic lives: `app/(auth)/onboarding-client-fit.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/onboarding-client-usage-area`
* Where users arrive from: `/(auth)/onboarding-client-interests`

### FILES INVOLVED

* `app/(auth)/onboarding-client-fit.tsx`
* `components/OnboardingChoiceButton.tsx`

---

### SCREEN

* Screen name: Client Usage Area
* Route path: `/(auth)/onboarding-client-usage-area`
* Route group: `(auth)`

### PURPOSE

* Captures where the user expects to use the app.

### UI STRUCTURE

* Block name: Header with progress
* Component file: `app/(auth)/onboarding-client-usage-area.tsx`
* What it displays: Back button and progress
* What interaction it supports: Back navigation
* Block name: Choice list
* Component file: `app/(auth)/onboarding-client-usage-area.tsx`
* What it displays: Usage area options
* What interaction it supports: Select one option
* Block name: Continue footer
* Component file: `app/(auth)/onboarding-client-usage-area.tsx`
* What it displays: Continue button
* What interaction it supports: Advance to next step

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: selection state

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Select usage area
* Mutation called: None
* Files where logic lives: `app/(auth)/onboarding-client-usage-area.tsx`
* Button / interaction: Continue
* Mutation called: None
* Files where logic lives: `app/(auth)/onboarding-client-usage-area.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/onboarding-client-frequency`
* Where users arrive from: `/(auth)/onboarding-client-fit`

### FILES INVOLVED

* `app/(auth)/onboarding-client-usage-area.tsx`
* `components/OnboardingChoiceButton.tsx`

---

### SCREEN

* Screen name: Client Frequency
* Route path: `/(auth)/onboarding-client-frequency`
* Route group: `(auth)`

### PURPOSE

* Captures expected visit frequency during client onboarding.

### UI STRUCTURE

* Block name: Header with progress
* Component file: `app/(auth)/onboarding-client-frequency.tsx`
* What it displays: Back button and progress
* What interaction it supports: Back navigation
* Block name: Choice list
* Component file: `app/(auth)/onboarding-client-frequency.tsx`
* What it displays: Frequency options
* What interaction it supports: Select one option
* Block name: Continue footer
* Component file: `app/(auth)/onboarding-client-frequency.tsx`
* What it displays: Continue button
* What interaction it supports: Advance to final client onboarding step

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: selection state

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Select frequency
* Mutation called: None
* Files where logic lives: `app/(auth)/onboarding-client-frequency.tsx`
* Button / interaction: Continue
* Mutation called: None
* Files where logic lives: `app/(auth)/onboarding-client-frequency.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/onboarding-client-return-motivation`
* Where users arrive from: `/(auth)/onboarding-client-usage-area`

### FILES INVOLVED

* `app/(auth)/onboarding-client-frequency.tsx`
* `components/OnboardingChoiceButton.tsx`

---

### SCREEN

* Screen name: Client Return Motivation
* Route path: `/(auth)/onboarding-client-return-motivation`
* Route group: `(auth)`

### PURPOSE

* Captures the reward type that most motivates the user to return and completes customer onboarding.

### UI STRUCTURE

* Block name: Header with progress
* Component file: `app/(auth)/onboarding-client-return-motivation.tsx`
* What it displays: Back button and progress
* What interaction it supports: Back navigation
* Block name: Choice list
* Component file: `app/(auth)/onboarding-client-return-motivation.tsx`
* What it displays: Reward motivation options
* What interaction it supports: Select one option
* Block name: Continue footer
* Component file: `app/(auth)/onboarding-client-return-motivation.tsx`
* What it displays: Continue button
* What interaction it supports: Complete onboarding and route to wallet

### DATA SOURCES

* Convex query used: None
* Table(s) used indirectly by mutation: `users`
* Derived calculations: selected motivation and `canContinue`

### METRICS / CALCULATIONS

* Metric name: `canContinue`
* Exact calculation: selected motivation is not null
* Data source table: none

### USER ACTIONS

* Button / interaction: Continue
* Mutation called: `api.users.completeCustomerOnboarding`
* Files where logic lives: `app/(auth)/onboarding-client-return-motivation.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(customer)/wallet`
* Where users arrive from: `/(auth)/onboarding-client-frequency`

### FILES INVOLVED

* `app/(auth)/onboarding-client-return-motivation.tsx`
* `components/OnboardingChoiceButton.tsx`
* `components/ContinueButton.tsx`
* `components/OnboardingProgress.tsx`

---

### SCREEN

* Screen name: Business Role
* Route path: `/(auth)/onboarding-business-role`
* Route group: `(auth)`

### PURPOSE

* Captures the business owner's name and age range and can pause onboarding back into customer mode.

### UI STRUCTURE

* Block name: Header with progress
* Component file: `app/(auth)/onboarding-business-role.tsx`
* What it displays: Back button and onboarding progress
* What interaction it supports: Back navigation or exit intent
* Block name: Name inputs
* Component file: `app/(auth)/onboarding-business-role.tsx`
* What it displays: First name and last name text fields
* What interaction it supports: Edit onboarding draft
* Block name: Age range options
* Component file: `app/(auth)/onboarding-business-role.tsx`
* What it displays: Age range choices
* What interaction it supports: Select one option
* Block name: Continue footer
* Component file: `app/(auth)/onboarding-business-role.tsx`
* What it displays: Continue button
* What interaction it supports: Save name and continue

### DATA SOURCES

* Convex query used: `api.users.getCurrentUser`
* Table(s) used: `users`, `businessOnboardingDrafts`
* Derived calculations: prefill from user name and `canContinue`

### METRICS / CALCULATIONS

* Metric name: `canContinue`
* Exact calculation: first name and last name trimmed non-empty and age range selected
* Data source table: none

### USER ACTIONS

* Button / interaction: Continue
* Mutation called: `api.users.setMyName`
* Files where logic lives: `app/(auth)/onboarding-business-role.tsx`
* Button / interaction: Pause business onboarding
* Mutation called: `api.users.setActiveMode`, `api.onboarding.saveMyBusinessOnboardingDraft` through `saveStep`
* Files where logic lives: `app/(auth)/onboarding-business-role.tsx`, `lib/onboarding/useBusinessOnboardingDraftPersistence.ts`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/onboarding-business-discovery`, `/(authenticated)/(customer)/settings`
* Where users arrive from: business onboarding entry

### FILES INVOLVED

* `app/(auth)/onboarding-business-role.tsx`
* `contexts/OnboardingContext.tsx`
* `contexts/AppModeContext.tsx`
* `lib/onboarding/useBusinessOnboardingDraftPersistence.ts`

---

### SCREEN

* Screen name: Business Discovery
* Route path: `/(auth)/onboarding-business-discovery`
* Route group: `(auth)`

### PURPOSE

* Captures how the business user found the product.

### UI STRUCTURE

* Block name: Header with progress
* Component file: `app/(auth)/onboarding-business-discovery.tsx`
* What it displays: Back button and progress
* What interaction it supports: Return to previous onboarding route
* Block name: Discovery source choices
* Component file: `app/(auth)/onboarding-business-discovery.tsx`
* What it displays: Referral, search, social, TikTok, app store, in-app, and other options
* What interaction it supports: Select one source
* Block name: Continue footer
* Component file: `app/(auth)/onboarding-business-discovery.tsx`
* What it displays: Continue button
* What interaction it supports: Advance to next business onboarding step

### DATA SOURCES

* Convex query used: None
* Table(s) used: `businessOnboardingDrafts` via draft persistence
* Derived calculations: selected discovery source

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Select discovery source
* Mutation called: draft persistence on continue through `saveStep`
* Files where logic lives: `app/(auth)/onboarding-business-discovery.tsx`, `lib/onboarding/useBusinessOnboardingDraftPersistence.ts`
* Button / interaction: Continue
* Mutation called: `api.onboarding.saveMyBusinessOnboardingDraft` through `saveStep`
* Files where logic lives: `app/(auth)/onboarding-business-discovery.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/onboarding-business-reason`
* Where users arrive from: `/(auth)/onboarding-business-role`

### FILES INVOLVED

* `app/(auth)/onboarding-business-discovery.tsx`
* `contexts/OnboardingContext.tsx`
* `lib/onboarding/useBusinessOnboardingDraftPersistence.ts`
* `lib/onboarding/businessOnboardingFlow.ts`

---

### SCREEN

* Screen name: Business Reason
* Route path: `/(auth)/onboarding-business-reason`
* Route group: `(auth)`

### PURPOSE

* Captures why the business is joining the product.

### UI STRUCTURE

* Block name: Header with progress
* Component file: `app/(auth)/onboarding-business-reason.tsx`
* What it displays: Back button and progress
* What interaction it supports: Back navigation
* Block name: Reason options
* Component file: `app/(auth)/onboarding-business-reason.tsx`
* What it displays: Business motivation choices
* What interaction it supports: Select one option
* Block name: Continue footer
* Component file: `app/(auth)/onboarding-business-reason.tsx`
* What it displays: Continue button
* What interaction it supports: Advance to usage area step

### DATA SOURCES

* Convex query used: None
* Table(s) used: `businessOnboardingDrafts`
* Derived calculations: selected reason

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Select reason
* Mutation called: draft persistence on continue through `saveStep`
* Files where logic lives: `app/(auth)/onboarding-business-reason.tsx`
* Button / interaction: Continue
* Mutation called: `api.onboarding.saveMyBusinessOnboardingDraft`
* Files where logic lives: `lib/onboarding/useBusinessOnboardingDraftPersistence.ts`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/onboarding-business-usage-area`
* Where users arrive from: `/(auth)/onboarding-business-discovery`

### FILES INVOLVED

* `app/(auth)/onboarding-business-reason.tsx`
* `contexts/OnboardingContext.tsx`
* `lib/onboarding/useBusinessOnboardingDraftPersistence.ts`

---

### SCREEN

* Screen name: Business Usage Area
* Route path: `/(auth)/onboarding-business-usage-area`
* Route group: `(auth)`

### PURPOSE

* Captures the business operating area choices.

### UI STRUCTURE

* Block name: Header with progress
* Component file: `app/(auth)/onboarding-business-usage-area.tsx`
* What it displays: Back button and progress
* What interaction it supports: Back navigation
* Block name: Usage area choices
* Component file: `app/(auth)/onboarding-business-usage-area.tsx`
* What it displays: Operating area options
* What interaction it supports: Select values
* Block name: Continue footer
* Component file: `app/(auth)/onboarding-business-usage-area.tsx`
* What it displays: Continue button
* What interaction it supports: Advance to business name step

### DATA SOURCES

* Convex query used: None
* Table(s) used: `businessOnboardingDrafts`
* Derived calculations: selected usage areas

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Select usage area
* Mutation called: draft persistence on continue through `saveStep`
* Files where logic lives: `app/(auth)/onboarding-business-usage-area.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/onboarding-business-name`
* Where users arrive from: `/(auth)/onboarding-business-reason`

### FILES INVOLVED

* `app/(auth)/onboarding-business-usage-area.tsx`
* `contexts/OnboardingContext.tsx`

---

### SCREEN

* Screen name: Business Name
* Route path: `/(auth)/onboarding-business-name`
* Route group: `(auth)`

### PURPOSE

* Captures the business name and business example/category before business creation.

### UI STRUCTURE

* Block name: Header with progress
* Component file: `app/(auth)/onboarding-business-name.tsx`
* What it displays: Back button and progress
* What interaction it supports: Back navigation
* Block name: Business name field
* Component file: `app/(auth)/onboarding-business-name.tsx`
* What it displays: Business name input
* What interaction it supports: Text input
* Block name: Business example choices
* Component file: `app/(auth)/onboarding-business-name.tsx`
* What it displays: Business example/category options
* What interaction it supports: Select one option
* Block name: Continue footer
* Component file: `app/(auth)/onboarding-business-name.tsx`
* What it displays: Continue button
* What interaction it supports: Advance into merchant onboarding create-business route

### DATA SOURCES

* Convex query used: None
* Table(s) used: `businessOnboardingDrafts`
* Derived calculations: trimmed business name and selected business example

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Enter name/select example/continue
* Mutation called: draft persistence on continue through `saveStep`
* Files where logic lives: `app/(auth)/onboarding-business-name.tsx`, `lib/onboarding/useBusinessOnboardingDraftPersistence.ts`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/merchant/onboarding/create-business`
* Where users arrive from: `/(auth)/onboarding-business-usage-area`

### FILES INVOLVED

* `app/(auth)/onboarding-business-name.tsx`
* `contexts/OnboardingContext.tsx`
* `lib/onboarding/businessOnboardingFlow.ts`

---

### SCREEN

* Screen name: Business Plan
* Route path: `/(auth)/onboarding-business-plan`
* Route group: `(auth)`

### PURPOSE

* Shows plan comparison and routes business onboarding into starter sync or paid upgrade flow.

### UI STRUCTURE

* Block name: Header with progress
* Component file: `app/(auth)/onboarding-business-plan.tsx`
* What it displays: Back button and progress
* What interaction it supports: Back navigation
* Block name: Title section
* Component file: `app/(auth)/onboarding-business-plan.tsx`
* What it displays: Plan selection title
* What interaction it supports: None
* Block name: Sales panel
* Component file: `app/(auth)/onboarding-business-plan.tsx`
* What it displays: Subscription comparison rows, selected plan, billing period, CTA, error note
* What interaction it supports: Select plan and billing period; continue
* Block name: Upgrade modal
* Component file: `app/(auth)/onboarding-business-plan.tsx`
* What it displays: Paid upgrade modal for Pro/Premium plans
* What interaction it supports: Complete paid upgrade

### DATA SOURCES

* Convex query used: `api.entitlements.getPlanCatalog`
* Table(s) used: `subscriptions`
* Derived calculations:
  - `normalizePlanCatalog`
  - `buildComparisonRows`
  - additional flow detection from route param

### METRICS / CALCULATIONS

* Metric name: Plan comparison rows
* Exact calculation: `buildComparisonRows(normalizePlanCatalog(planCatalogQuery))`
* Data source table: `subscriptions`

### USER ACTIONS

* Button / interaction: Continue with Starter
* Mutation called: `api.entitlements.syncBusinessSubscription`
* Files where logic lives: `app/(auth)/onboarding-business-plan.tsx`
* Button / interaction: Open upgrade modal
* Mutation called: RevenueCat/business subscription purchase path
* Files where logic lives: `app/(auth)/onboarding-business-plan.tsx`, `components/subscription/UpgradeModal.tsx`

### DEPENDENCIES

* loyaltyPrograms: none
* memberships: none
* scanner: none
* campaigns: none
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/merchant/onboarding/create-program`
* Where users arrive from: onboarding create-business flow and additional business flow

### FILES INVOLVED

* `app/(auth)/onboarding-business-plan.tsx`
* `components/subscription/SubscriptionSalesPanel.tsx`
* `components/subscription/UpgradeModal.tsx`
* `lib/subscription/planComparison.ts`
* `lib/onboarding/businessOnboardingFlow.ts`

---

### SCREEN

* Screen name: Authenticated Layout
* Route path: `/(authenticated)`
* Route group: `(authenticated)`

### PURPOSE

* Resolves the authenticated shell, active mode, active business context, and redirects into the correct customer, business, staff, join, or card route.

### UI STRUCTURE

* Block name: Loading shell
* Component file: `app/(authenticated)/_layout.tsx`
* What it displays: Brand/logo loading screen while auth and session data load
* What interaction it supports: None
* Block name: Route stack
* Component file: `app/(authenticated)/_layout.tsx`
* What it displays: Stack registration for customer, business, staff, join, invite, and card routes
* What interaction it supports: Route mounting and redirects

### DATA SOURCES

* Convex query used:
  - `api.users.getCurrentUser`
  - `api.users.getSessionContext`
* Table(s) used:
  - `users`
  - `businesses`
  - `businessStaff`
  - `staffInvites`
* Derived calculations:
  - app mode resolution
  - active business shell checks
  - onboarding and name-capture checks

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: indirect through business/customer shell routing
* memberships: indirect through customer shell routing
* scanner: indirect through business/staff shell routing
* campaigns: indirect through business shell routing
* analytics: indirect through business shell routing
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: customer wallet, business dashboard, staff scanner, name capture, join, card routes
* Where users arrive from: auth layout redirects

### FILES INVOLVED

* `app/(authenticated)/_layout.tsx`
* `contexts/UserContext.tsx`
* `contexts/AppModeContext.tsx`
* `contexts/ActiveBusinessContext.tsx`
* `hooks/useActiveBusiness.ts`

---

### SCREEN

* Screen name: Join Business
* Route path: `/(authenticated)/join`
* Route group: `(authenticated)`

### PURPOSE

* Resolves a scanned or manually entered business join code and routes the user into the selected business page in join mode.

### UI STRUCTURE

* Block name: Header
* Component file: `app/(authenticated)/join.tsx`
* What it displays: Back button, title, optional feedback message
* What interaction it supports: Back to wallet
* Block name: QR scanner area
* Component file: `app/(authenticated)/join.tsx`
* What it displays: `QrScanner`
* What interaction it supports: Scan join QR
* Block name: Manual join card
* Component file: `app/(authenticated)/join.tsx`
* What it displays: Manual business code input and join/retry buttons
* What interaction it supports: Enter code, join, reset scanner

### DATA SOURCES

* Convex query used: `api.memberships.resolveJoinBusiness` through `useConvex().query`
* Table(s) used:
  - `businesses`
  - `loyaltyPrograms`
  - `memberships`
  - `campaigns`
* Derived calculations:
  - deep-link param extraction `biz`, `src`, `camp`
  - deferred join retrieval from local storage

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Scan QR
* Mutation called: None; query call `api.memberships.resolveJoinBusiness`
* Files where logic lives: `app/(authenticated)/join.tsx`, `components/QrScanner.tsx`
* Button / interaction: Manual join
* Mutation called: None; query call `api.memberships.resolveJoinBusiness`
* Files where logic lives: `app/(authenticated)/join.tsx`
* Button / interaction: Retry scan
* Mutation called: None
* Files where logic lives: `app/(authenticated)/join.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: yes
* campaigns: yes
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(customer)/business/[businessId]`
* Where users arrive from: customer wallet, deferred deep links, auth redirect completions

### FILES INVOLVED

* `app/(authenticated)/join.tsx`
* `components/QrScanner.tsx`
* `contexts/UserContext.tsx`
* `lib/deeplink/pendingJoin.ts`
* `lib/navigation.ts`

---

### SCREEN

* Screen name: Accept Invite
* Route path: `/(authenticated)/accept-invite`
* Route group: `(authenticated)`

### PURPOSE

* Accepts a pending staff invite and switches the user into the invited business context.

### UI STRUCTURE

* Block name: Invite list or active invite card
* Component file: `app/(authenticated)/accept-invite.tsx`
* What it displays: Pending staff invite details and accept action
* What interaction it supports: Accept invite

### DATA SOURCES

* Convex query used: session context from user context
* Table(s) used: `staffInvites`, `businesses`, `businessStaff`, `users`
* Derived calculations: current pending invite selection

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Accept invite
* Mutation called: `api.business.acceptStaffInvite`
* Files where logic lives: `app/(authenticated)/accept-invite.tsx`

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: no
* scanner: no
* campaigns: no
* analytics: no
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: staff or business shell after acceptance
* Where users arrive from: customer wallet pending invite card

### FILES INVOLVED

* `app/(authenticated)/accept-invite.tsx`
* `contexts/UserContext.tsx`

---

### SCREEN

* Screen name: Card Index
* Route path: `/(authenticated)/card`
* Route group: `(authenticated)/card`

### PURPOSE

* Acts as the card route index mounted in the shared card stack.

### UI STRUCTURE

* Block name: Route entry
* Component file: `app/(authenticated)/card/index.tsx`
* What it displays: Route entry content for card stack index
* What interaction it supports: Navigation into card detail route

### DATA SOURCES

* Convex query used: None in route file
* Table(s) used: None in route file
* Derived calculations: None

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None documented directly in route file

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: yes
* scanner: no
* campaigns: no
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: card detail route
* Where users arrive from: authenticated card stack

### FILES INVOLVED

* `app/(authenticated)/card/index.tsx`

---

### SCREEN

* Screen name: Card Details
* Route path: `/(authenticated)/card/[membershipId]`
* Route group: `(authenticated)/card`

### PURPOSE

* Displays the selected membership card, its QR code, redeem state, and activity history.

### UI STRUCTURE

* Block name: Celebration banner
* Component file: `app/(authenticated)/card/[membershipId].tsx`
* What it displays: Full-screen banner after a recent stamp
* What interaction it supports: Passive display only
* Block name: Sticky header
* Component file: `app/(authenticated)/card/[membershipId].tsx`
* What it displays: Header title, business and reward subtitle, back button
* What interaction it supports: Back to wallet
* Block name: Card preview panel
* Component file: `app/(authenticated)/card/[membershipId].tsx`
* What it displays: `ProgramCustomerCardPreview`, redeem status text, redeem button
* What interaction it supports: Refresh QR for redeem flow
* Block name: Personal QR panel
* Component file: `app/(authenticated)/card/[membershipId].tsx`
* What it displays: QR code or QR loading/error placeholder and refresh button
* What interaction it supports: Regenerate customer scan token
* Block name: Activity panel
* Component file: `app/(authenticated)/card/[membershipId].tsx`
* What it displays: Activity list from membership events
* What interaction it supports: Scroll only

### DATA SOURCES

* Convex query used:
  - `api.memberships.byCustomer`
  - `api.memberships.getMembershipActivity`
* Table(s) used:
  - `memberships`
  - `loyaltyPrograms`
  - `businesses`
  - `events`
* Derived calculations:
  - `membership = memberships.find(entry => entry.membershipId === membershipId)`
  - `goal = Math.max(1, Number(membership.maxStamps ?? 0) || 0)`
  - `remainingStamps = Math.max(0, goal - current)`
  - `isRedeemEligible = Boolean(membership.canRedeem || current >= goal)`

### METRICS / CALCULATIONS

* Metric name: Current progress
* Exact calculation: `Number(membership.currentStamps ?? 0)`
* Data source table: `memberships`
* Metric name: Remaining stamps
* Exact calculation: `Math.max(0, goal - current)`
* Data source table: `memberships`, `loyaltyPrograms`
* Metric name: Redeem eligible
* Exact calculation: `Boolean(membership.canRedeem || current >= goal)`
* Data source table: `memberships`

### USER ACTIONS

* Button / interaction: Back
* Mutation called: None
* Files where logic lives: `app/(authenticated)/card/[membershipId].tsx`, `lib/navigation.ts`
* Button / interaction: Refresh QR
* Mutation called: `api.scanner.createCustomerScanToken`
* Files where logic lives: `app/(authenticated)/card/[membershipId].tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: yes
* campaigns: no
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: wallet fallback
* Where users arrive from: customer business detail, customer-card wrapper, show-qr redirect

### FILES INVOLVED

* `app/(authenticated)/card/[membershipId].tsx`
* `components/AnimatedActionBanner.tsx`
* `components/BackButton.tsx`
* `components/BusinessScreenHeader.tsx`
* `components/business/ProgramCustomerCardPreview.tsx`
* `components/FullScreenLoading.tsx`
* `components/StickyScrollHeader.tsx`
* `lib/memberships/celebrationMessage.ts`
* `lib/navigation.ts`

---

### SCREEN

* Screen name: Customer Tabs Layout
* Route path: `/(authenticated)/(customer)`
* Route group: `(authenticated)/(customer)`

### PURPOSE

* Defines the customer bottom-tab navigation shell and hides non-tab customer routes.

### UI STRUCTURE

* Block name: Bottom tab bar
* Component file: `app/(authenticated)/(customer)/_layout.tsx`
* What it displays: Wallet, discovery, QR, rewards, and settings tabs
* What interaction it supports: Tab navigation

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: active tab name from `useSegments`

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Tab presses
* Mutation called: None
* Files where logic lives: `app/(authenticated)/(customer)/_layout.tsx`

### DEPENDENCIES

* loyaltyPrograms: indirect
* memberships: indirect
* scanner: indirect
* campaigns: indirect
* analytics: none
* staff: none

### NAVIGATION

* Where the user can navigate from this screen: customer tab routes and hidden child routes
* Where users arrive from: authenticated layout

### FILES INVOLVED

* `app/(authenticated)/(customer)/_layout.tsx`

---

### SCREEN

* Screen name: Wallet
* Route path: `/(authenticated)/(customer)/wallet`
* Route group: `(authenticated)/(customer)`

### PURPOSE

* Shows the customer's saved business cards, pending staff invites, and entry points into joining businesses.

### UI STRUCTURE

* Block name: Sticky header
* Component file: `app/(authenticated)/(customer)/wallet.tsx`
* What it displays: Page title and subtitle
* What interaction it supports: None
* Block name: Join business button
* Component file: `app/(authenticated)/(customer)/wallet.tsx`
* What it displays: Join business CTA
* What interaction it supports: Navigate to join flow
* Block name: Pending invite card
* Component file: `app/(authenticated)/(customer)/wallet.tsx`
* What it displays: First pending invite summary and accept CTA
* What interaction it supports: Navigate to accept invite
* Block name: Empty/loading card
* Component file: `app/(authenticated)/(customer)/wallet.tsx`
* What it displays: Loading text or empty state with demo card CTA
* What interaction it supports: Seed demo data
* Block name: Business card list
* Component file: `app/(authenticated)/(customer)/wallet.tsx`
* What it displays: `ProgramCustomerCardPreview` cards and joined/redeemable counts
* What interaction it supports: Open selected business details

### DATA SOURCES

* Convex query used: `api.memberships.byCustomerBusinesses`
* Table(s) used: `memberships`, `businesses`, `loyaltyPrograms`, `events`, `staffInvites`
* Derived calculations:
  - `isLoading = isAuthenticated && businessesQuery === undefined`
  - `pendingStaffInvites = sessionContext?.pendingInvites ?? []`

### METRICS / CALCULATIONS

* Metric name: Joined program count
* Exact calculation: `business.joinedProgramCount`
* Data source table: `memberships`
* Metric name: Redeemable count
* Exact calculation: `business.redeemableCount`
* Data source table: `memberships`

### USER ACTIONS

* Button / interaction: Join business
* Mutation called: None
* Files where logic lives: `app/(authenticated)/(customer)/wallet.tsx`
* Button / interaction: Accept invite
* Mutation called: None
* Files where logic lives: `app/(authenticated)/(customer)/wallet.tsx`
* Button / interaction: Create demo
* Mutation called: `api.seed.seedMvp`
* Files where logic lives: `app/(authenticated)/(customer)/wallet.tsx`
* Button / interaction: Open business
* Mutation called: None
* Files where logic lives: `app/(authenticated)/(customer)/wallet.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: no
* analytics: no
* staff: yes through pending invites

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/join`, `/(authenticated)/accept-invite`, `/(authenticated)/(customer)/business/[businessId]`
* Where users arrive from: authenticated customer shell, post-onboarding wallet entry

### FILES INVOLVED

* `app/(authenticated)/(customer)/wallet.tsx`
* `components/BusinessScreenHeader.tsx`
* `components/business/ProgramCustomerCardPreview.tsx`
* `components/StickyScrollHeader.tsx`
* `contexts/UserContext.tsx`
* `lib/deeplink/pendingJoin.ts`

---

### SCREEN

* Screen name: Discovery
* Route path: `/(authenticated)/(customer)/discovery`
* Route group: `(authenticated)/(customer)`

### PURPOSE

* Shows saved businesses, nearby businesses on a map, and filters nearby results by radius, service type, and sort order.

### UI STRUCTURE

* Block name: Sticky header
* Component file: `app/(authenticated)/(customer)/discovery.tsx`
* What it displays: Page title and subtitle
* What interaction it supports: None
* Block name: Saved businesses panel
* Component file: `app/(authenticated)/(customer)/discovery.tsx`
* What it displays: Count of saved businesses and preview cards
* What interaction it supports: Open saved business details
* Block name: Permission / location status card
* Component file: `app/(authenticated)/(customer)/discovery.tsx`
* What it displays: Permission prompt, loading, or location error
* What interaction it supports: Request location, open settings, retry
* Block name: Radius panel
* Component file: `app/(authenticated)/(customer)/discovery.tsx`
* What it displays: Slider and current radius
* What interaction it supports: Change search radius
* Block name: Filters and sort panel
* Component file: `app/(authenticated)/(customer)/discovery.tsx`
* What it displays: Service type chips and sort buttons
* What interaction it supports: Filter and sort nearby businesses
* Block name: Map panel
* Component file: `app/(authenticated)/(customer)/discovery.tsx`
* What it displays: Current location marker and nearby business markers
* What interaction it supports: View map only
* Block name: Nearby business list
* Component file: `app/(authenticated)/(customer)/discovery.tsx`
* What it displays: Nearby business cards, distance badge, saved badge, type chips, tags
* What interaction it supports: Open business details
* Block name: Business mode CTA
* Component file: `app/(authenticated)/(customer)/discovery.tsx`
* What it displays: `BusinessModeCtaCard`
* What interaction it supports: Business mode promotional/action CTA

### DATA SOURCES

* Convex query used:
  - `api.business.getBusinessesNearby`
  - `api.memberships.byCustomerBusinesses`
* Table(s) used: `businesses`, `memberships`, `loyaltyPrograms`
* Derived calculations:
  - deferred radius, filters, and sort with `useDeferredValue`
  - `savedBusinessIds` set
  - `mapDelta = getMapDelta(radiusKm)`

### METRICS / CALCULATIONS

* Metric name: Saved businesses count
* Exact calculation: `savedBusinesses.length`
* Data source table: `memberships`, `businesses`
* Metric name: Nearby businesses count
* Exact calculation: `nearbyBusinesses.length`
* Data source table: `businesses`

### USER ACTIONS

* Button / interaction: Open saved or nearby business
* Mutation called: None
* Files where logic lives: `app/(authenticated)/(customer)/discovery.tsx`
* Button / interaction: Request permission
* Mutation called: None
* Files where logic lives: `hooks/useCurrentLocation.ts`
* Button / interaction: Filter/sort/radius updates
* Mutation called: None
* Files where logic lives: `app/(authenticated)/(customer)/discovery.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes through saved card previews
* memberships: yes
* scanner: no
* campaigns: no
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(customer)/business/[businessId]`
* Where users arrive from: customer tabs

### FILES INVOLVED

* `app/(authenticated)/(customer)/discovery.tsx`
* `components/BusinessScreenHeader.tsx`
* `components/business/ProgramCustomerCardPreview.tsx`
* `components/customer/BusinessModeCtaCard.tsx`
* `components/StickyScrollHeader.tsx`
* `hooks/useCurrentLocation.ts`

---

### SCREEN

* Screen name: Rewards
* Route path: `/(authenticated)/(customer)/rewards`
* Route group: `(authenticated)/(customer)`

### PURPOSE

* Shows redeemable membership rewards and customer campaign inbox messages.

### UI STRUCTURE

* Block name: Sticky header
* Component file: `app/(authenticated)/(customer)/rewards.tsx`
* What it displays: Title and subtitle
* What interaction it supports: None
* Block name: Empty/loading card
* Component file: `app/(authenticated)/(customer)/rewards.tsx`
* What it displays: Loading or empty feed message
* What interaction it supports: None
* Block name: Ready rewards section
* Component file: `app/(authenticated)/(customer)/rewards.tsx`
* What it displays: Redeemable membership cards summarized by business/program/reward
* What interaction it supports: Read-only
* Block name: Inbox message cards
* Component file: `app/(authenticated)/(customer)/rewards.tsx`
* What it displays: Campaign message title, body, business badge, timestamp
* What interaction it supports: Read-only

### DATA SOURCES

* Convex query used:
  - `api.campaigns.listInboxForCustomer`
  - `api.memberships.byCustomer`
* Table(s) used: `campaignRuns`, `campaigns`, `messageLog`, `memberships`, `loyaltyPrograms`, `businesses`
* Derived calculations:
  - `redeemableRewards = memberships.filter(membership => membership.canRedeem)`
  - `isEmpty = !isLoading && redeemableRewards.length === 0 && inbox.length === 0`

### METRICS / CALCULATIONS

* Metric name: Ready rewards count
* Exact calculation: `redeemableRewards.length`
* Data source table: `memberships`

### USER ACTIONS

* No wired button actions on this screen

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: none directly
* Where users arrive from: customer tabs

### FILES INVOLVED

* `app/(authenticated)/(customer)/rewards.tsx`
* `components/BusinessScreenHeader.tsx`
* `components/StickyScrollHeader.tsx`

---

### SCREEN

* Screen name: Show QR
* Route path: `/(authenticated)/(customer)/show-qr`
* Route group: `(authenticated)/(customer)`

### PURPOSE

* Shows the customer's general QR code for stamp or redeem actions and reacts to recent stamp events.

### UI STRUCTURE

* Block name: Celebration banner, header, QR card
* Component file: `app/(authenticated)/(customer)/show-qr.tsx`
* What it displays: Stamp success banner, page header, helper text, QR code or placeholder, refresh button
* What interaction it supports: Refresh customer scan token and back navigation

### DATA SOURCES

* Convex query used: `api.memberships.byCustomer`
* Table(s) used: `memberships`, `events`
* Derived calculations: latest stamped membership search and QR expiry handling

### METRICS / CALCULATIONS

* Metric name: Latest stamp detection
* Exact calculation: reduce memberships by max `lastStampAt`
* Data source table: `memberships`

### USER ACTIONS

* Button / interaction: Refresh QR
* Mutation called: `api.scanner.createCustomerScanToken`
* Files where logic lives: `app/(authenticated)/(customer)/show-qr.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: yes
* campaigns: no
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(customer)/wallet`, `/customer-card/[membershipId]`
* Where users arrive from: customer tabs

### FILES INVOLVED

* `app/(authenticated)/(customer)/show-qr.tsx`
* `components/AnimatedActionBanner.tsx`
* `lib/memberships/celebrationMessage.ts`

---

### SCREEN

* Screen name: Customer Settings
* Route path: `/(authenticated)/(customer)/settings`
* Route group: `(authenticated)/(customer)`

### PURPOSE

* Displays customer settings, support links, business mode CTAs, sign-out, and delete-account flow.

### UI STRUCTURE

* Block name: Header and mode block
* Component file: `screens/SettingsScreen.tsx`
* What it displays: Header, `BusinessModeCtaCard`, optional staff business switch controls
* What interaction it supports: Mode switching and route entry
* Block name: Preferences/support/account sections
* Component file: `screens/SettingsScreen.tsx`
* What it displays: Account details row, notification and marketing toggles, help/legal rows, logout, delete account
* What interaction it supports: Navigate, toggle, sign out, open delete modal
* Block name: Delete account modal
* Component file: `screens/SettingsScreen.tsx`
* What it displays: Warning flow with DELETE confirmation
* What interaction it supports: Confirm destructive mutation

### DATA SOURCES

* Convex query used: session context via `useSessionContext`
* Table(s) used: `users`, `businesses`, `businessStaff`, `pushTokens`
* Derived calculations: notification enabled state and staff business list state

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Toggle marketing
* Mutation called: `api.users.setMyMarketingProfile`
* Files where logic lives: `screens/SettingsScreen.tsx`
* Button / interaction: Set active mode
* Mutation called: `api.users.setActiveMode`
* Files where logic lives: `screens/SettingsScreen.tsx`
* Button / interaction: Delete account
* Mutation called: `api.users.wipeAllDataHard`
* Files where logic lives: `screens/SettingsScreen.tsx`

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: no
* scanner: indirect
* campaigns: no
* analytics: no
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: account-details, help-support, auth routes, scanner/business routes
* Where users arrive from: customer tabs

### FILES INVOLVED

* `app/(authenticated)/(customer)/settings.tsx`
* `screens/SettingsScreen.tsx`
* `contexts/PushNotificationsContext.tsx`
* `contexts/UserContext.tsx`

---

### SCREEN

* Screen name: Customer Account Details
* Route path: `/(authenticated)/(customer)/account-details`
* Route group: `(authenticated)/(customer)`

### PURPOSE

* Shows the current user account fields and lets the user update phone and marketing profile data.

### UI STRUCTURE

* Block name: Header, account info section, marketing section
* Component file: `screens/CustomerAccountDetailsScreen.tsx`
* What it displays: User fields, phone edit UI, marketing opt-in, birthday and anniversary fields
* What interaction it supports: Save phone and marketing profile

### DATA SOURCES

* Convex query used: session context through `useSessionContext`
* Table(s) used: `users`, `businesses`, `businessStaff`, `subscriptions`
* Derived calculations: full name fallback and plan label resolution

### METRICS / CALCULATIONS

* Metric name: Business count
* Exact calculation: `businesses.length`
* Data source table: `businesses`, `businessStaff`

### USER ACTIONS

* Button / interaction: Save phone
* Mutation called: `api.users.setMyPhone`
* Files where logic lives: `screens/CustomerAccountDetailsScreen.tsx`
* Button / interaction: Save marketing profile
* Mutation called: `api.users.setMyMarketingProfile`
* Files where logic lives: `screens/CustomerAccountDetailsScreen.tsx`

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: no
* scanner: no
* campaigns: no
* analytics: no
* staff: indirect

### NAVIGATION

* Where the user can navigate from this screen: back to settings
* Where users arrive from: customer settings

### FILES INVOLVED

* `app/(authenticated)/(customer)/account-details.tsx`
* `screens/CustomerAccountDetailsScreen.tsx`

---

### SCREEN

* Screen name: Customer Help Support
* Route path: `/(authenticated)/(customer)/help-support`
* Route group: `(authenticated)/(customer)`

### PURPOSE

* Shows FAQ content and submits a support request.

### UI STRUCTURE

* Block name: Header, FAQ section, contact section
* Component file: `screens/CustomerHelpSupportScreen.tsx`
* What it displays: Expandable FAQ cards, support textarea, character counter, send button
* What interaction it supports: Expand/collapse FAQ items and submit support request

### DATA SOURCES

* Convex query used: None
* Table(s) used by mutation: `supportRequests`
* Derived calculations: `isSendDisabled = isSending || !hasMessage || isMessageTooLong`

### METRICS / CALCULATIONS

* Metric name: Character counter
* Exact calculation: `message.length`
* Data source table: none

### USER ACTIONS

* Button / interaction: Send support request
* Mutation called: `api.support.sendSupportRequest`
* Files where logic lives: `screens/CustomerHelpSupportScreen.tsx`

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: no
* scanner: no
* campaigns: no
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: back to settings
* Where users arrive from: customer settings

### FILES INVOLVED

* `app/(authenticated)/(customer)/help-support.tsx`
* `screens/CustomerHelpSupportScreen.tsx`

---

### SCREEN

* Screen name: Customer Business Details
* Route path: `/(authenticated)/(customer)/business/[businessId]`
* Route group: `(authenticated)/(customer)`

### PURPOSE

* Shows joined programs and available programs for one business and lets the user join selected programs.

### UI STRUCTURE

* Block name: Banner, sticky header, join hint, available programs section, joined programs section, feedback card
* Component file: `app/(authenticated)/(customer)/business/[businessId].tsx`
* What it displays: Business header, selectable program previews, joined program previews, join CTA, success/error feedback
* What interaction it supports: Select programs, join programs, open joined card

### DATA SOURCES

* Convex query used: `api.memberships.getCustomerBusiness`
* Table(s) used: `businesses`, `loyaltyPrograms`, `memberships`, `campaigns`
* Derived calculations: selected program set, selected count, progress formatting

### METRICS / CALCULATIONS

* Metric name: Selected program count
* Exact calculation: `selectedProgramIds.length`
* Data source table: none
* Metric name: Program progress
* Exact calculation: `${current}/${max}`
* Data source table: `memberships`, `loyaltyPrograms`

### USER ACTIONS

* Button / interaction: Join selected programs
* Mutation called: `api.memberships.joinSelectedPrograms`
* Files where logic lives: `app/(authenticated)/(customer)/business/[businessId].tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes through join attribution params
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: `/customer-card/[membershipId]`, wallet fallback
* Where users arrive from: wallet, discovery, join flow

### FILES INVOLVED

* `app/(authenticated)/(customer)/business/[businessId].tsx`
* `components/business/ProgramCustomerCardPreview.tsx`
* `lib/navigation.ts`

---

### SCREEN

* Screen name: Customer Card Wrapper
* Route path: `/(authenticated)/(customer)/customer-card/[membershipId]`
* Route group: `(authenticated)/(customer)`

### PURPOSE

* Re-exports the shared card detail route inside the customer tab tree.

### UI STRUCTURE

* Block name: Route wrapper
* Component file: `app/(authenticated)/(customer)/customer-card/[membershipId].tsx`
* What it displays: No standalone UI; mounts `../../card/[membershipId]`
* What interaction it supports: Same as shared card detail route

### DATA SOURCES

* Convex query used: Same as `app/(authenticated)/card/[membershipId].tsx`
* Table(s) used: `memberships`, `loyaltyPrograms`, `businesses`, `events`
* Derived calculations: Same as mounted implementation

### METRICS / CALCULATIONS

* Same as mounted implementation

### USER ACTIONS

* Same as mounted implementation

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: yes
* campaigns: no
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: same as shared card detail
* Where users arrive from: customer business detail, show-qr redirect

### FILES INVOLVED

* `app/(authenticated)/(customer)/customer-card/[membershipId].tsx`
* `app/(authenticated)/card/[membershipId].tsx`

---

### SCREEN

* Screen name: Business Layout
* Route path: `/(authenticated)/(business)`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Defines the business tab shell and redirects users into the correct business or staff route based on session context.

### UI STRUCTURE

* Block name: Business tabs
* Component file: `app/(authenticated)/(business)/_layout.tsx`
* What it displays: Dashboard, analytics, scanner, cards, settings tab registration
* What interaction it supports: Tab navigation and route gating

### DATA SOURCES

* Convex query used: `api.users.getSessionContext`
* Table(s) used: `users`, `businesses`, `businessStaff`
* Derived calculations: active shell from `resolveActiveBusinessShell`

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: indirect
* memberships: indirect
* scanner: indirect
* campaigns: indirect
* analytics: indirect
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: business tabs, customer wallet, staff scanner, auth, onboarding
* Where users arrive from: authenticated layout

### FILES INVOLVED

* `app/(authenticated)/(business)/_layout.tsx`
* `lib/onboarding/businessOnboardingFlow.ts`

---

### SCREEN

* Screen name: Business Dashboard
* Route path: `/(authenticated)/(business)/dashboard`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Shows the business dashboard summary, AI recommendation CTA surface, and customer snapshot panels.

### UI STRUCTURE

* Block name: Dashboard summary and recommendation surface
* Component file: `app/(authenticated)/(business)/dashboard.tsx`
* What it displays: KPI cards, AI recommendation blocks, customer snapshot panels, campaign draft entry points
* What interaction it supports: Execute recommendation CTA, create campaign draft, navigate to linked management screens

### DATA SOURCES

* Convex query used: `api.dashboard.getBusinessDashboardSummary`, `api.events.getCustomerManagementSnapshot`, `useEntitlements(activeBusinessId)`
* Table(s) used: `businesses`, `memberships`, `events`, `loyaltyPrograms`, `campaigns`, `campaignRuns`, `aiRecommendations`, `aiBusinessSnapshots`, `subscriptions`
* Derived calculations: dashboard summary metrics and entitlement gating in route code

### METRICS / CALCULATIONS

* Metric name: Dashboard summary metrics
* Exact calculation: returned by `api.dashboard.getBusinessDashboardSummary`
* Data source table: `businesses`, `memberships`, `events`, `campaigns`, `loyaltyPrograms`

### USER ACTIONS

* Button / interaction: Execute recommendation CTA
* Mutation called: `api.aiRecommendations.executeRecommendationPrimaryCta`
* Files where logic lives: `app/(authenticated)/(business)/dashboard.tsx`
* Button / interaction: Create campaign draft
* Mutation called: `api.campaigns.createCampaignDraft`
* Files where logic lives: `app/(authenticated)/(business)/dashboard.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: yes
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: cards, campaigns, customers, settings, analytics
* Where users arrive from: business tabs, merchant alias index

### FILES INVOLVED

* `app/(authenticated)/(business)/dashboard.tsx`
* `hooks/useEntitlements.ts`
* `convex/dashboard.ts`
* `convex/events.ts`

---

### SCREEN

* Screen name: Business Analytics
* Route path: `/(authenticated)/(business)/analytics`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Shows business activity analytics using standard or merchant activity queries depending on entitlement state.

### UI STRUCTURE

* Block name: Analytics cards and trend views
* Component file: `app/(authenticated)/(business)/analytics.tsx`
* What it displays: Activity metrics, trend views, filters, and summary cards
* What interaction it supports: Period/filter interactions defined in route

### DATA SOURCES

* Convex query used: `api.analytics.getBusinessActivity`, `api.analytics.getMerchantActivity`, `useEntitlements(activeBusinessId)`
* Table(s) used: `events`, `memberships`, `campaigns`, `loyaltyPrograms`, `businesses`
* Derived calculations: analytics slices and entitlement-based query selection

### METRICS / CALCULATIONS

* Metric name: Activity metrics
* Exact calculation: returned from analytics queries
* Data source table: `events`, `memberships`, `campaigns`

### USER ACTIONS

* Button / interaction: Change analytics period/filter
* Mutation called: None
* Files where logic lives: `app/(authenticated)/(business)/analytics.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: yes
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: none direct beyond tabs
* Where users arrive from: business tabs, merchant analytics alias

### FILES INVOLVED

* `app/(authenticated)/(business)/analytics.tsx`
* `hooks/useEntitlements.ts`
* `convex/analytics.ts`

---

### SCREEN

* Screen name: Business Scanner
* Route path: `/(authenticated)/(business)/scanner`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Scans customer QR codes, resolves the scan context, and commits stamp, redeem, or undo actions.

### UI STRUCTURE

* Block name: Scanner header, program selector, QR scanner, resolved scan action panel
* Component file: `app/(authenticated)/(business)/scanner.tsx`
* What it displays: Scanner title, program controls, camera scanner, customer/program context, commit and undo controls
* What interaction it supports: Select program, scan customer QR, commit stamp, commit redeem, undo last action

### DATA SOURCES

* Convex query used: `api.loyaltyPrograms.listScannerPrograms`, `api.scanner.resolveScan`
* Table(s) used: `loyaltyPrograms`, `memberships`, `events`, `scanSessions`, `scanTokenEvents`, `businesses`
* Derived calculations: selected program and resolved action state

### METRICS / CALCULATIONS

* Metric name: Resolved action preview
* Exact calculation: returned from `api.scanner.resolveScan`
* Data source table: `memberships`, `loyaltyPrograms`, `events`

### USER ACTIONS

* Button / interaction: Commit stamp
* Mutation called: `api.scanner.commitStamp`
* Files where logic lives: `app/(authenticated)/(business)/scanner.tsx`
* Button / interaction: Commit redeem
* Mutation called: `api.scanner.commitRedeem`
* Files where logic lives: `app/(authenticated)/(business)/scanner.tsx`
* Button / interaction: Undo last action
* Mutation called: `api.scanner.undoLastScannerAction`
* Files where logic lives: `app/(authenticated)/(business)/scanner.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: yes
* campaigns: no
* analytics: indirect
* staff: yes through shared wrapper

### NAVIGATION

* Where the user can navigate from this screen: none direct beyond tabs
* Where users arrive from: business tabs, staff scanner wrapper

### FILES INVOLVED

* `app/(authenticated)/(business)/scanner.tsx`
* `components/QrScanner.tsx`
* `convex/scanner.ts`

---

### SCREEN

* Screen name: Business Customers
* Route path: `/(authenticated)/(business)/customers`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Lists business customers and customer management snapshot data.

### UI STRUCTURE

* Block name: Customer summary header and customer list
* Component file: `app/(authenticated)/(business)/customers.tsx`
* What it displays: Header, customer snapshot metrics, customer rows/cards with reward eligibility and activity data
* What interaction it supports: Open customer detail route

### DATA SOURCES

* Convex query used: `api.customerCards.listBusinessCustomersBase`, `api.events.getCustomerManagementSnapshot`, `api.memberships.getBusinessRewardEligibilitySummary`, `useEntitlements(activeBusinessId)`
* Table(s) used: `users`, `memberships`, `events`, `loyaltyPrograms`, `businesses`
* Derived calculations: entitlement-gated list size and summary panels

### METRICS / CALCULATIONS

* Metric name: Customer management snapshot metrics
* Exact calculation: returned by `api.events.getCustomerManagementSnapshot`
* Data source table: `events`, `memberships`

### USER ACTIONS

* Button / interaction: Open customer detail
* Mutation called: None
* Files where logic lives: `app/(authenticated)/(business)/customers.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: yes
* staff: shared patterns with staff customers

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(business)/customer/[customerUserId]`
* Where users arrive from: dashboard, business tabs, merchant customers alias

### FILES INVOLVED

* `app/(authenticated)/(business)/customers.tsx`
* `hooks/useEntitlements.ts`
* `convex/customerCards.ts`
* `convex/events.ts`

---

### SCREEN

* Screen name: Business Customer Detail Wrapper
* Route path: `/(authenticated)/(business)/customer/[customerUserId]`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Mounts the shared business customer detail screen inside the business route tree.

### UI STRUCTURE

* Block name: Wrapper route
* Component file: `app/(authenticated)/(business)/customer/[customerUserId].tsx`
* What it displays: No standalone UI; re-exports `@/components/business/BusinessCustomerCardScreen`
* What interaction it supports: Same as mounted implementation

### DATA SOURCES

* Convex query used: Same as `BusinessCustomerCardScreen`
* Table(s) used: `users`, `memberships`, `events`, `loyaltyPrograms`, `campaigns`
* Derived calculations: Same as mounted implementation

### METRICS / CALCULATIONS

* Same as mounted implementation

### USER ACTIONS

* Same as mounted implementation

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: yes
* staff: shared with staff route

### NAVIGATION

* Where the user can navigate from this screen: back to customers list
* Where users arrive from: business customers list

### FILES INVOLVED

* `app/(authenticated)/(business)/customer/[customerUserId].tsx`
* `components/business/BusinessCustomerCardScreen.tsx`

---

### SCREEN

* Screen name: Business QR
* Route path: `/(authenticated)/(business)/qr`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Shows the business join QR for customers and related join sharing surface.

### UI STRUCTURE

* Block name: Business QR card
* Component file: `app/(authenticated)/(business)/qr.tsx`
* What it displays: Join QR code, business code, instructions
* What interaction it supports: Present QR to customers and QR/code related actions defined in route

### DATA SOURCES

* Convex query used: business QR route query set defined in route
* Table(s) used: `businesses`, `loyaltyPrograms`
* Derived calculations: join code/QR payload generation state

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: QR/code related actions defined in route
* Mutation called: none documented directly
* Files where logic lives: `app/(authenticated)/(business)/qr.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: no
* scanner: no
* campaigns: no
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: back to settings/business tabs
* Where users arrive from: business settings, merchant QR alias redirect

### FILES INVOLVED

* `app/(authenticated)/(business)/qr.tsx`

---

### SCREEN

* Screen name: Business Settings
* Route path: `/(authenticated)/(business)/settings`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Shows business settings navigation, active business selector, and leave-business flow.

### UI STRUCTURE

* Block name: Header, mode/business cards, menu card, leave business card, business picker modal
* Component file: `screens/BusinessSettingsScreen.tsx`
* What it displays: Settings navigation rows for profile, QR, team, account, subscription, plus business picker and completion state
* What interaction it supports: Switch business, navigate to settings subroutes, self-remove from business

### DATA SOURCES

* Convex query used: `api.business.getBusinessSettings`
* Table(s) used: `businesses`, `businessStaff`, `businessOnboardingDrafts`, `subscriptions`
* Derived calculations: capability resolution and onboarding entry route

### METRICS / CALCULATIONS

* Metric name: Profile completion state
* Exact calculation: `businessSettings.profileCompletion`
* Data source table: `businesses`, `businessOnboardingDrafts`

### USER ACTIONS

* Button / interaction: Set active mode
* Mutation called: `api.users.setActiveMode`
* Files where logic lives: `screens/BusinessSettingsScreen.tsx`
* Button / interaction: Leave business
* Mutation called: `api.business.selfRemoveFromBusiness`
* Files where logic lives: `screens/BusinessSettingsScreen.tsx`

### DEPENDENCIES

* loyaltyPrograms: indirect
* memberships: no
* scanner: indirect
* campaigns: indirect
* analytics: indirect
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: profile, address, account, subscription, team, QR, onboarding create-business
* Where users arrive from: business tabs

### FILES INVOLVED

* `app/(authenticated)/(business)/settings.tsx`
* `screens/BusinessSettingsScreen.tsx`
* `hooks/useActiveBusiness.ts`

---

### SCREEN

* Screen name: Business Settings Account
* Route path: `/(authenticated)/(business)/settings-business-account`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Shows the signed-in user account details inside the business settings area and supports sign-out.

### UI STRUCTURE

* Block name: Header, account card, sign-out button
* Component file: `app/(authenticated)/(business)/settings-business-account.tsx`
* What it displays: User full name, email, phone, and logout CTA
* What interaction it supports: Sign out and back navigation

### DATA SOURCES

* Convex query used: session context via `useSessionContext`
* Table(s) used: `users`
* Derived calculations: full name fallback

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Sign out
* Mutation called: auth `signOut`
* Files where logic lives: `app/(authenticated)/(business)/settings-business-account.tsx`

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: no
* scanner: no
* campaigns: no
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: `/(auth)/sign-in`, back to business settings
* Where users arrive from: business settings, merchant profile-settings redirect

### FILES INVOLVED

* `app/(authenticated)/(business)/settings-business-account.tsx`
* `contexts/UserContext.tsx`

---

### SCREEN

* Screen name: Business Settings Address
* Route path: `/(authenticated)/(business)/settings-business-address`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Edits the business address using Google Places autocomplete and saves the selected address details.

### UI STRUCTURE

* Block name: Header, address input card, suggestions card, selected address card, save button
* Component file: `app/(authenticated)/(business)/settings-business-address.tsx`
* What it displays: Address query input, suggestions list, selected address summary, save CTA
* What interaction it supports: Search, select suggestion, save address

### DATA SOURCES

* Convex query used: `api.business.getBusinessSettings`
* Table(s) used: `businesses`
* Derived calculations: search query suppression when selected address matches input

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Save address
* Mutation called: `api.business.updateBusinessAddress`
* Files where logic lives: `app/(authenticated)/(business)/settings-business-address.tsx`

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: no
* scanner: no
* campaigns: no
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: back to business profile/settings
* Where users arrive from: business profile screen, business settings

### FILES INVOLVED

* `app/(authenticated)/(business)/settings-business-address.tsx`
* `hooks/useGooglePlaceAutocomplete.ts`
* `lib/googlePlaces.ts`

---

### SCREEN

* Screen name: Business Settings Profile
* Route path: `/(authenticated)/(business)/settings-business-profile`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Displays editable business profile fields and onboarding snapshot fields and saves changes back to business settings and onboarding snapshot data.

### UI STRUCTURE

* Block name: Header, completion status card, profile rows card, edit modal
* Component file: `app/(authenticated)/(business)/settings-business-profile.tsx`
* What it displays: Missing-field warning or complete-state banner, editable rows for business and onboarding snapshot fields, field editor modal
* What interaction it supports: Open editor, save business field, save onboarding snapshot field, open address route

### DATA SOURCES

* Convex query used: `api.business.getBusinessSettings`
* Table(s) used: `businesses`, `businessOnboardingDrafts`
* Derived calculations: sanitized service types/tags and missing field labels

### METRICS / CALCULATIONS

* Metric name: Profile completion status
* Exact calculation: `businessSettings.profileCompletion`
* Data source table: `businesses`, `businessOnboardingDrafts`

### USER ACTIONS

* Button / interaction: Save base business field
* Mutation called: `api.business.updateBusinessProfile`
* Files where logic lives: `app/(authenticated)/(business)/settings-business-profile.tsx`
* Button / interaction: Save onboarding snapshot field
* Mutation called: `api.business.saveBusinessOnboardingSnapshot`
* Files where logic lives: `app/(authenticated)/(business)/settings-business-profile.tsx`

### DEPENDENCIES

* loyaltyPrograms: indirect
* memberships: no
* scanner: no
* campaigns: yes through relevance flags
* analytics: no
* staff: role capability gating

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(business)/settings-business-address`, back to settings
* Where users arrive from: business settings, merchant store-settings redirect

### FILES INVOLVED

* `app/(authenticated)/(business)/settings-business-profile.tsx`
* `lib/domain/businessPermissions.ts`

---

### SCREEN

* Screen name: Business Settings Subscription
* Route path: `/(authenticated)/(business)/settings-business-subscription`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Shows business subscription usage summary, comparison panel, warnings, and upgrade modal.

### UI STRUCTURE

* Block name: Header, usage chips strip, warning strip, subscription sales panel, upgrade modal
* Component file: `app/(authenticated)/(business)/settings-business-subscription.tsx`
* What it displays: Billing and usage chips, warnings, plan comparison, upgrade flow
* What interaction it supports: Select plan and billing period, open upgrade modal

### DATA SOURCES

* Convex query used: `api.entitlements.getBusinessUsageSummary`, `useEntitlements(activeBusinessId)`
* Table(s) used: `subscriptions`, `loyaltyPrograms`, `memberships`, `campaigns`, `aiUsageLedger`, `businesses`
* Derived calculations: `limitStatus(...)`, `usageWarnings`, normalized plan catalog and comparison rows

### METRICS / CALCULATIONS

* Metric name: Cards/customers/campaigns/retention/AI usage
* Exact calculation: formatted from usage summary and entitlement limits
* Data source table: `subscriptions`, `loyaltyPrograms`, `memberships`, `campaigns`, `aiUsageLedger`

### USER ACTIONS

* Button / interaction: Open upgrade
* Mutation called: purchase/update flow through `UpgradeModal`
* Files where logic lives: `app/(authenticated)/(business)/settings-business-subscription.tsx`, `components/subscription/UpgradeModal.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: yes
* staff: permission-gated access

### NAVIGATION

* Where the user can navigate from this screen: redirect to settings when billing state cannot be viewed
* Where users arrive from: business settings

### FILES INVOLVED

* `app/(authenticated)/(business)/settings-business-subscription.tsx`
* `hooks/useEntitlements.ts`
* `components/subscription/SubscriptionSalesPanel.tsx`
* `components/subscription/UpgradeModal.tsx`

---

### SCREEN

* Screen name: Business Cards Layout
* Route path: `/(authenticated)/(business)/cards`
* Route group: `(authenticated)/(business)/cards`

### PURPOSE

* Mounts the nested card-management stack for loyalty programs and campaigns.

### UI STRUCTURE

* Block name: Nested stack
* Component file: `app/(authenticated)/(business)/cards/_layout.tsx`
* What it displays: No standalone UI; child route stack
* What interaction it supports: Route mounting

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: None

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: indirect
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: cards index, program details, campaigns
* Where users arrive from: business settings/dashboard

### FILES INVOLVED

* `app/(authenticated)/(business)/cards/_layout.tsx`

---

### SCREEN

* Screen name: Business Cards Index
* Route path: `/(authenticated)/(business)/cards`
* Route group: `(authenticated)/(business)/cards`

### PURPOSE

* Lists loyalty programs for management and provides new program creation.

### UI STRUCTURE

* Block name: Program list and summary
* Component file: `app/(authenticated)/(business)/cards/index.tsx`
* What it displays: Program cards, reward eligibility summary, create-program CTA
* What interaction it supports: Open program detail and create program

### DATA SOURCES

* Convex query used: `api.loyaltyPrograms.listManagementByBusiness`, `api.memberships.getBusinessRewardEligibilitySummary`, `useEntitlements(activeBusinessId)`
* Table(s) used: `loyaltyPrograms`, `memberships`, `businesses`
* Derived calculations: entitlement-gated creation availability

### METRICS / CALCULATIONS

* Metric name: Reward eligibility summary
* Exact calculation: query result from `api.memberships.getBusinessRewardEligibilitySummary`
* Data source table: `memberships`, `loyaltyPrograms`

### USER ACTIONS

* Button / interaction: Create loyalty program
* Mutation called: `api.loyaltyPrograms.createLoyaltyProgram`
* Files where logic lives: `app/(authenticated)/(business)/cards/index.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: indirect
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(business)/cards/[programId]`, `/(authenticated)/(business)/cards/campaigns`
* Where users arrive from: business tabs/dashboard

### FILES INVOLVED

* `app/(authenticated)/(business)/cards/index.tsx`
* `hooks/useEntitlements.ts`

---

### SCREEN

* Screen name: Program Management
* Route path: `/(authenticated)/(business)/cards/[programId]`
* Route group: `(authenticated)/(business)/cards`

### PURPOSE

* Edits one loyalty program, including publish, archive, delete, and image upload actions.

### UI STRUCTURE

* Block name: Program details form
* Component file: `app/(authenticated)/(business)/cards/[programId].tsx`
* What it displays: Program fields and status controls
* What interaction it supports: Edit fields, upload image, publish/archive/delete

### DATA SOURCES

* Convex query used: `api.loyaltyPrograms.getProgramDetailsForManagement`
* Table(s) used: `loyaltyPrograms`, `memberships`
* Derived calculations: form state and status presentation

### METRICS / CALCULATIONS

* Metric name: Program status
* Exact calculation: value from program details query
* Data source table: `loyaltyPrograms`

### USER ACTIONS

* Button / interaction: Save/publish/archive/delete/upload image
* Mutation called: `api.loyaltyPrograms.updateProgramForManagement`, `api.loyaltyPrograms.publishProgram`, `api.loyaltyPrograms.archiveProgram`, `api.loyaltyPrograms.deleteProgram`, `api.loyaltyPrograms.generateProgramImageUploadUrl`
* Files where logic lives: `app/(authenticated)/(business)/cards/[programId].tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: indirect
* campaigns: yes
* analytics: indirect
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: back to cards index
* Where users arrive from: cards index, merchant onboarding flows

### FILES INVOLVED

* `app/(authenticated)/(business)/cards/[programId].tsx`

---

### SCREEN

* Screen name: Campaigns Management List
* Route path: `/(authenticated)/(business)/cards/campaigns`
* Route group: `(authenticated)/(business)/cards`

### PURPOSE

* Lists management campaigns for the active business.

### UI STRUCTURE

* Block name: Campaign list
* Component file: `app/(authenticated)/(business)/cards/campaigns.tsx`
* What it displays: Campaign rows/cards and supporting loyalty program context
* What interaction it supports: Open campaign detail and restore archived campaign

### DATA SOURCES

* Convex query used: `api.campaigns.listManagementCampaignsByBusiness`, `api.loyaltyPrograms.listManagementByBusiness`, `useEntitlements(activeBusinessId)`
* Table(s) used: `campaigns`, `campaignRuns`, `loyaltyPrograms`
* Derived calculations: entitlement-based visibility and program mapping

### METRICS / CALCULATIONS

* Metric name: Campaign counts/statuses
* Exact calculation: values returned by campaign management query
* Data source table: `campaigns`, `campaignRuns`

### USER ACTIONS

* Button / interaction: Restore campaign
* Mutation called: `api.campaigns.restoreManagementCampaign`
* Files where logic lives: `app/(authenticated)/(business)/cards/campaigns.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: indirect
* scanner: no
* campaigns: yes
* analytics: indirect
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(business)/cards/campaign/[campaignId]`
* Where users arrive from: cards index, dashboard

### FILES INVOLVED

* `app/(authenticated)/(business)/cards/campaigns.tsx`
* `hooks/useEntitlements.ts`

---

### SCREEN

* Screen name: Campaign Detail
* Route path: `/(authenticated)/(business)/cards/campaign/[campaignId]`
* Route group: `(authenticated)/(business)/cards`

### PURPOSE

* Edits one campaign draft, estimates audience, sends immediately, schedules one-time sends, toggles automation, and archives the campaign.

### UI STRUCTURE

* Block name: Campaign draft form
* Component file: `app/(authenticated)/(business)/cards/campaign/[campaignId].tsx`
* What it displays: Program selector, campaign draft fields, audience estimate, schedule controls, send controls
* What interaction it supports: Update draft and send/archive actions

### DATA SOURCES

* Convex query used: `api.loyaltyPrograms.listManagementByBusiness`, `api.campaigns.getManagementCampaignDraft`, `useEntitlements(selectedBusinessId)`
* Table(s) used: `campaigns`, `campaignRuns`, `loyaltyPrograms`, `memberships`, `users`
* Derived calculations: audience estimate and selected program mapping

### METRICS / CALCULATIONS

* Metric name: Audience estimate
* Exact calculation: result from `api.campaigns.estimateCampaignAudience`
* Data source table: `memberships`, `users`, `campaigns`

### USER ACTIONS

* Button / interaction: Create/update/send/schedule/archive campaign
* Mutation called: `api.campaigns.createCampaignDraft`, `api.campaigns.updateCampaignDraft`, `api.campaigns.estimateCampaignAudience`, `api.campaigns.sendCampaignNow`, `api.campaigns.setCampaignAutomationEnabled`, `api.campaigns.scheduleCampaignOneTime`, `api.campaigns.clearCampaignOneTimeSchedule`, `api.campaigns.archiveManagementCampaign`
* Files where logic lives: `app/(authenticated)/(business)/cards/campaign/[campaignId].tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: yes
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: back to campaign list
* Where users arrive from: campaign list, dashboard draft creation

### FILES INVOLVED

* `app/(authenticated)/(business)/cards/campaign/[campaignId].tsx`
* `hooks/useEntitlements.ts`

---

### SCREEN

* Screen name: Business Team List
* Route path: `/(authenticated)/(business)/team`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Lists staff members, pending invites, closed invites, team summary, and staff history for the active business.

### UI STRUCTURE

* Block name: Team summary, active staff list, invites sections, history sections
* Component file: `app/(authenticated)/(business)/team/index.tsx`
* What it displays: Team summary data, active staff, pending invites, closed invites, staff history
* What interaction it supports: Cancel invite and staff management actions

### DATA SOURCES

* Convex query used: `api.business.listBusinessStaff`, `api.business.listPendingStaffInvites`, `api.business.listClosedStaffInvites`, `api.business.getBusinessTeamSummary`, `api.business.listBusinessStaffHistory`, `useEntitlements(activeBusinessId)`
* Table(s) used: `businessStaff`, `staffInvites`, `staffEvents`, `users`, `businesses`, `subscriptions`
* Derived calculations: entitlement gating and role capability checks

### METRICS / CALCULATIONS

* Metric name: Team summary
* Exact calculation: query result from `api.business.getBusinessTeamSummary`
* Data source table: `businessStaff`, `staffInvites`, `staffEvents`

### USER ACTIONS

* Button / interaction: Team management actions
* Mutation called: cancel/update/suspend/reactivate/remove staff mutations defined in route
* Files where logic lives: `app/(authenticated)/(business)/team/index.tsx`

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: no
* scanner: no
* campaigns: no
* analytics: indirect
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(business)/team/add`
* Where users arrive from: business settings

### FILES INVOLVED

* `app/(authenticated)/(business)/team/index.tsx`
* `hooks/useEntitlements.ts`

---

### SCREEN

* Screen name: Add Team Member
* Route path: `/(authenticated)/(business)/team/add`
* Route group: `(authenticated)/(business)`

### PURPOSE

* Invites a new staff member using a scanned token or invite entry flow.

### UI STRUCTURE

* Block name: Invite form/scanner
* Component file: `app/(authenticated)/(business)/team/add.tsx`
* What it displays: Staff invite flow controls
* What interaction it supports: Invite staff

### DATA SOURCES

* Convex query used: entitlement state through `useEntitlements(activeBusinessId)`
* Table(s) used by mutation: `staffInvites`, `businessStaff`, `users`
* Derived calculations: entitlement gating

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Invite staff by scan token
* Mutation called: `api.business.inviteBusinessStaffByScanToken`
* Files where logic lives: `app/(authenticated)/(business)/team/add.tsx`

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: no
* scanner: yes
* campaigns: no
* analytics: no
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: back to team list
* Where users arrive from: business team list

### FILES INVOLVED

* `app/(authenticated)/(business)/team/add.tsx`
* `hooks/useEntitlements.ts`

---

### SCREEN

* Screen name: Staff Layout
* Route path: `/(authenticated)/(staff)`
* Route group: `(authenticated)/(staff)`

### PURPOSE

* Defines staff tab routes and redirects non-staff sessions to the correct shell.

### UI STRUCTURE

* Block name: Staff tabs
* Component file: `app/(authenticated)/(staff)/_layout.tsx`
* What it displays: Promotions, scanner, customers, settings tabs
* What interaction it supports: Tab navigation and route gating

### DATA SOURCES

* Convex query used: `api.users.getSessionContext`
* Table(s) used: `users`, `businessStaff`, `businesses`
* Derived calculations: staff shell checks

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: indirect
* memberships: indirect
* scanner: indirect
* campaigns: indirect
* analytics: no
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: staff tabs, business dashboard, customer wallet
* Where users arrive from: authenticated layout

### FILES INVOLVED

* `app/(authenticated)/(staff)/_layout.tsx`

---

### SCREEN

* Screen name: Staff Scanner Wrapper
* Route path: `/(authenticated)/(staff)/scanner`
* Route group: `(authenticated)/(staff)`

### PURPOSE

* Re-exports the business scanner implementation inside the staff tab tree.

### UI STRUCTURE

* Block name: Wrapper route
* Component file: `app/(authenticated)/(staff)/scanner.tsx`
* What it displays: No standalone UI; mounts `../(business)/scanner`
* What interaction it supports: Same scanner interactions as business scanner

### DATA SOURCES

* Convex query used: Same as business scanner
* Table(s) used: `loyaltyPrograms`, `memberships`, `events`, `scanSessions`, `scanTokenEvents`
* Derived calculations: Same as mounted implementation

### METRICS / CALCULATIONS

* Same as business scanner

### USER ACTIONS

* Same as business scanner

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: yes
* campaigns: no
* analytics: indirect
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: same as business scanner
* Where users arrive from: staff tabs

### FILES INVOLVED

* `app/(authenticated)/(staff)/scanner.tsx`
* `app/(authenticated)/(business)/scanner.tsx`

---

### SCREEN

* Screen name: Staff Customers
* Route path: `/(authenticated)/(staff)/customers`
* Route group: `(authenticated)/(staff)`

### PURPOSE

* Lists business customers for staff users.

### UI STRUCTURE

* Block name: Customer list
* Component file: `app/(authenticated)/(staff)/customers.tsx`
* What it displays: Customer rows/cards for the active business
* What interaction it supports: Open customer detail

### DATA SOURCES

* Convex query used: `api.customerCards.listBusinessCustomersBase`
* Table(s) used: `users`, `memberships`, `events`, `loyaltyPrograms`
* Derived calculations: list formatting in route

### METRICS / CALCULATIONS

* Metric name: Customer count
* Exact calculation: rendered customer list length
* Data source table: `memberships`, `users`

### USER ACTIONS

* Button / interaction: Open customer detail
* Mutation called: None
* Files where logic lives: `app/(authenticated)/(staff)/customers.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: no
* analytics: no
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(staff)/customer/[customerUserId]`
* Where users arrive from: staff tabs

### FILES INVOLVED

* `app/(authenticated)/(staff)/customers.tsx`
* `convex/customerCards.ts`

---

### SCREEN

* Screen name: Staff Customer Detail Wrapper
* Route path: `/(authenticated)/(staff)/customer/[customerUserId]`
* Route group: `(authenticated)/(staff)`

### PURPOSE

* Mounts the shared business customer detail implementation inside the staff route tree.

### UI STRUCTURE

* Block name: Wrapper route
* Component file: `app/(authenticated)/(staff)/customer/[customerUserId].tsx`
* What it displays: No standalone UI; re-exports `BusinessCustomerCardScreen`
* What interaction it supports: Same as mounted implementation

### DATA SOURCES

* Convex query used: Same as `BusinessCustomerCardScreen`
* Table(s) used: `users`, `memberships`, `events`, `loyaltyPrograms`, `campaigns`
* Derived calculations: Same as mounted implementation

### METRICS / CALCULATIONS

* Same as mounted implementation

### USER ACTIONS

* Same as mounted implementation

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: yes
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: staff customers list
* Where users arrive from: staff customers

### FILES INVOLVED

* `app/(authenticated)/(staff)/customer/[customerUserId].tsx`
* `components/business/BusinessCustomerCardScreen.tsx`

---

### SCREEN

* Screen name: Staff Promotions
* Route path: `/(authenticated)/(staff)/promotions`
* Route group: `(authenticated)/(staff)`

### PURPOSE

* Shows management campaigns for staff users.

### UI STRUCTURE

* Block name: Campaign list
* Component file: `app/(authenticated)/(staff)/promotions.tsx`
* What it displays: Campaign management list with supporting program context
* What interaction it supports: Campaign row interactions defined in route

### DATA SOURCES

* Convex query used: `api.campaigns.listManagementCampaignsByBusiness`, `api.loyaltyPrograms.listManagementByBusiness`
* Table(s) used: `campaigns`, `campaignRuns`, `loyaltyPrograms`
* Derived calculations: program-to-campaign mapping

### METRICS / CALCULATIONS

* Metric name: Campaign counts/statuses
* Exact calculation: query result values
* Data source table: `campaigns`, `campaignRuns`

### USER ACTIONS

* Button / interaction: Campaign row interactions defined in route
* Mutation called: none direct in collected usage
* Files where logic lives: `app/(authenticated)/(staff)/promotions.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: no
* scanner: no
* campaigns: yes
* analytics: indirect
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: campaign detail routes when linked
* Where users arrive from: staff tabs

### FILES INVOLVED

* `app/(authenticated)/(staff)/promotions.tsx`

---

### SCREEN

* Screen name: Staff Settings
* Route path: `/(authenticated)/(staff)/settings`
* Route group: `(authenticated)/(staff)`

### PURPOSE

* Shows staff business profile, permissions, business switching, customer-mode exit, and leave-business flow.

### UI STRUCTURE

* Block name: Header, active business profile card, permissions card, switch-business card, leave-business card
* Component file: `screens/StaffSettingsScreen.tsx`
* What it displays: Active business details, permission list, memberships list, leave-business controls
* What interaction it supports: Return to customer mode, switch business, self-remove from business

### DATA SOURCES

* Convex query used: `api.business.getMyStaffProfileForBusiness`, `api.business.getMyBusinessMemberships`
* Table(s) used: `businessStaff`, `businesses`, `users`
* Derived calculations: permission labels and business membership count

### METRICS / CALCULATIONS

* Metric name: Business membership count
* Exact calculation: `memberships.length`
* Data source table: `businessStaff`, `businesses`

### USER ACTIONS

* Button / interaction: Set active mode
* Mutation called: `api.users.setActiveMode`
* Files where logic lives: `screens/StaffSettingsScreen.tsx`
* Button / interaction: Leave business
* Mutation called: `api.business.selfRemoveFromBusiness`
* Files where logic lives: `screens/StaffSettingsScreen.tsx`

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: no
* scanner: indirect
* campaigns: no
* analytics: no
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: customer wallet/private area
* Where users arrive from: staff tabs

### FILES INVOLVED

* `app/(authenticated)/(staff)/settings.tsx`
* `screens/StaffSettingsScreen.tsx`

---

### SCREEN

* Screen name: Merchant Layout
* Route path: `/(authenticated)/merchant`
* Route group: `(authenticated)/merchant`

### PURPOSE

* Guards merchant alias routes and merchant onboarding routes for business roles.

### UI STRUCTURE

* Block name: Route-control shell
* Component file: `app/(authenticated)/merchant/_layout.tsx`
* What it displays: No standalone content beyond route gating
* What interaction it supports: Redirect behavior

### DATA SOURCES

* Convex query used: role/session data through `useRoleGuard`
* Table(s) used: `users`, `businessStaff`, `businesses`
* Derived calculations: role authorization and preview exceptions

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: indirect
* memberships: indirect
* scanner: indirect
* campaigns: indirect
* analytics: indirect
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: customer wallet, name-capture, merchant onboarding, merchant aliases
* Where users arrive from: authenticated layout

### FILES INVOLVED

* `app/(authenticated)/merchant/_layout.tsx`
* `lib/hooks/useRoleGuard.ts`

---

### SCREEN

* Screen name: Merchant Dashboard Alias
* Route path: `/(authenticated)/merchant`
* Route group: `(authenticated)/merchant`

### PURPOSE

* Re-exports the business dashboard implementation under the merchant path.

### UI STRUCTURE

* Block name: Alias route
* Component file: `app/(authenticated)/merchant/index.tsx`
* What it displays: No standalone UI; mounts `../(business)/dashboard`
* What interaction it supports: Same as business dashboard

### DATA SOURCES

* Convex query used: Same as business dashboard
* Table(s) used: Same as business dashboard
* Derived calculations: Same as business dashboard

### METRICS / CALCULATIONS

* Same as business dashboard

### USER ACTIONS

* Same as business dashboard

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: yes
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: same as business dashboard
* Where users arrive from: merchant shell

### FILES INVOLVED

* `app/(authenticated)/merchant/index.tsx`
* `app/(authenticated)/(business)/dashboard.tsx`

---

### SCREEN

* Screen name: Merchant Analytics Alias
* Route path: `/(authenticated)/merchant/analytics`
* Route group: `(authenticated)/merchant`

### PURPOSE

* Re-exports the business analytics implementation under the merchant path.

### UI STRUCTURE

* Block name: Alias route
* Component file: `app/(authenticated)/merchant/analytics.tsx`
* What it displays: No standalone UI; mounts `../(business)/analytics`
* What interaction it supports: Same as business analytics

### DATA SOURCES

* Convex query used: Same as business analytics
* Table(s) used: Same as business analytics
* Derived calculations: Same as business analytics

### METRICS / CALCULATIONS

* Same as business analytics

### USER ACTIONS

* Same as business analytics

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: yes
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: same as business analytics
* Where users arrive from: merchant shell

### FILES INVOLVED

* `app/(authenticated)/merchant/analytics.tsx`
* `app/(authenticated)/(business)/analytics.tsx`

---

### SCREEN

* Screen name: Merchant Customers Alias
* Route path: `/(authenticated)/merchant/customers`
* Route group: `(authenticated)/merchant`

### PURPOSE

* Re-exports the business customers implementation under the merchant path.

### UI STRUCTURE

* Block name: Alias route
* Component file: `app/(authenticated)/merchant/customers.tsx`
* What it displays: No standalone UI; mounts `../(business)/customers`
* What interaction it supports: Same as business customers

### DATA SOURCES

* Convex query used: Same as business customers
* Table(s) used: Same as business customers
* Derived calculations: Same as business customers

### METRICS / CALCULATIONS

* Same as business customers

### USER ACTIONS

* Same as business customers

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: yes
* scanner: no
* campaigns: yes
* analytics: yes
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: same as business customers
* Where users arrive from: merchant shell

### FILES INVOLVED

* `app/(authenticated)/merchant/customers.tsx`
* `app/(authenticated)/(business)/customers.tsx`

---

### SCREEN

* Screen name: Merchant QR Redirect
* Route path: `/(authenticated)/merchant/qr`
* Route group: `(authenticated)/merchant`

### PURPOSE

* Redirects the merchant QR path to the business QR route.

### UI STRUCTURE

* Block name: Redirect
* Component file: `app/(authenticated)/merchant/qr.tsx`
* What it displays: No standalone UI
* What interaction it supports: Immediate redirect

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: None

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: yes via target route
* memberships: no
* scanner: no
* campaigns: no
* analytics: no
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(business)/qr`
* Where users arrive from: merchant shell

### FILES INVOLVED

* `app/(authenticated)/merchant/qr.tsx`

---

### SCREEN

* Screen name: Merchant Profile Settings Redirect
* Route path: `/(authenticated)/merchant/profile-settings`
* Route group: `(authenticated)/merchant`

### PURPOSE

* Redirects merchant profile settings to business account settings.

### UI STRUCTURE

* Block name: Redirect
* Component file: `app/(authenticated)/merchant/profile-settings.tsx`
* What it displays: No standalone UI
* What interaction it supports: Immediate redirect

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: None

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: no
* scanner: no
* campaigns: no
* analytics: no
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(business)/settings-business-account`
* Where users arrive from: merchant shell

### FILES INVOLVED

* `app/(authenticated)/merchant/profile-settings.tsx`

---

### SCREEN

* Screen name: Merchant Store Settings Redirect
* Route path: `/(authenticated)/merchant/store-settings`
* Route group: `(authenticated)/merchant`

### PURPOSE

* Redirects merchant store settings to business profile settings.

### UI STRUCTURE

* Block name: Redirect
* Component file: `app/(authenticated)/merchant/store-settings.tsx`
* What it displays: No standalone UI
* What interaction it supports: Immediate redirect

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: None

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: no
* scanner: no
* campaigns: yes indirectly through profile flags
* analytics: no
* staff: yes

### NAVIGATION

* Where the user can navigate from this screen: `/(authenticated)/(business)/settings-business-profile`
* Where users arrive from: merchant shell

### FILES INVOLVED

* `app/(authenticated)/merchant/store-settings.tsx`

---

### SCREEN

* Screen name: Merchant Support Inbox
* Route path: `/(authenticated)/merchant/support-inbox`
* Route group: `(authenticated)/merchant`

### PURPOSE

* Shows the admin/support inbox screen for support requests.

### UI STRUCTURE

* Block name: Support request list
* Component file: `screens/AdminSupportInboxScreen.tsx`
* What it displays: Support request list and status controls
* What interaction it supports: Update support request status

### DATA SOURCES

* Convex query used: `api.support.listSupportRequests`
* Table(s) used: `supportRequests`, `users`
* Derived calculations: request grouping/filtering in screen implementation

### METRICS / CALCULATIONS

* Metric name: Support request counts/statuses
* Exact calculation: rendered from support request query result
* Data source table: `supportRequests`

### USER ACTIONS

* Button / interaction: Set support request status
* Mutation called: `api.support.setSupportRequestStatus`
* Files where logic lives: `screens/AdminSupportInboxScreen.tsx`

### DEPENDENCIES

* loyaltyPrograms: no
* memberships: no
* scanner: no
* campaigns: no
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: back within merchant/admin flow
* Where users arrive from: merchant shell

### FILES INVOLVED

* `app/(authenticated)/merchant/support-inbox.tsx`
* `screens/AdminSupportInboxScreen.tsx`

---

### SCREEN

* Screen name: Merchant Onboarding Layout
* Route path: `/(authenticated)/merchant/onboarding`
* Route group: `(authenticated)/merchant/onboarding`

### PURPOSE

* Mounts the merchant onboarding stack for create-business, create-program, and preview-card routes.

### UI STRUCTURE

* Block name: Nested onboarding stack
* Component file: `app/(authenticated)/merchant/onboarding/_layout.tsx`
* What it displays: No standalone UI; stack registration
* What interaction it supports: Route mounting

### DATA SOURCES

* Convex query used: None
* Table(s) used: None
* Derived calculations: None

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: no
* scanner: no
* campaigns: yes indirectly
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: create-business, create-program, preview-card
* Where users arrive from: merchant shell, auth business onboarding

### FILES INVOLVED

* `app/(authenticated)/merchant/onboarding/_layout.tsx`

---

### SCREEN

* Screen name: Merchant Onboarding Index
* Route path: `/(authenticated)/merchant/onboarding`
* Route group: `(authenticated)/merchant/onboarding`

### PURPOSE

* Resolves the merchant onboarding entry route based on current user and draft state.

### UI STRUCTURE

* Block name: Loader/redirect surface
* Component file: `app/(authenticated)/merchant/onboarding/index.tsx`
* What it displays: Loading state until onboarding draft data resolves
* What interaction it supports: None; redirects into correct onboarding step

### DATA SOURCES

* Convex query used: `api.users.getCurrentUser`, `api.onboarding.getMyBusinessOnboardingDraft`
* Table(s) used: `users`, `businessOnboardingDrafts`
* Derived calculations: onboarding entry route from draft state

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* None

### DEPENDENCIES

* loyaltyPrograms: indirect
* memberships: no
* scanner: no
* campaigns: indirect
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: create-business, create-program, preview-card, auth onboarding steps
* Where users arrive from: merchant shell, authenticated layout

### FILES INVOLVED

* `app/(authenticated)/merchant/onboarding/index.tsx`
* `convex/onboarding.ts`
* `lib/onboarding/businessOnboardingFlow.ts`

---

### SCREEN

* Screen name: Merchant Create Business
* Route path: `/(authenticated)/merchant/onboarding/create-business`
* Route group: `(authenticated)/merchant/onboarding`

### PURPOSE

* Creates the business record and saves the business address during merchant onboarding.

### UI STRUCTURE

* Block name: Business creation form
* Component file: `app/(authenticated)/merchant/onboarding/create-business.tsx`
* What it displays: Business details, address capture, and continue CTA
* What interaction it supports: Create business and save address

### DATA SOURCES

* Convex query used: onboarding draft/context data
* Table(s) used by mutations: `businesses`, `businessOnboardingDrafts`
* Derived calculations: onboarding draft values and validation

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Create business
* Mutation called: `api.business.createBusiness`
* Files where logic lives: `app/(authenticated)/merchant/onboarding/create-business.tsx`
* Button / interaction: Save address
* Mutation called: `api.business.updateBusinessAddress`
* Files where logic lives: `app/(authenticated)/merchant/onboarding/create-business.tsx`

### DEPENDENCIES

* loyaltyPrograms: indirect next step
* memberships: no
* scanner: no
* campaigns: indirect through onboarding snapshot
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: create-program, business-plan route in additional flow
* Where users arrive from: auth business name/plan flow, merchant onboarding index

### FILES INVOLVED

* `app/(authenticated)/merchant/onboarding/create-business.tsx`
* `contexts/OnboardingContext.tsx`

---

### SCREEN

* Screen name: Merchant Create Program
* Route path: `/(authenticated)/merchant/onboarding/create-program`
* Route group: `(authenticated)/merchant/onboarding`

### PURPOSE

* Creates the first loyalty program during merchant onboarding and uploads the program image if selected.

### UI STRUCTURE

* Block name: Program creation form
* Component file: `app/(authenticated)/merchant/onboarding/create-program.tsx`
* What it displays: Program fields, reward fields, image selection, continue CTA
* What interaction it supports: Create program and upload image

### DATA SOURCES

* Convex query used: onboarding context/draft data
* Table(s) used by mutations: `loyaltyPrograms`, `businesses`
* Derived calculations: onboarding form validation and image selection state

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Create loyalty program
* Mutation called: `api.loyaltyPrograms.createLoyaltyProgram`
* Files where logic lives: `app/(authenticated)/merchant/onboarding/create-program.tsx`
* Button / interaction: Upload program image
* Mutation called: `api.loyaltyPrograms.generateProgramImageUploadUrl`
* Files where logic lives: `app/(authenticated)/merchant/onboarding/create-program.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: no
* scanner: no
* campaigns: indirect
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: preview-card
* Where users arrive from: create-business, business plan

### FILES INVOLVED

* `app/(authenticated)/merchant/onboarding/create-program.tsx`
* `contexts/OnboardingContext.tsx`

---

### SCREEN

* Screen name: Merchant Preview Card
* Route path: `/(authenticated)/merchant/onboarding/preview-card`
* Route group: `(authenticated)/merchant/onboarding`

### PURPOSE

* Shows the created loyalty card preview, finalizes onboarding, publishes the program, saves onboarding snapshot data, and switches mode.

### UI STRUCTURE

* Block name: Card preview and completion CTA area
* Component file: `app/(authenticated)/merchant/onboarding/preview-card.tsx`
* What it displays: Loyalty card preview, final completion button, loading/error state
* What interaction it supports: Publish and finish onboarding

### DATA SOURCES

* Convex query used: onboarding context and created program/business state
* Table(s) used by mutations: `users`, `businesses`, `loyaltyPrograms`, `businessOnboardingDrafts`
* Derived calculations: preview data binding from onboarding context

### METRICS / CALCULATIONS

* None

### USER ACTIONS

* Button / interaction: Complete onboarding
* Mutation called: `api.users.completeBusinessOnboarding`, `api.loyaltyPrograms.updateProgramForManagement`, `api.loyaltyPrograms.publishProgram`, `api.business.saveBusinessOnboardingSnapshot`, `api.users.setActiveMode`
* Files where logic lives: `app/(authenticated)/merchant/onboarding/preview-card.tsx`

### DEPENDENCIES

* loyaltyPrograms: yes
* memberships: no
* scanner: no
* campaigns: yes through onboarding snapshot relevance fields
* analytics: no
* staff: no

### NAVIGATION

* Where the user can navigate from this screen: business dashboard/settings after completion
* Where users arrive from: create-program

### FILES INVOLVED

* `app/(authenticated)/merchant/onboarding/preview-card.tsx`
* `contexts/OnboardingContext.tsx`

## 4. Data Model Used By Each Screen

### Auth and onboarding screens

- `/(auth)/_layout`, `/(auth)/oauth-callback`, `/(auth)/name-capture`
  - Tables: `users`
- `/(auth)/onboarding-client-otp`
  - Tables: `emailOtps`, `users`
- Business onboarding routes
  - Tables: `businessOnboardingDrafts`, `users`
- `/(auth)/onboarding-business-plan`, `/(auth)/paywall`
  - Tables: `subscriptions`

### Customer screens

- `/(authenticated)/(customer)/wallet`
  - Tables: `memberships`, `loyaltyPrograms`, `businesses`, `events`, `staffInvites`
- `/(authenticated)/(customer)/discovery`
  - Tables: `businesses`, `memberships`, `loyaltyPrograms`
- `/(authenticated)/(customer)/rewards`
  - Tables: `memberships`, `campaigns`, `campaignRuns`, `messageLog`, `businesses`
- `/(authenticated)/(customer)/show-qr`
  - Tables: `memberships`, `events`, `scanTokenEvents`
- `/(authenticated)/(customer)/business/[businessId]`
  - Tables: `businesses`, `loyaltyPrograms`, `memberships`, `campaigns`
- `/(authenticated)/card/[membershipId]` and customer-card wrapper
  - Tables: `memberships`, `loyaltyPrograms`, `businesses`, `events`, `scanTokenEvents`
- `/(authenticated)/(customer)/settings`
  - Tables: `users`, `businesses`, `businessStaff`, `pushTokens`
- `/(authenticated)/(customer)/account-details`
  - Tables: `users`, `businesses`, `businessStaff`, `subscriptions`
- `/(authenticated)/(customer)/help-support`
  - Tables: `supportRequests`

### Shared authenticated screens

- `/(authenticated)/join`
  - Tables: `businesses`, `loyaltyPrograms`, `memberships`, `campaigns`
- `/(authenticated)/accept-invite`
  - Tables: `staffInvites`, `businessStaff`, `businesses`, `users`

### Business, staff, and merchant screens

- Business dashboard and analytics
  - Tables: `businesses`, `memberships`, `events`, `loyaltyPrograms`, `campaigns`, `campaignRuns`, `aiRecommendations`, `aiBusinessSnapshots`, `subscriptions`
- Business scanner and staff scanner wrapper
  - Tables: `loyaltyPrograms`, `memberships`, `events`, `scanSessions`, `scanTokenEvents`, `businesses`
- Business and staff customers
  - Tables: `users`, `memberships`, `events`, `loyaltyPrograms`, `businesses`
- Business settings
  - Tables: `businesses`, `businessStaff`, `businessOnboardingDrafts`, `subscriptions`
- Business profile/address/account/subscription subroutes
  - Tables: `businesses`, `users`, `businessOnboardingDrafts`, `subscriptions`, `aiUsageLedger`
- Cards and campaign management routes
  - Tables: `loyaltyPrograms`, `memberships`, `campaigns`, `campaignRuns`, `users`
- Team routes
  - Tables: `businessStaff`, `staffInvites`, `staffEvents`, `users`, `businesses`
- Merchant onboarding routes
  - Tables: `users`, `businesses`, `loyaltyPrograms`, `businessOnboardingDrafts`
- Merchant support inbox
  - Tables: `supportRequests`, `users`

## 5. Cross-Module Dependencies

### loyaltyPrograms

- Connected to customer wallet, discovery, business detail, card detail, business cards routes, scanner, campaigns, and merchant onboarding create-program/preview-card.
- Main functions: `api.loyaltyPrograms.*`
- Main tables: `loyaltyPrograms`

### memberships

- Connected to wallet, discovery saved businesses, rewards, show-qr, business detail, shared card detail, join flow, dashboard, customers, and reward eligibility summaries.
- Main functions: `api.memberships.*`
- Main tables: `memberships`

### scanner

- Connected to customer show-qr, shared card detail, business scanner, staff scanner wrapper, and join QR scanning.
- Main functions: `api.scanner.*`
- Main tables: `scanSessions`, `scanTokenEvents`, `events`

### campaigns

- Connected to rewards inbox, join/business detail attribution, dashboard recommendation and draft creation, campaign management routes, staff promotions, and analytics.
- Main functions: `api.campaigns.*`
- Main tables: `campaigns`, `campaignRuns`, `messageLog`

### analytics

- Connected to dashboard summary, analytics route, customer management snapshot, and campaign audience estimate.
- Main functions: `api.analytics.*`, `api.dashboard.getBusinessDashboardSummary`, `api.events.getCustomerManagementSnapshot`
- Main tables: `events`, `memberships`, `campaignRuns`

### staff

- Connected to accept-invite, wallet pending invite surface, staff shell, team routes, and settings capability checks.
- Main functions: `api.business.*`, `api.users.getSessionContext`
- Main tables: `businessStaff`, `staffInvites`, `staffEvents`

### auth and user/session context

- Connected to auth layout, authenticated layout, settings, account routes, merchant onboarding entry, and route-control redirects.
- Main functions: `api.users.getCurrentUser`, `api.users.getSessionContext`
- Main tables: `users`, `userIdentities`, `emailOtps`

### subscriptions and entitlements

- Connected to auth paywall, business onboarding plan, business subscription settings, dashboard/cards/customers/team feature gating.
- Main functions: `api.entitlements.*`, RevenueCat context handlers
- Main tables: `subscriptions`, `aiUsageLedger`
