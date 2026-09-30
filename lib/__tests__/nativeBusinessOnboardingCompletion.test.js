import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  BUSINESS_ONBOARDING_ROUTES,
  getBusinessOnboardingRouteForStep,
} from '../onboarding/businessOnboardingFlow';

const ONBOARDING_CHAIN = [
  'app/(auth)/onboarding-business-role.tsx',
  'app/(authenticated)/merchant/onboarding/business-basics.tsx',
  'app/(authenticated)/merchant/onboarding/create-business.tsx',
  'app/(authenticated)/merchant/onboarding/create-program.tsx',
  'app/(authenticated)/merchant/onboarding/preview-card.tsx',
];

const FORBIDDEN_BILLING = [
  'purchasePackage',
  'restorePurchases',
  'paymentPageLink',
  'המשך לרכישה',
  'שחזור רכישות',
  'apps.apple.com/account/subscriptions',
  'play.google.com/store/account/subscriptions',
  '/(auth)/paywall',
  '₪',
];

describe('native business onboarding completes without a purchase dead end', () => {
  test('the default owner path skips plan purchase and finishes on the dashboard', () => {
    expect(getBusinessOnboardingRouteForStep('plan', 'default')).toBe(
      BUSINESS_ONBOARDING_ROUTES.createProgram
    );
    expect(getBusinessOnboardingRouteForStep('role', 'default')).toBe(
      BUSINESS_ONBOARDING_ROUTES.role
    );

    const role = readFileSync(ONBOARDING_CHAIN[0], 'utf8');
    const basics = readFileSync(ONBOARDING_CHAIN[1], 'utf8');
    const createBusiness = readFileSync(ONBOARDING_CHAIN[2], 'utf8');
    const createProgram = readFileSync(ONBOARDING_CHAIN[3], 'utf8');
    const preview = readFileSync(ONBOARDING_CHAIN[4], 'utf8');

    expect(role).toContain('BUSINESS_ONBOARDING_ROUTES.businessBasics');
    expect(basics).toContain('BUSINESS_ONBOARDING_ROUTES.createBusiness');
    expect(createBusiness).toContain(
      'BUSINESS_ONBOARDING_ROUTES.createProgram'
    );
    expect(createProgram).toContain('BUSINESS_ONBOARDING_ROUTES.previewCard');
    expect(preview).toContain(
      "safeDismissTo('/(authenticated)/(business)/dashboard')"
    );
  });

  test('onboarding screens and the compatibility paywall do not sell or trap the owner', () => {
    const paywall = readFileSync('app/(auth)/paywall/index.tsx', 'utf8');
    const legacyPlan = readFileSync(
      'app/(auth)/onboarding-business-plan.tsx',
      'utf8'
    );
    const sources = [
      ...ONBOARDING_CHAIN.map((file) => readFileSync(file, 'utf8')),
      paywall,
      legacyPlan,
    ];

    for (const source of sources) {
      for (const pattern of FORBIDDEN_BILLING) {
        expect(source).not.toContain(pattern);
      }
    }

    expect(paywall).toContain('NativeCompanionRedirect');
    expect(paywall).not.toContain("safeBack('/(auth)/sign-up')");
    expect(legacyPlan).toContain('BUSINESS_ONBOARDING_ROUTES.entry');
  });
});
