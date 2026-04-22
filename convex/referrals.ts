import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import {
  getCurrentUserOrNull,
  requireActorHasBusinessCapability,
  requireCurrentUser,
} from './guards';
import { sendPushNotificationToUser } from './pushNotifications';

const CUSTOMER_REFERRAL_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const B2B_REFERRAL_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const B2B_QUALIFICATION_DELAY_MS = 30 * 24 * 60 * 60 * 1000;
const B2B_REWARD_CAP_MONTHS = 24;
const LINK_OPEN_COUNTER_WINDOW_MS = 60 * 60 * 1000;
const LINK_OPEN_COUNTER_MAX_PER_HOUR = 60;

type ReferralRewardType = 'STAMP' | 'BENEFIT';
type RewardRecipients = 'referrer' | 'referred' | 'both';
type MonthlyLimit = 'unlimited' | 5 | 10 | 20 | 50;
type ShareSurface = 'card_screen' | 'business_page';

type ReferralConfigPayload = {
  isEnabled: boolean;
  rewardType: ReferralRewardType;
  rewardValue: number;
  benefitTitle?: string;
  benefitDescription?: string;
  benefitExpirationDays?: 14 | 30 | 60 | 90;
  rewardRecipients: RewardRecipients;
  monthlyLimit: MonthlyLimit;
};

function getDefaultConfig() {
  return {
    isEnabled: true,
    rewardType: 'STAMP' as const,
    rewardValue: 1,
    benefitTitle: undefined,
    benefitDescription: undefined,
    benefitExpirationDays: 30 as const,
    rewardRecipients: 'both' as const,
    monthlyLimit: 10 as const,
  };
}

function normalizeMonthlyLimit(value: unknown): MonthlyLimit {
  if (
    value === 'unlimited' ||
    value === 5 ||
    value === 10 ||
    value === 20 ||
    value === 50
  ) {
    return value;
  }
  return 10;
}

function normalizeRewardValue(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.floor(value));
}

function normalizeBenefitExpirationDays(
  value: unknown
): 14 | 30 | 60 | 90 | undefined {
  if (value === 14 || value === 30 || value === 60 || value === 90) {
    return value;
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  return 30;
}

function normalizeRewardRecipients(value: unknown): RewardRecipients {
  if (value === 'referrer' || value === 'referred' || value === 'both') {
    return value;
  }
  return 'both';
}

function normalizeRewardType(value: unknown): ReferralRewardType {
  if (value === 'STAMP' || value === 'BENEFIT') {
    return value;
  }
  return 'STAMP';
}

function trimOptionalText(value: string | undefined, maxLength: number) {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, maxLength);
}

function buildMonthWindow(now: number) {
  const date = new Date(now);
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  ).getTime();
  const monthKey = `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return { start, monthKey };
}

function buildReferralCode(prefix: 'ref' | 'bref' = 'ref') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`.toUpperCase();
}

function buildCustomerReferralLinkUrl(code: string) {
  return `https://stampix.app/join?ref=${encodeURIComponent(code)}`;
}

function buildBusinessReferralLinkUrl(code: string) {
  return `https://stampix.app/join?bref=${encodeURIComponent(code)}`;
}

function addMonthsUtc(timestamp: number, months: number) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  return Date.UTC(
    year,
    month,
    day,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  );
}

function normalizeSourceStatus(status: string | undefined) {
  return status === 'active' || status === 'trialing';
}

function isPaidBusinessActive(business: Doc<'businesses'> | null) {
  if (!business || business.isActive !== true) {
    return false;
  }
  const plan = business.subscriptionPlan ?? 'starter';
  if (plan === 'starter') {
    return false;
  }
  return normalizeSourceStatus(business.subscriptionStatus);
}

function isDocExpired(expiresAt: number | undefined, now: number) {
  if (typeof expiresAt !== 'number') {
    return false;
  }
  return now >= expiresAt;
}

async function ensureReferralConfigDoc(
  ctx: any,
  businessId: Id<'businesses'>,
  actorUserId: Id<'users'>
) : Promise<Doc<'referralConfigs'>> {
  const existing = await ctx.db
    .query('referralConfigs')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .first() as Doc<'referralConfigs'> | null;
  if (existing) {
    return existing;
  }

  const now = Date.now();
  const defaults = getDefaultConfig();
  const _id = await ctx.db.insert('referralConfigs', {
    businessId,
    isEnabled: defaults.isEnabled,
    configVersion: 1,
    rewardType: defaults.rewardType,
    rewardValue: defaults.rewardValue,
    benefitTitle: defaults.benefitTitle,
    benefitDescription: defaults.benefitDescription,
    benefitExpirationDays: defaults.benefitExpirationDays,
    rewardRecipients: defaults.rewardRecipients,
    monthlyLimit: defaults.monthlyLimit,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    createdAt: now,
    updatedAt: now,
  });
  const created = (await ctx.db.get(_id)) as Doc<'referralConfigs'> | null;
  if (!created) {
    throw new Error('REFERRAL_CONFIG_CREATE_FAILED');
  }
  return created;
}

async function findCustomerReferralLinkByCode(ctx: any, code: string) {
  const row = await ctx.db
    .query('customerReferralLinks')
    .withIndex('by_code', (q: any) => q.eq('code', code))
    .first();
  return row as Doc<'customerReferralLinks'> | null;
}

async function findBusinessReferralLinkByCode(ctx: any, code: string) {
  const row = await ctx.db
    .query('businessReferralLinks')
    .withIndex('by_code', (q: any) => q.eq('code', code))
    .first();
  return row as Doc<'businessReferralLinks'> | null;
}

async function getBusinessDoc(ctx: any, businessId: Id<'businesses'>) {
  return (await ctx.db.get(businessId)) as Doc<'businesses'> | null;
}

async function getUserDoc(ctx: any, userId: Id<'users'>) {
  return (await ctx.db.get(userId)) as Doc<'users'> | null;
}

async function getCustomerReferralDoc(
  ctx: any,
  customerReferralId: Id<'customerReferrals'>
) {
  return (await ctx.db.get(customerReferralId)) as Doc<'customerReferrals'> | null;
}

async function maybeMarkExpiredLink(
  ctx: any,
  link: any,
  table: 'customerReferralLinks' | 'businessReferralLinks',
  now: number
) {
  if (link.status !== 'active') {
    return link.status;
  }
  if (!isDocExpired(link.expiresAt, now)) {
    return link.status;
  }
  await ctx.db.patch(link._id, {
    status: 'expired',
    updatedAt: now,
  });
  return 'expired';
}

async function listBusinessManagersAndOwners(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const staff = await ctx.db
    .query('businessStaff')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .collect();

  return staff.filter(
    (row: any) =>
      row.isActive === true &&
      row.status !== 'removed' &&
      (row.staffRole === 'owner' || row.staffRole === 'manager')
  );
}

async function sendReferralNotification(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    toUserId: Id<'users'>;
    eventName: string;
    title: string;
    body: string;
    destinationHref: string;
    dedupeKey: string;
    payload: Record<string, unknown>;
  }
) {
  const existing = await ctx.db
    .query('messageLog')
    .withIndex('by_toUserId_dedupeKey', (q: any) =>
      q.eq('toUserId', args.toUserId).eq('dedupeKey', args.dedupeKey)
    )
    .first();
  if (existing) {
    return;
  }

  const now = Date.now();
  await ctx.db.insert('messageLog', {
    businessId: args.businessId,
    campaignId: undefined,
    campaignRunId: undefined,
    campaignFamily: undefined,
    opportunityType: undefined,
    toUserId: args.toUserId,
    channel: 'in_app',
    notificationType: args.eventName,
    dedupeKey: args.dedupeKey,
    status: 'sent',
    deliveryStatus: 'inbox',
    providerMessageId: undefined,
    inboxPayload: {
      title: args.title,
      body: args.body,
      destinationHref: args.destinationHref,
      payload: args.payload,
      type: 'referral_notification',
      createdAt: now,
    },
    readAt: undefined,
    createdAt: now,
  });

  try {
    await sendPushNotificationToUser(ctx, {
      businessId: args.businessId,
      toUserId: args.toUserId,
      title: args.title,
      body: args.body,
    });
  } catch {
    // Notification delivery is best-effort and must not fail referral flow.
  }
}

async function getProgramById(
  ctx: any,
  programId: Id<'loyaltyPrograms'> | undefined
) {
  if (!programId) {
    return null;
  }
  const program = await ctx.db.get(programId);
  if (!program || program.isActive !== true) {
    return null;
  }
  return program;
}

async function resolveStampTargetMembership(
  ctx: any,
  args: {
    recipientUserId: Id<'users'>;
    businessId: Id<'businesses'>;
    originProgramId: Id<'loyaltyPrograms'>;
  }
) {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_userId_businessId', (q: any) =>
      q.eq('userId', args.recipientUserId).eq('businessId', args.businessId)
    )
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .collect();

  if (memberships.length === 0) {
    return null;
  }

  const originMembership =
    memberships.find(
      (membership: any) =>
        String(membership.programId) === String(args.originProgramId)
    ) ?? null;

  if (originMembership) {
    const originProgram = await getProgramById(ctx, originMembership.programId);
    if (originProgram) {
      return { membership: originMembership, program: originProgram };
    }
  }

  const sorted = [...memberships].sort((a: any, b: any) => {
    const left = Number(a.lastStampAt ?? a.updatedAt ?? a.createdAt ?? 0);
    const right = Number(b.lastStampAt ?? b.updatedAt ?? b.createdAt ?? 0);
    return right - left;
  });

  for (const membership of sorted) {
    const program = await getProgramById(ctx, membership.programId);
    if (program) {
      return { membership, program };
    }
  }

  return null;
}

function buildBenefitExpiry(
  expiresInDays: 14 | 30 | 60 | 90 | undefined,
  now: number
) {
  if (expiresInDays == null) {
    return undefined;
  }
  return now + expiresInDays * 24 * 60 * 60 * 1000;
}

function getRewardRecipientUserIds(
  recipients: RewardRecipients,
  referrerUserId: Id<'users'>,
  referredUserId: Id<'users'>
) {
  if (recipients === 'referrer') {
    return [{ userId: referrerUserId, role: 'referrer' as const }];
  }
  if (recipients === 'referred') {
    return [{ userId: referredUserId, role: 'referred' as const }];
  }
  return [
    { userId: referrerUserId, role: 'referrer' as const },
    { userId: referredUserId, role: 'referred' as const },
  ];
}

async function countReferrerRewardsThisMonth(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    referrerUserId: Id<'users'>;
    monthStart: number;
  }
) {
  const statuses: Array<'granted' | 'redeemed' | 'expired' | 'revoked'> = [
    'granted',
    'redeemed',
    'expired',
    'revoked',
  ];

  let count = 0;
  for (const status of statuses) {
    const rows = await ctx.db
      .query('referralRewards')
      .withIndex('by_businessId_recipientUserId_status', (q: any) =>
        q
          .eq('businessId', args.businessId)
          .eq('recipientUserId', args.referrerUserId)
          .eq('status', status)
      )
      .collect();
    count += rows.filter(
      (row: any) =>
        row.recipientRole === 'referrer' &&
        Number(row.createdAt) >= args.monthStart
    ).length;
  }
  return count;
}

function monthlyLimitToNumber(limit: MonthlyLimit) {
  if (limit === 'unlimited') {
    return null;
  }
  return Number(limit);
}

async function requireAdminUser(ctx: any) {
  const actor = await requireCurrentUser(ctx);
  if (actor.isAdmin !== true) {
    throw new Error('NOT_AUTHORIZED');
  }
  return actor;
}

async function createOrReuseCustomerReferralLink(
  ctx: any,
  args: {
    actorUserId: Id<'users'>;
    businessId: Id<'businesses'>;
    originProgramId: Id<'loyaltyPrograms'>;
    membershipId?: Id<'memberships'>;
    shareSurface: ShareSurface;
  }
) : Promise<Doc<'customerReferralLinks'>> {
  const now = Date.now();
  const business = await getBusinessDoc(ctx, args.businessId);
  if (!business || business.isActive !== true) {
    throw new Error('BUSINESS_NOT_FOUND');
  }
  const config = await ensureReferralConfigDoc(
    ctx,
    args.businessId,
    args.actorUserId
  );
  if (config.isEnabled !== true) {
    throw new Error('REFERRALS_DISABLED');
  }

  const program = (await ctx.db.get(
    args.originProgramId
  )) as Doc<'loyaltyPrograms'> | null;
  if (
    !program ||
    program.isActive !== true ||
    String(program.businessId) !== String(args.businessId)
  ) {
    throw new Error('PROGRAM_NOT_FOUND');
  }

  if (args.membershipId) {
    const membership = (await ctx.db.get(
      args.membershipId
    )) as Doc<'memberships'> | null;
    if (
      !membership ||
      membership.isActive !== true ||
      String(membership.userId) !== String(args.actorUserId) ||
      String(membership.businessId) !== String(args.businessId) ||
      String(membership.programId) !== String(args.originProgramId)
    ) {
      throw new Error('MEMBERSHIP_NOT_FOUND');
    }
  }

  const activeCandidates = await ctx.db
    .query('customerReferralLinks')
    .withIndex('by_referrer_business_origin_status', (q: any) =>
      q
        .eq('referrerUserId', args.actorUserId)
        .eq('businessId', args.businessId)
        .eq('originProgramId', args.originProgramId)
        .eq('status', 'active')
    )
    .collect();

  const reusable =
    (activeCandidates as Doc<'customerReferralLinks'>[]).find(
      (link) => Number(link.expiresAt) > now
    ) ?? null;
  if (reusable) {
    return reusable;
  }

  let code = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    code = buildReferralCode('ref');
    const existingCode = await findCustomerReferralLinkByCode(ctx, code);
    if (!existingCode) {
      break;
    }
    code = '';
  }
  if (!code) {
    throw new Error('REFERRAL_CODE_GENERATION_FAILED');
  }

  const linkId = await ctx.db.insert('customerReferralLinks', {
    code,
    businessId: args.businessId,
    referrerUserId: args.actorUserId,
    originProgramId: args.originProgramId,
    membershipId: args.membershipId,
    shareSurface: args.shareSurface,
    status: 'active',
    expiresAt: now + CUSTOMER_REFERRAL_LINK_TTL_MS,
    openCount: 0,
    lastOpenedAt: undefined,
    lastOpenedByUserId: undefined,
    lastOpenCountedAt: undefined,
    createdAt: now,
    updatedAt: now,
  });

  const created = (await ctx.db.get(
    linkId
  )) as Doc<'customerReferralLinks'> | null;
  if (!created) {
    throw new Error('REFERRAL_LINK_CREATE_FAILED');
  }
  return created;
}

export async function processReferralAfterJoin(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    referredUserId: Id<'users'>;
    referralCode?: string;
    joinedMembershipIds: Id<'memberships'>[];
    joinedProgramStatuses: Array<'created' | 'existing' | 'reactivated'>;
    hadAnyBusinessMembershipBeforeJoin: boolean;
  }
) {
  const code = args.referralCode?.trim();
  if (!code) {
    return { ok: true, skipped: 'no_referral_code' as const };
  }

  const now = Date.now();
  const link = await findCustomerReferralLinkByCode(ctx, code.toUpperCase());
  if (!link) {
    return { ok: true, skipped: 'link_not_found' as const };
  }

  const resolvedStatus = await maybeMarkExpiredLink(
    ctx,
    link,
    'customerReferralLinks',
    now
  );
  if (resolvedStatus !== 'active') {
    return { ok: true, skipped: 'link_inactive' as const };
  }
  if (String(link.businessId) !== String(args.businessId)) {
    return { ok: true, skipped: 'business_mismatch' as const };
  }
  if (String(link.referrerUserId) === String(args.referredUserId)) {
    return { ok: true, skipped: 'self_referral' as const };
  }
  if (args.hadAnyBusinessMembershipBeforeJoin) {
    return { ok: true, skipped: 'existing_customer' as const };
  }
  if (args.joinedProgramStatuses.some((status) => status !== 'created')) {
    return { ok: true, skipped: 'existing_customer' as const };
  }

  const existingReferral = await ctx.db
    .query('customerReferrals')
    .withIndex('by_businessId_referredUserId', (q: any) =>
      q
        .eq('businessId', args.businessId)
        .eq('referredUserId', args.referredUserId)
    )
    .first();
  if (existingReferral) {
    return { ok: true, skipped: 'first_referral_wins' as const };
  }

  const config = await ensureReferralConfigDoc(
    ctx,
    args.businessId,
    link.referrerUserId
  );

  let originMembershipId = args.joinedMembershipIds[0];
  for (const membershipId of args.joinedMembershipIds) {
    const membership = (await ctx.db.get(membershipId)) as
      | Doc<'memberships'>
      | null;
    if (
      membership &&
      String(membership.programId) === String(link.originProgramId)
    ) {
      originMembershipId = membershipId;
      break;
    }
  }

  const referralId = await ctx.db.insert('customerReferrals', {
    businessId: args.businessId,
    referralLinkId: link._id,
    referrerUserId: link.referrerUserId,
    referredUserId: args.referredUserId,
    originProgramId: link.originProgramId,
    originMembershipId,
    joinedMembershipIds: args.joinedMembershipIds,
    status: 'pending',
    skipReason: undefined,
    rewardGrantStatus: 'not_started',
    qualificationEventId: undefined,
    qualifiedAt: undefined,
    completedAt: undefined,
    rewardDefinitionSnapshot: {
      configVersion: config.configVersion,
      rewardType: config.rewardType,
      rewardValue: config.rewardValue,
      benefitTitle: config.benefitTitle,
      benefitDescription: config.benefitDescription,
      benefitExpirationDays: config.benefitExpirationDays,
      rewardRecipients: config.rewardRecipients,
      monthlyLimit: config.monthlyLimit,
      originProgramId: link.originProgramId,
      originMembershipId,
      createdAt: now,
    },
    createdAt: now,
    updatedAt: now,
  });

  const referral = await ctx.db.get(referralId);
  if (!referral) {
    throw new Error('REFERRAL_CREATE_FAILED');
  }

  await sendReferralNotification(ctx, {
    businessId: args.businessId,
    toUserId: link.referrerUserId,
    eventName: 'referral_created',
    title: 'חבר הצטרף דרך ההזמנה שלך',
    body: 'ברגע שיבצע ניקוב ראשון תקבלו מתנה.',
    destinationHref: `/(authenticated)/(customer)/referrals?referralId=${String(referralId)}`,
    dedupeKey: `referral_created:${String(referralId)}:${String(link.referrerUserId)}`,
    payload: {
      customerReferralId: String(referralId),
      businessId: String(args.businessId),
      referrerUserId: String(link.referrerUserId),
      referredUserId: String(args.referredUserId),
      originProgramId: String(link.originProgramId),
      joinedMembershipIds: args.joinedMembershipIds.map(String),
    },
  });

  const businessManagers = await listBusinessManagersAndOwners(
    ctx,
    args.businessId
  );
  for (const manager of businessManagers) {
    await sendReferralNotification(ctx, {
      businessId: args.businessId,
      toUserId: manager.userId,
      eventName: 'new_referred_customer',
      title: 'לקוח חדש הצטרף דרך הזמנה',
      body: 'הפניה ממתינה לניקוב ראשון של הלקוח.',
      destinationHref: `/(authenticated)/(business)/customer/${String(args.referredUserId)}?section=referrals`,
      dedupeKey: `new_referred_customer:${String(referralId)}:${String(manager.userId)}`,
      payload: {
        customerReferralId: String(referralId),
        businessId: String(args.businessId),
        referredUserId: String(args.referredUserId),
        referrerUserId: String(link.referrerUserId),
      },
    });
  }

  return { ok: true, referralId };
}

export async function qualifyCustomerReferralAfterStamp(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    referredUserId: Id<'users'>;
    stampEventId: Id<'events'>;
    stampCreatedAt: number;
    stampProgramId: Id<'loyaltyPrograms'>;
    stampMembershipId?: Id<'memberships'>;
    actorUserId: Id<'users'>;
    scannerRuntimeSessionId?: string;
    deviceId?: string;
  }
) {
  const referral = await ctx.db
    .query('customerReferrals')
    .withIndex('by_businessId_referredUserId', (q: any) =>
      q
        .eq('businessId', args.businessId)
        .eq('referredUserId', args.referredUserId)
    )
    .first();

  if (!referral || referral.status !== 'pending') {
    return {
      rewardTriggered: false,
      referralId: referral?._id ?? null,
      rewardIds: [] as Id<'referralRewards'>[],
      reason: 'no_pending_referral',
    };
  }

  if (referral.qualificationEventId) {
    return {
      rewardTriggered: false,
      referralId: referral._id,
      rewardIds: [] as Id<'referralRewards'>[],
      reason: 'already_qualified',
    };
  }

  const events = await ctx.db
    .query('events')
    .withIndex('by_businessId_customerUserId_createdAt', (q: any) =>
      q
        .eq('businessId', args.businessId)
        .eq('customerUserId', args.referredUserId)
    )
    .collect();

  const normalStampEvents = events
    .filter(
      (event: any) =>
        event.type === 'STAMP_ADDED' && event.source === 'scanner_commit'
    )
    .sort((a: any, b: any) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt;
      }
      return String(a._id).localeCompare(String(b._id));
    });

  if (
    normalStampEvents.length === 0 ||
    String(normalStampEvents[0]?._id) !== String(args.stampEventId)
  ) {
    const latest = await getCustomerReferralDoc(ctx, referral._id);
    if (
      !latest ||
      latest.status !== 'pending' ||
      latest.qualificationEventId != null
    ) {
      return {
        rewardTriggered: false,
        referralId: referral._id,
        rewardIds: [] as Id<'referralRewards'>[],
        reason: 'already_processed',
      };
    }
    const now = Date.now();
    await ctx.db.patch(referral._id, {
      status: 'skipped',
      skipReason: 'not_first_stamp',
      rewardGrantStatus: 'skipped_no_recipient',
      updatedAt: now,
      completedAt: now,
    });
    return {
      rewardTriggered: false,
      referralId: referral._id,
      rewardIds: [] as Id<'referralRewards'>[],
      reason: 'not_first_stamp',
    };
  }

  const latestBeforeQualification = await getCustomerReferralDoc(
    ctx,
    referral._id
  );
  if (
    !latestBeforeQualification ||
    latestBeforeQualification.status !== 'pending' ||
    latestBeforeQualification.qualificationEventId != null
  ) {
    return {
      rewardTriggered: false,
      referralId: referral._id,
      rewardIds: [] as Id<'referralRewards'>[],
      reason: 'already_processed',
    };
  }

  const now = Date.now();
  await ctx.db.patch(referral._id, {
    status: 'qualified',
    qualificationEventId: args.stampEventId,
    qualifiedAt: now,
    updatedAt: now,
  });

  const snapshot = latestBeforeQualification.rewardDefinitionSnapshot;
  const monthlyLimit = normalizeMonthlyLimit(snapshot.monthlyLimit);
  const monthWindow = buildMonthWindow(now);
  const numericMonthlyLimit = monthlyLimitToNumber(monthlyLimit);
  if (numericMonthlyLimit !== null) {
    const thisMonthCount = await countReferrerRewardsThisMonth(ctx, {
      businessId: args.businessId,
      referrerUserId: latestBeforeQualification.referrerUserId,
      monthStart: monthWindow.start,
    });
    if (thisMonthCount >= numericMonthlyLimit) {
      await ctx.db.patch(referral._id, {
        status: 'completed',
        rewardGrantStatus: 'skipped_limit',
        updatedAt: now,
        completedAt: now,
      });
      return {
        rewardTriggered: false,
        referralId: referral._id,
        rewardIds: [] as Id<'referralRewards'>[],
        reason: 'monthly_limit_reached',
      };
    }
  }

  const rewardIds: Id<'referralRewards'>[] = [];
  const recipients = getRewardRecipientUserIds(
    normalizeRewardRecipients(snapshot.rewardRecipients),
    latestBeforeQualification.referrerUserId,
    latestBeforeQualification.referredUserId
  );

  for (const recipient of recipients) {
    const existingReward = await ctx.db
      .query('referralRewards')
      .withIndex('by_customerReferralId_recipientUserId', (q: any) =>
        q
          .eq('customerReferralId', referral._id)
          .eq('recipientUserId', recipient.userId)
      )
      .first();
    if (existingReward) {
      continue;
    }

    const configuredRewardType = normalizeRewardType(snapshot.rewardType);
    const rewardValue = normalizeRewardValue(snapshot.rewardValue);
    let actualRewardType: ReferralRewardType = configuredRewardType;
    let targetMembershipId: Id<'memberships'> | undefined;
    let targetProgramId: Id<'loyaltyPrograms'> | undefined;
    let grantedEventId: Id<'events'> | undefined;
    let conversionReason: string | undefined;
    let benefitTitle = snapshot.benefitTitle;
    let benefitDescription = snapshot.benefitDescription;
    let expiresAt = buildBenefitExpiry(
      normalizeBenefitExpirationDays(snapshot.benefitExpirationDays),
      now
    );

    if (configuredRewardType === 'STAMP') {
      const target = await resolveStampTargetMembership(ctx, {
        recipientUserId: recipient.userId,
        businessId: latestBeforeQualification.businessId,
        originProgramId: latestBeforeQualification.originProgramId,
      });

      if (!target) {
        actualRewardType = 'BENEFIT';
        conversionReason = 'no_active_target_membership';
      } else {
        const currentStamps = Number(target.membership.currentStamps ?? 0);
        const maxStamps = Number(target.program.maxStamps ?? 0);
        if (currentStamps >= maxStamps) {
          actualRewardType = 'BENEFIT';
          conversionReason = 'stamp_target_full';
        } else {
          const nextStamps = Math.min(maxStamps, currentStamps + rewardValue);
          await ctx.db.patch(target.membership._id, {
            currentStamps: nextStamps,
            updatedAt: now,
          });

          grantedEventId = await ctx.db.insert('events', {
            type: 'REFERRAL_STAMP_GRANTED',
            businessId: latestBeforeQualification.businessId,
            programId: target.program._id,
            membershipId: target.membership._id,
            actorUserId: args.actorUserId,
            customerUserId: recipient.userId,
            source: 'referral_reward',
            revertsEventId: undefined,
            reversalEventId: undefined,
            reasonCode: undefined,
            reasonNote: undefined,
            scannerRuntimeSessionId: args.scannerRuntimeSessionId,
            deviceId: args.deviceId,
            membershipStateBefore: {
              currentStamps,
              lastStampAt: target.membership.lastStampAt,
              isActive: true,
            },
            membershipStateAfter: {
              currentStamps: nextStamps,
              lastStampAt: target.membership.lastStampAt,
              isActive: true,
            },
            metadata: {
              previous: currentStamps,
              next: nextStamps,
              rewardSource: 'customer_referral',
              customerReferralId: String(latestBeforeQualification._id),
            },
            createdAt: now,
          });

          targetMembershipId = target.membership._id;
          targetProgramId = target.program._id;
          expiresAt = undefined;
          benefitTitle = undefined;
          benefitDescription = undefined;
        }
      }
    }

    if (actualRewardType === 'BENEFIT') {
      if (!benefitTitle || benefitTitle.trim().length === 0) {
        benefitTitle = 'Referral reward';
      }
      if (!benefitDescription || benefitDescription.trim().length === 0) {
        benefitDescription = 'הטבה ידנית למימוש מול הצוות';
      }
    }

    const rewardId = await ctx.db.insert('referralRewards', {
      customerReferralId: referral._id,
      businessId: latestBeforeQualification.businessId,
      recipientUserId: recipient.userId,
      recipientRole: recipient.role,
      configuredRewardType,
      actualRewardType,
      conversionReason,
      rewardValue,
      benefitTitle,
      benefitDescription,
      targetProgramId:
        targetProgramId ?? latestBeforeQualification.originProgramId,
      targetMembershipId,
      status: 'granted',
      grantedEventId,
      redeemedEventId: undefined,
      qualificationEventId: args.stampEventId,
      expiresAt,
      redeemedAt: undefined,
      redeemedByUserId: undefined,
      redemptionScanSessionId: undefined,
      createdAt: now,
      updatedAt: now,
    });
    rewardIds.push(rewardId);

    await sendReferralNotification(ctx, {
      businessId: latestBeforeQualification.businessId,
      toUserId: recipient.userId,
      eventName: 'reward_granted',
      title: 'קיבלת מתנה מהזמנת חבר',
      body:
        actualRewardType === 'STAMP'
          ? 'התקבל ניקוב מהזמנת חבר'
          : 'התקבלה הטבה חדשה בארנק',
      destinationHref: targetMembershipId
        ? `/(authenticated)/card/${String(targetMembershipId)}`
        : `/(authenticated)/(customer)/referrals?tab=rewards&rewardId=${String(rewardId)}`,
      dedupeKey: `reward_granted:${String(rewardId)}:${String(recipient.userId)}`,
      payload: {
        customerReferralId: String(latestBeforeQualification._id),
        referralRewardId: String(rewardId),
        businessId: String(latestBeforeQualification.businessId),
        recipientUserId: String(recipient.userId),
        recipientRole: recipient.role,
        actualRewardType,
        targetMembershipId: targetMembershipId
          ? String(targetMembershipId)
          : null,
        expiresAt: expiresAt ?? null,
      },
    });
  }

  const completedAt = Date.now();
  await ctx.db.patch(referral._id, {
    status: 'completed',
    rewardGrantStatus:
      rewardIds.length > 0 ? 'granted' : 'skipped_no_recipient',
    updatedAt: completedAt,
    completedAt,
  });

  await sendReferralNotification(ctx, {
    businessId: latestBeforeQualification.businessId,
    toUserId: latestBeforeQualification.referrerUserId,
    eventName: 'referral_qualified',
    title: 'חבר שהזמנת ביצע ניקוב ראשון',
    body: rewardIds.length > 0 ? 'קיבלתם מתנה.' : 'ההפניה הושלמה.',
    destinationHref: `/(authenticated)/(customer)/referrals?referralId=${String(latestBeforeQualification._id)}`,
    dedupeKey: `referral_qualified:${String(latestBeforeQualification._id)}:${String(latestBeforeQualification.referrerUserId)}`,
    payload: {
      customerReferralId: String(latestBeforeQualification._id),
      businessId: String(latestBeforeQualification.businessId),
      qualificationEventId: String(args.stampEventId),
      qualifiedAt: now,
      rewardGrantStatus:
        rewardIds.length > 0 ? 'granted' : 'skipped_no_recipient',
    },
  });

  const managers = await listBusinessManagersAndOwners(
    ctx,
    latestBeforeQualification.businessId
  );
  for (const manager of managers) {
    await sendReferralNotification(ctx, {
      businessId: latestBeforeQualification.businessId,
      toUserId: manager.userId,
      eventName: 'referral_qualified',
      title: 'הזמנה הושלמה והמתנה נוצרה',
      body:
        rewardIds.length > 0 ? 'המתנות נוספו לפי ההגדרה.' : 'לא הוענקה מתנה.',
      destinationHref: `/(authenticated)/(business)/settings-business-referrals?tab=customers&referralId=${String(latestBeforeQualification._id)}`,
      dedupeKey: `biz_referral_qualified:${String(latestBeforeQualification._id)}:${String(manager.userId)}`,
      payload: {
        customerReferralId: String(latestBeforeQualification._id),
        businessId: String(latestBeforeQualification.businessId),
        qualificationEventId: String(args.stampEventId),
      },
    });
  }

  return {
    rewardTriggered: rewardIds.length > 0,
    referralId: latestBeforeQualification._id,
    rewardIds,
    reason: rewardIds.length > 0 ? 'granted' : 'skipped_no_recipient',
  };
}

export const getReferralConfig = query({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    await requireActorHasBusinessCapability(ctx, businessId, 'view_settings');
    const config = await ctx.db
      .query('referralConfigs')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .first();

    if (!config) {
      return {
        businessId,
        configVersion: 0,
        ...getDefaultConfig(),
      };
    }
    return config;
  },
});

export const saveReferralConfig = mutation({
  args: {
    businessId: v.id('businesses'),
    isEnabled: v.boolean(),
    rewardType: v.union(v.literal('STAMP'), v.literal('BENEFIT')),
    rewardValue: v.number(),
    benefitTitle: v.optional(v.string()),
    benefitDescription: v.optional(v.string()),
    benefitExpirationDays: v.optional(
      v.union(
        v.literal(14),
        v.literal(30),
        v.literal(60),
        v.literal(90),
        v.null()
      )
    ),
    rewardRecipients: v.union(
      v.literal('referrer'),
      v.literal('referred'),
      v.literal('both')
    ),
    monthlyLimit: v.union(
      v.literal('unlimited'),
      v.literal(5),
      v.literal(10),
      v.literal(20),
      v.literal(50)
    ),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireActorHasBusinessCapability(
      ctx,
      args.businessId,
      'edit_loyalty_cards'
    );
    const now = Date.now();

    const existing = await ctx.db
      .query('referralConfigs')
      .withIndex('by_businessId', (q: any) =>
        q.eq('businessId', args.businessId)
      )
      .first();

    const payload: ReferralConfigPayload = {
      isEnabled: args.isEnabled,
      rewardType: normalizeRewardType(args.rewardType),
      rewardValue: normalizeRewardValue(args.rewardValue),
      benefitTitle: trimOptionalText(args.benefitTitle, 80),
      benefitDescription: trimOptionalText(args.benefitDescription, 280),
      benefitExpirationDays: normalizeBenefitExpirationDays(
        args.benefitExpirationDays
      ),
      rewardRecipients: normalizeRewardRecipients(args.rewardRecipients),
      monthlyLimit: normalizeMonthlyLimit(args.monthlyLimit),
    };

    if (!existing) {
      const id = await ctx.db.insert('referralConfigs', {
        businessId: args.businessId,
        configVersion: 1,
        createdByUserId: actor._id,
        updatedByUserId: actor._id,
        createdAt: now,
        updatedAt: now,
        ...payload,
      });
      return await ctx.db.get(id);
    }

    await ctx.db.patch(existing._id, {
      ...payload,
      configVersion: existing.configVersion + 1,
      updatedByUserId: actor._id,
      updatedAt: now,
    });
    return await ctx.db.get(existing._id);
  },
});

export const getOrCreateCustomerReferralLink = mutation({
  args: {
    businessId: v.id('businesses'),
    originProgramId: v.id('loyaltyPrograms'),
    membershipId: v.optional(v.id('memberships')),
    shareSurface: v.union(v.literal('card_screen'), v.literal('business_page')),
  },
  handler: async (ctx, args) => {
    const actor = await requireCurrentUser(ctx);
    const link = await createOrReuseCustomerReferralLink(ctx, {
      actorUserId: actor._id,
      businessId: args.businessId,
      originProgramId: args.originProgramId,
      membershipId: args.membershipId,
      shareSurface: args.shareSurface,
    });
    return {
      referralLinkId: link._id,
      code: link.code,
      status: link.status,
      expiresAt: link.expiresAt,
      url: buildCustomerReferralLinkUrl(link.code),
      businessId: link.businessId,
      originProgramId: link.originProgramId,
      membershipId: link.membershipId ?? null,
      shareSurface: link.shareSurface,
      reused:
        Number(link.openCount) >= 0 && Number(link.createdAt) < Date.now(),
    };
  },
});

export const openCustomerReferralLink = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, { code }) => {
    const user = await requireCurrentUser(ctx);
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      throw new Error('REFERRAL_CODE_REQUIRED');
    }
    const link = await findCustomerReferralLinkByCode(ctx, normalizedCode);
    if (!link) {
      throw new Error('REFERRAL_LINK_NOT_FOUND');
    }

    const now = Date.now();
    const status = await maybeMarkExpiredLink(
      ctx,
      link,
      'customerReferralLinks',
      now
    );
    if (status !== 'active') {
      throw new Error('REFERRAL_LINK_EXPIRED');
    }

    const business = await getBusinessDoc(ctx, link.businessId);
    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_NOT_FOUND');
    }

    const shouldCountOpen =
      !link.lastOpenCountedAt ||
      now - Number(link.lastOpenCountedAt) > LINK_OPEN_COUNTER_WINDOW_MS ||
      String(link.lastOpenedByUserId ?? '') !== String(user._id);
    const couldCountOpen =
      !link.lastOpenCountedAt ||
      now - Number(link.lastOpenCountedAt) > LINK_OPEN_COUNTER_WINDOW_MS ||
      Number(link.openCount) < LINK_OPEN_COUNTER_MAX_PER_HOUR;

    if (shouldCountOpen && couldCountOpen) {
      await ctx.db.patch(link._id, {
        openCount: Number(link.openCount) + 1,
        lastOpenedAt: now,
        lastOpenedByUserId: user._id,
        lastOpenCountedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(link._id, {
        lastOpenedAt: now,
        lastOpenedByUserId: user._id,
        updatedAt: now,
      });
    }

    return {
      ok: true,
      code: link.code,
      businessId: link.businessId,
      businessPublicId: business.businessPublicId ?? null,
      businessName: business.name,
      referralLinkId: link._id,
      referrerUserId: link.referrerUserId,
      originProgramId: link.originProgramId,
      expiresAt: link.expiresAt,
    };
  },
});

export const getMyReferralDashboard = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const refs = await ctx.db
      .query('customerReferrals')
      .withIndex('by_referrerUserId_businessId_createdAt', (q: any) =>
        q.eq('referrerUserId', user._id)
      )
      .collect();

    const rewardStatuses: Array<
      'granted' | 'redeemed' | 'expired' | 'revoked'
    > = ['granted', 'redeemed', 'expired', 'revoked'];
    const rewards: any[] = [];
    for (const status of rewardStatuses) {
      const rows = await ctx.db
        .query('referralRewards')
        .withIndex('by_recipientUserId_status_expiresAt', (q: any) =>
          q.eq('recipientUserId', user._id).eq('status', status)
        )
        .collect();
      rewards.push(...rows);
    }

    const pending = refs.filter((row) => row.status === 'pending').length;
    const completed = refs.filter((row) => row.status === 'completed').length;
    const qualified = refs.filter((row) => row.status === 'qualified').length;
    const earned = rewards.length;
    const activeBenefits = rewards.filter(
      (row) =>
        row.actualRewardType === 'BENEFIT' &&
        row.status === 'granted' &&
        (!row.expiresAt || row.expiresAt > Date.now())
    ).length;

    return {
      pending,
      completed,
      qualified,
      earned,
      activeBenefits,
    };
  },
});

export const listMyCustomerReferrals = query({
  args: {
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('qualified'),
        v.literal('completed'),
        v.literal('skipped'),
        v.literal('invalid')
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit }) => {
    const user = await requireCurrentUser(ctx);
    const rows = await ctx.db
      .query('customerReferrals')
      .withIndex('by_referrerUserId_businessId_createdAt', (q: any) =>
        q.eq('referrerUserId', user._id)
      )
      .collect();
    const safeLimit = Math.max(1, Math.min(limit ?? 100, 300));

    const filtered = rows
      .filter((row: any) => (status ? row.status === status : true))
      .sort((a: any, b: any) => {
        const left = Number(a.qualifiedAt ?? a.createdAt);
        const right = Number(b.qualifiedAt ?? b.createdAt);
        return right - left;
      })
      .slice(0, safeLimit);

    return await Promise.all(
      filtered.map(async (row: any) => {
        const [business, referrer, referred] = await Promise.all([
          getBusinessDoc(ctx, row.businessId as Id<'businesses'>),
          getUserDoc(ctx, row.referrerUserId as Id<'users'>),
          getUserDoc(ctx, row.referredUserId as Id<'users'>),
        ]);
        return {
          referralId: row._id,
          businessId: row.businessId,
          businessName: business?.name ?? 'עסק',
          referrerUserId: row.referrerUserId,
          referrerName: referrer?.fullName ?? referrer?.email ?? null,
          referredUserId: row.referredUserId,
          referredName: referred?.fullName ?? referred?.email ?? null,
          status: row.status,
          skipReason: row.skipReason ?? null,
          rewardGrantStatus: row.rewardGrantStatus,
          qualifiedAt: row.qualifiedAt ?? null,
          completedAt: row.completedAt ?? null,
          createdAt: row.createdAt,
        };
      })
    );
  },
});

export const listMyReferralRewards = query({
  args: {
    status: v.optional(
      v.union(
        v.literal('granted'),
        v.literal('redeemed'),
        v.literal('expired'),
        v.literal('revoked')
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit }) => {
    const user = await requireCurrentUser(ctx);
    const statuses = status
      ? [status]
      : (['granted', 'redeemed', 'expired', 'revoked'] as const);

    const rows: any[] = [];
    for (const state of statuses) {
      const subset = await ctx.db
        .query('referralRewards')
        .withIndex('by_recipientUserId_status_expiresAt', (q: any) =>
          q.eq('recipientUserId', user._id).eq('status', state)
        )
        .collect();
      rows.push(...subset);
    }

    const safeLimit = Math.max(1, Math.min(limit ?? 120, 400));
    const now = Date.now();
    return await Promise.all(
      rows
        .sort((a: any, b: any) => {
          const aScore =
            a.status === 'granted' && a.actualRewardType === 'BENEFIT'
              ? Number(a.expiresAt ?? Number.MAX_SAFE_INTEGER)
              : -Number(a.createdAt);
          const bScore =
            b.status === 'granted' && b.actualRewardType === 'BENEFIT'
              ? Number(b.expiresAt ?? Number.MAX_SAFE_INTEGER)
              : -Number(b.createdAt);
          return aScore - bScore;
        })
        .slice(0, safeLimit)
        .map(async (row: any) => {
          const [business, referral] = await Promise.all([
            getBusinessDoc(ctx, row.businessId as Id<'businesses'>),
            getCustomerReferralDoc(
              ctx,
              row.customerReferralId as Id<'customerReferrals'>
            ),
          ]);
          return {
            rewardId: row._id,
            status:
              row.status === 'granted' &&
              row.actualRewardType === 'BENEFIT' &&
              row.expiresAt &&
              Number(row.expiresAt) <= now
                ? 'expired'
                : row.status,
            businessId: row.businessId,
            businessName: business?.name ?? 'עסק',
            customerReferralId: row.customerReferralId,
            referralStatus: referral?.status ?? null,
            recipientRole: row.recipientRole,
            configuredRewardType: row.configuredRewardType,
            actualRewardType: row.actualRewardType,
            rewardValue: row.rewardValue,
            benefitTitle: row.benefitTitle ?? null,
            benefitDescription: row.benefitDescription ?? null,
            targetMembershipId: row.targetMembershipId ?? null,
            expiresAt: row.expiresAt ?? null,
            redeemedAt: row.redeemedAt ?? null,
            createdAt: row.createdAt,
          };
        })
    );
  },
});

export const getBusinessReferralDashboard = query({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_dashboard'
    );
    const [referrals, rewards, b2b] = await Promise.all([
      ctx.db
        .query('customerReferrals')
        .withIndex('by_businessId_status_createdAt', (q: any) =>
          q.eq('businessId', businessId)
        )
        .collect(),
      ctx.db
        .query('referralRewards')
        .withIndex('by_businessId_status_createdAt', (q: any) =>
          q.eq('businessId', businessId)
        )
        .collect(),
      ctx.db
        .query('businessReferrals')
        .withIndex('by_referrerBusinessId_status_createdAt', (q: any) =>
          q.eq('referrerBusinessId', businessId)
        )
        .collect(),
    ]);

    const pending = referrals.filter(
      (row: any) => row.status === 'pending'
    ).length;
    const qualified = referrals.filter(
      (row: any) => row.status === 'qualified'
    ).length;
    const completed = referrals.filter(
      (row: any) => row.status === 'completed'
    ).length;
    const rewardsGranted = rewards.filter(
      (row: any) => row.status === 'granted'
    ).length;
    const rewardsRedeemed = rewards.filter(
      (row: any) => row.status === 'redeemed'
    ).length;
    const activeBenefits = rewards.filter(
      (row: any) =>
        row.actualRewardType === 'BENEFIT' &&
        row.status === 'granted' &&
        (!row.expiresAt || Number(row.expiresAt) > Date.now())
    ).length;
    const b2bFreeMonthsEarned = b2b
      .filter((row: any) => row.status === 'credited')
      .reduce(
        (sum: number, row: any) => sum + Number(row.creditMonths ?? 0),
        0
      );
    return {
      referralsGenerated: referrals.length,
      referralsQualified: qualified,
      referralsCompleted: completed,
      pendingReferrals: pending,
      rewardsGranted,
      rewardsRedeemed,
      activeBenefits,
      b2bFreeMonthsEarned,
    };
  },
});

export const listBusinessReferralCustomers = query({
  args: {
    businessId: v.id('businesses'),
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('qualified'),
        v.literal('completed'),
        v.literal('skipped'),
        v.literal('invalid')
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { businessId, status, limit }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_customers'
    );
    const rows = await ctx.db
      .query('customerReferrals')
      .withIndex('by_businessId_status_createdAt', (q: any) =>
        q.eq('businessId', businessId)
      )
      .collect();
    const safeLimit = Math.max(1, Math.min(limit ?? 120, 400));
    const filtered = rows
      .filter((row: any) => (status ? row.status === status : true))
      .sort(
        (a: any, b: any) =>
          Number(b.qualifiedAt ?? b.createdAt) -
          Number(a.qualifiedAt ?? a.createdAt)
      )
      .slice(0, safeLimit);

    return await Promise.all(
      filtered.map(async (row: any) => {
        const [referrer, referred, link] = await Promise.all([
          getUserDoc(ctx, row.referrerUserId as Id<'users'>),
          getUserDoc(ctx, row.referredUserId as Id<'users'>),
          ctx.db.get(row.referralLinkId as Id<'customerReferralLinks'>) as Promise<
            Doc<'customerReferralLinks'> | null
          >,
        ]);
        return {
          referralId: row._id,
          status: row.status,
          rewardGrantStatus: row.rewardGrantStatus,
          skipReason: row.skipReason ?? null,
          referrerUserId: row.referrerUserId,
          referrerName: referrer?.fullName ?? referrer?.email ?? null,
          referredUserId: row.referredUserId,
          referredName: referred?.fullName ?? referred?.email ?? null,
          originProgramId: row.originProgramId,
          referralCode: link?.code ?? null,
          qualifiedAt: row.qualifiedAt ?? null,
          completedAt: row.completedAt ?? null,
          createdAt: row.createdAt,
        };
      })
    );
  },
});

export const listBusinessReferralRewards = query({
  args: {
    businessId: v.id('businesses'),
    status: v.optional(
      v.union(
        v.literal('granted'),
        v.literal('redeemed'),
        v.literal('expired'),
        v.literal('revoked')
      )
    ),
    rewardType: v.optional(v.union(v.literal('STAMP'), v.literal('BENEFIT'))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { businessId, status, rewardType, limit }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_customers'
    );
    const statuses = status
      ? [status]
      : (['granted', 'redeemed', 'expired', 'revoked'] as const);

    const rows: any[] = [];
    for (const state of statuses) {
      const subset = await ctx.db
        .query('referralRewards')
        .withIndex('by_businessId_status_createdAt', (q: any) =>
          q.eq('businessId', businessId).eq('status', state)
        )
        .collect();
      rows.push(...subset);
    }

    const filtered = rows
      .filter((row: any) =>
        rewardType ? row.actualRewardType === rewardType : true
      )
      .sort((a: any, b: any) => {
        if (a.status === 'granted' && a.actualRewardType === 'BENEFIT') {
          return (
            Number(a.expiresAt ?? Number.MAX_SAFE_INTEGER) -
            Number(b.expiresAt ?? Number.MAX_SAFE_INTEGER)
          );
        }
        return Number(b.createdAt) - Number(a.createdAt);
      })
      .slice(0, Math.max(1, Math.min(limit ?? 200, 600)));

    return await Promise.all(
      filtered.map(async (row: any) => {
        const [recipient, referral] = await Promise.all([
          getUserDoc(ctx, row.recipientUserId as Id<'users'>),
          getCustomerReferralDoc(
            ctx,
            row.customerReferralId as Id<'customerReferrals'>
          ),
        ]);
        return {
          rewardId: row._id,
          customerReferralId: row.customerReferralId,
          referralStatus: referral?.status ?? null,
          recipientUserId: row.recipientUserId,
          recipientName: recipient?.fullName ?? recipient?.email ?? null,
          recipientRole: row.recipientRole,
          configuredRewardType: row.configuredRewardType,
          actualRewardType: row.actualRewardType,
          status: row.status,
          rewardValue: row.rewardValue,
          benefitTitle: row.benefitTitle ?? null,
          expiresAt: row.expiresAt ?? null,
          redeemedAt: row.redeemedAt ?? null,
          createdAt: row.createdAt,
        };
      })
    );
  },
});

export const listCustomerAvailableReferralBenefits = query({
  args: {
    businessId: v.id('businesses'),
    customerUserId: v.id('users'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { businessId, customerUserId, limit }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_customers'
    );

    const now = Date.now();
    const safeLimit = Math.max(1, Math.min(limit ?? 20, 80));
    const rows = (await ctx.db
      .query('referralRewards')
      .withIndex('by_businessId_recipientUserId_status', (q: any) =>
        q
          .eq('businessId', businessId)
          .eq('recipientUserId', customerUserId)
          .eq('status', 'granted')
      )
      .collect()) as Doc<'referralRewards'>[];

    const active = rows
      .filter(
        (row) =>
          row.actualRewardType === 'BENEFIT' &&
          (!row.expiresAt || Number(row.expiresAt) > now)
      )
      .sort((a, b) => {
        const left = Number(a.expiresAt ?? Number.MAX_SAFE_INTEGER);
        const right = Number(b.expiresAt ?? Number.MAX_SAFE_INTEGER);
        if (left !== right) {
          return left - right;
        }
        return Number(b.createdAt) - Number(a.createdAt);
      })
      .slice(0, safeLimit);

    return await Promise.all(
      active.map(async (row) => {
        const referral = await getCustomerReferralDoc(ctx, row.customerReferralId);
        const referrerUser = referral?.referrerUserId
          ? await getUserDoc(ctx, referral.referrerUserId)
          : null;
        return {
          rewardId: row._id,
          businessId: row.businessId,
          customerReferralId: row.customerReferralId,
          recipientUserId: row.recipientUserId,
          recipientRole: row.recipientRole,
          benefitTitle: row.benefitTitle ?? 'Referral reward',
          benefitDescription: row.benefitDescription ?? null,
          expiresAt: row.expiresAt ?? null,
          createdAt: row.createdAt,
          referrerUserId: referral?.referrerUserId ?? null,
          referrerName: referrerUser?.fullName ?? referrerUser?.email ?? null,
        };
      })
    );
  },
});

export const getBusinessReferralPerformance = query({
  args: {
    businessId: v.id('businesses'),
    range: v.optional(
      v.union(v.literal('7d'), v.literal('30d'), v.literal('90d'))
    ),
  },
  handler: async (ctx, { businessId, range }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_dashboard'
    );
    const windowDays = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const startAt = Date.now() - windowDays * 24 * 60 * 60 * 1000;

    const [referrals, rewards, links] = await Promise.all([
      ctx.db
        .query('customerReferrals')
        .withIndex('by_businessId_status_createdAt', (q: any) =>
          q.eq('businessId', businessId)
        )
        .collect(),
      ctx.db
        .query('referralRewards')
        .withIndex('by_businessId_status_createdAt', (q: any) =>
          q.eq('businessId', businessId)
        )
        .collect(),
      ctx.db
        .query('customerReferralLinks')
        .withIndex('by_businessId_createdAt', (q: any) =>
          q.eq('businessId', businessId)
        )
        .collect(),
    ]);

    const scopedReferrals = referrals.filter(
      (row: any) => Number(row.createdAt) >= startAt
    );
    const scopedRewards = rewards.filter(
      (row: any) => Number(row.createdAt) >= startAt
    );
    const scopedLinks = links.filter(
      (row: any) => Number(row.createdAt) >= startAt
    );

    return {
      range: range ?? '30d',
      referralsGenerated: scopedLinks.length,
      referralsJoined: scopedReferrals.length,
      referralsQualified: scopedReferrals.filter(
        (row: any) => row.qualifiedAt != null
      ).length,
      rewardsIssued: scopedRewards.filter(
        (row: any) => row.status === 'granted'
      ).length,
      rewardsRedeemed: scopedRewards.filter(
        (row: any) => row.status === 'redeemed'
      ).length,
      activeBenefits: scopedRewards.filter(
        (row: any) =>
          row.actualRewardType === 'BENEFIT' &&
          row.status === 'granted' &&
          (!row.expiresAt || Number(row.expiresAt) > Date.now())
      ).length,
    };
  },
});

export const getBusinessCustomerReferralSummary = query({
  args: {
    businessId: v.id('businesses'),
    customerUserId: v.id('users'),
  },
  handler: async (ctx, { businessId, customerUserId }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_customers'
    );
    const referral = await ctx.db
      .query('customerReferrals')
      .withIndex('by_businessId_referredUserId', (q: any) =>
        q.eq('businessId', businessId).eq('referredUserId', customerUserId)
      )
      .first();
    if (!referral) {
      return null;
    }

    const [referrer, rewards] = await Promise.all([
      getUserDoc(ctx, referral.referrerUserId),
      ctx.db
        .query('referralRewards')
        .withIndex('by_customerReferralId_recipientUserId', (q: any) =>
          q.eq('customerReferralId', referral._id)
        )
        .collect(),
    ]);

    return {
      customerReferralId: referral._id,
      joinedViaReferral: true,
      referrerUserId: referral.referrerUserId,
      referrerName: referrer?.fullName ?? referrer?.email ?? null,
      status: referral.status,
      rewardGrantStatus: referral.rewardGrantStatus,
      rewardsGranted: rewards.filter((row: any) => row.status === 'granted')
        .length,
      rewardsRedeemed: rewards.filter((row: any) => row.status === 'redeemed')
        .length,
      qualifiedAt: referral.qualifiedAt ?? null,
      completedAt: referral.completedAt ?? null,
      createdAt: referral.createdAt,
    };
  },
});

export const getOrCreateBusinessReferralLink = mutation({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    const { actor } = await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'view_billing_state'
    );
    const business = await getBusinessDoc(ctx, businessId);
    if (!isPaidBusinessActive(business)) {
      throw new Error('PAID_PLAN_REQUIRED');
    }

    const now = Date.now();
    const active = await ctx.db
      .query('businessReferralLinks')
      .withIndex('by_referrerBusinessId_status', (q: any) =>
        q.eq('referrerBusinessId', businessId).eq('status', 'active')
      )
      .collect();
    const reusable = active.find((row: any) => Number(row.expiresAt) > now);
    if (reusable) {
      return {
        businessReferralLinkId: reusable._id,
        code: reusable.code,
        status: reusable.status,
        expiresAt: reusable.expiresAt,
        url: buildBusinessReferralLinkUrl(reusable.code),
        reused: true,
      };
    }

    let code = '';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      code = buildReferralCode('bref');
      const exists = await findBusinessReferralLinkByCode(ctx, code);
      if (!exists) {
        break;
      }
      code = '';
    }
    if (!code) {
      throw new Error('REFERRAL_CODE_GENERATION_FAILED');
    }

    const id = await ctx.db.insert('businessReferralLinks', {
      code,
      referrerBusinessId: businessId,
      createdByUserId: actor._id,
      status: 'active',
      expiresAt: now + B2B_REFERRAL_LINK_TTL_MS,
      openCount: 0,
      lastOpenedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(id);
    if (!created) {
      throw new Error('B2B_REFERRAL_LINK_CREATE_FAILED');
    }
    return {
      businessReferralLinkId: created._id,
      code: created.code,
      status: created.status,
      expiresAt: created.expiresAt,
      url: buildBusinessReferralLinkUrl(created.code),
      reused: false,
    };
  },
});

export const openBusinessReferralLink = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, { code }) => {
    const user = await requireCurrentUser(ctx);
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      throw new Error('BUSINESS_REFERRAL_CODE_REQUIRED');
    }
    const link = await findBusinessReferralLinkByCode(ctx, normalizedCode);
    if (!link) {
      throw new Error('BUSINESS_REFERRAL_LINK_NOT_FOUND');
    }
    const now = Date.now();
    const status = await maybeMarkExpiredLink(
      ctx,
      link,
      'businessReferralLinks',
      now
    );
    if (status !== 'active') {
      throw new Error('BUSINESS_REFERRAL_LINK_EXPIRED');
    }
    const referrerBusiness = await getBusinessDoc(ctx, link.referrerBusinessId);
    if (!isPaidBusinessActive(referrerBusiness)) {
      throw new Error('BUSINESS_REFERRAL_NOT_ELIGIBLE');
    }

    await ctx.db.patch(link._id, {
      openCount: Number(link.openCount) + 1,
      lastOpenedAt: now,
      updatedAt: now,
    });

    return {
      ok: true,
      businessReferralLinkId: link._id,
      code: link.code,
      referrerBusinessId: link.referrerBusinessId,
      referrerBusinessName: referrerBusiness?.name ?? 'עסק',
      openedByUserId: user._id,
    };
  },
});

export const redeemReferralBenefit = mutation({
  args: {
    businessId: v.id('businesses'),
    rewardId: v.id('referralRewards'),
    scannerRuntimeSessionId: v.optional(v.string()),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireActorHasBusinessCapability(
      ctx,
      args.businessId,
      'scanner_access'
    );
    const reward = await ctx.db.get(args.rewardId);
    if (!reward || String(reward.businessId) !== String(args.businessId)) {
      throw new Error('REFERRAL_REWARD_NOT_FOUND');
    }
    if (reward.actualRewardType !== 'BENEFIT') {
      throw new Error('INVALID_REWARD_TYPE');
    }
    if (reward.status !== 'granted') {
      throw new Error('REWARD_NOT_AVAILABLE');
    }
    if (reward.expiresAt && Number(reward.expiresAt) <= Date.now()) {
      await ctx.db.patch(reward._id, {
        status: 'expired',
        updatedAt: Date.now(),
      });
      throw new Error('REWARD_EXPIRED');
    }

    const referral = await ctx.db.get(reward.customerReferralId);
    if (!referral) {
      throw new Error('REFERRAL_NOT_FOUND');
    }

    const now = Date.now();
    let redeemedEventId: Id<'events'> | undefined;
    const programId = reward.targetProgramId ?? referral.originProgramId;
    const program = await ctx.db.get(programId);
    if (program && program.isActive === true) {
      redeemedEventId = await ctx.db.insert('events', {
        type: 'REFERRAL_BENEFIT_REDEEMED',
        businessId: args.businessId,
        programId,
        membershipId: reward.targetMembershipId,
        actorUserId: actor._id,
        customerUserId: reward.recipientUserId,
        source: 'referral_benefit_redeem',
        revertsEventId: undefined,
        reversalEventId: undefined,
        reasonCode: undefined,
        reasonNote: undefined,
        scannerRuntimeSessionId: args.scannerRuntimeSessionId,
        deviceId: args.deviceId,
        membershipStateBefore: undefined,
        membershipStateAfter: undefined,
        metadata: {
          referralRewardId: String(reward._id),
          customerReferralId: String(reward.customerReferralId),
        },
        createdAt: now,
      });
    }

    await ctx.db.patch(reward._id, {
      status: 'redeemed',
      redeemedAt: now,
      redeemedByUserId: actor._id,
      redemptionScanSessionId: undefined,
      redeemedEventId,
      updatedAt: now,
    });

    await sendReferralNotification(ctx, {
      businessId: args.businessId,
      toUserId: reward.recipientUserId,
      eventName: 'referral_reward_redeemed',
      title: 'המתנה מומשה',
      body: 'הטבת ההזמנה סומנה כמומשה.',
      destinationHref: `/(authenticated)/(customer)/referrals?tab=rewards&rewardId=${String(reward._id)}`,
      dedupeKey: `referral_reward_redeemed:${String(reward._id)}:${String(reward.recipientUserId)}`,
      payload: {
        referralRewardId: String(reward._id),
        customerReferralId: String(reward.customerReferralId),
        businessId: String(args.businessId),
        redeemedByUserId: String(actor._id),
      },
    });

    const managers = await listBusinessManagersAndOwners(ctx, args.businessId);
    for (const manager of managers) {
      await sendReferralNotification(ctx, {
        businessId: args.businessId,
        toUserId: manager.userId,
        eventName: 'reward_redeemed',
        title: 'מתנת הזמנה מומשה',
        body: 'לקוח מימש הטבה שהתקבלה מהפניה.',
        destinationHref: `/(authenticated)/(business)/customer/${String(reward.recipientUserId)}?section=referrals&rewardId=${String(reward._id)}`,
        dedupeKey: `business_reward_redeemed:${String(reward._id)}:${String(manager.userId)}`,
        payload: {
          referralRewardId: String(reward._id),
          customerReferralId: String(reward.customerReferralId),
          businessId: String(args.businessId),
          recipientUserId: String(reward.recipientUserId),
          redeemedByUserId: String(actor._id),
          redeemedAt: now,
        },
      });
    }

    return {
      ok: true,
      rewardId: reward._id,
      status: 'redeemed',
      redeemedAt: now,
      redeemedEventId: redeemedEventId ?? null,
    };
  },
});

export const adminSearchReferralRecords = query({
  args: {
    query: v.string(),
    type: v.optional(
      v.union(
        v.literal('customerReferralLink'),
        v.literal('businessReferralLink'),
        v.literal('customerReferral'),
        v.literal('referralReward'),
        v.literal('businessReferral')
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { query, type, limit }) => {
    await requireAdminUser(ctx);
    const needle = query.trim().toLowerCase();
    const safeLimit = Math.max(1, Math.min(limit ?? 100, 400));

    const [
      customerLinks,
      businessLinks,
      customerReferrals,
      rewards,
      businessReferrals,
    ] = await Promise.all([
      type && type !== 'customerReferralLink'
        ? []
        : ctx.db.query('customerReferralLinks').collect(),
      type && type !== 'businessReferralLink'
        ? []
        : ctx.db.query('businessReferralLinks').collect(),
      type && type !== 'customerReferral'
        ? []
        : ctx.db.query('customerReferrals').collect(),
      type && type !== 'referralReward'
        ? []
        : ctx.db.query('referralRewards').collect(),
      type && type !== 'businessReferral'
        ? []
        : ctx.db.query('businessReferrals').collect(),
    ]);

    const rows: Array<{
      targetType: string;
      targetId: string;
      updatedAt: number;
      payload: Record<string, unknown>;
    }> = [];

    for (const row of customerLinks as any[]) {
      const haystack =
        `${String(row._id)} ${row.code} ${String(row.businessId)} ${String(row.referrerUserId)}`.toLowerCase();
      if (needle && !haystack.includes(needle)) continue;
      rows.push({
        targetType: 'customerReferralLink',
        targetId: String(row._id),
        updatedAt: Number(row.updatedAt ?? row.createdAt),
        payload: row,
      });
    }
    for (const row of businessLinks as any[]) {
      const haystack =
        `${String(row._id)} ${row.code} ${String(row.referrerBusinessId)}`.toLowerCase();
      if (needle && !haystack.includes(needle)) continue;
      rows.push({
        targetType: 'businessReferralLink',
        targetId: String(row._id),
        updatedAt: Number(row.updatedAt ?? row.createdAt),
        payload: row,
      });
    }
    for (const row of customerReferrals as any[]) {
      const haystack =
        `${String(row._id)} ${String(row.businessId)} ${String(row.referredUserId)} ${String(row.referrerUserId)}`.toLowerCase();
      if (needle && !haystack.includes(needle)) continue;
      rows.push({
        targetType: 'customerReferral',
        targetId: String(row._id),
        updatedAt: Number(row.updatedAt ?? row.createdAt),
        payload: row,
      });
    }
    for (const row of rewards as any[]) {
      const haystack =
        `${String(row._id)} ${String(row.businessId)} ${String(row.customerReferralId)} ${String(row.recipientUserId)}`.toLowerCase();
      if (needle && !haystack.includes(needle)) continue;
      rows.push({
        targetType: 'referralReward',
        targetId: String(row._id),
        updatedAt: Number(row.updatedAt ?? row.createdAt),
        payload: row,
      });
    }
    for (const row of businessReferrals as any[]) {
      const haystack =
        `${String(row._id)} ${String(row.referrerBusinessId)} ${String(row.referredBusinessId)}`.toLowerCase();
      if (needle && !haystack.includes(needle)) continue;
      rows.push({
        targetType: 'businessReferral',
        targetId: String(row._id),
        updatedAt: Number(row.updatedAt ?? row.createdAt),
        payload: row,
      });
    }

    return rows.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, safeLimit);
  },
});

export const adminGetReferralRecord = query({
  args: {
    targetType: v.union(
      v.literal('customerReferralLink'),
      v.literal('businessReferralLink'),
      v.literal('customerReferral'),
      v.literal('referralReward'),
      v.literal('businessReferral')
    ),
    targetId: v.string(),
  },
  handler: async (ctx, { targetType, targetId }) => {
    await requireAdminUser(ctx);
    const id = targetId as Id<any>;
    if (targetType === 'customerReferralLink') {
      return await ctx.db.get(id as Id<'customerReferralLinks'>);
    }
    if (targetType === 'businessReferralLink') {
      return await ctx.db.get(id as Id<'businessReferralLinks'>);
    }
    if (targetType === 'customerReferral') {
      return await ctx.db.get(id as Id<'customerReferrals'>);
    }
    if (targetType === 'referralReward') {
      return await ctx.db.get(id as Id<'referralRewards'>);
    }
    return await ctx.db.get(id as Id<'businessReferrals'>);
  },
});

export const adminListReferralAuditLog = query({
  args: {
    targetType: v.optional(
      v.union(
        v.literal('customerReferralLink'),
        v.literal('businessReferralLink'),
        v.literal('referralReward'),
        v.literal('customerReferral')
      )
    ),
    targetId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const rows = await ctx.db
      .query('referralAdminAuditLog')
      .withIndex('by_createdAt', (q: any) => q)
      .collect();

    return rows
      .filter((row: any) =>
        args.targetType ? row.targetType === args.targetType : true
      )
      .filter((row: any) =>
        args.targetId ? row.targetId === args.targetId : true
      )
      .sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt))
      .slice(0, Math.max(1, Math.min(args.limit ?? 120, 400)));
  },
});

async function insertAdminAuditLog(
  ctx: any,
  args: {
    actorAdminUserId: Id<'users'>;
    action:
      | 'disable_customer_referral_link'
      | 'disable_business_referral_link'
      | 'revoke_referral_reward'
      | 'mark_customer_referral_invalid';
    targetType:
      | 'customerReferralLink'
      | 'businessReferralLink'
      | 'referralReward'
      | 'customerReferral';
    targetId: string;
    businessId?: Id<'businesses'>;
    customerReferralId?: Id<'customerReferrals'>;
    referralRewardId?: Id<'referralRewards'>;
    beforeSnapshot: unknown;
    afterSnapshot: unknown;
    reasonCode: string;
    reasonNote: string;
  }
) {
  await ctx.db.insert('referralAdminAuditLog', {
    actorAdminUserId: args.actorAdminUserId,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    businessId: args.businessId,
    customerReferralId: args.customerReferralId,
    referralRewardId: args.referralRewardId,
    beforeSnapshot: args.beforeSnapshot,
    afterSnapshot: args.afterSnapshot,
    reasonCode: args.reasonCode,
    reasonNote: args.reasonNote,
    createdAt: Date.now(),
  });
}

export const adminDisableCustomerReferralLink = mutation({
  args: {
    referralLinkId: v.id('customerReferralLinks'),
    reasonCode: v.string(),
    reasonNote: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const before = await ctx.db.get(args.referralLinkId);
    if (!before) {
      throw new Error('REFERRAL_LINK_NOT_FOUND');
    }
    if (before.status !== 'disabled') {
      await ctx.db.patch(before._id, {
        status: 'disabled',
        updatedAt: Date.now(),
      });
    }
    const after = await ctx.db.get(before._id);
    await insertAdminAuditLog(ctx, {
      actorAdminUserId: admin._id,
      action: 'disable_customer_referral_link',
      targetType: 'customerReferralLink',
      targetId: String(before._id),
      businessId: before.businessId,
      beforeSnapshot: before,
      afterSnapshot: after,
      reasonCode: args.reasonCode.trim() || 'manual_admin_action',
      reasonNote: args.reasonNote.trim() || 'disabled by admin',
    });
    return { ok: true, status: after?.status ?? 'disabled' };
  },
});

export const adminDisableBusinessReferralLink = mutation({
  args: {
    businessReferralLinkId: v.id('businessReferralLinks'),
    reasonCode: v.string(),
    reasonNote: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const before = await ctx.db.get(args.businessReferralLinkId);
    if (!before) {
      throw new Error('BUSINESS_REFERRAL_LINK_NOT_FOUND');
    }
    if (before.status !== 'disabled') {
      await ctx.db.patch(before._id, {
        status: 'disabled',
        updatedAt: Date.now(),
      });
    }
    const after = await ctx.db.get(before._id);
    await insertAdminAuditLog(ctx, {
      actorAdminUserId: admin._id,
      action: 'disable_business_referral_link',
      targetType: 'businessReferralLink',
      targetId: String(before._id),
      businessId: before.referrerBusinessId,
      beforeSnapshot: before,
      afterSnapshot: after,
      reasonCode: args.reasonCode.trim() || 'manual_admin_action',
      reasonNote: args.reasonNote.trim() || 'disabled by admin',
    });
    return { ok: true, status: after?.status ?? 'disabled' };
  },
});

export const adminRevokeReferralReward = mutation({
  args: {
    referralRewardId: v.id('referralRewards'),
    reasonCode: v.string(),
    reasonNote: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const before = await ctx.db.get(args.referralRewardId);
    if (!before) {
      throw new Error('REFERRAL_REWARD_NOT_FOUND');
    }
    if (before.status === 'redeemed') {
      throw new Error('REWARD_ALREADY_REDEEMED');
    }
    if (before.status === 'revoked') {
      return { ok: true, status: 'revoked' as const };
    }

    if (before.actualRewardType === 'STAMP') {
      if (!before.targetMembershipId || !before.grantedEventId) {
        throw new Error('REWARD_NOT_SAFE_TO_REVOKE');
      }
      const membership = await ctx.db.get(before.targetMembershipId);
      if (!membership || membership.isActive !== true) {
        throw new Error('REWARD_NOT_SAFE_TO_REVOKE');
      }
      const events = await ctx.db
        .query('events')
        .withIndex('by_membershipId_createdAt', (q: any) =>
          q.eq('membershipId', membership._id)
        )
        .collect();
      const latest = events.sort(
        (a: any, b: any) => Number(b.createdAt) - Number(a.createdAt)
      )[0];
      if (!latest || String(latest._id) !== String(before.grantedEventId)) {
        throw new Error('REWARD_NOT_SAFE_TO_REVOKE');
      }

      const previous = Number(membership.currentStamps ?? 0);
      const next = Math.max(0, previous - Number(before.rewardValue ?? 1));
      await ctx.db.patch(membership._id, {
        currentStamps: next,
        updatedAt: Date.now(),
      });
      await ctx.db.insert('events', {
        type: 'REFERRAL_STAMP_REVOKED',
        businessId: before.businessId,
        programId: before.targetProgramId ?? membership.programId,
        membershipId: membership._id,
        actorUserId: admin._id,
        customerUserId: before.recipientUserId,
        source: 'manual_adjustment',
        revertsEventId: before.grantedEventId,
        reversalEventId: undefined,
        reasonCode: args.reasonCode,
        reasonNote: args.reasonNote,
        scannerRuntimeSessionId: undefined,
        deviceId: undefined,
        membershipStateBefore: {
          currentStamps: previous,
          lastStampAt: membership.lastStampAt,
          isActive: true,
        },
        membershipStateAfter: {
          currentStamps: next,
          lastStampAt: membership.lastStampAt,
          isActive: true,
        },
        metadata: {
          referralRewardId: String(before._id),
        },
        createdAt: Date.now(),
      });
    }

    await ctx.db.patch(before._id, {
      status: 'revoked',
      updatedAt: Date.now(),
    });
    const after = await ctx.db.get(before._id);
    await insertAdminAuditLog(ctx, {
      actorAdminUserId: admin._id,
      action: 'revoke_referral_reward',
      targetType: 'referralReward',
      targetId: String(before._id),
      businessId: before.businessId,
      customerReferralId: before.customerReferralId,
      referralRewardId: before._id,
      beforeSnapshot: before,
      afterSnapshot: after,
      reasonCode: args.reasonCode.trim() || 'manual_admin_action',
      reasonNote: args.reasonNote.trim() || 'revoked by admin',
    });
    return { ok: true, status: 'revoked' as const };
  },
});

export const adminMarkCustomerReferralInvalid = mutation({
  args: {
    customerReferralId: v.id('customerReferrals'),
    reasonCode: v.string(),
    reasonNote: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const before = await ctx.db.get(args.customerReferralId);
    if (!before) {
      throw new Error('CUSTOMER_REFERRAL_NOT_FOUND');
    }
    if (before.status === 'invalid') {
      return { ok: true, status: 'invalid' as const };
    }

    const rewards = await ctx.db
      .query('referralRewards')
      .withIndex('by_customerReferralId_recipientUserId', (q: any) =>
        q.eq('customerReferralId', before._id)
      )
      .collect();
    if (rewards.some((row: any) => row.status === 'redeemed')) {
      throw new Error('REFERRAL_HAS_REDEEMED_REWARDS');
    }
    if (rewards.some((row: any) => row.status === 'granted')) {
      throw new Error('REFERRAL_HAS_ACTIVE_REWARDS');
    }

    await ctx.db.patch(before._id, {
      status: 'invalid',
      skipReason: args.reasonCode.trim() || 'manual_admin_action',
      updatedAt: Date.now(),
      completedAt: Date.now(),
    });
    const after = await ctx.db.get(before._id);
    await insertAdminAuditLog(ctx, {
      actorAdminUserId: admin._id,
      action: 'mark_customer_referral_invalid',
      targetType: 'customerReferral',
      targetId: String(before._id),
      businessId: before.businessId,
      customerReferralId: before._id,
      beforeSnapshot: before,
      afterSnapshot: after,
      reasonCode: args.reasonCode.trim() || 'manual_admin_action',
      reasonNote: args.reasonNote.trim() || 'invalidated by admin',
    });
    return { ok: true, status: 'invalid' as const };
  },
});

export const processReferralAfterJoinInternal = internalMutation({
  args: {
    businessId: v.id('businesses'),
    referredUserId: v.id('users'),
    referralCode: v.optional(v.string()),
    joinedMembershipIds: v.array(v.id('memberships')),
    joinedProgramStatuses: v.array(
      v.union(
        v.literal('created'),
        v.literal('existing'),
        v.literal('reactivated')
      )
    ),
    hadAnyBusinessMembershipBeforeJoin: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await processReferralAfterJoin(ctx, args);
  },
});

export const qualifyCustomerReferralAfterStampInternal = internalMutation({
  args: {
    businessId: v.id('businesses'),
    referredUserId: v.id('users'),
    stampEventId: v.id('events'),
    stampCreatedAt: v.number(),
    stampProgramId: v.id('loyaltyPrograms'),
    stampMembershipId: v.optional(v.id('memberships')),
    actorUserId: v.id('users'),
    scannerRuntimeSessionId: v.optional(v.string()),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await qualifyCustomerReferralAfterStamp(ctx, args);
  },
});

export const processBusinessReferralSubscriptionSyncInternal = internalMutation(
  {
    args: {
      businessId: v.id('businesses'),
    },
    handler: async (ctx, { businessId }) => {
      const now = Date.now();
      const business = await getBusinessDoc(ctx, businessId);
      if (!business) {
        return { ok: true, skipped: 'business_not_found' };
      }

      const referral = await ctx.db
        .query('businessReferrals')
        .withIndex('by_referredBusinessId', (q: any) =>
          q.eq('referredBusinessId', businessId)
        )
        .first();
      if (!referral) {
        return { ok: true, skipped: 'no_business_referral' };
      }

      if (!isPaidBusinessActive(business)) {
        return { ok: true, skipped: 'not_paid_active' };
      }

      if (referral.status === 'pending_subscription') {
        const creditMonths = business.billingPeriod === 'yearly' ? 2 : 1;
        await ctx.db.patch(referral._id, {
          status: 'waiting_30_days',
          paidSubscriptionDetectedAt: now,
          qualificationDueAt: now + B2B_QUALIFICATION_DELAY_MS,
          subscriptionPlan: business.subscriptionPlan ?? undefined,
          billingPeriod:
            business.billingPeriod === 'yearly' ? 'yearly' : 'monthly',
          creditMonths,
          updatedAt: now,
        });
      }

      return { ok: true };
    },
  }
);

export const processDueBusinessReferralCreditsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const waiting = await ctx.db
      .query('businessReferrals')
      .withIndex('by_status_qualificationDueAt', (q: any) =>
        q.eq('status', 'waiting_30_days')
      )
      .collect();

    let credited = 0;
    let skipped = 0;
    for (const row of waiting) {
      if (!row.qualificationDueAt || Number(row.qualificationDueAt) > now) {
        continue;
      }
      const [referrerBusiness, referredBusiness] = await Promise.all([
        getBusinessDoc(ctx, row.referrerBusinessId as Id<'businesses'>),
        getBusinessDoc(ctx, row.referredBusinessId as Id<'businesses'>),
      ]);

      if (
        !isPaidBusinessActive(referrerBusiness) ||
        !isPaidBusinessActive(referredBusiness)
      ) {
        await ctx.db.patch(row._id, {
          status: 'skipped',
          skipReason: 'not_paid_active_at_credit_time',
          updatedAt: now,
        });
        skipped += 1;
        continue;
      }

      const creditedRows = await ctx.db
        .query('businessReferrals')
        .withIndex('by_referrerBusinessId_status_createdAt', (q: any) =>
          q
            .eq('referrerBusinessId', row.referrerBusinessId)
            .eq('status', 'credited')
        )
        .collect();
      const alreadyCreditedMonths = creditedRows.reduce(
        (sum: number, entry: any) => sum + Number(entry.creditMonths ?? 0),
        0
      );
      const remaining = Math.max(
        0,
        B2B_REWARD_CAP_MONTHS - alreadyCreditedMonths
      );
      const grantMonths = Math.min(remaining, Number(row.creditMonths ?? 0));
      if (grantMonths <= 0) {
        await ctx.db.patch(row._id, {
          status: 'skipped',
          skipReason: 'b2b_cap_reached',
          updatedAt: now,
        });
        skipped += 1;
        continue;
      }

      await ctx.db.patch(row._id, {
        status: 'credited',
        creditMonths: grantMonths,
        creditAppliedAt: now,
        updatedAt: now,
      });

      if (referrerBusiness) {
        const baseEndAt =
          typeof referrerBusiness.subscriptionEndAt === 'number' &&
          Number(referrerBusiness.subscriptionEndAt) > now
            ? Number(referrerBusiness.subscriptionEndAt)
            : now;
        const extendedEndAt = addMonthsUtc(baseEndAt, grantMonths);
        await ctx.db.patch(referrerBusiness._id, {
          b2bCreditMonthsEarned:
            Number(referrerBusiness.b2bCreditMonthsEarned ?? 0) + grantMonths,
          subscriptionEndAt: extendedEndAt,
          updatedAt: now,
        });
      }
      credited += 1;
    }

    return {
      processed: waiting.length,
      credited,
      skipped,
      now,
    };
  },
});

export const expireReferralLinksInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let expiredCustomerLinks = 0;
    let expiredBusinessLinks = 0;

    const customerActive = await ctx.db
      .query('customerReferralLinks')
      .withIndex('by_status_expiresAt', (q: any) => q.eq('status', 'active'))
      .collect();
    for (const row of customerActive) {
      if (Number(row.expiresAt) <= now) {
        await ctx.db.patch(row._id, {
          status: 'expired',
          updatedAt: now,
        });
        expiredCustomerLinks += 1;
      }
    }

    const businessActive = await ctx.db
      .query('businessReferralLinks')
      .withIndex('by_status_expiresAt', (q: any) => q.eq('status', 'active'))
      .collect();
    for (const row of businessActive) {
      if (Number(row.expiresAt) <= now) {
        await ctx.db.patch(row._id, {
          status: 'expired',
          updatedAt: now,
        });
        expiredBusinessLinks += 1;
      }
    }

    return {
      now,
      expiredCustomerLinks,
      expiredBusinessLinks,
    };
  },
});

export const expireReferralRewardsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let expiredBenefits = 0;
    const granted = await ctx.db
      .query('referralRewards')
      .withIndex('by_status_expiresAt', (q: any) => q.eq('status', 'granted'))
      .collect();
    for (const reward of granted) {
      if (
        reward.actualRewardType === 'BENEFIT' &&
        reward.expiresAt &&
        Number(reward.expiresAt) <= now
      ) {
        await ctx.db.patch(reward._id, {
          status: 'expired',
          updatedAt: now,
        });
        expiredBenefits += 1;
      }
    }
    return {
      now,
      expiredBenefits,
    };
  },
});

export const linkBusinessReferralToNewBusiness = internalMutation({
  args: {
    newBusinessId: v.id('businesses'),
    createdByUserId: v.id('users'),
    referralCode: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedCode = args.referralCode.trim().toUpperCase();
    if (!normalizedCode) {
      return { ok: true, skipped: 'empty_code' };
    }
    const link = await findBusinessReferralLinkByCode(ctx, normalizedCode);
    if (!link) {
      return { ok: true, skipped: 'code_not_found' };
    }
    const now = Date.now();
    const status = await maybeMarkExpiredLink(
      ctx,
      link,
      'businessReferralLinks',
      now
    );
    if (status !== 'active') {
      return { ok: true, skipped: 'link_inactive' };
    }

    if (String(link.referrerBusinessId) === String(args.newBusinessId)) {
      return { ok: true, skipped: 'self_referral' };
    }
    const existing = await ctx.db
      .query('businessReferrals')
      .withIndex('by_referredBusinessId', (q: any) =>
        q.eq('referredBusinessId', args.newBusinessId)
      )
      .first();
    if (existing) {
      return { ok: true, skipped: 'already_linked' };
    }

    await ctx.db.insert('businessReferrals', {
      businessReferralLinkId: link._id,
      referrerBusinessId: link.referrerBusinessId,
      referredBusinessId: args.newBusinessId,
      createdByUserId: args.createdByUserId,
      status: 'pending_subscription',
      skipReason: undefined,
      paidSubscriptionDetectedAt: undefined,
      qualificationDueAt: undefined,
      subscriptionPlan: undefined,
      billingPeriod: undefined,
      creditMonths: 0,
      creditAppliedAt: undefined,
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true, linked: true };
  },
});

export const getBusinessReferralCreditSummary = query({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'view_billing_state'
    );
    const rows = await ctx.db
      .query('businessReferrals')
      .withIndex('by_referrerBusinessId_status_createdAt', (q: any) =>
        q.eq('referrerBusinessId', businessId)
      )
      .collect();
    const creditedMonths = rows
      .filter((row: any) => row.status === 'credited')
      .reduce(
        (sum: number, row: any) => sum + Number(row.creditMonths ?? 0),
        0
      );
    const pendingMonths = rows
      .filter((row: any) => row.status === 'waiting_30_days')
      .reduce(
        (sum: number, row: any) =>
          sum + Math.max(0, Number(row.creditMonths ?? 0)),
        0
      );
    return {
      creditedMonths,
      pendingMonths,
      remainingCapMonths: Math.max(0, B2B_REWARD_CAP_MONTHS - creditedMonths),
      totalReferrals: rows.length,
    };
  },
});
