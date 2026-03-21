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
  getBusinessEntitlementsForBusinessId,
} from './entitlements';
import {
  requireActorIsBusinessOwnerOrManager,
  requireActorIsStaffForBusiness,
} from './guards';

type RetentionTargetType =
  | 'at_risk'
  | 'near_reward'
  | 'vip'
  | 'new_customers';

const RETENTION_TARGET_TYPE_UNION = v.union(
  v.literal('at_risk'),
  v.literal('near_reward'),
  v.literal('vip'),
  v.literal('new_customers')
);

const RETENTION_ACTION_STATUS_UNION = v.union(
  v.literal('draft'),
  v.literal('active'),
  v.literal('paused'),
  v.literal('completed'),
  v.literal('archived')
);

const LEGACY_RETENTION_DISABLED_REASON = 'legacy_retention_disabled';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildTargetLabel(targetType: RetentionTargetType) {
  switch (targetType) {
    case 'at_risk':
      return 'Customers at risk';
    case 'near_reward':
      return 'Customers close to reward';
    case 'vip':
      return 'VIP customers';
    case 'new_customers':
      return 'New customers';
    default:
      return 'Customers';
  }
}

export function isLegacyRetentionAutomationDisabled(sourceContext: unknown) {
  if (!isRecord(sourceContext)) {
    return false;
  }
  return sourceContext.legacyAutomationDisabled === true;
}

function buildAiSuggestion(
  targetType: RetentionTargetType,
  audienceCount: number
) {
  switch (targetType) {
    case 'at_risk':
      return {
        title: 'AI suggestion: win back at-risk customers',
        messageTitle: 'We miss seeing you',
        messageBody: `We identified ${audienceCount} customers at risk. Send a short comeback message.`,
        prompt: 'Write a short winback message for at-risk customers.',
      };
    case 'near_reward':
      return {
        title: 'AI suggestion: push close-to-reward customers',
        messageTitle: 'You are close to your reward',
        messageBody: `${audienceCount} customers are close to reward completion. Remind them to return soon.`,
        prompt:
          'Write a reward reminder for customers who are close to reward completion.',
      };
    case 'vip':
      return {
        title: 'AI suggestion: thank VIP customers',
        messageTitle: 'Thank you for being with us',
        messageBody: `${audienceCount} VIP customers were identified. Send a short appreciation message.`,
        prompt: 'Write a thank-you message for VIP customers.',
      };
    case 'new_customers':
    default:
      return {
        title: 'AI suggestion: welcome new customers',
        messageTitle: 'Welcome to our loyalty club',
        messageBody: `${audienceCount} new customers joined recently. Send a warm welcome message.`,
        prompt: 'Write a welcome message for newly joined customers.',
      };
  }
}

async function resolveAudience(
  ctx: any,
  businessId: Id<'businesses'>,
  targetType: RetentionTargetType
) {
  const snapshot = await buildCustomerLifecycleSnapshotForBusiness(ctx, businessId);
  return {
    customers: getCustomersForOpportunity(
      snapshot.customers,
      targetType as RetentionOpportunityKey
    ),
    rules: { targetType },
    targetLabel: buildTargetLabel(targetType),
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
  },
  handler: async (ctx, { businessId, targetType }) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'marketingHub',
    });
    await assertCampaignsNotOverLimit(ctx, businessId);

    const audience = await resolveAudience(ctx, businessId, targetType);
    const suggestion = buildAiSuggestion(targetType, audience.customers.length);
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
    };
  },
});

export const sendRetentionAction = mutation({
  args: {
    businessId: v.id('businesses'),
    targetType: RETENTION_TARGET_TYPE_UNION,
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
