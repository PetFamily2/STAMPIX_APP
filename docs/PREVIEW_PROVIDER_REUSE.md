# Existing StampAix provider reuse

The operator explicitly authorized reusing existing Resend, Google OAuth and Places credentials for the current ordinary Product Preview on October 8, 2026. No new provider account, API key or OAuth client is needed. The earlier recommendation for dedicated provider credentials is superseded by this authorization.

Previous Web Preview: https://stampaix-business--ebwtbuf8vy.expo.app/welcome (superseded: its JavaScript bundle retained a synthetic backend URL from the export cache).

Current corrected Web Preview: https://stampaix-business--ou777y2zcv.expo.app/welcome

Current backend: https://dependable-squirrel-701.convex.cloud

The provider-only Action reads already authorized EAS environments and repository secrets privately, and existing Convex environments where the available credentials permit read access. It copies only missing provider values to the exact current, owned Product Preview. Source environment values, existing Preview secrets and Production callbacks are retained. SUMIT is copied only from an explicitly existing test configuration. No backend deployment, fixture reset, new credential, payment or account creation occurs in this Action.

Existing Resend, Google OAuth and Places credentials were found on the existing DEV deployment through the signed-in dashboard and copied to the current Preview. Dashboard transfer uses source editor selection and an opaque clipboard; values are not entered into source code or artifacts. One intermediate save observation inadvertently exposed a provider value in tool output; no credential was rotated because rotation is explicitly forbidden. Follow-up observations suppress editor values and wait for fields to disappear before inspecting saved masked rows.

Resend domains and Places autocomplete returned HTTP 200 from the current Preview server configuration. Existing SUMIT mode is test, but SUMIT_PRODUCTS_JSON is invalid JSON on the source too; checkout remains fail-closed and externally blocked. No products or hosted checkout URLs are fabricated.

The same verified application source is rebuilt on a fresh detached checkout with Expo --clear and EXPO_NO_DOTENV=1, using only an explicit public environment allowlist. Before and after Preview hosting, the bundle must contain the exact current backend and no synthetic backend URL. Hosted release.json must match source 427a52712b15a722ff0af02664b80255a2eda892. The new Preview URL is recorded in product-provider-reuse-evidence.json. No application source or Native code is changed.

The existing successful application run 37800829087 is retained; provider-only changes do not require repeating its synthetic tests or exports. Evidence reports variable names and status only. Email configuration availability is not OTP delivery or real-account acceptance; those require the ordinary Web UI and a reachable mailbox. OAuth client registration and Places restrictions are separate provider-side checks.

Real acceptance remains through ordinary UI: Customer/Owner onboarding, business/program creation, customer join, Manager/Staff invitations and permissions, QR/scanner, stamps/redemption/undo, campaigns/referrals/inbox/settings/location. No seeded identity or database mutation may substitute for these flows.

The corrected hosted deployment is retained after export and hosting succeeded. The follow-up Action verifies its signup SPA bundle and release identity instead of repeating the successful build or publishing another URL. The welcome route is a standalone static page, so its absence of the SPA index bundle is expected. Normal signup visibly enables Email and Google; OTP delivery and new-account acceptance are still pending user authentication.
