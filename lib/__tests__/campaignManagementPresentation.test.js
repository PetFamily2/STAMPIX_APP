import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_CAMPAIGN_MANAGEMENT_VISUAL_META,
  resolveCampaignManagementVisualMeta,
} from '../campaigns/managementPresentation';

describe('campaign management visual presentation', () => {
  test('resolves every supported campaign type including C2C referral', () => {
    for (const type of [
      'welcome',
      'birthday',
      'anniversary',
      'winback',
      'promo',
      'referral',
    ]) {
      const meta = resolveCampaignManagementVisualMeta(type);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.icon.length).toBeGreaterThan(0);
      expect(meta.iconColor).toMatch(/^#/);
      expect(meta.iconBackground).toMatch(/^#/);
    }
  });

  test('uses the canonical promo visual for missing and legacy values', () => {
    for (const malformedType of [
      undefined,
      null,
      '',
      'legacy_campaign',
      'toString',
      { type: 'promo' },
    ]) {
      expect(resolveCampaignManagementVisualMeta(malformedType)).toEqual(
        DEFAULT_CAMPAIGN_MANAGEMENT_VISUAL_META
      );
    }
  });
});
