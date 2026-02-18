# Roles & Permissions (Current)

Last synced: 2026-02-18

## Role sources
There are two related signals:
1. `users.role` (app-level role hint used for routing/tab access)
2. `businessStaff` membership (business-specific authorization)

## `users.role` values
- `customer`
- `merchant`
- `staff`
- `admin`

## Effective permissions
### Customer routes
- Accessible when role resolves to customer mode.
- Core screens: wallet, rewards, discovery, settings.

### Business routes
- Business tab tree allows roles in `BUSINESS_ROLES` (`merchant`, `staff`, `admin`).
- Users outside these roles are redirected to customer wallet.

### Scanner/server mutations
- Server requires active `businessStaff` relation for target business.
- Being `merchant/staff/admin` in `users.role` alone is not enough for scanner writes.

### Team management
- Listing team: any active staff for the business.
- Inviting staff: owner-only (`staffRole === 'owner'`).

## Onboarding implications
- New users default to customer role.
- Merchant onboarding can promote role to `merchant`.
- Invited staff can be set/promoted to `staff`.

## Security notes
- Permission checks are enforced in Convex guards and business/scanner mutations.
- UI role checks improve UX but are not the security boundary.
