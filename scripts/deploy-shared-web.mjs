import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { requireProjectPreviewKey } from './lib/phase3c1-preview-guard.mjs';

const URL = 'https://utmost-fennec-280.convex.cloud';
const NAME = 'utmost-fennec-280';
const report = {
  status: 'RUNNING',
  backendUrl: URL,
  fixturesUsed: false,
  databaseCreated: false,
  dataImported: false,
  dataReset: false,
  productionTouched: false,
  credentialsCreated: false,
  paymentAttempted: false,
};
const fail = (code) => {
  throw new Error(code);
};
const run = (command, args, env = process.env, timeout = 180000) => {
  const result = spawnSync(command, args, {
    env,
    timeout,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const diagnostic = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const categories = {
      accessDenied:
        /unauthorized|authentication|unauthenticated|access denied|not authorized|invalid.*(?:key|token)|401|403/i,
      missingLogin: /not logged in|log in|login|authentication is required/i,
      unsupportedArgument:
        /unknown option|unknown argument|unexpected argument|unrecognized option/i,
      wrongDeployment:
        /deployment.*not found|does not exist|cannot find.*deployment|deployment.*mismatch/i,
      networkFailure:
        /fetch failed|ECONN|ENOTFOUND|timeout|timed out|network error/i,
      moduleFailure: /Cannot find module|Cannot find package|MODULE_NOT_FOUND/i,
      convexSelection:
        /CONVEX_DEPLOYMENT|CONVEX_DEPLOY_KEY|configure.*project/i,
    };
    report.cliFailure = {
      exitCode: result.status,
      spawnError: result.error?.code ?? null,
      categories: Object.entries(categories)
        .filter(([, pattern]) => pattern.test(diagnostic))
        .map(([name]) => name),
    };
    fail(`SHARED_${command.toUpperCase().replace(/[^A-Z]/g, '')}_FAILED`);
  }
  return result.stdout;
};
try {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  report.sourceSha = sha;
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REPOSITORY !== 'PetFamily2/STAMPIX_APP' ||
    process.env.GITHUB_HEAD_REF !== 'pwa/phase-3-scanner-commands-20261005' ||
    process.env.VERIFIED_HEAD_SHA !== sha
  )
    fail('SHARED_VERIFIED_REVISION_REQUIRED');
  report.stage = 'EXISTING_DEPLOY_ACCESS';
  // Existing deployment keys only; reject all keys scoped to another database.
  let key = [
    process.env.SHARED_CONVEX_DEV_KEY,
    process.env.SHARED_CONVEX_DEPLOY_KEY,
  ].find((value) => /^dev:utmost-fennec-280\|[^\s]+$/.test(value ?? ''));
  const privateDir = mkdtempSync(join(tmpdir(), 'stampaix-shared-'));
  chmodSync(privateDir, 0o700);
  if (!key) {
    for (const environment of ['preview', 'development']) {
      const path = join(privateDir, `${environment}.env`);
      const pulled = spawnSync(
        'eas',
        ['env:pull', environment, '--path', path, '--non-interactive'],
        { encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      if (pulled.status !== 0) continue;
      chmodSync(path, 0o600);
      const values = parseEnv(readFileSync(path, 'utf8'));
      key = [values.CONVEX_DEPLOY_KEY, values.CONVEX_DEV_DEPLOY_KEY].find(
        (value) => /^dev:utmost-fennec-280\|[^\s]+$/.test(value ?? '')
      );
      if (key) break;
    }
  }
  if (!key && process.env.EXISTING_PROJECT_KEY) {
    const projectSelection = requireProjectPreviewKey(
      process.env.EXISTING_PROJECT_KEY
    );
    // Select the existing deployment. This endpoint does not provision or mint a key.
    const response = await fetch(
      'https://api.convex.dev/api/deployment/authorize_within_current_project',
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(45000),
        headers: {
          Authorization: `Bearer ${process.env.EXISTING_PROJECT_KEY}`,
          'Content-Type': 'application/json',
          'Convex-Client': 'npm-cli-1.31.5',
        },
        body: JSON.stringify({
          projectSelection,
          selectedDeploymentName: NAME,
        }),
      }
    );
    if (response.ok) {
      const target = await response.json();
      if (
        target.url !== URL ||
        target.deploymentName !== NAME ||
        target.deploymentType !== 'dev'
      )
        fail('SHARED_TARGET_MISMATCH');
      key = target.adminKey;
    }
  }
  if (!key) fail('SHARED_EXISTING_DEV_DEPLOY_ACCESS_REQUIRED');
  report.stage = 'EXISTING_ENVIRONMENT_READ';
  const deploymentEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^(CONVEX_|EXPO_PUBLIC_)/.test(name)
    )
  );
  deploymentEnv.CONVEX_DEPLOY_KEY = key;
  const selectionPath = join(privateDir, 'existing-deployment.env');
  writeFileSync(selectionPath, `CONVEX_DEPLOY_KEY=${key}\n`, { mode: 0o600 });
  // System queries use the pinned CLI's WebSocket transport, not the public HTTP query endpoint.
  const environmentText = run(
    'node',
    [
      'node_modules/convex/bin/main.js',
      'env',
      'list',
      '--env-file',
      selectionPath,
    ],
    deploymentEnv
  );
  const existing = parseEnv(environmentText);
  if (existing.CONVEX_CLOUD_URL && existing.CONVEX_CLOUD_URL !== URL)
    fail('SHARED_TARGET_MISMATCH');
  if (
    existing.STAMPAIX_ENV &&
    !['dev', 'development'].includes(existing.STAMPAIX_ENV)
  )
    fail('SHARED_ENVIRONMENT_MISMATCH');
  if (
    !existing.JWT_PRIVATE_KEY ||
    !existing.JWKS ||
    !existing.SCAN_TOKEN_SECRET
  )
    fail('SHARED_EXISTING_SIGNING_CONFIGURATION_REQUIRED');
  const dataIds = async (table) => {
    const text = run(
      'node',
      [
        'node_modules/convex/bin/main.js',
        'data',
        table,
        '--limit',
        '2001',
        '--order',
        'asc',
        '--format',
        'json',
        '--env-file',
        selectionPath,
      ],
      deploymentEnv
    );
    const rows = text.trim() ? JSON.parse(text) : [];
    if (rows.length > 2000) fail('SHARED_DATA_VERIFICATION_LIMIT');
    return rows.map((row) => row._id);
  };
  report.stage = 'EXISTING_DATA_READ';
  const before = {};
  for (const table of ['users', 'memberships', 'events'])
    before[table] = await dataIds(table);
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !/^(CONVEX_|EXPO_PUBLIC_|SHARED_CONVEX_|EXISTING_PROJECT_KEY|AUTH_|JWT_|SCAN_|JWKS|SITE_URL)/.test(
          name
        )
    )
  );
  report.stage = 'BACKEND_DRY_RUN';
  // No new schema columns, imports, seed function, auth key or provider change.
  run(
    'node',
    [
      'node_modules/convex/bin/main.js',
      'deploy',
      '--url',
      URL,
      '--admin-key',
      key,
      '--yes',
      '--typecheck',
      'disable',
      '--codegen',
      'disable',
      '--dry-run',
    ],
    { ...clean, CONVEX_DEPLOY_KEY: key },
    600000
  );
  report.backendDryRun = 'PASS';
  report.stage = 'BACKEND_SYNC';
  run(
    'node',
    [
      'node_modules/convex/bin/main.js',
      'deploy',
      '--url',
      URL,
      '--admin-key',
      key,
      '--yes',
      '--typecheck',
      'disable',
      '--codegen',
      'disable',
    ],
    { ...clean, CONVEX_DEPLOY_KEY: key },
    600000
  );
  report.backendDeployed = true;
  report.stage = 'DATA_PRESERVATION';
  for (const [table, ids] of Object.entries(before)) {
    const after = new Set(await dataIds(table));
    if (ids.some((id) => !after.has(id))) fail('SHARED_EXISTING_DATA_MISSING');
  }
  report.existingRecordsPreserved = true;
  report.stage = 'AUTH_AVAILABILITY';
  report.auth = await new ConvexHttpClient(URL, { logger: false }).query(
    makeFunctionReference('webAuth:getProviderAvailability'),
    {}
  );
  const publicEnv = {
    EXPO_PUBLIC_APP_ENV: 'preview',
    EXPO_PUBLIC_CONVEX_URL: URL,
    EXPO_PUBLIC_CONVEX_URL_DEV: URL,
    EXPO_PUBLIC_STAMPAIX_SHARED_BACKEND: 'true',
    EXPO_PUBLIC_PWA_ENABLED: 'true',
    EXPO_PUBLIC_WEB_ROLE_ROUTING: 'true',
    EXPO_PUBLIC_MANUAL_QA_ENABLED: 'false',
    EXPO_PUBLIC_WEB_QR_LAB: 'false',
    EXPO_PUBLIC_SCANNER_RECEIPTS: 'true',
    EXPO_PUBLIC_WEB_SCANNER_COMMANDS: 'true',
    EXPO_PUBLIC_WEB_SCANNER_BACKEND: 'existing-shared',
    EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED: 'false',
    EXPO_PUBLIC_MOCK_PAYMENTS: 'false',
  };
  const clientEnv = { ...clean, ...publicEnv };
  writeFileSync(
    '.env.local',
    Object.entries(publicEnv)
      .map(([name, value]) => `${name}=${value}`)
      .join('\n') + '\n',
    { mode: 0o600 }
  );
  report.stage = 'WEB_EXPORT';
  run(
    'bunx',
    [
      'expo',
      'export',
      '--platform',
      'web',
      '--clear',
      '--output-dir',
      'dist',
      '--max-workers',
      '2',
    ],
    clientEnv,
    600000
  );
  run('bun', ['scripts/export-web-scanner-business.mjs', 'dist'], clientEnv);
  run('node', ['scripts/finalize-web-pwa-export.mjs', 'dist'], clientEnv);
  run('node', ['scripts/verify-client-secret-patterns.mjs', 'dist'], clientEnv);
  report.stage = 'WEB_HOSTING';
  const hosted = JSON.parse(
    run(
      'eas',
      [
        'deploy',
        '--environment',
        'preview',
        '--non-interactive',
        '--dev-domain',
        'stampaix-business',
        '--export-dir',
        'dist',
        '--json',
      ],
      clientEnv,
      240000
    )
  );
  const url = (Array.isArray(hosted) ? hosted : [hosted])
    .flatMap((r) => [
      r.url,
      r.deploymentUrl,
      r.previewUrl,
      r.deployment?.url,
      r.deployment?.previewUrl,
      r.metadata?.url,
    ])
    .find((value) =>
      /^https:\/\/stampaix-business--[a-z0-9]+\.expo\.app\/?$/.test(value ?? '')
    );
  if (!url) fail('SHARED_HOSTED_URL_NOT_PROVEN');
  report.webPreviewUrl = url;
  for (const path of [
    '/welcome',
    '/sign-in',
    '/pwa/install.js',
    '/manifest.webmanifest',
  ]) {
    const response = await fetch(`${url}${path}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) fail('SHARED_HOSTED_RESOURCE_UNAVAILABLE');
    const text = await response.text();
    if (
      path === '/welcome' &&
      (!text.includes('/pwa/install.js') || text.includes('כניסה לבדיקות'))
    )
      fail('SHARED_PUBLIC_ENTRY_INVALID');
  }
  report.status = 'SHARED_WEB_DEPLOYED_ORDINARY_ACCEPTANCE_PENDING';
  // This result is deployment evidence, never synthetic-flow acceptance.
} catch (error) {
  report.status = 'FAILED';
  report.failureKind = /ArgumentValidationError/.test(error.message ?? '')
    ? 'ARGUMENT_VALIDATION'
    : /Could not find public function/.test(error.message ?? '')
      ? 'SYSTEM_QUERY_UNAVAILABLE'
      : /401|Unauthorized|Access denied|unauthenticated/i.test(
            error.message ?? ''
          )
        ? 'EXISTING_DEPLOY_ACCESS_DENIED'
        : /not a function|Cannot read properties/.test(error.message ?? '')
          ? 'RUNTIME_TYPE'
          : 'PRIVATE_DETAILS_WITHHELD';
  report.errorType = /^[A-Za-z]+$/.test(error.name ?? '')
    ? error.name
    : 'Error';
  report.failureCode = /^[A-Z0-9_]+$/.test(error.message ?? '')
    ? error.message
    : 'SHARED_PRIVATE_DETAILS_WITHHELD';
  process.exitCode = 1;
} finally {
  writeFileSync('shared-web-evidence.json', JSON.stringify(report, null, 2));
  console.info(`SHARED_WEB_RESULT ${JSON.stringify(report)}`);
}
