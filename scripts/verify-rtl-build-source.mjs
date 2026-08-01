import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  findForbiddenRtlPatterns,
  findRuntimeRetentionProblems,
  findVisibleHebrewProblems,
  RTL_SOURCE_ROOTS,
  readCanonicalRtlContract,
} from './rtl-source-contract.mjs';

function fail(message) {
  // biome-ignore lint/suspicious/noConsole: CLI verifier must print actionable failures.
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`Cannot read ${filePath}: ${error.message}`);
  }
}

function parseArgs(argv) {
  const args = { projectRoot: process.cwd(), requireCleanGit: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--require-clean-git') {
      args.requireCleanGit = true;
      continue;
    }
    if (arg === '--project-root') {
      const value = argv[index + 1];
      if (!value) {
        fail('--project-root requires a value');
      }
      args.projectRoot = value;
      index += 1;
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }

  return args;
}

function verifyCleanGit(projectRoot) {
  let status = '';
  try {
    status = execFileSync('git', ['status', '--porcelain'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    fail(`Cannot inspect git status before EAS build: ${error.message}`);
  }

  if (status.trim()) {
    fail(
      [
        'Git working tree is dirty. Commit the RTL source changes before EAS build so the APK can be traced and verified.',
        status.trim(),
      ].join('\n')
    );
  }
}

function verifySource(projectRoot) {
  let contract;
  try {
    contract = readCanonicalRtlContract(projectRoot);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  let packageJson;
  try {
    packageJson = JSON.parse(readText(path.join(projectRoot, 'package.json')));
  } catch (error) {
    fail(`Cannot parse package.json: ${error.message}`);
  }

  if (packageJson.main !== 'index.js') {
    fail(
      `package.json main must be index.js before Android RTL build, found ${JSON.stringify(packageJson.main)}`
    );
  }

  for (const relativePath of [
    'index.js',
    'lib/rtl.ts',
    'app/_layout.tsx',
    ...RTL_SOURCE_ROOTS,
  ]) {
    if (!fs.existsSync(path.join(projectRoot, relativePath))) {
      fail(`Missing required RTL build source path: ${relativePath}`);
    }
  }

  const rtlSource = readText(path.join(projectRoot, 'lib/rtl.ts'));
  const rootLayout = readText(path.join(projectRoot, 'app/_layout.tsx'));

  const retentionProblems = findRuntimeRetentionProblems(rtlSource, rootLayout);
  if (retentionProblems.length > 0) {
    fail(
      `RTL runtime retention contract violations:\n${retentionProblems.join('\n')}`
    );
  }

  let findings;
  try {
    findings = [
      ...findForbiddenRtlPatterns(projectRoot),
      ...findVisibleHebrewProblems(projectRoot),
    ];
  } catch (error) {
    fail(`Cannot scan RTL source roots: ${error.message}`);
  }
  if (findings.length > 0) {
    fail(`RTL source contract violations:\n${findings.join('\n')}`);
  }

  return contract;
}

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args.projectRoot);
const contract = verifySource(projectRoot);

if (args.requireCleanGit) {
  verifyCleanGit(projectRoot);
}

// biome-ignore lint/suspicious/noConsole: CLI verifier reports pass/fail status.
console.log(`RTL build source verified (${contract.marker}).`);
