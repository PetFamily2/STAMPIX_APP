export const PREVIEW_NAME = 'stampaix-pwa-phase3-e2e';
export const PHASE3_BRANCH = 'pwa/phase-3-scanner-commands-20261005';
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
    authorized.adminKey !== claim.adminKey ||
    typeof claim.adminKey !== 'string' ||
    !claim.adminKey.startsWith(`preview:${name}|`) ||
    claim.adminKey.split('|').length !== 2 ||
    !claim.adminKey.split('|')[1] ||
    /\s/.test(claim.adminKey)
  )
    throw new Error('PREVIEW_TARGET_NOT_PROVEN');
  return { name, url: claim.instanceUrl, key: claim.adminKey };
}
export function requireActionsRevision(env, head, version) {
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_REPOSITORY !== 'PetFamily2/STAMPIX_APP' ||
    env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    env.GITHUB_REF !== `refs/heads/${PHASE3_BRANCH}` ||
    !/^[a-f0-9]{40}$/.test(env.VERIFIED_HEAD_SHA ?? '') ||
    env.VERIFIED_HEAD_SHA !== head ||
    env.GITHUB_SHA !== head ||
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
