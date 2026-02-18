# Auth Linking QA Checklist

Last synced: 2026-02-18

## Scope
Validate account linking and onboarding behavior across:
- Google
- Apple
- Email OTP

## Preconditions
- Convex auth providers are configured.
- `CONVEX_SITE_URL` is configured.
- App can reach Convex deployment.

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
1. Validate OAuth starts with safe relative redirect (`redirectTo: '/'`).
2. Validate auth callback succeeds only for allowed redirect patterns in server callback.

## Regression checks
- Business role user lands in `/(authenticated)/(business)/dashboard`.
- Customer role user lands in `/(authenticated)/(customer)/wallet`.
- Join deep-link params survive auth barrier and can continue flow.
