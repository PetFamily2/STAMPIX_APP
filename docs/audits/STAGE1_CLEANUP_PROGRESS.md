# Stage 1 cleanup — initial verification

Base: integration/release-hardening-20261111 at 3daa7e8. This is an initial review, not a complete repository inventory or release approval.

| Candidate | Classification | Evidence and disposition |
| --- | --- | --- |
| `convex/businessDeletion.ts` and `convex/lib/billing/deletionSafety.ts` | Active | Existing guard checks canonical billing and pending checkout evidence, fails closed, and rechecks during each deletion batch. Retain; local deletion tests cover SUMIT active and uncertain states. No real business was deleted. |
| `convex/debug.ts`, `convex/seed.ts` | Active internal tooling | Current exported functions are internal mutations. Retain pending complete call-chain and deployment exposure review. |
| `scripts/lib/phase3c1-preview-guard.mjs` | Active | Imported by current shared Web deploy and covered by tests; retain. Historical and archived document paths both remain recognized. |
| `scripts/reuse-existing-preview-providers.mjs` | Historical, unresolved | Retain pending verification of external operator use and retirement of the whole dependent workflow. No execution authorized. |
| `scripts/phase3-preview/` | Historical, dependencies active | Guard module is shared by current deployment tooling; assess files individually before removing anything. |
| `metro.config.js`, `metro.config.cjs` | Active compatibility pair | The latter delegates to the former. Retain until actual Native and Web bundle checks justify removal. |
| `lib/services/scanService.ts` | Removed legacy | Tracked source, routes, scripts and configuration contain no references to the module or its path. It was not a package entry point. Its unused local event attributed staff actions to the customer; authoritative scanners remain unchanged. Builds and tests remain required. |
| `docs/archive/legacy-development/` | Archived | Six documents already archived on integration; preserve legacy allowlist names as they refer to historical Git revisions. |

Open: complete route, dependency, workflow and documentation inventory; validate all critical UI flows and Native/Web bundles; resolve or document CI failures. Do not regard this draft as completion of stage 1.

PR #14 comparison: the seven removed artifacts are already absent and all six archived documents and archive README already exist on the integration base. The existing audit and handoff are present. No blind merge or repeated deletion was needed.
