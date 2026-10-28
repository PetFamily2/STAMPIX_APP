import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('independent lab build boundary', () => {
  test('Preview includes local decoder and deny-network CSP; Production removes reused lab', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'stampaix-qr-lab-'));
    try {
      const run = (env) =>
        spawnSync(process.execPath, ['scripts/export-qr-lab.mjs', directory], {
          cwd: path.resolve(import.meta.dir, '../..'),
          env: { ...process.env, ...env },
          encoding: 'utf8',
        });
      const preview = run({
        EXPO_PUBLIC_APP_ENV: 'preview',
        EXPO_PUBLIC_WEB_QR_LAB: 'true',
      });
      expect(preview.stderr).toBe('');
      expect(preview.status).toBe(0);
      const html = readFileSync(
        path.join(directory, 'scanner-lab/index.html'),
        'utf8'
      );
      expect(html).toContain("connect-src 'none'");
      expect(html).not.toContain('convex');
      expect(
        existsSync(path.join(directory, 'scanner-lab/jsqr-1.4.0.js'))
      ).toBe(true);
      expect(
        readFileSync(path.join(directory, 'scanner-lab/lab.js'), 'utf8')
      ).not.toContain('convex');
      expect(
        run({
          EXPO_PUBLIC_APP_ENV: 'production',
          EXPO_PUBLIC_WEB_QR_LAB: 'true',
        }).status
      ).toBe(0);
      expect(existsSync(path.join(directory, 'scanner-lab'))).toBe(false);
      expect(
        run({ EXPO_PUBLIC_APP_ENV: 'preview', EXPO_PUBLIC_WEB_QR_LAB: 'false' })
          .status
      ).toBe(0);
      expect(existsSync(path.join(directory, 'scanner-lab'))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
