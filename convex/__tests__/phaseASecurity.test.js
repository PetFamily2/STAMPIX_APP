import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  canStartRevenueCatPurchase,
  evaluateRevenueCatBillingGuard,
  isServerConfirmedPaidEntitlement,
} from '../../lib/subscription/billingGuards';
import { createOrUpdateUser } from '../auth';
import * as debugFunctions from '../debug';
import {
  debugEntitlementConstants,
  syncBusinessSubscription,
} from '../entitlements';
import { addStamp, redeemReward } from '../scanner';
import * as seedFunctions from '../seed';
import * as userFunctions from '../users';
import {
  debugIdentity,
  getById,
  listActive,
  updateProfile,
  updateSubscriptionPlan,
  wipeAllDataHard,
} from '../users';

function expectInternalFunction(fn) {
  expect(typeof fn).toBe('function');
  expect(fn.isInternal).toBe(true);
}

async function expectRejectsWithCode(fn, code) {
  await expect(fn()).rejects.toThrow(code);
}

function expectGuardBefore(source, targetNeedle) {
  const targetIndex = source.indexOf(targetNeedle);
  const guardIndex = Math.max(
    source.lastIndexOf('evaluateRevenueCatBillingGuard', targetIndex),
    source.lastIndexOf('canStartRevenueCatPurchase', targetIndex)
  );

  expect(targetIndex).toBeGreaterThanOrEqual(0);
  expect(guardIndex).toBeGreaterThanOrEqual(0);
  expect(guardIndex).toBeLessThan(targetIndex);
}

describe('Phase A production exposure hardening', () => {
  test('seed and debug maintenance functions are internal only', () => {
    for (const [name, fn] of Object.entries(seedFunctions)) {
      expectInternalFunction(fn, `seed.${name}`);
    }

    for (const [name, fn] of Object.entries(debugFunctions)) {
      expectInternalFunction(fn, `debug.${name}`);
    }

    expectInternalFunction(
      debugEntitlementConstants,
      'entitlements.debugEntitlementConstants'
    );
  });

  test('arbitrary user deletion is removed and legacy account wipe functions are internal only', () => {
    expect(userFunctions.remove).toBeUndefined();
    expectInternalFunction(wipeAllDataHard, 'users.wipeAllDataHard');
    expectInternalFunction(getById, 'users.getById');
    expectInternalFunction(listActive, 'users.listActive');
    expectInternalFunction(updateProfile, 'users.updateProfile');
    expectInternalFunction(debugIdentity, 'users.debugIdentity');
  });

  test('legacy scanner write mutations are internal only', () => {
    expectInternalFunction(addStamp, 'scanner.addStamp');
    expectInternalFunction(redeemReward, 'scanner.redeemReward');
  });
});

describe('Phase A client-forgery denials', () => {
  test('public auth helper rejects client-supplied identity linking data', async () => {
    await expectRejectsWithCode(
      () =>
        createOrUpdateUser._handler(
          {},
          {
            existingUserId: 'u_victim',
            provider: 'google',
            profile: { email: 'attacker@example.com' },
          }
        ),
      'PUBLIC_AUTH_LINKING_DISABLED'
    );
  });

  test('user subscription mutation rejects client-forged billing state in production', async () => {
    const previous = process.env.STAMPAIX_ALLOW_MOCK_BILLING;
    process.env.STAMPAIX_ALLOW_MOCK_BILLING = 'true';
    try {
      await expectRejectsWithCode(
        () =>
          updateSubscriptionPlan._handler(
            {},
            {
              plan: 'premium',
              productId: 'forged-product',
              status: 'active',
            }
          ),
        'SUBSCRIPTION_CLIENT_SYNC_DISABLED'
      );
    } finally {
      if (previous === undefined) {
        delete process.env.STAMPAIX_ALLOW_MOCK_BILLING;
      } else {
        process.env.STAMPAIX_ALLOW_MOCK_BILLING = previous;
      }
    }
  });

  test('business subscription mutation rejects client-forged billing state in production', async () => {
    const previous = process.env.STAMPAIX_ALLOW_MOCK_BILLING;
    process.env.STAMPAIX_ALLOW_MOCK_BILLING = 'true';
    try {
      await expectRejectsWithCode(
        () =>
          syncBusinessSubscription._handler(
            {},
            {
              businessId: 'b_target',
              plan: 'premium',
              status: 'active',
              period: 'yearly',
              provider: 'manual',
            }
          ),
        'SUBSCRIPTION_CLIENT_SYNC_DISABLED'
      );
    } finally {
      if (previous === undefined) {
        delete process.env.STAMPAIX_ALLOW_MOCK_BILLING;
      } else {
        process.env.STAMPAIX_ALLOW_MOCK_BILLING = previous;
      }
    }
  });

  test('billing guard is disabled by default without explicit inputs', () => {
    expect(canStartRevenueCatPurchase()).toBe(false);
  });

  test('billing guard requires payment, server billing, config, package, native build, and business identity', () => {
    const enabled = {
      paymentSystemEnabled: true,
      serverAuthoritativeBillingEnabled: true,
      isRevenueCatConfigured: true,
      isExpoGo: false,
      packageId: 'pro_monthly',
      businessAppUserId: 'business:abc123',
    };

    expect(evaluateRevenueCatBillingGuard(enabled)).toMatchObject({
      canStart: true,
    });

    for (const [key, value, code] of [
      ['paymentSystemEnabled', false, 'payment_disabled'],
      ['serverAuthoritativeBillingEnabled', false, 'server_billing_disabled'],
      ['isRevenueCatConfigured', false, 'revenuecat_not_configured'],
      ['isExpoGo', true, 'expo_go'],
      ['packageId', null, 'missing_package'],
      ['businessAppUserId', 'user:abc123', 'invalid_business_identity'],
    ]) {
      expect(
        evaluateRevenueCatBillingGuard({ ...enabled, [key]: value })
      ).toMatchObject({ canStart: false, code });
    }
  });

  test('server entitlement confirmation requires active paid Convex state', () => {
    expect(
      isServerConfirmedPaidEntitlement(
        {
          plan: 'pro',
          effectivePlan: 'pro',
          billingPeriod: 'monthly',
          isSubscriptionActive: true,
        },
        'pro',
        'monthly'
      )
    ).toBe(true);

    expect(
      isServerConfirmedPaidEntitlement(
        {
          plan: 'pro',
          effectivePlan: 'pro',
          billingPeriod: 'monthly',
          isSubscriptionActive: false,
        },
        'pro',
        'monthly'
      )
    ).toBe(false);

    expect(
      isServerConfirmedPaidEntitlement(
        {
          entitlements: { active: { pro: {} } },
        },
        'pro',
        'monthly'
      )
    ).toBe(false);
  });

  test('RevenueCat purchase SDK call is guarded before invocation', () => {
    const source = readFileSync('contexts/RevenueCatContext.tsx', 'utf8');

    expectGuardBefore(source, 'Purchases.purchasePackage');
  });

  test('RevenueCat restore SDK call is guarded before invocation', () => {
    const source = readFileSync('contexts/RevenueCatContext.tsx', 'utf8');

    expectGuardBefore(source, 'Purchases.restorePurchases');
  });

  test('auth paywall native RevenueCat UI paths are explicitly disabled', () => {
    const source = readFileSync('app/(auth)/paywall/index.tsx', 'utf8');

    expect(source).toContain('NATIVE_REVENUECAT_UI_ENABLED = false');
    expect(source).toContain('isNativeRevenueCatUiDisabled');
    expect(source).toContain('selectedBillingGuard.canStart');
    expect(source).not.toContain('RevenueCatUI.presentPaywallIfNeeded');
    expect(source).not.toContain('RevenueCatUI.presentCustomerCenter');
    expectGuardBefore(source, 'restorePurchases({');
    expectGuardBefore(source, 'purchasePackage(packageId');
  });

  test('auth paywall disabled states use the full billing guard', () => {
    const source = readFileSync('app/(auth)/paywall/index.tsx', 'utf8');

    expect(source).toContain('isSelectedPaidBillingReady');
    expect(source).toContain('selectedBillingGuard.canStart');
    expect(source).toContain('ctaDisabled={');
    expect(source).toContain('!isSelectedPaidBillingReady');
    expect(source).toContain(
      'disabled={isRestoring || !selectedBillingGuard.canStart}'
    );
    expect(source).not.toContain(
      'isRestoring || isPreviewMode || !PAYMENT_SYSTEM_ENABLED'
    );
  });

  test('UpgradeModal checks billing guard before starting purchase flow', () => {
    const source = readFileSync(
      'components/subscription/UpgradeModal.tsx',
      'utf8'
    );

    expectGuardBefore(source, 'purchasePackage(rcPackageId');
  });

  test('UpgradeModal waits for server entitlement confirmation after purchase and restore', () => {
    const source = readFileSync(
      'components/subscription/UpgradeModal.tsx',
      'utf8'
    );
    const authPaywallSource = readFileSync(
      'app/(auth)/paywall/index.tsx',
      'utf8'
    );

    expect(source).toContain('syncUserSubscription: false');
    expect(source).toContain("'pending_purchase'");
    expect(source).toContain("'pending_restore'");
    expect(source).toContain("setSyncStatus('timeout')");
    expect(source).toContain('SERVER_SYNC_TIMEOUT_MESSAGE_HE');
    expect(source).toContain('isServerConfirmedPaidEntitlement');
    expect(source).toContain('restorePurchases({');
    expect(source).toContain("waitForServerEntitlements('purchase'");
    expect(source).toContain("waitForServerEntitlements('restore'");
    expect(source).not.toContain('syncBusinessSubscription');
    expect(authPaywallSource).toContain('syncUserSubscription: false');
    expect(authPaywallSource).toContain('isServerConfirmedPaidEntitlement');
    expect(authPaywallSource).toContain('waitForServerEntitlements(');
  });

  test('RevenueCat context cannot grant local premium from customer info', () => {
    const source = readFileSync('contexts/RevenueCatContext.tsx', 'utf8');
    const mockPurchaseStart = source.indexOf('if (MOCK_PAYMENTS)');
    const mockPurchaseEnd = source.indexOf('// Expo Go', mockPurchaseStart);
    const mockPurchaseBranch = source.slice(
      mockPurchaseStart,
      mockPurchaseEnd
    );

    expect(source).not.toContain('planFromRevenueCatSubscriber');
    expect(source).not.toContain('setSubscriptionPlan');
    expect(source).not.toContain('handleCustomerInfo');
    expect(source).not.toContain('const shouldSyncUserSubscription');
    expect(source).not.toContain("return plan !== 'starter'");
    expect(source).not.toContain("subscriptionPlan !== 'starter'");
    expect(source).not.toContain('const isPaid');
    expect(source).not.toContain(
      "Alert.alert('הצלחה', 'הרכישות שוחזרו בהצלחה!')"
    );
    expect(mockPurchaseBranch).toContain(
      'השדרוג לא זמין כרגע באפליקציה הזו. אפשר להמשיך להשתמש במסלול הנוכחי.'
    );
    expect(mockPurchaseBranch).toContain('return false;');
    expect(source).toContain(
      "const subscriptionPlan: SubscriptionPlan = 'starter'"
    );
    expect(source).toContain('const isPremium = false');
    expect(source).toContain('await Purchases.getCustomerInfo();');
  });

  test('business plan onboarding does not expose a RevenueCat purchase entry point', () => {
    const source = readFileSync(
      'app/(auth)/onboarding-business-plan.tsx',
      'utf8'
    );

    expect(source).not.toContain('Purchases.purchasePackage');
    expect(source).not.toContain('RevenueCatUI.presentPaywall');
    expect(source).not.toContain('presentCustomerCenter');
  });
});
