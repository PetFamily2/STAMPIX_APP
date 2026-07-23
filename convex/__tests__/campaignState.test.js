import { describe, expect, test } from 'bun:test';

import { classifyCampaignState } from '../lib/campaignState';
import { buildCampaignLifecycleFactValue } from '../recommendations';

const NOW = 1_800_000_000_000;

function campaign(id, overrides = {}) {
  return {
    _id: id,
    isActive: true,
    status: 'draft',
    activationStatus: 'draft',
    automationEnabled: false,
    schedule: { mode: 'send_now' },
    createdAt: NOW - 10_000,
    updatedAt: NOW - 5_000,
    ...overrides,
  };
}

function classify(overrides, hasPersistedCompletionEvidence = false) {
  return classifyCampaignState(campaign('campaign_1', overrides), {
    now: NOW,
    hasPersistedCompletionEvidence,
  });
}

describe('canonical campaign product state', () => {
  test('classifies editable drafts without active scheduling', () => {
    expect(classify({}).state).toBe('draft');
  });

  test('classifies deliberately paused campaigns as existing but not active', () => {
    const result = classify({
      status: 'paused',
      activationStatus: 'paused',
    });

    expect(result.state).toBe('paused');
    expect(result.isExisting).toBe(true);
    expect(result.isMeaningfullyActive).toBe(false);
  });

  test('classifies a valid future one-time schedule as meaningfully active', () => {
    const result = classify({
      status: 'active',
      activationStatus: 'active',
      schedule: {
        mode: 'one_time',
        sendAt: NOW + 60_000,
        nextRunAt: NOW + 60_000,
      },
    });

    expect(result.state).toBe('scheduled');
    expect(result.scheduledAt).toBe(NOW + 60_000);
    expect(result.isMeaningfullyActive).toBe(true);
  });

  test('classifies enabled recurring and legacy automation as active recurrence', () => {
    expect(
      classify({
        status: 'active',
        activationStatus: 'active',
        automationEnabled: true,
        schedule: { mode: 'recurring' },
      }).state
    ).toBe('recurring');

    const legacy = classify({
      status: 'active',
      activationStatus: undefined,
      automationEnabled: true,
      schedule: undefined,
    });
    expect(legacy.state).toBe('recurring');
    expect(legacy.reasonCode).toBe('LEGACY_AUTOMATION_WITHOUT_SCHEDULE');
  });

  test('requires durable run evidence for an explicitly completed campaign', () => {
    const completedFields = {
      status: 'completed',
      activationStatus: 'completed',
    };

    expect(classify(completedFields).state).toBe('inconsistent');
    expect(classify(completedFields, true).state).toBe('completed');
  });

  test('uses a persisted manual send as completed evidence', () => {
    expect(
      classify(
        {
          status: 'active',
          activationStatus: 'active',
          schedule: { mode: 'send_now' },
        },
        true
      ).state
    ).toBe('completed');
  });

  test('classifies canonical inactive archival independently of stale status', () => {
    const result = classify({
      isActive: false,
      status: 'active',
      activationStatus: 'active',
      archivedAt: NOW - 1_000,
    });

    expect(result.state).toBe('archived');
    expect(result.isExisting).toBe(false);
  });

  test('invalid schedules and conflicting lifecycle fields are inconsistent', () => {
    expect(
      classify({
        status: 'active',
        activationStatus: 'active',
        schedule: {
          mode: 'one_time',
          sendAt: NOW - 1,
          nextRunAt: NOW - 1,
        },
      }).state
    ).toBe('inconsistent');

    expect(
      classify({
        status: 'draft',
        activationStatus: 'active',
      }).state
    ).toBe('inconsistent');
  });
});

describe('bounded campaign lifecycle facts', () => {
  test('empty campaigns return known zero lifecycle counts', () => {
    expect(
      buildCampaignLifecycleFactValue({
        campaigns: [],
        campaignRuns: [],
        now: NOW,
      })
    ).toEqual({
      totalNonarchivedCampaigns: 0,
      draftCount: 0,
      scheduledCount: 0,
      recurringCount: 0,
      pausedCount: 0,
      completedCount: 0,
      inconsistentCount: 0,
      meaningfullyActiveCount: 0,
      firstDraftCampaignId: null,
      firstPausedCampaignId: null,
      firstScheduledCampaignId: null,
      firstRecurringCampaignId: null,
      nextScheduled: null,
      lifecycleSourceVersion: 'campaign-state-v1',
    });
  });

  test('several drafts and paused-only sets remain existing without becoming active', () => {
    const result = buildCampaignLifecycleFactValue({
      campaigns: [
        campaign('draft_1'),
        campaign('draft_2', { updatedAt: NOW - 100 }),
        campaign('paused_1', {
          status: 'paused',
          activationStatus: 'paused',
        }),
      ],
      campaignRuns: [],
      now: NOW,
    });

    expect(result.totalNonarchivedCampaigns).toBe(3);
    expect(result.draftCount).toBe(2);
    expect(result.pausedCount).toBe(1);
    expect(result.meaningfullyActiveCount).toBe(0);
  });

  test('multiple schedules select the earliest future campaign', () => {
    const result = buildCampaignLifecycleFactValue({
      campaigns: [
        campaign('scheduled_later', {
          status: 'active',
          activationStatus: 'active',
          schedule: { mode: 'one_time', sendAt: NOW + 120_000 },
        }),
        campaign('scheduled_next', {
          status: 'active',
          activationStatus: 'active',
          schedule: { mode: 'one_time', sendAt: NOW + 60_000 },
        }),
      ],
      campaignRuns: [],
      now: NOW,
    });

    expect(result.scheduledCount).toBe(2);
    expect(result.meaningfullyActiveCount).toBe(2);
    expect(result.firstScheduledCampaignId).toBe('scheduled_next');
    expect(result.nextScheduled).toEqual({
      campaignId: 'scheduled_next',
      timestamp: NOW + 60_000,
    });
  });

  test('manual, recurring, completed, archived, and inconsistent rows stay separate', () => {
    const result = buildCampaignLifecycleFactValue({
      campaigns: [
        campaign('manual_completed', {
          status: 'active',
          activationStatus: 'active',
        }),
        campaign('recurring_1', {
          status: 'active',
          activationStatus: 'active',
          automationEnabled: true,
          schedule: { mode: 'recurring' },
        }),
        campaign('recurring_2', {
          status: 'active',
          activationStatus: 'active',
          automationEnabled: true,
          schedule: { mode: 'recurring' },
        }),
        campaign('archived_1', {
          isActive: false,
          status: 'active',
          activationStatus: 'active',
        }),
        campaign('inconsistent_1', {
          status: 'draft',
          activationStatus: 'active',
        }),
      ],
      campaignRuns: [{ campaignId: 'manual_completed' }],
      now: NOW,
    });

    expect(result.recurringCount).toBe(2);
    expect(result.completedCount).toBe(1);
    expect(result.inconsistentCount).toBe(1);
    expect(result.meaningfullyActiveCount).toBe(2);
    expect(result.totalNonarchivedCampaigns).toBe(4);
  });

  test('quota placeholders cannot alter lifecycle counts or active meaning', () => {
    const factsInput = {
      campaigns: [
        campaign('scheduled_1', {
          status: 'active',
          activationStatus: 'active',
          schedule: { mode: 'one_time', sendAt: NOW + 60_000 },
        }),
        campaign('paused_1', {
          status: 'paused',
          activationStatus: 'paused',
        }),
      ],
      campaignRuns: [],
      now: NOW,
    };
    const baseline = buildCampaignLifecycleFactValue(factsInput);
    const withUnrelatedQuotaPlaceholder = buildCampaignLifecycleFactValue({
      ...factsInput,
      activeManagementCampaignsUsed: 0,
      referralCampaignsRemaining: 999,
    });

    expect(withUnrelatedQuotaPlaceholder).toEqual(baseline);
    expect(withUnrelatedQuotaPlaceholder.totalNonarchivedCampaigns).toBe(2);
    expect(withUnrelatedQuotaPlaceholder.meaningfullyActiveCount).toBe(1);
    expect(withUnrelatedQuotaPlaceholder).not.toHaveProperty(
      'campaignDefinitionUsage'
    );
  });
});
