import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolveAuthRedirectUrl } from '../auth';

describe('Business Web Preview OAuth callback contract', () => {
  test('Cloudflare callbacks stay inside the owner project and non-production environment', () => {
    const development = {
      STAMPAIX_ENV: 'development',
      CONVEX_SITE_URL: 'https://utmost-fennec-280.convex.site',
    };
    for (const origin of [
      'https://stampaix-web-preview.pages.dev',
      'https://ffaaca2.stampaix-web-preview.pages.dev',
      'https://preview.stampaix-web-preview.pages.dev',
    ]) {
      const callback = `${origin}/oauth-callback`;
      expect(resolveAuthRedirectUrl(callback, development)).toBe(callback);
      expect(() =>
        resolveAuthRedirectUrl(callback, {
          ...development,
          STAMPAIX_ENV: 'production',
        })
      ).toThrow();
    }
    for (const origin of [
      'https://attacker.pages.dev',
      'https://stampaix-web-preview.pages.dev.attacker.example',
      'https://attacker-stampaix-web-preview.pages.dev',
      'http://stampaix-web-preview.pages.dev',
    ]) {
      expect(() =>
        resolveAuthRedirectUrl(`${origin}/oauth-callback`, development)
      ).toThrow();
    }
    expect(() =>
      resolveAuthRedirectUrl(
        'https://stampaix-web-preview.pages.dev/other',
        development
      )
    ).toThrow();
  });
  test('allows only StampAix Business Web EAS Preview origins', () => {
    const source = readFileSync('convex/auth.ts', 'utf8');

    expect(source).toContain(
      '/^https:\\/\\/stampaix-business--[a-z0-9]+\\.expo\\.app$/'
    );
    expect(source).toContain(
      'WEB_OAUTH_PREVIEW_ORIGIN_PATTERN.test(url.origin)'
    );
    expect(source).not.toContain("url.hostname.endsWith('.expo.app')");
    expect(source).not.toContain("url.origin.includes('expo.app')");
  });
});
