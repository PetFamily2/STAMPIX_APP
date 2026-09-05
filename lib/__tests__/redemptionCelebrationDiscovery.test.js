import { describe, expect, test } from 'bun:test';

import {
  rememberConsumedCelebration,
  shouldClaimRedemptionCelebration,
} from '../redemptionCelebrationDiscovery';

describe('same-session redemption celebration freshness', () => {
  test('a receipt arriving while the app is active becomes claimable', () => {
    expect(
      shouldClaimRedemptionCelebration(
        { pending: true, newestConfirmedAt: 200 },
        null
      )
    ).toBe(true);
  });

  test('closing one receipt suppresses older backlog and the same watermark', () => {
    const consumed = rememberConsumedCelebration(null, 200);
    expect(
      shouldClaimRedemptionCelebration(
        { pending: true, newestConfirmedAt: 100 },
        consumed
      )
    ).toBe(false);
    expect(
      shouldClaimRedemptionCelebration(
        { pending: true, newestConfirmedAt: 200 },
        consumed
      )
    ).toBe(false);
  });

  test('a genuinely newer same-session receipt can present', () => {
    const consumed = rememberConsumedCelebration(null, 200);
    expect(
      shouldClaimRedemptionCelebration(
        { pending: true, newestConfirmedAt: 201 },
        consumed
      )
    ).toBe(true);
  });

  test('a later foreground can consider one older pending receipt', () => {
    expect(
      shouldClaimRedemptionCelebration(
        { pending: true, newestConfirmedAt: 100 },
        null
      )
    ).toBe(true);
  });
});
