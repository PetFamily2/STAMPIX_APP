#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import {
  ConvexContractError,
  assertPreviewTargetIsolation,
  assertSchemaCompatibility,
  classifyDeploymentKind,
  deploymentSlug,
  loadEnvFiles,
  redactSecrets,
  resolveConvexEnvFromProject,
  resolveProfileConvexUrl,
} from './lib/convex-deployment-contract.mjs';

function fail(message) {
  // biome-ignore lint/suspicious/noConsole: CLI must print secret-safe failures.
  console.error(`CONVEX DEV SYNC FAIL: ${redactSecrets(message)}`);
  process.exit(1);
}

function resolveConvexNode(projectRoot) {
  if (process.env.STAMPAIX_CONVEX_NODE_EXE) {
    return process.env.STAMPAIX_CONVEX_NODE_EXE;
  }
  const toolsDir = join(projectRoot, '.tools');
  if (existsSync(toolsDir)) {
    const versions = readdirSync(toolsDir)
      .filter((name) => name.startsWith('node-v22') && !name.endsWith('.zip'))
      .sort();
    const latest = versions.at(-1);
    if (latest) {
      const exe = join(toolsDir, latest, process.platform === 'win32' ? 'node.exe' : 'bin/node');
      if (existsSync(exe)) return exe;
    }
  }
  return process.execPath;
}

function applyEnv(env) {
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

const projectRoot = process.cwd();
if (process.argv.includes('--prod') || process.argv.includes('--production')) {
  fail('canonical DEV sync cannot target Production');
}

try {
  const fileEnv = loadEnvFiles(projectRoot);
  applyEnv(fileEnv);
  process.env.EXPO_PUBLIC_APP_ENV = 'preview';

  const env = resolveConvexEnvFromProject(projectRoot);

  const deploymentKind = classifyDeploymentKind(env.CONVEX_DEPLOYMENT);
  if (deploymentKind !== 'DEV') {
    fail(`CONVEX_DEPLOYMENT kind is ${deploymentKind}; DEV is required`);
  }

  const { appEnv, url } = resolveProfileConvexUrl('preview', env);
  assertPreviewTargetIsolation({
    appEnv,
    deploymentKind,
    convexUrl: url,
    deploymentSlugValue: deploymentSlug(env.CONVEX_DEPLOYMENT),
  });

  assertSchemaCompatibility(
    readFileSync(join(projectRoot, 'convex/schema.ts'), 'utf8')
  );
  // biome-ignore lint/suspicious/noConsole: secret-safe operator status.
  console.log('Schema/deployment compatibility check: PASS');
  // biome-ignore lint/suspicious/noConsole: secret-safe operator status.
  console.log('Convex environment: preview');
  // biome-ignore lint/suspicious/noConsole: secret-safe operator status.
  console.log('Convex target: resolved');

  const convexBin = join(projectRoot, 'node_modules', 'convex', 'bin', 'main.js');
  if (!existsSync(convexBin)) {
    throw new ConvexContractError('Convex CLI is MISSING');
  }

  const nodeExe = resolveConvexNode(projectRoot);
  const result = spawnSync(
    nodeExe,
    [convexBin, 'dev', '--once', '--typecheck', 'try'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 300000,
      maxBuffer: 20 * 1024 * 1024,
    }
  );

  const stdout = redactSecrets(result.stdout || '');
  const stderr = redactSecrets(result.stderr || '');
  if (result.status !== 0) {
    fail(
      `Convex DEV sync failed (${result.status ?? result.signal}). ${stderr || stdout}`.trim()
    );
  }

  // biome-ignore lint/suspicious/noConsole: secret-safe operator status.
  console.log('Convex DEV sync: PASS');

  const verify = spawnSync(
    process.execPath,
    [join(projectRoot, 'scripts/verify-convex-deployment-contract.mjs'), '--preview'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 180000,
      maxBuffer: 20 * 1024 * 1024,
    }
  );
  const verifyOut = redactSecrets(verify.stdout || '');
  const verifyErr = redactSecrets(verify.stderr || '');
  if (verify.status !== 0) {
    fail(
      `Remote contract verification after DEV sync failed. ${verifyErr || verifyOut}`.trim()
    );
  }
  if (verifyOut.trim()) {
    // biome-ignore lint/suspicious/noConsole: secret-safe operator status.
    console.log(verifyOut.trim());
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
