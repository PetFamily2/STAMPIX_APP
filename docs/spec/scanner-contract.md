# Scanner Contract (UI <-> Convex) - MVP + Future-Ready

## Purpose
Define a strict contract for scanner flows so:
- UI stays simple and predictable
- Server enforces permissions and business rules
- Future API integrations can reuse the same primitives

---

## Entities involved
- businessId
- programId
- customerUserId
- membershipId (optional input, always resolvable server-side)
- actorUserId (derived from auth on server)

---

## Step 1 - Resolve scan payload
### Input (from UI)
- qrData: string  (raw scanned content)

### Server responsibility
- Validate qrData format
- Map to customerUserId (via users.externalId or another stable mapping)
- Return customer profile summary + membership summary for this business/program

### Output (to UI)
- customerUserId
- customerDisplayName
- membership:
  - membershipId
  - currentStamps
  - maxStamps
  - canRedeemNow (boolean)

---

## Step 2 - Add stamp
### Input (from UI)
- businessId: Id<'businesses'>
- programId: Id<'loyaltyPrograms'>
- customerUserId: Id<'users'>

### Server rules
- actor must be businessStaff for businessId (owner or staff)
- create membership if missing (MVP: auto-create)
- currentStamps += 1 (but never exceed maxStamps if you decide to cap)
- write events: STAMP_ADDED

### Output (to UI)
- membershipId
- currentStamps
- canRedeemNow

---

## Step 3 - Redeem reward
### Input (from UI)
- businessId
- programId
- customerUserId

### Server rules
- actor must be businessStaff for businessId
- must have membership
- must have currentStamps >= maxStamps (or your redeem rule)
- set currentStamps back to 0 (or subtract maxStamps - choose later)
- write events: REWARD_REDEEMED

### Output (to UI)
- membershipId
- currentStamps
- redeemedAt (timestamp)

---

## Error codes (normalized)
UI never shows raw errors. Server returns typed errors:
- NOT_AUTHENTICATED
- NOT_AUTHORIZED
- INVALID_QR
- CUSTOMER_NOT_FOUND
- PROGRAM_NOT_FOUND
- MEMBERSHIP_NOT_FOUND
- NOT_ENOUGH_STAMPS
- BUSINESS_INACTIVE

---

## Future-ready notes
- qrData mapping must support enterprise external IDs
- all mutations should accept externalId variants later without breaking UI
