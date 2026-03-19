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
      `${BUSINESS_ONBOARDING_ROUTES.name}?flow=additional`
    );
    expect(
      getBusinessOnboardingRouteForStep('createProgram', 'additional')
    ).toBe(`${BUSINESS_ONBOARDING_ROUTES.createProgram}?flow=additional`);
    expect(getBusinessOnboardingRouteForStep('role', 'additional')).toBe(
      BUSINESS_ONBOARDING_ROUTES.role
    );
  });

  test('returns expected step order and total by flow', () => {
    expect(getBusinessOnboardingStepOrder('plan', 'default')).toBe(7);
    expect(getBusinessOnboardingStepOrder('plan', 'additional')).toBe(3);
    expect(getBusinessOnboardingTotalSteps('default')).toBe(9);
    expect(getBusinessOnboardingTotalSteps('additional')).toBe(5);
  });
});
