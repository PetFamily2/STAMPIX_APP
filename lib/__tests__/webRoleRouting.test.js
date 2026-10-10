import { describe, expect, test } from 'bun:test';
import {
  POST_AUTH_ROUTES,
  resolveAuthGroupDisposition,
  resolvePlatformPostAuthHref,
  resolvePostAuthRoute,
  WEB_BUSINESS_PROOF_HREF,
  WEB_STAFF_LANDING_HREF,
} from '../auth/postAuthRouting';
import { resolveWebRoleRoutingFlag } from '../auth/webRoleRouting';
import { resolveWebAuthenticatedRouteGuard } from '../navigation/webAuthenticatedRouteGuard';

const user = { customerOnboardedAt: 1, businessOnboardedAt: 1 };
const customer = {
  isAuthLoading: false,
  isAuthenticated: true,
  user,
  sessionContext: {
    activeMode: 'customer',
    activeBusinessId: null,
    businesses: [],
  },
};

function roleInput(role, overrides = {}) {
  return {
    ...customer,
    sessionContext: {
      activeMode: 'business',
      activeBusinessId: 'business_one',
      businesses: [{ id: 'business_one', staffRole: role }],
    },
    ...overrides,
  };
}

describe('Web rollout is explicit for ordinary development and Preview', () => {
  test.each([
    'production',
    '',
    undefined,
    'PREVIEW',
  ])('outside exact Preview (%s), an enabled flag stays off', (appEnvironment) => {
    expect(
      resolveWebRoleRoutingFlag({
        platform: 'web',
        appEnvironment,
        flag: 'true',
      })
    ).toBe(false);
  });
  test.each([
    'false',
    '',
    undefined,
    'TRUE',
    '1',
  ])('Preview with flag %s stays off', (flag) => {
    expect(
      resolveWebRoleRoutingFlag({
        platform: 'web',
        appEnvironment: 'preview',
        flag,
      })
    ).toBe(false);
  });
  test.each([
    'preview',
    'development',
  ])('explicitly enabled Web %s turns the rollout on', (environment) => {
    expect(
      resolveWebRoleRoutingFlag({
        platform: 'web',
        appEnvironment: environment,
        flag: 'true',
      })
    ).toBe(true);
  });
  test.each(['ios', 'android'])('%s ignores the Web flag', (platform) => {
    expect(
      resolveWebRoleRoutingFlag({
        platform,
        appEnvironment: 'preview',
        flag: 'true',
      })
    ).toBe(false);
  });
});

const cases = [
  [
    'customer',
    customer,
    POST_AUTH_ROUTES.customerWallet,
    POST_AUTH_ROUTES.customerWallet,
  ],
  [
    'owner',
    roleInput('owner'),
    POST_AUTH_ROUTES.businessDashboard,
    WEB_BUSINESS_PROOF_HREF,
  ],
  [
    'manager',
    roleInput('manager'),
    POST_AUTH_ROUTES.businessDashboard,
    WEB_BUSINESS_PROOF_HREF,
  ],
  [
    'staff',
    roleInput('staff'),
    POST_AUTH_ROUTES.staffScanner,
    WEB_STAFF_LANDING_HREF,
  ],
  [
    'owner in customer mode',
    roleInput('owner', {
      sessionContext: {
        ...roleInput('owner').sessionContext,
        activeMode: 'customer',
      },
    }),
    POST_AUTH_ROUTES.customerWallet,
    POST_AUTH_ROUTES.customerWallet,
  ],
  [
    'revoked staff membership',
    roleInput('staff', {
      sessionContext: {
        activeMode: 'business',
        activeBusinessId: 'business_one',
        businesses: [],
      },
    }),
    POST_AUTH_ROUTES.customerWallet,
    POST_AUTH_ROUTES.customerWallet,
  ],
  [
    'missing customer onboarding',
    { ...customer, user: { customerOnboardedAt: null } },
    POST_AUTH_ROUTES.nameCapture,
    POST_AUTH_ROUTES.nameCapture,
  ],
  [
    'missing owner onboarding',
    roleInput('owner', { user: { customerOnboardedAt: 1 } }),
    POST_AUTH_ROUTES.merchantOnboarding,
    POST_AUTH_ROUTES.merchantOnboarding,
  ],
  [
    'manager without owner onboarding',
    roleInput('manager', { user: { customerOnboardedAt: 1 } }),
    POST_AUTH_ROUTES.businessDashboard,
    WEB_BUSINESS_PROOF_HREF,
  ],
  [
    'interrupted onboarding',
    { ...customer, hasInProgressBusinessOnboarding: true },
    POST_AUTH_ROUTES.merchantOnboarding,
    POST_AUTH_ROUTES.merchantOnboarding,
  ],
];

describe('role/session/onboarding routing matrix', () => {
  test.each(
    cases
  )('%s preserves Native and chooses the Web landing', (_name, input, nativeHref, webHref) => {
    const resolution = resolvePostAuthRoute(input);
    expect(resolution).toEqual({ status: 'route', href: nativeHref });
    for (const platform of ['ios', 'android']) {
      for (const flag of [false, true]) {
        expect(resolvePlatformPostAuthHref(platform, resolution, flag)).toBe(
          resolution
        );
      }
    }
    expect(resolvePlatformPostAuthHref('web', resolution, true)).toEqual({
      status: 'route',
      href: webHref,
    });
    expect(resolvePlatformPostAuthHref('web', resolution, false)).toEqual({
      status: 'route',
      href: WEB_BUSINESS_PROOF_HREF,
    });
  });
  test.each([
    ['auth loading', { ...customer, isAuthLoading: true }, 'loading'],
    [
      'signed out/logout',
      { ...customer, isAuthenticated: false },
      'unauthenticated',
    ],
    ['user hydrating', { ...customer, user: undefined }, 'loading'],
    [
      'session hydrating',
      { ...customer, sessionContext: undefined },
      'loading',
    ],
    ['no canonical session', { ...customer, sessionContext: null }, 'loading'],
    [
      'business draft hydrating',
      { ...customer, isBusinessOnboardingLoading: true },
      'loading',
    ],
  ])('%s never becomes a privileged route', (_name, input, status) => {
    const resolution = resolvePostAuthRoute(input);
    expect(resolution).toEqual({ status });
    for (const platform of ['web', 'ios', 'android']) {
      expect(resolvePlatformPostAuthHref(platform, resolution, true)).toBe(
        resolution
      );
    }
  });
});

describe('Web direct URL, refresh and onboarding guard', () => {
  function guard(segments, href = POST_AUTH_ROUTES.customerWallet) {
    return resolveWebAuthenticatedRouteGuard({
      resolutionHref: href,
      segments,
      activeMode: 'customer',
      isAdditionalMerchantOnboarding: false,
    });
  }
  test.each([
    '(business)',
    '(staff)',
  ])('customer cold settings URL selects customer screen from %s collision', (group) => {
    expect(guard(['(authenticated)', group, 'settings'])).toEqual({
      action: 'replace',
      href: '/(authenticated)/(customer)/settings',
    });
    expect(
      guard(['(authenticated)', group, 'settings'], WEB_BUSINESS_PROOF_HREF)
    ).toEqual({
      action: 'replace',
      href: WEB_BUSINESS_PROOF_HREF,
    });
  });
  test.each([
    'wallet',
    'rewards',
    'show-qr',
    'discovery',
    'settings',
    'account-details',
  ])('customer refresh stays on %s', (page) =>
    expect(guard(['(authenticated)', '(customer)', page])).toEqual({
      action: 'stay',
    }));
  test.each([
    'card',
    'join',
    'accept-invite',
    'settings-legal',
  ])('shared customer destination %s stays reachable', (page) =>
    expect(guard(['(authenticated)', page])).toEqual({ action: 'stay' }));
  test.each([
    '(business)',
    '(staff)',
    'admin',
    'merchant',
    'unknown',
  ])('customer cannot render Native management route %s', (group) =>
    expect(guard(['(authenticated)', group, 'scanner'])).toEqual({
      action: 'replace',
      href: POST_AUTH_ROUTES.customerWallet,
    }));
  test.each([
    WEB_BUSINESS_PROOF_HREF,
    WEB_STAFF_LANDING_HREF,
  ])('management users land on %s before Native scanner can mount', (href) =>
    expect(guard(['(authenticated)', '(staff)', 'scanner'], href)).toEqual({
      action: 'replace',
      href,
    }));
  test('incomplete customer cannot render Wallet', () => {
    expect(
      guard(
        ['(authenticated)', '(customer)', 'wallet'],
        POST_AUTH_ROUTES.nameCapture
      )
    ).toEqual({ action: 'replace', href: POST_AUTH_ROUTES.nameCapture });
  });
  test('merchant onboarding can stay on a nested step', () => {
    expect(
      guard(
        ['(authenticated)', 'merchant', 'onboarding', 'create-program'],
        POST_AUTH_ROUTES.merchantOnboarding
      )
    ).toEqual({ action: 'stay' });
  });
  test('incomplete business onboarding cannot render other merchant pages', () => {
    expect(
      guard(
        ['(authenticated)', 'merchant', 'settings'],
        POST_AUTH_ROUTES.merchantOnboarding
      )
    ).toEqual({ action: 'replace', href: POST_AUTH_ROUTES.merchantOnboarding });
  });
  test('incomplete customer may continue name capture', () => {
    expect(
      resolveAuthGroupDisposition({
        routeKind: 'customerOnboarding',
        postAuthResolution: {
          status: 'route',
          href: POST_AUTH_ROUTES.nameCapture,
        },
        customerOnboarded: false,
        businessOnboarded: false,
        isAdditionalBusinessFlow: false,
      })
    ).toEqual({ status: 'render' });
  });
});
