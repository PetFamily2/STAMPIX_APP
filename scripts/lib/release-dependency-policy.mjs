// Exact security transitions reviewed in DEPENDENCY_HARDENING_20261112.md.
// This is not a general version-range exception or permission to change Native SDKs.
const reviewedSecurityTransitions = new Map([
  ['@auth/core', ['^0.37.0', '0.41.3']],
  ['@convex-dev/auth', ['^0.0.90', '0.0.98']],
]);

export function assertPreservedDependencies(before, after) {
  for (const [name, version] of Object.entries(before)) {
    if (after[name] === version) {
      continue;
    }
    const reviewed = reviewedSecurityTransitions.get(name);
    if (reviewed?.[0] === version && reviewed[1] === after[name]) {
      continue;
    }
    throw new Error(`Existing Native dependency changed: ${name}`);
  }
}
