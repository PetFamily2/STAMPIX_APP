import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { brotliCompressSync } from 'node:zlib';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import {
  APPROVED_DEV,
  assertEffectiveDiff,
  digest,
  PHASE3_BASE,
  safeRemoteModules,
  summarizeEffectiveDiff,
  verifyDevTarget,
} from './lib/phase3c1-dev-guard.mjs';

const report = {
  phase: '3C-1',
  status: 'BLOCKED',
  synced: false,
  commandsEnabled: false,
};
const mode = process.argv[2];
const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const fail = (code) => {
  throw new Error(code);
};
let privateRequest;

async function rpc(target, path, body, compressed = false) {
  const text = JSON.stringify(body);
  const res = await fetch(`${target.url}${path}`, {
    method: 'POST',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(60000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Convex ${process.env.CONVEX_DEPLOY_KEY}`,
      'Convex-Client': 'npm-cli-1.31.5',
      ...(compressed ? { 'Content-Encoding': 'br' } : {}),
    },
    body: compressed ? brotliCompressSync(text) : text,
  });
  if (!res.ok) {
    fail(`REMOTE_RPC_HTTP_${res.status}`);
  }
  return res.json();
}

async function config(target) {
  return rpc(target, '/api/get_config_hashes', {
    version: '1.31.5',
    adminKey: process.env.CONVEX_DEPLOY_KEY,
  });
}

function bundleRequest(target, dir, name) {
  const prefix = join(dir, name);
  privateRequest = `${prefix}.json`;
  const cli = spawnSync(
    process.execPath,
    [
      'node_modules/convex/bin/main.js',
      'deploy',
      '--dry-run',
      '--yes',
      '--typecheck',
      'disable',
      '--codegen',
      'disable',
      '--write-push-request',
      prefix,
    ],
    {
      env: { ...process.env, CONVEX_DEPLOYMENT: target.deployment },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300000,
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  // CLI output can contain deployment environment values. Never echo it.
  if (cli.status !== 0) {
    fail('PRIVATE_BUNDLE_BUILD_FAILED');
  }
  chmodSync(privateRequest, 0o600);
  const request = JSON.parse(readFileSync(privateRequest, 'utf8'));
  unlinkSync(privateRequest);
  privateRequest = undefined;
  if (
    request.adminKey !== process.env.CONVEX_DEPLOY_KEY ||
    request.dryRun !== true ||
    request.appDefinition?.udfServerVersion !== '1.31.5'
  ) {
    fail('BUNDLE_TARGET_OR_VERSION_MISMATCH');
  }
  return request;
}

async function stage(target, request, dryRun) {
  if (
    !dryRun &&
    (mode !== '--sync' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch')
  ) {
    fail('SYNC_REQUIRES_EXPLICIT_WORKFLOW_DISPATCH');
  }
  const start = await rpc(
    target,
    '/api/deploy2/start_push',
    { ...request, dryRun },
    true
  );
  // Response includes private deployment environment variables: memory only, never report or log.
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = await rpc(target, '/api/deploy2/wait_for_schema', {
      adminKey: request.adminKey,
      schemaChange: start.schemaChange,
      timeoutMs: 1000,
      dryRun,
    });
    if (status.type === 'complete') {
      return start;
    }
    if (status.type !== 'inProgress') {
      fail('SCHEMA_VALIDATION_OR_CONCURRENT_PUSH_FAILED');
    }
  }
  fail('SCHEMA_VALIDATION_TIMEOUT');
}

async function finish(target, request, start, dryRun) {
  return rpc(
    target,
    '/api/deploy2/finish_push',
    { adminKey: request.adminKey, startPush: start, dryRun },
    true
  );
}

async function dryDiff(target, request) {
  const start = await stage(target, request, true);
  return finish(target, request, start, true);
}

async function remoteContract(target) {
  try {
    const client = new ConvexHttpClient(target.url, {
      logger: false,
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        }),
    });
    client.setAdminAuth(process.env.CONVEX_DEPLOY_KEY);
    const spec = await client.query(
      makeFunctionReference('_system/cli/modules:apiSpec'),
      {}
    );
    if (!Array.isArray(spec)) {
      fail('FUNCTION_SPEC_SHAPE');
    }
    return {
      status: 'READ',
      functions: spec
        .filter((f) => f.functionType !== 'HttpAction')
        .map((f) => ({
          identifier: f.identifier,
          type: f.functionType,
          visibility: f.visibility,
          validatorsHash: digest({ args: f.args, returns: f.returns }),
        }))
        .filter(
          (f) =>
            typeof f.identifier === 'string' &&
            /^[a-zA-Z0-9_./:-]+$/.test(f.identifier)
        ),
    };
  } catch {
    // A deployment-only key may not allow system queries. Never broaden it automatically.
    return { status: 'NOT_AVAILABLE_WITH_EXISTING_KEY', functions: [] };
  }
}

try {
  if (!['--audit', '--sync'].includes(mode)) {
    fail('INVALID_MODE');
  }
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REPOSITORY !== 'PetFamily2/STAMPIX_APP'
  ) {
    fail('GITHUB_ACTIONS_ONLY');
  }
  if (
    mode === '--audit' &&
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' &&
    !(
      process.env.GITHUB_EVENT_NAME === 'pull_request' &&
      Number(process.env.GITHUB_RUN_ATTEMPT) > 1
    )
  ) {
    fail('AUDIT_REQUIRES_MANUAL_ACTION');
  }
  if (
    mode === '--sync' &&
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
  ) {
    fail('SYNC_REQUIRES_EXPLICIT_WORKFLOW_DISPATCH');
  }
  const head = git('rev-parse', 'HEAD');
  if (head !== process.env.VERIFIED_HEAD_SHA || !/^[a-f0-9]{40}$/.test(head)) {
    fail('REVISION_MISMATCH');
  }
  git('merge-base', '--is-ancestor', PHASE3_BASE, head);
  const changed = git(
    'diff',
    '--name-only',
    PHASE3_BASE,
    head,
    '--',
    'convex',
    'convex.json',
    'package.json',
    'bun.lock'
  )
    .split('\n')
    .filter(Boolean)
    .filter((p) => !p.startsWith('convex/__tests__/'));
  if (changed.length !== 1 || changed[0] !== 'convex/webScanner.ts') {
    fail('UNAPPROVED_LOCAL_BACKEND_DELTA');
  }
  if (
    JSON.parse(readFileSync('node_modules/convex/package.json', 'utf8'))
      .version !== '1.31.5'
  ) {
    fail('CLI_VERSION_MISMATCH');
  }
  const pulled = parseEnv(readFileSync('.env.preview-pulled', 'utf8'));
  const target = verifyDevTarget(pulled, process.env.CONVEX_DEPLOY_KEY);
  Object.assign(report, {
    revision: head,
    target: target.slug,
    kind: 'dev',
    keyMatched: true,
    previewEnvironmentPulled: true,
    productionCompared: target.productionCompared,
    knownProductionRejected: true,
    base: PHASE3_BASE,
    localBackendDelta: ['webScanner:getOutcome'],
  });
  const before = await config(target);
  report.remoteBaseline = {
    modules: safeRemoteModules(before),
    udfServerVersion: before.udfServerVersion,
    fingerprint: digest(before),
    functionContract: await remoteContract(target),
  };
  const temp = mkdtempSync(join(tmpdir(), 'stampaix-phase3c1-'));
  chmodSync(temp, 0o700);
  const scannerFile = 'convex/webScanner.ts';
  const savedScanner = join(temp, 'webScanner.ts');
  let baselineRequest;
  renameSync(scannerFile, savedScanner);
  try {
    baselineRequest = bundleRequest(target, temp, 'baseline');
  } finally {
    renameSync(savedScanner, scannerFile);
  }
  const baselineDiff = await dryDiff(target, baselineRequest);
  report.baselineDiffHash = digest(baselineDiff);
  report.baselineDiffSummary = summarizeEffectiveDiff(baselineDiff);
  try {
    report.baseline = assertEffectiveDiff(baselineDiff);
  } catch (error) {
    report.baselineGuard = error.message;
    fail('REMOTE_BASELINE_DRIFT_OR_UNPROVEN');
  }
  const candidate = bundleRequest(target, temp, 'candidate');
  for (const field of [
    'componentDefinitions',
    'nodeDependencies',
    'nodeVersion',
    'functions',
  ]) {
    if (digest(candidate[field]) !== digest(baselineRequest[field])) {
      fail('LOCAL_COMPONENT_OR_NODE_CONFIG_CHANGED');
    }
  }
  for (const field of [
    'definition',
    'dependencies',
    'schema',
    'udfServerVersion',
  ]) {
    if (
      digest(candidate.appDefinition[field]) !==
      digest(baselineRequest.appDefinition[field])
    ) {
      fail('LOCAL_APP_CONFIG_CHANGED');
    }
  }
  report.effectiveBackendDiff = assertEffectiveDiff(
    await dryDiff(target, candidate),
    { allowQuery: true }
  );
  if (digest(await config(target)) !== report.remoteBaseline.fingerprint) {
    fail('REMOTE_CHANGED_DURING_AUDIT');
  }
  report.status = 'PREFLIGHT_PASSED';
  if (mode === '--sync') {
    // Revalidate exact EAS/key identity and remote baseline immediately before the real start/finish.
    verifyDevTarget(
      parseEnv(readFileSync('.env.preview-pulled', 'utf8')),
      process.env.CONVEX_DEPLOY_KEY
    );
    if (target.slug !== APPROVED_DEV) {
      fail('UNAPPROVED_DEV_TARGET');
    }
    const start = await stage(target, candidate, false);
    if (digest(await config(target)) !== report.remoteBaseline.fingerprint) {
      fail('REMOTE_CHANGED_BEFORE_FINISH');
    }
    const deployed = await finish(target, candidate, start, false);
    report.synced = true;
    report.deployedDiff = assertEffectiveDiff(deployed, { allowQuery: true });
    const post = await config(target);
    const modules = safeRemoteModules(post);
    if (!modules.some((m) => m.path === 'webScanner.js')) {
      fail('QUERY_MODULE_NOT_PRESENT_AFTER_SYNC');
    }
    report.postDeploy = {
      fingerprint: digest(post),
      queryModulePresent: true,
      functionContract: await remoteContract(target),
    };
    report.status = 'SYNC_VERIFIED';
  }
} catch (error) {
  // Only our own fixed code reaches logs. Never print RPC/CLI exception text or stack.
  report.error = /^[A-Z0-9_]+$/.test(error?.message ?? '')
    ? error.message
    : 'PRIVATE_OPERATION_FAILED';
  process.exitCode = 1;
} finally {
  if (privateRequest) {
    try {
      unlinkSync(privateRequest);
    } catch {}
  }
  writeFileSync('phase3c1-audit.json', JSON.stringify(report, null, 2));
  // biome-ignore lint/suspicious/noConsole: fixed statuses and verified deployment slug only.
  console.log(
    `Phase 3C-1: ${report.status}; target=${report.target ?? 'unresolved'}; synced=${report.synced}; error=${report.error ?? 'none'}`
  );
}
