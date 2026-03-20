import { describe, expect, test } from 'bun:test';

import {
  buildTrafficWindowsFromEvents,
  classifyTrafficValues,
} from '../analytics';

const DAY_MS = 24 * 60 * 60 * 1000;

function buildVisitEvent(createdAt) {
  return {
    type: 'STAMP_ADDED',
    createdAt,
  };
}

describe('analytics traffic strength engine', () => {
  test('classifyTrafficValues marks clear highs/lows as strong/weak', () => {
    const result = classifyTrafficValues([10, 10, 10, 2, 10, 18, 10]);

    expect(result).toContain('strong');
    expect(result).toContain('weak');
  });

  test('returns not_enough_visits when visit volume is below threshold', () => {
    const base = Date.UTC(2026, 0, 4, 10, 0, 0);
    const events = Array.from({ length: 20 }, (_unused, index) =>
      buildVisitEvent(base + index * DAY_MS)
    );

    const summary = buildTrafficWindowsFromEvents(events);

    expect(summary.hasEnoughData).toBe(false);
    expect(summary.reason).toBe('not_enough_visits');
    expect(summary.visitsConsidered).toBe(20);
  });

  test('returns not_enough_days when visits are concentrated into too few days', () => {
    const base = Date.UTC(2026, 0, 4, 10, 0, 0);
    const events = [];

    for (let day = 0; day < 10; day += 1) {
      const dayStart = base + day * DAY_MS;
      for (let i = 0; i < 5; i += 1) {
        events.push(buildVisitEvent(dayStart + i * 60 * 1000));
      }
    }

    const summary = buildTrafficWindowsFromEvents(events);

    expect(summary.hasEnoughData).toBe(false);
    expect(summary.reason).toBe('not_enough_days');
    expect(summary.visitsConsidered).toBe(50);
    expect(summary.activeDaysConsidered).toBe(10);
  });

  test('builds strong/weak weekday and hour classifications with enough data', () => {
    const base = Date.UTC(2026, 0, 4, 8, 0, 0);
    const events = [];
    const visitsByWeekdayPattern = [8, 5, 2, 5, 5, 4, 3];

    for (let day = 0; day < 28; day += 1) {
      const weekdayIndex = day % 7;
      const dayStart = base + day * DAY_MS;
      const visits = visitsByWeekdayPattern[weekdayIndex];

      for (let visitIndex = 0; visitIndex < visits; visitIndex += 1) {
        const hour =
          weekdayIndex === 0
            ? 9
            : weekdayIndex === 2
              ? 15
              : visitIndex % 2 === 0
                ? 10
                : 18;
        events.push(
          buildVisitEvent(
            dayStart + hour * 60 * 60 * 1000 + visitIndex * 5 * 60 * 1000
          )
        );
      }
    }

    const summary = buildTrafficWindowsFromEvents(events);

    expect(summary.hasEnoughData).toBe(true);
    expect(summary.reason).toBe('ok');
    expect(summary.weekday).toHaveLength(7);
    expect(summary.hourBlocks).toHaveLength(12);
    expect(summary.strongestWeekdays.length).toBeGreaterThan(0);
    expect(summary.weakestWeekdays.length).toBeGreaterThan(0);
    expect(summary.strongestHourBlocks.length).toBeGreaterThan(0);
    expect(summary.weakestHourBlocks.length).toBeGreaterThan(0);
  });
});
