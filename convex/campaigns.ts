import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import {
  getBusinessEntitlementsForBusinessId,
  reserveAiCampaignQuota,
} from './entitlements';
import {
  getCurrentUserOrNull,
  requireActorIsBusinessOwnerOrManager,
  requireActorIsStaffForBusiness,
} from './guards';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CHANNELS = ['in_app'];
const MANAGEMENT_TYPES = [
  'welcome',
  'birthday',
  'anniversary',
  'winback',
  'promo',
] as const;

type ManagementCampaignType = (typeof MANAGEMENT_TYPES)[number];
type CampaignRules =
  | { audience: 'new_customers'; joinedWithinDays: number }
  | { audience: 'birthday_today' }
  | { audience: 'anniversary_today' }
  | { audience: 'inactive_days'; daysInactive: number }
  | { audience: 'all_active_members' };

type AudienceRow = {
  membership: any;
  user: any;
};

const MANAGEMENT_CAMPAIGN_TYPE_UNION = v.union(
  v.literal('welcome'),
  v.literal('birthday'),
  v.literal('anniversary'),
  v.literal('winback'),
  v.literal('promo')
);

function normalizeText(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toPositiveInt(value: unknown, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const num = Math.max(1, Math.floor(Number(value)));
  return num;
}

function buildDefaultDraftByType(type: ManagementCampaignType) {
  switch (type) {
    case 'welcome':
      return {
        title: 'ברוכים הבאים',
        messageTitle: 'ברוכים הבאים למועדון!',
        messageBody:
          'כיף שהצטרפתם אלינו. הציגו את הכרטיסייה בביקור הבא ותתחילו לצבור ניקובים.',
        rules: { audience: 'new_customers', joinedWithinDays: 14 } as CampaignRules,
      };
    case 'birthday':
      return {
        title: 'מבצע יום הולדת',
        messageTitle: 'מזל טוב! מחכה לכם הטבה 🎉',
        messageBody:
          'יום הולדת שמח! קפצו אלינו החודש וקבלו הטבת יום הולדת מיוחדת.',
        rules: { audience: 'birthday_today' } as CampaignRules,
      };
    case 'anniversary':
      return {
        title: 'מבצע יום נישואין',
        messageTitle: 'יום נישואין שמח 💍',
        messageBody:
          'לכבוד יום הנישואין מחכה לכם אצלנו הטבה זוגית מיוחדת. נשמח לראותכם!',
        rules: { audience: 'anniversary_today' } as CampaignRules,
      };
    case 'winback':
      return {
        title: 'מתגעגעים אליכם',
        messageTitle: 'לא ראינו אתכם לאחרונה',
        messageBody:
          'כבר זמן מה שלא ביקרתם. מחכה לכם הטבה מיוחדת לחזרה מהירה.',
        rules: { audience: 'inactive_days', daysInactive: 30 } as CampaignRules,
      };
    case 'promo':
      return {
        title: 'מבצע חדש',
        messageTitle: 'מבצע חדש מחכה לכם',
        messageBody: 'השבוע יש לנו מבצע מיוחד ללקוחות המועדון. שווה להגיע!',
        rules: { audience: 'all_active_members' } as CampaignRules,
      };
    default:
      return {
        title: 'קמפיין',
        messageTitle: 'עדכון חדש',
        messageBody: 'מחכה לכם עדכון חדש מהעסק.',
        rules: { audience: 'all_active_members' } as CampaignRules,
      };
  }
}

function normalizeCampaignRules(
  type: ManagementCampaignType,
  incomingRules: unknown
): CampaignRules {
  if (!isObject(incomingRules)) {
    return buildDefaultDraftByType(type).rules;
  }

  const audience = incomingRules.audience;
  if (audience === 'new_customers') {
    return {
      audience: 'new_customers',
      joinedWithinDays: toPositiveInt(incomingRules.joinedWithinDays, 14),
    };
  }
  if (audience === 'birthday_today') {
    return { audience: 'birthday_today' };
  }
  if (audience === 'anniversary_today') {
    return { audience: 'anniversary_today' };
  }
  if (audience === 'inactive_days') {
    return {
      audience: 'inactive_days',
      daysInactive: toPositiveInt(incomingRules.daysInactive, 30),
    };
  }
  if (audience === 'all_active_members') {
    return { audience: 'all_active_members' };
  }

  return buildDefaultDraftByType(type).rules;
}

function normalizeManagementType(value: unknown): ManagementCampaignType {
  if (
    value === 'welcome' ||
    value === 'birthday' ||
    value === 'anniversary' ||
    value === 'winback' ||
    value === 'promo'
  ) {
    return value;
  }
  throw new Error('INVALID_CAMPAIGN_TYPE');
}

function isManagementType(value: unknown): value is ManagementCampaignType {
  return MANAGEMENT_TYPES.includes(value as ManagementCampaignType);
}

async function getCampaignOrThrow(
  ctx: any,
  businessId: Id<'businesses'>,
  campaignId: Id<'campaigns'>
) {
  const campaign = await ctx.db.get(campaignId);
  if (
    !campaign ||
    campaign.businessId !== businessId ||
    campaign.isActive !== true
  ) {
    throw new Error('CAMPAIGN_NOT_FOUND');
  }
  return campaign;
}

async function validateProgramBelongsToBusiness(
  ctx: any,
  businessId: Id<'businesses'>,
  programId: Id<'loyaltyPrograms'> | undefined
) {
  if (!programId) {
    return;
  }
  const program = await ctx.db.get(programId);
  if (!program || program.businessId !== businessId || program.isActive !== true) {
    throw new Error('PROGRAM_NOT_FOUND');
  }
}

async function loadAudienceRows(
  ctx: any,
  businessId: Id<'businesses'>,
  programId: Id<'loyaltyPrograms'> | undefined
) {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .collect();

  const filteredMemberships = programId
    ? memberships.filter(
        (membership: any) => String(membership.programId) === String(programId)
      )
    : memberships;

  const uniqueUserIds = [
    ...new Set(filteredMemberships.map((m: any) => String(m.userId))),
  ];
  const users = await Promise.all(
    uniqueUserIds.map((userId) => ctx.db.get(userId as Id<'users'>))
  );
  const userById = new Map<string, any>();
  users.forEach((user) => {
    if (user) {
      userById.set(String(user._id), user);
    }
  });

  const rows: AudienceRow[] = filteredMemberships
    .map((membership: any) => {
      const user = userById.get(String(membership.userId));
      if (!user) {
        return null;
      }
      return { membership, user };
    })
    .filter((row: AudienceRow | null): row is AudienceRow => row !== null);

  return rows;
}

function rowMatchesRule(rule: CampaignRules, row: AudienceRow, now: number) {
  if (row.user.isActive !== true) {
    return false;
  }
  if (row.user.marketingOptIn !== true) {
    return false;
  }

  switch (rule.audience) {
    case 'new_customers':
      return row.membership.createdAt >= now - rule.joinedWithinDays * DAY_MS;
    case 'birthday_today': {
      const today = new Date(now);
      const month = today.getUTCMonth() + 1;
      const day = today.getUTCDate();
      return row.user.birthdayMonth === month && row.user.birthdayDay === day;
    }
    case 'anniversary_today': {
      const today = new Date(now);
      const month = today.getUTCMonth() + 1;
      const day = today.getUTCDate();
      return (
        row.user.anniversaryMonth === month && row.user.anniversaryDay === day
      );
    }
    case 'inactive_days': {
      const lastActivity =
        row.membership.lastStampAt ??
        row.membership.updatedAt ??
        row.membership.createdAt;
      return now - Number(lastActivity) >= rule.daysInactive * DAY_MS;
    }
    case 'all_active_members':
      return true;
    default:
      return false;
  }
}

async function estimateAudienceForCampaign(
  ctx: any,
  campaign: any
): Promise<{ userIds: Id<'users'>[]; total: number; sample: string[] }> {
  const normalizedType = normalizeManagementType(campaign.type);
  const rules = normalizeCampaignRules(normalizedType, campaign.rules);
  const rows = await loadAudienceRows(ctx, campaign.businessId, campaign.programId);
  const now = Date.now();

  const userIdSet = new Set<string>();
  const sample: string[] = [];
  for (const row of rows) {
    if (!rowMatchesRule(rules, row, now)) {
      continue;
    }
    const userId = String(row.user._id);
    if (userIdSet.has(userId)) {
      continue;
    }
    userIdSet.add(userId);
    if (sample.length < 5) {
      sample.push(
        row.user.fullName ?? row.user.email ?? row.user.externalId ?? 'לקוח'
      );
    }
  }

  return {
    userIds: [...userIdSet].map((id) => id as Id<'users'>),
    total: userIdSet.size,
    sample,
  };
}

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

export const listManagementCampaignsByBusiness = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return [];
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    const campaigns = await ctx.db
      .query('campaigns')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .filter((q: any) =>
        q.and(
          q.eq(q.field('isActive'), true),
          q.neq(q.field('type'), 'ai_marketing')
        )
      )
      .collect();

    const result = await Promise.all(
      campaigns.map(async (campaign) => {
        if (!isManagementType(campaign.type)) {
          return null;
        }
        const estimate = await estimateAudienceForCampaign(ctx, campaign);
        return {
          campaignId: campaign._id,
          businessId: campaign.businessId,
          programId: campaign.programId ?? null,
          type: campaign.type,
          title: campaign.title ?? buildDefaultDraftByType(campaign.type).title,
          messageTitle:
            campaign.messageTitle ??
            buildDefaultDraftByType(campaign.type).messageTitle,
          messageBody:
            campaign.messageBody ??
            buildDefaultDraftByType(campaign.type).messageBody,
          status: campaign.status ?? 'draft',
          rules: campaign.rules ?? buildDefaultDraftByType(campaign.type).rules,
          estimatedAudience: estimate.total,
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt,
        };
      })
    );

    return result
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const createCampaignDraft = mutation({
  args: {
    businessId: v.id('businesses'),
    type: MANAGEMENT_CAMPAIGN_TYPE_UNION,
    title: v.optional(v.string()),
    messageTitle: v.optional(v.string()),
    messageBody: v.optional(v.string()),
    rules: v.optional(v.any()),
    programId: v.optional(v.id('loyaltyPrograms')),
  },
  handler: async (
    ctx,
    { businessId, type, title, messageTitle, messageBody, rules, programId }
  ) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    await validateProgramBelongsToBusiness(ctx, businessId, programId);

    const defaults = buildDefaultDraftByType(type);
    const now = Date.now();
    const campaignId = await ctx.db.insert('campaigns', {
      businessId,
      type,
      title: normalizeText(title, defaults.title),
      messageTitle: normalizeText(messageTitle, defaults.messageTitle),
      messageBody: normalizeText(messageBody, defaults.messageBody),
      rules: normalizeCampaignRules(type, rules),
      channels: DEFAULT_CHANNELS,
      programId,
      status: 'draft',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return { campaignId };
  },
});

export const updateCampaignDraft = mutation({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
    title: v.optional(v.string()),
    messageTitle: v.optional(v.string()),
    messageBody: v.optional(v.string()),
    rules: v.optional(v.any()),
    programId: v.optional(v.id('loyaltyPrograms')),
  },
  handler: async (
    ctx,
    { businessId, campaignId, title, messageTitle, messageBody, rules, programId }
  ) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const campaign = await getCampaignOrThrow(ctx, businessId, campaignId);
    if (!isManagementType(campaign.type)) {
      throw new Error('CAMPAIGN_TYPE_NOT_SUPPORTED');
    }
    if ((campaign.status ?? 'draft') !== 'draft') {
      throw new Error('CAMPAIGN_NOT_DRAFT');
    }

    await validateProgramBelongsToBusiness(ctx, businessId, programId);
    const defaults = buildDefaultDraftByType(campaign.type);

    await ctx.db.patch(campaign._id, {
      title: normalizeText(title, defaults.title),
      messageTitle: normalizeText(messageTitle, defaults.messageTitle),
      messageBody: normalizeText(messageBody, defaults.messageBody),
      rules: normalizeCampaignRules(campaign.type, rules),
      programId,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const estimateCampaignAudience = mutation({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
  },
  handler: async (ctx, { businessId, campaignId }) => {
    await requireActorIsStaffForBusiness(ctx, businessId);
    const campaign = await getCampaignOrThrow(ctx, businessId, campaignId);
    if (!isManagementType(campaign.type)) {
      throw new Error('CAMPAIGN_TYPE_NOT_SUPPORTED');
    }
    const estimate = await estimateAudienceForCampaign(ctx, campaign);
    return {
      total: estimate.total,
      sample: estimate.sample,
    };
  },
});

export const sendCampaignNow = mutation({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
  },
  handler: async (ctx, { businessId, campaignId }) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const campaign = await getCampaignOrThrow(ctx, businessId, campaignId);
    if (!isManagementType(campaign.type)) {
      throw new Error('CAMPAIGN_TYPE_NOT_SUPPORTED');
    }

    const estimate = await estimateAudienceForCampaign(ctx, campaign);
    let sentCount = 0;
    let skippedCount = 0;
    const now = Date.now();

    for (const userId of estimate.userIds) {
      const existing = await ctx.db
        .query('messageLog')
        .withIndex('by_campaignId_toUserId', (q: any) =>
          q.eq('campaignId', campaign._id).eq('toUserId', userId)
        )
        .first();

      if (existing) {
        skippedCount += 1;
        continue;
      }

      await ctx.db.insert('messageLog', {
        businessId,
        campaignId: campaign._id,
        toUserId: userId,
        channel: 'in_app',
        status: 'sent',
        createdAt: now,
      });
      sentCount += 1;
    }

    await ctx.db.patch(campaign._id, {
      status: 'sent',
      updatedAt: now,
    });

    return {
      sentCount,
      skippedCount,
      estimatedAudience: estimate.total,
    };
  },
});

export const listInboxForCustomer = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return [];
    }

    const logs = await ctx.db
      .query('messageLog')
      .withIndex('by_toUserId', (q: any) => q.eq('toUserId', user._id))
      .collect();

    const sorted = logs.sort((a, b) => b.createdAt - a.createdAt);
    const inbox = await Promise.all(
      sorted.map(async (log) => {
        const [business, campaign] = await Promise.all([
          ctx.db.get(log.businessId),
          log.campaignId ? ctx.db.get(log.campaignId) : Promise.resolve(null),
        ]);

        return {
          messageId: log._id,
          campaignId: log.campaignId ?? null,
          businessId: log.businessId,
          businessName: business?.name ?? 'העסק',
          campaignType: campaign?.type ?? 'promo',
          title:
            campaign?.messageTitle ??
            campaign?.title ??
            'עדכון חדש מהעסק',
          body: campaign?.messageBody ?? 'יש לכם עדכון חדש. היכנסו לצפות בפרטים.',
          createdAt: log.createdAt,
          readAt: log.readAt ?? null,
          status: log.status,
        };
      })
    );

    return inbox;
  },
});
