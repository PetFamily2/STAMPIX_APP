import { describe, expect, test } from 'bun:test';
import { isLegacyRetentionAutomationDisabled } from '../retention';

describe('legacy retention cutover marker', () => {
  test('returns true only when legacyAutomationDisabled flag is explicitly true', () => {
    expect(isLegacyRetentionAutomationDisabled(null)).toBe(false);
    expect(isLegacyRetentionAutomationDisabled(undefined)).toBe(false);
    expect(isLegacyRetentionAutomationDisabled({})).toBe(false);
    expect(
      isLegacyRetentionAutomationDisabled({
        legacyAutomationDisabled: false,
      })
    ).toBe(false);
    expect(
      isLegacyRetentionAutomationDisabled({
        legacyAutomationDisabled: true,
      })
    ).toBe(true);
  });
});
