import { describe, expect, test } from 'bun:test';
import { buildLegacyRetentionCutoverPatch } from '../migrations/cutoverLegacyRetentionActions';

describe('cutoverLegacyRetentionActions migration helper', () => {
  test('ignores non-retention campaigns', () => {
    const result = buildLegacyRetentionCutoverPatch(
      { type: 'promo', status: 'active' },
      1000,
      true
    );

    expect(result.isRetentionAction).toBe(false);
    expect(result.patch).toBeNull();
  });

  test('marks and pauses active recurring retention actions', () => {
    const result = buildLegacyRetentionCutoverPatch(
      {
        type: 'retention_action',
        status: 'active',
        automationEnabled: true,
        sourceContext: {},
        schedule: { mode: 'recurring', nextRunAt: 5555 },
      },
      12345,
      true
    );

    expect(result.isRetentionAction).toBe(true);
    expect(result.isAlreadyDisabled).toBe(false);
    expect(result.shouldPause).toBe(true);
    expect(result.patch?.sourceContext?.legacyAutomationDisabled).toBe(true);
    expect(result.patch?.status).toBe('paused');
    expect(result.patch?.activationStatus).toBe('paused');
    expect(result.patch?.automationEnabled).toBe(false);
    expect(result.patch?.schedule?.mode).toBe('send_now');
  });

  test('keeps already-disabled campaigns unchanged when pause is not needed', () => {
    const result = buildLegacyRetentionCutoverPatch(
      {
        type: 'retention_action',
        status: 'paused',
        automationEnabled: false,
        sourceContext: { legacyAutomationDisabled: true },
      },
      12345,
      true
    );

    expect(result.isRetentionAction).toBe(true);
    expect(result.isAlreadyDisabled).toBe(true);
    expect(result.shouldPause).toBe(false);
    expect(result.patch).toBeNull();
  });
});
