import { describe, expect, test } from 'bun:test';

import { BUSINESS_ROUTES } from '../navigation/businessRoutes';
import { getRecommendationNavigationTarget } from '../recommendations/navigation';

const BUSINESS_ID = 'business_1';

function target(action) {
  const result = getRecommendationNavigationTarget({
    businessId: BUSINESS_ID,
    action,
  });
  expect(result.ok).toBe(true);
  return result.target;
}

describe('business recommendation navigation', () => {
  test.each([
    [
      { type: 'open_business_address' },
      '/(authenticated)/(business)/settings-business-address',
    ],
    [
      { type: 'open_business_profile' },
      '/(authenticated)/(business)/settings-business-profile',
    ],
    [
      { type: 'open_programs' },
      '/(authenticated)/(business)/programs',
    ],
    [
      { type: 'open_campaigns' },
      '/(authenticated)/(business)/campaigns',
    ],
    [
      { type: 'open_team_pending' },
      BUSINESS_ROUTES.team,
    ],
    [
      { type: 'open_subscription' },
      '/(authenticated)/(business)/settings-business-subscription',
    ],
  ])('maps %o to the canonical route', (action, pathname) => {
    const result = target(action);

    expect(result.pathname).toBe(pathname);
    expect(result.params.businessId).toBe(BUSINESS_ID);
  });

  test('preserves the exact program ID on the program detail route', () => {
    expect(
      target({
        type: 'open_program',
        programId: 'program_123',
      })
    ).toEqual({
      pathname: '/(authenticated)/(business)/cards/[programId]',
      params: {
        businessId: BUSINESS_ID,
        programId: 'program_123',
      },
    });
  });

  test('preserves the exact campaign ID and never routes it to cards or analytics', () => {
    const result = target({
      type: 'open_campaign',
      campaignId: 'campaign_123',
    });

    expect(result).toEqual({
      pathname:
        '/(authenticated)/(business)/cards/campaign/[campaignId]',
      params: {
        businessId: BUSINESS_ID,
        campaignId: 'campaign_123',
      },
    });
    expect(result.pathname).not.toBe(
      '/(authenticated)/(business)/programs'
    );
    expect(result.pathname).not.toContain('analytics');
  });

  test.each([
    [{ type: 'open_program', programId: '' }, 'missing_program_id'],
    [{ type: 'open_program' }, 'missing_program_id'],
    [{ type: 'open_program', programId: '   ' }, 'missing_program_id'],
    [{ type: 'open_campaign' }, 'missing_campaign_id'],
    [{ type: 'open_campaign', campaignId: '   ' }, 'missing_campaign_id'],
  ])('blocks exact navigation when an entity ID is missing', (action, reason) => {
    expect(
      getRecommendationNavigationTarget({
        businessId: BUSINESS_ID,
        action,
      })
    ).toEqual({ ok: false, reason });
  });

  test('blocks all navigation without a business ID', () => {
    expect(
      getRecommendationNavigationTarget({
        businessId: '',
        action: { type: 'open_campaigns' },
      })
    ).toEqual({ ok: false, reason: 'missing_business_id' });
  });

  test.each([
    [null, 'invalid_action'],
    ['open_campaigns', 'invalid_action'],
    [{}, 'invalid_action'],
    [{ type: 'open_unknown' }, 'unknown_action_type'],
    [
      { type: 'open_campaigns', url: 'https://example.com' },
      'invalid_action_shape',
    ],
  ])('rejects malformed runtime action %#', (action, reason) => {
    expect(
      getRecommendationNavigationTarget({
        businessId: BUSINESS_ID,
        action,
      })
    ).toEqual({ ok: false, reason });
  });

  test('rejects invalid customer segments', () => {
    expect(
      getRecommendationNavigationTarget({
        businessId: BUSINESS_ID,
        action: {
          type: 'open_customers_segment',
          segment: 'all_customers',
        },
      })
    ).toEqual({ ok: false, reason: 'invalid_customer_segment' });
  });

  test.each(['at_risk', 'near_reward'])(
    'preserves the exact %s customer filter',
    (segment) => {
      expect(
        target({
          type: 'open_customers_segment',
          segment,
        })
      ).toEqual({
        pathname: '/(authenticated)/(business)/customers',
        params: {
          businessId: BUSINESS_ID,
          filter: segment,
        },
      });
    }
  );

  test('ordinary Team navigation uses the canonical route without guide metadata', () => {
    expect(BUSINESS_ROUTES.team).toBe(
      '/(authenticated)/(business)/team'
    );
    expect(BUSINESS_ROUTES.team).not.toContain('guideSessionId');
    expect(BUSINESS_ROUTES.team).not.toContain('guideId');
    expect(BUSINESS_ROUTES.team).not.toContain('stableId');
    expect(BUSINESS_ROUTES.team).not.toContain('evidenceFingerprint');
  });

  test('pending-team guidance uses the same Team screen and preserves section and guide metadata', () => {
    const result = getRecommendationNavigationTarget({
      businessId: BUSINESS_ID,
      action: { type: 'open_team_pending' },
      guideSessionId: 'guide_session_1',
      guideId: 'team-pending',
      stableId: 'team.pending_invitations',
      evidenceFingerprint: 'team-evidence-1',
    });

    expect(result).toEqual({
      ok: true,
      target: {
        pathname: BUSINESS_ROUTES.team,
        params: {
          businessId: BUSINESS_ID,
          guideSessionId: 'guide_session_1',
          guideId: 'team-pending',
          stableId: 'team.pending_invitations',
          evidenceFingerprint: 'team-evidence-1',
          recommendationBusinessId: BUSINESS_ID,
          section: 'pending',
        },
      },
    });
  });

  test.each(['customers', undefined])(
    'rejects the invalid subscription limit key %o',
    (limitKey) => {
      expect(
        getRecommendationNavigationTarget({
          businessId: BUSINESS_ID,
          action: {
            type: 'open_subscription',
            limitKey,
          },
        })
      ).toEqual({
        ok: false,
        reason: 'invalid_subscription_limit_key',
      });
    }
  );

  test('subscription action preserves the campaigns limit key', () => {
    expect(
      target({
        type: 'open_subscription',
        limitKey: 'campaigns',
      }).params.limitKey
    ).toBe('campaigns');
  });

  test('the mapper has no history-based navigation action', async () => {
    const source = await Bun.file(
      new URL('../recommendations/navigation.ts', import.meta.url)
    ).text();

    expect(source).not.toContain('router.back');
  });
});
