# Data Model (Convex)

Last synced: 2026-06-05

This is a concise map of the active Convex schema. `convex/schema.ts` remains the implementation source of truth.

## Identity and auth
### `users`
Application user profile and app-level state.

Important fields:
- profile: `email`, `emailVerified`, `firstName`, `lastName`, `fullName`, `avatarUrl`
- onboarding and mode: `customerOnboardedAt`, `businessOnboardedAt`, `activeMode`, `activeBusinessId`
- role: `role` (`customer` | `merchant` | `staff` | `admin`), `isAdmin`
- subscription mirror: `subscriptionPlan`, `subscriptionStatus`, `subscriptionProductId`, `subscriptionUpdatedAt`
- lifecycle: `isActive`, `createdAt`, `updatedAt`

Some older onboarding and role fields remain in schema for compatibility and migration safety.

### `userIdentities`
Maps provider identities to one `users` row.

Providers:
- `google`
- `apple`
- `email`

### Convex auth tables
The schema includes `authTables` from Convex Auth plus the project-specific `authVerifiers` table.

## Business and staff
### `businesses`
Business profile, public QR/join identity, location, onboarding snapshot, AI/retention profile, and subscription state.

Key areas:
- owner and identifiers: `ownerUserId`, `externalId`, `businessPublicId`, `joinCode`
- profile: `name`, `shortDescription`, `logoUrl`, `colors`, address/location fields
- onboarding and intelligence: `onboardingSnapshot`, `aiProfile`, `businessRetentionProfile`
- billing: `subscriptionPlan`, `subscriptionStatus`, `billingPeriod`, subscription dates
- lifecycle: `isActive`, `createdAt`, `updatedAt`

### `businessOnboardingDrafts`
Persists business onboarding draft state, current/farthest step, draft payloads, and completion state.

### `businessStaff`
Business-specific authorization source.

Roles:
- `owner`
- `manager`
- `staff`

Status and audit fields track activation, suspension, removal, role changes, and last-seen metadata.

### `staffInvites` and `staffEvents`
Invite lifecycle, invite acceptance, role changes, suspension/reactivation/removal, and staff audit events.

## Loyalty and customer activity
### `loyaltyPrograms`
Business loyalty card/program definitions, lifecycle state, card design fields, reward settings, and archival metadata.

### `memberships`
Customer membership in a business/program, stamp count, join attribution, and active state.

### `events`
Primary audit/event log for stamps, redemptions, customer activity, reversals, scanner sessions, and related business/customer actions.

### `scanSessions` and `scanTokenEvents`
Scanner runtime state, signed token metadata, replay protection, commit status, and scan audit linkage.

## Referrals
### `referralConfigs`
Business referral configuration, reward type/value, recipient policy, monthly limits, and versioning.

### `customerReferralLinks`
Customer-shareable referral links with status, expiry, open count, and attribution fields.

### `customerReferrals`
Referral qualification/completion state, reward grant status, source membership/program, and reward snapshots.

## Campaigns, messaging, and intelligence
### `campaigns`
Campaign configuration, lifecycle, audience source, schedule, prepared audience, source context, and activation status.

### `campaignRuns`
Execution records for sent campaigns, delivery counts, summaries, and post-send metrics.

### `messageLog`
Message delivery/audit records across campaign and notification flows.

### AI tables
- `aiBusinessSnapshots`
- `aiRecommendations`
- `aiGenerationCache`
- `aiUsageLedger`

These support business insights, recommendations, cached AI output, and usage tracking.

## Billing and entitlements
### `subscriptions`
Business subscription records with plan, period, provider, status, provider subscription id, and dates.

Subscription state is also mirrored onto `businesses` and selected `users` fields for app flows.

## Push notifications and support
### `pushTokens` and `pushDeliveryLog`
Expo push token registration, opt-out state, delivery logging, and campaign/message delivery linkage.

### `supportRequests`
User support submissions and handling state.

## Integration scaffolding
### `apiClients` and `apiKeys`
Enterprise/API integration scaffolding with client, hashed key, scope, and usage metadata.

## Practical notes
- `businessStaff` is the business authorization source for server mutations.
- `users.role` is useful for routing and mode hints, but it is not enough for business writes.
- Scanner writes are server-authoritative and tied to scan sessions, scan token events, and audit events.
- Campaign audiences are derived from canonical rules/intelligence, not legacy manually saved segments.
- RevenueCat is the billing integration, but Convex stores the app's subscription/entitlement state.
