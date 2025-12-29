# Roles & Permissions

## App Roles
- customer
- business_owner
- business_staff
- admin_support

## Business Staff
- Each business can have multiple staff members.
- business_owner: full access
- business_staff: operational access (scanner, basic actions)

## Notes
- Staff limits are enforced by plan (Starter: up to 2).
- Staff UI management is not required for MVP.
- Role gating happens in the authenticated router layer.
