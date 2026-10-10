# StampAix shared Web and installed Preview application

The operator superseded isolated Preview and synthetic QA on 2026-10-10.
The existing `utmost-fennec-280` database holds the original accounts, memberships,
businesses and event history. Development/internal Preview and the corresponding
ordinary Web app use it directly. No snapshot import, account copying, reset,
fixture provisioning, new database, provider key or OAuth client is part of this change.
Production deployment and merging to main remain outside authorization.

## Application changes

- One shared non-production backend selection is used by the app, customer camera
  and business/staff scanner. The Production URL selector is retained without deploying it.
- Existing Convex Auth and backend capabilities authorize normal accounts. No fixture
  actor/business allowlist is needed for this ordinary backend. Resolve, commit,
  operation receipts, duplicate protection and reconciliation are unchanged.
- Synthetic password accounts are permanently denied, even with legacy QA flags.
  The old QA bookmark redirects to ordinary sign-in; scanner test injection is removed.
- CI provisions no database and seeds no synthetic accounts. It verifies the changed
  application and Native contracts, selects only the exact existing DEV database using
  existing deployment access, validates its schema, syncs the backend and hosts the same source.
- Existing user, membership and event IDs are verified before and after backend sync.
  Keys, table documents, QR payloads and sessions are not included in CI evidence.

## Install banner

Public welcome and the normal application load `/pwa/install.js`. Its Hebrew banner
offers Add to Home Screen and a seven-day dismissal. A supported browser's installation
prompt opens only after a user click. iPhone/iPad receive Safari sharing-menu instructions;
other browsers receive their menu instructions when a native install prompt is unavailable.
Standalone mode and successful installation hide the banner. Storage failure does not
block the app. Installation consent and physical-device verification remain browser/device actions.

## Validation and acceptance

Local TypeScript, changed-file Biome and protected Native/RTL contracts were checked.
The repository-wide Biome baseline still has pre-existing debt; this change does not
claim the global formatting gate passed. GitHub runs the full test suite and Web/iOS/Android
JavaScript exports for this changed app revision before the shared deployment.

Deployment is not ordinary-user acceptance. Evidence must identify the exact shared
backend and hosted revision. The original account's wallet/history and each role's actual
flows require ordinary sign-in; no seeded journey may be reported as PASS. Real camera,
QR between devices, installation, background recovery and push require DEVICE VERIFY.
Payment must use an existing TEST configuration only; no real charge is authorized.
