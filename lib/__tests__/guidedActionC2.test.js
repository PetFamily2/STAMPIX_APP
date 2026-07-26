import { describe, expect, test } from 'bun:test';

import {
  buildBusinessMismatchCleanupKey,
  buildGuidedStatusQueriesRequest,
  buildGuidedStatusRetryIdentity,
  canActivateGuidedTarget,
  createBoundedKeySet,
  createBoundedRetryController,
  createGuidedActionRuntimeCoordinator,
  createGuidedActivationTransitionController,
  createGuidedFocusController,
  createGuidedMeasurementSequence,
  createObservableGuidedTargetRef,
  createGuidedStatusRetryController,
  createGuidedTargetPreparationController,
  decideGuidedRuntimeTransition,
  EMPTY_GUIDED_STATUS_QUERIES,
  extractBoundedGuidePublicErrorCode,
  getClearedGuideRouteParams,
  getGuideOverlayLayout,
  getGuidePulseIterations,
  getGuidedSpotlightGeometry,
  GUIDE_TARGET_IDS,
  hasGuideLikeRouteMetadata,
  isGuideRetryableState,
  isPermanentGuideQueryError,
  isSubscriptionRecoveryStatus,
  ORDINARY_DESTINATION_ROUTE_KEYS,
  REJECTED_GUIDE_CLEANUP_MESSAGE,
  resolveCampaignDetailGuideTarget,
  resolveExactMissingProfileGuideField,
  resolveGuidedActionStatus,
  resolveGuidedClientPresence,
  resolveProfileGuideField,
  resolveProfileGuideTarget,
  resolveSubscriptionGuideTarget,
  shouldAutoClearBusinessMismatchGuide,
  shouldClearRejectedGuideRouteParams,
  shouldRenderGuidedStatusPanel,
  shouldResetGuidedStatusRetryAfterSuccess,
} from '../recommendations/guidance';
import {
  getCitySelectionKey,
  resolveBusinessAddressGuideTarget,
} from '../businessAddressSelection';
import { getRecommendationNavigationTarget } from '../recommendations/navigation';

const EXPECTED_TARGETS = {
  'subscription-recover': 'subscription-recover-target',
  'address-resolve': 'address-resolve-target',
  'profile-complete': 'profile-complete-target',
  'program-create': 'program-create-target',
  'program-publish': 'program-publish-target',
  'campaign-create': 'campaign-create-target',
  'campaign-publish': 'campaign-publish-target',
  'campaign-resume': 'campaign-resume-target',
  'campaign-schedule-review': 'campaign-schedule-review-target',
  'inactive-review': 'inactive-review-target',
  'near-reward': 'near-reward-target',
  'team-pending': 'team-pending-target',
  'quota-review': 'quota-review-target',
};

const ACTIVE_TARGET = {
  bindingValid: true,
  guideSessionId: 'session-1',
  serverStatus: 'active',
  businessMatches: true,
  isSwitchingBusiness: false,
  isClosed: false,
  routeAndEntityMatch: true,
};

function addressState(patch = {}) {
  return {
    cityText: '',
    citySelection: null,
    streetText: '',
    streetSelection: null,
    houseNumber: '',
    resolvedAddress: null,
    candidates: [],
    status: 'idle',
    error: null,
    ...patch,
  };
}

function selectedAddress() {
  return {
    placeId: 'place-1',
    formattedAddress: 'הרצל 12, תל אביב',
    latitude: 32.08,
    longitude: 34.78,
    city: 'תל אביב',
    street: 'הרצל',
    streetNumber: '12',
  };
}

describe('D10.1C-C2.1 production target selection', () => {
  test('all 13 guides retain distinct explicit target IDs', () => {
    expect(GUIDE_TARGET_IDS).toEqual(EXPECTED_TARGETS);
    expect(new Set(Object.values(GUIDE_TARGET_IDS)).size).toBe(13);
  });

  test('subscription recovery selects direct restore only when interrupted', () => {
    expect(
      resolveSubscriptionGuideTarget({
        guideId: 'subscription-recover',
        subscriptionStatus: 'past_due',
      })
    ).toEqual({
      targetId: 'subscription-recover-target',
      action: 'restore_purchases',
    });
    expect(
      resolveSubscriptionGuideTarget({
        guideId: 'subscription-recover',
        subscriptionStatus: 'active',
      })
    ).toBeNull();
    expect(
      resolveSubscriptionGuideTarget({
        guideId: undefined,
        subscriptionStatus: 'past_due',
      })
    ).toBeNull();
    expect(isSubscriptionRecoveryStatus('active')).toBe(false);
    expect(
      resolveSubscriptionGuideTarget({
        guideId: 'subscription-recover',
        subscriptionStatus: 'past_due',
      })?.action
    ).not.toBe('openUpgrade');
  });

  test('quota review selects only the campaigns quota target', () => {
    expect(
      resolveSubscriptionGuideTarget({
        guideId: 'quota-review',
        subscriptionStatus: 'past_due',
        limitKey: 'campaigns',
      })
    ).toEqual({
      targetId: 'quota-review-target',
      action: 'review_campaigns_quota',
    });
    expect(
      resolveSubscriptionGuideTarget({
        guideId: 'quota-review',
        subscriptionStatus: 'past_due',
        limitKey: 'team',
      })
    ).toBeNull();
  });

  test('campaign detail production selection keeps all boundaries distinct', () => {
    expect(resolveCampaignDetailGuideTarget('campaign-publish')).toBe(
      'publish-action'
    );
    expect(resolveCampaignDetailGuideTarget('campaign-resume')).toBe(
      'resume-action'
    );
    expect(
      resolveCampaignDetailGuideTarget('campaign-schedule-review')
    ).toBe('schedule-summary');
    expect(resolveCampaignDetailGuideTarget('unknown')).toBeNull();
  });

  test('schedule review cannot select publish, resume, or delivery mode', () => {
    const target = resolveCampaignDetailGuideTarget(
      'campaign-schedule-review'
    );
    expect(target).toBe('schedule-summary');
    expect(target).not.toBe('publish-action');
    expect(target).not.toBe('resume-action');
    expect(target).not.toBe('delivery-mode');
    expect(target).not.toBe('send-now');
  });

  test('address target follows canonical resolution and terminates', () => {
    const city = { displayName: 'תל אביב', placeId: 'city-1' };
    const cityKey = getCitySelectionKey(city);
    const street = {
      displayName: 'הרצל',
      placeId: 'street-1',
      cityKey,
    };

    expect(resolveBusinessAddressGuideTarget(addressState())).toBe('city');
    expect(
      resolveBusinessAddressGuideTarget(
        addressState({ cityText: 'תל אביב', citySelection: city })
      )
    ).toBe('street');
    expect(
      resolveBusinessAddressGuideTarget(
        addressState({
          cityText: 'תל אביב',
          citySelection: city,
          streetText: 'הרצל',
          streetSelection: street,
        })
      )
    ).toBe('houseNumber');
    expect(
      resolveBusinessAddressGuideTarget(
        addressState({
          cityText: 'תל אביב',
          citySelection: city,
          streetText: 'הרצל',
          streetSelection: street,
          houseNumber: '12',
          status: 'resolved',
          resolvedAddress: selectedAddress(),
        })
      )
    ).toBeNull();
  });

  test('address confirmation is exact and valid house number never falls back', () => {
    const city = { displayName: 'תל אביב', placeId: 'city-1' };
    const street = {
      displayName: 'הרצל',
      placeId: 'street-1',
      cityKey: getCitySelectionKey(city),
    };
    const ready = addressState({
      cityText: 'תל אביב',
      citySelection: city,
      streetText: 'הרצל',
      streetSelection: street,
      houseNumber: '12',
    });

    expect(resolveBusinessAddressGuideTarget(ready)).toBeNull();
    expect(
      resolveBusinessAddressGuideTarget({
        ...ready,
        status: 'ambiguous',
        candidates: [selectedAddress()],
      })
    ).toBe('confirm');
  });

  test('profile uses canonical fieldId with no invalid or address fallback', () => {
    expect(resolveProfileGuideField('shortDescription')).toBe(
      'shortDescription'
    );
    expect(resolveProfileGuideField('arbitraryField')).toBeNull();
    expect(resolveProfileGuideField('address')).toBeNull();
    expect(
      resolveExactMissingProfileGuideField('businessPhone', [
        'address',
        'businessPhone',
        'serviceTypes',
      ])
    ).toBe('businessPhone');
    expect(
      resolveExactMissingProfileGuideField('serviceTypes', [
        'businessPhone',
        'serviceTypes',
      ])
    ).toBeNull();
  });

  test('profile navigation preserves only canonical fieldId', () => {
    const result = getRecommendationNavigationTarget({
      businessId: 'business-1',
      action: {
        type: 'open_business_profile',
        fieldId: 'businessPhone',
      },
      guideSessionId: 'session-1',
      guideId: 'profile-complete',
      stableId: 'setup.profile.complete',
      evidenceFingerprint: 'evidence-1',
    });

    expect(result.ok).toBe(true);
    expect(result.target.params.fieldId).toBe('businessPhone');
    expect(result.target.params.targetField).toBeUndefined();
  });
});

describe('D10.1C-C2.1 production activation and anchor lifecycle', () => {
  test('active identity A transitions atomically to active identity B', () => {
    const controller = createGuidedActivationTransitionController();
    const activations = [];
    const cleanups = [];
    let activeIdentity = null;

    const effects = (identity) => ({
      activate: (context) => {
        activeIdentity = identity;
        activations.push(identity);
        return () => {
          cleanups.push(identity);
          if (context.isCurrent()) {
            activeIdentity = null;
          }
        };
      },
      deactivate: () => {
        activeIdentity = null;
      },
    });

    controller.update(ACTIVE_TARGET, 'identity-a', effects('identity-a'));
    controller.update(ACTIVE_TARGET, 'identity-b', effects('identity-b'));

    expect(activations).toEqual(['identity-a', 'identity-b']);
    expect(cleanups).toEqual(['identity-a']);
    expect(activeIdentity).toBe('identity-b');
    expect(controller.isActive()).toBe(true);
  });

  test('late work from identity A cannot update identity B', () => {
    const controller = createGuidedActivationTransitionController();
    let oldContext;
    let newActivations = 0;
    let geometry = null;

    controller.update(ACTIVE_TARGET, 'identity-a', {
      activate: (context) => {
        oldContext = context;
      },
    });
    controller.update(ACTIVE_TARGET, 'identity-b', {
      activate: (context) => {
        newActivations += 1;
        if (context.isCurrent()) {
          geometry = 'geometry-b';
        }
      },
    });
    if (oldContext.isCurrent()) {
      geometry = 'late-geometry-a';
    }

    expect(oldContext.isCurrent()).toBe(false);
    expect(newActivations).toBe(1);
    expect(geometry).toBe('geometry-b');
  });

  test('active to inactive and business switch fully deactivate', () => {
    const controller = createGuidedActivationTransitionController();
    let cleanupCount = 0;
    let deactivateCount = 0;
    const effects = {
      activate: () => () => {
        cleanupCount += 1;
      },
      deactivate: () => {
        deactivateCount += 1;
      },
    };

    controller.update(ACTIVE_TARGET, 'identity-a', effects);
    controller.update(
      { ...ACTIVE_TARGET, serverStatus: 'completed' },
      'identity-a',
      effects
    );
    expect(cleanupCount).toBe(1);
    expect(deactivateCount).toBe(1);

    controller.update(ACTIVE_TARGET, 'identity-b', effects);
    controller.update(
      { ...ACTIVE_TARGET, isSwitchingBusiness: true },
      'identity-b',
      effects
    );
    expect(cleanupCount).toBe(2);
    expect(deactivateCount).toBe(2);
    expect(controller.isActive()).toBe(false);
  });

  test('observable production target handles mount, replacement, and unmount', () => {
    const target = createObservableGuidedTargetRef();
    const changes = [];
    const unsubscribe = target.subscribe((node) => changes.push(node));

    expect(target.current).toBeNull();
    target.current = 'node-a';
    const generationA = target.getGeneration();
    target.current = 'node-b';
    const generationB = target.getGeneration();
    target.current = null;
    unsubscribe();

    expect(changes).toEqual(['node-a', 'node-b', null]);
    expect(target.isCurrent('node-a', generationA)).toBe(false);
    expect(target.isCurrent('node-b', generationB)).toBe(false);
    expect(target.isCurrent(null, target.getGeneration())).toBe(true);
  });

  test('late measurement from a replaced observable target is rejected', () => {
    const target = createObservableGuidedTargetRef();
    target.current = 'node-a';
    const generationA = target.getGeneration();
    target.current = 'node-b';
    const generationB = target.getGeneration();
    let geometry = null;

    if (target.isCurrent('node-a', generationA)) {
      geometry = 'geometry-a';
    }
    if (target.isCurrent('node-b', generationB)) {
      geometry = 'geometry-b';
    }

    expect(geometry).toBe('geometry-b');
  });

  test('step or session identity replacement invalidates old generation', () => {
    const controller = createGuidedActivationTransitionController();
    let stepContext;
    let sessionContext;
    controller.update(ACTIVE_TARGET, 'session-a|step-0', {
      activate: (context) => {
        stepContext = context;
      },
    });
    controller.update(ACTIVE_TARGET, 'session-a|step-1', {
      activate: (context) => {
        sessionContext = context;
      },
    });
    expect(stepContext.isCurrent()).toBe(false);
    expect(sessionContext.isCurrent()).toBe(true);

    controller.update(ACTIVE_TARGET, 'session-b|step-0', {
      activate: () => undefined,
    });
    expect(sessionContext.isCurrent()).toBe(false);
  });
});

describe('D10.1C-C2.1 production measurement, focus, and retries', () => {
  test('scroll precedes final spotlight and focus after preparation', () => {
    const sequence = createGuidedMeasurementSequence({
      canScroll: true,
    });
    expect(
      sequence.next({ available: true, visible: false })
    ).toEqual(['scroll', 'retry']);
    expect(
      sequence.next({ available: true, visible: true })
    ).toEqual(['spotlight', 'focus']);
  });

  test('input focus occurs only after visibility and once per identity', () => {
    const sequence = createGuidedMeasurementSequence({ canScroll: true });
    const focusController = createGuidedFocusController();
    let focusCount = 0;
    const focus = () => {
      focusCount += 1;
    };

    expect(
      sequence.next({ available: true, visible: false })
    ).toEqual(['scroll', 'retry']);
    expect(focusCount).toBe(0);
    expect(
      sequence.next({ available: true, visible: true })
    ).toEqual(['spotlight', 'focus']);
    expect(focusController.focusOnce('session-a|step-0', focus)).toBe(true);
    expect(focusController.focusOnce('session-a|step-0', focus)).toBe(false);
    expect(focusCount).toBe(1);
  });

  test('keyboard remeasurement does not refocus and a new step may focus', () => {
    const focusController = createGuidedFocusController();
    let focusCount = 0;
    const focus = () => {
      focusCount += 1;
    };

    focusController.focusOnce('session-a|step-0', focus);
    focusController.focusOnce('session-a|step-0', focus);
    focusController.focusOnce('session-a|step-1', focus);
    expect(focusCount).toBe(2);
  });

  test('non-input target never focuses', () => {
    const focusController = createGuidedFocusController();
    expect(focusController.focusOnce('non-input', null)).toBe(false);
    expect(focusController.getFocusedIdentity()).toBeNull();
  });

  test('measurement retries stay bounded and cancel queued work', () => {
    const queue = [];
    const attempts = [];
    const controller = createBoundedRetryController({
      maxAttempts: 4,
      schedule: (callback) => {
        queue.push(callback);
        return callback;
      },
      cancel: () => undefined,
      delayMs: 0,
    });
    controller.start((attempt, retry) => {
      attempts.push(attempt);
      retry();
    });
    controller.stop();
    while (queue.length > 0) {
      queue.shift()();
    }

    expect(attempts).toEqual([1]);
    expect(controller.getMaxAttempts()).toBe(4);
  });
});

describe('D10.1C-C2.2 preparation and status retry controllers', () => {
  test('pre-anchor preparation runs once per identity and rejects stale work', () => {
    const controller = createGuidedTargetPreparationController();
    const first = controller.begin('session-a|step-0');

    expect(first).not.toBeNull();
    expect(controller.begin('session-a|step-0')).toBeNull();
    expect(controller.isPrepared('session-a|step-0')).toBe(true);

    const replacement = controller.begin('session-b|step-0');
    expect(first.isCurrent()).toBe(false);
    expect(replacement.isCurrent()).toBe(true);

    controller.cancel();
    expect(replacement.isCurrent()).toBe(false);
    expect(controller.isPrepared('session-b|step-0')).toBe(false);
  });

  test('explicit preparation retry invalidates the previous generation', () => {
    const controller = createGuidedTargetPreparationController();
    const first = controller.begin('session-a|step-0');
    const retry = controller.begin('session-a|step-0', true);

    expect(first.isCurrent()).toBe(false);
    expect(retry.isCurrent()).toBe(true);
  });

  test('manual status retry allows one request and exhausts after three failures', () => {
    const controller = createGuidedStatusRetryController(3);
    const identity = 'business-a|session-a|route-a';

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const token = controller.begin(identity);
      expect(token.attempt).toBe(attempt);
      expect(controller.begin(identity)).toBeNull();
      expect(controller.settle(token)).toBe(true);
    }

    expect(controller.getState()).toMatchObject({
      attempts: 3,
      inFlight: false,
      exhausted: true,
      maxAttempts: 3,
    });
    expect(controller.begin(identity)).toBeNull();
  });

  test('status retry success resets budget and identity change rejects stale result', () => {
    const controller = createGuidedStatusRetryController(3);
    const first = controller.begin('session-a');
    controller.reset('session-b');

    expect(controller.settle(first, true)).toBe(false);
    const second = controller.begin('session-b');
    expect(controller.settle(second, true)).toBe(true);
    expect(controller.getState()).toMatchObject({
      attempts: 0,
      inFlight: false,
      exhausted: false,
    });
  });
});

describe('D10.1C-C2.1 status and retry semantics', () => {
  test('missing fingerprint or binding is permanently rejected', () => {
    expect(
      resolveGuidedActionStatus({
        bindingValid: true,
        requiredMetadataValid: false,
        connected: true,
        queryResult: undefined,
      })
    ).toBe('rejected');
    expect(
      resolveGuidedActionStatus({
        bindingValid: false,
        requiredMetadataValid: true,
        connected: true,
        queryResult: undefined,
      })
    ).toBe('rejected');
  });

  test('loading, real query error, and offline remain distinct', () => {
    expect(
      resolveGuidedActionStatus({
        bindingValid: true,
        requiredMetadataValid: true,
        connected: true,
        queryResult: undefined,
      })
    ).toBe('loading');
    expect(
      resolveGuidedActionStatus({
        bindingValid: true,
        requiredMetadataValid: true,
        connected: true,
        queryResult: new Error('temporary'),
      })
    ).toBe('error');
    expect(
      resolveGuidedActionStatus({
        bindingValid: true,
        requiredMetadataValid: true,
        connected: false,
        queryResult: undefined,
      })
    ).toBe('unavailable');
    expect(
      resolveGuidedActionStatus({
        bindingValid: true,
        requiredMetadataValid: true,
        connected: true,
        queryResult: { state: 'active' },
      })
    ).toBe('active');
  });

  test('expired or permanently rejected server session cannot retry', () => {
    const rejectedError = Object.assign(new Error('rejected'), {
      data: { code: 'RECOMMENDATION_NOT_ACTIONABLE' },
    });
    const status = resolveGuidedActionStatus({
      bindingValid: true,
      requiredMetadataValid: true,
      connected: true,
      queryResult: rejectedError,
    });
    expect(status).toBe('rejected');
    expect(isGuideRetryableState({ status })).toBe(false);
  });

  test('permanent public rejection nested in a safe cause is non-retryable', () => {
    const rejectedError = Object.assign(new Error('bounded rejection'), {
      cause: {
        data: { code: 'RECOMMENDATION_NOT_ACTIONABLE' },
      },
    });
    const status = resolveGuidedActionStatus({
      bindingValid: true,
      requiredMetadataValid: true,
      connected: true,
      queryResult: rejectedError,
    });

    expect(status).toBe('rejected');
    expect(isGuideRetryableState({ status })).toBe(false);
  });

  test('exhausted status retry budget hides retry', () => {
    expect(
      isGuideRetryableState({
        status: 'error',
        retryExhausted: true,
      })
    ).toBe(false);
  });

  test.each([
    ['unavailable', false, true],
    ['error', false, true],
    ['active', true, true],
    ['rejected', true, false],
    ['completed', true, false],
    ['invalidated', true, false],
    ['restricted', true, false],
  ])(
    'retry visibility for %s with targetUnavailable=%s is %s',
    (status, targetUnavailable, expected) => {
      expect(
        isGuideRetryableState({ status, targetUnavailable })
      ).toBe(expected);
    }
  );
});

describe('D10.1C-C2.1 geometry, height, cleanup, and mounted state', () => {
  test('window coordinates and one overlay-origin subtraction are exact', () => {
    expect(
      getGuidedSpotlightGeometry(
        { x: 112, y: 220, width: 80, height: 40 },
        {
          width: 400,
          height: 800,
          overlayX: 12,
          overlayY: 20,
        },
        0
      )
    ).toEqual({ left: 100, top: 200, width: 80, height: 40 });
  });

  test('visual padding has no old 12-point container offset', () => {
    expect(
      getGuidedSpotlightGeometry(
        { x: 100, y: 200, width: 80, height: 40 },
        { width: 400, height: 800 },
        6
      )
    ).toEqual({ left: 94, top: 194, width: 92, height: 52 });
  });

  test.each([
    [500, 420],
    [120, 120],
    [80, 80],
    [1, 1],
    [0, 0],
  ])('usable height %i produces bounded maxHeight %i', (usable, expected) => {
    const layout = getGuideOverlayLayout({
      width: 390,
      height: usable + 24,
    });
    expect(layout.maxHeight).toBe(expected);
    expect(layout.maxHeight).toBeGreaterThanOrEqual(0);
    expect(layout.maxHeight).toBeLessThanOrEqual(usable);
  });

  test('keyboard consuming most of viewport never forces excess height', () => {
    const layout = getGuideOverlayLayout({
      width: 390,
      height: 300,
      keyboardHeight: 250,
    });
    expect(layout.maxHeight).toBe(26);
    expect(layout.bottom).toBe(262);
  });

  test('route cleanup removes guide identity without navigation history', () => {
    expect(getClearedGuideRouteParams()).toEqual({
      guideSessionId: undefined,
      guideId: undefined,
      stableId: undefined,
      evidenceFingerprint: undefined,
      recommendationBusinessId: undefined,
      entityId: undefined,
      fieldId: undefined,
      limitKey: undefined,
    });
  });

  test('mounted deduplication remains bounded and deterministic', () => {
    const keys = createBoundedKeySet(32);
    for (let index = 0; index < 80; index += 1) {
      keys.add(`session-${index}`);
    }
    expect(keys.size()).toBe(32);
    expect(keys.has('session-0')).toBe(false);
    expect(keys.has('session-79')).toBe(true);
  });

  test('reduced motion disables the bounded two-pulse animation', () => {
    expect(getGuidePulseIterations(true)).toBe(0);
    expect(getGuidePulseIterations(false)).toBe(2);
  });
});

describe('D10.1C-C2.3 bounded permanent authorization classification', () => {
  test('exact allowlisted public codes resolve to rejected', () => {
    expect(extractBoundedGuidePublicErrorCode(new Error('NOT_AUTHORIZED'))).toBe(
      'NOT_AUTHORIZED'
    );
    expect(
      extractBoundedGuidePublicErrorCode(new Error('NOT_AUTHENTICATED'))
    ).toBe('NOT_AUTHENTICATED');
    expect(
      extractBoundedGuidePublicErrorCode(
        new Error('Uncaught Error: NOT_AUTHORIZED')
      )
    ).toBe('NOT_AUTHORIZED');
    expect(
      extractBoundedGuidePublicErrorCode({
        message: 'wrapped',
        cause: { message: 'NOT_AUTHENTICATED' },
      })
    ).toBe('NOT_AUTHENTICATED');
    expect(
      extractBoundedGuidePublicErrorCode(
        Object.assign(new Error('bounded'), {
          data: { code: 'RECOMMENDATION_NOT_ACTIONABLE' },
        })
      )
    ).toBe('RECOMMENDATION_NOT_ACTIONABLE');
    expect(
      resolveGuidedActionStatus({
        bindingValid: true,
        requiredMetadataValid: true,
        connected: true,
        queryResult: new Error('NOT_AUTHORIZED'),
      })
    ).toBe('rejected');
    expect(isPermanentGuideQueryError(new Error('NOT_AUTHORIZED'))).toBe(true);
  });

  test('non-allowlisted wording and transport failures stay retryable', () => {
    expect(extractBoundedGuidePublicErrorCode(new Error('unauthorized'))).toBeNull();
    expect(extractBoundedGuidePublicErrorCode(new Error('forbidden'))).toBeNull();
    expect(extractBoundedGuidePublicErrorCode(new Error('session expired'))).toBeNull();
    expect(
      resolveGuidedActionStatus({
        bindingValid: true,
        requiredMetadataValid: true,
        connected: true,
        queryResult: new Error('network timeout'),
      })
    ).toBe('error');
    expect(
      resolveGuidedActionStatus({
        bindingValid: true,
        requiredMetadataValid: true,
        connected: false,
        queryResult: undefined,
      })
    ).toBe('unavailable');
    expect(
      isGuideRetryableState({
        status: resolveGuidedActionStatus({
          bindingValid: true,
          requiredMetadataValid: true,
          connected: true,
          queryResult: new Error('NOT_AUTHORIZED'),
        }),
      })
    ).toBe(false);
  });
});

describe('D10.1C-C2.3 rejected cleanup visibility vs activation', () => {
  test('status panel modes distinguish activation and cleanup', () => {
    expect(
      shouldRenderGuidedStatusPanel({
        hasGuideMetadata: false,
        isBindingValid: false,
        canActivateTarget: false,
        status: 'rejected',
      })
    ).toBe('none');
    expect(
      shouldRenderGuidedStatusPanel({
        hasGuideMetadata: true,
        isBindingValid: true,
        canActivateTarget: true,
        status: 'active',
      })
    ).toBe('guided');
    expect(
      shouldRenderGuidedStatusPanel({
        hasGuideMetadata: true,
        isBindingValid: false,
        canActivateTarget: false,
        status: 'rejected',
      })
    ).toBe('rejected_cleanup');
    expect(
      shouldRenderGuidedStatusPanel({
        hasGuideMetadata: true,
        isBindingValid: true,
        canActivateTarget: false,
        status: 'restricted',
      })
    ).toBe('lifecycle');
    expect(
      shouldRenderGuidedStatusPanel({
        hasGuideMetadata: true,
        isBindingValid: true,
        canActivateTarget: false,
        status: 'loading',
      })
    ).toBe('none');
    expect(
      hasGuideLikeRouteMetadata({
        guideId: 'team-pending',
        guideSessionId: undefined,
      })
    ).toBe(true);
    expect(hasGuideLikeRouteMetadata({})).toBe(false);
    expect(REJECTED_GUIDE_CLEANUP_MESSAGE).toBe('ההדרכה הזו אינה זמינה יותר');
  });

  test('rejected local bindings never activate targets', () => {
    expect(
      canActivateGuidedTarget({
        bindingValid: false,
        guideSessionId: 'session-1',
        serverStatus: 'rejected',
        businessMatches: true,
        isSwitchingBusiness: false,
        isClosed: false,
        routeAndEntityMatch: false,
      })
    ).toBe(false);
    expect(
      shouldRenderGuidedStatusPanel({
        hasGuideMetadata: true,
        isBindingValid: false,
        canActivateTarget: false,
        status: 'rejected',
      })
    ).toBe('rejected_cleanup');
  });

  test('rejected Close clears only guide route params', () => {
    const cleared = getClearedGuideRouteParams();
    expect(cleared).toEqual({
      guideSessionId: undefined,
      guideId: undefined,
      stableId: undefined,
      evidenceFingerprint: undefined,
      recommendationBusinessId: undefined,
      entityId: undefined,
      fieldId: undefined,
      limitKey: undefined,
    });
    expect(cleared.filter).toBeUndefined();
    expect(cleared.section).toBeUndefined();
    expect(cleared.businessId).toBeUndefined();
  });
});

describe('D10.1C-C2.3 step-aware status-retry identity', () => {
  test('step change produces a distinct retry identity', () => {
    const step0 = buildGuidedStatusRetryIdentity({
      businessId: 'business-1',
      guideSessionId: 'session-1',
      stableId: 'team.pending_invitations',
      guideId: 'team-pending',
      routeKey: 'team',
      stepIndex: 0,
    });
    const step1 = buildGuidedStatusRetryIdentity({
      businessId: 'business-1',
      guideSessionId: 'session-1',
      stableId: 'team.pending_invitations',
      guideId: 'team-pending',
      routeKey: 'team',
      stepIndex: 1,
    });
    expect(step0).not.toBe(step1);
    expect(step0.endsWith('|0')).toBe(true);
    expect(step1.endsWith('|1')).toBe(true);
  });
});

describe('D10.1C-C2.3 production coordinator team preparation', () => {
  const activeActivation = {
    bindingValid: true,
    guideSessionId: 'session-1',
    serverStatus: 'active',
    businessMatches: true,
    isSwitchingBusiness: false,
    isClosed: false,
    routeAndEntityMatch: true,
  };

  test('prepare runs before registration and spotlight follows final geometry', async () => {
    const events = [];
    const target = createObservableGuidedTargetRef();
    const coordinator = createGuidedActionRuntimeCoordinator({
      maxMeasurementAttempts: 4,
      schedule: (callback) => {
        callback();
        return 0;
      },
      cancel: () => undefined,
      delayMs: 0,
    });
    let sectionExpanded = false;

    const pipeline = await coordinator.runAuthoritativeTargetPipeline({
      activation: activeActivation,
      identity: 'business-1|session-1|team-pending|team||0',
      sectionExpanded,
      prepareTarget: () => {
        events.push('prepare');
        sectionExpanded = true;
      },
      getCurrent: () => target.current,
      subscribe: (listener) => target.subscribe(listener),
      register: (node) => {
        events.push(['register', node]);
        return () => events.push('unregister');
      },
      measure: (node) => {
        events.push(['measure', node]);
        if (events.filter((item) => Array.isArray(item) && item[0] === 'measure').length === 1) {
          return { available: true, visible: false, rect: { x: 0, y: 0, width: 10, height: 10 } };
        }
        return {
          available: true,
          visible: true,
          rect: { x: 12, y: 40, width: 80, height: 36 },
        };
      },
      scroll: () => events.push('scroll'),
      focus: () => events.push('focus'),
      onSpotlight: (rect) => events.push(['spotlight', rect]),
      trackStarted: () => events.push('started'),
    });

    expect(events[0]).toBe('prepare');
    expect(target.current).toBeNull();
    target.current = 'pending-target';
    for (let flush = 0; flush < 6; flush += 1) {
      await Promise.resolve();
    }

    expect(pipeline.ok).toBe(true);
    expect(events).toContain('prepare');
    expect(events.some((item) => Array.isArray(item) && item[0] === 'register')).toBe(true);
    expect(events.indexOf('prepare')).toBeLessThan(
      events.findIndex((item) => Array.isArray(item) && item[0] === 'register')
    );
    expect(events).toContain('scroll');
    expect(events.some((item) => Array.isArray(item) && item[0] === 'spotlight')).toBe(true);
    expect(events).toContain('focus');
    expect(sectionExpanded).toBe(true);
  });

  test('adversarial states never prepare or spotlight', async () => {
    for (const status of ['loading', 'rejected', 'restricted']) {
      const events = [];
      const coordinator = createGuidedActionRuntimeCoordinator();
      const result = await coordinator.runAuthoritativeTargetPipeline({
        activation: { ...activeActivation, serverStatus: status },
        identity: `id-${status}`,
        prepareTarget: () => events.push('prepare'),
        getCurrent: () => 'node',
        subscribe: () => () => undefined,
        register: () => {
          events.push('register');
        },
        measure: () => ({
          available: true,
          visible: true,
          rect: { x: 0, y: 0, width: 1, height: 1 },
        }),
        onSpotlight: () => events.push('spotlight'),
      });
      expect(result.ok).toBe(false);
      expect(events).toEqual([]);
    }

    const closed = createGuidedActionRuntimeCoordinator();
    const closedEvents = [];
    await closed.runAuthoritativeTargetPipeline({
      activation: { ...activeActivation, isClosed: true },
      identity: 'closed',
      prepareTarget: () => closedEvents.push('prepare'),
      getCurrent: () => null,
      subscribe: () => () => undefined,
      register: () => undefined,
      measure: () => null,
    });
    expect(closedEvents).toEqual([]);

    const switching = createGuidedActionRuntimeCoordinator();
    const switchingEvents = [];
    await switching.runAuthoritativeTargetPipeline({
      activation: { ...activeActivation, isSwitchingBusiness: true },
      identity: 'switching',
      prepareTarget: () => switchingEvents.push('prepare'),
      getCurrent: () => null,
      subscribe: () => () => undefined,
      register: () => undefined,
      measure: () => null,
    });
    expect(switchingEvents).toEqual([]);
  });

  test('preparation is once per identity and ignores stale layout after change', async () => {
    const coordinator = createGuidedActionRuntimeCoordinator({
      schedule: (callback) => {
        callback();
        return 0;
      },
      cancel: () => undefined,
      delayMs: 0,
    });
    let prepareCount = 0;
    const target = createObservableGuidedTargetRef();
    await coordinator.runAuthoritativeTargetPipeline({
      activation: activeActivation,
      identity: 'identity-a',
      prepareTarget: () => {
        prepareCount += 1;
      },
      getCurrent: () => target.current,
      subscribe: (listener) => target.subscribe(listener),
      register: () => () => undefined,
      measure: () => ({
        available: true,
        visible: true,
        rect: { x: 1, y: 1, width: 2, height: 2 },
      }),
    });
    expect(prepareCount).toBe(1);
    expect(
      coordinator.prepareTarget({
        activation: activeActivation,
        identity: 'identity-a',
        prepareTarget: () => {
          prepareCount += 1;
        },
      }).ran
    ).toBe(false);

    const spotlights = [];
    coordinator.setIdentity('identity-b');
    target.current = 'late-a';
    await coordinator.runAuthoritativeTargetPipeline({
      activation: activeActivation,
      identity: 'identity-b',
      prepareTarget: () => {
        prepareCount += 1;
      },
      getCurrent: () => target.current,
      subscribe: (listener) => target.subscribe(listener),
      register: () => () => undefined,
      measure: () => ({
        available: true,
        visible: true,
        rect: { x: 3, y: 3, width: 4, height: 4 },
      }),
      onSpotlight: (rect) => spotlights.push(rect),
    });
    expect(prepareCount).toBe(2);
    expect(spotlights).toEqual([{ x: 3, y: 3, width: 4, height: 4 }]);
  });

  test('already expanded section does not expand again and analytics failure is non-blocking', async () => {
    const coordinator = createGuidedActionRuntimeCoordinator({
      schedule: (callback) => {
        callback();
        return 0;
      },
      cancel: () => undefined,
      delayMs: 0,
    });
    let prepareCount = 0;
    const target = createObservableGuidedTargetRef();
    target.current = 'ready-target';
    const result = await coordinator.runAuthoritativeTargetPipeline({
      activation: activeActivation,
      identity: 'expanded',
      sectionExpanded: true,
      prepareTarget: () => {
        prepareCount += 1;
      },
      getCurrent: () => target.current,
      subscribe: (listener) => target.subscribe(listener),
      register: () => () => undefined,
      measure: () => ({
        available: true,
        visible: true,
        rect: { x: 0, y: 0, width: 8, height: 8 },
      }),
      trackStarted: () => {
        throw new Error('analytics-down');
      },
      onSpotlight: () => undefined,
    });
    expect(prepareCount).toBe(0);
    expect(result.ok).toBe(true);
  });

  test('target never mounting exhausts measurement without fallback spotlight', async () => {
    const coordinator = createGuidedActionRuntimeCoordinator({
      maxMeasurementAttempts: 2,
      schedule: (callback) => {
        callback();
        return 0;
      },
      cancel: () => undefined,
      delayMs: 0,
    });
    const events = [];
    await coordinator.runAuthoritativeTargetPipeline({
      activation: activeActivation,
      identity: 'missing-target',
      prepareTarget: () => events.push('prepare'),
      getCurrent: () => null,
      subscribe: () => () => undefined,
      register: () => {
        events.push('register');
      },
      measure: () => {
        events.push('measure');
        return { available: false };
      },
      onSpotlight: () => events.push('spotlight'),
      onUnavailable: () => events.push('unavailable'),
    });
    expect(events).toEqual(['prepare']);
    expect(events).not.toContain('register');
    expect(events).not.toContain('spotlight');
  });
});

describe('D10.1C-C2.3 production fresh-query retry integration', () => {
  test('fresh query preserves bindings and enforces retry budget', async () => {
    const calls = [];
    const startGuideCalls = [];
    const coordinator = createGuidedActionRuntimeCoordinator({ maxStatusRetries: 3 });
    const identity = buildGuidedStatusRetryIdentity({
      businessId: 'business-1',
      guideSessionId: 'session-1',
      stableId: 'team.pending_invitations',
      guideId: 'team-pending',
      routeKey: 'team',
      stepIndex: 0,
    });
    const args = {
      guideSessionId: 'session-1',
      businessId: 'business-1',
      stableId: 'team.pending_invitations',
      guideId: 'team-pending',
      evidenceFingerprint: 'evidence-1',
    };
    coordinator.setIdentity(identity);

    const first = coordinator.retryFreshStatus({
      identity,
      status: 'error',
      connected: true,
      args,
      query: async (queryArgs) => {
        calls.push(queryArgs);
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('temporary');
      },
    });
    const second = await coordinator.retryFreshStatus({
      identity,
      status: 'error',
      connected: true,
      args,
      query: async (queryArgs) => {
        calls.push(queryArgs);
        return { state: 'active' };
      },
    });
    expect(second.reason).toBe('in_flight');
    expect(await first).toMatchObject({ ok: false, reason: 'retryable' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(args);
    expect(startGuideCalls).toHaveLength(0);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const outcome = await coordinator.retryFreshStatus({
        identity,
        status: 'error',
        connected: true,
        args,
        query: async () => {
          calls.push(args);
          throw new Error('temporary');
        },
      });
      expect(outcome.reason).toBe('retryable');
    }
    expect(coordinator.getStatusRetryState().exhausted).toBe(true);
    const fourth = await coordinator.retryFreshStatus({
      identity,
      status: 'error',
      connected: true,
      args,
      query: async () => {
        calls.push(args);
        return { state: 'active' };
      },
    });
    expect(fourth.reason).toBe('exhausted');
    expect(calls).toHaveLength(3);
  });

  test('success resets budget; permanent rejection and identity/step stale results are ignored', async () => {
    const coordinator = createGuidedActionRuntimeCoordinator({ maxStatusRetries: 3 });
    const identity = buildGuidedStatusRetryIdentity({
      businessId: 'business-1',
      guideSessionId: 'session-1',
      stableId: 'team.pending_invitations',
      guideId: 'team-pending',
      routeKey: 'team',
      stepIndex: 0,
    });
    const nextStep = buildGuidedStatusRetryIdentity({
      businessId: 'business-1',
      guideSessionId: 'session-1',
      stableId: 'team.pending_invitations',
      guideId: 'team-pending',
      routeKey: 'team',
      stepIndex: 1,
    });
    const args = {
      guideSessionId: 'session-1',
      businessId: 'business-1',
      stableId: 'team.pending_invitations',
      guideId: 'team-pending',
      evidenceFingerprint: 'evidence-1',
    };

    const success = await coordinator.retryFreshStatus({
      identity,
      status: 'error',
      connected: true,
      args,
      query: async () => ({ state: 'active', reasonCode: 'OK' }),
      trackAnalytics: () => {
        throw new Error('analytics-down');
      },
    });
    expect(success.ok).toBe(true);
    expect(coordinator.getStatusRetryState().attempts).toBe(0);

    const rejected = await coordinator.retryFreshStatus({
      identity,
      status: 'error',
      connected: true,
      args,
      query: async () => {
        throw new Error('NOT_AUTHORIZED');
      },
    });
    expect(rejected.reason).toBe('rejected');
    const afterRejected = await coordinator.retryFreshStatus({
      identity,
      status: 'rejected',
      connected: true,
      args,
      query: async () => ({ state: 'active' }),
    });
    expect(afterRejected.reason).toBe('rejected');

    coordinator.resetStatusRetry(identity);
    coordinator.setIdentity(identity);
    let resolveQuery;
    const pending = coordinator.retryFreshStatus({
      identity,
      status: 'error',
      connected: true,
      args,
      query: () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    });
    coordinator.setIdentity(nextStep);
    resolveQuery({ state: 'active' });
    expect(await pending).toMatchObject({ ok: false, reason: 'stale' });
  });

  test('unmount/dispose ignores late completion', async () => {
    const coordinator = createGuidedActionRuntimeCoordinator({ maxStatusRetries: 3 });
    const identity = 'business-1|session-1|stable|guide|team||0';
    let resolveQuery;
    const pending = coordinator.retryFreshStatus({
      identity,
      status: 'error',
      connected: true,
      args: { guideSessionId: 'session-1', businessId: 'business-1' },
      query: () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    });
    coordinator.dispose();
    resolveQuery({ state: 'active' });
    expect(await pending).toMatchObject({ ok: false, reason: 'stale' });
  });
});

describe('D10.1C-C2.3 complete profile parity', () => {
  test('first non-address field parity and focus callback retention', () => {
    const focus = () => undefined;
    expect(
      resolveProfileGuideTarget({
        requestedFieldId: 'businessPhone',
        missingFields: ['address', 'businessPhone'],
        focus,
      })
    ).toEqual({ fieldId: 'businessPhone', focus });
    expect(
      resolveProfileGuideTarget({
        requestedFieldId: 'address',
        missingFields: ['address', 'businessPhone'],
        focus,
      })
    ).toBeNull();
    expect(
      resolveProfileGuideTarget({
        requestedFieldId: 'serviceTypes',
        missingFields: ['address', 'businessPhone', 'serviceTypes'],
        focus,
      })
    ).toBeNull();
    expect(
      resolveProfileGuideTarget({
        requestedFieldId: 'businessPhone',
        missingFields: ['address'],
        focus,
      })
    ).toBeNull();
    expect(
      resolveProfileGuideTarget({
        requestedFieldId: 'businessPhone',
        missingFields: [],
        focus,
      })
    ).toBeNull();
    expect(
      resolveProfileGuideTarget({
        requestedFieldId: undefined,
        missingFields: ['businessPhone'],
        focus,
      })
    ).toBeNull();
    expect(
      resolveProfileGuideTarget({
        requestedFieldId: 'not-a-field',
        missingFields: ['businessPhone'],
        focus,
      })
    ).toBeNull();
    expect(
      resolveProfileGuideTarget({
        requestedFieldId: 'businessPhone',
        missingFields: ['shortDescription', 'businessPhone'],
        focus,
      })
    ).toBeNull();
    expect(
      resolveProfileGuideTarget({
        requestedFieldId: 'shortDescription',
        missingFields: ['shortDescription', 'businessPhone'],
        focus,
      })
    ).toEqual({ fieldId: 'shortDescription', focus });
    expect(
      resolveProfileGuideTarget({
        requestedFieldId: 'businessPhone',
        missingFields: ['address', 'address', 'businessPhone'],
        focus,
      })
    ).toEqual({ fieldId: 'businessPhone', focus });
    expect(
      resolveProfileGuideTarget({
        requestedFieldId: 'serviceTypes',
        missingFields: ['???', 'serviceTypes'],
        focus,
      })
    ).toEqual({ fieldId: 'serviceTypes', focus: null });
    expect(
      resolveExactMissingProfileGuideField('businessPhone', [
        'address',
        'businessPhone',
      ])
    ).toBe('businessPhone');
  });
});

describe('D10.1C-C2.3 rejected-cleanup decision coverage', () => {
  test('guide metadata rejection cases expose cleanup without retry activation', () => {
    const cases = [
      { guideId: 'not-a-guide', stableId: 'team.pending_invitations' },
      { guideId: 'team-pending', stableId: 'not.a.stable' },
      { guideId: 'team-pending', stableId: 'team.pending_invitations' },
      {
        guideId: 'team-pending',
        stableId: 'team.pending_invitations',
        guideSessionId: 'session-1',
      },
    ];
    for (const metadata of cases) {
      expect(hasGuideLikeRouteMetadata(metadata)).toBe(true);
      expect(
        shouldRenderGuidedStatusPanel({
          hasGuideMetadata: true,
          isBindingValid: false,
          canActivateTarget: false,
          status: 'rejected',
        })
      ).toBe('rejected_cleanup');
    }
    expect(
      shouldRenderGuidedStatusPanel({
        hasGuideMetadata: true,
        isBindingValid: false,
        canActivateTarget: false,
        status: 'rejected',
      })
    ).toBe('rejected_cleanup');
    expect(
      isGuideRetryableState({
        status: 'rejected',
        targetUnavailable: true,
      })
    ).toBe(false);
    expect(
      canActivateGuidedTarget({
        bindingValid: false,
        guideSessionId: 'session-1',
        serverStatus: 'rejected',
        businessMatches: true,
        isSwitchingBusiness: false,
        isClosed: false,
        routeAndEntityMatch: true,
      })
    ).toBe(false);
  });
});

describe('D10.1C infinite-render regression guards', () => {
  const ORDINARY_ROUTE_BINDINGS = [
    { routeKey: 'business-profile', businessId: 'biz-1', fieldId: 'name' },
    { routeKey: 'business-address', businessId: 'biz-1' },
    {
      routeKey: 'business-subscription',
      businessId: 'biz-1',
      limitKey: 'campaigns',
    },
    { routeKey: 'programs', businessId: 'biz-1' },
    {
      routeKey: 'program-detail',
      businessId: 'biz-1',
      programId: 'program-1',
      entityId: 'program-1',
    },
    { routeKey: 'campaigns', businessId: 'biz-1' },
    {
      routeKey: 'campaign-detail',
      businessId: 'biz-1',
      campaignId: 'campaign-1',
      entityId: 'campaign-1',
    },
    {
      routeKey: 'customers',
      businessId: 'biz-1',
      filter: 'at_risk',
    },
    {
      routeKey: 'team',
      businessId: 'biz-1',
      section: 'pending',
    },
  ];

  test('ordinary non-guided binding produces an inert stable state', () => {
    const presence = resolveGuidedClientPresence({
      businessId: 'biz-1',
      entityId: 'entity-1',
      filter: 'near_reward',
      section: 'pending',
      fieldId: 'name',
      limitKey: 'campaigns',
      programId: 'program-1',
      campaignId: 'campaign-1',
    });
    expect(presence).toEqual({ hasGuideMetadata: false, isInert: true });
    expect(
      shouldRenderGuidedStatusPanel({
        hasGuideMetadata: presence.hasGuideMetadata,
        isBindingValid: false,
        canActivateTarget: false,
        status: 'rejected',
      })
    ).toBe('none');
  });

  test('normal destination params alone do not count as guide metadata', () => {
    for (const key of ORDINARY_DESTINATION_ROUTE_KEYS) {
      expect(
        hasGuideLikeRouteMetadata({
          [key]: 'value',
        })
      ).toBe(false);
    }
    expect(
      hasGuideLikeRouteMetadata({
        businessId: 'biz-1',
        programId: 'program-1',
        campaignId: 'campaign-1',
        entityId: 'entity-1',
        filter: 'at_risk',
        section: 'pending',
        fieldId: 'name',
        limitKey: 'campaigns',
      })
    ).toBe(false);
  });

  test('repeated evaluation of the same inert state performs no state transition', () => {
    const first = decideGuidedRuntimeTransition({
      isInert: true,
      canActivate: false,
      activationIdentity: 'none',
      activeIdentity: null,
    });
    const second = decideGuidedRuntimeTransition({
      isInert: true,
      canActivate: false,
      activationIdentity: 'none',
      activeIdentity: null,
    });
    expect(first).toEqual({ kind: 'deactivation', mutated: false });
    expect(second).toEqual(first);
  });

  test('stable coordinator instance across ordinary rerenders', () => {
    const coordinator = createGuidedActionRuntimeCoordinator();
    const identityA = coordinator.getIdentity();
    coordinator.setIdentity(null);
    expect(coordinator.setIdentity(null)).toBe(false);
    expect(coordinator.getIdentity()).toBe(identityA);
    const generation = coordinator.getActivationGeneration();
    expect(
      coordinator.bindObservableTarget({
        activation: {
          bindingValid: false,
          guideSessionId: 'session',
          serverStatus: 'rejected',
          businessMatches: false,
          isSwitchingBusiness: false,
          isClosed: false,
          routeAndEntityMatch: false,
        },
        identity: 'inert',
        getCurrent: () => null,
        subscribe: () => () => undefined,
        register: () => undefined,
      })
    ).toBe(false);
    expect(coordinator.getActivationGeneration()).toBe(generation);
    expect(coordinator.isActivationActive()).toBe(false);
  });

  test('same activation identity is a no-op', () => {
    const controller = createGuidedActivationTransitionController();
    let activateCount = 0;
    const activation = { ...ACTIVE_TARGET };
    expect(
      controller.update(activation, 'identity-1', {
        activate: () => {
          activateCount += 1;
        },
      })
    ).toBe(true);
    expect(activateCount).toBe(1);
    expect(
      decideGuidedRuntimeTransition({
        isInert: false,
        canActivate: true,
        activationIdentity: 'identity-1',
        activeIdentity: 'identity-1',
      })
    ).toEqual({
      kind: 'activation',
      mutated: false,
      identity: 'identity-1',
    });
    expect(
      controller.update(activation, 'identity-1', {
        activate: () => {
          activateCount += 1;
        },
      })
    ).toBe(true);
    expect(activateCount).toBe(1);
  });

  test('same observable node publication is a no-op', () => {
    const target = createObservableGuidedTargetRef();
    const node = { id: 'node-1' };
    let notifications = 0;
    target.subscribe(() => {
      notifications += 1;
    });
    target.current = node;
    expect(notifications).toBe(1);
    const generation = target.getGeneration();
    target.current = node;
    expect(notifications).toBe(1);
    expect(target.getGeneration()).toBe(generation);
  });

  test('repeated null ref cleanup is a no-op', () => {
    const target = createObservableGuidedTargetRef();
    let notifications = 0;
    target.subscribe(() => {
      notifications += 1;
    });
    target.current = null;
    expect(notifications).toBe(0);
    target.current = { id: 'node' };
    expect(notifications).toBe(1);
    target.current = null;
    expect(notifications).toBe(2);
    const generation = target.getGeneration();
    target.current = null;
    expect(notifications).toBe(2);
    expect(target.getGeneration()).toBe(generation);
  });

  test('rejected cleanup does not call route cleanup until Close', () => {
    expect(
      shouldClearRejectedGuideRouteParams({
        hasGuideMetadata: true,
        userRequestedClose: false,
      })
    ).toBe(false);
    expect(
      shouldRenderGuidedStatusPanel({
        hasGuideMetadata: true,
        isBindingValid: false,
        canActivateTarget: false,
        status: 'rejected',
        feedback: REJECTED_GUIDE_CLEANUP_MESSAGE,
      })
    ).toBe('rejected_cleanup');
  });

  test('Close cleanup becomes inert after guide params are cleared', () => {
    expect(
      shouldClearRejectedGuideRouteParams({
        hasGuideMetadata: true,
        userRequestedClose: true,
      })
    ).toBe(true);
    const cleared = getClearedGuideRouteParams();
    const presence = resolveGuidedClientPresence({
      ...cleared,
      businessId: 'biz-1',
      entityId: 'entity-1',
      filter: 'at_risk',
    });
    expect(presence.isInert).toBe(true);
    expect(
      shouldRenderGuidedStatusPanel({
        hasGuideMetadata: presence.hasGuideMetadata,
        isBindingValid: false,
        canActivateTarget: false,
        status: 'rejected',
      })
    ).toBe('none');
    expect(
      shouldClearRejectedGuideRouteParams({
        hasGuideMetadata: presence.hasGuideMetadata,
        userRequestedClose: true,
      })
    ).toBe(false);
  });

  test('route cleanup cannot reopen rejected state', () => {
    const cleared = getClearedGuideRouteParams();
    expect(hasGuideLikeRouteMetadata(cleared)).toBe(false);
    expect(
      resolveGuidedClientPresence({
        ...cleared,
        businessId: 'biz-1',
      }).isInert
    ).toBe(true);
    expect(
      decideGuidedRuntimeTransition({
        isInert: true,
        canActivate: false,
        activationIdentity: 'none',
        activeIdentity: null,
      }).mutated
    ).toBe(false);
  });

  test('retry-success state does not reset repeatedly', () => {
    expect(
      shouldResetGuidedStatusRetryAfterSuccess({
        identity: 'id-1',
        retryIdentity: 'id-1',
        attempts: 2,
        inFlight: false,
        exhausted: false,
      })
    ).toBe(true);
    expect(
      shouldResetGuidedStatusRetryAfterSuccess({
        identity: 'id-1',
        retryIdentity: 'id-1',
        attempts: 0,
        inFlight: false,
        exhausted: false,
      })
    ).toBe(false);
    expect(
      shouldResetGuidedStatusRetryAfterSuccess({
        identity: null,
        retryIdentity: 'id-1',
        attempts: 2,
        inFlight: false,
        exhausted: false,
      })
    ).toBe(false);
  });

  test('no automatic retry on render and empty queries stay referentially stable', () => {
    const first = buildGuidedStatusQueriesRequest({
      enabled: false,
      query: 'guide-status',
      args: null,
    });
    const second = buildGuidedStatusQueriesRequest({
      enabled: false,
      query: 'guide-status',
      args: null,
    });
    expect(first).toBe(EMPTY_GUIDED_STATUS_QUERIES);
    expect(second).toBe(EMPTY_GUIDED_STATUS_QUERIES);
    expect(first).toBe(second);
  });

  test('business mismatch cleanup is once-only by stable key', () => {
    const cleanupKey = buildBusinessMismatchCleanupKey({
      activeBusinessId: 'biz-1',
      guideId: 'team-pending',
      guideSessionId: 'session-1',
      stableId: 'team.pending_invitations',
      recommendationBusinessId: 'biz-2',
    });
    expect(
      shouldAutoClearBusinessMismatchGuide({
        activeBusinessId: 'biz-1',
        guideId: 'team-pending',
        bindingOk: false,
        reasonCode: 'BUSINESS_MISMATCH',
        cleanupKey,
        alreadyClearedKey: null,
      })
    ).toBe(true);
    expect(
      shouldAutoClearBusinessMismatchGuide({
        activeBusinessId: 'biz-1',
        guideId: 'team-pending',
        bindingOk: false,
        reasonCode: 'BUSINESS_MISMATCH',
        cleanupKey,
        alreadyClearedKey: cleanupKey,
      })
    ).toBe(false);
  });

  test('business profile/address/subscription/program/campaign/customer/team normal-route bindings remain inert', () => {
    for (const binding of ORDINARY_ROUTE_BINDINGS) {
      const presence = resolveGuidedClientPresence(binding);
      expect(presence.isInert).toBe(true);
      expect(presence.hasGuideMetadata).toBe(false);
      expect(
        decideGuidedRuntimeTransition({
          isInert: presence.isInert,
          canActivate: false,
          activationIdentity: `${binding.routeKey}|none`,
          activeIdentity: null,
        })
      ).toEqual({ kind: 'deactivation', mutated: false });
      expect(
        buildGuidedStatusQueriesRequest({
          enabled: !presence.isInert,
          query: 'guide-status',
          args: null,
        })
      ).toBe(EMPTY_GUIDED_STATUS_QUERIES);
      expect(
        shouldRenderGuidedStatusPanel({
          hasGuideMetadata: presence.hasGuideMetadata,
          isBindingValid: false,
          canActivateTarget: false,
          status: 'rejected',
        })
      ).toBe('none');
    }
  });
});
