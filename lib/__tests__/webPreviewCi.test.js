import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dir, '../..');
function withWorkspace(callback) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'stampaix-phase1-'));
  try {
    return callback(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
function run(script, cwd, args = [], env = {}) {
  return spawnSync('node', [path.join(root, 'scripts', script), ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

describe('Preview public environment boundary', () => {
  test('uses Preview rollout and never exports private deployment variables', () =>
    withWorkspace((cwd) => {
      writeFileSync(
        path.join(cwd, '.env.preview-pulled'),
        [
          'EXPO_PUBLIC_CONVEX_URL_DEV=https://fixture-dev.convex.cloud',
          'EXPO_PUBLIC_CONVEX_URL_PROD=https://fixture-prod.convex.cloud',
          'EXPO_PUBLIC_APP_ENV=production',
          'EXPO_PUBLIC_WEB_ROLE_ROUTING=false',
          'CONVEX_DEPLOY_KEY=fixture-private-value',
        ].join('\n')
      );
      const result = run('prepare-web-preview-env.mjs', cwd);
      expect(result.status).toBe(0);
      const exported = readFileSync(path.join(cwd, '.env.local'), 'utf8');
      expect(exported).toContain('EXPO_PUBLIC_APP_ENV="preview"');
      expect(exported).toContain('EXPO_PUBLIC_WEB_ROLE_ROUTING="true"');
      expect(exported).not.toContain('CONVEX_DEPLOY_KEY');
      expect(exported).not.toContain('fixture-private-value');
    }));
  test.each([
    '',
    'EXPO_PUBLIC_CONVEX_URL_DEV=http://fixture-dev.convex.cloud',
    'EXPO_PUBLIC_CONVEX_URL_DEV=https://other.example',
    'EXPO_PUBLIC_CONVEX_URL_DEV=https://fixture-prod.convex.cloud\nEXPO_PUBLIC_CONVEX_URL_PROD=https://fixture-prod.convex.cloud',
    'EXPO_PUBLIC_CONVEX_URL_DEV=https://fixture-dev.convex.cloud\nEXPO_PUBLIC_CONVEX_URL_PROD=not-a-url',
  ])('fails closed for invalid public backend configuration (%#)', (source) =>
    withWorkspace((cwd) => {
      writeFileSync(path.join(cwd, '.env.preview-pulled'), source);
      expect(run('prepare-web-preview-env.mjs', cwd).status).not.toBe(0);
    }));
});

describe('Preview deployment reporting', () => {
  test('reports the unique Preview and exact verified head', () =>
    withWorkspace((cwd) => {
      const url = 'https://stampaix-business--fixture123.expo.app';
      writeFileSync(path.join(cwd, 'eas-deploy.json'), JSON.stringify({ url }));
      const summary = path.join(cwd, 'summary.md');
      const result = run('report-web-preview-url.mjs', cwd, [], {
        GITHUB_STEP_SUMMARY: summary,
        VERIFIED_HEAD_SHA: 'verified-head-fixture',
        GITHUB_SHA: 'merge-fixture',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(url);
      const content = readFileSync(summary, 'utf8');
      expect(content).toContain('verified-head-fixture');
      expect(content).not.toContain('merge-fixture');
    }));
  test.each([
    'https://stampaix-business.expo.app',
    'https://unknown.expo.app',
    'http://stampaix-business--fixture.expo.app',
  ])('rejects a non-Preview URL (%s)', (url) =>
    withWorkspace((cwd) => {
      writeFileSync(path.join(cwd, 'eas-deploy.json'), JSON.stringify({ url }));
      expect(run('report-web-preview-url.mjs', cwd).status).not.toBe(0);
    }));
});

describe('client secret pattern gate', () => {
  test('a parser header literal without key material is ordinary source', () =>
    withWorkspace((cwd) => {
      writeFileSync(
        path.join(cwd, 'parser.js'),
        'const header = "-----BEGIN PRIVATE KEY-----";'
      );
      expect(run('verify-client-secret-patterns.mjs', cwd, [cwd]).status).toBe(
        0
      );
    }));
  test('rejects private key material', () =>
    withWorkspace((cwd) => {
      writeFileSync(
        path.join(cwd, 'client.js'),
        `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(64)}`
      );
      expect(
        run('verify-client-secret-patterns.mjs', cwd, [cwd]).status
      ).not.toBe(0);
    }));
  test('accepts ordinary client code', () =>
    withWorkspace((cwd) => {
      writeFileSync(
        path.join(cwd, 'client.js'),
        'const publicValue = "fixture";'
      );
      expect(run('verify-client-secret-patterns.mjs', cwd, [cwd]).status).toBe(
        0
      );
    }));
  test('rejects a credential pattern without printing its value', () =>
    withWorkspace((cwd) => {
      const fixture = ['ghp', '_', 'a'.repeat(40)].join('');
      writeFileSync(path.join(cwd, 'client.js'), fixture);
      const result = run('verify-client-secret-patterns.mjs', cwd, [cwd]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Value withheld');
      expect(result.stderr).not.toContain(fixture);
    }));
  test('fails when there are no client artifacts', () =>
    withWorkspace((cwd) => {
      expect(
        run('verify-client-secret-patterns.mjs', cwd, [cwd]).status
      ).not.toBe(0);
    }));
});
