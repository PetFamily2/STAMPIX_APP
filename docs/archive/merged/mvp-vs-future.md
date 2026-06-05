# MVP vs Future (Current)

Last synced: 2026-02-18

## MVP includes
Customer:
- Auth and onboarding gates
- Wallet tab flow
- Rewards/discovery tabs
- Join business via QR/deep link
- Membership card with signed customer QR

Business:
- Dashboard tab
- Scanner flow (resolve, stamp, redeem)
- Team tab and invite flow
- Analytics tab
- Settings tab
- Merchant onboarding flow

Platform:
- Multi-provider auth (Email OTP, Password, Google, Apple)
- Role-aware routing and appMode persistence
- RevenueCat integration with safe preview fallback

## Future (not fully shipped)
- Fully dynamic dashboard feed/cards
- Rich campaign management UI
- Full admin/support route tree
- Expanded enterprise integrations UX over existing `apiClients/apiKeys`

## Foundations already in place
- Schema supports campaigns/messages/api clients/keys.
- Identity linking model supports provider growth.
- Scanner contract is server-authoritative and replay-safe.
- RevenueCat sync path already writes subscription state to users.
