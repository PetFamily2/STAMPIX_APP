import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { POST_AUTH_ROUTES } from '../auth/postAuthRouting';
import { resolveAuthenticatedRouteGuard } from '../navigation/authenticatedRouteGuard';
import {
  CUSTOMER_BACK_FALLBACKS,
  CUSTOMER_BUSINESS_PATHNAME,
  CUSTOMER_CARD_PATHNAME,
  CUSTOMER_DETAIL_ROUTES,
  CUSTOMER_PRIMARY_TABS,
  CUSTOMER_ROUTES,
  customerBusinessRoute,
  customerCardRoute,
  isCustomerDetailRoute,
  isCustomerPrimaryTab,
  resolveCustomerInboxDestination,
  resolveWalletPreviewCardRoute,
} from '../navigation/customerRoutes';

const CUSTOMER_LAYOUT = 'app/(authenticated)/(customer)/_layout.tsx';
const CARD_SCREEN = 'app/(authenticated)/card/[membershipId].tsx';
const CUSTOMER_CARD_SCREEN =
  'app/(authenticated)/(customer)/customer-card/[membershipId].tsx';
const AUTHENTICATED_LAYOUT = 'app/(authenticated)/_layout.tsx';

const MEMBERSHIP_ID = 'membership_active';
const BUSINESS_ID = 'business_open';
const CANONICAL_CARD = `/(authenticated)/(customer)/customer-card/${MEMBERSHIP_ID}`;
const CANONICAL_BUSINESS = `/(authenticated)/(customer)/business/${BUSINESS_ID}`;

function readSource(path) {
  return readFileSync(path, 'utf8');
}

function routeBlock(source, routeName) {
  const routeIndex = source.indexOf(`name="${routeName}"`);
  const nextRouteIndex = source.indexOf('<Tabs.Screen', routeIndex + 1);
  return source.slice(
    routeIndex,
    nextRouteIndex < 0 ? undefined : nextRouteIndex
  );
}

describe('wallet preview navigation', () => {
  test('card tap opens the preview membership and the business action stays on the business', () => {
    expect(resolveWalletPreviewCardRoute(MEMBERSHIP_ID)).toBe(CANONICAL_CARD);
    expect(customerBusinessRoute(BUSINESS_ID)).toBe(CANONICAL_BUSINESS);
    expect(resolveWalletPreviewCardRoute(MEMBERSHIP_ID)).not.toBe(
      customerBusinessRoute(BUSINESS_ID)
    );

    const wallet = readSource('app/(authenticated)/(customer)/wallet.tsx');
    expect(wallet).toContain('resolveWalletPreviewCardRoute');
    expect(wallet).toContain('customerBusinessRoute(businessId)');
    expect(wallet).toContain("openBusiness: 'פתח את העסק'");
    expect(wallet).not.toMatch(/\(customer\)\/business\/\$\{businessId\}/);
  });

  test('a missing preview membership id does not navigate or crash', () => {
    expect(resolveWalletPreviewCardRoute(null)).toBeNull();
    expect(resolveWalletPreviewCardRoute(undefined)).toBeNull();
    expect(resolveWalletPreviewCardRoute('')).toBeNull();
    expect(resolveWalletPreviewCardRoute('../wallet')).toBeNull();
  });
});

describe('customer route contract', () => {
  test('builds canonical customer paths', () => {
    expect(CUSTOMER_ROUTES.wallet).toBe(POST_AUTH_ROUTES.customerWallet);
    expect(CUSTOMER_ROUTES.rewards).toBe('/(authenticated)/(customer)/rewards');
    expect(CUSTOMER_ROUTES.discovery).toBe(
      '/(authenticated)/(customer)/discovery'
    );
    expect(CUSTOMER_ROUTES.showQr).toBe('/(authenticated)/(customer)/show-qr');
    expect(CUSTOMER_ROUTES.settings).toBe(
      '/(authenticated)/(customer)/settings'
    );
    expect(CUSTOMER_ROUTES.accountDetails).toBe(
      '/(authenticated)/(customer)/account-details'
    );
    expect(CUSTOMER_ROUTES.helpSupport).toBe(
      '/(authenticated)/(customer)/help-support'
    );
    expect(CUSTOMER_ROUTES.referrals).toBe(
      '/(authenticated)/(customer)/referrals'
    );
    expect(CUSTOMER_ROUTES.join).toBe('/(authenticated)/join');
    expect(CUSTOMER_ROUTES.acceptInvite).toBe('/(authenticated)/accept-invite');
    expect(CUSTOMER_ROUTES.settingsLegal).toBe(
      '/(authenticated)/settings-legal'
    );
    expect(customerBusinessRoute(BUSINESS_ID)).toBe(CANONICAL_BUSINESS);
    expect(customerCardRoute(MEMBERSHIP_ID)).toBe(CANONICAL_CARD);
    expect(CUSTOMER_BUSINESS_PATHNAME).toBe(
      '/(authenticated)/(customer)/business/[businessId]'
    );
    expect(CUSTOMER_CARD_PATHNAME).toBe(
      '/(authenticated)/(customer)/customer-card/[membershipId]'
    );
  });
});

describe('referrals back navigation', () => {
  test('uses safe back with the wallet fallback', () => {
    expect(CUSTOMER_BACK_FALLBACKS.referrals).toBe(CUSTOMER_ROUTES.wallet);

    const referrals = readSource(
      'app/(authenticated)/(customer)/referrals.tsx'
    );
    expect(referrals).toContain('safeBack(CUSTOMER_BACK_FALLBACKS.referrals)');
    expect(referrals).not.toContain(
      "router.push('/(authenticated)/(customer)/wallet')"
    );
    expect(referrals).not.toContain('router.push(CUSTOMER_ROUTES.wallet)');
    expect(referrals).not.toContain('router.back()');
  });
});

describe('authenticated route guard', () => {
  const customer = {
    resolutionHref: POST_AUTH_ROUTES.customerWallet,
    activeMode: 'customer',
    isAdditionalMerchantOnboarding: false,
  };

  test('lets a customer open settings-legal and accept-invite', () => {
    expect(
      resolveAuthenticatedRouteGuard({
        ...customer,
        segments: ['(authenticated)', 'settings-legal'],
      })
    ).toEqual({ action: 'stay' });
    expect(
      resolveAuthenticatedRouteGuard({
        ...customer,
        segments: ['(authenticated)', 'accept-invite'],
      })
    ).toEqual({ action: 'stay' });
  });

  test('keeps a customer inside customer routes and the legacy card entry', () => {
    expect(
      resolveAuthenticatedRouteGuard({
        ...customer,
        segments: ['(authenticated)', '(customer)', 'wallet'],
      })
    ).toEqual({ action: 'stay' });
    expect(
      resolveAuthenticatedRouteGuard({
        ...customer,
        segments: ['(authenticated)', 'card', MEMBERSHIP_ID],
      })
    ).toEqual({ action: 'stay' });
  });

  test('sends a customer away from business and staff groups', () => {
    expect(
      resolveAuthenticatedRouteGuard({
        ...customer,
        segments: ['(authenticated)', '(business)', 'dashboard'],
      })
    ).toEqual({
      action: 'replace',
      href: POST_AUTH_ROUTES.customerWallet,
    });
    expect(
      resolveAuthenticatedRouteGuard({
        ...customer,
        segments: ['(authenticated)', '(staff)', 'scanner'],
      })
    ).toEqual({
      action: 'replace',
      href: POST_AUTH_ROUTES.customerWallet,
    });
  });

  test('keeps business and staff shells on their own routes', () => {
    expect(
      resolveAuthenticatedRouteGuard({
        resolutionHref: POST_AUTH_ROUTES.businessDashboard,
        segments: ['(authenticated)', '(business)', 'dashboard'],
        activeMode: 'business',
        isAdditionalMerchantOnboarding: false,
      })
    ).toEqual({ action: 'stay' });
    expect(
      resolveAuthenticatedRouteGuard({
        resolutionHref: POST_AUTH_ROUTES.businessDashboard,
        segments: ['(authenticated)', '(customer)', 'wallet'],
        activeMode: 'business',
        isAdditionalMerchantOnboarding: false,
      })
    ).toEqual({
      action: 'replace',
      href: POST_AUTH_ROUTES.businessDashboard,
    });
    expect(
      resolveAuthenticatedRouteGuard({
        resolutionHref: POST_AUTH_ROUTES.staffScanner,
        segments: ['(authenticated)', '(staff)', 'scanner'],
        activeMode: 'business',
        isAdditionalMerchantOnboarding: false,
      })
    ).toEqual({ action: 'stay' });
    expect(
      resolveAuthenticatedRouteGuard({
        resolutionHref: POST_AUTH_ROUTES.staffScanner,
        segments: ['(authenticated)', '(customer)', 'settings'],
        activeMode: 'business',
        isAdditionalMerchantOnboarding: false,
      })
    ).toEqual({
      action: 'replace',
      href: POST_AUTH_ROUTES.staffScanner,
    });
    expect(
      resolveAuthenticatedRouteGuard({
        resolutionHref: POST_AUTH_ROUTES.businessDashboard,
        segments: ['(authenticated)', 'settings-legal'],
        activeMode: 'business',
        isAdditionalMerchantOnboarding: false,
      })
    ).toEqual({ action: 'stay' });
  });

  test('does not leave an unknown shared route open for a customer', () => {
    expect(
      resolveAuthenticatedRouteGuard({
        ...customer,
        segments: ['(authenticated)', 'unknown-tool'],
      })
    ).toEqual({
      action: 'replace',
      href: POST_AUTH_ROUTES.customerWallet,
    });
  });
});

describe('canonical customer card route', () => {
  test('wallet, rewards, joined cards, and QR success share one card route', () => {
    const canonical = customerCardRoute(MEMBERSHIP_ID);
    expect(resolveWalletPreviewCardRoute(MEMBERSHIP_ID)).toBe(canonical);
    expect(customerCardRoute(MEMBERSHIP_ID)).toBe(canonical);

    const rewards = readSource('app/(authenticated)/(customer)/rewards.tsx');
    const business = readSource(
      'app/(authenticated)/(customer)/business/[businessId].tsx'
    );
    const showQr = readSource('app/(authenticated)/(customer)/show-qr.tsx');

    expect(rewards).toContain('customerCardRoute(reward.membershipId)');
    expect(business).toContain('customerCardRoute(String(membershipId))');
    expect(showQr).toContain('customerCardRoute(latestMembershipId)');
    expect(showQr).toContain('router.replace(CUSTOMER_ROUTES.wallet)');
    expect(rewards).not.toContain('`/customer-card/');
    expect(business).not.toContain('`/customer-card/');
    expect(showQr).not.toContain('`/customer-card/');
  });

  test('keeps the shared card screen as the deep-link entry', () => {
    expect(readSource(CUSTOMER_CARD_SCREEN)).toContain(
      "export { default } from '../../card/[membershipId]'"
    );
    expect(readSource(CARD_SCREEN)).toContain('export default function');
    expect(readSource(AUTHENTICATED_LAYOUT)).toContain(
      'name="card/[membershipId]"'
    );
    expect(
      resolveCustomerInboxDestination(`/(authenticated)/card/${MEMBERSHIP_ID}`)
    ).toBe(CANONICAL_CARD);
  });
});

describe('customer tab bar contract', () => {
  test('primary tabs stay visible and detail routes hide the tab bar', () => {
    const layout = readSource(CUSTOMER_LAYOUT);

    for (const routeName of CUSTOMER_PRIMARY_TABS) {
      expect(isCustomerPrimaryTab(routeName)).toBe(true);
      expect(isCustomerDetailRoute(routeName)).toBe(false);
      const block = routeBlock(layout, routeName);
      expect(block).toContain(`name="${routeName}"`);
      expect(block).not.toContain("display: 'none'");
    }

    for (const routeName of CUSTOMER_DETAIL_ROUTES) {
      expect(isCustomerDetailRoute(routeName)).toBe(true);
      expect(isCustomerPrimaryTab(routeName)).toBe(false);
      const block = routeBlock(layout, routeName);
      expect(block).toContain('href: null');
      expect(block).toContain("tabBarStyle: { display: 'none' }");
    }
  });
});

describe('customer inbox destinations', () => {
  test('accepts valid customer destinations and preserves referral queries', () => {
    expect(resolveCustomerInboxDestination(CANONICAL_CARD)).toBe(
      CANONICAL_CARD
    );
    expect(resolveCustomerInboxDestination(CANONICAL_BUSINESS)).toBe(
      CANONICAL_BUSINESS
    );
    expect(resolveCustomerInboxDestination(CUSTOMER_ROUTES.rewards)).toBe(
      CUSTOMER_ROUTES.rewards
    );
    expect(resolveCustomerInboxDestination(CUSTOMER_ROUTES.wallet)).toBe(
      CUSTOMER_ROUTES.wallet
    );
    expect(resolveCustomerInboxDestination(CUSTOMER_ROUTES.discovery)).toBe(
      CUSTOMER_ROUTES.discovery
    );
    expect(
      resolveCustomerInboxDestination(
        '/(authenticated)/(customer)/referrals?referralId=ref_1&tab=rewards&rewardId=reward_1'
      )
    ).toBe(
      '/(authenticated)/(customer)/referrals?referralId=ref_1&tab=rewards&rewardId=reward_1'
    );
    expect(
      resolveCustomerInboxDestination(`/(authenticated)/card/${MEMBERSHIP_ID}`)
    ).toBe(CANONICAL_CARD);
  });

  test('rejects stale, business, staff, admin, and auth destinations', () => {
    expect(resolveCustomerInboxDestination(null)).toBeNull();
    expect(resolveCustomerInboxDestination('')).toBeNull();
    expect(resolveCustomerInboxDestination('/not-a-route')).toBeNull();
    expect(
      resolveCustomerInboxDestination('/(authenticated)/(business)/dashboard')
    ).toBeNull();
    expect(
      resolveCustomerInboxDestination(
        '/(authenticated)/(business)/customer/user_1?section=referrals'
      )
    ).toBeNull();
    expect(
      resolveCustomerInboxDestination('/(authenticated)/(staff)/scanner')
    ).toBeNull();
    expect(
      resolveCustomerInboxDestination('/(authenticated)/admin/support-inbox')
    ).toBeNull();
    expect(resolveCustomerInboxDestination('/(auth)/sign-in')).toBeNull();
    expect(
      resolveCustomerInboxDestination('https://example.com/wallet')
    ).toBeNull();
    expect(
      resolveCustomerInboxDestination(
        '/(authenticated)/(customer)/wallet/../../../(auth)/sign-in'
      )
    ).toBeNull();
  });
});

describe('customer back fallbacks', () => {
  test('account, help, and legal fall back to settings', () => {
    expect(CUSTOMER_BACK_FALLBACKS.accountDetails).toBe(
      CUSTOMER_ROUTES.settings
    );
    expect(CUSTOMER_BACK_FALLBACKS.helpSupport).toBe(CUSTOMER_ROUTES.settings);
    expect(CUSTOMER_BACK_FALLBACKS.settingsLegal).toBe(
      CUSTOMER_ROUTES.settings
    );

    expect(readSource('screens/CustomerAccountDetailsScreen.tsx')).toContain(
      'safeBack(CUSTOMER_BACK_FALLBACKS.accountDetails)'
    );
    expect(readSource('screens/CustomerHelpSupportScreen.tsx')).toContain(
      'safeBack(CUSTOMER_BACK_FALLBACKS.helpSupport)'
    );
    expect(readSource('screens/CustomerHelpSupportScreen.tsx')).not.toContain(
      'router.back()'
    );
    expect(readSource('app/(authenticated)/settings-legal.tsx')).toContain(
      'CUSTOMER_BACK_FALLBACKS.settingsLegal'
    );
  });
});
