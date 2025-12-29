# Data Model (Convex)

## Core Tables (MVP + future-ready)
- users
- businesses
- businessStaff
- loyaltyPrograms
- memberships
- events (audit log)

## Key Concepts
- A user can be a customer and/or business staff.
- A business can have multiple programs (MVP exposes one).
- A customer can belong to multiple businesses.

## Future Tables (Scaffold only)
- campaigns (type, rules, channels, enabled)
- messageLog
- apiClients
- apiKeys
