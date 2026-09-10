import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  isRedemptionCelebrationForeground,
  rememberConsumedCelebration,
  shouldClaimRedemptionCelebration,
} from '../redemptionCelebrationDiscovery';

const hostSource = readFileSync(
  'components/customer/RedemptionCelebrationHost.tsx',
  'utf8'
);
const authenticatedLayoutSource = readFileSync(
  'app/(authenticated)/_layout.tsx',
  'utf8'
);
const customerLayoutSource = readFileSync(
  'app/(authenticated)/(customer)/_layout.tsx',
  'utf8'
);

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

  test('unknown app state is treated as foreground so an active session can claim', () => {
    expect(isRedemptionCelebrationForeground('unknown')).toBe(true);
    expect(isRedemptionCelebrationForeground('active')).toBe(true);
    expect(isRedemptionCelebrationForeground(null)).toBe(true);
    expect(
      shouldClaimRedemptionCelebration(
        { pending: true, newestConfirmedAt: 200 },
        null,
        'unknown'
      )
    ).toBe(true);
  });

  test('background and inactive states wait to claim until the app is usable', () => {
    expect(isRedemptionCelebrationForeground('background')).toBe(false);
    expect(isRedemptionCelebrationForeground('inactive')).toBe(false);
    expect(
      shouldClaimRedemptionCelebration(
        { pending: true, newestConfirmedAt: 200 },
        null,
        'background'
      )
    ).toBe(false);
  });
});

describe('customer celebration host recovery contracts', () => {
  test('one host covers customer routes including the QR and legacy card routes', () => {
    expect(authenticatedLayoutSource).toContain(
      "resolvedAppMode === 'customer'"
    );
    expect(authenticatedLayoutSource).toContain(
      '<RedemptionCelebrationHost />'
    );
    expect(authenticatedLayoutSource).toContain('style={styles.shell}');
    expect(customerLayoutSource).not.toContain(
      '<RedemptionCelebrationHost />'
    );
  });

  test('background discovery waits for a usable foreground and refreshes on return', () => {
    expect(hostSource).toContain('isRedemptionCelebrationForeground(appState)');
    expect(hostSource).toContain(
      'refreshGeneration: claimRetryGeneration'
    );
    expect(hostSource).toContain(
      '!isRedemptionCelebrationForeground(previousState) &&'
    );
    expect(hostSource).toContain(
      'isRedemptionCelebrationForeground(nextState)'
    );
    expect(hostSource).toContain(
      'currentClaim.claimExpiresAt <= Date.now()'
    );
    expect(hostSource).toContain("reason_code: 'foreground_refresh'");
    expect(hostSource).toContain(
      "reason_code: 'claim_blocked_not_foreground'"
    );
    expect(hostSource).toContain('api.redemptionReceipts');
    expect(hostSource).not.toContain('makeFunctionReference');
  });

  test('claim and acknowledgement failures have bounded recovery', () => {
    expect(hostSource).toContain('retryUsedForSignalRef.current');
    expect(hostSource).toContain('acknowledgeRetryUsedRef.current');
    expect(hostSource).toContain('claimLeaseRecoveryTimeoutRef.current');
    expect(hostSource).toContain("reason_code: 'claim_failed'");
    expect(hostSource).toContain("reason_code: 'claim_returned_none'");
    expect(hostSource).toContain("reason_code: 'acknowledge_failed'");
    expect(hostSource).toContain("reason_code: 'dismiss_acknowledge_failed'");
    const noneBranch = hostSource.slice(
      hostSource.indexOf("reason_code: 'claim_returned_none'"),
      hostSource.indexOf("reason_code: 'claim_failed'")
    );
    expect(noneBranch).toContain('retryUsedForSignalRef.current');
  });

  test('normal claim presents full-screen and feedback follows acknowledgement', () => {
    expect(hostSource).toContain('presentationStyle="fullScreen"');
    expect(hostSource).not.toContain('onShow=');
    expect(hostSource).toContain('handlePresentationVisible');
    expect(hostSource).toContain('if (claimedReceipt) {');
    expect(hostSource).toContain('handlePresentationVisible()');
    expect(hostSource.indexOf("acknowledgement?.status === 'presented'")).toBeLessThan(
      hostSource.indexOf(
        'playRedemptionCelebrationFeedback(claimedReceipt.claimToken)'
      )
    );
    expect(hostSource).not.toContain('I18nManager');
    expect(hostSource).not.toContain('forceRTL');
    expect(hostSource).not.toContain('allowRTL');
  });

  test('dismiss without a completed ack marks the receipt presented and does not replay feedback', () => {
    const closeFn = hostSource.slice(
      hostSource.indexOf('const handleClose'),
      hostSource.indexOf('const handleAuthorizeShare')
    );
    expect(closeFn).toContain('acknowledgePresentation');
    expect(closeFn).toContain('rememberConsumedCelebration');
    expect(closeFn).not.toContain('playRedemptionCelebrationFeedback');
  });

  test('safe lifecycle diagnostics exclude receipt and claim identifiers', () => {
    const diagnosticCalls =
      hostSource.match(
        /track\(ANALYTICS_EVENTS\.redemptionCelebrationLifecycle,[\s\S]*?\}\);/g
      ) ?? [];
    expect(diagnosticCalls.length).toBeGreaterThan(0);
    for (const call of diagnosticCalls) {
      expect(call).not.toMatch(/receiptToken|claimToken|customerName|qr/i);
    }
  });
});
