import { describe, expect, test } from 'bun:test';
import {
  readHomeAchievements,
  readStampsToday,
  visibleTodayStampCount,
} from '../business-web/dashboardCounters';
import {
  nextStampMilestone,
  stampMilestoneMessage,
} from '../business-web/stampMilestones';

const ACTIVE = 'business-a';

function summary(overrides = {}) {
  return {
    businessId: ACTIVE,
    lifetimeMetrics: {
      totalStampsAllTime: 147,
      totalRedemptionsAllTime: 9,
    },
    ...overrides,
  };
}

describe('home achievements', () => {
  test('reads lifetime stamps and redemptions for the active business', () => {
    expect(
      readHomeAchievements({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: false,
        summary: summary(),
      })
    ).toEqual({ stampsAllTime: 147, redemptionsAllTime: 9 });
  });

  test('does not invent zeros when a lifetime total is missing', () => {
    expect(
      readHomeAchievements({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: false,
        summary: summary({
          lifetimeMetrics: {
            totalStampsAllTime: 147,
            totalRedemptionsAllTime: null,
          },
        }),
      })
    ).toBeNull();
    expect(
      readHomeAchievements({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: false,
        summary: null,
      })
    ).toBeNull();
  });

  test('drops achievements while switching or when the summary is for another business', () => {
    expect(
      readHomeAchievements({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: true,
        summary: summary(),
      })
    ).toBeNull();
    expect(
      readHomeAchievements({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: false,
        summary: summary({ businessId: 'business-b' }),
      })
    ).toBeNull();
  });

  test('today stamps stay hidden at zero and when the range is not today', () => {
    expect(visibleTodayStampCount(0)).toBeNull();
    expect(visibleTodayStampCount(null)).toBeNull();
    expect(visibleTodayStampCount(5)).toBe(5);
    expect(
      readStampsToday({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: false,
        today: {
          businessId: ACTIVE,
          dateContext: { rangeDays: 1 },
          kpis: { stamps: { value: 0 } },
        },
      })
    ).toBe(0);
    expect(
      readStampsToday({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: false,
        today: {
          businessId: ACTIVE,
          dateContext: { rangeDays: 30 },
          kpis: { stamps: { value: 40 } },
        },
      })
    ).toBeNull();
    expect(
      readStampsToday({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: true,
        today: {
          businessId: ACTIVE,
          dateContext: { rangeDays: 1 },
          kpis: { stamps: { value: 5 } },
        },
      })
    ).toBeNull();
    expect(
      readStampsToday({
        activeBusinessId: ACTIVE,
        isSwitchingBusiness: false,
        today: {
          businessId: 'business-b',
          dateContext: { rangeDays: 1 },
          kpis: { stamps: { value: 5 } },
        },
      })
    ).toBeNull();
  });
});

describe('stamp milestones', () => {
  test('uses the next unreached step, including the example of 150', () => {
    expect(nextStampMilestone(147)).toMatchObject({
      floor: 100,
      target: 150,
      remaining: 3,
    });
    expect(stampMilestoneMessage(147)).toBe('עוד 3 חותמות להישג של 150!');
  });

  test('does not present an exact milestone as still ahead', () => {
    for (const reached of [10, 25, 50, 100, 150, 200, 250, 500, 750, 1000]) {
      const next = nextStampMilestone(reached);
      expect(next).not.toBeNull();
      expect(next?.target).toBeGreaterThan(reached);
      expect(next?.floor).toBe(reached);
      expect(next?.progress).toBe(0);
    }
  });

  test('keeps the boundaries just below each early milestone', () => {
    expect(nextStampMilestone(0)).toMatchObject({
      floor: 0,
      target: 10,
      remaining: 10,
      progress: 0,
    });
    expect(nextStampMilestone(9)).toMatchObject({
      target: 10,
      remaining: 1,
    });
    expect(stampMilestoneMessage(9)).toBe('עוד חותמת אחת להישג של 10!');
    expect(nextStampMilestone(999)).toMatchObject({
      floor: 750,
      target: 1000,
      remaining: 1,
    });
  });

  test('continues with round milestones after 1000', () => {
    expect(nextStampMilestone(1000)).toMatchObject({
      floor: 1000,
      target: 1500,
      remaining: 500,
    });
    expect(nextStampMilestone(1500)).toMatchObject({ target: 2000 });
    expect(nextStampMilestone(10000)).toMatchObject({
      floor: 10000,
      target: 15000,
    });
  });

  test('rejects a count that is not a real total', () => {
    expect(nextStampMilestone(Number.NaN)).toBeNull();
    expect(nextStampMilestone(-1)).toBeNull();
  });
});
