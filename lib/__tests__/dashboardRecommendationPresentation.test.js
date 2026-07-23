import { describe, expect, test } from 'bun:test';

import { isRecommendationResponseForActiveBusiness } from '../dashboardBusinessIntegrity';
import {
  createRecommendationShownGuard,
  getRecommendationAnalyticsProps,
} from '../recommendations/analytics';

const recommendation = {
  stableId: 'campaign.publish_draft',
  category: 'operational',
  priority: 2,
  placement: 'primary',
  action: {
    type: 'open_campaign',
    campaignId: 'campaign_1',
  },
  evidenceFingerprint: 'rec_v1_12345678',
};

describe('dashboard recommendation presentation integrity', () => {
  test('withholds a stale business response', () => {
    expect(
      isRecommendationResponseForActiveBusiness({
        responseBusinessId: 'business_a',
        activeBusinessId: 'business_b',
        isSwitchingBusiness: false,
      })
    ).toBe(false);
  });

  test('withholds recommendations while a business switch is active', () => {
    expect(
      isRecommendationResponseForActiveBusiness({
        responseBusinessId: 'business_a',
        activeBusinessId: 'business_a',
        isSwitchingBusiness: true,
      })
    ).toBe(false);
  });

  test('allows only an exact current-business response', () => {
    expect(
      isRecommendationResponseForActiveBusiness({
        responseBusinessId: 'business_a',
        activeBusinessId: 'business_a',
        isSwitchingBusiness: false,
      })
    ).toBe(true);
  });

  test('shown guard emits once per business and evidence fingerprint', () => {
    const guard = createRecommendationShownGuard(3);
    const input = {
      businessId: 'business_1',
      stableId: recommendation.stableId,
      evidenceFingerprint: recommendation.evidenceFingerprint,
    };

    expect(guard.shouldTrack(input)).toBe(true);
    expect(guard.shouldTrack(input)).toBe(false);
    expect(
      guard.shouldTrack({
        ...input,
        evidenceFingerprint: 'rec_v1_changed',
      })
    ).toBe(true);
    expect(
      guard.shouldTrack({
        ...input,
        businessId: 'business_2',
      })
    ).toBe(true);
  });

  test('recommendation analytics returns only approved recommendation properties', () => {
    const props = getRecommendationAnalyticsProps(recommendation);

    expect(Object.keys(props).sort()).toEqual(
      [
        'action_type',
        'category',
        'evidence_fingerprint',
        'placement',
        'priority',
        'stable_recommendation_id',
      ].sort()
    );
    expect(props).not.toHaveProperty('businessId');
    expect(props).not.toHaveProperty('campaignId');
    expect(props).not.toHaveProperty('customerId');
    expect(props).not.toHaveProperty('phone');
    expect(props).not.toHaveProperty('title');
  });

  test('dashboard uses only the authoritative recommendation query', async () => {
    const source = await Bun.file(
      new URL(
        '../../app/(authenticated)/(business)/dashboard.tsx',
        import.meta.url
      )
    ).text();

    expect(source).toContain(
      'api.recommendations.getBusinessRecommendations'
    );
    expect(source).not.toContain('at_risk_task');
    expect(source).not.toContain('fallback_stable');
    expect(source).not.toContain('api.aiRecommendations');
    expect(source).not.toContain('buildFirstActionRecommendationCards');
    expect(source).not.toContain('הכרטיסייה פורסמה');
    expect(source).not.toContain('פעולות פתוחות');
  });

  test('panel bounds primary and secondary hierarchy for phone and tablet', async () => {
    const source = await Bun.file(
      new URL(
        '../../components/business-dashboard/SmartRecommendationsPanel.tsx',
        import.meta.url
      )
    ).text();

    expect(source).toContain("secondary.slice(0, 2)");
    expect(source).toContain("layoutMode === 'tablet'");
    expect(source).toContain('maxWidth: 920');
    expect(source).toContain('flexDirection: flexDirection.row');
    expect(source).toContain("flexDirection: 'column'");
    expect(source).toContain('rtlBaseView');
    expect(source).toContain('writingDirection');
  });

  test('empty, loading, and error states do not fabricate actions', async () => {
    const source = await Bun.file(
      new URL(
        '../../components/business-dashboard/SmartRecommendationsPanel.tsx',
        import.meta.url
      )
    ).text();

    expect(source).toContain("status === 'loading'");
    expect(source).toContain("status === 'error'");
    expect(source).toContain('אין כרגע פעולה שדורשת טיפול.');
    expect(source).toContain('לא הצלחנו לטעון את הפעולות כרגע.');
    expect(source).not.toContain('העסק יציב');
    expect(source).not.toContain('העסק בריא');
    expect(source).not.toContain('fallback');
  });
});
