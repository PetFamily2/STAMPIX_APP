import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import webpush from 'web-push';
import {
  approvedPreviewGoogleEnvironment,
  PREVIEW_NAME,
  previewPublicEnvironment,
  requireActionsRevision,
  requireControlDelta,
  requireProjectPreviewKey,
  SOURCE_SHA,
  sanitizedPreviewFailure,
  selectPreviewDeployment,
  summarizeSyntheticResetScope,
} from './lib/phase3c1-preview-guard.mjs';
import { liveE2e } from './phase3-preview/live-e2e.mjs';

const report = {
  phase: '3C-1C',
  status: 'BLOCKED',
  deployed: false,
  seedCompleted: false,
  commandsEnabled: false,
  productionTouched: false,
  devTouched: false,
  schemaSourceChanged: true,
  schemaChange: 'additive-receipts-and-web-push-only',
  nativeChanged: true,
  nativeChange: 'command-safety-only-camera-preserved',
  stage: 'LOCAL_GUARDS',
};
const stage = (name) => {
  report.stage = name;
  writeFileSync(
    'phase3c1-preview-evidence.json',
    JSON.stringify(report, null, 2)
  );
  // biome-ignore lint/suspicious/noConsole: fixed stage names only, never remote payloads.
  console.log(`Phase 3 Preview: ${name}`);
};
const fail = (code) => {
  throw new Error(code);
};
const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const projectKey = process.env.CONVEX_DEPLOY_KEY;
let target;
async function management(path, body) {
  if (
    !['claim_preview_deployment', 'deployment/authorize_preview'].includes(path)
  )
    fail('MANAGEMENT_PATH_DENIED');
  const res = await fetch(`https://api.convex.dev/api/${path}`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
    headers: {
      Authorization: `Bearer ${projectKey}`,
      'Content-Type': 'application/json',
      'Convex-Client': 'npm-cli-1.31.5',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) fail(`PREVIEW_MANAGEMENT_HTTP_${res.status}`);
  return res.json();
}
async function deploymentRpc(path, body) {
  if (path !== '/api/update_environment_variables' || !target)
    fail('PREVIEW_RPC_DENIED');
  const res = await fetch(`${target.url}${path}`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
    headers: {
      Authorization: `Convex ${target.key}`,
      'Content-Type': 'application/json',
      'Convex-Client': 'npm-cli-1.31.5',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) fail(`PREVIEW_ENV_HTTP_${res.status}`);
}
try {
  const sha = git('rev-parse', 'HEAD');
  requireActionsRevision(
    process.env,
    sha,
    JSON.parse(readFileSync('node_modules/convex/package.json')).version
  );
  git('merge-base', '--is-ancestor', SOURCE_SHA, sha);
  requireControlDelta(
    git('diff', '--name-only', SOURCE_SHA, sha).split('\n').filter(Boolean)
  );
  const projectSelection = requireProjectPreviewKey(projectKey);
  if (
    process.env.CONVEX_DEV_DEPLOY_KEY ||
    process.env.CONVEX_DEPLOYMENT ||
    process.env.CONVEX_OVERRIDE_ACCESS_TOKEN
  )
    fail('UNEXPECTED_DEPLOYMENT_CREDENTIAL');
  if (git('status', '--porcelain')) fail('CHECKOUT_NOT_CLEAN');
  execFileSync('node', ['scripts/verify-web-phase3-boundaries.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const keyRecognition = spawnSync(
    'node',
    [
      'node_modules/convex/bin/main.js',
      'deploy',
      '--dry-run',
      '--preview-create',
      PREVIEW_NAME,
      '--yes',
      '--typecheck',
      'disable',
      '--codegen',
      'disable',
    ],
    {
      env: { ...process.env, CONVEX_DEPLOY_KEY: projectKey },
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  if (
    keyRecognition.status !== 0 ||
    !`${keyRecognition.stdout}${keyRecognition.stderr}`.includes(
      'Would have claimed preview deployment'
    )
  )
    fail('PINNED_CLI_DID_NOT_RECOGNIZE_PREVIEW_KEY');
  report.sha = SOURCE_SHA;
  report.controlSha = sha;
  report.previewName = PREVIEW_NAME;
  report.sdkVersion = '1.31.5';
  report.projectKeyRecognizedByPinnedSdk = true;
  stage('AUTHORIZE_FIXED_PREVIEW');
  // Reusing the authorized named Preview keeps Google's registered callback stable.
  // Creation occurs only after an authoritative not-found response, never an auth failure.
  const {
    claim,
    authorized,
    reused,
    target: selectedTarget,
  } = await selectPreviewDeployment(management, projectSelection);
  report.previewReused = reused;
  report.targetDiagnostics = {
    claimFields: Object.keys(claim ?? {}).filter((k) =>
      /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)
    ),
    authorizationFields: Object.keys(authorized ?? {}).filter((k) =>
      /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)
    ),
    claimNameCanonical:
      typeof claim?.deploymentName === 'string' &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(claim.deploymentName),
    claimUrlMatchesName:
      claim?.instanceUrl === `https://${claim?.deploymentName}.convex.cloud`,
    authorizationTypePreview: authorized?.deploymentType === 'preview',
    authorizationReference:
      typeof authorized?.reference === 'string' &&
      /^[A-Za-z0-9/_-]{1,150}$/.test(authorized.reference)
        ? authorized.reference
        : null,
    authorizationNameMatches:
      authorized?.deploymentName === claim?.deploymentName,
    authorizationUrlMatches: authorized?.url === claim?.instanceUrl,
    claimKeyPreviewScope:
      typeof claim?.adminKey === 'string' &&
      claim.adminKey.startsWith(`preview:${claim?.deploymentName}|`),
    authorizationKeyPreviewScope:
      typeof authorized?.adminKey === 'string' &&
      authorized.adminKey.startsWith(`preview:${claim?.deploymentName}|`),
  };
  target = selectedTarget;
  report.deploymentName = target.name;
  report.backendUrl = target.url;
  report.deploymentType = authorized.deploymentType;
  report.targetProof =
    'PROJECT_PREVIEW_KEY_AUTHORIZED_PREVIEW_TYPE_EXACT_URL_AND_ADMIN_READ';
  const admin = new ConvexHttpClient(target.url, { logger: false });
  admin.setAdminAuth(target.key); // Administration only; never a scanner actor or auth impersonation.

  stage('ISOLATED_ENVIRONMENT');
  const inherited = await admin.query(
    makeFunctionReference('_system/cli/queryEnvironmentVariables'),
    {}
  );
  if (
    !Array.isArray(inherited) ||
    inherited.some((e) => typeof e?.name !== 'string')
  )
    fail('ENVIRONMENT_SHAPE_UNKNOWN');
  report.derivedAdminReadVerified = true;
  const previous = Object.fromEntries(inherited.map((e) => [e.name, e.value]));
  const owned =
    previous.PHASE3_PREVIEW_NAME === PREVIEW_NAME &&
    previous.PHASE3_PREVIEW_URL === target.url &&
    typeof previous.PHASE3_FIXTURE_SECRET === 'string' &&
    previous.PHASE3_FIXTURE_SECRET.length >= 32;
  // Read the pinned SDK's paginated system endpoints before any mutation of a reused target.
  let cursor = null,
    hasData = false;
  const resetAuditTables = new Map();
  for (let page = 0; page < 10; page++) {
    const tables = await admin.query(
      makeFunctionReference('_system/cli/tables'),
      { paginationOpts: { cursor, numItems: 100 } }
    );
    if (!Array.isArray(tables?.page) || typeof tables.isDone !== 'boolean')
      fail('TABLE_METADATA_SHAPE_UNKNOWN');
    for (const table of tables.page) {
      if (typeof table.name !== 'string') fail('TABLE_METADATA_SHAPE_UNKNOWN');
      const rows = await admin.query(
        makeFunctionReference('_system/cli/tableData'),
        {
          table: table.name,
          order: 'asc',
          paginationOpts: { cursor: null, numItems: 201 },
        }
      );
      if (!Array.isArray(rows?.page)) fail('TABLE_DATA_SHAPE_UNKNOWN');
      hasData ||= rows.page.length > 0;
      resetAuditTables.set(table.name, rows.page);
    }
    if (tables.isDone) break;
    if (page === 9 || typeof tables.continueCursor !== 'string')
      fail('TABLE_AUDIT_LIMIT');
    cursor = tables.continueCursor;
  }
  report.syntheticResetAudit = summarizeSyntheticResetScope(resetAuditTables);
  resetAuditTables.clear();
  if (hasData && !owned) fail('NONEMPTY_PREVIEW_NOT_PROVEN_SYNTHETIC');
  let values;
  if (owned) {
    for (const key of [
      'JWT_PRIVATE_KEY',
      'JWKS',
      'SCAN_TOKEN_SECRET',
      'SCAN_TOKEN_KID',
    ])
      if (typeof previous[key] !== 'string' || !previous[key])
        fail('OWNED_PREVIEW_KEYS_MISSING');
    values = Object.fromEntries(
      ['JWT_PRIVATE_KEY', 'JWKS', 'SCAN_TOKEN_SECRET', 'SCAN_TOKEN_KID'].map(
        (key) => [key, previous[key]]
      )
    );
  } else {
    const { privateKey, publicKey } = await generateKeyPair('RS256', {
      extractable: true,
    });
    const jwk = await exportJWK(publicKey);
    values = {
      JWT_PRIVATE_KEY: await exportPKCS8(privateKey),
      JWKS: JSON.stringify({ keys: [{ ...jwk, use: 'sig', alg: 'RS256' }] }),
      SCAN_TOKEN_SECRET: randomBytes(32).toString('base64url'),
      SCAN_TOKEN_KID: 'phase3-preview',
    };
  }
  const secret = owned
    ? previous.PHASE3_FIXTURE_SECRET
    : randomBytes(32).toString('base64url');
  Object.assign(
    values,
    approvedPreviewGoogleEnvironment(previous, target, owned)
  );
  // New dedicated Preview-only encryption key, or retain the existing owned key.
  // OAuth token capture/revocation must never fail after a successful provider login.
  values.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY =
    owned && previous.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY
      ? previous.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY
      : randomBytes(32).toString('base64url');
  const vapid =
    previous.WEB_PUSH_VAPID_PUBLIC_KEY && previous.WEB_PUSH_VAPID_PRIVATE_KEY
      ? {
          publicKey: previous.WEB_PUSH_VAPID_PUBLIC_KEY,
          privateKey: previous.WEB_PUSH_VAPID_PRIVATE_KEY,
        }
      : webpush.generateVAPIDKeys();
  report.externalProviders = Object.fromEntries(
    [
      'RESEND_API_KEY',
      'RESEND_FROM_EMAIL',
      'AUTH_GOOGLE_ID',
      'AUTH_GOOGLE_SECRET',
      'AUTH_APPLE_ID',
      'AUTH_APPLE_SECRET',
    ].map((name) => [name, Boolean(previous[name])])
  );
  report.googlePreviewConfigurationPreserved = Boolean(values.AUTH_GOOGLE_ID);
  const easPreview = parseEnv(readFileSync('.env.preview-pulled', 'utf8'));
  report.easPreviewGoogleConfiguration = {
    clientIdPresent: Boolean(easPreview.AUTH_GOOGLE_ID),
    clientSecretPresent: Boolean(easPreview.AUTH_GOOGLE_SECRET),
    copied: false,
  };
  Object.assign(values, {
    WEB_PUSH_ENABLED: 'true',
    WEB_PUSH_VAPID_PUBLIC_KEY: vapid.publicKey,
    WEB_PUSH_VAPID_PRIVATE_KEY: vapid.privateKey,
    WEB_PUSH_VAPID_SUBJECT: 'https://stampaix.com',
    STAMPAIX_ENV: 'preview',
    AUTH_LOG_LEVEL: 'ERROR',
    SITE_URL: target.url.replace('.cloud', '.site'),
    PHASE3_PREVIEW_NAME: PREVIEW_NAME,
    PHASE3_PREVIEW_URL: target.url,
    PHASE3_FIXTURE_SECRET: secret,
  });
  const changes = inherited
    .filter((e) => !['CONVEX_CLOUD_URL', 'CONVEX_SITE_URL'].includes(e.name))
    .map((e) => ({ name: e.name }));
  // De-duplicate names: replacements set only the fresh isolated values, all other custom variables removed.
  const replacements = new Set(Object.keys(values));
  await deploymentRpc('/api/update_environment_variables', {
    changes: [
      ...changes.filter((e) => !replacements.has(e.name)),
      ...Object.entries(values).map(([name, value]) => ({ name, value })),
    ],
  });
  const effective = await admin.query(
    makeFunctionReference('_system/cli/queryEnvironmentVariables'),
    {}
  );
  if (
    !Array.isArray(effective) ||
    effective.some(
      (e) =>
        !replacements.has(e.name) &&
        !['CONVEX_CLOUD_URL', 'CONVEX_SITE_URL'].includes(e.name)
    ) ||
    Object.entries(values).some(
      ([k, v]) => !effective.some((e) => e.name === k && e.value === v)
    )
  )
    fail('PREVIEW_ENV_NOT_ISOLATED');
  report.environment = {
    inheritedCustomVariablesRemoved: true,
    freshAuthAndQrKeys: !owned,
    existingSyntheticKeysPreserved: owned,
    externalProviderCredentialsCopied: false,
    sourceDataImported: false,
  };

  stage('STAGE_VERIFIED_BACKEND');
  const dir = mkdtempSync(join(tmpdir(), 'stampaix-phase3-preview-'));
  chmodSync(dir, 0o700);
  const archive = execFileSync('git', ['archive', SOURCE_SHA], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const unpack = spawnSync('tar', ['-x', '-C', dir], {
    input: archive,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (unpack.status !== 0) fail('PRIVATE_STAGE_FAILED');
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
  writeFileSync(
    join(dir, 'convex/phase3Fixtures.ts'),
    readFileSync('scripts/phase3-preview/fixtures.ts.template'),
    { mode: 0o600 }
  );
  // No .env from Work or EAS enters the backend staging checkout. Only exact Preview selectors.
  const cliEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) =>
        !/^(CONVEX_|EXPO_|PHASE3_|VERIFIED_|AUTH_|JWT_|SCAN_|JWKS|SITE_URL)/.test(
          k
        )
    )
  );
  cliEnv.CONVEX_DEPLOY_KEY = target.key;
  stage('TYPECHECK_STAGED_BACKEND');
  const typecheck = spawnSync(
    'node',
    [join(dir, 'node_modules/typescript/bin/tsc'), '--noEmit'],
    {
      cwd: dir,
      env: cliEnv,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  if (typecheck.status !== 0) fail('STAGED_BACKEND_TYPECHECK_FAILED');
  report.stagedTypecheck = true;
  stage('DEPLOY_PREVIEW');
  const deploy = spawnSync(
    'node',
    [
      join(dir, 'node_modules/convex/bin/main.js'),
      'deploy',
      '--url',
      target.url,
      '--admin-key',
      target.key,
      '--yes',
      '--typecheck',
      'disable',
      '--codegen',
      'disable',
    ],
    {
      cwd: dir,
      env: cliEnv,
      encoding: 'utf8',
      timeout: 600000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  // Never echo CLI output: it may contain environment values or admin keys.
  if (deploy.status !== 0) fail('PRIVATE_PREVIEW_DEPLOY_FAILED');
  report.deployed = true;
  report.deployedBackend = 'EXACT_VERIFIED_SHA_PLUS_INTERNAL_PREVIEW_FIXTURES';

  if (hasData) {
    stage('RESET_VERIFIED_SYNTHETIC_PREVIEW');
    const reset = await admin.mutation(
      makeFunctionReference('phase3Fixtures:reset'),
      { secret },
      { skipQueue: true }
    );
    if (reset?.syntheticOnly !== true || !Number.isSafeInteger(reset.deleted))
      fail('SYNTHETIC_RESET_NOT_CONFIRMED');
    report.syntheticReset = {
      verified: true,
      deleted: reset.deleted,
      existingKeysPreserved: true,
    };
  }
  stage('PROVE_EMPTY_APPLICATION_TABLES');
  if (
    (await admin.query(makeFunctionReference('phase3Fixtures:empty'), {
      secret,
    })) !== true
  )
    fail('PREVIEW_NOT_EMPTY_STOP_NO_SEED');
  report.emptyBeforeAuthAndSeed = true;
  const selectors = await liveE2e({ target, admin, secret, report, stage });
  report.seedCompleted = true;
  await admin.mutation(
    makeFunctionReference('phase3Fixtures:qaArrange'),
    { secret, fixtures: selectors.fixtures, kind: 'restore' },
    { skipQueue: true }
  );
  const privateQaPath = join(
    process.env.RUNNER_TEMP,
    'stampaix-rc-private.json'
  );
  writeFileSync(
    privateQaPath,
    JSON.stringify({
      target,
      secret,
      fixtures: selectors.fixtures,
      actors: Object.fromEntries(
        Object.entries(selectors.actors).map(([role, actor]) => [
          role,
          { id: actor.id, password: actor.password, tokens: actor.tokens },
        ])
      ),
    }),
    { mode: 0o600 }
  );
  stage('PREPARE_PUBLIC_WEB_ENVIRONMENT');
  const pulled = parseEnv(readFileSync('.env.preview-pulled', 'utf8'));
  const publicEnv = previewPublicEnvironment(
    pulled,
    target,
    selectors.actorIds,
    selectors.businessIds
  );
  // A narrowly selected public-only file. No EAS private env or Convex key is ever written into client env.
  writeFileSync(
    '.env.local',
    Object.entries(publicEnv)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join('\n') + '\n',
    { mode: 0o600 }
  );
  report.commandsEnabled = true;
  report.commandGuards = [
    'APP_ENV_PREVIEW',
    'EXACT_VERIFIED_PREVIEW_URL',
    'TEST_ACTOR_ALLOWLIST',
    'TEST_BUSINESS_ALLOWLIST',
  ];
  report.status = 'BACKEND_E2E_PASS_WEB_EXPORT_PENDING';
  stage('BACKEND_E2E_COMPLETE');
  admin.clearAuth();
} catch (error) {
  // Only our own fixed uppercase codes; never remote error text/stack/payload/QR/identity.
  report.failureCode = sanitizedPreviewFailure(error);
  report.status = 'BLOCKED';
  process.exitCode = 1;
} finally {
  writeFileSync(
    'phase3c1-preview-evidence.json',
    JSON.stringify(report, null, 2)
  );
  // biome-ignore lint/suspicious/noConsole: sanitized summary only.
  console.log(
    `Phase 3 Preview result: ${report.status}; stage: ${report.stage}; code: ${report.failureCode ?? 'NONE'}`
  );
}
