# Web + operations launch checklist

Last updated: 2026-10-10 — three-stage plan sync

## Current execution control

- Three stages: **(1) complete all ordinary Customer/Owner/Manager/Staff product paths; (2) device QA, security, SUMIT TEST and reliability; (3) pilot, public landing, Production and stores under separate approvals**.
- Canonical task tracker: `docs/LAUNCH_EXECUTION_PLAN_3_STAGES_2026-10-10.md`.
- **Approved but not implemented:** 14-day no-card/no-commitment/no-autocharge trial in *selected* Starter/Pro/Premium tier, for both monthly/annual options; customer limits 30/2,000/10,000. Current code still Pro-only trial and 250/3,000/10,000 limits. Requires Stage 1 implementation and both app/landing copy QA.
- Original shared non-production Convex DB remains sole ordinary-product acceptance source; Native preserved.
- Do not open isolated Preview DB, create fake acceptance accounts, promote Production, activate paid billing or submit stores without proper approvals.

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

- Make `stampaix.com` the direct canonical Vercel domain and redirect
  `www.stampaix.com` to it.
- Configure the final Business Web HTTPS origin.
- Configure `SUMIT_WEB_ORIGIN`.
- Configure all six SUMIT hosted product success/cancel destinations.
- Supply final Apple Team ID for AASA generation.
- Supply final Google Play signing SHA-256 fingerprint for assetlinks.
- Configure final App Store and Google Play listing URLs after listings exist.
- Verify Search Console ownership for the final canonical domain.
- Provide final legal operator identity/address where required by the legal
  documents.
- Confirm the monitored production support mailbox.
- Configure production APNs/FCM/OAuth credentials.

## Intentionally still blocked

- SUMIT Production enablement.
- Card-update execution until the provider contract is confirmed.
- Refund execution until the provider contract is confirmed.
- Upgrade/downgrade/cadence-change billing writes.
- Destructive or billing-changing Admin actions without a dedicated audit log.
- Third-party analytics until a provider/privacy/consent decision is explicit.
- Production deploy, Production Convex deploy/migration and store submission
  without separate approval.
