import { describe, expect, test } from 'bun:test';

import {
  BUSINESS_ONBOARDING_ROUTES,
  getBusinessOnboardingEntryRoute,
  getBusinessOnboardingRouteForStep,
  getBusinessOnboardingStepOrder,
  getBusinessOnboardingTotalSteps,
} from '../onboarding/businessOnboardingFlow';

describe('business onboarding flow helpers', () => {
  test('builds onboarding entry route with additional flow only when needed', () => {
    expect(getBusinessOnboardingEntryRoute(false)).toBe(
      BUSINESS_ONBOARDING_ROUTES.entry
    );
    expect(getBusinessOnboardingEntryRoute(true)).toBe(
      `${BUSINESS_ONBOARDING_ROUTES.entry}?flow=additional`
    );
  });

  test('adds flow query only for additional-flow steps', () => {
    expect(getBusinessOnboardingRouteForStep('name', 'additional')).toBe(
      `${BUSINESS_ONBOARDING_ROUTES.createBusiness}?flow=additional`
    );
    expect(getBusinessOnboardingRouteForStep('plan', 'default')).toBe(
      BUSINESS_ONBOARDING_ROUTES.businessBasics
    );
    expect(getBusinessOnboardingRouteForStep('plan', 'additional')).toBe(
      `${BUSINESS_ONBOARDING_ROUTES.createProgram}?flow=additional`
    );
    expect(
      getBusinessOnboardingRouteForStep('createProgram', 'additional')
    ).toBe(`${BUSINESS_ONBOARDING_ROUTES.createProgram}?flow=additional`);
    expect(
      getBusinessOnboardingRouteForStep('businessBasics', 'additional')
    ).toBe(`${BUSINESS_ONBOARDING_ROUTES.businessBasics}?flow=additional`);
    expect(getBusinessOnboardingRouteForStep('role', 'additional')).toBe(
      BUSINESS_ONBOARDING_ROUTES.role
    );
  });

  test('maps bypassed legacy default steps to consolidated active routes', () => {
    const businessBasicsSteps = [
      'discovery',
      'reason',
      'usageArea',
      'businessType',
      'businessCadence',
      'businessCampaignRelevance',
      'plan',
    ];

    for (const step of businessBasicsSteps) {
      expect(getBusinessOnboardingRouteForStep(step, 'default')).toBe(
        BUSINESS_ONBOARDING_ROUTES.businessBasics
      );
    }

    expect(getBusinessOnboardingRouteForStep('name', 'default')).toBe(
      BUSINESS_ONBOARDING_ROUTES.createBusiness
    );
    expect(getBusinessOnboardingRouteForStep('plan', 'additional')).toBe(
      `${BUSINESS_ONBOARDING_ROUTES.createProgram}?flow=additional`
    );
  });

  test('returns expected step order and total by flow', () => {
    expect(getBusinessOnboardingStepOrder('plan', 'default')).toBe(4);
    expect(getBusinessOnboardingStepOrder('plan', 'additional')).toBe(2);
    expect(getBusinessOnboardingStepOrder('businessBasics', 'default')).toBe(4);
    expect(getBusinessOnboardingStepOrder('businessBasics', 'additional')).toBe(
      3
    );
    expect(getBusinessOnboardingTotalSteps('default')).toBe(5);
    expect(getBusinessOnboardingTotalSteps('additional')).toBe(4);
  });
});
