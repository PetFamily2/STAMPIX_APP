import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { resolveSumitConfig } from '../convex/lib/billing/sumit/config.ts';
import { requireProjectPreviewKey } from './lib/phase3c1-preview-guard.mjs';
import { requireProductPreviewTarget } from './lib/product-preview-guard.mjs';

const BASE = '78c3019b682acbce87e069e15191c96c99f5ed26';
const ORIGIN = 'https://stampaix-business--ebwtbuf8vy.expo.app';
const BACKEND = 'https://dependable-squirrel-701.convex.cloud';
const allowedPaths = new Set([
  '.github/workflows/branch-verify.yml',
  '.github/workflows/product-provider-reuse.yml',
  'scripts/reuse-existing-preview-providers.mjs',
  'docs/PREVIEW_PROVIDER_REUSE.md',
]);
const report = {
  status: 'RUNNING',
  webPreviewUrl: ORIGIN,
  backendUrl: BACKEND,
  applicationSourceSha: '427a52712b15a722ff0af02664b80255a2eda892',
  reusedVerificationRun: 37800829087,
  sources: [],
  configuredNames: [],
  newKeysCreated: false,
  sourceEnvironmentsModified: false,
  appOrBackendDeployed: false,
  fixturesUsed: false,
  paymentAttempted: false,
};
const fail = (code) => {
  throw new Error(code);
};
const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const names = [
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
  'GOOGLE_PLACES_API_KEY',
  'SUMIT_ENV',
  'SUMIT_COMPANY_ID',
  'SUMIT_API_KEY',
  'SUMIT_PRODUCTS_JSON',
];
const present = (value) =>
  typeof value === 'string' &&
  !!value.trim() &&
  !/^(undefined|null|placeholder)$/i.test(value.trim());
const sources = [];
function addSource(label, env) {
  sources.push({ label, env });
  report.sources.push({
    source: label,
    availableNames: names.filter((name) => present(env[name])),
  });
}
async function request(url, options) {
  return fetch(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(45000),
  });
}
async function readEnvironment(url, key) {
  const client = new ConvexHttpClient(url, { logger: false });
  client.setAdminAuth(key);
  const rows = await client.query(
    makeFunctionReference('_system/cli/queryEnvironmentVariables'),
    {}
  );
  return Object.fromEntries(rows.map(({ name, value }) => [name, value]));
}
try {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REPOSITORY !== 'PetFamily2/STAMPIX_APP' ||
    process.env.GITHUB_HEAD_REF !== 'pwa/phase-3-scanner-commands-20261005'
  ) {
    fail('ACTIONS_TARGET_REQUIRED');
  }
  report.controlSha = git('rev-parse', 'HEAD');
  const delta = git('diff', '--name-only', BASE, 'HEAD')
    .split('\n')
    .filter(Boolean);
  if (!delta.length || delta.some((path) => !allowedPaths.has(path))) {
    fail('APPLICATION_DELTA_REQUIRES_NEW_VERIFICATION');
  }
  const projectKey = process.env.CONVEX_PREVIEW_DEPLOY_KEY;
  const projectSelection = requireProjectPreviewKey(projectKey);
  async function management(path, body) {
    const response = await request(`https://api.convex.dev/api/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${projectKey}`,
        'Content-Type': 'application/json',
        'Convex-Client': 'npm-cli-1.31.5',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      fail(`SOURCE_MANAGEMENT_HTTP_${response.status}`);
    }
    return response.json();
  }
  const authorized = await management('deployment/authorize_preview', {
    projectSelection,
    previewName: 'stampaix-product-preview',
  });
  const target = requireProductPreviewTarget(authorized);
  if (target.url !== BACKEND) {
    fail('CURRENT_PRODUCT_PREVIEW_REQUIRED');
  }
  const current = await readEnvironment(target.url, target.key);
  if (
    current.STAMPAIX_ENV !== 'preview' ||
    current.STAMPAIX_PREVIEW_KIND !== 'product' ||
    current.STAMPAIX_PREVIEW_URL !== BACKEND ||
    current.MANUAL_QA_ENABLED !== 'false'
  ) {
    fail('PRODUCT_PREVIEW_OWNERSHIP_REQUIRED');
  }
  addSource('current-convex-preview', current);
  const directory = mkdtempSync(join(tmpdir(), 'stampaix-existing-providers-'));
  chmodSync(directory, 0o700);
  // EAS is already authorized for this repository. Pull privately; never echo CLI output.
  for (const environment of ['preview', 'development', 'production']) {
    const path = join(directory, `${environment}.env`);
    const result = spawnSync(
      'eas',
      ['env:pull', environment, '--path', path, '--non-interactive'],
      { encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    if (result.status !== 0) {
      report.sources.push({
        source: `eas-${environment}`,
        status: 'READ_UNAVAILABLE',
      });
      continue;
    }
    chmodSync(path, 0o600);
    addSource(`eas-${environment}`, parseEnv(readFileSync(path, 'utf8')));
  }
  const repository = Object.fromEntries(
    names.map((name) => [name, process.env[`SOURCE_${name}`]])
  );
  repository.CONVEX_DEPLOY_KEY = process.env.SOURCE_CONVEX_DEPLOY_KEY;
  addSource('github-repository-secrets', repository);
  const deploymentSources = new Map();
  for (const source of sources) {
    for (const key of [
      source.env.CONVEX_DEPLOY_KEY,
      source.env.CONVEX_DEV_DEPLOY_KEY,
      process.env.SOURCE_CONVEX_DEV_KEY,
    ]) {
      const match = /^(?:dev|prod):([a-z0-9]+(?:-[a-z0-9]+)*)\|[^\s]+$/.exec(
        key ?? ''
      );
      if (match && match[1] !== target.name) {
        deploymentSources.set(match[1], key);
      }
    }
  }
  // Authorization calls select existing deployments only. No claim/provision/deploy call.
  for (const deploymentName of [
    'utmost-fennec-280',
    'aware-llama-850',
    ...deploymentSources.keys(),
  ]) {
    if (sources.some((source) => source.label === `convex-${deploymentName}`)) {
      continue;
    }
    let key = deploymentSources.get(deploymentName);
    try {
      const credentials = await management(
        'deployment/authorize_within_current_project',
        { projectSelection, selectedDeploymentName: deploymentName }
      );
      if (
        credentials.deploymentName !== deploymentName ||
        credentials.url !== `https://${deploymentName}.convex.cloud`
      ) {
        fail('SOURCE_TARGET_MISMATCH');
      }
      key = credentials.adminKey;
    } catch {
      if (!key) {
        report.sources.push({
          source: `convex-${deploymentName}`,
          status: 'READ_UNAUTHORIZED',
        });
        continue;
      }
    }
    try {
      addSource(
        `convex-${deploymentName}`,
        await readEnvironment(`https://${deploymentName}.convex.cloud`, key)
      );
    } catch {
      report.sources.push({
        source: `convex-${deploymentName}`,
        status: 'READ_UNAUTHORIZED',
      });
    }
  }
  const changes = [];
  const next = { ...current };
  function copyGroup(group, required, optional = []) {
    const source = sources.find(
      ({ env }) =>
        required.every((name) => present(env[name])) &&
        (group !== 'sumit' || env.SUMIT_ENV === 'test')
    );
    if (!source) {
      return;
    }
    for (const name of [...required, ...optional]) {
      if (!present(source.env[name]) || present(current[name])) {
        continue;
      }
      next[name] = source.env[name];
      changes.push({ name, value: source.env[name] });
      report.configuredNames.push(name);
    }
    report[`${group}Source`] = source.label;
  }
  copyGroup('email', ['RESEND_API_KEY', 'RESEND_FROM_EMAIL']);
  copyGroup('google', ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET']);
  copyGroup('places', ['GOOGLE_PLACES_API_KEY']);
  copyGroup('sumit', [
    'SUMIT_ENV',
    'SUMIT_COMPANY_ID',
    'SUMIT_API_KEY',
    'SUMIT_PRODUCTS_JSON',
  ]);
  if (next.SUMIT_ENV === 'test' && next.SUMIT_WEB_ORIGIN !== ORIGIN) {
    changes.push({ name: 'SUMIT_WEB_ORIGIN', value: ORIGIN });
    next.SUMIT_WEB_ORIGIN = ORIGIN;
    report.configuredNames.push('SUMIT_WEB_ORIGIN');
  }
  if (changes.length) {
    const response = await request(
      `${BACKEND}/api/update_environment_variables`,
      {
        method: 'POST',
        headers: {
          Authorization: `Convex ${target.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ changes }),
      }
    );
    if (!response.ok) {
      fail('PREVIEW_PROVIDER_UPDATE_FAILED');
    }
  }
  const actual = await readEnvironment(BACKEND, target.key);
  if (changes.some(({ name, value }) => actual[name] !== value)) {
    fail('PREVIEW_PROVIDER_UPDATE_NOT_PERSISTED');
  }
  const publicClient = new ConvexHttpClient(BACKEND, { logger: false });
  report.auth = await publicClient.query(
    makeFunctionReference('webAuth:getProviderAvailability'),
    {}
  );
  report.manualQaDenied =
    (await publicClient.query(
      makeFunctionReference('manualQa:getAccess'),
      {}
    )) === null;
  if (!report.manualQaDenied) {
    fail('MANUAL_QA_NOT_DENIED');
  }
  if (report.auth.email) {
    const response = await request('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${actual.RESEND_API_KEY}` },
    });
    report.resendProviderReadStatus = response.status;
    report.emailDelivery = 'UI_OTP_DELIVERY_NOT_YET_TESTED';
  }
  report.placesConfigured = present(actual.GOOGLE_PLACES_API_KEY);
  if (report.placesConfigured) {
    const response = await request(
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': actual.GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'suggestions.placePrediction.placeId',
        },
        body: JSON.stringify({
          input: 'בית זרע',
          languageCode: 'he',
          includedRegionCodes: ['il'],
        }),
      }
    );
    report.placesProviderStatus = response.status;
    report.placesProviderAvailable = response.ok;
  }
  const sumit = resolveSumitConfig(actual);
  report.sumit = {
    environment: sumit.environment,
    configured: sumit.environment === 'test' && sumit.liveCheckoutEnabled,
    paymentAttempted: false,
  };
  report.googleCallbackUrl = `${BACKEND.replace('.cloud', '.site')}/api/auth/callback/google`;
  report.googleProviderRegistration = 'NOT_VERIFIED';
  report.status = report.auth.email
    ? 'EXISTING_EMAIL_CONFIGURED_UI_ACCEPTANCE_PENDING'
    : 'EXISTING_EMAIL_CREDENTIAL_ACCESS_REQUIRED';
} catch (error) {
  report.status = 'BLOCKED';
  report.failure = /^[A-Z][A-Z0-9_]{3,100}$/.test(error?.message ?? '')
    ? error.message
    : 'PRIVATE_ERROR_WITHHELD';
  process.exitCode = 1;
} finally {
  const text = JSON.stringify(report, null, 2);
  writeFileSync('product-provider-reuse-evidence.json', text);
  // biome-ignore lint/suspicious/noConsole: report contains names, statuses and public URLs only.
  console.log(text);
}
