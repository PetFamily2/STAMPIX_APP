import { getAuthUserId } from '@convex-dev/auth/server';
import type { PaginationResult } from 'convex/server';
import { v } from 'convex/values';
import type { SubscriptionPlan } from '../lib/domain/subscriptions';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import {
  normalizeAccountDeletionEmail,
  resetAccountDeletionEmailRateLimit,
} from './accountDeletionRequests';
import { computeBusinessProfileCompletion } from './business';
import {
  cleanupCompletedDeletionReferencesForUser,
  getIncompleteDeletionBusinessIdsForUser,
} from './businessDeletion';
import {
  getBusinessStaffStatus,
  getCurrentUserOrNull,
  requireActorIsBusinessOwner,
  requireActiveBusiness,
  requireCurrentUser,
} from './guards';
import { normalizeEmailAddress } from './lib/email';
import { resolveProgramLifecycle } from './loyaltyPrograms';
import {
  type BusinessOnboardingFlow,
  getBusinessOnboardingDraftForUserAndFlow,
} from './onboarding';
import { prepareProviderRevocationsForUser } from './providerCredentials';

const SUBSCRIPTION_PLAN_UNION = v.union(
  v.literal('starter'),
  v.literal('pro'),
  v.literal('premium')
);

const SUBSCRIPTION_STATUS_UNION = v.union(
  v.literal('active'),
  v.literal('inactive'),
  v.literal('cancelled')
);

const BUSINESS_ONBOARDING_FLOW_UNION = v.union(
  v.literal('default'),
  v.literal('additional')
);

type SubscriptionPlanStatus = 'active' | 'inactive' | 'cancelled';

const DEFAULT_PLAN_STATUS: Record<SubscriptionPlan, SubscriptionPlanStatus> = {
  starter: 'inactive',
  pro: 'active',
  premium: 'active',
};

const NAME_MAX_LENGTH = 60;
const PHONE_MAX_LENGTH = 24;

function assertCanonicalSubscriptionPlan(plan: string) {
  if (plan === 'starter' || plan === 'pro' || plan === 'premium') {
    return;
  }
  throw new Error('INVALID_SUBSCRIPTION_PLAN');
}

function normalizeUserSubscriptionPlan(
  value: unknown
): SubscriptionPlan | undefined {
  if (value === 'pro') {
    return 'pro';
  }
  if (value === 'premium' || value === 'unlimited') {
    return 'premium';
  }
  if (value === 'starter' || value === 'free') {
    return 'starter';
  }
  return undefined;
}

function normalizeNamePart(value: string, field: 'FIRST_NAME' | 'LAST_NAME') {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    throw new Error(`${field}_REQUIRED`);
  }
  if (normalized.length > NAME_MAX_LENGTH) {
    throw new Error(`${field}_TOO_LONG`);
  }
  return normalized;
}

function normalizePhone(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    throw new Error('PHONE_REQUIRED');
  }
  if (normalized.length > PHONE_MAX_LENGTH) {
    throw new Error('PHONE_TOO_LONG');
  }
  if (!/^[0-9+()\-\s]+$/.test(normalized)) {
    throw new Error('PHONE_INVALID');
  }
  return normalized;
}

function normalizeMonth(
  value: number | undefined,
  field: 'BIRTHDAY_MONTH' | 'ANNIVERSARY_MONTH'
) {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 1 || value > 12) {
    throw new Error(`${field}_INVALID`);
  }
  return value;
}

function normalizeDay(
  value: number | undefined,
  field: 'BIRTHDAY_DAY' | 'ANNIVERSARY_DAY'
) {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new Error(`${field}_INVALID`);
  }
  return value;
}

async function patchSubscriptionPlan(
  ctx: any,
  userId: Id<'users'>,
  plan: SubscriptionPlan,
  options?: {
    productId?: string;
    status?: SubscriptionPlanStatus;
    updatedAt?: number;
  }
) {
  assertCanonicalSubscriptionPlan(plan);
  const timestamp = options?.updatedAt ?? Date.now();
  const status = options?.status ?? DEFAULT_PLAN_STATUS[plan];
  await ctx.db.patch(userId, {
    subscriptionPlan: plan,
    subscriptionStatus: status,
    subscriptionProductId: options?.productId ?? undefined,
    subscriptionUpdatedAt: timestamp,
    userType: plan === 'starter' ? 'free' : 'paid',
    updatedAt: timestamp,
  });
}

async function findUserByExternalId(ctx: any, externalId: string) {
  return await ctx.db
    .query('users')
    .withIndex('by_externalId', (q: any) => q.eq('externalId', externalId))
    .unique();
}

const DELETE_BATCH_SIZE = 100;
const WIPE_ALL_TABLE_ORDER = [
  'apiKeys',
  'apiClients',
  'providerRevocationJobs',
  'providerRevocationCredentials',
  'businessDeletionRecipients',
  'businessDeletionAssets',
  'businessDeletionJobs',
  'accountDeletionRequests',
  'supportRequests',
  'referralAdminAuditLog',
  'businessReferrals',
  'businessReferralLinks',
  'referralRewards',
  'customerReferrals',
  'customerReferralLinks',
  'referralConfigs',
  'pushDeliveryLog',
  'pushTokens',
  'messageLog',
  'campaigns',
  'subscriptions',
  'scanSessions',
  'scanTokenEvents',
  'events',
  'memberships',
  'loyaltyPrograms',
  'staffInvites',
  'businessStaff',
  'businesses',
  'userIdentities',
  'emailOtps',
  'authVerificationCodes',
  'authRefreshTokens',
  'authVerifiers',
  'authSessions',
  'authAccounts',
  'authRateLimits',
  'users',
] as const;

type WipeAllTableName = (typeof WIPE_ALL_TABLE_ORDER)[number];
type WipeAllDataHardCounts = Record<WipeAllTableName, number>;

export type WipeAllDataHardResult = {
  success: true;
  message: string;
  requestedByUserId: Id<'users'>;
  timestamp: number;
  counts: WipeAllDataHardCounts;
};

type DeleteStats = {
  users: number;
  userIdentities: number;
  businessOnboardingDrafts: number;
  businesses: number;
  businessStaff: number;
  loyaltyPrograms: number;
  memberships: number;
  events: number;
  scanTokenEvents: number;
  scanSessions: number;
  campaigns: number;
  subscriptions: number;
  referralConfigs: number;
  customerReferralLinks: number;
  customerReferrals: number;
  referralRewards: number;
  businessReferralLinks: number;
  businessReferrals: number;
  referralAdminAuditLog: number;
  messageLog: number;
  pushTokens: number;
  pushDeliveryLog: number;
  supportRequests: number;
  apiClients: number;
  apiKeys: number;
  authAccounts: number;
  authSessions: number;
  authRefreshTokens: number;
  authVerificationCodes: number;
  authVerifiers: number;
  emailOtps: number;
  staffInvites: number;
  providerRevocationCredentials: number;
};

type DeleteMyAccountHardErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'MISSING_IDENTITY_SUBJECT'
  | 'USER_NOT_FOUND'
  | 'SOLE_OWNER_BUSINESS_BLOCKED';

type DeleteMyAccountHardSuccess = {
  success: true;
  message: string;
  deletedUserId: Id<'users'>;
  deletedBusinessIds: Id<'businesses'>[];
  deleted: DeleteStats;
  revocationQueuedProviders: Array<'apple' | 'google'>;
  manualFallbackProviders: Array<'apple' | 'google'>;
};

type DeleteMyAccountHardError = {
  success: false;
  errorCode: DeleteMyAccountHardErrorCode;
  message: string;
  blockedBusinessIds?: Id<'businesses'>[];
};

export type DeleteMyAccountHardResult =
  | DeleteMyAccountHardSuccess
  | DeleteMyAccountHardError;

function emptyDeleteStats(): DeleteStats {
  return {
    users: 0,
    userIdentities: 0,
    businessOnboardingDrafts: 0,
    businesses: 0,
    businessStaff: 0,
    loyaltyPrograms: 0,
    memberships: 0,
    events: 0,
    scanTokenEvents: 0,
    scanSessions: 0,
    campaigns: 0,
    subscriptions: 0,
    referralConfigs: 0,
    customerReferralLinks: 0,
    customerReferrals: 0,
    referralRewards: 0,
    businessReferralLinks: 0,
    businessReferrals: 0,
    referralAdminAuditLog: 0,
    messageLog: 0,
    pushTokens: 0,
    pushDeliveryLog: 0,
    supportRequests: 0,
    apiClients: 0,
    apiKeys: 0,
    authAccounts: 0,
    authSessions: 0,
    authRefreshTokens: 0,
    authVerificationCodes: 0,
    authVerifiers: 0,
    emailOtps: 0,
    staffInvites: 0,
    providerRevocationCredentials: 0,
  };
}

function emptyWipeAllDataHardCounts(): WipeAllDataHardCounts {
  return {
    apiKeys: 0,
    apiClients: 0,
    providerRevocationJobs: 0,
    providerRevocationCredentials: 0,
    businessDeletionRecipients: 0,
    businessDeletionAssets: 0,
    businessDeletionJobs: 0,
    accountDeletionRequests: 0,
    supportRequests: 0,
    referralAdminAuditLog: 0,
    businessReferrals: 0,
    businessReferralLinks: 0,
    referralRewards: 0,
    customerReferrals: 0,
    customerReferralLinks: 0,
    referralConfigs: 0,
    pushDeliveryLog: 0,
    pushTokens: 0,
    messageLog: 0,
    campaigns: 0,
    subscriptions: 0,
    scanSessions: 0,
    scanTokenEvents: 0,
    events: 0,
    memberships: 0,
    loyaltyPrograms: 0,
    staffInvites: 0,
    businessStaff: 0,
    businesses: 0,
    userIdentities: 0,
    emailOtps: 0,
    authVerificationCodes: 0,
    authRefreshTokens: 0,
    authVerifiers: 0,
    authSessions: 0,
    authAccounts: 0,
    authRateLimits: 0,
    users: 0,
  };
}

async function deleteTableInBatches(
  ctx: any,
  tableName: string,
  batchSize = DELETE_BATCH_SIZE
) {
  let deletedCount = 0;

  while (true) {
    const docs = await ctx.db.query(tableName).take(batchSize);
    if (docs.length === 0) {
      break;
    }

    for (const doc of docs) {
      await ctx.db.delete(doc._id);
      deletedCount += 1;
    }
  }

  return deletedCount;
}

async function collectAccountDeletionRequestEmails(ctx: any) {
  const emails = new Set<string>();
  let cursor: string | null = null;

  while (true) {
    const page: PaginationResult<Doc<'accountDeletionRequests'>> = await ctx.db
      .query('accountDeletionRequests')
      .paginate({ cursor, numItems: DELETE_BATCH_SIZE });
    for (const request of page.page) {
      emails.add(normalizeAccountDeletionEmail(request.email));
    }
    if (page.isDone) {
      break;
    }
    cursor = page.continueCursor;
  }

  return emails;
}

async function deleteByIndexInBatches(
  ctx: any,
  tableName: string,
  indexName: string,
  fieldName: string,
  value: unknown,
  batchSize = DELETE_BATCH_SIZE
) {
  let deletedCount = 0;
  while (true) {
    const docs = await ctx.db
      .query(tableName)
      .withIndex(indexName, (q: any) => q.eq(fieldName, value))
      .take(batchSize);

    if (docs.length === 0) {
      break;
    }

    for (const doc of docs) {
      await ctx.db.delete(doc._id);
      deletedCount += 1;
    }
  }
  return deletedCount;
}

async function redactUserReferenceByIndexInBatches(
  ctx: any,
  tableName: string,
  indexName: string,
  fieldName: string,
  userId: Id<'users'>,
  batchSize = DELETE_BATCH_SIZE
) {
  let redactedCount = 0;
  while (true) {
    const docs = await ctx.db
      .query(tableName)
      .withIndex(indexName, (q: any) => q.eq(fieldName, userId))
      .take(batchSize);

    if (docs.length === 0) {
      break;
    }

    for (const doc of docs) {
      const patch: Record<string, unknown> = { [fieldName]: undefined };
      if ('updatedAt' in doc) {
        patch.updatedAt = Date.now();
      }
      await ctx.db.patch(doc._id, patch);
      redactedCount += 1;
    }
  }
  return redactedCount;
}

function isActiveOwnerStaff(staff: any) {
  return (
    staff?.staffRole === 'owner' && getBusinessStaffStatus(staff) === 'active'
  );
}

function isActiveUserDoc(user: any) {
  return user?.isActive === true;
}

async function selectDeterministicReplacementOwner(
  ctx: any,
  owners: any[],
  deletingUserId: Id<'users'>
) {
  const validCandidates = [];
  for (const candidate of owners) {
    if (
      String(candidate.userId) === String(deletingUserId) ||
      !isActiveOwnerStaff(candidate)
    ) {
      continue;
    }

    const candidateUser = await ctx.db.get(candidate.userId);
    if (!isActiveUserDoc(candidateUser)) {
      continue;
    }

    validCandidates.push(candidate);
  }

  return validCandidates.sort((left: any, right: any) => {
    const createdAtDelta =
      Number(left.createdAt ?? 0) - Number(right.createdAt ?? 0);
    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }
    return String(left._id).localeCompare(String(right._id));
  })[0];
}

async function assertCanDeleteUserWithoutOrphaningSoleOwnedBusiness(
  ctx: any,
  userId: Id<'users'>
) {
  const staffRows = await ctx.db
    .query('businessStaff')
    .withIndex('by_userId', (q: any) => q.eq('userId', userId))
    .collect();

  const activeOwnerRows = staffRows.filter(isActiveOwnerStaff);
  const ownedBusinesses = await ctx.db
    .query('businesses')
    .withIndex('by_ownerUserId', (q: any) => q.eq('ownerUserId', userId))
    .collect();
  const businessIdsToCheck = Array.from(
    new Set([
      ...activeOwnerRows.map((row: any) => row.businessId),
      ...ownedBusinesses.map((business: any) => business._id),
    ])
  );
  const blockedBusinessIds: Id<'businesses'>[] = [];
  const ownerReassignments: Array<{
    businessId: Id<'businesses'>;
    nextOwnerUserId: Id<'users'>;
  }> = [];

  for (const businessId of businessIdsToCheck) {
    const business = await ctx.db.get(businessId);
    if (!business) {
      continue;
    }

    const owners = await ctx.db
      .query('businessStaff')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .collect();
    const otherActiveOwner = await selectDeterministicReplacementOwner(
      ctx,
      owners,
      userId
    );

    if (!otherActiveOwner) {
      blockedBusinessIds.push(businessId);
      continue;
    }

    if (String(business.ownerUserId) === String(userId)) {
      ownerReassignments.push({
        businessId,
        nextOwnerUserId: otherActiveOwner.userId,
      });
    }
  }

  return { blockedBusinessIds, ownerReassignments };
}

async function deleteUserScopedBusinessData(
  ctx: any,
  userId: Id<'users'>,
  deleted: DeleteStats
) {
  deleted.businessOnboardingDrafts += await deleteByIndexInBatches(
    ctx,
    'businessOnboardingDrafts',
    'by_userId',
    'userId',
    userId
  );
  deleted.memberships += await deleteByIndexInBatches(
    ctx,
    'memberships',
    'by_userId',
    'userId',
    userId
  );
  deleted.scanTokenEvents += await deleteByIndexInBatches(
    ctx,
    'scanTokenEvents',
    'by_customerId',
    'customerId',
    userId
  );
  await redactUserReferenceByIndexInBatches(
    ctx,
    'scanSessions',
    'by_customerId',
    'customerId',
    userId
  );
  await redactUserReferenceByIndexInBatches(
    ctx,
    'scanSessions',
    'by_actorUserId',
    'actorUserId',
    userId
  );
  await redactUserReferenceByIndexInBatches(
    ctx,
    'events',
    'by_customerUserId',
    'customerUserId',
    userId
  );
  await redactUserReferenceByIndexInBatches(
    ctx,
    'events',
    'by_actorUserId',
    'actorUserId',
    userId
  );
  deleted.messageLog += await deleteByIndexInBatches(
    ctx,
    'messageLog',
    'by_toUserId',
    'toUserId',
    userId
  );
  deleted.pushDeliveryLog += await deleteByIndexInBatches(
    ctx,
    'pushDeliveryLog',
    'by_toUserId',
    'toUserId',
    userId
  );
  deleted.pushTokens += await deleteByIndexInBatches(
    ctx,
    'pushTokens',
    'by_userId',
    'userId',
    userId
  );
  deleted.supportRequests += await deleteByIndexInBatches(
    ctx,
    'supportRequests',
    'by_userId',
    'userId',
    userId
  );
  deleted.businessStaff += await deleteByIndexInBatches(
    ctx,
    'businessStaff',
    'by_userId',
    'userId',
    userId
  );
  deleted.staffInvites += await deleteByIndexInBatches(
    ctx,
    'staffInvites',
    'by_invitedByUserId',
    'invitedByUserId',
    userId
  );
  deleted.referralRewards += await deleteByIndexInBatches(
    ctx,
    'referralRewards',
    'by_recipientUserId_status_expiresAt',
    'recipientUserId',
    userId
  );
  await redactUserReferenceByIndexInBatches(
    ctx,
    'customerReferralLinks',
    'by_referrer_business_origin_status',
    'referrerUserId',
    userId
  );
  await redactUserReferenceByIndexInBatches(
    ctx,
    'customerReferrals',
    'by_referrerUserId_businessId_createdAt',
    'referrerUserId',
    userId
  );
  await redactUserReferenceByIndexInBatches(
    ctx,
    'customerReferrals',
    'by_referredUserId',
    'referredUserId',
    userId
  );
  await redactUserReferenceByIndexInBatches(
    ctx,
    'businessReferralLinks',
    'by_createdByUserId',
    'createdByUserId',
    userId
  );
  await redactUserReferenceByIndexInBatches(
    ctx,
    'businessReferrals',
    'by_createdByUserId',
    'createdByUserId',
    userId
  );
}

async function deleteAuthMappingsForUser(
  ctx: any,
  userId: Id<'users'>,
  deleted: DeleteStats
) {
  while (true) {
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q: any) => q.eq('userId', userId))
      .first();

    if (!account) {
      break;
    }

    deleted.authVerificationCodes += await deleteByIndexInBatches(
      ctx,
      'authVerificationCodes',
      'accountId',
      'accountId',
      account._id
    );
    await ctx.db.delete(account._id);
    deleted.authAccounts += 1;
  }

  while (true) {
    const session = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q: any) => q.eq('userId', userId))
      .first();

    if (!session) {
      break;
    }

    deleted.authRefreshTokens += await deleteByIndexInBatches(
      ctx,
      'authRefreshTokens',
      'sessionId',
      'sessionId',
      session._id
    );
    deleted.authVerifiers += await deleteByIndexInBatches(
      ctx,
      'authVerifiers',
      'by_sessionId',
      'sessionId',
      session._id
    );
    await ctx.db.delete(session._id);
    deleted.authSessions += 1;
  }
}

export async function updateSubscriptionPlanByExternalId(
  ctx: any,
  externalId: string,
  plan: SubscriptionPlan,
  options?: {
    productId?: string;
    status?: SubscriptionPlanStatus;
    updatedAt?: number;
  }
) {
  if (!externalId) {
    throw new Error('EXTERNAL_ID_REQUIRED');
  }
  const user = await findUserByExternalId(ctx, externalId);
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  await patchSubscriptionPlan(ctx, user._id, plan, options);
  return user._id;
}

// שליפת המשתמש הנוכחי המחובר
// מחזיר null אם המשתמש לא מחובר
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      return null;
    }

    const user = await ctx.db.get(authUserId);
    return user ?? null;
  },
});

// שליפת משתמש לפי מזהה (ID)
type ActiveMode = 'customer' | 'business';

export const getSessionContext = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return null;
    }
    const now = Date.now();

    const staffEntries = await ctx.db
      .query('businessStaff')
      .withIndex('by_userId', (q: any) => q.eq('userId', user._id))
      .collect();

    const businesses = (
      await Promise.all(
        staffEntries.map(async (staff) => {
          if (getBusinessStaffStatus(staff) !== 'active') {
            return null;
          }
          const biz = await ctx.db.get(staff.businessId);
          if (!biz || !biz.isActive) {
            return null;
          }
          return {
            id: biz._id,
            name: biz.name,
            staffRole: staff.staffRole,
          };
        })
      )
    ).filter((b): b is NonNullable<typeof b> => b !== null);

    const [pendingByEmail, pendingByUserId] = await Promise.all([
      normalizeEmailAddress(user.email)
        ? ctx.db
            .query('staffInvites')
            .withIndex('by_invitedEmail', (q: any) =>
              q.eq('invitedEmail', normalizeEmailAddress(user.email)!)
            )
            .filter((q: any) => q.eq(q.field('status'), 'pending'))
            .collect()
        : Promise.resolve([]),
      ctx.db
        .query('staffInvites')
        .withIndex('by_invitedUserId', (q: any) =>
          q.eq('invitedUserId', user._id)
        )
        .filter((q: any) => q.eq(q.field('status'), 'pending'))
        .collect(),
    ]);

    const pendingInviteMap = new Map<string, any>();
    for (const invite of pendingByEmail) {
      pendingInviteMap.set(String(invite._id), invite);
    }
    for (const invite of pendingByUserId) {
      pendingInviteMap.set(String(invite._id), invite);
    }

    const pendingInvites = (
      await Promise.all(
        Array.from(pendingInviteMap.values()).map(async (invite) => {
          if (invite.expiresAt <= now) {
            return null;
          }
          const biz = await ctx.db.get(invite.businessId as Id<'businesses'>);
          if (!biz || !biz.isActive) {
            return null;
          }
          return {
            inviteId: invite._id,
            businessId: biz._id,
            businessName: biz.name,
            inviteCode: invite.inviteCode,
            targetRole: invite.targetRole,
          };
        })
      )
    ).filter((i): i is NonNullable<typeof i> => i !== null);

    const roles = {
      owner: businesses.some((b) => b.staffRole === 'owner'),
      manager: businesses.some((b) => b.staffRole === 'manager'),
      staff: businesses.length > 0,
      customer: true,
    };

    const activeBusinessId =
      user.activeBusinessId &&
      businesses.some(
        (business) => String(business.id) === String(user.activeBusinessId)
      )
        ? user.activeBusinessId
        : null;
    const activeMembership =
      businesses.find(
        (business) => String(business.id) === String(activeBusinessId)
      ) ?? null;

    const activeMode: ActiveMode =
      user.activeMode === 'business' && activeMembership
        ? 'business'
        : 'customer';

    return {
      user: {
        _id: user._id,
        email: user.email,
        phone: user.phone,
        marketingOptIn: user.marketingOptIn,
        marketingOptInAt: user.marketingOptInAt,
        birthdayMonth: user.birthdayMonth,
        birthdayDay: user.birthdayDay,
        anniversaryMonth: user.anniversaryMonth,
        anniversaryDay: user.anniversaryDay,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        customerOnboardedAt: user.customerOnboardedAt,
        businessOnboardedAt: user.businessOnboardedAt,
        activeMode: user.activeMode as ActiveMode | undefined,
        userType: user.userType,
        subscriptionPlan: normalizeUserSubscriptionPlan(user.subscriptionPlan),
        subscriptionStatus: user.subscriptionStatus,
        isActive: user.isActive,
      },
      isAdmin: user.isAdmin === true,
      roles,
      businesses,
      pendingInvites,
      activeMode,
      activeBusinessId,
    };
  },
});

export const setActiveMode = mutation({
  args: {
    mode: v.union(v.literal('customer'), v.literal('business')),
  },
  handler: async (ctx, { mode }) => {
    const user = await requireCurrentUser(ctx);
    await ctx.db.patch(user._id, {
      activeMode: mode,
      updatedAt: Date.now(),
    });
    return user._id;
  },
});

export const setActiveBusiness = mutation({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    const user = await requireCurrentUser(ctx);

    const staffRecord = await ctx.db
      .query('businessStaff')
      .withIndex('by_businessId_userId', (q: any) =>
        q.eq('businessId', businessId).eq('userId', user._id)
      )
      .first();

    if (!staffRecord) {
      throw new Error('NOT_AUTHORIZED');
    }
    if (getBusinessStaffStatus(staffRecord) !== 'active') {
      throw new Error('NOT_AUTHORIZED');
    }
    await requireActiveBusiness(ctx, businessId);

    await ctx.db.patch(user._id, {
      activeBusinessId: businessId,
      updatedAt: Date.now(),
    });

    return {
      userId: user._id,
      activeBusinessId: businessId,
    };
  },
});

/** @deprecated Use setActiveMode. Kept for backward compatibility during migration. */
export const setPreferredMode = mutation({
  args: {
    mode: v.union(
      v.literal('customer'),
      v.literal('business'),
      v.literal('staff')
    ),
  },
  handler: async (ctx, { mode }) => {
    const user = await requireCurrentUser(ctx);
    const activeMode = mode === 'staff' ? 'customer' : mode;
    await ctx.db.patch(user._id, {
      activeMode,
      updatedAt: Date.now(),
    });
    return user._id;
  },
});

export const completeCustomerOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    await ctx.db.patch(user._id, {
      customerOnboardedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const completeBusinessOnboarding = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    flow: BUSINESS_ONBOARDING_FLOW_UNION,
  },
  handler: async (ctx, { businessId, programId, flow }) => {
    const user = await requireCurrentUser(ctx);
    const onboardingFlow = flow as BusinessOnboardingFlow;
    if (onboardingFlow === 'additional' && user.businessOnboardedAt == null) {
      throw new Error('DEFAULT_BUSINESS_ONBOARDING_REQUIRED');
    }
    const owner = await requireActorIsBusinessOwner(ctx, businessId);
    const business = await ctx.db.get(businessId);
    if (
      !business ||
      business.isActive !== true ||
      String(owner._id) !== String(user._id) ||
      String(business.ownerUserId) !== String(user._id)
    ) {
      throw new Error('NOT_AUTHORIZED');
    }

    const profileCompletion = computeBusinessProfileCompletion(business);
    if (!profileCompletion.isComplete) {
      throw new Error(
        `BUSINESS_PROFILE_INCOMPLETE:${profileCompletion.missingFields.join(',')}`
      );
    }

    const program = await ctx.db.get(programId);
    if (!program) {
      throw new Error('PROGRAM_NOT_FOUND');
    }
    if (String(program.businessId) !== String(businessId)) {
      throw new Error('PROGRAM_BUSINESS_MISMATCH');
    }
    if (
      program.isActive !== true ||
      resolveProgramLifecycle(program) !== 'active'
    ) {
      throw new Error('PROGRAM_NOT_PUBLISHED');
    }

    const draft = await getBusinessOnboardingDraftForUserAndFlow(
      ctx,
      user._id,
      onboardingFlow
    );
    if (!draft) {
      throw new Error('ONBOARDING_DRAFT_NOT_FOUND');
    }
    if (
      !draft.businessId ||
      String(draft.businessId) !== String(businessId)
    ) {
      throw new Error('ONBOARDING_DRAFT_BUSINESS_MISMATCH');
    }
    if (!draft.programId || String(draft.programId) !== String(programId)) {
      throw new Error('ONBOARDING_DRAFT_PROGRAM_MISMATCH');
    }
    const programDraftLinks = await ctx.db
      .query('businessOnboardingDrafts')
      .withIndex('by_programId', (q) => q.eq('programId', programId))
      .collect();
    if (programDraftLinks.some((linkedDraft) => linkedDraft._id !== draft._id)) {
      throw new Error('PROGRAM_ONBOARDING_FLOW_MISMATCH');
    }

    const now = Date.now();
    await ctx.db.patch(user._id, {
      businessOnboardedAt: user.businessOnboardedAt ?? now,
      activeBusinessId: businessId,
      activeMode: 'business',
      updatedAt: now,
    });
    await ctx.db.patch(draft._id, {
      status: 'completed',
      currentStep: 'previewCard',
      farthestStep: 'previewCard',
      farthestStepOrder: onboardingFlow === 'additional' ? 4 : 5,
      businessId,
      programId,
      pausedAt: undefined,
      completedAt: draft.completedAt ?? now,
      updatedAt: now,
    });

    return {
      userId: user._id,
      businessId,
      programId,
      flow: onboardingFlow,
      completedAt: draft.completedAt ?? now,
    };
  },
});

export const getById = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

// שליפת רשימת כל המשתמשים הפעילים
export const listActive = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('users')
      .filter((q) => q.eq(q.field('isActive'), true))
      .collect();
  },
});

// עדכון פרופיל המשתמש (למשל, שינוי שם)
export const updateProfile = internalMutation({
  args: {
    userId: v.id('users'),
    fullName: v.optional(v.string()),
  },
  handler: async (ctx, { userId, fullName }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Not authenticated');
    }

    await ctx.db.patch(userId, {
      fullName,
      updatedAt: Date.now(),
    });

    return userId;
  },
});

export const setMyName = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
  },
  handler: async (ctx, { firstName, lastName }) => {
    const user = await requireCurrentUser(ctx);

    const normalizedFirstName = normalizeNamePart(firstName, 'FIRST_NAME');
    const normalizedLastName = normalizeNamePart(lastName, 'LAST_NAME');
    const now = Date.now();

    await ctx.db.patch(user._id, {
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      fullName: `${normalizedFirstName} ${normalizedLastName}`,
      updatedAt: now,
    });

    const updatedUser = await ctx.db.get(user._id);
    if (!updatedUser) {
      throw new Error('USER_NOT_FOUND');
    }
    return updatedUser;
  },
});

export const setMyPhone = mutation({
  args: {
    phone: v.string(),
  },
  handler: async (ctx, { phone }) => {
    const user = await requireCurrentUser(ctx);
    const normalizedPhone = normalizePhone(phone);
    const now = Date.now();

    await ctx.db.patch(user._id, {
      phone: normalizedPhone,
      updatedAt: now,
    });

    const updatedUser = await ctx.db.get(user._id);
    if (!updatedUser) {
      throw new Error('USER_NOT_FOUND');
    }
    return updatedUser;
  },
});

export const setMyMarketingProfile = mutation({
  args: {
    marketingOptIn: v.boolean(),
    birthdayMonth: v.optional(v.number()),
    birthdayDay: v.optional(v.number()),
    anniversaryMonth: v.optional(v.number()),
    anniversaryDay: v.optional(v.number()),
  },
  handler: async (
    ctx,
    {
      marketingOptIn,
      birthdayMonth,
      birthdayDay,
      anniversaryMonth,
      anniversaryDay,
    }
  ) => {
    const user = await requireCurrentUser(ctx);

    const normalizedBirthdayMonth = normalizeMonth(
      birthdayMonth,
      'BIRTHDAY_MONTH'
    );
    const normalizedBirthdayDay = normalizeDay(birthdayDay, 'BIRTHDAY_DAY');
    const normalizedAnniversaryMonth = normalizeMonth(
      anniversaryMonth,
      'ANNIVERSARY_MONTH'
    );
    const normalizedAnniversaryDay = normalizeDay(
      anniversaryDay,
      'ANNIVERSARY_DAY'
    );

    if (
      (normalizedBirthdayMonth === undefined) !==
      (normalizedBirthdayDay === undefined)
    ) {
      throw new Error('BIRTHDAY_INCOMPLETE');
    }
    if (
      (normalizedAnniversaryMonth === undefined) !==
      (normalizedAnniversaryDay === undefined)
    ) {
      throw new Error('ANNIVERSARY_INCOMPLETE');
    }

    const now = Date.now();
    const patch: Record<string, unknown> = {
      marketingOptIn,
      birthdayMonth: normalizedBirthdayMonth,
      birthdayDay: normalizedBirthdayDay,
      anniversaryMonth: normalizedAnniversaryMonth,
      anniversaryDay: normalizedAnniversaryDay,
      updatedAt: now,
    };

    if (marketingOptIn) {
      patch.marketingOptInAt = user.marketingOptInAt ?? now;
    } else {
      patch.marketingOptInAt = undefined;
    }

    await ctx.db.patch(user._id, patch);
    const updatedUser = await ctx.db.get(user._id);
    if (!updatedUser) {
      throw new Error('USER_NOT_FOUND');
    }
    return updatedUser;
  },
});

// עדכון תוכנית מנוי עבור המשתמש הנוכחי
export const updateSubscriptionPlan = mutation({
  args: {
    plan: SUBSCRIPTION_PLAN_UNION,
    productId: v.optional(v.string()),
    status: v.optional(SUBSCRIPTION_STATUS_UNION),
  },
  handler: async () => {
    throw new Error('SUBSCRIPTION_CLIENT_SYNC_DISABLED');
  },
});

// מחיקת חשבון המשתמש הנוכחי וכל הנתונים המשויכים אליו
// ⚠️ אזהרה: פעולה זו בלתי הפיכה ותמחק את כל הנתונים לצמיתות!
export async function deleteMyAccountHardImpl(
  ctx: any
): Promise<DeleteMyAccountHardResult> {
  const user = await getCurrentUserOrNull(ctx);
  if (!user) {
    return {
      success: false,
      errorCode: 'NOT_AUTHENTICATED',
      message: 'לא נמצא משתמש מחובר. התחברו מחדש ונסו שוב.',
    };
  }

  const { blockedBusinessIds, ownerReassignments } =
    await assertCanDeleteUserWithoutOrphaningSoleOwnedBusiness(ctx, user._id);
  const incompleteDeletionBusinessIds =
    await getIncompleteDeletionBusinessIdsForUser(ctx, user._id);
  const allBlockedBusinessIds = Array.from(
    new Set([...blockedBusinessIds, ...incompleteDeletionBusinessIds])
  );
  if (allBlockedBusinessIds.length > 0) {
    return {
      success: false,
      errorCode: 'SOLE_OWNER_BUSINESS_BLOCKED',
      message:
        'לא ניתן למחוק את החשבון כל עוד קיים עסק בבעלותך ללא בעלים חלופי. ההגבלה חלה גם על עסק סגור, משום שנתוני העסק נשמרים לצורך שחזור.',
      blockedBusinessIds: allBlockedBusinessIds,
    };
  }

  for (const reassignment of ownerReassignments) {
    await ctx.db.patch(reassignment.businessId, {
      ownerUserId: reassignment.nextOwnerUserId,
      updatedAt: Date.now(),
    });
  }

  await cleanupCompletedDeletionReferencesForUser(ctx, user._id);

  const deleted = emptyDeleteStats();
  const providerRevocation = await prepareProviderRevocationsForUser(
    ctx,
    user._id
  );
  deleted.providerRevocationCredentials +=
    providerRevocation.deletedCredentials;

  await deleteUserScopedBusinessData(ctx, user._id, deleted);
  deleted.userIdentities += await deleteByIndexInBatches(
    ctx,
    'userIdentities',
    'by_userId',
    'userId',
    user._id
  );
  await deleteAuthMappingsForUser(ctx, user._id, deleted);

  if (user.email) {
    deleted.emailOtps += await deleteByIndexInBatches(
      ctx,
      'emailOtps',
      'by_email',
      'email',
      String(user.email).toLowerCase()
    );
  }

  await ctx.db.delete(user._id);
  deleted.users += 1;

  return {
    success: true,
    message: 'החשבון נמחק לצמיתות.',
    deletedUserId: user._id,
    deletedBusinessIds: [],
    deleted,
    revocationQueuedProviders: providerRevocation.queuedProviders,
    manualFallbackProviders: providerRevocation.manualFallbackProviders,
  };
}

export const deleteMyAccountHard = mutation({
  args: {},
  handler: async (ctx) => {
    return await deleteMyAccountHardImpl(ctx);
  },
});

export async function wipeAllDataHardImpl(
  ctx: any,
  options?: {
    resetAccountDeletionEmailLimit?: (
      ctx: any,
      email: string
    ) => Promise<void>;
  }
): Promise<WipeAllDataHardResult> {
  const requester = await requireCurrentUser(ctx);
  const counts = emptyWipeAllDataHardCounts();
  const accountDeletionEmails = await collectAccountDeletionRequestEmails(ctx);
  const resetAccountDeletionEmailLimit =
    options?.resetAccountDeletionEmailLimit ??
    resetAccountDeletionEmailRateLimit;

  for (const email of accountDeletionEmails) {
    try {
      await resetAccountDeletionEmailLimit(ctx, email);
    } catch {
      throw new Error('ACCOUNT_DELETION_EMAIL_RATE_LIMIT_RESET_FAILED');
    }
  }

  for (const tableName of WIPE_ALL_TABLE_ORDER) {
    counts[tableName] = await deleteTableInBatches(ctx, tableName);
  }

  return {
    success: true,
    message: 'All project data was permanently deleted.',
    requestedByUserId: requester._id,
    timestamp: Date.now(),
    counts,
  };
}

export const wipeAllDataHard = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await wipeAllDataHardImpl(ctx);
  },
});

// Backward-compatible alias.
export const deleteMyAccount = mutation({
  args: {},
  handler: async (ctx) => {
    return await deleteMyAccountHardImpl(ctx);
  },
});

// Debug: return raw auth identity (for diagnosis)
export const debugIdentity = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return {
      hasIdentity: !!identity,
      subject: identity?.subject ?? null,
      email: (identity as any)?.email ?? null,
      identity,
    };
  },
});
