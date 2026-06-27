import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RTL_ARCHITECTURE_MARKER = 'stampaix-rtl-native-row-right-v4';
const EMBEDDED_BUNDLE_PATH = 'assets/index.android.bundle';
const EMBEDDED_CONFIG_PATH = 'assets/app.config';

function fail(message) {
  // biome-ignore lint/suspicious/noConsole: CLI verifier must print actionable failures.
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function usage() {
  // biome-ignore lint/suspicious/noConsole: CLI verifier must print usage.
  console.error(
    'Usage: node scripts/verify-android-rtl-apk.mjs <path-or-url-to-apk>'
  );
  process.exit(2);
}

const apkPath = process.argv[2];

if (!apkPath) {
  usage();
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stampaix-rtl-apk-'));

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

async function resolveApkPath(input) {
  if (!isHttpUrl(input)) {
    const resolvedPath = path.resolve(input);
    if (!fs.existsSync(resolvedPath)) {
      fail(`APK not found: ${resolvedPath}`);
    }
    return resolvedPath;
  }

  const response = await fetch(input, { redirect: 'follow' });
  if (!response.ok) {
    fail(
      `Failed to download APK: HTTP ${response.status} ${response.statusText}`
    );
  }

  const downloadedApkPath = path.join(tempDir, 'downloaded.apk');
  fs.writeFileSync(
    downloadedApkPath,
    Buffer.from(await response.arrayBuffer())
  );
  return downloadedApkPath;
}

try {
  const resolvedApkPath = await resolveApkPath(apkPath);

  execFileSync('tar', [
    '-xf',
    resolvedApkPath,
    '-C',
    tempDir,
    EMBEDDED_BUNDLE_PATH,
  ]);

  const bundlePath = path.join(tempDir, EMBEDDED_BUNDLE_PATH);
  if (!fs.existsSync(bundlePath)) {
    fail(`Embedded bundle missing from APK: ${EMBEDDED_BUNDLE_PATH}`);
  }

  const bundle = fs.readFileSync(bundlePath);
  if (!bundle.includes(Buffer.from(RTL_ARCHITECTURE_MARKER))) {
    fail(
      `RTL architecture marker missing from embedded Android bundle: ${RTL_ARCHITECTURE_MARKER}`
    );
  }

  try {
    execFileSync('tar', [
      '-xf',
      resolvedApkPath,
      '-C',
      tempDir,
      EMBEDDED_CONFIG_PATH,
    ]);
  } catch {
    // Some artifacts may omit app.config; the embedded bundle marker is the
    // required RTL proof.
  }

  const configPath = path.join(tempDir, EMBEDDED_CONFIG_PATH);
  if (fs.existsSync(configPath)) {
    const configSource = fs
      .readFileSync(configPath, 'utf8')
      .replace(/^\uFEFF/, '');
    const config = JSON.parse(configSource);
    if (config?.android?.package !== 'com.stampix.stampix') {
      fail(
        `Unexpected Android package in embedded app config: ${config?.android?.package ?? '<missing>'}`
      );
    }
    if (config?.scheme !== 'stampix') {
      fail(
        `Unexpected app scheme in embedded app config: ${config?.scheme ?? '<missing>'}`
      );
    }
  }

  // biome-ignore lint/suspicious/noConsole: CLI verifier reports pass/fail status.
  console.log(
    `PASS: APK contains RTL architecture marker (${RTL_ARCHITECTURE_MARKER}).`
  );
  // biome-ignore lint/suspicious/noConsole: CLI verifier reports the inspected artifact.
  console.log(`APK: ${isHttpUrl(apkPath) ? apkPath : resolvedApkPath}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
