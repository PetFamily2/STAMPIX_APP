# Scanner Contract (UI <-> Convex)

Last synced: 2026-02-18

## Purpose
Define the runtime contract for scanner operations.

## Mutations
### 1) Resolve scan
Function: `api.scanner.resolveScan`

Input:
- `qrData: string`
- `businessId: Id<'businesses'>`
- `programId: Id<'loyaltyPrograms'>`

Server checks:
- actor is staff for business
- business and program are active/linked
- QR payload parse + signature validation
- token expiration check
- replay prevention (`scanTokenEvents` by signature)

Output:
- `customerUserId`
- `customerDisplayName`
- `membership` (nullable)
  - `membershipId`
  - `currentStamps`
  - `maxStamps`
  - `canRedeemNow`

### 2) Add stamp
Function: `api.scanner.addStamp`

Input:
- `businessId`
- `programId`
- `customerUserId`

Server checks:
- actor is staff for business
- anti-self-stamp
- customer exists and active
- membership lookup/create
- stamp rate limit

Output:
- `membershipId`
- `currentStamps`
- `maxStamps`
- `canRedeemNow`

### 3) Redeem reward
Function: `api.scanner.redeemReward`

Input:
- `businessId`
- `programId`
- `customerUserId`

Server checks:
- actor is staff for business
- customer exists and active
- membership exists and active
- enough stamps to redeem

Output:
- `membershipId`
- `currentStamps`
- `maxStamps`
- `canRedeemNow` (false after redeem)
- `redeemedAt`

## Common error codes
- `NOT_AUTHENTICATED`
- `NOT_AUTHORIZED`
- `BUSINESS_INACTIVE`
- `PROGRAM_NOT_FOUND`
- `INVALID_QR`
- `EXPIRED_TOKEN`
- `TOKEN_ALREADY_USED`
- `CUSTOMER_NOT_FOUND`
- `MEMBERSHIP_NOT_FOUND`
- `NOT_ENOUGH_STAMPS`
- `SELF_STAMP`
- `RATE_LIMITED`

## Notes
- UI should map errors to user-friendly localized messages.
- Server remains source of truth for scanner permissions and state mutation.
