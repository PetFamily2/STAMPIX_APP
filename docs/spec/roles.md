# Roles & Permissions

Last synced: 2026-06-05

## Role sources
There are two related signals:
1. `users.role` - app-level role hint used for routing and mode defaults.
2. `businessStaff` - business-specific authorization source.

`businessStaff` is the important security source for business mutations.

## `users.role` values
- `customer`
- `merchant`
- `staff`
- `admin`

## `businessStaff.staffRole` values
- `owner`
- `manager`
- `staff`

## Route shells
See `docs/routes.md` for the full route map.

Customer shell:
- Used for customer mode and regular customer surfaces.
- Includes wallet, rewards, discovery, QR, referrals, settings, account, support, business detail, and customer-card routes.

Business shell:
- Used for active business owners/managers and business-role flows.
- Includes dashboard, scanner, analytics, customers, campaigns, programs/cards, team, QR, referrals settings, subscription, and profile/account/address settings.

Staff shell:
- Used for active staff membership when the active business shell resolves to staff.
- Includes scanner, customers, promotions, and staff settings.

Admin shell:
- Admin-only surfaces live under `app/(authenticated)/admin/*`.

Merchant routes:
- Merchant routes are alias/compatibility surfaces around business-role flows and onboarding.

## Effective permissions
### Customer routes
- Accessible when the app resolves to customer mode or the user has no active business shell.
- Server-side customer data access still depends on the authenticated user.

### Business routes
- Require an active business shell.
- Owner/manager-style business access is resolved through the active `businessStaff` membership and business onboarding state.
- Staff-only users are redirected to the staff shell.

### Scanner/server mutations
- Server requires active `businessStaff` relation for the target business.
- Being `merchant`, `staff`, or `admin` in `users.role` alone is not enough for scanner writes.

### Team management
- Listing team: active staff membership for the business.
- Inviting staff: owner-only (`staffRole === 'owner'`).
- Role/status changes are audited through staff event records.

## Onboarding implications
- New users start in customer-oriented flows.
- Business onboarding creates or activates a business shell.
- Invited staff can become active staff for a business through invite acceptance.
- Route guards may redirect users to name capture, business onboarding, customer wallet, business dashboard, or staff scanner depending on session state.

## Security notes
- Permission checks are enforced in Convex guards and domain mutations.
- UI role checks improve navigation and UX, but they are not the security boundary.
