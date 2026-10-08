export const PREVIEW_NAME = 'stampaix-pwa-phase3-e2e';
export const SOURCE_SHA = 'acde88e1980c7cdc20519eab01e85e8c17f29f6e';
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
  'docs/PREVIEW_GOOGLE_AUTH.md',
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
export function requireAuthorizedPreviewTarget(authorized) {
  const name = authorized?.deploymentName;
  if (
    authorized?.deploymentType !== 'preview' ||
    authorized?.reference !== `preview/${PREVIEW_NAME}` ||
    typeof name !== 'string' ||
    !slug.test(name) ||
    denied.has(name) ||
    authorized.url !== `https://${name}.convex.cloud` ||
    typeof authorized.adminKey !== 'string' ||
    authorized.adminKey.length < 16 ||
    authorized.adminKey.length > 4096 ||
    /\s/.test(authorized.adminKey)
  )
    throw new Error('PREVIEW_TARGET_NOT_PROVEN');
  return { name, url: authorized.url, key: authorized.adminKey };
}

export async function selectPreviewDeployment(management, projectSelection) {
  const body = { projectSelection, previewName: PREVIEW_NAME };
  let authorized;
  try {
    authorized = await management('deployment/authorize_preview', body);
  } catch (error) {
    // Never replace an existing target on a transient/authentication/unknown error.
    if (error?.message !== 'PREVIEW_MANAGEMENT_HTTP_404') throw error;
    const claim = await management('claim_preview_deployment', {
      projectSelection,
      identifier: PREVIEW_NAME,
    });
    authorized = await management('deployment/authorize_preview', body);
    return {
      claim,
      authorized,
      reused: false,
      target: requirePreviewTarget(claim, authorized),
    };
  }
  return {
    claim: null,
    authorized,
    reused: true,
    target: requireAuthorizedPreviewTarget(authorized),
  };
}
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
    EXPO_PUBLIC_MANUAL_QA_ENABLED: 'true',
    EXPO_PUBLIC_MANUAL_QA_PREVIEW_URL: target.url,
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

// Diagnostic evidence only. Never return IDs, field values, emails or row payloads.
export function summarizeSyntheticResetScope(tables) {
  const users = tables.get('users') ?? [];
  const businesses = tables.get('businesses') ?? [];
  const allowedEmails = new Set([
    'phase3-owner@example.invalid',
    'phase3-staff@example.invalid',
    'phase3-customer@example.invalid',
    'phase3-manager@example.invalid',
    'phase3-deletion@example.invalid',
  ]);
  const actors = new Set(users.map((user) => user._id));
  const scopes = new Set(businesses.map((business) => business._id));
  const actorFields = [
    'userId',
    'actorId',
    'customerId',
    'actorUserId',
    'ownerUserId',
    'recipientUserId',
    'referrerUserId',
    'referredUserId',
    'toUserId',
  ];
  const unknownActors = Object.fromEntries(
    actorFields.map((field) => [field, 0])
  );
  let unknownBusinessScopes = 0;
  for (const rows of tables.values()) {
    for (const row of rows) {
      if (row.businessId !== undefined && !scopes.has(row.businessId)) {
        unknownBusinessScopes++;
      }
      for (const field of actorFields) {
        if (row[field] !== undefined && !actors.has(row[field])) {
          unknownActors[field]++;
        }
      }
    }
  }
  return {
    actorCount: users.length,
    nonSyntheticActorCount: users.filter(
      (user) => !allowedEmails.has(user.email)
    ).length,
    businessCount: businesses.length,
    nonSyntheticBusinessCount: businesses.filter(
      (business) =>
        !['phase3-primary', 'phase3-secondary'].includes(business.externalId) ||
        !actors.has(business.ownerUserId)
    ).length,
    unknownBusinessScopes,
    unknownActors,
    oversizedTableCount: [...tables.values()].filter(
      (rows) => rows.length > 200
    ).length,
    totalRows: [...tables.values()].reduce(
      (count, rows) => count + rows.length,
      0
    ),
  };
}
export function sanitizedPreviewFailure(error) {
  const text = String(error?.message ?? '');
  if (/^[A-Z][A-Z0-9_]{3,100}$/.test(text)) {
    return text;
  }
  const known = [
    'SYNTHETIC_RESET_LIMIT',
    'RESET_NON_SYNTHETIC_ACTOR',
    'RESET_NON_SYNTHETIC_BUSINESS',
    'RESET_UNKNOWN_BUSINESS_SCOPE',
    'RESET_UNKNOWN_ACTOR_SCOPE',
    'PREVIEW_FIXTURES_DISABLED',
  ];
  const matches = known.filter((code) =>
    new RegExp(`\\b${code}\\b`).test(text)
  );
  return matches.length === 1 ? matches[0] : 'PRIVATE_ERROR_DETAILS_WITHHELD';
}

// Cloud QA may restart a stalled fake camera through the real UI only before
// any decode/resolve/write. This cannot authorize retrying a scanner command.
export function canRestartSyntheticCamera(evidence) {
  return (
    evidence.phase === 'CAMERA_READY' &&
    evidence.videoDetached === true &&
    evidence.cameraError === true &&
    evidence.decodeWaiting === true &&
    evidence.currentResolveCount === evidence.beforeResolveCount &&
    evidence.currentWriteCount === evidence.beforeWriteCount
  );
}

// At most one ordinary retry of a document GET. Never applies to API commands,
// authorization failures, app runtime failures or unknown response statuses.
export function documentReadRetryDelay(status, retryAfter, now = Date.now()) {
  if (![429, 502, 503, 504].includes(status)) return null;
  if (retryAfter === null || retryAfter === '')
    return status === 429 ? 15000 : 3000;
  const delay = /^\d+$/.test(retryAfter)
    ? Number(retryAfter) * 1000
    : Date.parse(retryAfter) - now;
  return Number.isFinite(delay) && delay >= 0 && delay <= 30000 ? delay : null;
}

// CI-only blank media, without QR or identities. Chromium supplies this fixture
// as its fake webcam; application MediaDevices, lifecycle and worker stay real.
export function syntheticCameraY4m() {
  const width = 320;
  const height = 240;
  const count = 20;
  const chunks = [Buffer.from('YUV4MPEG2 W320 H240 F10:1 Ip A1:1 C420jpeg\n')];
  for (let frame = 0; frame < count; frame++) {
    chunks.push(
      Buffer.from('FRAME\n'),
      Buffer.alloc(width * height, 64 + frame),
      Buffer.alloc((width * height) / 2, 128)
    );
  }
  return Buffer.concat(chunks);
}

// CI document reads are paced like navigation, never business-command retries.
export function hostedDocumentPause(previousAt, now = Date.now()) {
  if (previousAt == null) return 0;
  if (
    !Number.isFinite(previousAt) ||
    !Number.isFinite(now) ||
    previousAt < 0 ||
    now < 0
  )
    throw new Error('INVALID_DOCUMENT_READ_CLOCK');
  return Math.max(0, 2000 - Math.max(0, now - previousAt));
}
