import { describe, expect, test } from 'bun:test';

import {
  buildDashboardLifecycleCountsFromStampEvents,
  isCustomerActiveForReferenceNow,
  isCustomerAtRiskForReferenceNow,
} from '../customerLifecycle';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('dashboard lifecycle KPI helpers', () => {
  test('counts customer as active when last stamp is within 30 days', () => {
    const referenceNow = 100 * DAY_MS;
    const stamps = [referenceNow - 10 * DAY_MS];

    expect(isCustomerActiveForReferenceNow(stamps, referenceNow)).toBe(true);
  });

  test('does not count customer as active when last stamp is older than 30 days', () => {
    const referenceNow = 100 * DAY_MS;
    const stamps = [referenceNow - 31 * DAY_MS];

    expect(isCustomerActiveForReferenceNow(stamps, referenceNow)).toBe(false);
  });

  test('counts multiple stamps in the 30-day window as one active customer', () => {
    const referenceNow = 100 * DAY_MS;
    const counts = buildDashboardLifecycleCountsFromStampEvents(
      [
        {
          customerUserId: 'customer_1',
          createdAt: referenceNow - 20 * DAY_MS,
          type: 'STAMP_ADDED',
        },
        {
          customerUserId: 'customer_1',
          createdAt: referenceNow - 5 * DAY_MS,
          type: 'STAMP_ADDED',
        },
        {
          customerUserId: 'customer_2',
          createdAt: referenceNow - 35 * DAY_MS,
          type: 'STAMP_ADDED',
        },
      ],
      referenceNow
    );

    expect(counts.activeCustomers).toBe(1);
  });

  test('historical referenceNow shifts the active window correctly', () => {
    const actualNow = 100 * DAY_MS;
    const historicalReferenceNow = actualNow - 15 * DAY_MS;
    const stamps = [actualNow - 5 * DAY_MS];

    expect(isCustomerActiveForReferenceNow(stamps, actualNow)).toBe(true);
    expect(
      isCustomerActiveForReferenceNow(stamps, historicalReferenceNow)
    ).toBe(false);
  });

  test('excludes customers with fewer than two visits from at-risk calculation', () => {
    const referenceNow = 100 * DAY_MS;
    const stamps = [referenceNow - 40 * DAY_MS];

    expect(isCustomerAtRiskForReferenceNow(stamps, referenceNow)).toBe(false);
  });

  test('counts customer as at risk when last visit is 1.5x beyond expected cycle', () => {
    const referenceNow = 100 * DAY_MS;
    const stamps = [
      referenceNow - 40 * DAY_MS,
      referenceNow - 30 * DAY_MS,
      referenceNow - 20 * DAY_MS,
    ];

    expect(isCustomerAtRiskForReferenceNow(stamps, referenceNow)).toBe(true);
  });

  test('historical referenceNow shifts at-risk calculation correctly', () => {
    const actualNow = 100 * DAY_MS;
    const historicalReferenceNow = 90 * DAY_MS;
    const stamps = [60 * DAY_MS, 70 * DAY_MS, 80 * DAY_MS];

    expect(
      isCustomerAtRiskForReferenceNow(stamps, historicalReferenceNow)
    ).toBe(false);
    expect(isCustomerAtRiskForReferenceNow(stamps, actualNow)).toBe(true);
  });
});
