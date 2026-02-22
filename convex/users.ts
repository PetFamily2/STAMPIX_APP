import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import type { SubscriptionPlan } from '../lib/domain/subscriptions';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { getCurrentUserOrNull, requireCurrentUser } from './guards';

const SUBSCRIPTION_PLAN_UNION = v.union(
  v.literal('free'),
  v.literal('pro'),
  v.literal('unlimited')
);

const SUBSCRIPTION_STATUS_UNION = v.union(
  v.literal('active'),
  v.literal('inactive'),
  v.literal('cancelled')
);

type SubscriptionPlanStatus = 'active' | 'inactive' | 'cancelled';

const DEFAULT_PLAN_STATUS: Record<SubscriptionPlan, SubscriptionPlanStatus> = {
  free: 'inactive',
  pro: 'active',
  unlimited: 'active',
};

const NAME_MAX_LENGTH = 60;

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
  const timestamp = options?.updatedAt ?? Date.now();
  const status = options?.status ?? DEFAULT_PLAN_STATUS[plan];
  await ctx.db.patch(userId, {
    subscriptionPlan: plan,
    subscriptionStatus: status,
    subscriptionProductId: options?.productId ?? undefined,
    subscriptionUpdatedAt: timestamp,
    userType: plan === 'free' ? 'free' : 'paid',
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
  'messageLog',
  'campaigns',
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
  businesses: number;
  businessStaff: number;
  loyaltyPrograms: number;
  memberships: number;
  events: number;
  scanTokenEvents: number;
  campaigns: number;
  messageLog: number;
  apiClients: number;
  apiKeys: number;
  authAccounts: number;
  authSessions: number;
  authRefreshTokens: number;
  authVerificationCodes: number;
  authVerifiers: number;
  emailOtps: number;
  staffInvites: number;
};

type DeleteMyAccountHardErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'MISSING_IDENTITY_SUBJECT'
  | 'USER_NOT_FOUND';

type DeleteMyAccountHardSuccess = {
  success: true;
  message: string;
  deletedUserId: Id<'users'>;
  deletedBusinessIds: Id<'businesses'>[];
  deleted: DeleteStats;
};

type DeleteMyAccountHardError = {
  success: false;
  errorCode: DeleteMyAccountHardErrorCode;
  message: string;
};

export type DeleteMyAccountHardResult =
  | DeleteMyAccountHardSuccess
  | DeleteMyAccountHardError;

function emptyDeleteStats(): DeleteStats {
  return {
    users: 0,
    userIdentities: 0,
    businesses: 0,
    businessStaff: 0,
    loyaltyPrograms: 0,
    memberships: 0,
    events: 0,
    scanTokenEvents: 0,
    campaigns: 0,
    messageLog: 0,
    apiClients: 0,
    apiKeys: 0,
    authAccounts: 0,
    authSessions: 0,
    authRefreshTokens: 0,
    authVerificationCodes: 0,
    authVerifiers: 0,
    emailOtps: 0,
    staffInvites: 0,
  };
}

function emptyWipeAllDataHardCounts(): WipeAllDataHardCounts {
  return {
    apiKeys: 0,
    apiClients: 0,
    messageLog: 0,
    campaigns: 0,
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

async function deleteApiClientsAndKeysForBusiness(
  ctx: any,
  businessId: Id<'businesses'>,
  deleted: DeleteStats
) {
  while (true) {
    const clients = await ctx.db
      .query('apiClients')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .take(DELETE_BATCH_SIZE);

    if (clients.length === 0) {
      break;
    }

    for (const client of clients) {
      deleted.apiKeys += await deleteByIndexInBatches(
        ctx,
        'apiKeys',
        'by_clientId',
        'clientId',
        client._id
      );
      await ctx.db.delete(client._id);
      deleted.apiClients += 1;
    }
  }
}

async function deleteBusinessGraph(
  ctx: any,
  businessId: Id<'businesses'>,
  deleted: DeleteStats
) {
  // TODO: If media metadata / file storage tables are added, delete files here.
  await deleteApiClientsAndKeysForBusiness(ctx, businessId, deleted);

  deleted.messageLog += await deleteByIndexInBatches(
    ctx,
    'messageLog',
    'by_businessId',
    'businessId',
    businessId
  );
  deleted.campaigns += await deleteByIndexInBatches(
    ctx,
    'campaigns',
    'by_businessId',
    'businessId',
    businessId
  );
  deleted.scanTokenEvents += await deleteByIndexInBatches(
    ctx,
    'scanTokenEvents',
    'by_businessId',
    'businessId',
    businessId
  );
  deleted.events += await deleteByIndexInBatches(
    ctx,
    'events',
    'by_businessId',
    'businessId',
    businessId
  );
  deleted.memberships += await deleteByIndexInBatches(
    ctx,
    'memberships',
    'by_businessId',
    'businessId',
    businessId
  );
  deleted.loyaltyPrograms += await deleteByIndexInBatches(
    ctx,
    'loyaltyPrograms',
    'by_businessId',
    'businessId',
    businessId
  );
  deleted.businessStaff += await deleteByIndexInBatches(
    ctx,
    'businessStaff',
    'by_businessId',
    'businessId',
    businessId
  );
  deleted.staffInvites += await deleteByIndexInBatches(
    ctx,
    'staffInvites',
    'by_businessId',
    'businessId',
    businessId
  );

  await ctx.db.delete(businessId);
  deleted.businesses += 1;
}

async function deleteOwnedBusinesses(
  ctx: any,
  userId: Id<'users'>,
  deleted: DeleteStats
) {
  const deletedBusinessIds: Id<'businesses'>[] = [];

  while (true) {
    const ownedBusiness = await ctx.db
      .query('businesses')
      .withIndex('by_ownerUserId', (q: any) => q.eq('ownerUserId', userId))
      .first();

    if (!ownedBusiness) {
      break;
    }

    deletedBusinessIds.push(ownedBusiness._id);
    await deleteBusinessGraph(ctx, ownedBusiness._id, deleted);
  }

  return deletedBusinessIds;
}

async function deleteUserScopedBusinessData(
  ctx: any,
  userId: Id<'users'>,
  deleted: DeleteStats
) {
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
  deleted.events += await deleteByIndexInBatches(
    ctx,
    'events',
    'by_customerUserId',
    'customerUserId',
    userId
  );
  deleted.events += await deleteByIndexInBatches(
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

// ׳©׳׳™׳₪׳× ׳”׳׳©׳×׳׳© ׳”׳ ׳•׳›׳—׳™ ׳”׳׳—׳•׳‘׳¨
// ׳׳—׳–׳™׳¨ null ׳׳ ׳”׳׳©׳×׳׳© ׳׳ ׳׳—׳•׳‘׳¨
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) return null;

    const user = await ctx.db.get(authUserId);
    return user ?? null;
  },
});

// ׳©׳׳™׳₪׳× ׳׳©׳×׳׳© ׳׳₪׳™ ׳׳–׳”׳” (ID)
type ActiveMode = 'customer' | 'business';

export const getSessionContext = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;

    const staffEntries = await ctx.db
      .query('businessStaff')
      .withIndex('by_userId', (q: any) => q.eq('userId', user._id))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    const businesses = (
      await Promise.all(
        staffEntries.map(async (staff) => {
          const biz = await ctx.db.get(staff.businessId);
          if (!biz || !biz.isActive) return null;
          return {
            id: biz._id,
            name: biz.name,
            staffRole: staff.staffRole,
          };
        })
      )
    ).filter((b): b is NonNullable<typeof b> => b !== null);

    const pendingInvites = user.email
      ? (
          await Promise.all(
            (
              await ctx.db
                .query('staffInvites')
                .withIndex('by_invitedEmail', (q: any) =>
                  q.eq('invitedEmail', user.email!)
                )
                .filter((q: any) => q.eq(q.field('status'), 'pending'))
                .collect()
            ).map(async (invite) => {
              if (invite.expiresAt < Date.now()) return null;
              const biz = await ctx.db.get(invite.businessId);
              if (!biz || !biz.isActive) return null;
              return {
                inviteId: invite._id,
                businessId: biz._id,
                businessName: biz.name,
                inviteCode: invite.inviteCode,
              };
            })
          )
        ).filter((i): i is NonNullable<typeof i> => i !== null)
      : [];

    const roles = {
      owner: businesses.some((b) => b.staffRole === 'owner'),
      manager: businesses.some((b) => b.staffRole === 'manager'),
      staff: businesses.length > 0,
      customer: true,
    };

    const activeMode: ActiveMode =
      user.activeMode === 'business' &&
      businesses.some(
        (b) => b.staffRole === 'owner' || b.staffRole === 'manager'
      )
        ? 'business'
        : 'customer';

    return {
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        customerOnboardedAt: user.customerOnboardedAt,
        businessOnboardedAt: user.businessOnboardedAt,
        activeMode: user.activeMode as ActiveMode | undefined,
        userType: user.userType,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionStatus: user.subscriptionStatus,
        isActive: user.isActive,
      },
      isAdmin: user.isAdmin === true,
      roles,
      businesses,
      pendingInvites,
      activeMode,
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
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    await ctx.db.patch(user._id, {
      businessOnboardedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const getById = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

// ׳©׳׳™׳₪׳× ׳¨׳©׳™׳׳× ׳›׳ ׳”׳׳©׳×׳׳©׳™׳ ׳”׳₪׳¢׳™׳׳™׳
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('users')
      .filter((q) => q.eq(q.field('isActive'), true))
      .collect();
  },
});

// ׳¢׳“׳›׳•׳ ׳₪׳¨׳•׳₪׳™׳ ׳”׳׳©׳×׳׳© (׳׳׳©׳, ׳©׳™׳ ׳•׳™ ׳©׳)
export const updateProfile = mutation({
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

// ׳¢׳“׳›׳•׳ ׳×׳•׳›׳ ׳™׳× ׳׳ ׳•׳™ ׳¢׳‘׳•׳¨ ׳”׳׳©׳×׳׳© ׳”׳ ׳•׳›׳—׳™
export const updateSubscriptionPlan = mutation({
  args: {
    plan: SUBSCRIPTION_PLAN_UNION,
    productId: v.optional(v.string()),
    status: v.optional(SUBSCRIPTION_STATUS_UNION),
  },
  handler: async (ctx, { plan, productId, status }) => {
    const user = await requireCurrentUser(ctx);
    await patchSubscriptionPlan(ctx, user._id, plan, {
      productId: productId ?? undefined,
      status,
    });
    return user._id;
  },
});

// ׳׳—׳™׳§׳× ׳׳©׳×׳׳© (׳₪׳¢׳•׳׳” ׳׳׳ ׳”׳׳™׳ ׳׳• ׳׳׳©׳×׳׳© ׳¢׳¦׳׳• - ׳›׳׳ ׳׳™׳•׳©׳ ׳›׳׳—׳™׳§׳” ׳₪׳™׳–׳™׳×)
export const remove = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Not authenticated');
    }

    await ctx.db.delete(userId);
  },
});

// ׳׳—׳™׳§׳× ׳—׳©׳‘׳•׳ ׳”׳׳©׳×׳׳© ׳”׳ ׳•׳›׳—׳™ ׳•׳›׳ ׳”׳ ׳×׳•׳ ׳™׳ ׳”׳׳©׳•׳™׳›׳™׳ ׳׳׳™׳•
// ג ן¸ ׳׳–׳”׳¨׳”: ׳₪׳¢׳•׳׳” ׳–׳• ׳‘׳׳×׳™ ׳”׳₪׳™׳›׳” ׳•׳×׳׳—׳§ ׳׳× ׳›׳ ׳”׳ ׳×׳•׳ ׳™׳ ׳׳¦׳׳™׳×׳•׳×!
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

  // TODO: Add external cancellation/sync for RevenueCat/Stripe subscriptions.
  const deleted = emptyDeleteStats();
  const deletedBusinessIds = await deleteOwnedBusinesses(
    ctx,
    user._id,
    deleted
  );

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
    deletedBusinessIds,
    deleted,
  };
}

export const deleteMyAccountHard = mutation({
  args: {},
  handler: async (ctx) => {
    return await deleteMyAccountHardImpl(ctx);
  },
});

export async function wipeAllDataHardImpl(
  ctx: any
): Promise<WipeAllDataHardResult> {
  const requester = await requireCurrentUser(ctx);
  const counts = emptyWipeAllDataHardCounts();

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

export const wipeAllDataHard = mutation({
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
export const debugIdentity = query({
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
