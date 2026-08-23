# Auth Linking QA Checklist

Last synced: 2026-06-15

## Scope
Validate account linking and onboarding behavior across:
- Google
- Apple
- Email OTP

## Preconditions
- Convex auth providers are configured.
- `CONVEX_SITE_URL` is configured to the production Convex HTTP site origin.
- `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set in the target Convex environment.
- `AUTH_APPLE_ID` and `AUTH_APPLE_SECRET` are set in the target Convex environment.
- App can reach Convex deployment.

## Production OAuth dashboard setup

Google:
- Use a production Web application OAuth client.
- Authorized redirect URI:
  `<CONVEX_SITE_URL>/api/auth/callback/google`.
- OAuth consent screen is production-ready and includes the callback host as an authorized domain.
- The Web client id and secret match `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

Apple:
- Sign in with Apple is enabled for bundle id `com.stampaix.app`.
- The Apple Services ID/client id used by Convex Auth is linked to the app identifier when required.
- Return URL:
  `<CONVEX_SITE_URL>/api/auth/callback/apple`.
- Callback domain verification is complete if required by Apple.
- The Apple client id and client secret JWT match `AUTH_APPLE_ID` and `AUTH_APPLE_SECRET`.

Native app assumptions:
- App scheme is `stampaix`.
- OAuth app callback remains `stampaix://oauth-callback`.
- iOS bundle id and Android package are both `com.stampaix.app`.

## Scenario 1: New Google user
1. Start at `/(auth)/welcome`.
2. Continue to role + sign-up flow.
3. Sign in with Google.
4. Expect redirect to `/(auth)/name-capture` when names are missing.
5. Submit first/last name.
6. Expect onboarding continuation, then home by role.

Checks:
- one `users` row created
- one `userIdentities` row for `google`
- `needsNameCapture` and `postAuthOnboardingRequired` values updated correctly

## Scenario 2: New Apple user
1. Start sign-up flow.
2. Sign in with Apple.
3. Verify first login profile handling:
   - if Apple provides names, fields prefill in name-capture
   - if missing, manual capture is required

Checks:
- one `users` row
- one `userIdentities` row for `apple`

## Scenario 3: Existing email user then Google/Apple sign-in
1. Create/login user via Email OTP.
2. Sign out.
3. Sign in with Google (same verified email).
4. Repeat with Apple.

Checks:
- no duplicate `users` row
- additional `userIdentities` rows are linked to same user

## Scenario 4: Legacy sign-in route
1. Open `/(auth)/sign-in`.
2. Expect immediate redirect to `/(auth)/sign-up`.

## Scenario 5: Name-capture guard
1. Force user flags to require name capture.
2. Enter authenticated tree.
3. Expect redirect to `/(auth)/name-capture`.
4. Verify continue button is disabled until first and last names are non-empty.

## Scenario 6: Redirect safety
1. Validate production allows `stampaix://oauth-callback`.
2. Validate production blocks `exp://`, `exps://`, and `https://auth.expo.io/`.
3. Validate development may allow Expo dev redirects.
4. Validate relative auth redirects resolve through `CONVEX_SITE_URL`.
5. Validate `SITE_URL` fallback works only when `CONVEX_SITE_URL` is missing.
6. Validate relative auth redirects fail when neither `CONVEX_SITE_URL` nor `SITE_URL` is configured.

## Regression checks
- Business role user lands in `/(authenticated)/(business)/dashboard`.
- Customer role user lands in `/(authenticated)/(customer)/wallet`.
- Join deep-link params survive auth barrier and can continue flow.
