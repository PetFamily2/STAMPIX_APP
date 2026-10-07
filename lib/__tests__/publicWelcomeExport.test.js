import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exportPublicWelcome } from '../../scripts/lib/public-welcome-export';

test('public entry works without the application, exposes only public links, and leaves the SPA untouched', () => {
  const output = mkdtempSync(path.join(tmpdir(), 'public-welcome-'));
  try {
    exportPublicWelcome(output, true);
    const html = readFileSync(path.join(output, 'welcome.html'), 'utf8');
    expect(html).toContain('data-public-welcome="true"');
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('/pwa/welcome.js');
    expect(html).not.toMatch(
      /_expo\/static|convex|auth:|token|password|QR|localStorage|sessionStorage/
    );
    exportPublicWelcome(output, false);
    expect(
      readFileSync(path.join(output, 'welcome.html'), 'utf8')
    ).not.toContain('/pwa/welcome.js');
    const registration = readFileSync('public/pwa/welcome.js', 'utf8');
    expect(registration).not.toMatch(
      /skipWaiting|location.reload|UPDATE_SAFETY|fetch\(|storage|console|analytics/
    );
  } finally {
    rmSync(output, { recursive: true });
  }
});
