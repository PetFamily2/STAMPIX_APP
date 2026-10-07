export const PREVIEW_NAME = 'stampaix-pwa-phase3-e2e';
export const SOURCE_SHA = 'f4149560b46571af0698a045f7c4ed390cbb9c52';
export const CONTROL_PATHS = new Set([
  '.github/workflows/branch-verify.yml',
  '.github/workflows/business-web-preview-deploy.yml',
  'scripts/phase3c1-preview-e2e.mjs',
  'scripts/lib/phase3c1-preview-guard.mjs',
  'scripts/phase3-preview/fixtures.ts.template',
  'scripts/phase3-preview/report-hosting.mjs',
  'scripts/phase3-preview/live-e2e.mjs',
  'scripts/verify-web-phase3-boundaries.mjs',
  'lib/__tests__/phase3c1PreviewGuard.test.js',
  'docs/PWA_RELEASE_CANDIDATE.md',
  'scripts/phase3-preview/hosted-qa.mjs',
  'scripts/phase3-preview/install-qa.mjs',
]);
export function requireControlDelta(paths) {
  if (!paths.length || paths.some((path) => !CONTROL_PATHS.has(path)))
    throw new Error('APP_SOURCE_DELTA_NOT_AUTHORIZED');
}
export const PHASE3_BRANCH = 'pwa/phase-3-scanner-commands-20261005';
// An operator must explicitly bind a dedicated Google test client to this exact
// owned Preview. Unmarked inherited/provider credentials are never copied.
export function approvedPreviewGoogleEnvironment(previous, target, owned) {
  const binding = previous.PHASE3_GOOGLE_AUTH_PREVIEW_URL;
  if (!binding) return {};
  if (!owned || binding !== target.url)
    throw new Error('GOOGLE_AUTH_PREVIEW_BINDING_MISMATCH');
  if (
    !/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(
      previous.AUTH_GOOGLE_ID ?? ''
    ) ||
    typeof previous.AUTH_GOOGLE_SECRET !== 'string' ||
    !previous.AUTH_GOOGLE_SECRET ||
    previous.AUTH_GOOGLE_SECRET !== previous.AUTH_GOOGLE_SECRET.trim() ||
    /^(undefined|null|placeholder)$/i.test(previous.AUTH_GOOGLE_SECRET)
  )
    throw new Error('GOOGLE_AUTH_PREVIEW_CONFIGURATION_INVALID');
  return {
    PHASE3_GOOGLE_AUTH_PREVIEW_URL: binding,
    AUTH_GOOGLE_ID: previous.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: previous.AUTH_GOOGLE_SECRET,
  };
}
const denied = new Set(['utmost-fennec-280', 'aware-llama-850']);
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function requireProjectPreviewKey(key) {
  if (
    typeof key !== 'string' ||
    !/^preview:[^:|]+:[^:|]+\|/.test(key) ||
    /\s/.test(key)
  )
    throw new Error('PROJECT_PREVIEW_KEY_REQUIRED');
  const parts = key.split('|');
  const prefix = parts[0].split(':');
  if (
    parts.length !== 2 ||
    !parts[1] ||
    !slug.test(prefix[1]) ||
    !slug.test(prefix[2])
  )
    throw new Error('PROJECT_PREVIEW_KEY_REQUIRED');
  return {
    kind: 'teamAndProjectSlugs',
    teamSlug: prefix[1],
    projectSlug: prefix[2],
  };
}
export function requirePreviewTarget(claim, authorized) {
  const name = claim?.deploymentName;
  if (
    typeof name !== 'string' ||
    !slug.test(name) ||
    denied.has(name) ||
    claim.instanceUrl !== `https://${name}.convex.cloud` ||
    authorized?.deploymentType !== 'preview' ||
    authorized.deploymentName !== name ||
    authorized.url !== claim.instanceUrl ||
    typeof authorized.adminKey !== 'string' ||
    authorized.adminKey.length < 16 ||
    authorized.adminKey.length > 4096 ||
    /\s/.test(authorized.adminKey) ||
    typeof claim.adminKey !== 'string' ||
    claim.adminKey.length < 16 ||
    claim.adminKey.length > 4096 ||
    /\s/.test(claim.adminKey)
  )
    throw new Error('PREVIEW_TARGET_NOT_PROVEN');
  return { name, url: claim.instanceUrl, key: claim.adminKey };
}
export function requireActionsRevision(env, head, version) {
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_REPOSITORY !== 'PetFamily2/STAMPIX_APP' ||
    env.GITHUB_EVENT_NAME !== 'pull_request' ||
    env.GITHUB_HEAD_REF !== PHASE3_BRANCH ||
    env.PHASE3_SOURCE_SHA !== SOURCE_SHA ||
    env.PHASE3_PR_HEAD !== head ||
    !/^[a-f0-9]{40}$/.test(env.VERIFIED_HEAD_SHA ?? '') ||
    env.VERIFIED_HEAD_SHA !== head ||
    env.PHASE3_PREVIEW_NAME !== PREVIEW_NAME ||
    version !== '1.31.5'
  )
    throw new Error('UNVERIFIED_PREVIEW_RUN');
}
export function previewPublicEnvironment(_pulled, target, actors, businesses) {
  // This synthetic Preview uses an explicit client allowlist, never inherited service credentials.
  const result = {
    EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED: 'false',
    EXPO_PUBLIC_MOCK_PAYMENTS: 'false',
  };
  result.EXPO_PUBLIC_APP_ENV = 'preview';
  result.EXPO_PUBLIC_CONVEX_URL_DEV = target.url;
  result.EXPO_PUBLIC_CONVEX_URL = target.url;
  // Remove real service endpoints/credentials from this synthetic-only export.
  for (const key of Object.keys(result)) {
    if (
      /PROD|RC_|REVENUECAT|SENTRY|POSTHOG|AMPLITUDE|MIXPANEL|ANALYTICS/.test(
        key
      )
    )
      delete result[key];
  }
  Object.assign(result, {
    EXPO_PUBLIC_PWA_ENABLED: 'true',
    EXPO_PUBLIC_SCANNER_RECEIPTS: 'true',
    EXPO_PUBLIC_WEB_ROLE_ROUTING: 'true',
    EXPO_PUBLIC_WEB_QR_LAB: 'false',
    EXPO_PUBLIC_WEB_SCANNER_COMMANDS: 'true',
    EXPO_PUBLIC_WEB_SCANNER_BACKEND: 'verified-preview',
    EXPO_PUBLIC_WEB_SCANNER_PREVIEW_URL: target.url,
    EXPO_PUBLIC_WEB_SCANNER_TEST_ACTORS: actors.join(','),
    EXPO_PUBLIC_WEB_SCANNER_TEST_BUSINESSES: businesses.join(','),
  });
  return result;
}
