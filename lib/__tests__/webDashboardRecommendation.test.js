import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isRecommendationResponseForActiveBusiness } from '../dashboardBusinessIntegrity';
import {
  customerMatchesWebRouteFilter,
  parseWebCustomerRouteFilter,
} from '../recommendations/webCustomerFilter';
import {
  AI_RECOMMENDATION_LABEL,
  claimRecommendationAction,
  EMPTY_RECOMMENDATION_LABEL,
  RULE_RECOMMENDATION_LABEL,
  SAVED_RECOMMENDATION_LABEL,
  selectWebDashboardRecommendation,
} from '../recommendations/webDashboardSelection';
import {
  webHrefFromRecommendationTarget,
  webHrefFromStoredRecommendationResult,
} from '../recommendations/webRecommendationRoutes';

describe('web dashboard recommendation priority', () => {
  test('urgent rule priority 0 or 1 stays ahead of stored AI', () => {
    for (const priority of [0, 1]) {
      expect(
        selectWebDashboardRecommendation({
          rulePrimary: { priority },
          stored: { source: 'ai', actionable: true },
        })
      ).toEqual({ kind: 'rule', label: RULE_RECOMMENDATION_LABEL });
    }
  });

  test('stored AI is chosen only when the rule is not urgent', () => {
    expect(
      selectWebDashboardRecommendation({
        rulePrimary: { priority: 2 },
        stored: { source: 'ai', actionable: true },
      })
    ).toEqual({ kind: 'stored-ai', label: AI_RECOMMENDATION_LABEL });
  });

  test('a non-urgent rule is used when no actionable AI row exists', () => {
    expect(
      selectWebDashboardRecommendation({
        rulePrimary: { priority: 3 },
        stored: { source: 'ai', actionable: false },
      })
    ).toEqual({ kind: 'rule', label: RULE_RECOMMENDATION_LABEL });
  });

  test('fixed and cache rows are labeled as saved text', () => {
    for (const source of ['fixed', 'cache']) {
      expect(
        selectWebDashboardRecommendation({
          rulePrimary: null,
          stored: { source, actionable: true },
        })
      ).toEqual({ kind: 'stored-saved', label: SAVED_RECOMMENDATION_LABEL });
    }
  });

  test('nothing actionable uses the empty line', () => {
    expect(
      selectWebDashboardRecommendation({
        rulePrimary: null,
        stored: null,
      })
    ).toEqual({ kind: 'empty', label: EMPTY_RECOMMENDATION_LABEL });
  });

  test('a second click cannot claim the same in-flight action', () => {
    const inFlight = new Set();
    expect(claimRecommendationAction(inFlight, 'same')).toBe(true);
    expect(claimRecommendationAction(inFlight, 'same')).toBe(false);
  });

  test('a recommendation from another business is not current', () => {
    expect(
      isRecommendationResponseForActiveBusiness({
        responseBusinessId: 'business-a',
        activeBusinessId: 'business-b',
        isSwitchingBusiness: false,
      })
    ).toBe(false);
  });
});

describe('web recommendation destinations', () => {
  test('rule actions land on web routes, not native paths', () => {
    expect(
      webHrefFromRecommendationTarget({
        pathname: '/(authenticated)/(business)/customers',
        params: { businessId: 'biz', filter: 'at_risk' },
      })
    ).toEqual({
      pathname: '/business/customers',
      params: { businessId: 'biz', filter: 'at_risk' },
    });
    expect(
      webHrefFromRecommendationTarget({
        pathname: '/(authenticated)/(business)/settings-business-subscription',
        params: { businessId: 'biz' },
      })
    ).toEqual({
      pathname: '/business/billing',
      params: { businessId: 'biz' },
    });
  });

  test('a stored draft action opens the created campaign on the web', () => {
    expect(
      webHrefFromStoredRecommendationResult({
        kind: 'open_draft',
        campaignId: 'camp-1',
      })
    ).toEqual({
      pathname: '/business/campaign/[campaignId]',
      params: { campaignId: 'camp-1' },
    });
    expect(webHrefFromStoredRecommendationResult({ kind: 'none' })).toBeNull();
    expect(
      webHrefFromStoredRecommendationResult({
        kind: 'view_customers',
        customerFilter: 'at_risk',
      })
    ).toEqual({
      pathname: '/business/customers',
      params: { filter: 'at_risk' },
    });
    expect(
      webHrefFromRecommendationTarget({
        pathname: '/(authenticated)/(customer)/wallet',
        params: { businessId: 'biz' },
      })
    ).toBeNull();
  });

  test('customer route filters use the same states as the business list', () => {
    expect(parseWebCustomerRouteFilter(['at_risk'])).toBe('at_risk');
    expect(parseWebCustomerRouteFilter('unknown')).toBeNull();
    expect(
      customerMatchesWebRouteFilter(
        { customerState: 'NEEDS_WINBACK' },
        'at_risk'
      )
    ).toBe(true);
    expect(
      customerMatchesWebRouteFilter(
        { customerState: 'CLOSE_TO_REWARD' },
        'near_reward'
      )
    ).toBe(true);
    expect(
      customerMatchesWebRouteFilter({ customerState: 'ACTIVE' }, 'at_risk')
    ).toBe(false);
    expect(
      customerMatchesWebRouteFilter({ customerState: 'NEW' }, 'new_customers')
    ).toBe(true);
  });
});

describe('web recommendation actions stay explicit', () => {
  test('dashboard reads keep their reporting periods', () => {
    const dashboard = readFileSync(
      'components/business-web/BusinessWebDashboard.tsx',
      'utf8'
    );
    const counters = readFileSync(
      'lib/business-web/dashboardCounters.ts',
      'utf8'
    );
    expect(dashboard).toContain('rangeDays: 1');
    expect(dashboard).toContain('rangeDays: 30');
    expect(dashboard).toContain('readBusinessDashboardCounters');
    expect(counters).toContain('totalStampsAllTime');
    expect(counters).toContain('totalRedemptionsAllTime');
    expect(counters).toContain('totalCustomersJoinedAllTime');
    expect(dashboard).toContain('פעילים ב־30 הימים האחרונים');
    expect(dashboard).toContain('לפי דפוס הפעילות');
    expect(dashboard).toContain('חותמות ב־30 הימים האחרונים');
    expect(dashboard).toContain("const CUMULATIVE_PERIOD_LABEL = 'במצטבר'");
    expect(dashboard).toContain("const MEMBER_PERIOD_LABEL = 'הצטרפו עד היום'");
    expect(dashboard).not.toContain('?? 0');
  });

  test('stored and rule actions run from a press, and a business change blocks navigation', () => {
    const source = readFileSync(
      'components/business-web/BusinessWebRecommendation.tsx',
      'utf8'
    );
    expect(source).toContain('executeRecommendationPrimaryCta');
    expect(source).toContain('startBusinessRecommendationGuide');
    expect(source).toContain('snoozeBusinessRecommendation');
    const effectBodies = [
      ...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[/g),
    ].map((match) => match[1]);
    expect(effectBodies.length).toBeGreaterThan(0);
    for (const body of effectBodies) {
      expect(body).not.toContain('executeStoredCta');
      expect(body).not.toContain('startRecommendationGuide');
      expect(body).not.toContain('snoozeRecommendation');
    }
    expect(source).toContain('void openStored()');
    expect(source).toContain('void openRule()');
    expect(source).toContain(
      'claimRecommendationAction(inFlight.current, key)'
    );
    expect(source).toContain('activeBusinessRef.current !== openedBusinessId');
    expect(source).toContain('mountedRef.current');
    expect(source).toContain('webHrefFromRecommendationTarget(target)');
    expect(source).not.toContain('evaluateBusinessRecommendation');
  });
});
