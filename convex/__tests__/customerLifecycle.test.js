import { describe, expect, test } from 'bun:test';

import { getCustomerLifecycleStatus } from '../customerLifecycle';

describe('customer lifecycle near reward classification', () => {
  test('classifies customers at 80%-99% progress as near reward', () => {
    const status = getCustomerLifecycleStatus({
      joinedDaysAgo: 14,
      lastVisitDaysAgo: 3,
      rewardProgressRatio: 0.8,
      visitCount: 4,
    });

    expect(status).toBe('NEAR_REWARD');
  });

  test('does not classify fully completed cards as near reward', () => {
    const status = getCustomerLifecycleStatus({
      joinedDaysAgo: 14,
      lastVisitDaysAgo: 3,
      rewardProgressRatio: 1,
      visitCount: 4,
    });

    expect(status).toBe('ACTIVE');
  });
});
