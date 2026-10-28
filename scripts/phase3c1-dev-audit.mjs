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
import {
  assertAuditRpc,
  assertCandidateBundle,
  assertEffectiveDiff,
  assessRuntimeEvidence,
  digest,
  PHASE3_BASE,
  safeRemoteModules,
  summarizeEffectiveDiff,
  verifyDevTarget,
} from './lib/phase3c1-dev-guard.mjs';

const report = {
  phase: '3C-1B',
  status: 'BLOCKED',
  synced: false,
  commandsEnabled: false,
  baselineProven: false,
  candidateProven: false,
  safeToApproveSync: false,
  candidateDryRun: { status: 'NOT_RUN' },
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
let auditTarget;
let initialFingerprint;

async function rpc(target, path, body, compressed = false) {
  assertAuditRpc(path, body, process.env.CONVEX_DEPLOY_KEY);
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

async function stage(target, request, progress) {
  const start = await rpc(
    target,
    '/api/deploy2/start_push',
    { ...request, dryRun: true },
    true
  );
  progress.startPushComplete = true;
  const knownStartFields = [
    'environmentVariables',
    'externalDepsId',
    'componentDefinitionPackages',
    'appAuth',
    'analysis',
    'app',
    'schemaChange',
  ];
  if (
    !start ||
    typeof start !== 'object' ||
    knownStartFields.some((field) => !Object.hasOwn(start, field)) ||
    Object.keys(start).some((field) => !knownStartFields.includes(field))
  ) {
    fail('UNKNOWN_START_PUSH_RESPONSE');
  }
  // Response includes private deployment environment variables: memory only, never report or log.
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = await rpc(target, '/api/deploy2/wait_for_schema', {
      adminKey: request.adminKey,
      schemaChange: start.schemaChange,
      timeoutMs: 1000,
      dryRun: true,
    });
    if (status.type === 'complete') {
      if (Object.keys(status).some((field) => field !== 'type')) {
        fail('UNKNOWN_SCHEMA_STATUS');
      }
      progress.schemaValidationComplete = true;
      return start;
    }
    if (status.type !== 'inProgress') {
      fail('SCHEMA_VALIDATION_OR_CONCURRENT_PUSH_FAILED');
    }
    if (
      Object.keys(status).some(
        (field) => !['type', 'components'].includes(field)
      )
    ) {
      fail('UNKNOWN_SCHEMA_STATUS');
    }
  }
  fail('SCHEMA_VALIDATION_TIMEOUT');
}

async function finish(target, request, start) {
  return rpc(
    target,
    '/api/deploy2/finish_push',
    { adminKey: request.adminKey, startPush: start, dryRun: true },
    true
  );
}

async function dryDiff(target, request, progress) {
  progress.status = 'RUNNING';
  progress.dryRun = true;
  const start = await stage(target, request, progress);
  const diff = await finish(target, request, start);
  progress.finishPushComplete = true;
  progress.status = 'PROTOCOL_COMPLETED';
  return diff;
}

try {
  report.stage = 'LOCAL_SOURCE_CONTRACT';
  if (mode !== '--audit') {
    fail('PHASE3C1B_AUDIT_ONLY');
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
  report.stage = 'DEV_IDENTITY';
  const target = verifyDevTarget(pulled, process.env.CONVEX_DEPLOY_KEY);
  auditTarget = target;
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
  report.stage = 'REMOTE_METADATA';
  const before = await config(target);
  initialFingerprint = digest(before);
  report.remoteBaseline = {
    modules: safeRemoteModules(before),
    udfServerVersion: before.udfServerVersion,
    fingerprint: initialFingerprint,
    nodeDependenciesExposed: Object.hasOwn(before, 'nodeDependencies'),
    nodeVersion:
      typeof before.nodeVersion === 'string' && /^\d+$/.test(before.nodeVersion)
        ? before.nodeVersion
        : null,
  };
  report.stage = 'BASELINE_BUNDLE';
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
  // Record missing Node evidence without preventing the baseline dry-run.
  report.runtimeEvidence = assessRuntimeEvidence(before, baselineRequest);
  report.stage = 'BASELINE_REMOTE_DIFF';
  report.baselineDryRun = { status: 'NOT_RUN' };
  const baselineDiff = await dryDiff(
    target,
    baselineRequest,
    report.baselineDryRun
  );
  report.baselineDiffHash = digest(baselineDiff);
  report.baselineDiffSummary = summarizeEffectiveDiff(baselineDiff);
  try {
    report.baseline = assertEffectiveDiff(baselineDiff);
  } catch (error) {
    report.baselineGuard = error.message;
    fail('REMOTE_BASELINE_DRIFT_OR_UNPROVEN');
  }
  if (!report.runtimeEvidence.sufficient) {
    fail('NODE_RUNTIME_EFFECTIVE_DIFF_UNPROVEN');
  }
  report.baselineProven = true;
  report.stage = 'CANDIDATE_BUNDLE';
  const candidate = bundleRequest(target, temp, 'candidate');
  report.localCandidateDiff = assertCandidateBundle(baselineRequest, candidate);
  report.stage = 'CANDIDATE_REMOTE_DIFF';
  const candidateDiff = await dryDiff(
    target,
    candidate,
    report.candidateDryRun
  );
  report.candidateDiffSummary = summarizeEffectiveDiff(candidateDiff);
  report.effectiveBackendDiff = assertEffectiveDiff(candidateDiff, {
    allowQuery: true,
  });
  report.candidateProven = true;
  report.status = 'PREFLIGHT_PASSED';
} catch (error) {
  // Only our own fixed code reaches logs. Never print RPC/CLI exception text or stack.
  report.error = /^[A-Z0-9_]+$/.test(error?.message ?? '')
    ? error.message
    : 'PRIVATE_OPERATION_FAILED';
  process.exitCode = 1;
} finally {
  // Read again even when a guard blocks candidate creation. No activation/retry.
  if (auditTarget && initialFingerprint) {
    try {
      const after = await config(auditTarget);
      report.finalFingerprint = digest(after);
      report.remoteFingerprintUnchanged =
        report.finalFingerprint === initialFingerprint;
      if (!report.remoteFingerprintUnchanged) {
        report.status = 'BLOCKED';
        report.error = 'REMOTE_CHANGED_DURING_AUDIT';
        process.exitCode = 1;
      }
    } catch {
      report.remoteFingerprintUnchanged = null;
      report.finalFingerprintCheck = 'UNAVAILABLE';
      report.status = 'BLOCKED';
      report.error ??= 'FINAL_FINGERPRINT_UNPROVEN';
      process.exitCode = 1;
    }
  }
  report.safeToApproveSync =
    report.status === 'PREFLIGHT_PASSED' &&
    report.remoteFingerprintUnchanged === true;
  if (privateRequest) {
    try {
      unlinkSync(privateRequest);
    } catch {}
  }
  writeFileSync('phase3c1-audit.json', JSON.stringify(report, null, 2));
  // biome-ignore lint/suspicious/noConsole: fixed statuses and verified deployment slug only.
  console.log(
    `Phase 3C-1B: ${report.status}; target=${report.target ?? 'unresolved'}; synced=${report.synced}; error=${report.error ?? 'none'}`
  );
}
