import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  campaignConsumesQuota,
  countActiveCampaignsForBusiness,
  countsTowardRecurringLiveLimit,
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
  test('only active management campaigns consume quota', () => {
    expect(
      campaignConsumesQuota({
        kind: 'management',
        campaign: {
          isActive: true,
          activationStatus: 'active',
        },
      })
    ).toBe(true);
    for (const activationStatus of [
      'draft',
      'paused',
      'completed',
      'archived',
    ]) {
      expect(
        campaignConsumesQuota({
          kind: 'management',
          campaign: { isActive: true, activationStatus },
        })
      ).toBe(false);
    }
    expect(
      campaignConsumesQuota({
        kind: 'management',
        campaign: {
          isActive: false,
          activationStatus: 'active',
        },
      })
    ).toBe(false);
  });

  test('zero active campaigns plus drafts and archives reports zero usage', async () => {
    await expect(
      countActiveCampaignsForBusiness(
        buildCountingCtx({
          campaigns: [
            { isActive: true, activationStatus: 'draft' },
            { isActive: true, activationStatus: 'paused' },
            { isActive: false, activationStatus: 'archived' },
          ],
        }),
        'business_1'
      )
    ).resolves.toBe(0);
  });

  test('N active management campaigns reports N usage', async () => {
    const campaigns = [
      {
        isActive: true,
        activationStatus: 'active',
      },
      {
        isActive: true,
        activationStatus: 'active',
      },
    ];
    await expect(
      countActiveCampaignsForBusiness(
        buildCountingCtx({ campaigns }),
        'business_1'
      )
    ).resolves.toBe(2);
  });

  test('enabled C2C referral consumes exactly one additional campaign slot', async () => {
    expect(
      campaignConsumesQuota({
        kind: 'customer_referral',
        config: { isEnabled: true },
      })
    ).toBe(true);

    await expect(
      countActiveCampaignsForBusiness(
        buildCountingCtx({
          campaigns: [{ isActive: true, activationStatus: 'active' }],
          referralConfig: { isEnabled: true },
        }),
        'business_1'
      )
    ).resolves.toBe(2);
  });

  test('B2B business invitations never consume campaign quota', () => {
    expect(campaignConsumesQuota({ kind: 'business_referral' })).toBe(false);
  });

  test('archive, deactivate, and disabling C2C release their slots', () => {
    expect(
      campaignConsumesQuota({
        kind: 'management',
        campaign: { isActive: false, activationStatus: 'archived' },
      })
    ).toBe(false);
    expect(
      campaignConsumesQuota({
        kind: 'management',
        campaign: { isActive: true, activationStatus: 'paused' },
      })
    ).toBe(false);
    expect(
      campaignConsumesQuota({
        kind: 'customer_referral',
        config: { isEnabled: false },
      })
    ).toBe(false);
  });

  test('draft creation and restore do not reserve quota; activation does', () => {
    const source = readFileSync('convex/campaigns.ts', 'utf8');
    const createSource = source.slice(
      source.indexOf('export const createCampaignDraft'),
      source.indexOf('export const setCampaignAutomationEnabled')
    );
    const restoreSource = source.slice(
      source.indexOf('export const restoreManagementCampaign'),
      source.indexOf('export const updateCampaignDraft')
    );
    const activationSource = source.slice(
      source.indexOf('export const setCampaignAutomationEnabled'),
      source.indexOf('export const clearCampaignOneTimeSchedule')
    );

    expect(createSource).not.toContain('assertCampaignCapacity');
    expect(restoreSource).not.toContain('assertCampaignCapacity');
    expect(activationSource).toContain('assertCampaignCapacity');
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
