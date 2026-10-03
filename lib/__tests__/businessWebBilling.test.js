import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import {
  getCanonicalSubscriptionPrice,
  planConfig,
} from '../../convex/lib/billing/productionContract';
import {
  isVerifiedActiveSumitResult,
  readSumitVerificationIdentifiers,
  SUMIT_CHECKOUT_ID_PARAM,
  SUMIT_PAYMENT_ID_PARAM,
} from '../billing/sumitWebReturn';
import { BUSINESS_WEB_ROUTES } from '../businessWebNavigation';

const read = (path) => readFileSync(path, 'utf8');
const billingSource = read('components/business-web/BusinessWebBilling.tsx');

describe('Business Web billing navigation and plans', () => {
  const shell = read('components/business-web/BusinessWebShell.tsx');
  const billing = billingSource;

  test('billing and analytics are real enabled Business Web routes', () => {
    expect(BUSINESS_WEB_ROUTES.billing).toBe('/business/billing');
    expect(BUSINESS_WEB_ROUTES.analytics).toBe('/business/analytics');
    expect(existsSync('app/(web-business)/business/billing.web.tsx')).toBe(
      true
    );
    expect(existsSync('app/(web-business)/business/billing.tsx')).toBe(true);
    expect(existsSync('app/(web-business)/business/analytics.tsx')).toBe(true);
    expect(shell).toContain("key: 'billing'");
    expect(shell).toContain('href: BUSINESS_WEB_ROUTES.billing');
    expect(shell).toContain("key: 'analytics'");
    expect(shell).toContain('href: BUSINESS_WEB_ROUTES.analytics');
  });

  test('renders only the three canonical plans and canonical prices', () => {
    expect(billing).toContain('PLAN_ORDER.map');
    expect(planConfig.starter.displayName).toBe('Starter');
    expect(planConfig.pro.displayName).toBe('Pro');
    expect(planConfig.premium.displayName).toBe('Premium');
    expect(getCanonicalSubscriptionPrice('starter', 'monthly').amount).toBe(
      149
    );
    expect(getCanonicalSubscriptionPrice('starter', 'yearly').amount).toBe(
      1490
    );
    expect(getCanonicalSubscriptionPrice('pro', 'monthly').amount).toBe(299);
    expect(getCanonicalSubscriptionPrice('pro', 'yearly').amount).toBe(2990);
    expect(getCanonicalSubscriptionPrice('premium', 'monthly').amount).toBe(
      499
    );
    expect(getCanonicalSubscriptionPrice('premium', 'yearly').amount).toBe(
      4990
    );
    expect(billing).toContain('בחיוב שנתי — משלמים על 10 חודשים ומקבלים 12');
    expect(billing).not.toMatch(
      /Free plan|free trial|promo code|custom pricing/i
    );
  });

  test('checkout sends only business, plan, and cadence authority', () => {
    const checkoutCall = billing.match(
      /createCheckout\(\{([\s\S]*?)\}\);/
    )?.[1];
    expect(checkoutCall).toBeTruthy();
    expect(checkoutCall).toContain('businessId: activeBusinessId');
    expect(checkoutCall).toContain('plan');
    expect(checkoutCall).toContain('billingPeriod');
    expect(checkoutCall).not.toMatch(
      /amount|currency|productId|hostedUrl|paymentPageLink/
    );
    expect(billing).toContain('window.location.assign(result.paymentPageLink)');
    expect(billing).not.toMatch(
      /card.?number|cvv|expiration|expiry|security.?code/i
    );
    expect(billing).not.toContain('TextInput');
  });

  test('current paid access disables checkout and does not pretend plan changes exist', () => {
    expect(billing).toContain('overview?.hasCurrentPaidAccess');
    expect(billing).toContain(
      'if (!activeBusinessId || pendingPlan || overview?.hasCurrentPaidAccess)'
    );
    expect(billing).toContain('disabled={hasCurrentPaidAccess}');
    expect(billing).toContain('disabled={checkoutDisabled}');
    expect(billing).toContain('המסלול הנוכחי');
    expect(billing).toContain('שינוי מסלול — בקרוב');
    expect(billing).toContain(
      'שינוי מסלול או מחזור חיוב עדיין לא זמין בגרסה זו.'
    );
  });

  test('cancellation preserves paid access and has no customer refund action', () => {
    expect(billing).toContain(
      'ביטול מפסיק את החידוש הבא. הגישה נשארת פעילה עד סוף התקופה שכבר שולמה.'
    );
    expect(billing).toContain('api.sumitBilling.cancelSUMITRecurring');
    expect(billing).toContain('BusinessWebConfirmDialog');
    expect(billing).not.toContain('refundSUMITPayment');
    expect(billing).not.toContain('createSUMITPaymentMethodUpdate');
  });
});

describe('provider-neutral billing read model', () => {
  const backend = read('convex/businessBilling.ts');

  test('authorizes access and returns only sanitized billing/document fields', () => {
    expect(backend).toContain('getBusinessBillingOverview');
    expect(backend).toContain("'manage_subscription'");
    expect(backend).toContain("event.eventType === 'payment_succeeded'");
    expect(backend).toContain("event.status === 'processed'");
    expect(backend).toContain("parsed.protocol === 'https:'");
    expect(backend).not.toMatch(/SUMIT_API_KEY|rawProvider|providerPayload/);
  });
});

describe('SUMIT web return surfaces', () => {
  const success = read('app/billing/sumit/success.web.tsx');
  const cancel = read('app/billing/sumit/cancel.web.tsx');

  test('uses only SUMIT documented redirect identifiers', () => {
    expect(SUMIT_PAYMENT_ID_PARAM).toBe('og-paymentid');
    expect(SUMIT_CHECKOUT_ID_PARAM).toBe('og-externalidentifier');
    expect(
      readSumitVerificationIdentifiers({
        'og-paymentid': '41001',
        'og-externalidentifier': 'checkout_1',
        amount: '1',
        success: 'true',
      })
    ).toEqual({ checkoutId: 'checkout_1', paymentId: '41001' });
    expect(
      readSumitVerificationIdentifiers({
        amount: '4990',
        plan: 'premium',
        success: 'true',
      })
    ).toBeNull();
  });

  test('missing redirect identifiers remain neutral and grant no entitlement', () => {
    expect(success).toContain("setState('awaiting_verification')");
    expect(success.indexOf("setState('awaiting_verification')")).toBeLessThan(
      success.indexOf('verifyPayment({ checkoutId, paymentId })')
    );
    const surface = read('components/business-web/SumitReturnSurface.tsx');
    expect(surface).toContain('awaiting_verification: {');
    expect(surface).toContain('התשלום ממתין לאימות.');
    expect(surface).toContain('לא שינינו את מצב המנוי');
  });

  test('verified success requires a server verification result with active state', () => {
    expect(isVerifiedActiveSumitResult({ ok: true })).toBe(false);
    expect(
      isVerifiedActiveSumitResult({ ok: true, subscriptionStatus: 'inactive' })
    ).toBe(false);
    expect(
      isVerifiedActiveSumitResult({ ok: true, subscriptionStatus: 'active' })
    ).toBe(true);
    expect(success).toContain('api.sumitBilling.verifySUMITCheckoutPayment');
    expect(success).toContain('verifyPayment({ checkoutId, paymentId })');
    expect(success).toContain("setState('verified')");
    expect(
      success.indexOf('verifyPayment({ checkoutId, paymentId })')
    ).toBeLessThan(success.indexOf("setState('verified')"));
    expect(success).not.toMatch(/params\.(amount|plan|currency|success)/);
  });

  test('cancel return is presentation-only and never cancels a subscription', () => {
    expect(cancel).toContain('<SumitReturnSurface state="canceled" />');
    expect(cancel).not.toContain('cancelSUMITRecurring');
    expect(cancel).not.toContain('useAction');
  });

  test('expired authentication shows safe re-authentication and never verifies anonymously', () => {
    expect(success).toContain('if (!isAuthenticated)');
    expect(success).toContain(
      '<SumitReturnSurface state="reauthentication" />'
    );
    expect(success).toContain('!isAuthenticated || attemptedRef.current');
    expect(success).not.toContain('authError');
    expect(success).not.toContain('error.message');
    const surface = read('components/business-web/SumitReturnSurface.tsx');
    expect(surface).toContain('נדרשת התחברות מחדש כדי לאמת את התשלום.');
    expect(surface).toContain("resolveBusinessSignedOutHref('web')");
  });

  test('redirect URLs are metadata and require external SUMIT configuration', () => {
    const backend = read('convex/sumitBilling.ts');
    const docs = read('docs/SUMIT_BILLING_FOUNDATION.md');
    expect(backend).toContain('Returning them does not configure SUMIT');
    expect(docs).toMatch(
      /They do not configure the SUMIT hosted\s+payment page automatically\./
    );
    expect(docs).toContain('configured externally in SUMIT');
  });

  test('native purchase routes remain isolated from Business Web checkout', () => {
    const nativeSubscription = read(
      'app/(authenticated)/(business)/settings-business-subscription.tsx'
    );
    expect(nativeSubscription).not.toContain('createSUMITCheckout');
    expect(nativeSubscription).not.toContain('paymentPageLink');
    const nativeSuccess = read('app/billing/sumit/success.tsx');
    const nativeCancel = read('app/billing/sumit/cancel.tsx');
    const nativeBilling = read('app/(web-business)/business/billing.tsx');
    for (const source of [nativeSuccess, nativeCancel, nativeBilling]) {
      expect(source).toContain('NativeCompanionRedirect');
      expect(source).not.toContain('SumitReturnSurface');
      expect(source).not.toContain('BusinessWebBilling');
      expect(source).not.toContain('paymentPageLink');
    }
  });

  test('new web sources contain no SUMIT secret or product URL', () => {
    const sources = [
      billingSource,
      success,
      cancel,
      read('lib/billing/sumitWebReturn.ts'),
    ].join('\n');
    expect(sources).not.toMatch(/SUMIT_API_KEY|EXPO_PUBLIC_SUMIT_/);
    expect(sources).not.toMatch(/https:\/\/[^\s'"]*sumit/i);
  });
});
