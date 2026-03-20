import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import {
  buildCustomerLifecycleSnapshotForBusiness,
  getCustomersForOpportunity,
  type RetentionOpportunityKey,
} from './customerLifecycle';
import {
  assertCampaignsNotOverLimit,
  assertEntitlement,
  countActiveCampaignsForBusiness,
  countActiveRetentionActionsForBusiness,
  getBusinessEntitlementsForBusinessId,
} from './entitlements';
import {
  requireActorIsBusinessOwnerOrManager,
  requireActorIsStaffForBusiness,
} from './guards';
import { sendPushNotificationToUser } from './pushNotifications';
import { resolveSegmentAudience } from './segments';

type RetentionTargetType =
  | 'at_risk'
  | 'near_reward'
  | 'vip'
  | 'new_customers'
  | 'saved_segment';

type RetentionTarget =
  | {
      targetType: Exclude<RetentionTargetType, 'saved_segment'>;
      segmentId?: never;
    }
  | { targetType: 'saved_segment'; segmentId: Id<'segments'> };

type RetentionActionStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived';

const RETENTION_TARGET_TYPE_UNION = v.union(
  v.literal('at_risk'),
  v.literal('near_reward'),
  v.literal('vip'),
  v.literal('new_customers'),
  v.literal('saved_segment')
);

const RETENTION_ACTION_STATUS_UNION = v.union(
  v.literal('draft'),
  v.literal('active'),
  v.literal('paused'),
  v.literal('completed'),
  v.literal('archived')
);

const ALLOWED_CHANNELS = new Set(['push', 'in_app']);
const ISRAEL_TIME_ZONE = 'Asia/Jerusalem';
const ISRAEL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: ISRAEL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const LEGACY_RETENTION_DISABLED_REASON = 'legacy_retention_disabled';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getDateTimePartsByFormatter(
  formatter: Intl.DateTimeFormat,
  timestamp: number
) {
  const raw = formatter.formatToParts(new Date(timestamp));
  const values = new Map<string, string>();
  for (const part of raw) {
    if (part.type !== 'literal') {
      values.set(part.type, part.value);
    }
  }
  return values;
}

function getIsraelHour(timestamp: number): number {
  const parts = getDateTimePartsByFormatter(
    ISRAEL_DATE_TIME_FORMATTER,
    timestamp
  );
  return Number(parts.get('hour') ?? 0);
}

function normalizeChannels(channels: string[] | undefined) {
  const requested =
    Array.isArray(channels) && channels.length > 0 ? channels : ['in_app'];
  const normalized = [
    ...new Set(requested.filter((channel) => ALLOWED_CHANNELS.has(channel))),
  ];
  if (normalized.length === 0) {
    return ['in_app'] as Array<'push' | 'in_app'>;
  }
  return normalized as Array<'push' | 'in_app'>;
}

function buildTargetLabel(target: RetentionTarget) {
  switch (target.targetType) {
    case 'at_risk':
      return 'Customers at risk';
    case 'near_reward':
      return 'Customers near reward';
    case 'vip':
      return 'VIP customers';
    case 'new_customers':
      return 'New customers';
    case 'saved_segment':
      return 'Saved segment';
    default:
      return 'Customers';
  }
}

function buildRetentionTarget(
  targetType: RetentionTargetType,
  segmentId: Id<'segments'> | undefined
): RetentionTarget {
  if (targetType === 'saved_segment') {
    if (!segmentId) {
      throw new Error('SEGMENT_ID_REQUIRED');
    }
    return { targetType, segmentId };
  }
  return { targetType };
}

function parseRetentionTargetFromRules(rules: unknown): RetentionTarget | null {
  if (!isRecord(rules)) {
    return null;
  }

  const targetType = rules.targetType;
  if (
    targetType !== 'at_risk' &&
    targetType !== 'near_reward' &&
    targetType !== 'vip' &&
    targetType !== 'new_customers' &&
    targetType !== 'saved_segment'
  ) {
    return null;
  }

  if (targetType === 'saved_segment') {
    const segmentId = rules.segmentId;
    if (!segmentId) {
      return null;
    }
    return {
      targetType,
      segmentId: segmentId as Id<'segments'>,
    };
  }

  return { targetType };
}

export function isLegacyRetentionAutomationDisabled(sourceContext: unknown) {
  if (!isRecord(sourceContext)) {
    return false;
  }
  return sourceContext.legacyAutomationDisabled === true;
}

function buildAiSuggestion(target: RetentionTarget, audienceCount: number) {
  switch (target.targetType) {
    case 'at_risk':
      return {
        title: 'AI suggestion: win back at-risk customers',
        messageTitle: 'We miss seeing you',
        messageBody: `We identified ${audienceCount} customers at risk. Send a short comeback message.`,
        prompt: 'Write a short retention message for at-risk customers.',
      };
    case 'near_reward':
      return {
        title: 'AI suggestion: push near-reward customers',
        messageTitle: 'You are close to your reward',
        messageBody: `${audienceCount} customers are close to reward completion. Remind them to come back soon.`,
        prompt:
          'Write a reward reminder for customers who are near reward completion.',
      };
    case 'vip':
      return {
        title: 'AI suggestion: thank your VIP customers',
        messageTitle: 'Thank you for being with us',
        messageBody: `${audienceCount} VIP customers were identified. Send a short appreciation message.`,
        prompt: 'Write a thank-you message for VIP customers.',
      };
    case 'new_customers':
      return {
        title: 'AI suggestion: welcome new customers',
        messageTitle: 'Welcome to our loyalty club',
        messageBody: `${audienceCount} new customers joined recently. Send a warm welcome message.`,
        prompt: 'Write a welcome message for newly joined customers.',
      };
    case 'saved_segment':
      return {
        title: 'AI suggestion: action for saved segment',
        messageTitle: 'A personalized update for you',
        messageBody: `Prepare a targeted message for this saved segment (${audienceCount} customers).`,
        prompt: 'Write a retention message for a saved customer segment.',
      };
    default:
      return {
        title: 'AI suggestion',
        messageTitle: 'New update',
        messageBody: 'Create a short retention message.',
        prompt: 'Write a retention message.',
      };
  }
}

async function resolveAudience(
  ctx: any,
  businessId: Id<'businesses'>,
  target: RetentionTarget
) {
  if (target.targetType === 'saved_segment') {
    const segmentAudience = await resolveSegmentAudience(
      ctx,
      businessId,
      target.segmentId
    );
    return {
      customers: segmentAudience.customers,
      rules: segmentAudience.rules,
      targetLabel: segmentAudience.segment.name,
    };
  }

  const snapshot = await buildCustomerLifecycleSnapshotForBusiness(
    ctx,
    businessId
  );
  return {
    customers: getCustomersForOpportunity(
      snapshot.customers,
      target.targetType
    ),
    rules: { targetType: target.targetType },
    targetLabel: buildTargetLabel(target),
  };
}

async function assertSavedSegmentAccessIfNeeded(
  ctx: any,
  businessId: Id<'businesses'>,
  targetType: RetentionTargetType
) {
  if (targetType !== 'saved_segment') {
    return;
  }
  await assertEntitlement(ctx, businessId, {
    featureKey: 'savedSegments',
  });
}

async function assertCampaignCapacity(ctx: any, businessId: Id<'businesses'>) {
  const activeCampaigns = await countActiveCampaignsForBusiness(
    ctx,
    businessId
  );
  await assertEntitlement(ctx, businessId, {
    limitKey: 'maxCampaigns',
    currentValue: activeCampaigns,
  });
}

function isCampaignLimitReachedError(error: unknown) {
  const payload = (error as { data?: any } | null)?.data;
  return (
    payload?.code === 'PLAN_LIMIT_REACHED' &&
    payload?.limitKey === 'maxCampaigns'
  );
}

async function assertRetentionActionCanBeActivated(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const activeCount = await countActiveRetentionActionsForBusiness(
    ctx,
    businessId
  );
  const entitlements = await assertEntitlement(ctx, businessId, {
    featureKey: 'marketingHub',
    limitKey: 'maxActiveRetentionActions',
    currentValue: activeCount,
  });
  return {
    activeCount,
    limit: entitlements.limits.maxActiveRetentionActions,
    planKey: entitlements.plan,
  };
}

async function getRetentionActionOrThrow(
  ctx: any,
  businessId: Id<'businesses'>,
  campaignId: Id<'campaigns'>
) {
  const campaign = await ctx.db.get(campaignId);
  if (
    !campaign ||
    String(campaign.businessId) !== String(businessId) ||
    campaign.type !== 'retention_action'
  ) {
    throw new Error('RETENTION_ACTION_NOT_FOUND');
  }
  return campaign;
}

type CreateRetentionActionArgs = {
  businessId: Id<'businesses'>;
  targetType: RetentionTargetType;
  segmentId?: Id<'segments'>;
  title: string;
  messageBody: string;
  channels?: string[];
};

async function createRetentionActionInternal(
  ctx: any,
  args: CreateRetentionActionArgs
) {
  const { businessId, targetType, segmentId, title, messageBody, channels } =
    args;

  await assertEntitlement(ctx, businessId, {
    featureKey: 'marketingHub',
  });
  await assertCampaignCapacity(ctx, businessId);
  await assertSavedSegmentAccessIfNeeded(ctx, businessId, targetType);

  const normalizedTitle = title.trim();
  const normalizedBody = messageBody.trim();
  if (!normalizedTitle) {
    throw new Error('RETENTION_TITLE_REQUIRED');
  }
  if (!normalizedBody) {
    throw new Error('RETENTION_BODY_REQUIRED');
  }

  const target = buildRetentionTarget(targetType, segmentId);
  const audience = await resolveAudience(ctx, businessId, target);
  const normalizedChannels = normalizeChannels(channels);
  const activation = await assertRetentionActionCanBeActivated(ctx, businessId);
  const now = Date.now();

  const campaignId = await ctx.db.insert('campaigns', {
    businessId,
    type: 'retention_action',
    title: normalizedTitle,
    messageTitle: normalizedTitle,
    messageBody: normalizedBody,
    status: 'active',
    rules: {
      targetType,
      segmentId: targetType === 'saved_segment' ? segmentId : undefined,
      audienceCount: audience.customers.length,
    },
    channels: normalizedChannels,
    automationEnabled: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  return {
    campaignId,
    targetLabel: audience.targetLabel,
    audienceCount: audience.customers.length,
    channels: normalizedChannels,
    status: 'active' as const,
    usage: {
      activeRetentionActions: activation.activeCount + 1,
      limit: activation.limit,
      planKey: activation.planKey,
      limitType: 'active_retention_actions' as const,
    },
  };
}

export const getMarketingHubSnapshot = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return {
        opportunityCards: [],
        insights: [],
        retentionUsage: null,
        recentSuggestions: [],
      };
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'marketingHub',
    });

    const [snapshot, entitlements, suggestions] = await Promise.all([
      buildCustomerLifecycleSnapshotForBusiness(ctx, businessId),
      getBusinessEntitlementsForBusinessId(ctx, businessId),
      ctx.db
        .query('campaigns')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .filter((q: any) => q.eq(q.field('type'), 'ai_retention'))
        .collect(),
    ]);

    return {
      opportunityCards: snapshot.opportunityCards,
      insights: snapshot.insights,
      retentionUsage: {
        used: entitlements.usage.activeRetentionActions,
        limit: entitlements.limits.maxActiveRetentionActions,
        remaining: entitlements.usage.activeRetentionActionsRemaining,
      },
      recentSuggestions: suggestions
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, 5)
        .map((campaign) => ({
          campaignId: campaign._id,
          title: campaign.title ?? 'AI suggestion',
          messageTitle: campaign.messageTitle ?? '',
          messageBody: campaign.messageBody ?? '',
          createdAt: campaign.createdAt,
        })),
    };
  },
});

export const listAiRetentionSuggestionsByBusiness = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return [];
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'marketingHub',
    });

    const campaigns = await ctx.db
      .query('campaigns')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .filter((q: any) => q.eq(q.field('type'), 'ai_retention'))
      .collect();

    return campaigns
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((campaign) => ({
        campaignId: campaign._id,
        title: campaign.title ?? 'AI suggestion',
        messageTitle: campaign.messageTitle ?? '',
        messageBody: campaign.messageBody ?? '',
        channels: Array.isArray(campaign.channels) ? campaign.channels : [],
        status: campaign.status ?? 'draft',
        createdAt: campaign.createdAt,
      }));
  },
});

export const createAiRetentionSuggestion = mutation({
  args: {
    businessId: v.id('businesses'),
    targetType: RETENTION_TARGET_TYPE_UNION,
    segmentId: v.optional(v.id('segments')),
  },
  handler: async (ctx, { businessId, targetType, segmentId }) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'marketingHub',
    });
    await assertCampaignCapacity(ctx, businessId);
    await assertSavedSegmentAccessIfNeeded(ctx, businessId, targetType);

    const target = buildRetentionTarget(targetType, segmentId);
    const audience = await resolveAudience(ctx, businessId, target);
    const suggestion = buildAiSuggestion(target, audience.customers.length);
    const now = Date.now();

    const campaignId = await ctx.db.insert('campaigns', {
      businessId,
      type: 'ai_retention',
      title: suggestion.title,
      messageTitle: suggestion.messageTitle,
      messageBody: suggestion.messageBody,
      prompt: suggestion.prompt,
      status: 'draft',
      rules: {
        targetType,
        segmentId: targetType === 'saved_segment' ? segmentId : undefined,
        audienceCount: audience.customers.length,
      },
      channels: ['push', 'in_app'],
      automationEnabled: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return {
      campaignId,
      audienceCount: audience.customers.length,
      suggestion,
    };
  },
});

export const createRetentionAction = mutation({
  args: {
    businessId: v.id('businesses'),
    targetType: RETENTION_TARGET_TYPE_UNION,
    segmentId: v.optional(v.id('segments')),
    title: v.string(),
    messageBody: v.string(),
    channels: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireActorIsBusinessOwnerOrManager(ctx, args.businessId);
    return {
      status: 'disabled' as const,
      reason: LEGACY_RETENTION_DISABLED_REASON,
      message:
        'Legacy retention actions are disabled. Use campaign creation and activation in campaigns v2.',
      targetType: args.targetType,
      segmentId: args.segmentId ?? null,
    };
  },
});

// Backward-compatible alias. This now creates an active retention action.
export const sendRetentionAction = mutation({
  args: {
    businessId: v.id('businesses'),
    targetType: RETENTION_TARGET_TYPE_UNION,
    segmentId: v.optional(v.id('segments')),
    title: v.string(),
    messageBody: v.string(),
    channels: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireActorIsBusinessOwnerOrManager(ctx, args.businessId);
    return {
      status: 'disabled' as const,
      reason: LEGACY_RETENTION_DISABLED_REASON,
      message:
        'Legacy retention send is disabled. Use campaign activation in campaigns v2.',
      targetType: args.targetType,
      segmentId: args.segmentId ?? null,
    };
  },
});

export const setRetentionActionStatus = mutation({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
    status: RETENTION_ACTION_STATUS_UNION,
  },
  handler: async (ctx, { businessId, campaignId, status }) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    return {
      campaignId,
      status: 'disabled' as const,
      requestedStatus: status,
      reason: LEGACY_RETENTION_DISABLED_REASON,
    };
  },
});

export const runRetentionActionSweepInternal = internalMutation({
  args: {},
  handler: async () => {
    return {
      processedCampaigns: 0,
      targetedCustomers: 0,
      inAppMessages: 0,
      pushSent: 0,
      pushFailed: 0,
      pushSkipped: 0,
      dedupedUsers: 0,
      reason: LEGACY_RETENTION_DISABLED_REASON,
    };
  },
});
