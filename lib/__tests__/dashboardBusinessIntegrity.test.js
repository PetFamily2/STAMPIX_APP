import { describe, expect, test } from 'bun:test';

import {
  getDashboardDayAtRiskCustomersForActiveBusiness,
  isDashboardDayResponseForActiveBusiness,
} from '../dashboardBusinessIntegrity';

function dashboardDay(businessId, atRiskCustomers = 3) {
  return {
    businessId,
    kpis: {
      atRiskCustomers,
    },
  };
}

describe('dashboard day active-business integrity', () => {
  test('allows exact matching IDs outside a switch', () => {
    expect(
      isDashboardDayResponseForActiveBusiness({
        activeBusinessId: 'business_a',
        responseBusinessId: 'business_a',
        isSwitchingBusiness: false,
      })
    ).toBe(true);
  });

  test('blocks mismatched or missing business identity', () => {
    for (const input of [
      {
        activeBusinessId: 'business_b',
        responseBusinessId: 'business_a',
        isSwitchingBusiness: false,
      },
      {
        activeBusinessId: 'business_b',
        responseBusinessId: null,
        isSwitchingBusiness: false,
      },
      {
        activeBusinessId: null,
        responseBusinessId: 'business_b',
        isSwitchingBusiness: false,
      },
    ]) {
      expect(isDashboardDayResponseForActiveBusiness(input)).toBe(false);
    }
  });

  test('blocks switching and allows matching B after switching completes', () => {
    expect(
      isDashboardDayResponseForActiveBusiness({
        activeBusinessId: 'business_b',
        responseBusinessId: 'business_b',
        isSwitchingBusiness: true,
      })
    ).toBe(false);
    expect(
      isDashboardDayResponseForActiveBusiness({
        activeBusinessId: 'business_b',
        responseBusinessId: 'business_b',
        isSwitchingBusiness: false,
      })
    ).toBe(true);
  });
});

describe('day-derived at-risk recommendation data', () => {
  test('does not expose stale A KPIs under summary business B', () => {
    expect(
      getDashboardDayAtRiskCustomersForActiveBusiness({
        dashboardDay: dashboardDay('business_a', 7),
        activeBusinessId: 'business_b',
        isSwitchingBusiness: false,
      })
    ).toBeNull();
  });

  test('exposes matching B KPIs when existing eligibility is positive', () => {
    const atRiskCustomers =
      getDashboardDayAtRiskCustomersForActiveBusiness({
        dashboardDay: dashboardDay('business_b', 7),
        activeBusinessId: 'business_b',
        isSwitchingBusiness: false,
      });

    expect(atRiskCustomers).toBe(7);
    expect(atRiskCustomers > 0).toBe(true);
  });

  test('suppresses switching and missing response identity', () => {
    expect(
      getDashboardDayAtRiskCustomersForActiveBusiness({
        dashboardDay: dashboardDay('business_b', 7),
        activeBusinessId: 'business_b',
        isSwitchingBusiness: true,
      })
    ).toBeNull();
    expect(
      getDashboardDayAtRiskCustomersForActiveBusiness({
        dashboardDay: {
          kpis: { atRiskCustomers: 7 },
        },
        activeBusinessId: 'business_b',
        isSwitchingBusiness: false,
      })
    ).toBeNull();
  });

  test('drops the prior A-derived value immediately after active business becomes B', () => {
    const staleDay = dashboardDay('business_a', 7);
    expect(
      getDashboardDayAtRiskCustomersForActiveBusiness({
        dashboardDay: staleDay,
        activeBusinessId: 'business_a',
        isSwitchingBusiness: false,
      })
    ).toBe(7);
    expect(
      getDashboardDayAtRiskCustomersForActiveBusiness({
        dashboardDay: staleDay,
        activeBusinessId: 'business_b',
        isSwitchingBusiness: false,
      })
    ).toBeNull();
  });
});
