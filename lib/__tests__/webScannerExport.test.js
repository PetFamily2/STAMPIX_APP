import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('Phase 3 asset and Native boundaries', () => {
  test('business worker is local Preview-only and removed on reused Production output', () => {
    const output = mkdtempSync(path.join(tmpdir(), 'web-scanner3-'));
    try {
      const run = (environment) =>
        execFileSync(
          process.execPath,
          ['scripts/export-web-scanner-business.mjs', output],
          { env: { ...process.env, EXPO_PUBLIC_APP_ENV: environment } }
        );
      run('preview');
      expect(
        existsSync(path.join(output, 'scanner-business-assets/qr-worker.js'))
      ).toBe(true);
      const worker = readFileSync(
        path.join(output, 'scanner-business-assets/qr-worker.js'),
        'utf8'
      );
      expect(worker).toContain("importScripts('./jsqr-1.4.0.js')");
      expect(worker).not.toMatch(/https:|console|storage|analytics/);
      run('production');
      expect(existsSync(path.join(output, 'scanner-business-assets'))).toBe(
        false
      );
    } finally {
      rmSync(output, { recursive: true });
    }
  });
  test('Native route companions have no business command/camera imports', () => {
    for (const file of [
      'app/(web-business)/business/scanner-preview.tsx',
      'app/(web-staff)/staff/scanner-preview.tsx',
    ]) {
      expect(readFileSync(file, 'utf8')).toBe(
        "export { NativeCompanionRedirect as default } from '@/components/navigation/NativeCompanionRedirect';\n"
      );
    }
  });
});

test('latent Production pilot assets require exact attestation, backend target and both allowlists', () => {
  const output = mkdtempSync(path.join(tmpdir(), 'scanner-pilot-'));
  const env = {
    ...process.env,
    EXPO_PUBLIC_APP_ENV: 'production',
    EXPO_PUBLIC_PWA_RELEASE_GATE: 'device-verified-pilot-v1',
    EXPO_PUBLIC_WEB_SCANNER_COMMANDS: 'true',
    EXPO_PUBLIC_WEB_SCANNER_BACKEND: 'verified-production',
    EXPO_PUBLIC_CONVEX_URL_PROD: 'https://synthetic-production.convex.cloud',
    EXPO_PUBLIC_WEB_SCANNER_PILOT_ACTORS: 'synthetic',
    EXPO_PUBLIC_WEB_SCANNER_PILOT_BUSINESSES: 'synthetic-business',
    EXPO_PUBLIC_WEB_SCANNER_PREVIEW_URL:
      'https://synthetic-preview.convex.cloud',
  };
  const run = (values) =>
    execFileSync(
      process.execPath,
      ['scripts/export-web-scanner-business.mjs', output],
      { env: values }
    );
  try {
    run(env);
    expect(
      existsSync(path.join(output, 'scanner-business-assets/qr-worker.js'))
    ).toBe(true);
    for (const change of [
      { EXPO_PUBLIC_PWA_RELEASE_GATE: '' },
      { EXPO_PUBLIC_WEB_SCANNER_COMMANDS: 'false' },
      { EXPO_PUBLIC_WEB_SCANNER_BACKEND: 'verified-preview' },
      { EXPO_PUBLIC_WEB_SCANNER_PILOT_ACTORS: '' },
      { EXPO_PUBLIC_WEB_SCANNER_PILOT_BUSINESSES: '' },
      { EXPO_PUBLIC_CONVEX_URL_PROD: env.EXPO_PUBLIC_WEB_SCANNER_PREVIEW_URL },
    ]) {
      run({ ...env, ...change });
      expect(existsSync(path.join(output, 'scanner-business-assets'))).toBe(
        false
      );
    }
  } finally {
    rmSync(output, { recursive: true });
  }
});
