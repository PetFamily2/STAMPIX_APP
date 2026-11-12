# Dependency hardening — 12 November 2026

Status: implemented candidate; exact-candidate CI/export/backend dry-run and real authentication acceptance are required. No live backend, Production, data migration or provider configuration was changed by these dependency operations.

## Evidence and changes

- Initial `bun audit --json`: 156 advisory records across 29 package names (3 critical, 96 high, 43 moderate, 14 low). Records can repeat an advisory across installed versions; these are not counts of unique exploitable vulnerabilities.
- Pinned compatible peers `@convex-dev/auth` 0.0.98 and `@auth/core` 0.41.3. Reviewed the authentication source delta, including identifier binding, refresh-session behavior, OAuth and provider checks. The auth table definition source is byte-identical between 0.0.90 and 0.0.98; no auth-table migration is introduced.
- The application's existing `normalizeSignInEmail` already rejects Unicode/homoglyph recipient ambiguity and remains tested. The package upgrade additionally removes the vulnerable library release rather than relying solely on application mitigation. See the [maintainer's email advisory](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-7rqj-j65f-68wh) and [malformed Bearer advisory](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-xmf8-cvqr-rfgj).
- Security pins for shell-quote 1.12.0 and tar 7.5.23; regression tests reject command-containing operator tokens, malformed Bearer encoding and a bounded high-ratio archive before extraction.
- Additional single-version security updates, including nanoid 3.3.20, were selected from registry metadata only when every recorded consumer range accepted the candidate, preserving existing major versions (and existing minor for pre-1.0 packages). Overrides make those decisions reproducible. The Expo SDK, React Native version, Convex SDK and Bun runtime were not upgraded.
- After these updates: raw audit **54 records / 11 package names: zero critical, 37 high, 16 moderate, one low**. The audit still exits nonzero; it is not called clean.
- `decode-uri-component` is a runtime URL/query dependency. Its fixed 0.5.1 release is ESM-only and outside query-string's old consumer range, so it was not forced into the old CommonJS caller. Backported the vendor's linear decoder into the existing 0.2.2 API using a checked-in Bun patch. Retained form `+` conversion and CommonJS export; tested Hebrew/emoji, literal plus, query-string integration, malformed runs and single-pass decoding.
- Backport source: [upstream v0.5.1](https://github.com/SamVerschueren/decode-uri-component/blob/v0.5.1/index.js), SHA-256 `6a86ac891edf15c5efa0841ebb31935e3669d58b98318b57d7b08a4530317cb0`. Original MIT license remains in the package. The version-based audit still flags 0.2.2; its two records require the documented patch evidence, not an audit suppression or false version change.

The original shared `node_modules` junction was preserved inside ignored `.tmp/node_modules-baseline-6b72a0a`; candidate dependencies are now installed in this worktree only. No install or patch was performed in the original application or Cursor checkout. Bun's patch preparation was used before modifying the URI dependency, avoiding edits through shared package-cache hardlinks. A temporary lock-only update probe was reconciled from the actual manifest; explicit root manifest/lock agreement passed, with no unintended direct nanoid dependency.

## Remaining advisory exposure review

| Package/group | Recorded consumer paths | Decision / next validation |
|---|---|---|
| brace-expansion, minimatch, picomatch, glob | Expo/Metro/fingerprint, Native codegen, test-exclude, file watchers | Multiple incompatible major versions remain. Do not force a single replacement across them. Check scoped security resolution with the supported package manager and exact Native/Web export before upgrades. No production request-facing glob service is declared by the application. |
| js-yaml | Expo xcpretty and Istanbul configuration | Preserve 3.x/4.x APIs; reviewed same-major fixes remain necessary. Never accept untrusted YAML as build configuration. |
| postcss | Expo Metro `~8.4.32` and Tailwind `^8.4.47` | Expo's old range prevents a common patched 8.5 version. A deliberate Metro compatibility update/export is needed; no arbitrary major/range override was added. |
| image-size | Metro image processing | Fixed release changes the supported major/API; requires explicit Metro asset-pipeline compatibility. Do not treat package audit as proof of application upload exposure. |
| ws | React Native dev middleware, Expo CLI, Metro and React Devtools (6.x/7.x/8.x) | Upgrade matching majors without collapsing them. The static Web deployment does not run a Metro/Node WebSocket server. Native/dev tools still need maintenance. |
| uuid | xcode | Advisory concerns caller-supplied buffers in particular UUID variants; Native build-tool exposure must be checked before signed builds. No automatic major upgrade. |
| deepmerge | Expo configuration, prebuild and Ultracite | Low-severity record; retain pending compatible fix/exposure review. |
| decode-uri-component | query-string | Runtime backport implemented and regression-tested, but fresh frozen installation/export must prove the patch applies in CI. |

These are dependency-path and code-scope findings, not a penetration test or a blanket declaration that all remaining records are unexploitable. Remaining high records and compatibility decisions stay visible in the launch hardening backlog. No real malformed requests, archives or commands were sent to external services; regression fixtures stayed local and bounded.
