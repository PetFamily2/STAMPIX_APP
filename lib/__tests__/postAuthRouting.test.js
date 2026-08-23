import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  isPostAuthTransitionPending,
  POST_AUTH_ROUTES,
  resolveAuthGroupDisposition,
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

  test('session context null with resolved authenticated user remains loading', () => {
    expect(resolve({ sessionContext: null })).toEqual({ status: 'loading' });
  });

  test('session context null never guesses a shell from an active business override', () => {
    expect(
      resolve({
        activeBusinessId: 'biz_owner',
        sessionContext: null,
      })
    ).toEqual({ status: 'loading' });
  });

  test('missing customer onboarding routes to name capture', () => {
    expect(resolve({ user: { customerOnboardedAt: null } })).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.nameCapture,
    });
  });

  test('default business onboarding draft loading remains unresolved', () => {
    expect(resolve({ isBusinessOnboardingLoading: true })).toEqual({
      status: 'loading',
    });
  });

  test('interrupted default business onboarding resumes before shell routing', () => {
    expect(
      resolve({
        user: { customerOnboardedAt: 1, businessOnboardedAt: null },
        hasInProgressBusinessOnboarding: true,
      })
    ).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.merchantOnboarding,
    });
  });

  test('paused default business onboarding respects the current customer shell', () => {
    expect(
      resolve({
        user: { customerOnboardedAt: 1, businessOnboardedAt: null },
        hasInProgressBusinessOnboarding: false,
      })
    ).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.customerWallet,
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

describe('auth-group authoritative route disposition', () => {
  const customerRoute = {
    status: 'route',
    href: POST_AUTH_ROUTES.customerWallet,
  };
  const nameCaptureRoute = {
    status: 'route',
    href: POST_AUTH_ROUTES.nameCapture,
  };

  function disposition(overrides = {}) {
    return resolveAuthGroupDisposition({
      routeKind: 'standard',
      postAuthResolution: customerRoute,
      customerOnboarded: true,
      businessOnboarded: false,
      isAdditionalBusinessFlow: false,
      ...overrides,
    });
  }

  test('authenticated incomplete customer on auth index routes to name capture', () => {
    expect(
      disposition({
        postAuthResolution: nameCaptureRoute,
        customerOnboarded: false,
      })
    ).toEqual({ status: 'redirect', href: POST_AUTH_ROUTES.nameCapture });
  });

  test('authenticated incomplete customer on welcome routes to name capture', () => {
    expect(
      disposition({
        postAuthResolution: nameCaptureRoute,
        customerOnboarded: false,
      })
    ).toEqual({ status: 'redirect', href: POST_AUTH_ROUTES.nameCapture });
  });

  test('unresolved authenticated routing inputs render loading without redirect', () => {
    expect(
      disposition({ postAuthResolution: { status: 'loading' } })
    ).toEqual({ status: 'loading' });
  });

  test('genuinely unauthenticated user keeps the normal auth route', () => {
    expect(
      disposition({ postAuthResolution: { status: 'unauthenticated' } })
    ).toEqual({ status: 'render' });
  });

  test('completed customer cannot reopen customer onboarding', () => {
    expect(disposition({ routeKind: 'customerOnboarding' })).toEqual({
      status: 'redirect',
      href: POST_AUTH_ROUTES.customerWallet,
    });
  });

  test('incomplete customer can continue a legitimate customer onboarding route', () => {
    expect(
      disposition({
        routeKind: 'customerOnboarding',
        postAuthResolution: nameCaptureRoute,
        customerOnboarded: false,
      })
    ).toEqual({ status: 'render' });
  });

  test('returning owner or manager is sent directly to the business shell', () => {
    expect(
      disposition({
        postAuthResolution: {
          status: 'route',
          href: POST_AUTH_ROUTES.businessDashboard,
        },
        businessOnboarded: true,
      })
    ).toEqual({
      status: 'redirect',
      href: POST_AUTH_ROUTES.businessDashboard,
    });
  });

  test('returning staff is sent directly to the staff shell', () => {
    expect(
      disposition({
        postAuthResolution: {
          status: 'route',
          href: POST_AUTH_ROUTES.staffScanner,
        },
      })
    ).toEqual({ status: 'redirect', href: POST_AUTH_ROUTES.staffScanner });
  });

  test('legitimately incomplete default business onboarding remains allowed', () => {
    expect(
      disposition({
        routeKind: 'businessOnboarding',
        postAuthResolution: {
          status: 'route',
          href: POST_AUTH_ROUTES.merchantOnboarding,
        },
        businessOnboarded: false,
      })
    ).toEqual({ status: 'render' });
  });

  test('business onboarding never bypasses required customer onboarding', () => {
    expect(
      disposition({
        routeKind: 'businessOnboarding',
        postAuthResolution: nameCaptureRoute,
        customerOnboarded: false,
        businessOnboarded: false,
      })
    ).toEqual({ status: 'redirect', href: POST_AUTH_ROUTES.nameCapture });
  });

  test('additional-business onboarding remains allowed for a completed owner', () => {
    expect(
      disposition({
        routeKind: 'businessOnboarding',
        businessOnboarded: true,
        isAdditionalBusinessFlow: true,
      })
    ).toEqual({ status: 'render' });
  });

  test('provider transitions render while auth and session state hydrate', () => {
    expect(
      disposition({
        routeKind: 'transition',
        postAuthResolution: { status: 'loading' },
      })
    ).toEqual({ status: 'render' });
  });

  test('completed user cannot reopen a stale provider transition from history', () => {
    expect(disposition({ routeKind: 'transition' })).toEqual({
      status: 'redirect',
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

describe('Batch 1 auth and onboarding source contracts', () => {
  const authLayoutSource = readFileSync('app/(auth)/_layout.tsx', 'utf8');
  const authenticatedLayoutSource = readFileSync(
    'app/(authenticated)/_layout.tsx',
    'utf8'
  );
  const nameCaptureSource = readFileSync(
    'app/(auth)/name-capture.tsx',
    'utf8'
  );
  const customerCompletionSource = readFileSync(
    'app/(auth)/onboarding-client-return-motivation.tsx',
    'utf8'
  );
  const roleGuardSource = readFileSync('lib/hooks/useRoleGuard.ts', 'utf8');
  const merchantLayoutSource = readFileSync(
    'app/(authenticated)/merchant/_layout.tsx',
    'utf8'
  );
  const merchantOnboardingLayoutSource = readFileSync(
    'app/(authenticated)/merchant/onboarding/_layout.tsx',
    'utf8'
  );

  test('auth layout delegates authenticated route access to the central model', () => {
    expect(authLayoutSource).toContain('resolvePostAuthRoute');
    expect(authLayoutSource).toContain('resolveAuthGroupDisposition');
    expect(authLayoutSource).not.toContain('AUTH_REDIRECT_TARGET');
  });

  test('merchant loading never becomes incomplete-onboarding routing', () => {
    expect(roleGuardSource).toContain('isAuthLoading ||');
    expect(roleGuardSource).toContain('sessionContext === undefined');
    expect(merchantLayoutSource).toContain('if (isLoading)');
    expect(merchantLayoutSource).toContain(
      'user && user.customerOnboardedAt == null'
    );
    expect(merchantOnboardingLayoutSource).toContain('isRoutingLoading');
    expect(merchantOnboardingLayoutSource).toContain(
      'user && user.customerOnboardedAt == null'
    );
  });

  test('default business draft hydration gates merchant onboarding but additional flow bypasses it', () => {
    expect(merchantOnboardingLayoutSource).toContain(
      'api.onboarding.getMyBusinessOnboardingDraft'
    );
    expect(merchantOnboardingLayoutSource).toContain(
      'shouldLoadDefaultBusinessOnboardingDraft'
    );
    expect(merchantOnboardingLayoutSource).toContain(
      'defaultBusinessOnboardingDraft === undefined'
    );
    expect(merchantOnboardingLayoutSource).toContain(
      'isDefaultBusinessOnboardingDraftLoading'
    );
    expect(merchantOnboardingLayoutSource).toMatch(
      /const isRoutingLoading =[\s\S]*\|\|\s*isDefaultBusinessOnboardingDraftLoading;/
    );
    expect(merchantOnboardingLayoutSource).toMatch(
      /const shouldLoadDefaultBusinessOnboardingDraft =\s*!isAdditionalFlow &&/
    );
    expect(merchantOnboardingLayoutSource).toContain(
      "shouldLoadDefaultBusinessOnboardingDraft ? { flow: 'default' } : 'skip'"
    );

    const loadingGuardIndex = merchantOnboardingLayoutSource.indexOf(
      'if (isRoutingLoading)'
    );
    const firstRedirectIndex = merchantOnboardingLayoutSource.indexOf(
      '<Redirect'
    );
    const slotIndex = merchantOnboardingLayoutSource.indexOf('<Slot />');

    expect(loadingGuardIndex).toBeGreaterThan(-1);
    expect(firstRedirectIndex).toBeGreaterThan(loadingGuardIndex);
    expect(slotIndex).toBeGreaterThan(loadingGuardIndex);

    const loadingGuardSource = merchantOnboardingLayoutSource.slice(
      loadingGuardIndex,
      firstRedirectIndex
    );
    expect(loadingGuardSource).toContain('return <FullScreenLoading />');
    expect(loadingGuardSource).not.toContain('<Slot />');
  });

  test('completed default business onboarding is guarded without blocking additional flow', () => {
    expect(merchantOnboardingLayoutSource).toContain(
      'enteredWithCompletedBusinessRef'
    );
    expect(merchantOnboardingLayoutSource).toContain(
      '!isAdditionalFlow'
    );
    expect(authenticatedLayoutSource).toContain(
      '!isAdditionalMerchantOnboarding'
    );
  });

  test('name bootstrap and name save failures expose retryable states', () => {
    expect(nameCaptureSource).toContain("| 'failed'");
    expect(nameCaptureSource).toContain("setBootstrapStatus('failed')");
    expect(nameCaptureSource).toContain('void bootstrapUser()');
    expect(nameCaptureSource).toContain('setSaveError(RECOVERY_TEXT.saveFailed)');
    expect(nameCaptureSource).toContain('await signOut()');
  });

  test('customer completion failure is visible and success replaces history', () => {
    expect(customerCompletionSource).toContain(
      'setCompletionError(COMPLETION_ERROR)'
    );
    expect(customerCompletionSource).toContain(
      "router.replace('/(authenticated)/(customer)/wallet')"
    );
    expect(customerCompletionSource).not.toContain(
      "router.push('/(authenticated)/(customer)/wallet')"
    );
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
