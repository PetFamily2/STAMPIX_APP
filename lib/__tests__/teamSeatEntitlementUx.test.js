import { describe, expect, test } from 'bun:test';

import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '../entitlements/errors';
import {
  getLockedAreaCopy,
  getUpgradeAreaLabel,
} from '../subscription/lockedAreaCopy';

describe('team seat entitlement UX helpers', () => {
  test('parses and renders maxTeamSeats entitlement errors', () => {
    const parsed = getEntitlementError({
      data: {
        code: 'PLAN_LIMIT_REACHED',
        businessId: 'business_1',
        limitKey: 'maxTeamSeats',
        limitValue: 5,
        currentValue: 5,
        requiredPlan: 'premium',
      },
    });

    expect(parsed?.limitKey).toBe('maxTeamSeats');
    expect(entitlementErrorToHebrewMessage(parsed)).toContain(
      '\u05de\u05d5\u05e9\u05d1\u05d9 \u05d4\u05e6\u05d5\u05d5\u05ea'
    );
    expect(entitlementErrorToHebrewMessage(parsed)).toContain('5');
  });

  test('resolves locked copy and upgrade label for team seat limit', () => {
    const copy = getLockedAreaCopy('maxTeamSeats', 'premium');

    expect(copy.lockedTitle).toContain(
      '\u05de\u05d5\u05e9\u05d1\u05d9 \u05d4\u05e6\u05d5\u05d5\u05ea'
    );
    expect(copy.lockedSubtitle).toContain('Premium');
    expect(getUpgradeAreaLabel('maxTeamSeats')).toContain(
      '\u05de\u05d5\u05e9\u05d1\u05d9 \u05e6\u05d5\u05d5\u05ea'
    );
  });
});
