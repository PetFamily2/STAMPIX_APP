import { describe, expect, test } from 'bun:test';

import {
  canActivateGuidedTarget,
  clampGuideSteps,
  createGuidedTargetActivationOrchestrator,
  getGuideBottomInset,
  getGuidePulseIterations,
  GUIDE_INSTRUCTIONS,
  GUIDE_ROUTE_KEYS,
  RECOMMENDATION_GUIDE_IDS,
  RECOMMENDATION_GUIDE_ENTITY_KINDS,
  recommendationRequiresExactEntity,
  validateGuideBinding,
} from '../recommendations/guidance';

const activeTarget = {
  bindingValid: true,
  guideSessionId: 'guide_session_1',
  serverStatus: 'active',
  businessMatches: true,
  isSwitchingBusiness: false,
  isClosed: false,
  routeAndEntityMatch: true,
};

describe('guided action state integrity', () => {
  test('accepts only a fixed guide mapped to the stable recommendation', () => {
    expect(
      validateGuideBinding({
        guideSessionId: 'guide_session_1',
        guideId: 'near-reward',
        stableId: 'growth.near_reward',
        routeBusinessId: 'business_1',
        recommendationBusinessId: 'business_1',
        activeBusinessId: 'business_1',
        currentRouteKey: 'customers',
      })
    ).toMatchObject({ ok: true, businessId: 'business_1' });
  });

  test('business switching closes the previous binding', () => {
    expect(
      validateGuideBinding({
        guideSessionId: 'guide_session_1',
        guideId: 'near-reward',
        stableId: 'growth.near_reward',
        routeBusinessId: 'business_1',
        recommendationBusinessId: 'business_1',
        activeBusinessId: 'business_2',
        currentRouteKey: 'customers',
      })
    ).toEqual({ ok: false, reasonCode: 'BUSINESS_MISMATCH' });
  });

  test('an exact program or campaign guide requires its entity binding', () => {
    expect(
      validateGuideBinding({
        guideSessionId: 'guide_session_1',
        guideId: 'program-publish',
        stableId: 'program.publish_draft',
        routeBusinessId: 'business_1',
        recommendationBusinessId: 'business_1',
        activeBusinessId: 'business_1',
        currentRouteKey: 'program-detail',
        routeEntityId: 'program_1',
        routeEntityKind: 'program',
      })
    ).toEqual({ ok: false, reasonCode: 'MISSING_ENTITY' });
  });

  test('a fixed guide is rejected on a noncanonical route key', () => {
    expect(
      validateGuideBinding({
        guideSessionId: 'guide_session_1',
        guideId: 'near-reward',
        stableId: 'growth.near_reward',
        routeBusinessId: 'business_1',
        recommendationBusinessId: 'business_1',
        activeBusinessId: 'business_1',
        currentRouteKey: 'campaigns',
      })
    ).toEqual({ ok: false, reasonCode: 'ROUTE_MISMATCH' });
  });

  test('every approved guide accepts only its canonical route key', () => {
    for (const [stableId, guideId] of Object.entries(
      RECOMMENDATION_GUIDE_IDS
    )) {
      expect(
        validateGuideBinding({
          guideSessionId: 'guide_session_1',
          guideId,
          stableId,
          routeBusinessId: 'business_1',
          recommendationBusinessId: 'business_1',
          activeBusinessId: 'business_1',
          currentRouteKey: GUIDE_ROUTE_KEYS[guideId],
          guideEntityId: recommendationRequiresExactEntity(stableId)
            ? 'entity_1'
            : undefined,
          routeEntityId: recommendationRequiresExactEntity(stableId)
            ? 'entity_1'
            : undefined,
          routeEntityKind:
            RECOMMENDATION_GUIDE_ENTITY_KINDS[stableId],
        })
      ).toMatchObject({ ok: true });
    }
  });

  test.each([
    [
      'program',
      {
        stableId: 'program.publish_draft',
        guideId: 'program-publish',
        currentRouteKey: 'program-detail',
        routeEntityKind: 'program',
      },
    ],
    [
      'campaign',
      {
        stableId: 'campaign.publish_draft',
        guideId: 'campaign-publish',
        currentRouteKey: 'campaign-detail',
        routeEntityKind: 'campaign',
      },
    ],
  ])('%s detail route requires exact guide and route entity equality', (
    _label,
    exactGuide
  ) => {
    const base = {
      guideSessionId: 'guide_session_1',
      routeBusinessId: 'business_1',
      recommendationBusinessId: 'business_1',
      activeBusinessId: 'business_1',
      guideEntityId: 'entity_a',
      routeEntityId: 'entity_a',
      ...exactGuide,
    };
    expect(validateGuideBinding(base)).toMatchObject({ ok: true });
    expect(
      validateGuideBinding({ ...base, routeEntityId: 'entity_b' })
    ).toEqual({ ok: false, reasonCode: 'ENTITY_MISMATCH' });
  });

  test.each([
    [{ routeEntityId: undefined }, 'MISSING_ENTITY'],
    [{ guideEntityId: undefined }, 'MISSING_ENTITY'],
    [{ routeEntityId: ' entity_a ' }, 'MISSING_ENTITY'],
    [{ guideEntityId: ' entity_a ' }, 'MISSING_ENTITY'],
    [{ routeEntityKind: 'campaign' }, 'ENTITY_MISMATCH'],
  ])('rejects malformed exact route binding %#', (patch, reasonCode) => {
    expect(
      validateGuideBinding({
        guideSessionId: 'guide_session_1',
        guideId: 'program-publish',
        stableId: 'program.publish_draft',
        routeBusinessId: 'business_1',
        recommendationBusinessId: 'business_1',
        activeBusinessId: 'business_1',
        currentRouteKey: 'program-detail',
        guideEntityId: 'entity_a',
        routeEntityId: 'entity_a',
        routeEntityKind: 'program',
        ...patch,
      })
    ).toEqual({ ok: false, reasonCode });
  });

  test('non-exact guides do not require route entity metadata', () => {
    expect(
      validateGuideBinding({
        guideSessionId: 'guide_session_1',
        guideId: 'campaign-create',
        stableId: 'campaign.create_first',
        routeBusinessId: 'business_1',
        recommendationBusinessId: 'business_1',
        activeBusinessId: 'business_1',
        currentRouteKey: 'campaigns',
      })
    ).toMatchObject({ ok: true });
  });

  test.each([
    ['loading status', { serverStatus: 'loading' }],
    ['offline or unavailable status', { serverStatus: 'unavailable' }],
    ['query error', { serverStatus: 'error' }],
    ['completed status', { serverStatus: 'completed' }],
    ['invalidated status', { serverStatus: 'invalidated' }],
    ['restricted status', { serverStatus: 'restricted' }],
    ['missing session', { guideSessionId: undefined }],
    ['business mismatch', { businessMatches: false }],
    ['business switching', { isSwitchingBusiness: true }],
    ['closed guide', { isClosed: true }],
    ['wrong route or entity', { routeAndEntityMatch: false }],
  ])('%s cannot activate a guided target', (_label, patch) => {
    expect(canActivateGuidedTarget({ ...activeTarget, ...patch })).toBe(false);
  });

  test('only an authoritative active server status activates a target', () => {
    expect(canActivateGuidedTarget(activeTarget)).toBe(true);
    expect(canActivateGuidedTarget()).toBe(false);
  });

  test('active to completed deactivates and clears target geometry once', () => {
    const orchestrator = createGuidedTargetActivationOrchestrator();
    let registrations = 0;
    let unregisters = 0;
    let geometryClears = 0;
    const effects = {
      activate: () => {
        registrations += 1;
        return () => {
          unregisters += 1;
        };
      },
      deactivate: () => {
        geometryClears += 1;
      },
    };

    expect(orchestrator.update(activeTarget, 'step-0', effects)).toBe(true);
    expect(
      orchestrator.update(
        { ...activeTarget, serverStatus: 'completed' },
        'step-0',
        effects
      )
    ).toBe(false);
    expect(orchestrator.isActive()).toBe(false);
    expect(registrations).toBe(1);
    expect(unregisters).toBe(1);
    expect(geometryClears).toBe(1);
  });

  test('active to business switch deactivates the current target', () => {
    const orchestrator = createGuidedTargetActivationOrchestrator();
    let deactivations = 0;
    const effects = {
      activate: () => undefined,
      deactivate: () => {
        deactivations += 1;
      },
    };

    orchestrator.update(activeTarget, 'step-0', effects);
    orchestrator.update(
      { ...activeTarget, isSwitchingBusiness: true },
      'step-0',
      effects
    );

    expect(orchestrator.isActive()).toBe(false);
    expect(deactivations).toBe(1);
  });

  test('server rejection triggers no target or started-guide side effects', () => {
    const orchestrator = createGuidedTargetActivationOrchestrator();
    const counts = {
      register: 0,
      measure: 0,
      scroll: 0,
      expand: 0,
      focus: 0,
      spotlight: 0,
      startedAnalytics: 0,
    };
    const effects = {
      activate: () => {
        counts.register += 1;
        counts.measure += 1;
        counts.scroll += 1;
        counts.expand += 1;
        counts.focus += 1;
        counts.spotlight += 1;
        counts.startedAnalytics += 1;
      },
    };

    for (const serverStatus of [
      'loading',
      'unavailable',
      'error',
      'completed',
      'invalidated',
      'restricted',
    ]) {
      orchestrator.update(
        { ...activeTarget, serverStatus },
        'step-0',
        effects
      );
    }

    expect(counts).toEqual({
      register: 0,
      measure: 0,
      scroll: 0,
      expand: 0,
      focus: 0,
      spotlight: 0,
      startedAnalytics: 0,
    });
  });

  test('active target side effects run at most once per guide step', () => {
    const orchestrator = createGuidedTargetActivationOrchestrator();
    let activations = 0;
    const effects = {
      activate: () => {
        activations += 1;
      },
    };

    orchestrator.update(activeTarget, 'step-0', effects);
    orchestrator.update(activeTarget, 'step-0', effects);
    expect(activations).toBe(1);

    orchestrator.update(activeTarget, 'step-1', effects);
    orchestrator.update(activeTarget, 'step-1', effects);
    expect(activations).toBe(2);
  });

  test('guide definitions stay concise and step counts are bounded', () => {
    for (const instruction of Object.values(GUIDE_INSTRUCTIONS)) {
      expect(instruction.length).toBeGreaterThan(5);
      expect(instruction.length).toBeLessThan(90);
    }
    expect(clampGuideSteps(12)).toBe(4);
    expect(clampGuideSteps(0)).toBe(1);
    expect(getGuidePulseIterations(true)).toBe(0);
    expect(getGuidePulseIterations(false)).toBe(2);
    expect(getGuideBottomInset(24, 300)).toBe(324);
  });
});
