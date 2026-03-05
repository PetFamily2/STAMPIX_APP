import { describe, expect, test } from 'bun:test';
import { buildCustomerInsights, resolveCustomerSegment } from '../events';

const DEFAULT_THRESHOLDS = {
  riskDaysWithoutVisit: 10,
  frequentVisitsLast30Days: 6,
  dropPercentThreshold: 40,
};

describe('customer segmentation rules', () => {
  test('classifies risk when days since last visit reaches risk threshold', () => {
    const segment = resolveCustomerSegment({
      ...DEFAULT_THRESHOLDS,
      daysSinceLastVisit: 10,
      visitsLast30: 8,
      visitsPrev30: 9,
    });
    expect(segment).toBe('risk');
  });

  test('classifies dropoff when previous period was frequent and recent period dropped by threshold', () => {
    const segment = resolveCustomerSegment({
      ...DEFAULT_THRESHOLDS,
      daysSinceLastVisit: 4,
      visitsLast30: 3,
      visitsPrev30: 8,
    });
    expect(segment).toBe('dropoff');
  });

  test('classifies frequent when recent visits pass frequent threshold', () => {
    const segment = resolveCustomerSegment({
      ...DEFAULT_THRESHOLDS,
      daysSinceLastVisit: 3,
      visitsLast30: 7,
      visitsPrev30: 2,
    });
    expect(segment).toBe('frequent');
  });

  test('classifies stable when no other segment condition is met', () => {
    const segment = resolveCustomerSegment({
      ...DEFAULT_THRESHOLDS,
      daysSinceLastVisit: 3,
      visitsLast30: 2,
      visitsPrev30: 3,
    });
    expect(segment).toBe('stable');
  });

  test('risk has priority over dropoff/frequent', () => {
    const segment = resolveCustomerSegment({
      ...DEFAULT_THRESHOLDS,
      daysSinceLastVisit: 21,
      visitsLast30: 9,
      visitsPrev30: 10,
    });
    expect(segment).toBe('risk');
  });

  test('changing business thresholds changes classification outcome', () => {
    const metrics = {
      daysSinceLastVisit: 8,
      visitsLast30: 5,
      visitsPrev30: 8,
    };

    const conservative = resolveCustomerSegment({
      ...DEFAULT_THRESHOLDS,
      ...metrics,
    });
    expect(conservative).toBe('stable');

    const aggressiveFrequent = resolveCustomerSegment({
      riskDaysWithoutVisit: 10,
      frequentVisitsLast30Days: 5,
      dropPercentThreshold: 60,
      ...metrics,
    });
    expect(aggressiveFrequent).toBe('frequent');
  });
});

describe('customer insights builder', () => {
  test('returns a single onboarding insight when there are no active customers', () => {
    const insights = buildCustomerInsights({
      activeCustomers: 0,
      riskCount: 0,
      frequentCount: 0,
      dropoffCount: 0,
      stableCount: 0,
    });
    expect(insights.length).toBe(1);
  });

  test('returns up to 3 prioritized insights', () => {
    const insights = buildCustomerInsights({
      activeCustomers: 22,
      riskCount: 4,
      frequentCount: 7,
      dropoffCount: 3,
      stableCount: 8,
    });
    expect(insights.length).toBe(3);
    expect(insights.some((insight) => insight.includes('4'))).toBe(true);
    expect(insights.some((insight) => insight.includes('3'))).toBe(true);
    expect(insights.some((insight) => insight.includes('7'))).toBe(true);
  });
});
