import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import webpush from 'web-push';
import {
  SOURCE_SHA,
  requireActionsRevision,
  requireProjectPreviewKey,
} from './lib/phase3c1-preview-guard.mjs';
import {
  PRODUCT_PREVIEW_NAME,
  requireProductPreviewTarget,
  productPreviewPublicEnvironment,
  approvedProductProviderEnvironment,
} from './lib/product-preview-guard.mjs';
import { classifyHostingFailure } from './lib/preview-hosting.mjs';
import { resolveSumitConfig } from '../convex/lib/billing/sumit/config.ts';

const report = {
  status: 'RUNNING',
  sourceSha: SOURCE_SHA,
  fixtureSeeded: false,
  dataReset: false,
  secretsRotated: false,
  productionTouched: false,
  devTouched: false,
  cases: {},
};
const save = () =>
  writeFileSync(
    'product-preview-evidence.json',
    JSON.stringify(report, null, 2)
  );
const fail = (code) => {
  throw new Error(code);
};
const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const projectKey = process.env.CONVEX_DEPLOY_KEY;
const run = (command, args, cwd, env, code, timeout = 180000) => {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) fail(code); // Provider/CLI output may contain keys; never echo it.
  return result.stdout;
};
try {
  requireActionsRevision(
    process.env,
    git('rev-parse', 'HEAD'),
    JSON.parse(readFileSync('node_modules/convex/package.json')).version
  );
  const regression = JSON.parse(readFileSync('rc-hosted-evidence.json'));
  if (
    regression.status !== 'HOSTED_QA_PASS' ||
    regression.revision !== SOURCE_SHA
  )
    fail('REGRESSION_NOT_PASSED');
  const projectSelection = requireProjectPreviewKey(projectKey);
  const management = async (path) => {
    const response = await fetch(`https://api.convex.dev/api/${path}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
      headers: {
        Authorization: `Bearer ${projectKey}`,
        'Content-Type': 'application/json',
        'Convex-Client': 'npm-cli-1.31.5',
      },
      body: JSON.stringify(
        path === 'claim_preview_deployment'
          ? { projectSelection, identifier: PRODUCT_PREVIEW_NAME }
          : { projectSelection, previewName: PRODUCT_PREVIEW_NAME }
      ),
    });
    if (!response.ok) fail(`PRODUCT_MANAGEMENT_HTTP_${response.status}`);
    return response.json();
  };
  let authorized,
    claim,
    created = false;
  try {
    authorized = await management('deployment/authorize_preview');
  } catch (error) {
    if (error.message !== 'PRODUCT_MANAGEMENT_HTTP_404') throw error;
    claim = await management('claim_preview_deployment');
    created = true;
    authorized = await management('deployment/authorize_preview');
  }
  const target = requireProductPreviewTarget(authorized);
  if (
    created &&
    (claim?.deploymentName !== target.name ||
      claim?.instanceUrl !== target.url ||
      typeof claim?.adminKey !== 'string' ||
      claim.adminKey.length < 16)
  )
    fail('PRODUCT_NEW_TARGET_NOT_PROVEN');
  Object.assign(report, {
    backendUrl: target.url,
    previewName: PRODUCT_PREVIEW_NAME,
    deploymentType: 'preview',
    reused: !created,
  });
  const admin = new ConvexHttpClient(target.url, { logger: false });
  admin.setAdminAuth(target.key);
  const inherited = await admin.query(
    makeFunctionReference('_system/cli/queryEnvironmentVariables'),
    {}
  );
  const previous = Object.fromEntries(inherited.map((e) => [e.name, e.value]));
  if (
    !created &&
    (previous.STAMPAIX_ENV !== 'preview' ||
      previous.STAMPAIX_PREVIEW_KIND !== 'product' ||
      previous.STAMPAIX_PREVIEW_NAME !== PRODUCT_PREVIEW_NAME ||
      previous.STAMPAIX_PREVIEW_URL !== target.url)
  )
    fail('PRODUCT_PREVIEW_OWNERSHIP_NOT_PROVEN');
  const values = created ? {} : { ...previous };
  delete values.CONVEX_CLOUD_URL;
  delete values.CONVEX_SITE_URL;
  if (values.SUMIT_ENV && values.SUMIT_ENV !== 'test')
    fail('PRODUCT_SUMIT_TEST_REQUIRED');
  if (values.MANUAL_QA_ENABLED === 'true' || values.PHASE3_FIXTURE_SECRET)
    fail('PRODUCT_FIXTURE_ENV_DENIED');
  for (const pair of [
    ['JWT_PRIVATE_KEY', 'JWKS'],
    ['SCAN_TOKEN_SECRET', 'SCAN_TOKEN_KID'],
    ['WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY'],
  ])
    if (pair.some((k) => values[k]) && !pair.every((k) => values[k]))
      fail('PRODUCT_INCOMPLETE_KEYPAIR_NO_ROTATION');
  if (!values.JWT_PRIVATE_KEY) {
    const { privateKey, publicKey } = await generateKeyPair('RS256', {
      extractable: true,
    });
    values.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
    const key = await exportJWK(publicKey);
    key.use = 'sig';
    key.alg = 'RS256';
    values.JWKS = JSON.stringify({ keys: [key] });
  }
  values.SCAN_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
  values.SCAN_TOKEN_KID ??= 'product-preview';
  values.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY ??=
    randomBytes(32).toString('base64url');
  if (!values.WEB_PUSH_VAPID_PUBLIC_KEY) {
    const keys = webpush.generateVAPIDKeys();
    values.WEB_PUSH_VAPID_PUBLIC_KEY = keys.publicKey;
    values.WEB_PUSH_VAPID_PRIVATE_KEY = keys.privateKey;
  }
  const approved = approvedProductProviderEnvironment(
    parseEnv(readFileSync('.env.preview-pulled', 'utf8')),
    target
  );
  // Existing operator-configured credentials on this owned product Preview are retained.
  // A different existing value is never overwritten by this deployment script.
  for (const [name, value] of Object.entries(approved)) {
    if (values[name] && values[name] !== value)
      fail('PRODUCT_EXISTING_CREDENTIAL_CHANGE_DENIED');
    values[name] ??= value;
  }
  Object.assign(values, {
    STAMPAIX_ENV: 'preview',
    STAMPAIX_PREVIEW_KIND: 'product',
    STAMPAIX_PREVIEW_NAME: PRODUCT_PREVIEW_NAME,
    STAMPAIX_PREVIEW_URL: target.url,
    MANUAL_QA_ENABLED: 'false',
    AUTH_LOG_LEVEL: 'ERROR',
    SITE_URL: target.url.replace('.cloud', '.site'),
    WEB_PUSH_ENABLED: 'true',
    WEB_PUSH_VAPID_SUBJECT: 'https://stampaix.com',
  });
  const response = await fetch(
    `${target.url}/api/update_environment_variables`,
    {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
      headers: {
        Authorization: `Convex ${target.key}`,
        'Content-Type': 'application/json',
        'Convex-Client': 'npm-cli-1.31.5',
      },
      body: JSON.stringify({
        changes: [
          ...(created
            ? inherited
                .filter(
                  (e) =>
                    !['CONVEX_CLOUD_URL', 'CONVEX_SITE_URL'].includes(e.name) &&
                    !(e.name in values)
                )
                .map((e) => ({ name: e.name }))
            : []),
          ...Object.entries(values).map(([name, value]) => ({ name, value })),
        ],
      }),
    }
  );
  if (!response.ok) fail('PRODUCT_ENV_UPDATE_FAILED');
  const backend = mkdtempSync(join(tmpdir(), 'stampaix-product-backend-'));
  chmodSync(backend, 0o700);
  const archive = execFileSync('git', ['archive', SOURCE_SHA], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const unpack = spawnSync('tar', ['-x', '-C', backend], {
    input: archive,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (
    unpack.status !== 0 ||
    existsSync(join(backend, 'convex/phase3Fixtures.ts'))
  )
    fail('PRODUCT_BACKEND_SOURCE_INVALID');
  symlinkSync(resolve('node_modules'), join(backend, 'node_modules'), 'dir');
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !/^(CONVEX_|EXPO_PUBLIC_|PHASE3_|VERIFIED_|AUTH_|JWT_|SCAN_|JWKS|SITE_URL)/.test(
          name
        )
    )
  );
  run(
    'node',
    [
      join(backend, 'node_modules/convex/bin/main.js'),
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
    backend,
    { ...cleanEnv, CONVEX_DEPLOY_KEY: target.key },
    'PRODUCT_BACKEND_DEPLOY_FAILED',
    600000
  );
  report.auth = await new ConvexHttpClient(target.url, { logger: false }).query(
    makeFunctionReference('webAuth:getProviderAvailability'),
    {}
  );
  report.places = {
    configured: !!values.GOOGLE_PLACES_API_KEY,
    businessAddressAcceptance: 'EXTERNAL_CONFIGURATION_REQUIRED',
  };
  const source = resolve('phase3-source');
  if (
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: source,
      encoding: 'utf8',
    }).trim() !== SOURCE_SHA
  )
    fail('PRODUCT_CLIENT_SOURCE_MISMATCH');
  const publicEnv = productPreviewPublicEnvironment(target);
  writeFileSync(
    join(source, '.env.local'),
    Object.entries(publicEnv)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n',
    { mode: 0o600 }
  );
  const clientEnv = { ...cleanEnv, ...publicEnv };
  run(
    'bunx',
    [
      'expo',
      'export',
      '--platform',
      'web',
      '--output-dir',
      'product-dist',
      '--max-workers',
      '2',
    ],
    source,
    clientEnv,
    'PRODUCT_WEB_EXPORT_FAILED'
  );
  run(
    'bun',
    ['scripts/export-web-scanner-business.mjs', 'product-dist'],
    source,
    clientEnv,
    'PRODUCT_ASSETS_FAILED'
  );
  run(
    'node',
    ['scripts/finalize-web-pwa-export.mjs', 'product-dist'],
    source,
    clientEnv,
    'PRODUCT_PWA_FAILED'
  );
  run(
    'node',
    ['scripts/verify-client-secret-patterns.mjs', 'product-dist'],
    source,
    clientEnv,
    'PRODUCT_CLIENT_SECRET_CHECK_FAILED'
  );
  let payload;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const hosted = spawnSync(
      'eas',
      [
        'deploy',
        '--environment',
        'preview',
        '--non-interactive',
        '--dev-domain',
        'stampaix-business',
        '--export-dir',
        'product-dist',
        '--json',
      ],
      {
        cwd: source,
        env: clientEnv,
        encoding: 'utf8',
        timeout: 180000,
        maxBuffer: 8_000_000,
      }
    );
    if (hosted.status === 0) {
      payload = JSON.parse(hosted.stdout);
      break;
    }
    const kind = classifyHostingFailure(
      `${hosted.stdout}\n${hosted.stderr}`,
      hosted.error?.code
    );
    if (!kind.transient || attempt === 3) fail('PRODUCT_HOSTING_FAILED');
  }
  const candidates = (Array.isArray(payload) ? payload : [payload]).flatMap(
    (r) => [
      r.url,
      r.deploymentUrl,
      r.previewUrl,
      r.deployment?.url,
      r.deployment?.previewUrl,
      r.metadata?.url,
    ]
  );
  const url = candidates.find(
    (v) =>
      typeof v === 'string' &&
      /^https:\/\/stampaix-business--[a-z0-9]+\.expo\.app\/?$/.test(v)
  );
  if (!url) fail('PRODUCT_HOSTING_URL_NOT_PROVEN');
  report.webPreviewUrl = url;
  // Configuring a return origin never creates a provider product or performs a payment.
  if (values.SUMIT_ENV === 'test' && !values.SUMIT_WEB_ORIGIN) {
    const originResult = await fetch(
      `${target.url}/api/update_environment_variables`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
        headers: {
          Authorization: `Convex ${target.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          changes: [{ name: 'SUMIT_WEB_ORIGIN', value: url }],
        }),
      }
    );
    if (!originResult.ok) fail('PRODUCT_SUMIT_ORIGIN_FAILED');
    values.SUMIT_WEB_ORIGIN = url;
  }
  const sumit = resolveSumitConfig(values);
  report.billing = {
    environment: sumit.environment,
    configured: sumit.liveCheckoutEnabled,
    missing: sumit.missingCheckout,
    paymentAttempted: false,
  };
  const tools = createRequire(
    join(process.env.RUNNER_TEMP, 'stampaix-rc-tools/package.json')
  );
  const { chromium } = tools('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', () => errors.push('APPLICATION_RUNTIME_ERROR'));
      await page.goto(`${url}/welcome`);
      await page
        .getByRole('link', { name: 'בואו נתחיל', exact: true })
        .waitFor();
      if (
        await page
          .getByRole('link', { name: 'כניסה לבדיקות', exact: true })
          .count()
      )
        fail('PRODUCT_QA_LINK_LEAKED');
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1
        )
      )
        fail('PRODUCT_PUBLIC_OVERFLOW');
      await page.getByRole('link', { name: 'בואו נתחיל', exact: true }).click();
      await page.getByText('איך תרצו להתחבר?', { exact: true }).waitFor();
      if (
        await page.evaluate(
          () =>
            getComputedStyle(document.getElementById('stampaix-product-frame'))
              .direction !== 'ltr'
        )
      )
        fail('PRODUCT_DOUBLE_RTL');
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1
        )
      )
        fail('PRODUCT_AUTH_OVERFLOW');
      if (errors.length) fail('PRODUCT_RUNTIME_ERRORS');
      report.cases[`PUBLIC_WEB_${width}`] = 'PASS';
      await context.close();
    }
  } finally {
    await browser.close();
  }
  report.realJourneys = Object.fromEntries(
    ['customer', 'owner', 'manager', 'staff', 'scanner'].map((role) => [
      role,
      'EXTERNAL_CONFIGURATION_REQUIRED',
    ])
  );
  report.status = Object.values(report.auth).some(Boolean)
    ? 'PRODUCT_PREVIEW_PROVIDER_ACCEPTANCE_REQUIRED'
    : 'PRODUCT_PREVIEW_AUTH_CONFIGURATION_REQUIRED';
  save();
  console.info(`PRODUCT_PREVIEW_RESULT ${JSON.stringify(report)}`);
} catch (error) {
  report.status = 'FAILED';
  report.failureCode = /^[A-Z0-9_]+$/.test(error.message ?? '')
    ? error.message
    : 'PRODUCT_PRIVATE_DETAILS_WITHHELD';
  save();
  console.info(`PRODUCT_PREVIEW_RESULT ${JSON.stringify(report)}`);
  process.exitCode = 1;
}
