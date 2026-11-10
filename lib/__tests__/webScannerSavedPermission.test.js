import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { startPreviouslyGrantedCamera } from '../web-scanner/cameraPermission';

describe('saved browser camera permission', () => {
  test('starts only when the browser reports a grant and scanner safety allows it', async () => {
    let starts = 0;
    const permissions = {
      query: async ({ name }) => {
        expect(name).toBe('camera');
        return { state: 'granted' };
      },
    };
    expect(
      await startPreviouslyGrantedCamera({
        permissions,
        allowed: () => true,
        start: async () => {
          starts++;
        },
      })
    ).toBe(true);
    expect(starts).toBe(1);
  });
  test('never triggers a permission prompt for unknown, denied or unsupported permission', async () => {
    for (const permissions of [
      undefined,
      { query: async () => ({ state: 'prompt' }) },
      { query: async () => ({ state: 'denied' }) },
      {
        query: async () => {
          throw new Error('unsupported');
        },
      },
    ]) {
      let starts = 0;
      expect(
        await startPreviouslyGrantedCamera({
          permissions,
          allowed: () => true,
          start: async () => {
            starts++;
          },
        })
      ).toBe(false);
      expect(starts).toBe(0);
    }
  });
  test('rechecks current scope/recovery/visibility after an asynchronous permission lookup', async () => {
    let allowed = true;
    let resolve;
    let starts = 0;
    const result = startPreviouslyGrantedCamera({
      permissions: {
        query: () =>
          new Promise((r) => {
            resolve = r;
          }),
      },
      allowed: () => allowed,
      start: async () => {
        starts++;
      },
    });
    allowed = false;
    resolve({ state: 'granted' });
    expect(await result).toBe(false);
    expect(starts).toBe(0);
  });
  test('runtime integration keeps lock, pending receipt and manual confirmation gates', () => {
    const source = readFileSync(
      'components/web-scanner/BusinessScanner.web.tsx',
      'utf8'
    );
    expect(source.indexOf('startPreviouslyGrantedCamera({')).toBeGreaterThan(
      source.indexOf('navigator.locks.request(')
    );
    expect(source).toContain("engine.state.phase === 'IDLE'");
    expect(source).toContain('current.current.canStartScan !== false');
    expect(source).toContain("document.visibilityState === 'visible'");
    expect(source).toContain('אישור חותמת');
    expect(source).toContain('אישור מימוש');
    const route = readFileSync(
      'app/(web-business)/business/scanner-preview.web.tsx',
      'utf8'
    );
    expect(route).toContain('disabled={busy || !!priorProgram}');
    expect(route).toContain('key={`${user._id}:${activeBusinessId}`}');
  });
});
