import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  POST_AUTH_ROUTES,
  resolvePostAuthRoute,
} from '../auth/postAuthRouting';

const onboardedUser = {
  customerOnboardedAt: 1,
  businessOnboardedAt: 1,
};

function resolveRole(staffRole, businessId) {
  return resolvePostAuthRoute({
    isAuthLoading: false,
    isAuthenticated: true,
    user:
      staffRole === 'customer'
        ? onboardedUser
        : {
            customerOnboardedAt: 1,
            businessOnboardedAt: staffRole === 'owner' ? 1 : null,
          },
    sessionContext:
      staffRole === 'customer'
        ? {
            activeMode: 'customer',
            activeBusinessId: null,
            businesses: [],
          }
        : {
            activeMode: 'business',
            activeBusinessId: businessId,
            businesses: [{ id: businessId, staffRole }],
          },
    activeBusinessId: staffRole === 'customer' ? null : businessId,
  });
}

describe('native companion redirect preserves role context', () => {
  test('owner, manager, staff, and customer resolve to their native homes', () => {
    expect(resolveRole('owner', 'biz_owner')).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.businessDashboard,
    });
    expect(resolveRole('manager', 'biz_manager')).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.businessDashboard,
    });
    expect(resolveRole('staff', 'biz_staff')).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.staffScanner,
    });
    expect(resolveRole('customer', null)).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.customerWallet,
    });
  });

  test('native billing and paywall routes use the post-auth redirect', () => {
    const redirect = readFileSync(
      'components/navigation/NativeCompanionRedirect.tsx',
      'utf8'
    );
    expect(redirect).toContain('resolvePostAuthRoute');
    expect(redirect).toContain('activeBusinessId');
    expect(redirect).not.toContain(
      "const NATIVE_COMPANION_HREF = '/(authenticated)/(customer)/wallet'"
    );

    for (const file of [
      'app/(web-business)/business/billing.tsx',
      'app/billing/sumit/success.tsx',
      'app/billing/sumit/cancel.tsx',
      'app/(auth)/paywall/index.tsx',
      'app/(web-business)/business/_layout.tsx',
    ]) {
      expect(readFileSync(file, 'utf8')).toContain('NativeCompanionRedirect');
    }
  });
});
