import { file } from 'bun';
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
    const source = await file(
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

  test('dashboard heading, activity, and QR outcome copy match the final contract', async () => {
    const source = await file(
      new URL(
        '../../app/(authenticated)/(business)/dashboard.tsx',
        import.meta.url
      )
    ).text();

    expect(source).toContain('מומלץ עכשיו');
    expect(source).not.toContain('הפעולה הבאה');
    expect(source).not.toContain('תובנות לקוחות');
    expect(source).not.toContain(
      "openRoute('/(authenticated)/(business)/analytics')"
    );
    expect(source).toContain("label: 'צרפו לקוחות'");
    expect(source).not.toContain("label: 'קוד הצטרפות'");
  });

  test('sparkle is the first child in the manually reversed, right-anchored title row', async () => {
    const source = await file(
      new URL(
        '../../app/(authenticated)/(business)/dashboard.tsx',
        import.meta.url
      )
    ).text();
    const headingStart = source.indexOf(
      '<View style={styles.recommendationsTitleRow}>'
    );
    const headingEnd = source.indexOf('</View>', headingStart);
    const heading = source.slice(headingStart, headingEnd);

    expect(headingStart).toBeGreaterThan(-1);
    expect(heading.indexOf('<Ionicons')).toBeGreaterThan(-1);
    expect(heading.indexOf('מומלץ עכשיו')).toBeGreaterThan(
      heading.indexOf('<Ionicons')
    );
    expect(source).toContain(
      'recommendationsTitleRow: {\n    flexDirection: flexDirection.row'
    );
    expect(source).toContain('alignSelf: selfStart');
    expect(source).not.toContain('I18nManager');
    expect(source).not.toContain('forceRTL');
  });

  test('panel bounds primary and secondary hierarchy for phone and tablet', async () => {
    const source = await file(
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
    const source = await file(
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

  test('every recommendation exposes open, snooze, and dismiss without an options menu', async () => {
    const [cardSource, panelSource, dashboardSource] = await Promise.all([
      file(
        new URL(
          '../../components/business-dashboard/RecommendationActionCard.tsx',
          import.meta.url
        )
      ).text(),
      file(
        new URL(
          '../../components/business-dashboard/SmartRecommendationsPanel.tsx',
          import.meta.url
        )
      ).text(),
      file(
        new URL(
          '../../app/(authenticated)/(business)/dashboard.tsx',
          import.meta.url
        )
      ).text(),
    ]);

    expect(cardSource).not.toContain('ellipsis-horizontal');
    expect(cardSource).not.toContain('onShowOptions');
    expect(cardSource).toContain('accessibilityLabel="הזכר לי מאוחר יותר"');
    expect(cardSource).toContain('accessibilityLabel="הסרת ההמלצה"');
    expect(cardSource).toContain('onPress={onOpen}');
    expect(cardSource).toContain('onPress={onSnooze}');
    expect(cardSource).toContain('onPress={onDismiss}');
    expect(panelSource.match(/onSnooze=\{\(\) => onSnooze\(/g)).toHaveLength(2);
    expect(panelSource.match(/onDismiss=\{\(\) => onDismiss\(/g)).toHaveLength(2);
    expect(dashboardSource).toContain(
      'api.recommendations.snoozeBusinessRecommendation'
    );
    expect(dashboardSource).toContain(
      'api.recommendations.dismissBusinessRecommendation'
    );
    expect(dashboardSource).toContain('openRecommendationAction({');
    expect(dashboardSource).toContain('action: session.action');
    expect(dashboardSource).toContain(
      "void performInteraction(recommendation, 'snooze')"
    );
    expect(dashboardSource).toContain(
      "void performInteraction(recommendation, 'dismiss')"
    );
    expect(dashboardSource).toContain("text: 'ביטול'");
    expect(dashboardSource).toContain("text: 'הסרה'");
  });

  test('compact cards preserve accessible loading states and manual RTL action order', async () => {
    const [cardSource, dashboardSource] = await Promise.all([
      file(
        new URL(
          '../../components/business-dashboard/RecommendationActionCard.tsx',
          import.meta.url
        )
      ).text(),
      file(
        new URL(
          '../../app/(authenticated)/(business)/dashboard.tsx',
          import.meta.url
        )
      ).text(),
    ]);

    expect(cardSource).not.toContain('minHeight: 190');
    expect(cardSource).not.toContain('minHeight: 128');
    expect(cardSource).toContain('paddingVertical: 10');
    expect(cardSource).toContain('paddingVertical: 8');
    expect(cardSource).toContain('minHeight: 44');
    expect(cardSource.match(/disabled=\{isBusy\}/g)).toHaveLength(3);
    expect(dashboardSource).toContain('inFlightRecommendationKeysRef');
    expect(dashboardSource).toContain('.current.has(key)');

    const actionRowStart = cardSource.indexOf(
      '<View style={styles.actionRow}>'
    );
    const primaryAction = cardSource.indexOf('onPress={onOpen}', actionRowStart);
    const snoozeAction = cardSource.indexOf(
      'onPress={onSnooze}',
      actionRowStart
    );
    const dismissAction = cardSource.indexOf(
      'onPress={onDismiss}',
      actionRowStart
    );
    expect(actionRowStart).toBeGreaterThan(-1);
    expect(primaryAction).toBeGreaterThan(actionRowStart);
    expect(snoozeAction).toBeGreaterThan(primaryAction);
    expect(dismissAction).toBeGreaterThan(snoozeAction);
    expect(cardSource).toContain(
      'actionRow: {\n    flexDirection: flexDirection.row'
    );
    expect(cardSource).not.toContain('I18nManager');
    expect(cardSource).not.toContain('forceRTL');
  });
});
