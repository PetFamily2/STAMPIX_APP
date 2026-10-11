import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  BUSINESS_WEB_ROUTES,
  countBusinessBottomTabs,
  isBusinessWebRouteActive,
  selectBusinessWebNav,
} from '../businessWebNavigation';
import {
  getBusinessWebResponsiveLayout,
  getNextBusinessWebShellOverlay,
} from '../design/businessWebResponsive';
import {
  readNavigationInputProfile,
  resolveBusinessNavigationMode,
  resolveNavigationFormFactor,
} from '../design/navigationFormFactor';

const read = (path) => readFileSync(path, 'utf8');

function profile(width, height, input) {
  return {
    viewportWidth: width,
    viewportHeight: height,
    primaryPointerCoarse: input.primaryPointerCoarse,
    primaryHover: input.primaryHover,
    anyPointerCoarse: input.anyPointerCoarse,
    maxTouchPoints: input.maxTouchPoints,
  };
}

const phone = {
  primaryPointerCoarse: true,
  primaryHover: false,
  anyPointerCoarse: true,
  maxTouchPoints: 5,
};

const desktop = {
  primaryPointerCoarse: false,
  primaryHover: true,
  anyPointerCoarse: false,
  maxTouchPoints: 0,
};

const touchLaptop = {
  primaryPointerCoarse: false,
  primaryHover: true,
  anyPointerCoarse: true,
  maxTouchPoints: 10,
};

describe('business navigation form factor', () => {
  test('phone and tablet keep the bottom shell at every checked width', () => {
    const cases = [
      [320, 568],
      [390, 844],
      [768, 1024],
      [844, 390],
      [1024, 768],
      [1366, 1024],
      [1440, 900],
    ];
    for (const [width, height] of cases) {
      expect(resolveBusinessNavigationMode(profile(width, height, phone))).toBe(
        'bottom'
      );
      expect(resolveNavigationFormFactor(profile(width, height, phone))).toBe(
        'phone-tablet'
      );
    }
  });

  test('a computer keeps the management shell and narrows it with the window', () => {
    expect(resolveBusinessNavigationMode(profile(320, 800, desktop))).toBe(
      'compact'
    );
    expect(resolveBusinessNavigationMode(profile(390, 800, desktop))).toBe(
      'compact'
    );
    expect(resolveBusinessNavigationMode(profile(768, 900, desktop))).toBe(
      'compact'
    );
    expect(resolveBusinessNavigationMode(profile(844, 390, desktop))).toBe(
      'compact'
    );
    expect(resolveBusinessNavigationMode(profile(1023, 768, desktop))).toBe(
      'compact'
    );
    expect(resolveBusinessNavigationMode(profile(1024, 768, desktop))).toBe(
      'sidebar'
    );
    expect(resolveBusinessNavigationMode(profile(1366, 768, desktop))).toBe(
      'sidebar'
    );
    expect(resolveBusinessNavigationMode(profile(1440, 900, desktop))).toBe(
      'sidebar'
    );
  });

  test('a touchscreen computer is not reclassified as a tablet', () => {
    expect(resolveBusinessNavigationMode(profile(1366, 768, touchLaptop))).toBe(
      'sidebar'
    );
    expect(resolveBusinessNavigationMode(profile(768, 900, touchLaptop))).toBe(
      'compact'
    );
    expect(resolveNavigationFormFactor(profile(1440, 900, touchLaptop))).toBe(
      'desktop'
    );
  });

  test('media queries decide the shell and a missing browser falls back by width', () => {
    const tablet = readNavigationInputProfile(1366, 1024, {
      matchMedia: (query) => ({
        matches:
          query === '(pointer: coarse)' || query === '(any-pointer: coarse)',
      }),
      maxTouchPoints: 5,
    });
    expect(resolveBusinessNavigationMode(tablet)).toBe('bottom');

    const narrowDesktop = readNavigationInputProfile(768, 900, {
      matchMedia: (query) => ({ matches: query === '(hover: hover)' }),
      maxTouchPoints: 0,
    });
    expect(resolveBusinessNavigationMode(narrowDesktop)).toBe('compact');
    expect(
      resolveBusinessNavigationMode(readNavigationInputProfile(1440, 900))
    ).toBe('sidebar');
    expect(
      resolveBusinessNavigationMode(readNavigationInputProfile(800, 900))
    ).toBe('compact');
  });

  test('wide tablet content can use the wide page metrics while navigation stays on the bottom', () => {
    expect(getBusinessWebResponsiveLayout(1366).composition).toBe('desktop');
    expect(getBusinessWebResponsiveLayout(1366).navigation).toBe('sidebar');
    expect(resolveBusinessNavigationMode(profile(1366, 1024, phone))).toBe(
      'bottom'
    );
  });

  test('detection source does not read User-Agent', () => {
    const formFactor = read('lib/design/navigationFormFactor.ts');
    const hook = read('lib/design/useBusinessNavigationMode.ts');
    const shell = read('components/business-web/BusinessWebShell.tsx');
    expect(formFactor).not.toMatch(/userAgent/);
    expect(formFactor).not.toMatch(/navigator\.userAgent/);
    expect(hook).not.toMatch(/userAgent/);
    expect(shell).not.toMatch(/userAgent/);
    expect(formFactor).toContain('(pointer: coarse)');
    expect(formFactor).toContain('(hover: hover)');
    expect(formFactor).toContain('maxTouchPoints');
    expect(hook).toContain('readWebNavigationSource');
  });
});

describe('business navigation items', () => {
  test('bottom navigation shows at most five actions and keeps the rest under More', () => {
    for (const role of ['owner', 'manager', 'staff', null]) {
      for (const scannerEnabled of [true, false]) {
        const selection = selectBusinessWebNav({
          role,
          mode: 'bottom',
          scannerEnabled,
        });
        expect(countBusinessBottomTabs(selection)).toBeLessThanOrEqual(5);
        expect(selection.primary.length).toBeLessThanOrEqual(
          selection.overflow.length > 0 ? 4 : 5
        );
        expect(selection.menu).toEqual([]);
      }
    }
  });

  test('owner phone navigation leads with home, customers, scanner and loyalty', () => {
    const withScanner = selectBusinessWebNav({
      role: 'owner',
      mode: 'bottom',
      scannerEnabled: true,
    });
    expect(withScanner.primary.map((item) => item.key)).toEqual([
      'dashboard',
      'customers',
      'scanner',
      'loyalty',
    ]);
    expect(countBusinessBottomTabs(withScanner)).toBe(5);
    expect(withScanner.overflow.map((item) => item.key)).toContain('campaigns');
    expect(withScanner.overflow.map((item) => item.key)).toContain('billing');
    expect(withScanner.overflow.map((item) => item.key)).not.toContain(
      'scanner'
    );

    const withoutScanner = selectBusinessWebNav({
      role: 'owner',
      mode: 'bottom',
      scannerEnabled: false,
    });
    expect(withoutScanner.primary.map((item) => item.key)).toEqual([
      'dashboard',
      'customers',
      'loyalty',
      'campaigns',
    ]);
    expect(
      [...withoutScanner.primary, ...withoutScanner.overflow].map(
        (item) => item.key
      )
    ).not.toContain('scanner');
  });

  test('desktop and compact menus omit the scanner and follow role permissions', () => {
    for (const mode of ['sidebar', 'compact']) {
      const owner = selectBusinessWebNav({
        role: 'owner',
        mode,
        scannerEnabled: true,
      });
      expect(owner.primary).toEqual([]);
      expect(owner.overflow).toEqual([]);
      expect(owner.menu.map((item) => item.key)).not.toContain('scanner');
      expect(owner.menu.map((item) => item.key)).toContain('billing');
      expect(owner.menu.map((item) => item.key)).toContain('team');

      const manager = selectBusinessWebNav({
        role: 'manager',
        mode,
        scannerEnabled: true,
      });
      expect(manager.menu.map((item) => item.key)).not.toContain('scanner');
      expect(manager.menu.map((item) => item.key)).not.toContain('billing');
      expect(manager.menu.map((item) => item.key)).toContain('team');
      expect(manager.menu.map((item) => item.key)).toContain('dashboard');

      const staff = selectBusinessWebNav({
        role: 'staff',
        mode,
        scannerEnabled: true,
      });
      expect(staff.menu.map((item) => item.key)).toEqual([
        'customers',
        'campaigns',
        'settings',
      ]);
    }
  });

  test('manager bottom navigation can scan but cannot open billing', () => {
    const manager = selectBusinessWebNav({
      role: 'manager',
      mode: 'bottom',
      scannerEnabled: true,
    });
    expect(manager.primary.map((item) => item.key)).toContain('scanner');
    expect(
      [...manager.primary, ...manager.overflow].map((item) => item.key)
    ).not.toContain('billing');
    expect(
      [...manager.primary, ...manager.overflow].map((item) => item.key)
    ).toContain('team');
  });

  test('staff bottom navigation stays inside the restricted actions', () => {
    const staff = selectBusinessWebNav({
      role: 'staff',
      mode: 'bottom',
      scannerEnabled: true,
    });
    expect(staff.primary.map((item) => item.key)).toEqual([
      'customers',
      'scanner',
      'campaigns',
      'settings',
    ]);
    expect(staff.overflow).toEqual([]);
    expect(countBusinessBottomTabs(staff)).toBe(4);
  });

  test('linked card, campaign and qr routes keep the matching destination selected', () => {
    expect(
      isBusinessWebRouteActive(
        '/business/cards/new',
        BUSINESS_WEB_ROUTES.loyalty
      )
    ).toBe(true);
    expect(
      isBusinessWebRouteActive(
        '/business/campaign/abc',
        BUSINESS_WEB_ROUTES.campaigns
      )
    ).toBe(true);
    expect(
      isBusinessWebRouteActive(
        '/business/campaigns',
        BUSINESS_WEB_ROUTES.campaigns
      )
    ).toBe(true);
    expect(
      isBusinessWebRouteActive(
        '/business/campaigns',
        BUSINESS_WEB_ROUTES.loyalty
      )
    ).toBe(false);
    expect(
      isBusinessWebRouteActive('/business/qr', BUSINESS_WEB_ROUTES.settings)
    ).toBe(true);
    expect(isBusinessWebRouteActive('/business/team', '/business')).toBe(false);
  });

  test('more overlay toggles without disturbing the other shell menus', () => {
    expect(getNextBusinessWebShellOverlay(null, 'more')).toBe('more');
    expect(getNextBusinessWebShellOverlay('more', 'more')).toBeNull();
    expect(getNextBusinessWebShellOverlay('more', 'account')).toBe('account');
  });
});

describe('navigation surfaces that stay in place', () => {
  test('native tab shells and the customer wallet switch are unchanged', () => {
    const nativeBusiness = read('app/(authenticated)/(business)/_layout.tsx');
    const nativeStaff = read('app/(authenticated)/(staff)/_layout.tsx');
    const nativeCustomer = read('app/(authenticated)/(customer)/_layout.tsx');
    const shell = read('components/business-web/BusinessWebShell.tsx');
    const shellRoute = read(
      'components/business-web/BusinessWebShellRoute.tsx'
    );
    const bottomNav = read('components/business-web/BusinessWebBottomNav.tsx');

    expect(nativeBusiness).toContain('ScannerTabButton');
    expect(nativeBusiness).not.toContain('BusinessWebBottomNav');
    expect(nativeBusiness).not.toContain('useBusinessNavigationMode');
    expect(nativeStaff).toContain('ScannerTabButton');
    expect(nativeStaff).not.toContain('BusinessWebBottomNav');
    expect(nativeCustomer).toContain('wallet');
    expect(nativeCustomer).not.toContain('BusinessWebBottomNav');
    expect(shellRoute).toContain('waitForObservedSessionMode');
    expect(shellRoute).toContain("setActiveMode({ mode: 'customer' })");
    expect(shell).toContain('מעבר לארנק האישי');
    expect(shell).toContain('SafeAreaView');
    expect(bottomNav).toContain("from '@/components/ui/AppText'");
    expect(bottomNav).toContain('flexDirection.row');
    expect(bottomNav).toContain('accessibilityRole="tablist"');
  });
});
