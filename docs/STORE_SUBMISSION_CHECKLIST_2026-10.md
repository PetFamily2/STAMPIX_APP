# StampAix — Store Submission Gate

Updated: 2026-10-03

This document is an execution checklist for the iOS App Store and Google Play
launch candidate. It does not authorize Production deployment, secret rotation,
billing enablement, store submission, or migration work.

## 1. Frozen app identity

- App name: `StampAix`
- iOS bundle identifier: `com.stampaix.app`
- Android package: `com.stampaix.app`
- Custom scheme: `stampaix`
- Universal/App Links host: `stampaix.com`
- iOS associated domain: `applinks:stampaix.com`
- Android verified paths: `/join` and `/r`
- Current app version in source: `1.0.0`
- EAS project id is already configured in source.

Do not change identifiers during the launch gate.

## 2. Native launch purchase model

Native iOS and Android are consumption/companion apps.

The launch candidate must not expose:
- plan prices;
- purchase buttons;
- restore-purchase controls;
- SUMIT checkout;
- PayPlus checkout;
- App Store / Play subscription-management links;
- copy that directs the user to purchase on the website.

Business subscription purchase and management is handled on Business Web.
Convex remains the entitlement authority. RevenueCat purchase infrastructure
remains dormant rollback infrastructure until the approved removal gate.

## 3. Required pre-submission technical proof

Before a Production build is approved for submission:

- [ ] Current Preview iOS build completes successfully.
- [ ] Current Preview Android build completes successfully.
- [ ] Fresh install tested on physical iPhone.
- [ ] Fresh install tested on physical Android device.
- [ ] iPad layout sanity-tested because `supportsTablet: true`.
- [ ] Email OTP sign-in/sign-up tested.
- [ ] Google sign-in tested on physical device.
- [ ] Apple sign-in tested on physical iOS device.
- [ ] Session recovery tested after force-close/relaunch.
- [ ] Customer onboarding tested from a new account.
- [ ] Business onboarding tested from a new owner account.
- [ ] Customer/business mode switching tested.
- [ ] Owner/manager/staff permission boundaries tested.
- [ ] Scanner: scan → stamp → reward-ready → redeem → celebration tested.
- [ ] Scanner retry/undo/concurrency behavior tested.
- [ ] Referral and join links tested installed and not installed.
- [ ] Maps/discovery and approximate-location behavior tested.
- [ ] Push delivery and push-tap routing tested on iOS.
- [ ] Push delivery and push-tap routing tested on Android.
- [ ] Account deletion tested.
- [ ] Business closure/permanent-deletion boundaries tested.
- [ ] RTL/manual-RTL visual QA completed.
- [ ] Large text/readability/accessibility sanity test completed.
- [ ] Offline/background/relaunch error states tested.

## 4. Native permission contract currently declared

### iOS

- Camera: QR scanning.
- Approximate foreground location: nearby participating businesses.
- No background location.
- No microphone permission required for the product flow.
- Non-exempt encryption declaration: false.

### Android

Declared:
- Camera.
- Coarse location.
- Notifications.

Explicitly blocked:
- Microphone.
- Fine location.
- Background location.
- Image/media read access.
- Legacy external-storage read/write.

The generated native projects must be inspected before submission to prove that
the final binary matches these declarations.

## 5. Push readiness

Source currently configures:
- Android notification icon: `assets/images/notification-icon.png`
- Android notification tint: `#2F6BFF`
- Default Android channel: `default`
- Production Android Firebase client path: `./google-services.json`
- Preview Firebase client must be separate from Production.

External proof still required:
- [ ] APNs credentials accepted by EAS.
- [ ] FCM V1 credentials accepted by EAS.
- [ ] Production Firebase Android client exists locally at build time.
- [ ] Production client file is not committed as a secret.
- [ ] Real-device delivery succeeds on both platforms.

## 6. Public web and deep-link gate

Canonical public URLs:
- Privacy: https://stampaix.com/legal/privacy
- Terms: https://stampaix.com/legal/terms
- Account deletion: https://stampaix.com/account-deletion

Before submission:
- [ ] `stampaix.com` serves the canonical site directly.
- [ ] `www.stampaix.com` redirects to the apex host.
- [ ] `/.well-known/apple-app-site-association` returns 200 JSON with no redirect.
- [ ] `/.well-known/assetlinks.json` returns 200 JSON with no redirect.
- [ ] AASA contains the real Apple Team ID + `com.stampaix.app`.
- [ ] Android asset links contain the real Production signing SHA-256 fingerprint.
- [ ] `/join` opens the installed app.
- [ ] `/r/<code>` opens the installed app and preserves the referral context.
- [ ] Uninstalled flows reach only real store listing URLs once listings exist.

## 7. Business Web + SUMIT gate

No Production billing enablement is authorized by this checklist.

Test environment must prove:
- [ ] Starter monthly.
- [ ] Starter yearly.
- [ ] Pro monthly.
- [ ] Pro yearly.
- [ ] Premium monthly.
- [ ] Premium yearly.
- [ ] Browser success never grants entitlement by itself.
- [ ] Server verification grants only the verified business entitlement.
- [ ] Renewal.
- [ ] Failed renewal enters the canonical 7-day direct-provider grace window.
- [ ] D0/D3/D6 reminder path.
- [ ] Recovery from past-due state.
- [ ] Cancellation keeps access through paid period end.
- [ ] Invoice/document display.
- [ ] Reconciliation catches missed provider state.
- [ ] Refund operator flow remains fail-closed until provider verification is implemented.
- [ ] Payment-method update remains fail-closed until hosted provider verification is implemented.

## 8. Store listing assets

Still required as final approved artifacts:
- [ ] iPhone screenshots in required App Store sizes.
- [ ] iPad screenshots if App Store Connect requires them for the enabled tablet support.
- [ ] Google Play phone screenshots.
- [ ] Google Play feature graphic.
- [ ] Store icon generated from the canonical StampAix source artwork.
- [ ] Screenshot set contains only real product UI.
- [ ] No store screenshot contains test emails, personal information, credentials,
      internal ids, test payment identifiers, or debugging UI.

## 9. Store disclosures

Before submission, compare the actual Production binary/backend behavior to the
store questionnaires.

Disclosures to review include:
- account/contact information used for authentication/profile;
- approximate location;
- user-generated business/profile data;
- identifiers needed for account/session/push;
- purchase/subscription state;
- support requests;
- app interaction/diagnostic data actually collected;
- marketing consent and push messaging behavior;
- account deletion.

Do not declare collection based only on planned features. Declare what the
Production app and backend actually collect/process at submission time.

## 10. Security gate

Before Production approval:
- [ ] Final authorization review for every public Convex function.
- [ ] Admin routes fail closed for non-admin users.
- [ ] Business billing actions require owner/manage-subscription authority.
- [ ] Rate limits reviewed for auth, OTP, public forms, joins, scans and provider callbacks.
- [ ] No secrets embedded in client bundles.
- [ ] Previously exposed credentials rotated through their provider consoles.
- [ ] Production environment values entered without printing or committing them.
- [ ] OAuth Production redirect URIs verified.
- [ ] Google Maps/Places keys restricted to their intended API/application scope.
- [ ] Logs checked for tokens, credentials, card data and unnecessary PII.
- [ ] Production backup/recovery and operator access documented.

## 11. Final release sequence

Each item is a separate explicit operation:

1. Freeze the approved source SHA.
2. Run full source tests and type-check.
3. Run Production prebuild gates.
4. Verify Production external configuration.
5. Build iOS Production candidate.
6. Build Android Production candidate.
7. Test the exact candidates.
8. Complete App Privacy / Data Safety questionnaires.
9. Upload approved screenshots and metadata.
10. Submit to TestFlight/App Review and Play review only after explicit approval.

No step in this file implies approval for the next step.
