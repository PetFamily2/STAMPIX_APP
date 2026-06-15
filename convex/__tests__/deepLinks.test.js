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
      'stampix://join?biz=biz_123&ref=ref_456&bref=bref_789&src=qr+counter&camp=summer'
    );
  });

  test('fallback app link supports referral-only links', () => {
    expect(
      buildJoinFallbackOpenAppUrl({
        ref: 'ref_456',
      })
    ).toBe('stampix://join?ref=ref_456');

    expect(
      buildJoinFallbackOpenAppUrl({
        bref: 'bref_789',
      })
    ).toBe('stampix://join?bref=bref_789');
  });

  test('generated join links use the production stampix.app domain', () => {
    const dashboardSource = readFileSync(
      'app/(authenticated)/(business)/dashboard.tsx',
      'utf8'
    );
    const qrSource = readFileSync(
      'app/(authenticated)/(business)/qr.tsx',
      'utf8'
    );
    const referralsSource = readFileSync('convex/referrals.ts', 'utf8');

    expect(dashboardSource).toContain('https://stampix.app/join');
    expect(qrSource).toContain('https://stampix.app/join');
    expect(referralsSource).toContain('https://stampix.app/join');
    expect(dashboardSource).not.toContain('app.stampaix.com/join');
    expect(qrSource).not.toContain('app.stampaix.com/join');
    expect(referralsSource).not.toContain('app.stampaix.com/join');
  });
});

describe('Phase C2 OAuth redirect safety', () => {
  test('production keeps app scheme redirects and blocks Expo dev prefixes', () => {
    const productionEnv = {
      CONVEX_DEPLOYMENT: 'prod:stampix',
      CONVEX_SITE_URL: 'https://stampix.app',
    };

    expect(
      isAllowedAuthAppRedirect('stampix://oauth-callback', productionEnv)
    ).toBeTrue();
    expect(
      isAllowedAuthAppRedirect('exp://127.0.0.1:8081', productionEnv)
    ).toBeFalse();
    expect(
      isAllowedAuthAppRedirect('https://auth.expo.io/@owner/app', productionEnv)
    ).toBeFalse();
  });

  test('development Expo redirects remain available outside production', () => {
    const developmentEnv = {
      CONVEX_DEPLOYMENT: 'dev:stampix',
      CONVEX_SITE_URL: 'https://stampix-dev.convex.site',
    };

    expect(resolveAuthRedirectUrl('exp://127.0.0.1:8081', developmentEnv)).toBe(
      'exp://127.0.0.1:8081'
    );
    expect(
      resolveAuthRedirectUrl('https://auth.expo.io/@owner/app', developmentEnv)
    ).toBe('https://auth.expo.io/@owner/app');
  });

  test('production resolves safe relative redirects through the site URL', () => {
    expect(
      resolveAuthRedirectUrl('/oauth-callback', {
        NODE_ENV: 'production',
        CONVEX_SITE_URL: 'https://stampix.app',
      })
    ).toBe('https://stampix.app/oauth-callback');
  });
});
