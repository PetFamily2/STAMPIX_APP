import { describe, expect, test } from 'bun:test';
import { applySegmentRules, normalizeSegmentRules } from '../segments';

describe('segments legacy customerStatus migration compatibility', () => {
  test('maps legacy AT_RISK to NEEDS_WINBACK customerState', () => {
    const normalized = normalizeSegmentRules({
      match: 'all',
      conditions: [
        {
          field: 'customerStatus',
          operator: 'eq',
          value: 'AT_RISK',
        },
      ],
    });

    expect(normalized.conditions).toEqual([
      {
        field: 'customerState',
        operator: 'eq',
        value: 'NEEDS_WINBACK',
      },
    ]);
  });

  test('maps legacy VIP to customerValueTier VIP', () => {
    const normalized = normalizeSegmentRules({
      match: 'all',
      conditions: [
        {
          field: 'customerStatus',
          operator: 'eq',
          value: 'VIP',
        },
      ],
    });

    expect(normalized.conditions).toEqual([
      {
        field: 'customerValueTier',
        operator: 'eq',
        value: 'VIP',
      },
    ]);
  });

  test('applies mapped legacy rule against customer intelligence fields', () => {
    const rules = normalizeSegmentRules({
      match: 'all',
      conditions: [
        {
          field: 'customerStatus',
          operator: 'eq',
          value: 'NEAR_REWARD',
        },
      ],
    });
    const customers = [
      {
        customerState: 'CLOSE_TO_REWARD',
        customerValueTier: 'LOYAL',
        lastVisitDaysAgo: 4,
        visitCount: 8,
        loyaltyProgress: 9,
        joinedDaysAgo: 20,
      },
      {
        customerState: 'ACTIVE',
        customerValueTier: 'REGULAR',
        lastVisitDaysAgo: 2,
        visitCount: 4,
        loyaltyProgress: 2,
        joinedDaysAgo: 10,
      },
    ];

    const matches = applySegmentRules(customers, rules);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.customerState).toBe('CLOSE_TO_REWARD');
  });
});
