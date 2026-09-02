import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export const SMART_MANAGER_POLICY_SCHEMA_VERSION = 1;
export const SMART_MANAGER_POLICY_V1_VERSION = 'smart-manager-policy-v1';

export type SmartManagerRecommendationClass =
  | 'setup'
  | 'operational'
  | 'growth'
  | 'default';

export type SmartManagerPolicyConfig = {
  recipientContactCooldownDays: number;
  equivalentActionCooldownDays: number;
  campaignSpacingHours: number;
  allowedSendWindow: {
    startHourLocal: number;
    endHourLocal: number;
    defaultSuggestionHourLocal: number;
  };
  recipientCeiling: number;
  aiGeneration: {
    minimumAudienceForFreshGeneration: number;
  };
  actionExpiryHours: number;
  approvalExpiryHours: number;
  delivery: {
    batchSize: number;
    leaseMinutes: number;
    maximumAttempts: number;
    retryBackoffMinutes: number[];
  };
  outcomeWindowDays: number;
  evaluationRefreshHours: number;
  interactions: Record<
    SmartManagerRecommendationClass,
    {
      snoozeDays: number;
      dismissal:
        | { mode: 'evidence_bound' }
        | { mode: 'timed'; days: number };
    }
  >;
  celebration: {
    autoPresentHours: number;
    reopenDays: number;
    retentionDays: number;
  };
};

// This is the only V1 seed definition. Values are policy data, not product
// constants; activating different values requires a new immutable version.
export const SMART_MANAGER_POLICY_V1: SmartManagerPolicyConfig = {
  recipientContactCooldownDays: 14,
  equivalentActionCooldownDays: 14,
  campaignSpacingHours: 24,
  allowedSendWindow: {
    startHourLocal: 9,
    endHourLocal: 21,
    defaultSuggestionHourLocal: 10,
  },
  recipientCeiling: 10_000,
  aiGeneration: {
    minimumAudienceForFreshGeneration: 5,
  },
  actionExpiryHours: 24,
  approvalExpiryHours: 24,
  delivery: {
    batchSize: 100,
    leaseMinutes: 5,
    maximumAttempts: 5,
    retryBackoffMinutes: [1, 5, 30, 120, 720],
  },
  outcomeWindowDays: 14,
  evaluationRefreshHours: 24,
  interactions: {
    setup: {
      snoozeDays: 7,
      dismissal: { mode: 'timed', days: 30 },
    },
    operational: {
      snoozeDays: 1,
      dismissal: { mode: 'evidence_bound' },
    },
    growth: {
      snoozeDays: 7,
      dismissal: { mode: 'timed', days: 30 },
    },
    default: {
      snoozeDays: 7,
      dismissal: { mode: 'timed', days: 14 },
    },
  },
  celebration: {
    autoPresentHours: 24,
    reopenDays: 7,
    retentionDays: 30,
  },
};

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

export function hashSmartManagerValue(value: unknown) {
  const input = stableSerialize(value);
  const digest = sha256(new TextEncoder().encode(input));
  return `sm_sha256_${bytesToHex(digest)}`;
}

export const SMART_MANAGER_POLICY_V1_HASH = hashSmartManagerValue({
  schemaVersion: SMART_MANAGER_POLICY_SCHEMA_VERSION,
  version: SMART_MANAGER_POLICY_V1_VERSION,
  config: SMART_MANAGER_POLICY_V1,
});

export async function loadActiveSmartManagerPolicy(
  ctx: any,
  now = Date.now()
) {
  const policy = await ctx.db
    .query('smartManagerPolicyVersions')
    .withIndex('by_effectiveFrom', (q: any) => q.lte('effectiveFrom', now))
    .order('desc')
    .first();
  if (!policy) {
    return {
      version: SMART_MANAGER_POLICY_V1_VERSION,
      schemaVersion: SMART_MANAGER_POLICY_SCHEMA_VERSION,
      policyHash: SMART_MANAGER_POLICY_V1_HASH,
      config: SMART_MANAGER_POLICY_V1,
    };
  }
  const expectedHash = hashSmartManagerValue({
    schemaVersion: policy.schemaVersion,
    version: policy.version,
    config: policy.config,
  });
  if (policy.policyHash !== expectedHash) {
    throw new Error('SMART_MANAGER_POLICY_HASH_MISMATCH');
  }
  return {
    version: policy.version,
    schemaVersion: policy.schemaVersion,
    policyHash: policy.policyHash,
    config: policy.config as SmartManagerPolicyConfig,
  };
}

const SETUP_STABLE_IDS = new Set([
  'setup.address.resolve',
  'setup.profile.complete',
  'program.publish_first',
  'program.publish_draft',
  'campaign.create_first',
  'campaign.publish_draft',
]);
const OPERATIONAL_STABLE_IDS = new Set([
  'subscription.action_required',
  'campaign.resume_paused',
  'campaign.next_scheduled',
  'team.pending_invitations',
]);
const GROWTH_STABLE_IDS = new Set([
  'retention.reengage_inactive',
  'growth.near_reward',
]);

export function classifySmartManagerRecommendation(
  stableId: string
): SmartManagerRecommendationClass {
  if (SETUP_STABLE_IDS.has(stableId)) {
    return 'setup';
  }
  if (OPERATIONAL_STABLE_IDS.has(stableId)) {
    return 'operational';
  }
  if (GROWTH_STABLE_IDS.has(stableId)) {
    return 'growth';
  }
  return 'default';
}

export function getSmartManagerInteractionPolicy(
  stableId: string,
  action: 'dismiss' | 'snooze',
  now: number,
  policy = SMART_MANAGER_POLICY_V1
) {
  const recommendationClass = classifySmartManagerRecommendation(stableId);
  const duration = policy.interactions[recommendationClass];
  const hiddenUntil =
    action === 'dismiss'
      ? duration.dismissal.mode === 'evidence_bound'
        ? undefined
        : now + duration.dismissal.days * 24 * 60 * 60 * 1000
      : now + duration.snoozeDays * 24 * 60 * 60 * 1000;
  return {
    hiddenUntil,
    reasonCode:
      action === 'dismiss'
        ? ('USER_DISMISSED' as const)
        : ('USER_SNOOZED' as const),
  };
}
