# Existing StampAix provider reuse

The operator explicitly authorized reusing existing Resend, Google OAuth and Places credentials for the current ordinary Product Preview on October 8, 2026. No new provider account, API key or OAuth client is needed. The earlier recommendation for dedicated provider credentials is superseded by this authorization.

Current Web Preview: https://stampaix-business--ebwtbuf8vy.expo.app/welcome

Current backend: https://dependable-squirrel-701.convex.cloud

The provider-only Action reads already authorized EAS environments and repository secrets privately, and existing Convex environments where the available credentials permit read access. It copies only missing provider values to the exact current, owned Product Preview. Source environment values, existing Preview secrets and Production callbacks are retained. SUMIT is copied only from an explicitly existing test configuration. No app/backend deployment, fixture reset, new credential, payment or account creation occurs in this Action.

The existing successful application run 37800829087 is retained; provider-only changes do not require repeating its synthetic tests or exports. Evidence reports variable names and status only. Email configuration availability is not OTP delivery or real-account acceptance; those require the ordinary Web UI and a reachable mailbox. OAuth client registration and Places restrictions are separate provider-side checks.

Real acceptance remains through ordinary UI: Customer/Owner onboarding, business/program creation, customer join, Manager/Staff invitations and permissions, QR/scanner, stamps/redemption/undo, campaigns/referrals/inbox/settings/location. No seeded identity or database mutation may substitute for these flows.
