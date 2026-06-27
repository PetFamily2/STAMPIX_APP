import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT_PATH = 'scripts/verify-rtl-build-source.mjs';

function runScript(args = []) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

function createFixture({ marker = true, main = 'index.js' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stampaix-rtl-source-'));

  fs.mkdirSync(path.join(root, 'app'), { recursive: true });
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'index.js'),
    "import 'expo-router/entry';\n"
  );
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ main }));
  fs.writeFileSync(
    path.join(root, 'lib/rtl.ts'),
    marker
      ? "export const RTL_ARCHITECTURE_MARKER = 'stampaix-rtl-native-row-right-v4';\n"
      : ''
  );
  fs.writeFileSync(
    path.join(root, 'app/_layout.tsx'),
    'const marker = RTL_ARCHITECTURE_MARKER;\n'
  );

  return root;
}

describe('verify RTL build source script', () => {
  test('passes on current source without requiring clean git', () => {
    const result = runScript();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('RTL build source verified.');
  });

  test('fails when the RTL marker is missing', () => {
    const fixture = createFixture({ marker: false });
    const result = runScript(['--project-root', fixture]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'RTL architecture marker missing from lib/rtl.ts'
    );
  });

  test('fails when package main is not the native RTL entrypoint', () => {
    const fixture = createFixture({ main: 'expo-router/entry' });
    const result = runScript(['--project-root', fixture]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('package.json main must be index.js');
  });

  test('keeps Android EAS builds behind the source verifier', () => {
    const wrapper = fs.readFileSync('scripts/eas-run.ps1', 'utf8');

    expect(wrapper).toContain('verify-rtl-build-source.mjs');
    expect(wrapper).toContain('--require-clean-git');
    expect(wrapper).toContain(
      "$platform -eq 'android' -or $platform -eq 'all'"
    );
  });
});
