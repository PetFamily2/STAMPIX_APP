import { describe, expect, test } from 'bun:test';

import { isStoredRecommendationCurrentForProgramState } from '../aiRecommendations';

describe('stored business recommendation freshness', () => {
  test('hides a pre-onboarding no-card recommendation after a card is active', () => {
    expect(
      isStoredRecommendationCurrentForProgramState({
        stateKey: 'NO_ACTIVE_PROGRAM',
        hasActiveProgram: true,
      })
    ).toBe(false);
  });

  test('keeps the no-card recommendation while no card is active', () => {
    expect(
      isStoredRecommendationCurrentForProgramState({
        stateKey: 'NO_ACTIVE_PROGRAM',
        hasActiveProgram: false,
      })
    ).toBe(true);
  });

  test('does not suppress unrelated stored recommendations', () => {
    expect(
      isStoredRecommendationCurrentForProgramState({
        stateKey: 'LOW_BEHAVIORAL_SIGNAL',
        hasActiveProgram: true,
      })
    ).toBe(true);
  });
});
