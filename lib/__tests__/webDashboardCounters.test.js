import { describe, expect, test } from 'bun:test';
import { readBusinessDashboardCounters } from '../business-web/dashboardCounters';

const ACTIVE = 'business-a';

function summary(overrides = {}) {
  return {
    businessId: ACTIVE,
    lifetimeMetrics: {
      totalStampsAllTime: 1200,
      totalRedemptionsAllTime: 80,
      totalCustomersJoinedAllTime: 186,
    },
    ...overrides,
  };
}

function day(rangeDays, kpis, businessId = ACTIVE) {
  return {
    businessId,
    dateContext: { rangeDays },
    kpis,
  };
}

const todayKpis = {
  stamps: { value: 12 },
  redemptions: { value: 2 },
  activeCustomers: 28,
  atRiskCustomers: 3,
};

const monthKpis = {
  stamps: { value: 140 },
  redemptions: { value: 9 },
  activeCustomers: 28,
  atRiskCustomers: 3,
};

describe('business dashboard counters', () => {
  test('reads all-time totals, today, and the 30-day stamp count from their own fields', () => {
    expect(
      readBusinessDashboardCounters({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: false,
        summary: summary(),
        today: day(1, todayKpis),
        month: day(30, monthKpis),
      })
    ).toEqual({
      stampsAllTime: 1200,
      redemptionsAllTime: 80,
      customersAllTime: 186,
      stampsToday: 12,
      redemptionsToday: 2,
      stampsLast30Days: 140,
      activeCustomers: 28,
      atRiskCustomers: 3,
    });
  });

  test('does not treat a 30-day stamp count as today', () => {
    const counters = readBusinessDashboardCounters({
      activeBusinessId: ACTIVE,
      isSwitchingBusiness: false,
      summary: summary(),
      today: day(1, todayKpis),
      month: day(30, monthKpis),
    });
    expect(counters?.stampsToday).toBe(12);
    expect(counters?.stampsLast30Days).toBe(140);
    expect(counters?.stampsToday).not.toBe(counters?.stampsLast30Days);
  });

  test('refuses a day response whose range is not the requested period', () => {
    expect(
      readBusinessDashboardCounters({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: false,
        summary: summary(),
        today: day(30, monthKpis),
        month: day(30, monthKpis),
      })
    ).toBeNull();
    expect(
      readBusinessDashboardCounters({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: false,
        summary: summary(),
        today: day(1, todayKpis),
        month: day(1, todayKpis),
      })
    ).toBeNull();
  });

  test('drops every counter while the business is switching or the response belongs elsewhere', () => {
    const current = {
      activeBusinessId: ACTIVE,
      isSwitchingBusiness: false,
      summary: summary(),
      today: day(1, todayKpis),
      month: day(30, monthKpis),
    };
    expect(
      readBusinessDashboardCounters({ ...current, isSwitchingBusiness: true })
    ).toBeNull();
    expect(
      readBusinessDashboardCounters({
        ...current,
        summary: summary({ businessId: 'business-b' }),
      })
    ).toBeNull();
    expect(
      readBusinessDashboardCounters({
        ...current,
        today: day(1, todayKpis, 'business-b'),
      })
    ).toBeNull();
    expect(
      readBusinessDashboardCounters({
        ...current,
        month: day(30, monthKpis, 'business-b'),
      })
    ).toBeNull();
  });

  test('does not invent a zero when a metric is missing', () => {
    expect(
      readBusinessDashboardCounters({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: false,
        summary: summary({
          lifetimeMetrics: {
            totalStampsAllTime: 10,
            totalRedemptionsAllTime: null,
            totalCustomersJoinedAllTime: 4,
          },
        }),
        today: day(1, todayKpis),
        month: day(30, monthKpis),
      })
    ).toBeNull();
    expect(
      readBusinessDashboardCounters({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: false,
        summary: null,
        today: day(1, todayKpis),
        month: day(30, monthKpis),
      })
    ).toBeNull();
  });
});
