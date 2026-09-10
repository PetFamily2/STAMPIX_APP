import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  POS_REDEMPTION_CELEBRATION_DURATION_MS,
  shouldAnimatePosRedemptionCelebration,
  shouldAnimateRewardReadyCue,
} from '../scanner/posCelebration';

const scannerSource = readFileSync(
  'app/(authenticated)/(business)/scanner.tsx',
  'utf8'
);
const celebrationSource = readFileSync(
  'components/scanner/PosRedemptionCelebration.tsx',
  'utf8'
);
const rewardReadyCueSource = readFileSync(
  'components/scanner/RewardReadyCue.tsx',
  'utf8'
);

describe('cashier redemption celebration', () => {
  test('uses a short non-blocking POS overlay', () => {
    expect(POS_REDEMPTION_CELEBRATION_DURATION_MS).toBeGreaterThanOrEqual(800);
    expect(POS_REDEMPTION_CELEBRATION_DURATION_MS).toBeLessThanOrEqual(1_500);
    expect(celebrationSource).toContain('pointerEvents="none"');
    expect(celebrationSource).toContain('ההטבה מומשה!');
    expect(scannerSource).toContain(
      'onComplete={handlePosCelebrationComplete}'
    );
    expect(scannerSource).toContain('setPosRedemptionCelebration(null)');
  });

  test('reduce motion keeps the premium state without particle motion', () => {
    expect(shouldAnimatePosRedemptionCelebration(false)).toBe(true);
    expect(shouldAnimatePosRedemptionCelebration(true)).toBe(false);
    expect(celebrationSource).toContain(
      'AccessibilityInfo.isReduceMotionEnabled()'
    );
    expect(celebrationSource).toContain('reduceMotion === false');
  });

  test('only authoritative redemption triggers celebration feedback', () => {
    const commitSuccess = scannerSource.slice(
      scannerSource.indexOf('const result = guardedResult.value'),
      scannerSource.indexOf("track(ANALYTICS_EVENTS.stampSuccess")
    );

    expect(commitSuccess).toContain("session.actionMode === 'stamp'");
    expect(commitSuccess).toContain('playPunchSuccessFeedback');
    expect(commitSuccess).toContain(
      'playRedemptionCelebrationFeedback(eventKey)'
    );
    expect(commitSuccess.indexOf('playPunchSuccessFeedback')).toBeLessThan(
      commitSuccess.indexOf('playRedemptionCelebrationFeedback')
    );
    expect(scannerSource).toContain(
      'celebratedPosRedemptionIdsRef.current.has(eventKey)'
    );
  });

  test('final stamp readiness does not trigger the redemption celebration', () => {
    const postStampOffer = scannerSource.slice(
      scannerSource.indexOf(
        "session.actionMode === 'stamp' &&\n          result.canRedeemNow"
      ),
      scannerSource.indexOf(
        "dispatch({ type: 'SHOW_SUCCESS', result: transactionResult })"
      )
    );

    expect(postStampOffer).toContain(
      "commitTarget: 'completed_stamp_redemption'"
    );
    expect(postStampOffer).toContain(
      "type: 'SHOW_REDEEM_CONFIRMATION'"
    );
    expect(postStampOffer).not.toContain(
      'playRedemptionCelebrationFeedback'
    );
    expect(postStampOffer).not.toContain('setPosRedemptionCelebration');
    expect(scannerSource).toContain('<RewardReadyCue />');
    expect(rewardReadyCueSource).toContain('playSubtleConfirmationHaptic()');
    expect(rewardReadyCueSource).not.toContain(
      'playRedemptionCelebrationFeedback'
    );
    expect(shouldAnimateRewardReadyCue(false)).toBe(true);
    expect(shouldAnimateRewardReadyCue(true)).toBe(false);
    expect(rewardReadyCueSource).not.toContain('I18nManager');
  });
});
