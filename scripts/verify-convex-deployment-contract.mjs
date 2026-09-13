#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import {
  ConvexContractError,
  assertFunctionSpecArgsSafe,
  assertPreviewTargetIsolation,
  assertProductionTargetIsolation,
  assertSchemaCompatibility,
  buildFunctionSpecArgs,
  classifyDeploymentKind,
  collectClientConsumedFunctions,
  collectLocalPublicFunctions,
  compareFunctionContracts,
  deleteGeneratedSpecFiles,
  deploymentSlug,
  formatContractReport,
  listFunctionSpecFiles,
  loadEnvFiles,
  parseRemotePublicFunctions,
  redactSecrets,
  resolveConvexEnvFromProject,
  resolveProfileConvexUrl,
} from './lib/convex-deployment-contract.mjs';

function fail(message) {
  // biome-ignore lint/suspicious/noConsole: CLI verifier must print secret-safe failures.
  console.error(`PREBUILD FAIL: ${redactSecrets(message)}`);
  process.exit(1);
}

function parseProfile(argv) {
  const wantsPreview = argv.includes('--preview');
  const wantsProduction = argv.includes('--production');
  if (wantsPreview === wantsProduction) {
    fail('Pass exactly one of --preview or --production');
  }
  return wantsPreview ? 'preview' : 'production';
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

function readRemoteSpec({
  projectRoot,
  specArgs,
  nodeExe,
}) {
  const injectedSpec = process.env.STAMPAIX_CONVEX_CONTRACT_SPEC_FILE;
  if (injectedSpec) {
    if (!existsSync(injectedSpec)) {
      throw new ConvexContractError('Remote function spec file is MISSING');
    }
    return JSON.parse(readFileSync(injectedSpec, 'utf8'));
  }

  if (process.env.STAMPAIX_CONVEX_CONTRACT_FORCE_SPEC_ERROR === '1') {
    throw new ConvexContractError('Remote verification failure');
  }

  const convexBin = join(projectRoot, 'node_modules', 'convex', 'bin', 'main.js');
  if (!existsSync(convexBin)) {
    throw new ConvexContractError('Convex CLI is MISSING');
  }

  const before = new Set(listFunctionSpecFiles(projectRoot));
  const result = spawnSync(nodeExe, [convexBin, ...specArgs], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env },
    timeout: 180000,
    maxBuffer: 20 * 1024 * 1024,
  });

  const stdout = redactSecrets(result.stdout || '');
  const stderr = redactSecrets(result.stderr || '');
  if (result.status !== 0) {
    throw new ConvexContractError(
      `Remote Convex function-spec failed (${result.status ?? result.signal}). ${stderr || stdout}`.trim()
    );
  }

  const after = listFunctionSpecFiles(projectRoot);
  const created = after.filter((name) => !before.has(name));
  const specFile = created.at(-1);
  if (!specFile) {
    throw new ConvexContractError('Remote function spec file was not written');
  }
  try {
    return JSON.parse(readFileSync(join(projectRoot, specFile), 'utf8'));
  } finally {
    deleteGeneratedSpecFiles(projectRoot, created);
  }
}

const projectRoot = process.cwd();
const profile = parseProfile(process.argv.slice(2));

try {
  const fileEnv = loadEnvFiles(projectRoot);
  applyEnv(fileEnv);
  if (profile === 'preview') {
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';
  } else {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
  }

  const env = resolveConvexEnvFromProject(projectRoot);

  const schemaSource = readFileSync(join(projectRoot, 'convex/schema.ts'), 'utf8');
  assertSchemaCompatibility(schemaSource);

  const { appEnv, url } = resolveProfileConvexUrl(profile, env);
  const deploymentKind = classifyDeploymentKind(env.CONVEX_DEPLOYMENT);
  const slug = deploymentSlug(env.CONVEX_DEPLOYMENT);

  if (profile === 'preview') {
    assertPreviewTargetIsolation({
      appEnv,
      deploymentKind,
      convexUrl: url,
      deploymentSlugValue: slug,
    });
  } else {
    assertProductionTargetIsolation({
      appEnv,
      convexUrl: url,
      devUrl: env.EXPO_PUBLIC_CONVEX_URL_DEV,
      legacyUrl: env.EXPO_PUBLIC_CONVEX_URL,
      deploymentKind,
      deploymentSlugValue: slug,
    });
  }

  const specArgs = buildFunctionSpecArgs({
    profile,
    deploymentSlugValue: slug,
  });
  assertFunctionSpecArgsSafe(profile, specArgs);

  const spec = readRemoteSpec({
    projectRoot,
    specArgs,
    nodeExe: resolveConvexNode(projectRoot),
  });
  const remotePublic = parseRemotePublicFunctions(spec);
  const localPublic = collectLocalPublicFunctions(projectRoot);
  const clientConsumed = collectClientConsumedFunctions(projectRoot, {
    localPublic,
  });
  const comparison = compareFunctionContracts({
    localPublic,
    clientConsumed,
    remotePublic,
  });

  if (!comparison.pass) {
    const missing = [
      ...new Set([
        ...comparison.missingClientConsumed,
        ...comparison.missingLocalPublic,
      ]),
    ].sort();
    fail(
      `Remote public function contract: FAIL (${missing.length} missing)\n${missing.join('\n')}`
    );
  }

  // biome-ignore lint/suspicious/noConsole: CLI verifier reports secret-safe pass/fail status.
  console.log(
    formatContractReport({
      profile,
      targetResolved: true,
      remoteReachable: true,
      contract: true,
      schemaStatus: true,
    })
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
