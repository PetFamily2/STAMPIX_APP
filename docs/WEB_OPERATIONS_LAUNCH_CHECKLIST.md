# Web + operations launch checklist

Last updated: 2026-11-11. Current execution evidence: [release hardening ledger](audits/RELEASE_HARDENING_EXECUTION_20261111.md). This checklist is not launch approval.

## Implemented on the launch branches

- Premium public marketing site aligned to the canonical StampAix blue palette.
- Responsive sales homepage and navigation.
- Pricing, how-it-works and solution landing pages.
- High-intent SEO pages for loyalty, digital punch cards and retention.
- Industry pages for cafes, beauty, fitness, retail and local services.
- Canonical metadata, social preview, sitemap, robots and structured data.
- Marketing security headers/CSP.
- Fail-closed store-destination handling.
- Existing Business Web dashboard, team, settings and SUMIT billing retained.
- Web-only, server-authorized Admin operations center.
- Admin business search/detail, billing attention, support and deletion queues.
- SUMIT reconciliation scheduler and admin reconciliation health.

## External configuration blockers

These require account/domain/provider access and are not completed by source
code alone:

- Make `stampaix.com` the direct canonical Cloudflare marketing domain and redirect
  `www.stampaix.com` to it.
- Configure `business.stampaix.com` as the single application HTTPS origin on the existing Cloudflare account. No new paid hosting service; no Production DNS changes without explicit approval.
- Configure `SUMIT_WEB_ORIGIN`.
- Configure all six SUMIT hosted product success/cancel destinations.
- Verify Search Console ownership for the final canonical domain.
- Provide final legal operator identity/address where required by the legal
  documents.
- Confirm the monitored production support mailbox.
- Verify the configured Web OAuth/email origins, delivery and account recovery on the final application origin.
- Verify Web Push/VAPID, persistent browser permissions, installation and QR on two physical phones. API/configuration presence does not prove delivery or device acceptance.
- Complete SUMIT TEST immediate paid checkout, entitlement, renewal/cancellation, duplicate webhook and refund acceptance. Production charging remains separately authorized; never use a free/unbilled trial to bypass this gate.
- Verify monitoring, alert ownership, original-database backup/restore procedure and tested rollback. Do not reset or import data to demonstrate recovery.
- Resolve dependency advisories by reviewed exposure and compatible fixes; an audit result is not proof of exploitation or proof of safety.

## Post-launch Native work (not Web/PWA launch blockers)

- Apple Team ID/AASA, Play signing/assetlinks and final store listing URLs.
- Production Native APNs/FCM credentials, signed device builds and store submission.
- Native JavaScript exports passed in integration CI; a Windows host without Java/Android tools or Xcode cannot establish a signed Android/iOS build PASS. Physical tests are separate.
- GAME-01/02 and advanced game systems remain Post-launch, owned by Cursor. Preserve the unpublished game branch and external artwork.

## Intentionally still blocked

- SUMIT Production enablement.
- Card-update execution until the provider contract is confirmed.
- Refund execution until the provider contract is confirmed.
- Upgrade/downgrade/cadence-change billing writes.
- Destructive or billing-changing Admin actions without a dedicated audit log.
- Third-party analytics until a provider/privacy/consent decision is explicit.
- Production deploy, Production Convex deploy/migration and store submission
  without separate approval.
