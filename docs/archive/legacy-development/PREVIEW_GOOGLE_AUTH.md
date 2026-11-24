# Google login in the isolated PWA Preview

The reported `401 invalid_client` was reproduced: the isolated backend initiated
Google OAuth without a configured client ID. Automated RC journeys used the real
Password provider with synthetic actors; they did not establish Google OAuth readiness.

The Web entry now reads only server-owned provider readiness booleans, disables
unconfigured methods, and checks readiness again before initiating sign-in. An
unconfigured email provider is not advertised as a working fallback. Native OAuth,
account linking, and existing auth functions are unchanged. This readiness check
does not prove that Google accepts a configured client.

## External configuration still required

Use a dedicated **non-Production Google Cloud project** and a **Web application**
OAuth test client. Do not change the audience/consent settings of a Production project.
For the currently verified isolated Preview `dazzling-hound-780`, configure:

- Google authorized redirect URI:
  `https://dazzling-hound-780.convex.site/api/auth/callback/google`
- Authorized JavaScript origin: the exact current EAS Preview origin.
- Google audience: Testing, with explicitly approved test accounts.

Set these **server-only** environment variables on that exact Convex Preview:

- `AUTH_GOOGLE_ID`: the test Web client's ID.
- `AUTH_GOOGLE_SECRET`: its matching secret.
- `PHASE3_GOOGLE_AUTH_PREVIEW_URL`:
  `https://dazzling-hound-780.convex.cloud`

Do not send the secret in chat or put it in any `EXPO_PUBLIC_` variable, source,
URL, client export, logs, or artifacts. Do not change DEV/Production settings.

The Actions runner first authorizes and reuses the named Preview; it does not
claim a replacement on every test run. Creation is permitted only after an
authoritative not-found response; authentication/transient errors stop the run.
The isolated Actions runner retains these credentials only when the existing
deployment is proven owned/synthetic and the binding URL matches its verified
Preview URL exactly. Unmarked inherited credentials are removed. A mismatch or
incomplete marked configuration fails closed. The runner creates a new temporary
server-only token-encryption key only when the owned Preview lacks one; it retains
an existing key and never rotates a Production credential.

If the Preview is deleted/recreated with a different deployment slug, the binding
must be updated deliberately and the new Convex callback registered with Google.
No client or credentials are automatically migrated between environments.

## Verification after configuration

Reload the current Preview sign-up route. Google becomes available only after its
ID, secret, and provider-token encryption configuration pass server readiness.
Complete a real Google login with an approved test identity, then verify callback,
onboarding, logout/login, and account-linking boundaries. Do not claim successful
Google authentication from readiness booleans or an initiation redirect alone.

References: https://labs.convex.dev/auth/config/oauth/google and
https://developers.google.com/identity/protocols/oauth2/web-server.
