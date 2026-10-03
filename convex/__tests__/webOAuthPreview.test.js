import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('Business Web Preview OAuth callback contract', () => {
  test('allows only the exact StampAix Preview origin in addition to Production', () => {
    const source = readFileSync('convex/auth.ts', 'utf8');

    expect(source).toContain(
      "'https://stampaix-business--xzgle8lvvv.expo.app'"
    );
    expect(source).toContain('WEB_OAUTH_PREVIEW_ORIGINS.has(url.origin)');
    expect(source).not.toContain("url.hostname.endsWith('.expo.app')");
    expect(source).not.toContain("url.origin.includes('expo.app')");
  });
});
