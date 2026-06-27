import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RTL_MARKER = 'stampaix-rtl-native-row-right-v4';

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
  const args = {
    projectRoot: process.cwd(),
    requireCleanGit: false,
  };

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
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(readText(packageJsonPath));

  if (packageJson.main !== 'index.js') {
    fail(
      `package.json main must be index.js before Android RTL build, found ${JSON.stringify(packageJson.main)}`
    );
  }

  const requiredFiles = ['index.js', 'lib/rtl.ts', 'app/_layout.tsx'];

  for (const relativePath of requiredFiles) {
    const filePath = path.join(projectRoot, relativePath);

    if (!fs.existsSync(filePath)) {
      fail(`Missing required RTL build source file: ${relativePath}`);
    }
  }

  const rtlSource = readText(path.join(projectRoot, 'lib/rtl.ts'));
  const rootLayout = readText(path.join(projectRoot, 'app/_layout.tsx'));

  if (!rtlSource.includes(RTL_MARKER)) {
    fail(`RTL architecture marker missing from lib/rtl.ts: ${RTL_MARKER}`);
  }

  if (!rootLayout.includes('RTL_ARCHITECTURE_MARKER')) {
    fail(
      'Root layout must expose RTL_ARCHITECTURE_MARKER so Android APK artifacts can be verified.'
    );
  }
}

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args.projectRoot);

verifySource(projectRoot);

if (args.requireCleanGit) {
  verifyCleanGit(projectRoot);
}

// biome-ignore lint/suspicious/noConsole: CLI verifier reports pass/fail status.
console.log('RTL build source verified.');
