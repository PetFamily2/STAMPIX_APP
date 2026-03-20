import { describe, expect, test } from 'bun:test';

import {
  countsTowardCampaignDefinitions,
  countsTowardRecurringLiveLimit,
} from '../entitlements';

describe('campaign counting rules for entitlement limits', () => {
  test('campaign definitions count active draft/active/paused and ignore completed/archived', () => {
    expect(
      countsTowardCampaignDefinitions({
        isActive: true,
        activationStatus: 'draft',
      })
    ).toBe(true);
    expect(
      countsTowardCampaignDefinitions({
        isActive: true,
        activationStatus: 'active',
      })
    ).toBe(true);
    expect(
      countsTowardCampaignDefinitions({
        isActive: true,
        activationStatus: 'paused',
      })
    ).toBe(true);
    expect(
      countsTowardCampaignDefinitions({
        isActive: true,
        activationStatus: 'completed',
      })
    ).toBe(false);
    expect(
      countsTowardCampaignDefinitions({
        isActive: true,
        activationStatus: 'archived',
      })
    ).toBe(false);
    expect(
      countsTowardCampaignDefinitions({
        isActive: false,
        activationStatus: 'active',
      })
    ).toBe(false);
  });

  test('recurring live limit counts only active recurring/legacy recurring campaigns', () => {
    expect(
      countsTowardRecurringLiveLimit({
        isActive: true,
        activationStatus: 'active',
        schedule: { mode: 'recurring' },
      })
    ).toBe(true);

    expect(
      countsTowardRecurringLiveLimit({
        isActive: true,
        activationStatus: 'paused',
        schedule: { mode: 'recurring' },
      })
    ).toBe(false);

    expect(
      countsTowardRecurringLiveLimit({
        isActive: true,
        activationStatus: 'active',
        schedule: { mode: 'one_time' },
      })
    ).toBe(false);

    expect(
      countsTowardRecurringLiveLimit({
        isActive: true,
        type: 'retention_action',
        status: 'active',
      })
    ).toBe(true);

    expect(
      countsTowardRecurringLiveLimit({
        isActive: true,
        type: 'promo',
        activationStatus: 'active',
        automationEnabled: true,
      })
    ).toBe(true);

    expect(
      countsTowardRecurringLiveLimit({
        isActive: true,
        type: 'ai_marketing',
        activationStatus: 'active',
        automationEnabled: true,
      })
    ).toBe(false);
  });
});
