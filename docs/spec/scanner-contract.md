# Scanner Contract (UI <-> Convex)

Last synced: 2026-08-17

## Purpose

This document describes the production scanner transaction contract. The public
flow is `resolveScan` followed by exactly one compatible commit. The older
add/redeem mutations are internal migration-safety endpoints and are not part of
the scanner UI contract.

## Customer QR

The scanner accepts the existing generic signed customer QR. It identifies a
customer, not a business, program, or membership. The v2 payload carries the
customer identity, issue/expiry timestamps, nonce, signature, and key metadata.
The server remains responsible for parsing, signature verification, expiry, and
replay protection.

Resolving a QR does **not** consume it. A successful commit consumes it once by
recording a `scanTokenEvents` entry. A consumed signature/nonce cannot be reused.

## 1. Resolve

Function: `api.scanner.resolveScan`

Input:

- `qrData: string`
- `businessId: Id<'businesses'>`
- `programId: Id<'loyaltyPrograms'>`
- `scannerRuntimeSessionId: string`
- `deviceId: string`

Server checks include:

- authenticated, active actor with `scanner_access` for the business
- active business and scanner-eligible program belonging to it
- QR parsing, signature, expiry, and prior-consumption checks
- active customer lookup
- current program membership and POS-enrollment policy

Output:

- `scanSessionId`
- `sessionExpiresAt`
- `customerUserId`
- `customerDisplayName`
- `membership`, nullable, with `membershipId`, `currentStamps`, `maxStamps`,
  and `canRedeemNow`
- `resolution`: `AUTO_STAMP`, `JOIN_AND_STAMP`, or `REDEEM_AVAILABLE`

`AUTO_STAMP` and `JOIN_AND_STAMP` create a stamp session. `REDEEM_AVAILABLE`
creates a redeem session and still requires an explicit cashier decision before
commit.

## 2. Commit

Functions:

- `api.scanner.commitStamp({ scanSessionId })`
- `api.scanner.commitRedeem({ scanSessionId })`

The commit function must match the action fixed by the resolved session. The
server rechecks `scanner_access`, actor ownership of the session, session status
and expiry, business/program eligibility, token consumption, entitlement,
rate-limit, customer, and membership rules.

A successful commit returns the resulting membership balance plus transaction
metadata including `customerDisplayName`, `eventId`, `eventType`,
`eventCreatedAt`, `undoAvailableUntil`, and referral qualification metadata.
Redeem results also include `redeemedAt`.

Commit is idempotent: retrying the same committed `scanSessionId` returns the
stored result without applying the action or consuming the QR again. A technical
failure leaves a ready session available for retry with the same session ID.
Business/product failures may make that session terminal.

## Session and device continuity

`scannerRuntimeSessionId` and `deviceId` are captured during resolve and written
to the commit event. They are not replaced during commit retry. The same values
must be supplied to Undo, where the server also verifies the original actor and
that no newer scan or balance event broke continuity.

## 3. Undo

Function: `api.scanner.undoLastScannerAction`

Input:

- `eventId: Id<'events'>`
- `scannerRuntimeSessionId: string`
- `deviceId: string`

Undo is available for eligible scanner commit events for 30 seconds. The actor
must still have `scanner_access`, must be the original committing actor, and must
match the runtime session and device. The target must remain the latest relevant
membership and scanner-session event, with no newer scan. Referral reward grants
can block scanner Undo.

Output:

- `status`: `reverted` or idempotent `already_reverted`
- `reversalEventId`
- restored `membership` summary
- `program` summary

The server's timing, continuity, latest-event, referral, and reversibility checks
are authoritative.

## Authorization

`listScannerPrograms`, `resolveScan`, both commit functions, and scanner Undo use
the existing `scanner_access` business capability. Active-staff and active-
business checks remain part of that capability guard. The role capability matrix
is defined elsewhere and is not part of this contract.

## Error families used by the POS

- Business/program: `BUSINESS_CLOSED`, `BUSINESS_NOT_FOUND`,
  `BUSINESS_PERMANENT_DELETION_IN_PROGRESS`, `PROGRAM_NOT_FOUND`,
  `PROGRAM_NOT_SCANNER_ELIGIBLE`
- QR/session: `INVALID_QR`, `EXPIRED_TOKEN`, `TOKEN_ALREADY_USED`,
  `INVALID_SCAN_SESSION`, `SCAN_SESSION_EXPIRED`, `INVALID_SCAN_ACTION`
- Customer/action: `CUSTOMER_NOT_FOUND`, `SELF_STAMP`,
  `POS_ENROLL_DISABLED`, `MEMBERSHIP_NOT_FOUND`, `NOT_ENOUGH_STAMPS`,
  `RATE_LIMITED`
- Authorization/entitlement: `NOT_AUTHENTICATED`, `NOT_AUTHORIZED`, and the
  existing entitlement limit codes/payloads
- Undo: `EVENT_NOT_FOUND`, `EVENT_NOT_REVERSIBLE`, `UNDO_NOT_ALLOWED`,
  `UNDO_PERMISSION_DENIED`, `UNDO_SESSION_MISMATCH`, `UNDO_EXPIRED`,
  `UNDO_NOT_LAST_MEMBERSHIP_EVENT`, `UNDO_NOT_LAST_SESSION_EVENT`,
  `UNDO_SESSION_CONTINUITY_BROKEN`, `UNDO_BLOCKED_REFERRAL_REWARD`,
  `UNDO_REDEEM_DISABLED`

The UI localizes these outcomes. It must not turn terminal business/product
errors into a new resolve, and it must retry unknown commit failures using the
same resolved session.
