# Native route follow-up — 12 November 2026

The generated [144-file route inventory](ROUTE_INVENTORY_20261111.md) records literal/import/layout evidence and deliberately leaves nine static UNKNOWN entries. Manual context below supplements that machine label; it does not authorize deletion or claim a physical-device PASS.

| Static UNKNOWN file(s) | Reviewed context | Disposition |
|---|---|---|
| `app/+html.tsx`, `app/+not-found.tsx` | Expo framework document/error entry points, reached implicitly rather than from ordinary router pushes | COMPATIBILITY infrastructure; retain |
| `app/billing/sumit/success.web.tsx`, `cancel.web.tsx` | External payment return destinations are generated as origin-prefixed templates in `convex/lib/billing/sumit/config.ts:212-213`; exact callback surfaces have billing/navigation contract tests | ACTIVE Web callback routes; provider TEST acceptance remains open |
| `app/billing/sumit/success.tsx`, `cancel.tsx` | Native companion redirect surfaces retained for safe handling of Web-only billing returns; covered by native-companion contracts | COMPATIBILITY; retain |
| `app/r/[code].tsx` | Dynamic business-referral intake; production contract defines `/r/` prefix, then component reads and persists pending referral code before explicit continuation | ACTIVE external/deep-link intake; no orphan inference from missing literal `/r/[code]` |
| `app/(auth)/paywall/legal.tsx` | Legacy nested legal-document wrapper with its paywall fallback | UNKNOWN external reachability / compatibility candidate; preserve until legacy link and device acceptance |
| `app/(authenticated)/admin/referrals.tsx` | Thin wrapper around `screens/AdminReferralsScreen.tsx` | UNKNOWN external/Native entry usage; retain and verify administrator deep links; no privilege expansion |

All eight shared `screens/*.tsx` have route consumers. Merchant onboarding is active through canonical onboarding/post-auth routing and is preserved. Customer, Business, Staff and Admin Web alternatives do not authorize deleting their Native routes. The unpublished game branch, customer layouts/wallet, `convex/memberships.ts` and game/query assets were not edited.

## Dependency / retirement decisions

- `metro.config.js` is canonical. Actual Node loading now proves `metro.config.cjs` returns the same configuration object; the alternate filename remains a compatibility wrapper. Existing icon-resolver tests verify Native requests are delegated unchanged. Native/Web JavaScript export must pass again on the final candidate.
- `scripts/repair-ms-package.mjs` and `patches/expo-sharing@14.0.8.patch` are active installation dependencies and retained.
- Old phase3 synthetic/provider-copy runners remain fenced by historical branch/revision guards and are absent from active launch CI. Their historical path allowlists are not missing-file reads. No runner was executed to create/copy/reset data.
- One-off `patch_debug_demo_*` / `patch_seed_*` helpers are not active package/CI entries, but unknown manual use is not proof they are safe to delete. Retain as historical tooling pending coordinated retirement.
- `convex/debug.ts` and `convex/seed.ts` are administrative/internal data-changing code, not ordinary screen actions. They were not invoked or removed to satisfy cleanup.
- `lib/services/scanService.ts` has no literal filename references in tracked source/package/CI. Its legacy client-domain actor placeholder remains a finding; authoritative scanner mutations use the server pipeline. Do not reuse it for audit attribution or infer that absence of imports alone authorizes deletion. Full dynamic/manual usage remains unproven.

No screens/routes were removed. Native signed binaries and physical device behavior remain distinct, unperformed gates; CI JavaScript exports are not an APK/IPA or device test.
