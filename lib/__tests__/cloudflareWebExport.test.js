import { describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CLOUDFLARE_PREVIEW_BACKEND,
  prepareCloudflarePreview,
} from '../../scripts/lib/cloudflare-web-export.mjs';

const revision = 'a'.repeat(40);
function fixture(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'stampaix-cf-test-'));
  if (
    path.dirname(root) !== path.resolve(tmpdir()) ||
    !path.basename(root).startsWith('stampaix-cf-test-')
  ) {
    throw new Error('UNSAFE_TEST_CLEANUP');
  }
  try {
    mkdirSync(path.join(root, 'pwa'));
    writeFileSync(
      path.join(root, 'index.html'),
      '<html lang="he" dir="rtl"></html>'
    );
    writeFileSync(
      path.join(root, 'pwa/release.json'),
      JSON.stringify({ revision, offlineWrites: false })
    );
    return run(root);
  } finally {
    rmSync(root, { recursive: true });
  }
}
describe('Cloudflare Web Preview artifact boundary', () => {
  test('binds routing, safe browser capabilities and service-worker freshness to the exported revision', () =>
    fixture((root) => {
      const result = prepareCloudflarePreview(root, {
        revision,
        backendUrl: CLOUDFLARE_PREVIEW_BACKEND,
      });
      expect(result.files).toBe(2);
      const headers = readFileSync(path.join(root, '_headers'), 'utf8');
      expect(headers).toContain(
        'camera=(self), geolocation=(self), microphone=()'
      );
      expect(headers).toContain('Service-Worker-Allowed: /');
      expect(headers).toContain("frame-ancestors 'none'");
      expect(headers).toContain('X-Robots-Tag: noindex, nofollow');
      const routing = readFileSync(path.join(root, '_redirects'), 'utf8');
      expect(routing).not.toContain('/welcome /welcome.html');
      expect(routing).not.toMatch(/^\s*\/.*\.html\s+200/m);
      expect(
        JSON.parse(readFileSync(path.join(root, 'pwa/hosting.json'), 'utf8'))
      ).toMatchObject({
        revision,
        environment: 'preview',
        offlineWrites: false,
      });
    }));
  test('rejects an artifact that disables Pages automatic SPA routing', () =>
    fixture((root) => {
      writeFileSync(path.join(root, '404.html'), 'not a SPA');
      expect(() =>
        prepareCloudflarePreview(root, {
          revision,
          backendUrl: CLOUDFLARE_PREVIEW_BACKEND,
        })
      ).toThrow('CLOUDFLARE_SPA_FALLBACK_DISABLED');
    }));
  test('cannot label a Production backend, modified release or hidden environment file as this Preview', () =>
    fixture((root) => {
      expect(() =>
        prepareCloudflarePreview(root, {
          revision,
          backendUrl: 'https://aware-llama-850.convex.cloud',
        })
      ).toThrow('CLOUDFLARE_PREVIEW_SCOPE_INVALID');
      expect(() =>
        prepareCloudflarePreview(root, {
          revision: 'b'.repeat(40),
          backendUrl: CLOUDFLARE_PREVIEW_BACKEND,
        })
      ).toThrow('CLOUDFLARE_EXPORT_REVISION_MISMATCH');
      writeFileSync(path.join(root, '.env'), 'FORBIDDEN');
      expect(() =>
        prepareCloudflarePreview(root, {
          revision,
          backendUrl: CLOUDFLARE_PREVIEW_BACKEND,
        })
      ).toThrow('CLOUDFLARE_UNEXPECTED_ARTIFACT');
    }));
});
