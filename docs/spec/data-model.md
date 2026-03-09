# Data Model (Convex) - Current

Last synced: 2026-02-18

## Core identity/auth tables
### `users`
Purpose: application user profile and app-level state.

Key fields:
- `externalId?`
- `email?`, `emailVerified?`
- `firstName?`, `lastName?`, `fullName?`, `avatarUrl?`
- `needsNameCapture?`, `postAuthOnboardingRequired?`
- `role?` (`customer` | `merchant` | `staff` | `admin`)
- subscription fields:
  - `subscriptionPlan?` (`starter` | `pro` | `premium`)
  - `subscriptionStatus?` (`active` | `inactive` | `cancelled`)
  - `subscriptionProductId?`
  - `subscriptionUpdatedAt?`
- `isActive`
- `createdAt`, `updatedAt`

### `userIdentities`
Purpose: map auth provider identities to one `users` row.

Fields:
- `userId`
- `provider` (`google` | `apple` | `email`)
- `providerUserId`
- `email?`
- `createdAt`, `updatedAt`

### Convex auth system tables
Provided by `authTables` plus project extension:
- `authAccounts`, `authSessions`, `authRefreshTokens`, etc.
- custom `authVerifiers` table.

## Business and loyalty core
### `businesses`
- `ownerUserId`
- `externalId`
- `businessPublicId?`
- `joinCode?`
- `name`, `logoUrl?`, `colors?`
- subscription fields:
  - `subscriptionPlan?` (`starter` | `pro` | `premium`)
  - `billingPeriod?` (`monthly` | `yearly` | `null`)
  - `subscriptionStatus?` (`active` | `trialing` | `past_due` | `canceled` | `inactive`)
  - active retention usage is derived from `campaigns` (`type=retention_action`, `status=active`, `isActive=true`)
- `isActive`, `createdAt`, `updatedAt`

### `businessStaff`
- `businessId`
- `userId`
- `staffRole` (`owner` | `manager` | `staff`)
- `isActive`, `createdAt`, `updatedAt?`

### `loyaltyPrograms`
- `businessId`
- `title`, `rewardName`, `maxStamps`, `stampIcon`
- `isActive`, `createdAt`, `updatedAt`

### `memberships`
- `userId`, `businessId`, `programId`
- `currentStamps`, `lastStampAt?`
- `joinSource?`, `joinCampaign?`
- `isActive`, `createdAt`, `updatedAt`

### `events`
Purpose: audit log for stamp/redeem and related actions.

Fields:
- `type`
- `businessId`, `programId`
- `membershipId?`
- `actorUserId`, `customerUserId`
- `metadata?`
- `createdAt`

### `scanTokenEvents`
Purpose: replay protection and scanner tracking.

Fields:
- `businessId`, `programId`, `customerId`
- `signature`
- `tokenTimestamp`
- `createdAt`

### `emailOtps`
Purpose: email OTP issuance/consumption tracking.

Fields:
- `email`, `code`
- `status` (`pending` | `sent` | `failed` | `consumed` | `invalidated`)
- `attempts`, `maxAttempts`, `expiresAt`
- `createdAt`, `sentAt?`, `consumedAt?`, `failureReason?`

## Future-support tables (already in schema)
- `campaigns`
- `messageLog`
- `segments`
- `pushTokens`
- `pushDeliveryLog`
- `apiClients`
- `apiKeys`

## Practical model notes
- App mode and role-based routing read from `users.role` + local appMode.
- Scanner authorization uses `businessStaff` membership, not just `users.role`.
- Subscription state is persisted on both `users` and `businesses`, with business entitlements enforced server-side.
