import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from './_generated/server';
import {
  assertCampaignsNotOverLimit,
  assertEntitlement,
  campaignConsumesQuota,
  countActiveCampaignsForBusiness,
  countActiveRetentionActionsForBusiness,
  getBusinessEntitlementsForBusinessId,
} from './entitlements';
import {
  getCurrentUserOrNull,
  requireActorHasBusinessCapability,
} from './guards';
import { recordCampaignRun } from './lib/campaignRuns';
import { classifyCampaignState } from './lib/campaignState';
import { assertExpectedUpdatedAt } from './lib/editConflicts';
import { markSmartManagerDirty } from './lib/smartManagerDirty';
import { sendPushNotificationToUser } from './pushNotifications';

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

async function markCampaignFactsDirty(
  ctx: any,
  businessId: Id<'businesses'>,
  reason: string,
  now = Date.now()
) {
  await markSmartManagerDirty(ctx, {
    businessId,
    domains: ['campaigns'],
    reasons: [reason],
    now,
  });
}

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
type CampaignPushCandidate = {
  _id: Id<'campaigns'>;
  businessId: Id<'businesses'>;
  title?: unknown;
  messageTitle?: unknown;
  messageBody?: unknown;
  channels?: unknown;
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

function normalizeUnknownText(value: unknown, fallback: string) {
  return normalizeText(typeof value === 'string' ? value : undefined, fallback);
}

function campaignHasPushChannel(campaign: { channels?: unknown }) {
  return Array.isArray(campaign.channels) && campaign.channels.includes('push');
}

function assertCampaignIsNotImmutableSmartManagerExecution(
  campaign: Pick<Doc<'campaigns'>, 'source'>
) {
  if (campaign.source === 'smart_manager') {
    throw new Error('SMART_MANAGER_APPROVED_CAMPAIGN_IMMUTABLE');
  }
}

async function attemptCampaignPushDelivery(
  ctx: unknown,
  campaign: CampaignPushCandidate,
  userId: Id<'users'>,
  dedupeKey?: string
) {
  if (!campaignHasPushChannel(campaign)) {
    return;
  }

  try {
    await sendPushNotificationToUser(ctx, {
      businessId: campaign.businessId,
      campaignId: campaign._id,
      toUserId: userId,
      title: normalizeUnknownText(
        campaign.messageTitle ?? campaign.title,
        'New StampAix update'
      ),
      body: normalizeUnknownText(
        campaign.messageBody,
        'Open StampAix to view the latest business update.'
      ),
      dedupeKey,
    });
  } catch {
    // Push is best-effort; campaign inbox delivery remains authoritative.
  }
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
    reserveSlot: true,
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
    reserveSlot: true,
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
    .withIndex(programId ? 'by_programId' : 'by_businessId', (q: any) =>
      programId ? q.eq('programId', programId) : q.eq('businessId', businessId)
    )
    .take(DELIVERY_PAGE_SIZE + 1);
  if (memberships.length > DELIVERY_PAGE_SIZE) return null;

  // A program ID must never broaden the business scope, even if a legacy
  // membership contains inconsistent references.
  const filteredMemberships = programId
    ? memberships.filter(
        (membership: any) =>
          membership.isActive === true && membership.businessId === businessId
      )
    : memberships.filter((membership: any) => membership.isActive === true);

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
    .take(DELIVERY_PAGE_SIZE + 1);
}

async function hasPersistedCampaignRun(ctx: any, campaignId: Id<'campaigns'>) {
  const run = await ctx.db
    .query('campaignRuns')
    .withIndex('by_campaignId', (q: any) => q.eq('campaignId', campaignId))
    .first();
  return Number.isFinite(run?.sentAt);
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

// Exact year boundaries in the same time zone used to classify historical sends.
function israelYearStart(year: number) {
  let low = Date.UTC(year - 1, 11, 28),
    high = Date.UTC(year, 0, 3);
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (getIsraelYear(middle) < year) low = middle;
    else high = middle;
  }
  return high;
}

async function hasAutomationHistory(
  ctx: any,
  campaignId: Id<'campaigns'>,
  userId: Id<'users'>,
  type: ManagementCampaignType,
  now: number
) {
  if (type === 'birthday' || type === 'anniversary') {
    const year = getIsraelYear(now),
      start = israelYearStart(year),
      end = israelYearStart(year + 1);
    return !!(await ctx.db
      .query('messageLog')
      .withIndex('by_campaignId_toUserId_createdAt', (q: any) =>
        q
          .eq('campaignId', campaignId)
          .eq('toUserId', userId)
          .gte('createdAt', start)
          .lt('createdAt', end)
      )
      .first());
  }
  return !!(await ctx.db
    .query('messageLog')
    .withIndex('by_campaignId_toUserId', (q: any) =>
      q.eq('campaignId', campaignId).eq('toUserId', userId)
    )
    .first());
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
  campaign: any,
  referenceNow = Date.now()
): Promise<{
  userIds: Id<'users'>[];
  total: number;
  sample: string[];
  missingBirthdayCount: number;
} | null> {
  const normalizedType = normalizeManagementType(campaign.type);
  const rules = normalizeCampaignRules(normalizedType, campaign.rules);
  const rows = await loadAudienceRows(
    ctx,
    campaign.businessId,
    campaign.programId
  );
  if (!rows) return null;
  const now = referenceNow;

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
    missingBirthdayCount:
      normalizedType === 'birthday' ? countMissingBirthdayFromRows(rows) : 0,
    sample,
  };
}

async function sendAutomationForCampaign(
  ctx: any,
  campaign: any,
  now: number
): Promise<{ sentCount: number; skippedCount: number }> {
  const estimate = await estimateAudienceForCampaign(ctx, campaign, now);
  if (!estimate) throw new Error('CAMPAIGN_CLIENT_UPDATE_REQUIRED');
  const campaignType = normalizeManagementType(campaign.type);

  let sentCount = 0;
  let skippedCount = 0;

  for (const userId of estimate.userIds) {
    if (
      await hasAutomationHistory(ctx, campaign._id, userId, campaignType, now)
    ) {
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
    // The same recipient may legitimately receive a later recurring run.
    // The fixed sweep time is stable across retries and cursor continuations.
    await attemptCampaignPushDelivery(
      ctx,
      campaign,
      userId,
      `campaign_automation:${String(campaign._id)}:${now}`
    );

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
  const estimate = await estimateAudienceForCampaign(ctx, campaign, now);
  if (!estimate) throw new Error('CAMPAIGN_CLIENT_UPDATE_REQUIRED');
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
    await attemptCampaignPushDelivery(ctx, campaign, userId);
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
    await markCampaignFactsDirty(ctx, businessId, 'ai_campaign_created', now);
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
    deferLargeStats: v.optional(v.boolean()),
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
    const now = Date.now();

    // Bound total related reads on the legacy array endpoint. Current clients
    // load deferred details through the paged campaign actions.
    const includeStats = campaigns.length <= 20;
    const result = await Promise.all(
      campaigns.map(async (campaign) => {
        const automationEnabled = isAutomationEnabled(
          campaign.automationEnabled
        );
        const scheduleMode = getScheduleModeFromCampaign(campaign);
        const isCountedTowardLimit = campaignConsumesQuota({
          kind: 'management',
          campaign,
        });
        const family =
          campaign.type === 'retention_action'
            ? 'retention'
            : campaign.type === 'ai_marketing' ||
                campaign.type === 'ai_retention'
              ? 'ai'
              : 'management';
        const calculateAudience =
          includeStats && isManagementType(campaign.type);
        const [logs, hasPersistedCompletionEvidence, managementEstimate] =
          await Promise.all([
            includeStats
              ? getCampaignLogs(ctx, campaign._id)
              : Promise.resolve(null),
            hasPersistedCampaignRun(ctx, campaign._id),
            calculateAudience
              ? estimateAudienceForCampaign(ctx, campaign)
              : Promise.resolve(null),
          ]);
        const productState = classifyCampaignState(campaign, {
          now,
          hasPersistedCompletionEvidence,
        });
        const lifecycle =
          productState.state === 'archived'
            ? 'archived'
            : productState.isMeaningfullyActive
              ? 'active'
              : 'inactive';
        const deliveryStats =
          logs && logs.length <= DELIVERY_PAGE_SIZE
            ? buildCampaignDeliveryStats(logs)
            : null;
        const estimatedAudience = isManagementType(campaign.type)
          ? (managementEstimate?.total ?? null)
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
          productState: productState.state,
          lifecycleSourceVersion: productState.sourceVersion,
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
          reachedUniqueAllTime: deliveryStats?.reachedUniqueAllTime ?? null,
          reachedMessagesAllTime: deliveryStats?.reachedMessagesAllTime ?? null,
          lastSentAt: deliveryStats?.lastSentAt ?? null,
          missingBirthdayCount:
            campaign.type === 'birthday'
              ? (managementEstimate?.missingBirthdayCount ?? null)
              : null,
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
    deferStats: v.optional(v.boolean()),
  },
  handler: async (ctx, { businessId, campaignId, deferStats }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_campaigns'
    );
    const campaign = await getCampaignAnyStateOrThrow(
      ctx,
      businessId,
      campaignId
    );
    if (!isManagementType(campaign.type)) {
      throw new Error('CAMPAIGN_TYPE_NOT_SUPPORTED');
    }

    const defaults = buildDefaultDraftByType(campaign.type);
    const [estimate, logs] = deferStats
      ? [null, []]
      : await Promise.all([
          estimateAudienceForCampaign(ctx, campaign),
          getCampaignLogs(ctx, campaign._id),
        ]);
    const deliveryStats =
      logs.length <= DELIVERY_PAGE_SIZE
        ? buildCampaignDeliveryStats(logs)
        : null;
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
      lifecycle:
        campaign.isActive !== true
          ? 'archived'
          : campaignConsumesQuota({ kind: 'management', campaign })
            ? 'active'
            : 'draft',
      stats: deferStats
        ? null
        : {
            eligibleAudienceNow: estimate?.total ?? null,
            reachedUniqueAllTime: deliveryStats?.reachedUniqueAllTime ?? null,
            reachedMessagesAllTime:
              deliveryStats?.reachedMessagesAllTime ?? null,
            lastSentAt: deliveryStats?.lastSentAt ?? null,
            missingBirthdayCount:
              campaign.type === 'birthday'
                ? (estimate?.missingBirthdayCount ?? null)
                : null,
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

    await markCampaignFactsDirty(
      ctx,
      businessId,
      'campaign_draft_created',
      now
    );

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

    await markCampaignFactsDirty(
      ctx,
      businessId,
      'campaign_draft_created',
      now
    );

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
    assertCampaignIsNotImmutableSmartManagerExecution(campaign);
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
      if (!campaignConsumesQuota({ kind: 'management', campaign })) {
        await assertCampaignCapacity(ctx, businessId);
      }
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

    await markCampaignFactsDirty(
      ctx,
      businessId,
      'campaign_automation_changed',
      now
    );

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
    const campaign = await getCampaignOrThrow(ctx, businessId, campaignId);
    assertCampaignIsNotImmutableSmartManagerExecution(campaign);
    assertExpectedUpdatedAt({
      entity: 'campaign',
      entityId: String(campaignId),
      expectedUpdatedAt,
      actualUpdatedAt: campaign.updatedAt,
    });
    if (!isManagementType(campaign.type)) {
      throw new Error('CAMPAIGN_TYPE_NOT_SUPPORTED');
    }
    if (!campaignConsumesQuota({ kind: 'management', campaign })) {
      await assertCampaignCapacity(ctx, businessId);
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

    await markCampaignFactsDirty(ctx, businessId, 'campaign_scheduled', now);

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
    assertCampaignIsNotImmutableSmartManagerExecution(campaign);
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

    await markCampaignFactsDirty(
      ctx,
      businessId,
      'campaign_schedule_cleared',
      now
    );

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
    assertCampaignIsNotImmutableSmartManagerExecution(campaign);
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
      status: 'archived',
      activationStatus: 'archived',
      archivedAt: now,
      archivedByUserId: actor._id,
      updatedAt: now,
    };
    await ctx.db.patch(campaign._id, patchPayload);

    await markCampaignFactsDirty(ctx, businessId, 'campaign_archived', now);

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
    assertCampaignIsNotImmutableSmartManagerExecution(campaign);
    if (campaign.isActive === true) {
      throw new Error('CAMPAIGN_NOT_ARCHIVED');
    }
    const now = Date.now();
    const patchPayload: Record<string, unknown> = {
      isActive: true,
      automationEnabled: false,
      archivedAt: undefined,
      archivedByUserId: undefined,
      updatedAt: now,
    };
    if (isManagementType(campaign.type)) {
      patchPayload.status = 'draft';
      patchPayload.activationStatus = 'draft';
      patchPayload.schedule = { mode: 'send_now' };
    } else if (campaign.type === 'retention_action') {
      patchPayload.status = 'paused';
    }
    await ctx.db.patch(campaign._id, patchPayload);

    await markCampaignFactsDirty(ctx, businessId, 'campaign_restored', now);

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
    const campaign = await getCampaignAnyStateOrThrow(
      ctx,
      businessId,
      campaignId
    );
    assertCampaignIsNotImmutableSmartManagerExecution(campaign);
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

    await markCampaignFactsDirty(
      ctx,
      businessId,
      'campaign_updated',
      updatedAt
    );

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
    if (!estimate) throw new Error('CAMPAIGN_CLIENT_UPDATE_REQUIRED');
    return {
      total: estimate.total,
      sample: estimate.sample,
    };
  },
});

type DeliveryJob = NonNullable<Doc<'campaigns'>['managementDelivery']>;
const DELIVERY_PAGE_SIZE = 50;
const DELIVERY_RETRY_MS = 60_000;

function audienceIndex(ctx: QueryCtx, campaign: Doc<'campaigns'>) {
  const programId = campaign.programId;
  return programId
    ? ctx.db
        .query('memberships')
        .withIndex('by_programId_userId', (q) => q.eq('programId', programId))
    : ctx.db
        .query('memberships')
        .withIndex('by_businessId_userId', (q) =>
          q.eq('businessId', campaign.businessId)
        );
}

async function needsDeliveryJob(ctx: QueryCtx, campaign: Doc<'campaigns'>) {
  return (
    (await audienceIndex(ctx, campaign).take(DELIVERY_PAGE_SIZE + 1)).length >
    DELIVERY_PAGE_SIZE
  );
}

async function scheduleDeliveryPage(
  ctx: MutationCtx,
  campaignId: Id<'campaigns'>,
  job: DeliveryJob
) {
  await ctx.scheduler.runAfter(
    0,
    internal.campaigns.processManagementDeliveryBatch,
    {
      campaignId,
      referenceNow: job.referenceNow,
      page: job.page,
    }
  );
}

async function queueDeliveryJob(
  ctx: MutationCtx,
  campaign: Doc<'campaigns'>,
  mode: DeliveryJob['mode'],
  now: number
) {
  if (campaign.managementDelivery) return;
  const job: DeliveryJob = {
    mode,
    referenceNow: now,
    revision: campaign.updatedAt,
    cursor: null,
    page: 0,
    targeted: 0,
    sent: 0,
    nextAttemptAt: Date.now() + DELIVERY_RETRY_MS,
  };
  await ctx.db.patch(campaign._id, { managementDelivery: job });
  await scheduleDeliveryPage(ctx, campaign._id, job);
}

const estimateBatchArgs = {
  businessId: v.id('businesses'),
  campaignId: v.id('campaigns'),
  cursor: v.union(v.string(), v.null()),
  referenceNow: v.number(),
  revision: v.optional(v.number()),
  lastMatched: v.optional(v.id('users')),
  lastSeen: v.optional(v.id('users')),
};

export const estimateManagementAudienceBatch = internalQuery({
  args: estimateBatchArgs,
  returns: v.object({
    total: v.number(),
    sample: v.array(v.string()),
    revision: v.number(),
    cursor: v.union(v.string(), v.null()),
    lastMatched: v.union(v.id('users'), v.null()),
    lastSeen: v.union(v.id('users'), v.null()),
    missingBirthdayCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireActorHasBusinessCapability(
      ctx,
      args.businessId,
      'access_campaigns'
    );
    const campaign = await getCampaignAnyStateOrThrow(
      ctx,
      args.businessId,
      args.campaignId
    );
    assertExpectedUpdatedAt({
      entity: 'campaign',
      entityId: String(campaign._id),
      expectedUpdatedAt: args.revision,
      actualUpdatedAt: campaign.updatedAt,
    });
    if (!isManagementType(campaign.type))
      throw new Error('CAMPAIGN_TYPE_NOT_SUPPORTED');
    const rules = normalizeCampaignRules(campaign.type, campaign.rules);
    const page = await audienceIndex(ctx, campaign).paginate({
      cursor: args.cursor,
      numItems: 100,
    });
    const sample: string[] = [];
    let total = 0,
      missingBirthdayCount = 0,
      lastSeen = args.lastSeen ?? null,
      lastMatched = args.lastMatched ?? null;
    for (const membership of page.page) {
      if (
        membership.businessId !== args.businessId ||
        !membership.isActive ||
        membership._creationTime > args.referenceNow ||
        membership.userId === lastMatched
      )
        continue;
      const user = await ctx.db.get(membership.userId);
      if (user && user._id !== lastSeen) {
        lastSeen = user._id;
        if (
          !isValidBirthdayValue(user.birthdayMonth, 1, 12) ||
          !isValidBirthdayValue(user.birthdayDay, 1, 31)
        )
          missingBirthdayCount++;
      }
      if (
        !user ||
        !rowMatchesRule(rules, { membership, user }, args.referenceNow)
      )
        continue;
      lastMatched = user._id;
      total++;
      if (sample.length < 5)
        sample.push(user.fullName ?? user.email ?? user.externalId ?? 'לקוח');
    }
    return {
      total,
      sample,
      revision: campaign.updatedAt,
      cursor: page.isDone ? null : page.continueCursor,
      lastMatched,
      lastSeen,
      missingBirthdayCount,
    };
  },
});

type EstimateBatch = {
  total: number;
  sample: string[];
  revision: number;
  cursor: string | null;
  lastMatched: Id<'users'> | null;
  lastSeen: Id<'users'> | null;
  missingBirthdayCount: number;
};

export const estimateCampaignAudiencePaged = action({
  args: { businessId: v.id('businesses'), campaignId: v.id('campaigns') },
  returns: v.object({
    total: v.number(),
    sample: v.array(v.string()),
    missingBirthdayCount: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    total: number;
    sample: string[];
    missingBirthdayCount: number;
  }> => {
    const referenceNow = Date.now(),
      sample: string[] = [];
    let cursor: string | null = null;
    let revision: number | undefined,
      lastMatched: Id<'users'> | undefined,
      lastSeen: Id<'users'> | undefined;
    let total = 0,
      missingBirthdayCount = 0;
    do {
      const batch: EstimateBatch = await ctx.runQuery(
        internal.campaigns.estimateManagementAudienceBatch,
        {
          ...args,
          referenceNow,
          cursor,
          revision,
          lastMatched,
          lastSeen,
        }
      );
      cursor = batch.cursor;
      revision = batch.revision;
      lastMatched = batch.lastMatched ?? undefined;
      total += batch.total;
      lastSeen = batch.lastSeen ?? undefined;
      missingBirthdayCount += batch.missingBirthdayCount;
      sample.push(...batch.sample.slice(0, 5 - sample.length));
    } while (cursor !== null);
    return { total, sample, missingBirthdayCount };
  },
});

type CampaignHistoryPage = {
  count: number;
  unique: number;
  last: number | null;
  user: Id<'users'> | null;
  cursor: string | null;
};

export const managementHistoryBatch = internalQuery({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
    revision: v.number(),
    cursor: v.union(v.string(), v.null()),
    previousUser: v.optional(v.id('users')),
    cutoff: v.number(),
  },
  returns: v.object({
    count: v.number(),
    unique: v.number(),
    last: v.union(v.number(), v.null()),
    user: v.union(v.id('users'), v.null()),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<CampaignHistoryPage> => {
    await requireActorHasBusinessCapability(
      ctx,
      args.businessId,
      'access_campaigns'
    );
    const campaign = await getCampaignAnyStateOrThrow(
      ctx,
      args.businessId,
      args.campaignId
    );
    assertExpectedUpdatedAt({
      entity: 'campaign',
      entityId: String(campaign._id),
      expectedUpdatedAt: args.revision,
      actualUpdatedAt: campaign.updatedAt,
    });
    const page = await ctx.db
      .query('messageLog')
      .withIndex('by_campaignId_toUserId', (q) =>
        q.eq('campaignId', campaign._id)
      )
      .paginate({ cursor: args.cursor, numItems: 150 });
    let count = 0,
      unique = 0,
      last: number | null = null;
    let user = args.previousUser ?? null;
    for (const entry of page.page) {
      if (
        entry.businessId !== args.businessId ||
        entry._creationTime > args.cutoff
      )
        continue;
      count++;
      if (entry.toUserId !== user) {
        unique++;
        user = entry.toUserId;
      }
      last = last === null ? entry.createdAt : Math.max(last, entry.createdAt);
    }
    return {
      count,
      unique,
      last,
      user,
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export const getManagementCampaignHistoryPaged = action({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
    revision: v.number(),
  },
  returns: v.object({
    reachedUniqueAllTime: v.number(),
    reachedMessagesAllTime: v.number(),
    lastSentAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args): Promise<CampaignDeliveryStats> => {
    const cutoff = Date.now();
    let cursor: string | null = null;
    let previousUser: Id<'users'> | undefined;
    let reachedUniqueAllTime = 0,
      reachedMessagesAllTime = 0,
      lastSentAt: number | null = null;
    do {
      const batch: CampaignHistoryPage = await ctx.runQuery(
        internal.campaigns.managementHistoryBatch,
        { ...args, cursor, previousUser, cutoff }
      );
      cursor = batch.cursor;
      previousUser = batch.user ?? undefined;
      reachedUniqueAllTime += batch.unique;
      reachedMessagesAllTime += batch.count;
      if (batch.last !== null)
        lastSentAt =
          lastSentAt === null ? batch.last : Math.max(lastSentAt, batch.last);
    } while (cursor !== null);
    return { reachedUniqueAllTime, reachedMessagesAllTime, lastSentAt };
  },
});

async function recordDeliveryProgress(
  ctx: MutationCtx,
  campaign: Doc<'campaigns'>,
  job: DeliveryJob
) {
  if (job.sent > 0) {
    await recordCampaignRun(ctx, {
      businessId: campaign.businessId,
      campaignId: campaign._id,
      programId: campaign.programId,
      campaignType: campaign.type,
      sentAt: job.referenceNow,
      targetedCount: job.targeted,
      deliveredCount: job.sent,
      lastDeliveryAt: job.referenceNow,
    });
  }
}

export const processManagementDeliveryBatch = internalMutation({
  args: {
    campaignId: v.id('campaigns'),
    referenceNow: v.number(),
    page: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId);
    const job = campaign?.managementDelivery;
    if (
      !campaign ||
      !job ||
      job.referenceNow !== args.referenceNow ||
      job.page !== args.page
    )
      return null;
    const business = await ctx.db.get(campaign.businessId);
    if (
      !business?.isActive ||
      !campaign.isActive ||
      (business.lastRestoredAt ?? 0) > job.referenceNow ||
      campaign.updatedAt !== job.revision ||
      campaign.source === 'smart_manager' ||
      !isManagementType(campaign.type)
    ) {
      if (business) await recordDeliveryProgress(ctx, campaign, job);
      await ctx.db.patch(campaign._id, { managementDelivery: undefined });
      return null;
    }
    try {
      await assertCampaignsNotOverLimit(ctx, campaign.businessId);
    } catch (error) {
      if (!isCampaignLimitReachedError(error)) throw error;
      if (business) await recordDeliveryProgress(ctx, campaign, job);
      await ctx.db.patch(campaign._id, { managementDelivery: undefined });
      return null;
    }
    const audience = await audienceIndex(ctx, campaign).paginate({
      cursor: job.cursor,
      numItems: DELIVERY_PAGE_SIZE,
    });
    const type = normalizeManagementType(campaign.type);
    const rules = normalizeCampaignRules(type, campaign.rules);
    const next = { ...job };
    for (const membership of audience.page) {
      if (
        membership.businessId !== campaign.businessId ||
        !membership.isActive ||
        membership._creationTime > job.referenceNow ||
        membership.userId === next.lastMatchedUserId
      )
        continue;
      const user = await ctx.db.get(membership.userId);
      if (
        !user ||
        !rowMatchesRule(rules, { membership, user }, job.referenceNow)
      )
        continue;
      // The index groups each user's memberships, including at page boundaries.
      next.lastMatchedUserId = user._id;
      next.targeted++;
      const alreadySent =
        job.mode === 'recurring'
          ? await hasAutomationHistory(
              ctx,
              campaign._id,
              user._id,
              type,
              job.referenceNow
            )
          : !!(await ctx.db
              .query('messageLog')
              .withIndex('by_campaignId_toUserId', (q) =>
                q.eq('campaignId', campaign._id).eq('toUserId', user._id)
              )
              .first());
      if (alreadySent) continue;
      await ctx.db.insert('messageLog', {
        businessId: campaign.businessId,
        campaignId: campaign._id,
        toUserId: user._id,
        channel: 'in_app',
        status: 'sent',
        createdAt: job.referenceNow,
      });
      const key =
        job.mode === 'recurring'
          ? ['campaign_automation', campaign._id, job.referenceNow].join(':')
          : undefined;
      await attemptCampaignPushDelivery(ctx, campaign, user._id, key);
      next.sent++;
    }
    if (!audience.isDone) {
      next.cursor = audience.continueCursor;
      next.page++;
      next.nextAttemptAt = Date.now() + DELIVERY_RETRY_MS;
      await ctx.db.patch(campaign._id, { managementDelivery: next });
      await scheduleDeliveryPage(ctx, campaign._id, next);
      return null;
    }
    const completedAt = Math.max(Date.now(), campaign.updatedAt + 1);
    const completeOneTime =
      getScheduleModeFromCampaign(campaign) === 'one_time';
    await recordDeliveryProgress(ctx, campaign, next);
    await ctx.db.patch(campaign._id, {
      managementDelivery: undefined,
      ...(next.sent > 0 || completeOneTime || job.mode === 'manual'
        ? { updatedAt: completedAt }
        : {}),
      ...(completeOneTime
        ? {
            status: 'completed' as const,
            activationStatus: 'completed' as const,
            schedule: {
              ...campaign.schedule,
              mode: 'send_now' as const,
              sendAt: undefined,
              nextRunAt: undefined,
            },
          }
        : {}),
    });
    if (next.sent > 0 || completeOneTime || job.mode === 'manual') {
      await markCampaignFactsDirty(
        ctx,
        campaign.businessId,
        'campaign_automation_transition',
        completedAt
      );
    }
    return null;
  },
});

export const recoverManagementDeliveries = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const campaigns = await ctx.db
      .query('campaigns')
      .withIndex('by_managementDelivery_nextAttemptAt', (q) =>
        q
          .gte('managementDelivery.nextAttemptAt', 0)
          .lte('managementDelivery.nextAttemptAt', now)
      )
      .take(25);
    for (const campaign of campaigns) {
      const job = campaign.managementDelivery;
      if (!job) continue;
      await ctx.db.patch(campaign._id, {
        managementDelivery: { ...job, nextAttemptAt: now + DELIVERY_RETRY_MS },
      });
      await scheduleDeliveryPage(ctx, campaign._id, job);
    }
    return campaigns.length;
  },
});

export const sendCampaignNow = mutation({
  args: {
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
    expectedUpdatedAt: v.optional(v.number()),
    acceptQueued: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { businessId, campaignId, expectedUpdatedAt, acceptQueued }
  ) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'activate_send_campaigns'
    );
    const campaign = await getCampaignOrThrow(ctx, businessId, campaignId);
    assertCampaignIsNotImmutableSmartManagerExecution(campaign);
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
    if (
      campaign.managementDelivery ||
      (await needsDeliveryJob(ctx, campaign))
    ) {
      if (!acceptQueued) throw new Error('CAMPAIGN_CLIENT_UPDATE_REQUIRED');
      if (!campaign.isActive) throw new Error('CAMPAIGN_NOT_FOUND');
      await assertCampaignsNotOverLimit(ctx, businessId);
      await queueDeliveryJob(ctx, campaign, 'manual', now);
      return { queued: true as const, updatedAt: campaign.updatedAt };
    }
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
    await markCampaignFactsDirty(ctx, businessId, 'campaign_sent', now);

    return {
      queued: false as const,
      sentCount: result.sentCount,
      skippedCount: result.skippedCount,
      estimatedAudience: result.estimatedAudience,
      updatedAt: now,
    };
  },
});

export const runAutomationSweepInternal = internalMutation({
  args: {
    phase: v.optional(v.union(v.literal('recurring'), v.literal('one_time'))),
    cursor: v.optional(v.string()),
    referenceNow: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.referenceNow ?? Date.now();
    let continuation: {
      phase: 'recurring' | 'one_time';
      cursor?: string;
    } | null = null;
    const israelHour = getIsraelHour(now);
    const shouldRunRecurring = israelHour === 9;
    let recurringProcessedCampaigns = 0;
    let oneTimeProcessedCampaigns = 0;
    let sentCount = 0;
    let skippedCount = 0;
    const overLimitByBusiness = new Map<string, boolean>();
    const businessById = new Map<string, Doc<'businesses'> | null>();
    const dirtyBusinessIds = new Map<string, Id<'businesses'>>();

    const getBusiness = async (businessId: Id<'businesses'>) => {
      const businessKey = String(businessId);
      if (!businessById.has(businessKey)) {
        businessById.set(businessKey, await ctx.db.get(businessId));
      }
      return businessById.get(businessKey) ?? null;
    };

    if (shouldRunRecurring && args.phase !== 'one_time') {
      const recurringPage = await ctx.db
        .query('campaigns')
        .withIndex('by_automationEnabled', (q: any) =>
          q.eq('automationEnabled', true)
        )
        .paginate({ cursor: args.cursor ?? null, numItems: 10 });
      continuation = recurringPage.isDone
        ? { phase: 'one_time' }
        : { phase: 'recurring', cursor: recurringPage.continueCursor };
      await ctx.scheduler.runAfter(
        0,
        internal.campaigns.runAutomationSweepInternal,
        { ...continuation, referenceNow: now }
      );

      for (const campaign of recurringPage.page) {
        if (campaign.isActive !== true || campaign.type === 'ai_marketing')
          continue;
        if (campaign.source === 'smart_manager') {
          continue;
        }
        if (!isManagementType(campaign.type)) {
          continue;
        }
        const business = await getBusiness(campaign.businessId);
        if (!business || business.isActive !== true) {
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
        if (
          campaign.managementDelivery ||
          (await needsDeliveryJob(ctx, campaign))
        ) {
          await queueDeliveryJob(ctx, campaign, 'recurring', now);
          continue;
        }
        const result = await sendAutomationForCampaign(ctx, campaign, now);
        sentCount += result.sentCount;
        skippedCount += result.skippedCount;
        if (result.sentCount > 0) {
          dirtyBusinessIds.set(
            String(campaign.businessId),
            campaign.businessId
          );
        }
      }
    }

    if (!continuation) {
      const oneTimePage = await ctx.db
        .query('campaigns')
        .withIndex('by_activationStatus', (q: any) =>
          q.eq('activationStatus', 'active')
        )
        .paginate({
          cursor: args.phase === 'one_time' ? (args.cursor ?? null) : null,
          numItems: 10,
        });
      if (!oneTimePage.isDone)
        continuation = {
          phase: 'one_time',
          cursor: oneTimePage.continueCursor,
        };
      if (continuation)
        await ctx.scheduler.runAfter(
          0,
          internal.campaigns.runAutomationSweepInternal,
          { ...continuation, referenceNow: now }
        );

      for (const campaign of oneTimePage.page) {
        if (
          campaign.isActive !== true ||
          campaign.automationEnabled !== false ||
          ['ai_marketing', 'ai_retention', 'retention_action'].includes(
            campaign.type
          )
        )
          continue;
        if (campaign.source === 'smart_manager') {
          continue;
        }
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

        const business = await getBusiness(campaign.businessId);
        if (!business || business.isActive !== true) {
          continue;
        }
        if (
          typeof business.lastRestoredAt === 'number' &&
          sendAt <= business.lastRestoredAt
        ) {
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
        if (
          campaign.managementDelivery ||
          (await needsDeliveryJob(ctx, campaign))
        ) {
          await queueDeliveryJob(ctx, campaign, 'one_time', now);
          continue;
        }
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
        dirtyBusinessIds.set(String(campaign.businessId), campaign.businessId);
      }
    }

    for (const businessId of dirtyBusinessIds.values()) {
      await markCampaignFactsDirty(
        ctx,
        businessId,
        'campaign_automation_transition',
        now
      );
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

async function inboxItems(ctx: QueryCtx, logs: Doc<'messageLog'>[]) {
  return await Promise.all(
    logs.map(async (log) => {
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
}

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
    return await inboxItems(ctx, sorted);
  },
});

export const listInboxForCustomerPage = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      messageId: v.id('messageLog'),
      campaignId: v.union(v.id('campaigns'), v.null()),
      businessId: v.id('businesses'),
      businessName: v.string(),
      campaignType: v.string(),
      title: v.string(),
      body: v.string(),
      destinationHref: v.union(v.string(), v.null()),
      notificationType: v.union(v.string(), v.null()),
      createdAt: v.number(),
      readAt: v.union(v.number(), v.null()),
      status: v.string(),
    })
  ),
  handler: async (ctx, { paginationOpts }) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return { page: [], isDone: true, continueCursor: '' };
    const page = await ctx.db
      .query('messageLog')
      .withIndex('by_toUserId_createdAt', (q) => q.eq('toUserId', user._id))
      .order('desc')
      .paginate({
        ...paginationOpts,
        numItems: Math.min(25, Math.max(1, paginationOpts.numItems)),
      });
    return { ...page, page: await inboxItems(ctx, page.page) };
  },
});
