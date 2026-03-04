import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  getBusinessEntitlementsForBusinessId,
  reserveAiCampaignQuota,
} from './entitlements';
import { requireActorIsStaffForBusiness } from './guards';

export const listAiCampaignsByBusiness = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return {
        campaigns: [],
        usage: null,
      };
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    const entitlements = await getBusinessEntitlementsForBusinessId(
      ctx,
      businessId
    );
    const usage = {
      used: entitlements.usage.aiCampaignsUsedThisMonth,
      limit: entitlements.limits.maxAiCampaignsPerMonth,
      remaining: entitlements.usage.aiCampaignsRemainingThisMonth,
      monthKey: entitlements.usage.aiCampaignsMonthKey,
      isFeatureEnabled:
        entitlements.features.canUseMarketingHubAI &&
        entitlements.isSubscriptionActive,
    };

    if (!usage.isFeatureEnabled) {
      return {
        campaigns: [],
        usage,
      };
    }

    const campaigns = await ctx.db
      .query('campaigns')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .filter((q: any) => q.eq(q.field('type'), 'ai_marketing'))
      .collect();

    const sanitized = campaigns
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((campaign) => ({
        campaignId: campaign._id,
        title: campaign.title ?? 'AI Campaign',
        prompt: campaign.prompt ?? '',
        status: campaign.status ?? 'draft',
        createdAt: campaign.createdAt,
      }));

    return {
      campaigns: sanitized,
      usage,
    };
  },
});

export const createAiCampaign = mutation({
  args: {
    businessId: v.id('businesses'),
    title: v.optional(v.string()),
    prompt: v.string(),
    rules: v.optional(v.any()),
    channels: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { businessId, title, prompt, rules, channels }) => {
    await requireActorIsStaffForBusiness(ctx, businessId);

    const normalizedPrompt = prompt.trim();
    const normalizedTitle = title?.trim() || 'AI Campaign';

    if (!normalizedPrompt) {
      throw new Error('PROMPT_REQUIRED');
    }

    const quota = await reserveAiCampaignQuota(ctx, businessId);
    const now = Date.now();

    const campaignId = await ctx.db.insert('campaigns', {
      businessId,
      type: 'ai_marketing',
      title: normalizedTitle,
      prompt: normalizedPrompt,
      status: 'draft',
      rules,
      channels,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return {
      campaignId,
      usage: {
        used: quota.usedAfter,
        limit: quota.limitValue,
        monthKey: quota.monthKey,
      },
    };
  },
});

