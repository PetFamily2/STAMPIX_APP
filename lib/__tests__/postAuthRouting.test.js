import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  isPostAuthTransitionPending,
  POST_AUTH_ROUTES,
  resolvePostAuthRoute,
} from '../auth/postAuthRouting';

const onboardedUser = {
  customerOnboardedAt: 1,
  businessOnboardedAt: 1,
};

const ownerBusiness = { id: 'biz_owner', staffRole: 'owner' };
const managerBusiness = { id: 'biz_manager', staffRole: 'manager' };
const staffBusiness = { id: 'biz_staff', staffRole: 'staff' };

function resolve(overrides = {}) {
  return resolvePostAuthRoute({
    isAuthLoading: false,
    isAuthenticated: true,
    user: onboardedUser,
    sessionContext: {
      activeMode: 'customer',
      activeBusinessId: null,
      businesses: [],
    },
    ...overrides,
  });
}

describe('post-auth routing resolver', () => {
  test('auth loading resolves to loading', () => {
    expect(resolve({ isAuthLoading: true })).toEqual({ status: 'loading' });
  });

  test('unauthenticated resolves to unauthenticated', () => {
    expect(resolve({ isAuthenticated: false })).toEqual({
      status: 'unauthenticated',
    });
  });

  test('user undefined resolves to loading', () => {
    expect(resolve({ user: undefined })).toEqual({ status: 'loading' });
  });

  test('authenticated user null routes to name capture', () => {
    expect(resolve({ user: null })).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.nameCapture,
    });
  });

  test('session context undefined resolves to loading', () => {
    expect(resolve({ sessionContext: undefined })).toEqual({
      status: 'loading',
    });
  });

  test('session context null with onboarded customer routes to wallet', () => {
    expect(resolve({ sessionContext: null })).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.customerWallet,
    });
  });

  test('session context null with active business id routes to wallet because there is no shell', () => {
    expect(
      resolve({
        activeBusinessId: 'biz_owner',
        sessionContext: null,
      })
    ).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.customerWallet,
    });
  });

  test('missing customer onboarding routes to name capture', () => {
    expect(resolve({ user: { customerOnboardedAt: null } })).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.nameCapture,
    });
  });

  test('customer mode routes to wallet', () => {
    expect(resolve()).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.customerWallet,
    });
  });

  test('business mode with no active shell routes to wallet', () => {
    expect(
      resolve({
        sessionContext: {
          activeMode: 'business',
          activeBusinessId: null,
          businesses: [ownerBusiness],
        },
      })
    ).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.customerWallet,
    });
  });

  test('business owner missing business onboarding routes to merchant onboarding', () => {
    expect(
      resolve({
        user: { customerOnboardedAt: 1, businessOnboardedAt: null },
        sessionContext: {
          activeMode: 'business',
          activeBusinessId: 'biz_owner',
          businesses: [ownerBusiness],
        },
      })
    ).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.merchantOnboarding,
    });
  });

  test('onboarded owner routes to business dashboard', () => {
    expect(
      resolve({
        sessionContext: {
          activeMode: 'business',
          activeBusinessId: 'biz_owner',
          businesses: [ownerBusiness],
        },
      })
    ).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.businessDashboard,
    });
  });

  test('manager routes to business dashboard', () => {
    expect(
      resolve({
        user: { customerOnboardedAt: 1, businessOnboardedAt: null },
        sessionContext: {
          activeMode: 'business',
          activeBusinessId: 'biz_manager',
          businesses: [managerBusiness],
        },
      })
    ).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.businessDashboard,
    });
  });

  test('staff active shell routes to staff scanner', () => {
    expect(
      resolve({
        sessionContext: {
          activeMode: 'business',
          activeBusinessId: 'biz_staff',
          businesses: [staffBusiness],
        },
      })
    ).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.staffScanner,
    });
  });

  test('fallback routes to wallet', () => {
    expect(
      resolve({
        sessionContext: {
          activeMode: undefined,
          activeBusinessId: 'biz_missing',
          businesses: [ownerBusiness],
        },
      })
    ).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.customerWallet,
    });
  });
});

describe('post-auth transition pending policy', () => {
  const resolvedUser = { customerOnboardedAt: 1, businessOnboardedAt: 1 };
  const resolvedSessionContext = {
    activeMode: 'customer',
    activeBusinessId: null,
    businesses: [],
  };

  test('user undefined is pending', () => {
    expect(
      isPostAuthTransitionPending({
        user: undefined,
        sessionContext: resolvedSessionContext,
      })
    ).toBe(true);
  });

  test('user null is pending', () => {
    expect(
      isPostAuthTransitionPending({
        user: null,
        sessionContext: resolvedSessionContext,
      })
    ).toBe(true);
  });

  test('session context undefined is pending', () => {
    expect(
      isPostAuthTransitionPending({
        user: resolvedUser,
        sessionContext: undefined,
      })
    ).toBe(true);
  });

  test('session context null is pending', () => {
    expect(
      isPostAuthTransitionPending({
        user: resolvedUser,
        sessionContext: null,
      })
    ).toBe(true);
  });

  test('resolved user and session context are not pending', () => {
    expect(
      isPostAuthTransitionPending({
        user: resolvedUser,
        sessionContext: resolvedSessionContext,
      })
    ).toBe(false);
  });
});

describe('post-auth transition regressions', () => {
  const otpSource = readFileSync(
    'app/(auth)/onboarding-client-otp.tsx',
    'utf8'
  );
  const oauthSource = readFileSync('app/(auth)/oauth-callback.tsx', 'utf8');
  const authenticatedLayoutSource = readFileSync(
    'app/(authenticated)/_layout.tsx',
    'utf8'
  );
  const legacyExistingAccountCopy = `מצאנו ${'חשבון קיים'}, ממשיכים להתחברות`;
  const legacyNewAccountCopy = `מכינים ${'חשבון חדש'}, ממשיכים להתחברות`;
  const legacyWaitingUserCopy = `מקבלים נתוני ${'משתמש'}`;

  test('OTP does not hard-code immediate wallet navigation after session auth', () => {
    expect(otpSource).not.toContain(
      "if (isAuthenticated) {\n      router.replace('/(authenticated)/(customer)/wallet');"
    );
    expect(otpSource).not.toContain(
      "router.replace('/(authenticated)/(customer)/wallet')"
    );
  });

  test('authenticated layout loading gate does not block resolved null values', () => {
    expect(authenticatedLayoutSource).not.toContain(
      'user == null || sessionContext == null'
    );
    expect(authenticatedLayoutSource).not.toContain(
      'user === null || sessionContext === null'
    );
    expect(authenticatedLayoutSource).not.toContain('user === null');
    expect(authenticatedLayoutSource).not.toContain('sessionContext === null');
  });

  test('OAuth and OTP use transition-pending policy', () => {
    expect(oauthSource).toContain('isPostAuthTransitionPending');
    expect(otpSource).toContain('isPostAuthTransitionPending');
  });

  test('OAuth transition does not expose account discovery copy', () => {
    expect(oauthSource).not.toContain(legacyExistingAccountCopy);
    expect(oauthSource).not.toContain(legacyNewAccountCopy);
    expect(oauthSource).not.toContain(legacyWaitingUserCopy);
  });

  test('transition components contain neutral loading copy', () => {
    expect(oauthSource).toContain('משלימים התחברות');
    expect(otpSource).toContain('משלימים התחברות');
  });
});
