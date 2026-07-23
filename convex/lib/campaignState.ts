export const CAMPAIGN_LIFECYCLE_SOURCE_VERSION = 'campaign-state-v1' as const;

export type CampaignProductState =
  | 'draft'
  | 'scheduled'
  | 'recurring'
  | 'paused'
  | 'completed'
  | 'archived'
  | 'inconsistent';

type StoredCampaignLifecycle =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived';

type CampaignScheduleMode = 'send_now' | 'one_time' | 'recurring';

export type CampaignStateInput = {
  isActive?: unknown;
  archivedAt?: unknown;
  status?: unknown;
  activationStatus?: unknown;
  automationEnabled?: unknown;
  schedule?: unknown;
};

export type CampaignStateResult = {
  state: CampaignProductState;
  isMeaningfullyActive: boolean;
  isExisting: boolean;
  scheduledAt: number | null;
  sourceVersion: typeof CAMPAIGN_LIFECYCLE_SOURCE_VERSION;
  reasonCode: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeLifecycle(value: unknown): StoredCampaignLifecycle | null {
  if (
    value === 'draft' ||
    value === 'active' ||
    value === 'paused' ||
    value === 'completed' ||
    value === 'archived'
  ) {
    return value;
  }
  return null;
}

function normalizeScheduleMode(value: unknown): CampaignScheduleMode | null {
  if (value === 'send_now' || value === 'one_time' || value === 'recurring') {
    return value;
  }
  return null;
}

function buildResult(
  state: CampaignProductState,
  options?: {
    scheduledAt?: number | null;
    reasonCode?: string | null;
  }
): CampaignStateResult {
  return {
    state,
    isMeaningfullyActive: state === 'scheduled' || state === 'recurring',
    isExisting: state !== 'archived',
    scheduledAt: options?.scheduledAt ?? null,
    sourceVersion: CAMPAIGN_LIFECYCLE_SOURCE_VERSION,
    reasonCode: options?.reasonCode ?? null,
  };
}

export function classifyCampaignState(
  campaign: CampaignStateInput,
  options: {
    now: number;
    hasPersistedCompletionEvidence?: boolean;
  }
): CampaignStateResult {
  if (campaign.isActive !== true) {
    return buildResult('archived');
  }

  const activationLifecycle = normalizeLifecycle(campaign.activationStatus);
  const legacyLifecycle = normalizeLifecycle(campaign.status);

  if (
    campaign.activationStatus !== undefined &&
    activationLifecycle === null
  ) {
    return buildResult('inconsistent', {
      reasonCode: 'INVALID_ACTIVATION_STATUS',
    });
  }
  if (campaign.status !== undefined && legacyLifecycle === null) {
    return buildResult('inconsistent', {
      reasonCode: 'INVALID_LEGACY_STATUS',
    });
  }
  if (
    activationLifecycle !== null &&
    legacyLifecycle !== null &&
    activationLifecycle !== legacyLifecycle
  ) {
    return buildResult('inconsistent', {
      reasonCode: 'CONFLICTING_LIFECYCLE_FIELDS',
    });
  }

  const lifecycle = activationLifecycle ?? legacyLifecycle;
  if (lifecycle === null) {
    return buildResult('inconsistent', {
      reasonCode: 'MISSING_LIFECYCLE',
    });
  }
  if (lifecycle === 'archived' || Number.isFinite(campaign.archivedAt)) {
    return buildResult('inconsistent', {
      reasonCode: 'ACTIVE_ROW_MARKED_ARCHIVED',
    });
  }

  const schedule = isRecord(campaign.schedule) ? campaign.schedule : null;
  if (campaign.schedule !== undefined && schedule === null) {
    return buildResult('inconsistent', {
      reasonCode: 'INVALID_SCHEDULE',
    });
  }
  const scheduleMode = normalizeScheduleMode(schedule?.mode);
  if (schedule?.mode !== undefined && scheduleMode === null) {
    return buildResult('inconsistent', {
      reasonCode: 'INVALID_SCHEDULE_MODE',
    });
  }

  const automationEnabled = campaign.automationEnabled === true;
  const hasPersistedCompletionEvidence =
    options.hasPersistedCompletionEvidence === true;

  if (lifecycle === 'completed') {
    if (automationEnabled || !hasPersistedCompletionEvidence) {
      return buildResult('inconsistent', {
        reasonCode: automationEnabled
          ? 'COMPLETED_AUTOMATION_ENABLED'
          : 'COMPLETED_WITHOUT_PERSISTED_RUN',
      });
    }
    return buildResult('completed');
  }

  if (lifecycle === 'paused') {
    if (automationEnabled) {
      return buildResult('inconsistent', {
        reasonCode: 'PAUSED_AUTOMATION_ENABLED',
      });
    }
    return buildResult('paused');
  }

  if (lifecycle === 'draft') {
    if (automationEnabled) {
      return buildResult('inconsistent', {
        reasonCode: 'DRAFT_AUTOMATION_ENABLED',
      });
    }
    if (scheduleMode === 'one_time' || scheduleMode === 'recurring') {
      return buildResult('inconsistent', {
        reasonCode: 'DRAFT_HAS_ACTIVE_SCHEDULE',
      });
    }
    if (hasPersistedCompletionEvidence) {
      return buildResult('completed');
    }
    return buildResult('draft');
  }

  if (scheduleMode === 'one_time') {
    const sendAt = schedule?.sendAt;
    const nextRunAt = schedule?.nextRunAt;
    if (
      automationEnabled ||
      !Number.isFinite(sendAt) ||
      Number(sendAt) <= options.now ||
      (nextRunAt !== undefined &&
        (!Number.isFinite(nextRunAt) || Number(nextRunAt) <= options.now))
    ) {
      return buildResult('inconsistent', {
        reasonCode: 'INVALID_ONE_TIME_SCHEDULE',
      });
    }
    return buildResult('scheduled', { scheduledAt: Number(sendAt) });
  }

  if (scheduleMode === 'recurring') {
    if (!automationEnabled) {
      return buildResult('inconsistent', {
        reasonCode: 'RECURRING_AUTOMATION_DISABLED',
      });
    }
    return buildResult('recurring');
  }

  if (scheduleMode === null && automationEnabled) {
    return buildResult('recurring', {
      reasonCode: 'LEGACY_AUTOMATION_WITHOUT_SCHEDULE',
    });
  }

  if (scheduleMode === 'send_now' && automationEnabled) {
    return buildResult('inconsistent', {
      reasonCode: 'SEND_NOW_AUTOMATION_ENABLED',
    });
  }

  if (hasPersistedCompletionEvidence) {
    return buildResult('completed');
  }

  return buildResult('inconsistent', {
    reasonCode: 'ACTIVE_WITHOUT_EXECUTION_MODE',
  });
}
