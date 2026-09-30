import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const NATIVE_ROOTS = [
  'app/(auth)',
  'app/(authenticated)',
  'app/billing',
  'app/(web-business)',
  'components',
  'screens',
];

const NATIVE_FORBIDDEN = [
  /purchasePackage\s*\(/,
  /restorePurchases\s*\(/,
  /Purchases\.purchasePackage/,
  /Purchases\.restorePurchases/,
  /paymentPageLink/,
  /createSUMITCheckout/,
  /SumitReturnSurface/,
  /BusinessWebBilling/,
  /המשך לרכישה/,
  /שחזור רכישות/,
  /הצגת אפשרויות רכישה/,
  /apps\.apple\.com\/account\/subscriptions/,
  /play\.google\.com\/store\/account\/subscriptions/,
  /window\.location\.assign/,
  /onBillingPeriodChange/,
];

function isWebOnlySource(relativePath) {
  return (
    relativePath.endsWith('.web.tsx') ||
    relativePath.endsWith('.web.ts') ||
    relativePath.replaceAll('\\', '/').includes('components/business-web/')
  );
}

function collectSources(root) {
  const rootPath = path.join(process.cwd(), root);
  const files = [];
  for (const entry of readdirSync(rootPath)) {
    const absolute = path.join(rootPath, entry);
    const relative = path.join(root, entry).replaceAll('\\', '/');
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      files.push(...collectSources(relative));
      continue;
    }
    if (!absolute.endsWith('.ts') && !absolute.endsWith('.tsx')) {
      continue;
    }
    if (isWebOnlySource(relative)) {
      continue;
    }
    files.push(relative);
  }
  return files;
}

describe('native store billing isolation', () => {
  test('native sources cannot expose purchase, restore, price, or SUMIT checkout UI', () => {
    const offenders = [];
    for (const file of NATIVE_ROOTS.flatMap(collectSources)) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of NATIVE_FORBIDDEN) {
        if (pattern.test(source)) {
          offenders.push(`${file}: ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('native billing routes redirect and web SUMIT checkout stays enabled', () => {
    const webBilling = readFileSync(
      'components/business-web/BusinessWebBilling.tsx',
      'utf8'
    );
    const webRoute = readFileSync(
      'app/(web-business)/business/billing.web.tsx',
      'utf8'
    );
    const webSuccess = readFileSync(
      'app/billing/sumit/success.web.tsx',
      'utf8'
    );
    const webCancel = readFileSync('app/billing/sumit/cancel.web.tsx', 'utf8');

    expect(webBilling).toContain('createSUMITCheckout');
    expect(webBilling).toContain(
      'window.location.assign(result.paymentPageLink)'
    );
    expect(webRoute).toContain('BusinessWebBilling');
    expect(webSuccess).toContain('verifySUMITCheckoutPayment');
    expect(webCancel).toContain('SumitReturnSurface');

    for (const file of [
      'app/(web-business)/business/billing.tsx',
      'app/billing/sumit/success.tsx',
      'app/billing/sumit/cancel.tsx',
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('NativeCompanionRedirect');
      expect(source).not.toContain('paymentPageLink');
      expect(source).not.toContain('BusinessWebBilling');
      expect(source).not.toContain('SumitReturnSurface');
    }
  });

  test('RevenueCat provider stays a no-op while the launch flag is disabled', () => {
    const guards = readFileSync('lib/subscription/billingGuards.ts', 'utf8');
    const context = readFileSync('contexts/RevenueCatContext.tsx', 'utf8');
    const flag = 'NATIVE_REVENUECAT_PURCHASES_ENABLED';
    const sdkCalls = [
      'Purchases.configure',
      'Purchases.logIn',
      'Purchases.getOfferings',
      'Purchases.getCustomerInfo',
      'Purchases.purchasePackage',
      'Purchases.restorePurchases',
      "import('react-native-purchases')",
    ];

    expect(guards).toContain(`${flag} = false`);
    for (const call of sdkCalls) {
      let from = 0;
      let seen = false;
      while (from < context.length) {
        const index = context.indexOf(call, from);
        if (index < 0) {
          break;
        }
        seen = true;
        const flagIndex = context.lastIndexOf(`!${flag}`, index);
        expect(flagIndex).toBeGreaterThanOrEqual(0);
        expect(flagIndex).toBeLessThan(index);
        from = index + call.length;
      }
      expect(seen).toBe(true);
    }
  });
});
