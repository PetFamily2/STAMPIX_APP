import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import {
  assertCampaignsNotOverLimit,
  assertEntitlement,
  countActiveCampaignsForBusiness,
  countActiveRetentionActionsForBusiness,
  getBusinessEntitlementsForBusinessId,
} from './entitlements';
import {
  getCurrentUserOrNull,
  requireActorHasBusinessCapability,
} from './guards';
import { recordCampaignRun } from './lib/campaignRuns';
import { assertExpectedUpdatedAt } from './lib/editConflicts';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CHANNELS: Array<'in_app' | 'push'> = ['in_app'];
const ALLOWED_CHANNELS = new Set(['in_app', 'push']);
const MANAGEMENT_TYPES = [
  'welcome',
  'birthday',
  'anniversary',
  'winback',
  'promo',
] as const;
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
const ISRAEL_YEAR_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: ISRAEL_TIME_ZONE,
  year: 'numeric',
});

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
type CampaignDeliveryStats = {
  reachedUniqueAllTime: number;
  reachedMessagesAllTime: number;
  lastSentAt: number | null;
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

function normalizeEditableManagementStatus(
  value: unknown
): 'draft' | 'active' | 'paused' | 'completed' | 'archived' {
  if (
    value === 'draft' ||
    value === 'active' ||
    value === 'paused' ||
    value === 'completed' ||
    value === 'archived'
  ) {
    return value === 'completed' ? 'draft' : value;
  }
  return 'draft';
}

function normalizeScheduleMode(
  value: unknown
): 'send_now' | 'one_time' | 'recurring' {
  if (value === 'send_now' || value === 'one_time' || value === 'recurring') {
    return value;
  }
  return 'send_now';
}

function getScheduleModeFromCampaign(campaign: any) {
  const scheduleMode = isObject(campaign?.schedule)
    ? normalizeScheduleMode(campaign.schedule.mode)
    : null;

  if (scheduleMode) {
    return scheduleMode;
  }

  return isAutomationEnabled(campaign?.automationEnabled)
    ? 'recurring'
    : 'send_now';
}

function isAutomationEnabled(value: unknown): boolean {
  return value === true;
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

function getIsraelYear(timestamp: number): number {
  return Number(ISRAEL_YEAR_FORMATTER.format(new Date(timestamp)));
}

function getIsraelMonthDay(timestamp: number): { month: number; day: number } {
  const parts = getDateTimePartsByFormatter(
    ISRAEL_DATE_TIME_FORMATTER,
    timestamp
  );
  return {
    month: Number(parts.get('month') ?? 0),
    day: Number(parts.get('day') ?? 0),
  };
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
        rules: {
          audience: 'new_customers',
          joinedWithinDays: 14,
        } as CampaignRules,
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
        messageBody: 'כבר זמן מה שלא ביקרתם. מחכה לכם הטבה מיוחדת לחזרה מהירה.',
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

function isCampaignLimitReachedError(error: unknown) {
  const payload = (error as { data?: any } | null)?.data;
  return (
    payload?.code === 'PLAN_LIMIT_REACHED' &&
    payload?.limitKey === 'maxCampaigns'
  );
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

async function assertRecurringCampaignCapacity(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const activeRecurringCampaigns = await countActiveRetentionActionsForBusiness(
    ctx,
    businessId
  );
  await assertEntitlement(ctx, businessId, {
    limitKey: 'maxActiveRetentionActions',
    currentValue: activeRecurringCampaigns,
  });
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

async function getCampaignAnyStateOrThrow(
  ctx: any,
  businessId: Id<'businesses'>,
  campaignId: Id<'campaigns'>
) {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign || campaign.businessId !== businessId) {
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
  const lifecycle =
    program?.status === 'draft' ||
    program?.status === 'active' ||
    program?.status === 'archived'
      ? program.status
      : program?.isArchived === true
        ? 'archived'
        : 'active';
  if (
    !program ||
    program.businessId !== businessId ||
    program.isActive !== true ||
    lifecycle !== 'active'
  ) {
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

function getUniqueUsersFromRows(rows: AudienceRow[]) {
  const uniqueByUserId = new Map<string, any>();
  for (const row of rows) {
    uniqueByUserId.set(String(row.user._id), row.user);
  }
  return [...uniqueByUserId.values()];
}

function isValidBirthdayValue(value: unknown, min: number, max: number) {
  return Number.isFinite(value) && Number(value) >= min && Number(value) <= max;
}

function countMissingBirthdayFromRows(rows: AudienceRow[]) {
  const users = getUniqueUsersFromRows(rows);
  return users.filter(
    (user) =>
      !isValidBirthdayValue(user.birthdayMonth, 1, 12) ||
      !isValidBirthdayValue(user.birthdayDay, 1, 31)
  ).length;
}

async function getCampaignLogs(ctx: any, campaignId: Id<'campaigns'>) {
  return await ctx.db
    .query('messageLog')
    .withIndex('by_campaignId', (q: any) => q.eq('campaignId', campaignId))
    .collect();
}

function buildCampaignDeliveryStats(
  logs: Array<{ toUserId: Id<'users'>; createdAt: number }>
): CampaignDeliveryStats {
  const uniqueUsers = new Set<string>();
  let lastSentAt: number | null = null;

  for (const log of logs) {
    uniqueUsers.add(String(log.toUserId));
    if (lastSentAt === null || log.createdAt > lastSentAt) {
      lastSentAt = log.createdAt;
    }
  }

  return {
    reachedUniqueAllTime: uniqueUsers.size,
    reachedMessagesAllTime: logs.length,
    lastSentAt,
  };
}

async function countMissingBirthdayForCampaign(ctx: any, campaign: any) {
  const rows = await loadAudienceRows(
    ctx,
    campaign.businessId,
    campaign.programId
  );
  return countMissingBirthdayFromRows(rows);
}

function shouldSkipAutomationByHistory(
  campaignType: ManagementCampaignType,
  previousSentTimestamps: number[],
  now: number
) {
  if (previousSentTimestamps.length === 0) {
    return false;
  }
  if (campaignType === 'birthday' || campaignType === 'anniversary') {
    const currentIsraelYear = getIsraelYear(now);
    return previousSentTimestamps.some(
      (sentAt) => getIsraelYear(sentAt) === currentIsraelYear
    );
  }
  return true;
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
      const { month, day } = getIsraelMonthDay(now);
      return row.user.birthdayMonth === month && row.user.birthdayDay === day;
    }
    case 'anniversary_today': {
      const { month, day } = getIsraelMonthDay(now);
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
  const rows = await loadAudienceRows(
    ctx,
    campaign.businessId,
    campaign.programId
  );
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

async function sendAutomationForCampaign(
  ctx: any,
  campaign: any,
  now: number
): Promise<{ sentCount: number; skippedCount: number }> {
  const estimate = await estimateAudienceForCampaign(ctx, campaign);
  const campaignType = normalizeManagementType(campaign.type);
  const logs = await getCampaignLogs(ctx, campaign._id);

  const historyByUserId = new Map<string, number[]>();
  for (const log of logs) {
    const key = String(log.toUserId);
    const values = historyByUserId.get(key) ?? [];
    values.push(Number(log.createdAt));
    historyByUserId.set(key, values);
  }

  let sentCount = 0;
  let skippedCount = 0;

  for (const userId of estimate.userIds) {
    const userKey = String(userId);
    const userHistory = historyByUserId.get(userKey) ?? [];
    if (shouldSkipAutomationByHistory(campaignType, userHistory, now)) {
      skippedCount += 1;
      continue;
    }

    await ctx.db.insert('messageLog', {
      businessId: campaign.businessId,
      campaignId: campaign._id,
      toUserId: userId,
      channel: 'in_app',
      status: 'sent',
      createdAt: now,
    });

    userHistory.push(now);
    historyByUserId.set(userKey, userHistory);
    sentCount += 1;
  }

  if (sentCount > 0) {
    await ctx.db.patch(campaign._id, {
      updatedAt: now,
    });
    await recordCampaignRun(ctx, {
      businessId: campaign.businessId,
      campaignId: campaign._id,
      programId: campaign.programId ?? undefined,
      campaignType: campaign.type,
      sentAt: now,
      targetedCount: estimate.total,
      deliveredCount: sentCount,
      lastDeliveryAt: now,
    });
  }

  return { sentCount, skippedCount };
}

async function sendCampaignDeliveryOnce(
  ctx: any,
  campaign: any,
  now: number
): Promise<{
  sentCount: number;
  skippedCount: number;
  estimatedAudience: number;
}> {
  const estimate = await estimateAudienceForCampaign(ctx, campaign);
  let sentCount = 0;
  let skippedCount = 0;

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
      businessId: campaign.businessId,
      campaignId: campaign._id,
      toUserId: userId,
      channel: 'in_app',
      status: 'sent',
      createdAt: now,
    });
    sentCount += 1;
  }

  if (sentCount > 0) {
    await recordCampaignRun(ctx, {
      businessId: campaign.businessId,
      campaignId: campaign._id,
      programId: campaign.programId ?? undefined,
      campaignType: campaign.type,
      sentAt: now,
      targetedCount: estimate.total,
      deliveredCount: sentCount,
      lastDeliveryAt: now,
    });
  }

  return {
    sentCount,
    skippedCount,
    estimatedAudience: estimate.total,
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

    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_campaigns'
    );
    const entitlements = await getBusinessEntitlementsForBusinessId(
      ctx,
      businessId
    );
    const usage = {
      used: entitlements.usage.activeManagementCampaigns,
      limit: entitlements.limits.maxCampaigns,
      remaining: entitlements.usage.activeManagementCampaignsRemaining,
      isOverLimit: entitlements.usage.activeManagementCampaignsOverLimit,
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
    channels: v.optional(
      v.array(v.union(v.literal('in_app'), v.literal('push')))
    ),
  },
  handler: async (ctx, { businessId, title, prompt, rules, channels }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'create_campaigns'
    );
    await assertCampaignCapacity(ctx, businessId);

    const normalizedPrompt = prompt.trim();
    const normalizedTitle = title?.trim() || 'AI Campaign';

    if (!normalizedPrompt) {
      throw new Error('PROMPT_REQUIRED');
    }

    const normalizedChannels =
      Array.isArray(channels) && channels.length > 0
        ? channels.filter((channel) => ALLOWED_CHANNELS.has(channel))
        : DEFAULT_CHANNELS;

    const now = Date.now();

    const campaignId = await ctx.db.insert('campaigns', {
      businessId,
      type: 'ai_marketing',
      title: normalizedTitle,
      prompt: normalizedPrompt,
      status: 'draft',
      activationStatus: 'draft',
      rules,
      channels:
        normalizedChannels.length > 0 ? normalizedChannels : DEFAULT_CHANNELS,
      automationEnabled: false,
      schedule: {
        mode: 'send_now',
      },
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const entitlements = await getBusinessEntitlementsForBusinessId(
      ctx,
      businessId
    );

    return {
      campaignId,
      usage: {
        used: entitlements.usage.activeManagementCampaigns,
        limit: entitlements.limits.maxCampaigns,
        remaining: entitlements.usage.activeManagementCampaignsRemaining,
        isOverLimit: entitlements.usage.activeManagementCampaignsOverLimit,
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

    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_campaigns'
    );
    const campaigns = await ctx.db
      .query('campaigns')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .collect();

    const result = await Promise.all(
      campaigns.map(async (campaign) => {
        const automationEnabled = isAutomationEnabled(
          campaign.automationEnabled
        );
        const scheduleMode = getScheduleModeFromCampaign(campaign);
        const isCountedTowardLimit = campaign.isActive === true;
        const lifecycle =
          campaign.isActive !== true
            ? 'archived'
            : campaign.type === 'retention_action'
              ? campaign.status === 'active' && automationEnabled
                ? 'active'
                : 'inactive'
              : automationEnabled
                ? 'active'
                : 'inactive';
        const family =
          campaign.type === 'retention_action'
            ? 'retention'
            : campaign.type === 'ai_marketing' ||
                campaign.type === 'ai_retention'
              ? 'ai'
              : 'management';
        const [logs, managementEstimate, missingBirthdayCount] =
          await Promise.all([
            getCampaignLogs(ctx, campaign._id),
            isManagementType(campaign.type)
              ? estimateAudienceForCampaign(ctx, campaign)
              : Promise.resolve(null),
            campaign.type === 'birthday'
              ? countMissingBirthdayForCampaign(ctx, campaign)
              : Promise.resolve(null),
          ]);
        const deliveryStats = buildCampaignDeliveryStats(logs);
        const estimatedAudience = isManagementType(campaign.type)
          ? (managementEstimate?.total ?? 0)
          : typeof campaign.rules?.audienceCount === 'number'
            ? Number(campaign.rules.audienceCount)
            : 0;
        const messageTitle = campaign.messageTitle ?? campaign.title ?? '';
        const messageBody = campaign.messageBody ?? '';
        const defaultStatus = campaign.isActive ? 'draft' : 'archived';

        return {
          campaignId: campaign._id,
          businessId: campaign.businessId,
          programId: campaign.programId ?? null,
          type: campaign.type,
          family,
          isEditable: isManagementType(campaign.type),
          isCountedTowardLimit,
          title: campaign.title ?? messageTitle,
          messageTitle,
          messageBody,
          status: normalizeEditableManagementStatus(
            campaign.status ?? defaultStatus
          ),
          scheduleMode,
          scheduledForAt:
            typeof campaign.schedule?.sendAt === 'number'
              ? campaign.schedule.sendAt
              : null,
          rules: campaign.rules ?? null,
          automationEnabled,
          lifecycle,
          canArchive: lifecycle === 'inactive',
          estimatedAudience,
          reachedUniqueAllTime: deliveryStats.reachedUniqueAllTime,
          reachedMessagesAllTime: deliveryStats.reachedMessagesAllTime,
          lastSentAt: deliveryStats.lastSentAt,
          missingBirthdayCount:
            campaign.type === 'birthday' ? (missingBirthdayCount ?? 0) : null,
          isActive: campaign.isActive,
          archivedAt: campaign.archivedAt ?? null,
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt,
        };
      })
    );

    return result
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getManagementCampaignDraft = query({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
  },
  handler: async (ctx, { businessId, campaignId }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_campaigns'
    );
    const campaign = await getCampaignOrThrow(ctx, businessId, campaignId);
    if (!isManagementType(campaign.type)) {
      throw new Error('CAMPAIGN_TYPE_NOT_SUPPORTED');
    }

    const defaults = buildDefaultDraftByType(campaign.type);
    const [estimate, logs, missingBirthdayCount] = await Promise.all([
      estimateAudienceForCampaign(ctx, campaign),
      getCampaignLogs(ctx, campaign._id),
      campaign.type === 'birthday'
        ? countMissingBirthdayForCampaign(ctx, campaign)
        : Promise.resolve(null),
    ]);
    const deliveryStats = buildCampaignDeliveryStats(logs);
    const automationEnabled = isAutomationEnabled(campaign.automationEnabled);
    const scheduleMode = getScheduleModeFromCampaign(campaign);

    return {
      campaignId: campaign._id,
      businessId: campaign.businessId,
      type: campaign.type,
      status: normalizeEditableManagementStatus(campaign.status),
      scheduleMode,
      scheduledForAt:
        typeof campaign.schedule?.sendAt === 'number'
          ? campaign.schedule.sendAt
          : null,
      messageTitle: campaign.messageTitle ?? defaults.messageTitle,
      messageBody: campaign.messageBody ?? defaults.messageBody,
      rules: campaign.rules ?? defaults.rules,
      programId: campaign.programId ?? null,
      automationEnabled,
      isRulesLocked: automationEnabled,
      stats: {
        eligibleAudienceNow: estimate.total,
        reachedUniqueAllTime: deliveryStats.reachedUniqueAllTime,
        reachedMessagesAllTime: deliveryStats.reachedMessagesAllTime,
        lastSentAt: deliveryStats.lastSentAt,
        missingBirthdayCount:
          campaign.type === 'birthday' ? (missingBirthdayCount ?? 0) : null,
      },
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
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
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'create_campaigns'
    );
    await validateProgramBelongsToBusiness(ctx, businessId, programId);
    await assertCampaignCapacity(ctx, businessId);

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
      activationStatus: 'draft',
      automationEnabled: false,
      schedule: {
        mode: 'send_now',
      },
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return { campaignId };
  },
});

export const createGeneralCampaignDraft = mutation({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'create_campaigns'
    );
    await assertCampaignCapacity(ctx, businessId);

    const defaults = buildDefaultDraftByType('promo');
    const now = Date.now();
    const campaignId = await ctx.db.insert('campaigns', {
      businessId,
      type: 'promo',
      title: defaults.title,
      messageTitle: defaults.messageTitle,
      messageBody: defaults.messageBody,
      rules: defaults.rules,
      channels: DEFAULT_CHANNELS,
      status: 'draft',
      activationStatus: 'draft',
      automationEnabled: false,
      schedule: {
        mode: 'send_now',
      },
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return { campaignId };
  },
});

export const setCampaignAutomationEnabled = mutation({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
    enabled: v.boolean(),
    expectedUpdatedAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { businessId, campaignId, enabled, expectedUpdatedAt }
  ) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'activate_send_campaigns'
    );
    const campaign = await getCampaignOrThrow(ctx, businessId, campaignId);
    assertExpectedUpdatedAt({
      entity: 'campaign',
      entityId: String(campaignId),
      expectedUpdatedAt,
      actualUpdatedAt: campaign.updatedAt,
    });
    if (!isManagementType(campaign.type)) {
      throw new Error('CAMPAIGN_TYPE_NOT_SUPPORTED');
    }
    if (enabled) {
      await assertCampaignsNotOverLimit(ctx, businessId);
      if (!isAutomationEnabled(campaign.automationEnabled)) {
        await assertRecurringCampaignCapacity(ctx, businessId);
      }
    }

    const now = Date.now();
    const currentSchedule = isObject(campaign.schedule)
      ? campaign.schedule
      : {};
    const patchPayload: Record<string, unknown> = {
      automationEnabled: enabled,
      status: enabled
        ? 'active'
        : campaign.status === 'active'
          ? 'paused'
          : campaign.status,
      activationStatus: enabled
        ? 'active'
        : campaign.activationStatus === 'active'
          ? 'paused'
          : campaign.activationStatus,
      updatedAt: now,
    };

    if (enabled) {
      patchPayload.schedule = {
        ...currentSchedule,
        mode: 'recurring',
        sendHourLocal:
          Number.isFinite(currentSchedule.sendHourLocal) &&
          Number(currentSchedule.sendHourLocal) >= 0 &&
          Number(currentSchedule.sendHourLocal) <= 23
            ? Number(currentSchedule.sendHourLocal)
            : 9,
      };
    } else if (currentSchedule.mode === 'recurring') {
      patchPayload.schedule = {
        ...currentSchedule,
        mode: 'send_now',
        nextRunAt: undefined,
      };
    }

    await ctx.db.patch(campaign._id, patchPayload);

    return {
      ok: true,
      automationEnabled: enabled,
      updatedAt: now,
    };
  },
});

export const scheduleCampaignOneTime = mutation({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
    sendAt: v.number(),
    expectedUpdatedAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { businessId, campaignId, sendAt, expectedUpdatedAt }
  ) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'activate_send_campaigns'
    );
    await assertCampaignsNotOverLimit(ctx, businessId);
    const campaign = await getCampaignOrThrow(ctx, businessId, campaignId);
    assertExpectedUpdatedAt({
      entity: 'campaign',
      entityId: String(campaignId),
      expectedUpdatedAt,
      actualUpdatedAt: campaign.updatedAt,
    });
    if (!isManagementType(campaign.type)) {
      throw new Error('CAMPAIGN_TYPE_NOT_SUPPORTED');
    }

    const now = Date.now();
    const minScheduleAt = now + 5 * 60 * 1000;
    if (!Number.isFinite(sendAt) || sendAt < minScheduleAt) {
      throw new Error('SCHEDULE_TIME_INVALID');
    }

    const currentSchedule = isObject(campaign.schedule)
      ? campaign.schedule
      : {};
    await ctx.db.patch(campaign._id, {
      automationEnabled: false,
      status: 'active',
      activationStatus: 'active',
      schedule: {
        ...currentSchedule,
        mode: 'one_time',
        sendAt,
        nextRunAt: sendAt,
      },
      updatedAt: now,
    });

    return {
      ok: true,
      scheduleMode: 'one_time' as const,
      sendAt,
      updatedAt: now,
    };
  },
});

export const clearCampaignOneTimeSchedule = mutation({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
    expectedUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { businessId, campaignId, expectedUpdatedAt }) => {
    await requireActorHasBusinessCapability(ctx, businessId, 'edit_campaigns');
    const campaign = await getCampaignOrThrow(ctx, businessId, campaignId);
    assertExpectedUpdatedAt({
      entity: 'campaign',
      entityId: String(campaignId),
      expectedUpdatedAt,
      actualUpdatedAt: campaign.updatedAt,
    });
    if (!isManagementType(campaign.type)) {
      throw new Error('CAMPAIGN_TYPE_NOT_SUPPORTED');
    }

    const currentSchedule = isObject(campaign.schedule)
      ? campaign.schedule
      : {};
    const now = Date.now();
    await ctx.db.patch(campaign._id, {
      automationEnabled: false,
      status:
        campaign.status === 'active' &&
        getScheduleModeFromCampaign(campaign) === 'one_time'
          ? 'draft'
          : campaign.status,
      activationStatus:
        campaign.activationStatus === 'active' &&
        getScheduleModeFromCampaign(campaign) === 'one_time'
          ? 'draft'
          : campaign.activationStatus,
      schedule: {
        ...currentSchedule,
        mode: 'send_now',
        sendAt: undefined,
        nextRunAt: undefined,
      },
      updatedAt: now,
    });

    return {
      ok: true,
      scheduleMode: 'send_now' as const,
      updatedAt: now,
    };
  },
});

export const archiveManagementCampaign = mutation({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
    expectedUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { businessId, campaignId, expectedUpdatedAt }) => {
    const { actor } = await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'delete_campaigns'
    );
    const campaign = await getCampaignAnyStateOrThrow(
      ctx,
      businessId,
      campaignId
    );
    assertExpectedUpdatedAt({
      entity: 'campaign',
      entityId: String(campaignId),
      expectedUpdatedAt,
      actualUpdatedAt: campaign.updatedAt,
    });
    if (campaign.isActive !== true) {
      throw new Error('CAMPAIGN_ALREADY_ARCHIVED');
    }
    const automationEnabled = isAutomationEnabled(campaign.automationEnabled);
    const isLiveCampaign =
      campaign.type === 'retention_action'
        ? campaign.status === 'active' && automationEnabled
        : automationEnabled;
    if (isLiveCampaign) {
      throw new Error('CAMPAIGN_MUST_BE_DISABLED_BEFORE_ARCHIVE');
    }

    const now = Date.now();
    const patchPayload: Record<string, unknown> = {
      isActive: false,
      automationEnabled: false,
      archivedAt: now,
      archivedByUserId: actor._id,
      updatedAt: now,
    };
    if (campaign.type === 'retention_action') {
      patchPayload.status = 'archived';
    }
    await ctx.db.patch(campaign._id, patchPayload);

    return {
      ok: true,
      campaignId: campaign._id,
      archivedAt: now,
      updatedAt: now,
    };
  },
});

export const restoreManagementCampaign = mutation({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
  },
  handler: async (ctx, { businessId, campaignId }) => {
    await requireActorHasBusinessCapability(ctx, businessId, 'edit_campaigns');
    const campaign = await getCampaignAnyStateOrThrow(
      ctx,
      businessId,
      campaignId
    );
    if (campaign.isActive === true) {
      throw new Error('CAMPAIGN_NOT_ARCHIVED');
    }
    await assertCampaignCapacity(ctx, businessId);

    const now = Date.now();
    const patchPayload: Record<string, unknown> = {
      isActive: true,
      automationEnabled: false,
      archivedAt: undefined,
      archivedByUserId: undefined,
      updatedAt: now,
    };
    if (campaign.type === 'retention_action') {
      patchPayload.status = 'paused';
    }
    await ctx.db.patch(campaign._id, patchPayload);

    return {
      ok: true,
      campaignId: campaign._id,
      updatedAt: now,
    };
  },
});

export const updateCampaignDraft = mutation({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
    expectedUpdatedAt: v.optional(v.number()),
    title: v.optional(v.string()),
    messageTitle: v.optional(v.string()),
    messageBody: v.optional(v.string()),
    rules: v.optional(v.any()),
    programId: v.optional(v.id('loyaltyPrograms')),
  },
  handler: async (
    ctx,
    {
      businessId,
      campaignId,
      expectedUpdatedAt,
      title,
      messageTitle,
      messageBody,
      rules,
      programId,
    }
  ) => {
    await requireActorHasBusinessCapability(ctx, businessId, 'edit_campaigns');
    const campaign = await getCampaignOrThrow(ctx, businessId, campaignId);
    assertExpectedUpdatedAt({
      entity: 'campaign',
      entityId: String(campaignId),
      expectedUpdatedAt,
      actualUpdatedAt: campaign.updatedAt,
    });
    if (!isManagementType(campaign.type)) {
      throw new Error('CAMPAIGN_TYPE_NOT_SUPPORTED');
    }
    if (isAutomationEnabled(campaign.automationEnabled)) {
      if (rules !== undefined || programId !== undefined) {
        throw new Error('ACTIVE_CAMPAIGN_RULES_LOCKED');
      }
    }

    if (!isAutomationEnabled(campaign.automationEnabled)) {
      await validateProgramBelongsToBusiness(ctx, businessId, programId);
    }
    const defaults = buildDefaultDraftByType(campaign.type);
    const updatedAt = Date.now();
    const patchPayload: Record<string, unknown> = {
      title: normalizeText(title, defaults.title),
      messageTitle: normalizeText(messageTitle, defaults.messageTitle),
      messageBody: normalizeText(messageBody, defaults.messageBody),
      updatedAt,
    };
    if (!isAutomationEnabled(campaign.automationEnabled)) {
      patchPayload.rules = normalizeCampaignRules(campaign.type, rules);
      patchPayload.programId = programId;
    }

    await ctx.db.patch(campaign._id, patchPayload);

    return { ok: true, updatedAt };
  },
});

export const estimateCampaignAudience = mutation({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
  },
  handler: async (ctx, { businessId, campaignId }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_campaigns'
    );
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
    expectedUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { businessId, campaignId, expectedUpdatedAt }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'activate_send_campaigns'
    );
    await assertCampaignsNotOverLimit(ctx, businessId);
    const campaign = await getCampaignOrThrow(ctx, businessId, campaignId);
    assertExpectedUpdatedAt({
      entity: 'campaign',
      entityId: String(campaignId),
      expectedUpdatedAt,
      actualUpdatedAt: campaign.updatedAt,
    });
    if (!isManagementType(campaign.type)) {
      throw new Error('CAMPAIGN_TYPE_NOT_SUPPORTED');
    }

    const now = Date.now();
    const result = await sendCampaignDeliveryOnce(ctx, campaign, now);
    const currentSchedule = isObject(campaign.schedule)
      ? campaign.schedule
      : {};
    const patchPayload: Record<string, unknown> = {
      updatedAt: now,
    };
    if (getScheduleModeFromCampaign(campaign) === 'one_time') {
      patchPayload.status = 'completed';
      patchPayload.activationStatus = 'completed';
      patchPayload.schedule = {
        ...currentSchedule,
        mode: 'send_now',
        sendAt: undefined,
        nextRunAt: undefined,
      };
    }
    await ctx.db.patch(campaign._id, patchPayload);

    return {
      sentCount: result.sentCount,
      skippedCount: result.skippedCount,
      estimatedAudience: result.estimatedAudience,
      updatedAt: now,
    };
  },
});

export const runAutomationSweepInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const israelHour = getIsraelHour(now);
    const shouldRunRecurring = israelHour === 9;
    let recurringProcessedCampaigns = 0;
    let oneTimeProcessedCampaigns = 0;
    let sentCount = 0;
    let skippedCount = 0;
    const overLimitByBusiness = new Map<string, boolean>();

    if (shouldRunRecurring) {
      const recurringCampaigns = await ctx.db
        .query('campaigns')
        .withIndex('by_automationEnabled', (q: any) =>
          q.eq('automationEnabled', true)
        )
        .filter((q: any) =>
          q.and(
            q.eq(q.field('isActive'), true),
            q.neq(q.field('type'), 'ai_marketing')
          )
        )
        .collect();

      for (const campaign of recurringCampaigns) {
        if (!isManagementType(campaign.type)) {
          continue;
        }
        const businessKey = String(campaign.businessId);
        let isBlocked = overLimitByBusiness.get(businessKey);
        if (isBlocked === undefined) {
          try {
            await assertCampaignsNotOverLimit(ctx, campaign.businessId);
            isBlocked = false;
          } catch (error) {
            if (!isCampaignLimitReachedError(error)) {
              throw error;
            }
            isBlocked = true;
          }
          overLimitByBusiness.set(businessKey, isBlocked);
        }
        if (isBlocked) {
          continue;
        }
        recurringProcessedCampaigns += 1;
        const result = await sendAutomationForCampaign(ctx, campaign, now);
        sentCount += result.sentCount;
        skippedCount += result.skippedCount;
      }
    }

    const oneTimeCandidates = await ctx.db
      .query('campaigns')
      .withIndex('by_activationStatus', (q: any) =>
        q.eq('activationStatus', 'active')
      )
      .filter((q: any) =>
        q.and(
          q.eq(q.field('isActive'), true),
          q.eq(q.field('automationEnabled'), false),
          q.neq(q.field('type'), 'ai_marketing'),
          q.neq(q.field('type'), 'ai_retention'),
          q.neq(q.field('type'), 'retention_action')
        )
      )
      .collect();

    for (const campaign of oneTimeCandidates) {
      if (!isManagementType(campaign.type)) {
        continue;
      }
      if (getScheduleModeFromCampaign(campaign) !== 'one_time') {
        continue;
      }
      const sendAt = Number(campaign.schedule?.sendAt ?? 0);
      if (!Number.isFinite(sendAt) || sendAt <= 0 || sendAt > now) {
        continue;
      }

      const businessKey = String(campaign.businessId);
      let isBlocked = overLimitByBusiness.get(businessKey);
      if (isBlocked === undefined) {
        try {
          await assertCampaignsNotOverLimit(ctx, campaign.businessId);
          isBlocked = false;
        } catch (error) {
          if (!isCampaignLimitReachedError(error)) {
            throw error;
          }
          isBlocked = true;
        }
        overLimitByBusiness.set(businessKey, isBlocked);
      }
      if (isBlocked) {
        continue;
      }

      oneTimeProcessedCampaigns += 1;
      const result = await sendCampaignDeliveryOnce(ctx, campaign, now);
      sentCount += result.sentCount;
      skippedCount += result.skippedCount;
      const currentSchedule = isObject(campaign.schedule)
        ? campaign.schedule
        : {};
      await ctx.db.patch(campaign._id, {
        status: 'completed',
        activationStatus: 'completed',
        schedule: {
          ...currentSchedule,
          mode: 'send_now',
          sendAt: undefined,
          nextRunAt: undefined,
        },
        updatedAt: now,
      });
    }

    return {
      processedCampaigns:
        recurringProcessedCampaigns + oneTimeProcessedCampaigns,
      recurringProcessedCampaigns,
      oneTimeProcessedCampaigns,
      sentCount,
      skippedCount,
      reason: shouldRunRecurring ? 'ok' : 'recurring_window_closed',
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
        const inboxPayload =
          log.inboxPayload && typeof log.inboxPayload === 'object'
            ? (log.inboxPayload as Record<string, unknown>)
            : null;
        const payloadTitle =
          inboxPayload && typeof inboxPayload.title === 'string'
            ? inboxPayload.title
            : null;
        const payloadBody =
          inboxPayload && typeof inboxPayload.body === 'string'
            ? inboxPayload.body
            : null;
        const destinationHref =
          inboxPayload && typeof inboxPayload.destinationHref === 'string'
            ? inboxPayload.destinationHref
            : null;

        return {
          messageId: log._id,
          campaignId: log.campaignId ?? null,
          businessId: log.businessId,
          businessName: business?.name ?? 'העסק',
          campaignType: campaign?.type ?? 'promo',
          title:
            payloadTitle ??
            campaign?.messageTitle ??
            campaign?.title ??
            'עדכון חדש מהעסק',
          body:
            payloadBody ??
            campaign?.messageBody ??
            'יש לכם עדכון חדש. היכנסו לצפות בפרטים.',
          destinationHref,
          notificationType: log.notificationType ?? null,
          createdAt: log.createdAt,
          readAt: log.readAt ?? null,
          status: log.status,
        };
      })
    );

    return inbox;
  },
});
