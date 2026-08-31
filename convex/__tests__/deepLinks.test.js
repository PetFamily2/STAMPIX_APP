import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { isAllowedAuthAppRedirect, resolveAuthRedirectUrl } from '../auth';
import { buildJoinFallbackOpenAppUrl } from '../http';

describe('Phase C2 join links', () => {
  test('fallback app link preserves supported join params on the app scheme', () => {
    expect(
      buildJoinFallbackOpenAppUrl({
        biz: 'biz_123',
        ref: 'ref_456',
        bref: 'bref_789',
        src: 'qr counter',
        camp: 'summer',
      })
    ).toBe(
      'stampaix://join?biz=biz_123&ref=ref_456&bref=bref_789&src=qr+counter&camp=summer'
    );
  });

  test('fallback app link supports referral-only links', () => {
    expect(
      buildJoinFallbackOpenAppUrl({
        ref: 'ref_456',
      })
    ).toBe('stampaix://join?ref=ref_456');

    expect(
      buildJoinFallbackOpenAppUrl({
        bref: 'bref_789',
      })
    ).toBe('stampaix://join?bref=bref_789');
  });

  test('generated join links use the production stampaix.com domain', () => {
    const qrSource = readFileSync(
      'app/(authenticated)/(business)/qr.tsx',
      'utf8'
    );
    const referralsSource = readFileSync('convex/referrals.ts', 'utf8');

    expect(qrSource).toContain("const BASE_URL = 'https://stampaix.com/join'");
    expect(qrSource).toContain('return `${BASE_URL}?${params.toString()}`');
    expect(referralsSource).toContain(
      'return `https://stampaix.com/join?ref=${encodeURIComponent(code)}`'
    );
    expect(referralsSource).toContain(
      'return `https://stampaix.com/join?bref=${encodeURIComponent(code)}`'
    );
  });
});

describe('Phase C2 OAuth redirect safety', () => {
  test('production keeps app scheme redirects and blocks Expo dev prefixes', () => {
    const productionEnv = {
      CONVEX_DEPLOYMENT: 'prod:stampaix',
      CONVEX_SITE_URL: 'https://example-deployment.convex.site',
    };

    expect(
      isAllowedAuthAppRedirect('stampaix://oauth-callback', productionEnv)
    ).toBeTrue();
    expect(
      isAllowedAuthAppRedirect('exp://127.0.0.1:8081', productionEnv)
    ).toBeFalse();
    expect(
      isAllowedAuthAppRedirect('exps://127.0.0.1:8081', productionEnv)
    ).toBeFalse();
    expect(
      isAllowedAuthAppRedirect('https://auth.expo.io/@owner/app', productionEnv)
    ).toBeFalse();
  });

  test('development Expo redirects remain available outside production', () => {
    const developmentEnv = {
      CONVEX_DEPLOYMENT: 'dev:stampaix',
      CONVEX_SITE_URL: 'https://stampaix-dev.convex.site',
    };

    expect(resolveAuthRedirectUrl('exp://127.0.0.1:8081', developmentEnv)).toBe(
      'exp://127.0.0.1:8081'
    );
    expect(
      resolveAuthRedirectUrl('https://auth.expo.io/@owner/app', developmentEnv)
    ).toBe('https://auth.expo.io/@owner/app');
    expect(
      resolveAuthRedirectUrl('exps://127.0.0.1:8081', developmentEnv)
    ).toBe('exps://127.0.0.1:8081');
  });

  test('production resolves safe relative redirects through the site URL', () => {
    expect(
      resolveAuthRedirectUrl('/oauth-callback', {
        NODE_ENV: 'production',
        CONVEX_SITE_URL: 'https://example-deployment.convex.site',
      })
    ).toBe('https://example-deployment.convex.site/oauth-callback');
  });

  test('SITE_URL fallback is used only when CONVEX_SITE_URL is missing', () => {
    expect(
      resolveAuthRedirectUrl('/oauth-callback', {
        NODE_ENV: 'production',
        SITE_URL: 'https://stampaix-fallback.example',
      })
    ).toBe('https://stampaix-fallback.example/oauth-callback');
  });

  test('relative OAuth redirects require a configured auth site URL', () => {
    expect(() =>
      resolveAuthRedirectUrl('/oauth-callback', {
        NODE_ENV: 'production',
      })
    ).toThrow('Missing auth site URL');
  });
});
