import { describe, expect, test } from 'bun:test';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const SCRIPT_PATH = 'scripts/verify-android-rtl-apk.mjs';
const RTL_ARCHITECTURE_MARKER = 'stampaix-rtl-physical-right-v3';

function createFixtureApk({ bundleText, appConfig }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stampaix-apk-test-'));
  const archiveRoot = path.join(tempRoot, 'archive');
  const assetsDir = path.join(archiveRoot, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, 'index.android.bundle'), bundleText);

  if (appConfig !== undefined) {
    fs.writeFileSync(path.join(assetsDir, 'app.config'), appConfig);
  }

  const apkPath = path.join(tempRoot, 'fixture.apk');
  execFileSync('tar', ['-cf', apkPath, '-C', archiveRoot, 'assets']);

  return {
    apkPath,
    cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function runVerifier(apkPath) {
  return spawnSync(process.execPath, [SCRIPT_PATH, apkPath], {
    encoding: 'utf8',
  });
}

function runVerifierAsync(apkPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, apkPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function serveFile(filePath) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_request, response) => {
      fs.createReadStream(filePath)
        .on('error', (error) => {
          response.destroy(error);
        })
        .pipe(response);
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address == null || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to bind fixture HTTP server.'));
        return;
      }

      resolve({
        url: `http://127.0.0.1:${address.port}/fixture.apk`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

describe('verify Android RTL APK script', () => {
  test('passes when the embedded bundle contains the RTL architecture marker', () => {
    const fixture = createFixtureApk({
      bundleText: `bundle:${RTL_ARCHITECTURE_MARKER}`,
      appConfig:
        '{"scheme":"stampix","android":{"package":"com.stampix.stampix"}}',
    });

    try {
      const result = runVerifier(fixture.apkPath);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        'PASS: APK contains RTL architecture marker'
      );
    } finally {
      fixture.cleanup();
    }
  });

  test('passes without app.config when the embedded bundle marker is present', () => {
    const fixture = createFixtureApk({
      bundleText: `bundle:${RTL_ARCHITECTURE_MARKER}`,
    });

    try {
      const result = runVerifier(fixture.apkPath);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        'PASS: APK contains RTL architecture marker'
      );
    } finally {
      fixture.cleanup();
    }
  });

  test('passes when given an APK artifact URL', async () => {
    const fixture = createFixtureApk({
      bundleText: `bundle:${RTL_ARCHITECTURE_MARKER}`,
      appConfig:
        '{"scheme":"stampix","android":{"package":"com.stampix.stampix"}}',
    });
    const server = await serveFile(fixture.apkPath);

    try {
      const result = await runVerifierAsync(server.url);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        'PASS: APK contains RTL architecture marker'
      );
    } finally {
      await server.close();
      fixture.cleanup();
    }
  });

  test('fails when the embedded bundle marker is missing', () => {
    const fixture = createFixtureApk({
      bundleText: 'bundle-without-current-rtl-marker',
      appConfig:
        '{"scheme":"stampix","android":{"package":"com.stampix.stampix"}}',
    });

    try {
      const result = runVerifier(fixture.apkPath);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('RTL architecture marker missing');
    } finally {
      fixture.cleanup();
    }
  });
});
