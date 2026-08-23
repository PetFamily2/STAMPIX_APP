import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  BUSINESS_ONBOARDING_ROUTES,
  getBusinessOnboardingEntryRoute,
  getBusinessOnboardingRouteForStep,
  getBusinessOnboardingStepOrder,
  getBusinessOnboardingTotalSteps,
  resolveBusinessOnboardingDraftIdentifiers,
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
      `${BUSINESS_ONBOARDING_ROUTES.businessBasics}?flow=additional`
    );
    expect(getBusinessOnboardingRouteForStep('plan', 'default')).toBe(
      BUSINESS_ONBOARDING_ROUTES.createProgram
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
    ];

    for (const step of businessBasicsSteps) {
      expect(getBusinessOnboardingRouteForStep(step, 'default')).toBe(
        BUSINESS_ONBOARDING_ROUTES.businessBasics
      );
    }

    expect(getBusinessOnboardingRouteForStep('name', 'default')).toBe(
      BUSINESS_ONBOARDING_ROUTES.businessBasics
    );
    expect(getBusinessOnboardingRouteForStep('plan', 'additional')).toBe(
      `${BUSINESS_ONBOARDING_ROUTES.createProgram}?flow=additional`
    );
  });

  test('returns expected step order and total by flow', () => {
    expect(getBusinessOnboardingStepOrder('role', 'default')).toBe(1);
    expect(getBusinessOnboardingStepOrder('businessBasics', 'default')).toBe(2);
    expect(getBusinessOnboardingStepOrder('createBusiness', 'default')).toBe(3);
    expect(getBusinessOnboardingStepOrder('createProgram', 'default')).toBe(4);
    expect(getBusinessOnboardingStepOrder('previewCard', 'default')).toBe(5);
    expect(getBusinessOnboardingStepOrder('plan', 'default')).toBe(4);
    expect(getBusinessOnboardingStepOrder('plan', 'additional')).toBe(3);
    expect(getBusinessOnboardingStepOrder('businessBasics', 'additional')).toBe(
      1
    );
    expect(getBusinessOnboardingTotalSteps('default')).toBe(5);
    expect(getBusinessOnboardingTotalSteps('additional')).toBe(4);
  });

  test('legacy draft steps normalize safely to nearest new step', () => {
    const legacyBasicsSteps = [
      'name',
      'discovery',
      'reason',
      'usageArea',
      'businessType',
      'businessCadence',
      'businessCampaignRelevance',
    ];

    for (const step of legacyBasicsSteps) {
      expect(getBusinessOnboardingRouteForStep(step, 'default')).toBe(
        BUSINESS_ONBOARDING_ROUTES.businessBasics
      );
    }

    expect(getBusinessOnboardingRouteForStep('plan', 'default')).toBe(
      BUSINESS_ONBOARDING_ROUTES.createProgram
    );
  });

  test('draft identifier resolution uses explicit overrides over stale context', () => {
    expect(
      resolveBusinessOnboardingDraftIdentifiers({
        contextBusinessId: 'business_old',
        contextProgramId: 'program_old',
        businessId: 'business_new',
        programId: 'program_new',
      })
    ).toEqual({
      businessId: 'business_new',
      programId: 'program_new',
    });
  });

  test('draft identifier resolution preserves context values when omitted', () => {
    expect(
      resolveBusinessOnboardingDraftIdentifiers({
        contextBusinessId: 'business_existing',
        contextProgramId: 'program_existing',
      })
    ).toEqual({
      businessId: 'business_existing',
      programId: 'program_existing',
    });
  });

  test('draft identifier resolution does not erase the other identifier', () => {
    expect(
      resolveBusinessOnboardingDraftIdentifiers({
        contextBusinessId: 'business_existing',
        contextProgramId: 'program_existing',
        programId: 'program_new',
      })
    ).toEqual({
      businessId: 'business_existing',
      programId: 'program_new',
    });
    expect(
      resolveBusinessOnboardingDraftIdentifiers({
        contextBusinessId: 'business_existing',
        contextProgramId: 'program_existing',
        businessId: 'business_new',
      })
    ).toEqual({
      businessId: 'business_new',
      programId: 'program_existing',
    });
  });
});

describe('business onboarding authoritative mutation contracts', () => {
  const createProgramSource = readFileSync(
    'app/(authenticated)/merchant/onboarding/create-program.tsx',
    'utf8'
  );
  const previewSource = readFileSync(
    'app/(authenticated)/merchant/onboarding/preview-card.tsx',
    'utf8'
  );

  test('program submit uses one create-or-resume mutation with no separate ID linkage', () => {
    const stepSyncIndex = createProgramSource.indexOf(
      'await stepSyncPromiseRef.current'
    );
    const createOrResumeIndex = createProgramSource.indexOf(
      'await createOrResumeProgram({'
    );

    expect(createProgramSource).toContain(
      'api.loyaltyPrograms.createOrResumeBusinessOnboardingProgram'
    );
    expect(createProgramSource).not.toContain(
      'api.loyaltyPrograms.createLoyaltyProgram'
    );
    expect(createProgramSource).not.toContain(
      'programId: loyaltyProgramId'
    );
    expect(createProgramSource).toContain('setProgramId(loyaltyProgramId)');
    expect(stepSyncIndex).toBeGreaterThan(-1);
    expect(createOrResumeIndex).toBeGreaterThan(stepSyncIndex);
  });

  test('preview publishes then completes atomically and dismisses history', () => {
    const publishIndex = previewSource.indexOf('await publishProgram({');
    const completionIndex = previewSource.indexOf(
      'await completeBusinessOnboarding({'
    );
    const completionCall = previewSource.slice(
      completionIndex,
      completionIndex + 220
    );

    expect(publishIndex).toBeGreaterThan(-1);
    expect(completionIndex).toBeGreaterThan(publishIndex);
    expect(completionCall).toContain('businessId,');
    expect(completionCall).toContain('programId,');
    expect(completionCall).toContain(
      'flow: resolveBusinessOnboardingFlow(flow)'
    );
    expect(previewSource).not.toContain('api.users.setActiveBusiness');
    expect(previewSource).not.toContain('api.users.setActiveMode');
    expect(previewSource).not.toContain(
      'useBusinessOnboardingDraftPersistence'
    );
    expect(previewSource).toContain(
      "safeDismissTo('/(authenticated)/(business)/dashboard')"
    );
    expect(previewSource).not.toContain(
      "safePush('/(authenticated)/(business)/dashboard')"
    );
  });
});
