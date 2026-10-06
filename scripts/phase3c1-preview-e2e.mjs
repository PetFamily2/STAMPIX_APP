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
import {
  PREVIEW_NAME,
  previewPublicEnvironment,
  requireActionsRevision,
  requirePreviewTarget,
  requireProjectPreviewKey,
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
  report.sha = sha;
  report.previewName = PREVIEW_NAME;
  report.sdkVersion = '1.31.5';
  report.projectKeyRecognizedByPinnedSdk = true;
  // This is exactly the claim used by deployPreview in Convex 1.31.5, rather than a newer CLI/API.
  stage('CREATE_PREVIEW');
  const claim = await management('claim_preview_deployment', {
    projectSelection,
    identifier: PREVIEW_NAME,
  });
  const authorized = await management('deployment/authorize_preview', {
    projectSelection,
    previewName: PREVIEW_NAME,
  });
  target = requirePreviewTarget(claim, authorized);
  report.deploymentName = target.name;
  report.backendUrl = target.url;
  report.deploymentType = authorized.deploymentType;
  report.targetProof =
    'MANAGEMENT_AUTHORIZE_PREVIEW_AND_EXACT_CONCRETE_PREVIEW_KEY_URL';
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
  const { privateKey, publicKey } = await generateKeyPair('RS256', {
    extractable: true,
  });
  const jwk = await exportJWK(publicKey);
  const secret = randomBytes(32).toString('base64url');
  const changes = inherited
    .filter((e) => !['CONVEX_CLOUD_URL', 'CONVEX_SITE_URL'].includes(e.name))
    .map((e) => ({ name: e.name }));
  const values = {
    JWT_PRIVATE_KEY: await exportPKCS8(privateKey),
    JWKS: JSON.stringify({ keys: [{ ...jwk, use: 'sig', alg: 'RS256' }] }),
    SCAN_TOKEN_SECRET: randomBytes(32).toString('base64url'),
    SCAN_TOKEN_KID: 'phase3-preview',
    STAMPAIX_ENV: 'preview',
    AUTH_LOG_LEVEL: 'ERROR',
    SITE_URL: target.url.replace('.cloud', '.site'),
    PHASE3_PREVIEW_NAME: PREVIEW_NAME,
    PHASE3_PREVIEW_URL: target.url,
    PHASE3_FIXTURE_SECRET: secret,
  };
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
    freshAuthAndQrKeys: true,
    externalProviderCredentialsCopied: false,
    sourceDataImported: false,
  };

  stage('STAGE_VERIFIED_BACKEND');
  const dir = mkdtempSync(join(tmpdir(), 'stampaix-phase3-preview-'));
  chmodSync(dir, 0o700);
  const archive = execFileSync('git', ['archive', sha], {
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
  const code = String(error?.message ?? '');
  report.failureCode = /^[A-Z][A-Z0-9_]{3,100}$/.test(code)
    ? code
    : 'PRIVATE_ERROR_DETAILS_WITHHELD';
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
