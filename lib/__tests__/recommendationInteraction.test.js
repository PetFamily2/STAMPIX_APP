import { describe, expect, test } from 'bun:test';

import { ANALYTICS_EVENTS } from '../analytics/events';
import {
  createRecommendationShownGuard,
  getRecommendationAnalyticsProps,
  safelyTrackRecommendationEvent,
} from '../recommendations/analytics';
import {
  executeCurrentRecommendationInteraction,
  openRecommendationAction,
} from '../recommendations/interaction';

const BUSINESS_ID = 'business_1';
const ACTION = { type: 'open_campaigns' };
const ANALYTICS_PROPS = {
  stable_recommendation_id: 'campaign.create_first',
  category: 'growth',
  priority: 2,
  placement: 'primary',
  action_type: 'open_campaigns',
  evidence_fingerprint: 'rec_v1_12345678',
};
const INTERACTION_REQUEST = {
  businessId: BUSINESS_ID,
  stableId: 'campaign.create_first',
  evidenceFingerprint: 'rec_v1_12345678',
};

function currentInteractionState(overrides = {}) {
  return {
    activeBusinessId: BUSINESS_ID,
    isSwitchingBusiness: false,
    responseBusinessId: BUSINESS_ID,
    visibleRecommendations: [
      {
        stableId: INTERACTION_REQUEST.stableId,
        evidenceFingerprint: INTERACTION_REQUEST.evidenceFingerprint,
      },
    ],
    ...overrides,
  };
}

describe('recommendation interaction safety', () => {
  test.each([
    [
      'active business changed',
      { activeBusinessId: 'business_2' },
    ],
    [
      'response business changed',
      { responseBusinessId: 'business_2' },
    ],
    [
      'evidence changed',
      {
        visibleRecommendations: [
          {
            stableId: INTERACTION_REQUEST.stableId,
            evidenceFingerprint: 'rec_v1_changed',
          },
        ],
      },
    ],
    ['recommendation disappeared', { visibleRecommendations: [] }],
    ['business is switching', { isSwitchingBusiness: true }],
  ])('%s prevents a stale alert callback mutation', async (_label, overrides) => {
    let mutationCount = 0;
    let successAnalyticsCount = 0;
    let isLoading = true;

    const result = await executeCurrentRecommendationInteraction({
      request: INTERACTION_REQUEST,
      getCurrentState: () => currentInteractionState(overrides),
      mutate: async () => {
        mutationCount += 1;
        return { reasonCode: 'USER_DISMISSED' };
      },
      onSuccess: () => {
        successAnalyticsCount += 1;
      },
      onSettled: () => {
        isLoading = false;
      },
    });

    expect(result).toEqual({ ok: false, reason: 'stale' });
    expect(mutationCount).toBe(0);
    expect(successAnalyticsCount).toBe(0);
    expect(isLoading).toBe(false);
  });

  test('unchanged current business and evidence mutates once and clears loading', async () => {
    let mutationCount = 0;
    let successAnalyticsCount = 0;
    let isLoading = true;

    const result = await executeCurrentRecommendationInteraction({
      request: INTERACTION_REQUEST,
      getCurrentState: () => currentInteractionState(),
      mutate: async () => {
        mutationCount += 1;
        return { reasonCode: 'USER_DISMISSED' };
      },
      onSuccess: () => {
        successAnalyticsCount += 1;
      },
      onSettled: () => {
        isLoading = false;
      },
    });

    expect(result.ok).toBe(true);
    expect(mutationCount).toBe(1);
    expect(successAnalyticsCount).toBe(1);
    expect(isLoading).toBe(false);
  });

  test('interaction mutation failure retains current recommendation and clears loading', async () => {
    const current = currentInteractionState();
    let isLoading = true;
    let errorCount = 0;

    const result = await executeCurrentRecommendationInteraction({
      request: INTERACTION_REQUEST,
      getCurrentState: () => current,
      mutate: async () => {
        throw new Error('offline');
      },
      onError: () => {
        errorCount += 1;
      },
      onSettled: () => {
        isLoading = false;
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'mutation_failed',
    });
    expect(current.visibleRecommendations).toHaveLength(1);
    expect(errorCount).toBe(1);
    expect(isLoading).toBe(false);
  });

  test('a synchronous opened-analytics throw does not prevent navigation or leave loading set', () => {
    const navigated = [];
    let isLoading = false;

    const result = openRecommendationAction({
      businessId: BUSINESS_ID,
      action: ACTION,
      analyticsProps: ANALYTICS_PROPS,
      trackEvent: () => {
        throw new Error('analytics unavailable');
      },
      navigate: (target) => navigated.push(target),
      onStart: () => {
        isLoading = true;
      },
      onSettled: () => {
        isLoading = false;
      },
    });

    expect(result.ok).toBe(true);
    expect(navigated).toHaveLength(1);
    expect(navigated[0].pathname).toBe(
      '/(authenticated)/(business)/campaigns'
    );
    expect(isLoading).toBe(false);
  });

  test('a rejected opened-analytics promise does not prevent navigation', async () => {
    const navigated = [];

    const result = openRecommendationAction({
      businessId: BUSINESS_ID,
      action: ACTION,
      analyticsProps: ANALYTICS_PROPS,
      trackEvent: () => Promise.reject(new Error('analytics unavailable')),
      navigate: (target) => navigated.push(target),
    });

    await Promise.resolve();
    expect(result.ok).toBe(true);
    expect(navigated).toHaveLength(1);
  });

  test('an invalid action neither throws nor tracks nor navigates', () => {
    let trackCount = 0;
    let navigateCount = 0;

    expect(() => {
      const result = openRecommendationAction({
        businessId: BUSINESS_ID,
        action: null,
        analyticsProps: ANALYTICS_PROPS,
        trackEvent: () => {
          trackCount += 1;
        },
        navigate: () => {
          navigateCount += 1;
        },
      });
      expect(result).toEqual({ ok: false, reason: 'invalid_action' });
    }).not.toThrow();

    expect(trackCount).toBe(0);
    expect(navigateCount).toBe(0);
  });

  test('an undefined mapper result becomes a controlled failure', () => {
    let navigateCount = 0;
    let isLoading = true;

    const result = openRecommendationAction({
      businessId: BUSINESS_ID,
      action: ACTION,
      analyticsProps: ANALYTICS_PROPS,
      trackEvent: () => undefined,
      navigate: () => {
        navigateCount += 1;
      },
      onSettled: () => {
        isLoading = false;
      },
      resolveNavigation: () => undefined,
    });

    expect(result).toEqual({ ok: false, reason: 'invalid_action' });
    expect(navigateCount).toBe(0);
    expect(isLoading).toBe(false);
  });

  test('navigation failure still clears loading and remains observable', () => {
    let isLoading = false;

    expect(() =>
      openRecommendationAction({
        businessId: BUSINESS_ID,
        action: ACTION,
        analyticsProps: ANALYTICS_PROPS,
        trackEvent: () => undefined,
        navigate: () => {
          throw new Error('navigation failed');
        },
        onStart: () => {
          isLoading = true;
        },
        onSettled: () => {
          isLoading = false;
        },
      })
    ).toThrow('navigation failed');
    expect(isLoading).toBe(false);
  });

  test('shown analytics absorbs synchronous and rejected failures', async () => {
    expect(() =>
      safelyTrackRecommendationEvent(
        () => {
          throw new Error('analytics unavailable');
        },
        ANALYTICS_EVENTS.recommendationShown,
        ANALYTICS_PROPS
      )
    ).not.toThrow();

    safelyTrackRecommendationEvent(
      () => Promise.reject(new Error('analytics unavailable')),
      ANALYTICS_EVENTS.recommendationShown,
      ANALYTICS_PROPS
    );
    await Promise.resolve();
  });

  test('malformed shown-event actions are converted to a bounded action type', () => {
    expect(
      getRecommendationAnalyticsProps({
        stableId: 'campaign.create_first',
        category: 'growth',
        priority: 2,
        placement: 'primary',
        action: null,
        evidenceFingerprint: 'rec_v1_12345678',
      }).action_type
    ).toBe('invalid_action');
  });

  test('shown guard remains bounded and deduplicates failed emissions', () => {
    const guard = createRecommendationShownGuard(2);
    const first = {
      businessId: BUSINESS_ID,
      stableId: 'campaign.create_first',
      evidenceFingerprint: 'rec_v1_first',
    };

    expect(guard.shouldTrack(first)).toBe(true);
    safelyTrackRecommendationEvent(
      () => {
        throw new Error('analytics unavailable');
      },
      ANALYTICS_EVENTS.recommendationShown,
      ANALYTICS_PROPS
    );
    expect(guard.shouldTrack(first)).toBe(false);
    expect(
      guard.shouldTrack({
        ...first,
        evidenceFingerprint: 'rec_v1_second',
      })
    ).toBe(true);
    expect(
      guard.shouldTrack({
        ...first,
        evidenceFingerprint: 'rec_v1_third',
      })
    ).toBe(true);
    expect(guard.shouldTrack(first)).toBe(true);
  });
});
