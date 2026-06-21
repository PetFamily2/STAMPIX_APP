import { describe, expect, test } from 'bun:test';

import {
  countActiveCampaignsForBusiness,
  countsTowardCampaignDefinitions,
  countsTowardRecurringLiveLimit,
  countsTowardReferralCampaignQuota,
} from '../entitlements';

function buildCountingCtx({ campaigns = [], referralConfig = undefined } = {}) {
  return {
    db: {
      query: (tableName) => {
        const rows =
          tableName === 'campaigns'
            ? campaigns
            : tableName === 'referralConfigs' && referralConfig !== undefined
              ? [referralConfig]
              : [];
        const chain = {
          withIndex: () => chain,
          filter: () => chain,
          collect: async () => rows,
          first: async () => rows[0] ?? null,
        };
        return chain;
      },
    },
  };
}

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

  test('active campaign quota count includes regular active campaigns and enabled referral once', async () => {
    const campaigns = [
      { _id: 'campaign_1', isActive: true, activationStatus: 'active' },
      { _id: 'campaign_2', isActive: true, activationStatus: 'draft' },
      { _id: 'campaign_3', isActive: true, activationStatus: 'completed' },
      { _id: 'campaign_4', isActive: false, activationStatus: 'active' },
    ];

    expect(countsTowardReferralCampaignQuota({ isEnabled: true })).toBe(true);

    await expect(
      countActiveCampaignsForBusiness(
        buildCountingCtx({
          campaigns,
          referralConfig: { isEnabled: true },
        }),
        'business_1'
      )
    ).resolves.toBe(3);
  });

  test('missing referral config counts as one slot because default referral config is enabled', async () => {
    expect(countsTowardReferralCampaignQuota(null)).toBe(true);

    await expect(
      countActiveCampaignsForBusiness(buildCountingCtx(), 'business_1')
    ).resolves.toBe(1);
  });

  test('disabled referral campaign does not count toward active campaign quota', async () => {
    const campaigns = [
      { _id: 'campaign_1', isActive: true, activationStatus: 'active' },
    ];

    expect(countsTowardReferralCampaignQuota({ isEnabled: false })).toBe(false);

    await expect(
      countActiveCampaignsForBusiness(
        buildCountingCtx({
          campaigns,
          referralConfig: { isEnabled: false },
        }),
        'business_1'
      )
    ).resolves.toBe(1);
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
