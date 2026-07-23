import { describe, expect, test } from 'bun:test';

import { getRecommendationNavigationTarget } from '../recommendations/navigation';

const guide = {
  businessId: 'business_1',
  guideSessionId: 'guide_session_1',
  stableId: 'program.publish_draft',
  guideId: 'program-publish',
  evidenceFingerprint: 'opaque_fingerprint',
  entityId: 'program_1',
};

describe('guided recommendation navigation', () => {
  test('preserves validated guide and exact entity bindings', () => {
    const result = getRecommendationNavigationTarget({
      ...guide,
      action: { type: 'open_program', programId: 'program_1' },
    });
    expect(result.ok).toBe(true);
    expect(result.target.params).toEqual({
      businessId: 'business_1',
      guideSessionId: 'guide_session_1',
      guideId: 'program-publish',
      stableId: 'program.publish_draft',
      evidenceFingerprint: 'opaque_fingerprint',
      recommendationBusinessId: 'business_1',
      entityId: 'program_1',
      programId: 'program_1',
    });
  });

  test('rejects arbitrary guide IDs', () => {
    expect(
      getRecommendationNavigationTarget({
        ...guide,
        guideId: 'anything-from-client',
        action: { type: 'open_program', programId: 'program_1' },
      })
    ).toEqual({ ok: false, reason: 'invalid_guide' });
  });

  test('rejects guide metadata without a server-issued session ID', () => {
    expect(
      getRecommendationNavigationTarget({
        ...guide,
        guideSessionId: undefined,
        action: { type: 'open_program', programId: 'program_1' },
      })
    ).toEqual({ ok: false, reason: 'invalid_guide' });
  });

  test('rejects an entity that does not match the canonical action', () => {
    expect(
      getRecommendationNavigationTarget({
        ...guide,
        action: { type: 'open_program', programId: 'program_2' },
      })
    ).toEqual({ ok: false, reason: 'guide_entity_mismatch' });
  });

  test('rejects a missing entity for an exact guide', () => {
    expect(
      getRecommendationNavigationTarget({
        ...guide,
        entityId: undefined,
        action: { type: 'open_program', programId: 'program_1' },
      })
    ).toEqual({ ok: false, reason: 'invalid_guide' });
  });

  test('normal navigation remains unchanged without guide metadata', () => {
    expect(
      getRecommendationNavigationTarget({
        businessId: 'business_1',
        action: { type: 'open_programs' },
      })
    ).toEqual({
      ok: true,
      target: {
        pathname: '/(authenticated)/(business)/programs',
        params: { businessId: 'business_1' },
      },
    });
  });
});
