import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('Business Web Preview OAuth callback contract', () => {
  test('allows only StampAix Business Web EAS Preview origins', () => {
    const source = readFileSync('convex/auth.ts', 'utf8');

    expect(source).toContain(
      "/^https:\\/\\/stampaix-business--[a-z0-9]+\\.expo\\.app$/"
    );
    expect(source).toContain(
      'WEB_OAUTH_PREVIEW_ORIGIN_PATTERN.test(url.origin)'
    );
    expect(source).not.toContain("url.hostname.endsWith('.expo.app')");
    expect(source).not.toContain("url.origin.includes('expo.app')");
  });
});
