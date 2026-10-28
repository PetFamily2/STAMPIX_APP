import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  POST_AUTH_ROUTES,
  resolveBusinessModeHomeHref,
  WEB_BUSINESS_PROOF_HREF,
} from '../auth/postAuthRouting';
import {
  SESSION_MODE_NOT_VISIBLE,
  waitForObservedSessionMode,
} from '../auth/waitForObservedSessionMode';

function read(path) {
  return readFileSync(path, 'utf8');
}

describe('observed session mode gate', () => {
  test('resolves immediately when the rendered mode already matches', async () => {
    await waitForObservedSessionMode(() => 'customer', 'customer', {
      sleep: async () => {
        throw new Error('should not wait');
      },
    });
  });

  test('waits until a later render shows the server mode', async () => {
    let mode = 'business';
    let sleeps = 0;
    const pending = waitForObservedSessionMode(() => mode, 'customer', {
      timeoutMs: 1000,
      now: () => sleeps,
      sleep: async () => {
        sleeps += 1;
        mode = 'customer';
      },
    });
    await pending;
    expect(sleeps).toBe(1);
  });

  test('fails closed without navigating when the rendered mode never arrives', async () => {
    await expect(
      waitForObservedSessionMode(() => 'business', 'customer', {
        timeoutMs: 30,
        now: (() => {
          let clock = 0;
          return () => {
            const current = clock;
            clock += 20;
            return current;
          };
        })(),
        sleep: async () => {},
      })
    ).rejects.toThrow(SESSION_MODE_NOT_VISIBLE);
  });
});

describe('business and customer mode switch', () => {
  test('web business home is the Business Web route and native keeps its dashboard', () => {
    expect(resolveBusinessModeHomeHref('web')).toBe(WEB_BUSINESS_PROOF_HREF);
    expect(resolveBusinessModeHomeHref('ios')).toBe(
      POST_AUTH_ROUTES.businessDashboard
    );
    expect(resolveBusinessModeHomeHref('android')).toBe(
      POST_AUTH_ROUTES.businessDashboard
    );
  });

  test('Business Web switches to the customer wallet only after the existing mode mutation', () => {
    const route = read('components/business-web/BusinessWebShellRoute.tsx');
    const shell = read('components/business-web/BusinessWebShell.tsx');
    const start = route.indexOf('const switchToCustomerWallet');
    const end = route.indexOf('const handleLogout');
    const switchHandler = route.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(route).toContain('api.users.setActiveMode');
    expect(switchHandler).toContain("setActiveMode({ mode: 'customer' })");
    expect(switchHandler).toContain('POST_AUTH_ROUTES.customerWallet');
    expect(switchHandler.indexOf('await setActiveMode')).toBeLessThan(
      switchHandler.indexOf('waitForObservedSessionMode')
    );
    expect(switchHandler.indexOf('waitForObservedSessionMode')).toBeLessThan(
      switchHandler.indexOf('router.replace')
    );
    expect(switchHandler).not.toContain('signOut');
    expect(switchHandler).toContain('switchingToCustomerRef.current');
    expect(route).toContain('לא הצלחנו לעבור לארנק האישי. נסו שוב.');
    expect(route).toContain('requestGuardedAction(() => {');
    expect(route).toContain('unsavedTitle');
    expect(shell).toContain('accessibilityLabel={CUSTOMER_WALLET_LABEL}');
    expect(shell).toContain("const CUSTOMER_WALLET_LABEL = 'מעבר לארנק האישי'");
    expect(shell).toContain('minHeight: 44');
    expect(shell).toContain('styles.mobileMenuDrawer');
    expect(shell).toContain('styles.sidebar');
    expect(shell).toContain('accessibilityRole="alert"');
    expect(shell).toContain("from '@/lib/rtl'");
    expect(shell).toContain('...rtlBaseText');
    expect(shell).not.toContain('I18nManager');
  });

  test('customer settings returns to business through the existing card and web home', () => {
    const settings = read('screens/SettingsScreen.tsx');
    const customerSettings = read(
      'app/(authenticated)/(customer)/settings.tsx'
    );
    const card = read('components/customer/BusinessModeCtaCard.tsx');
    const homeIndex = card.indexOf(
      'router.navigate(resolveBusinessModeHomeHref(Platform.OS))'
    );
    const modeIndex = card.lastIndexOf(
      "await setActiveMode({ mode: 'business' })",
      homeIndex
    );
    const observedWaitIndex = card.lastIndexOf(
      'waitForObservedSessionMode',
      homeIndex
    );

    expect(customerSettings).toContain('SettingsScreen');
    expect(settings).toContain('<BusinessModeCtaCard');
    expect(card).toContain('resolveBusinessModeHomeHref(Platform.OS)');
    expect(modeIndex).toBeGreaterThan(-1);
    expect(observedWaitIndex).toBeGreaterThan(modeIndex);
    expect(homeIndex).toBeGreaterThan(observedWaitIndex);
    const walletIndex = card.indexOf(
      "router.replace('/(authenticated)/(customer)/wallet')"
    );
    const customerModeIndex = card.lastIndexOf(
      "await setActiveMode({ mode: 'customer' })",
      walletIndex
    );
    const customerWaitIndex = card.lastIndexOf(
      'waitForObservedSessionMode',
      walletIndex
    );
    expect(customerModeIndex).toBeGreaterThan(-1);
    expect(customerWaitIndex).toBeGreaterThan(customerModeIndex);
    expect(walletIndex).toBeGreaterThan(customerWaitIndex);
    expect(card).not.toContain('void setActiveMode');
    expect(card).not.toContain(
      "router.navigate('/(authenticated)/(business)/dashboard')"
    );
  });

  test('mode switch does not retarget memberships or authentication', () => {
    const route = read('components/business-web/BusinessWebShellRoute.tsx');
    const card = read('components/customer/BusinessModeCtaCard.tsx');

    expect(route).not.toContain('memberships');
    expect(route).not.toContain('signIn(');
    expect(card).not.toContain('signIn(');
    expect(card).not.toContain('signOut(');
  });
});
