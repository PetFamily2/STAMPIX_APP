import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireCurrentUser } from './guards';
import { SubscriptionPlan } from '../lib/domain/subscriptions';

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const subject = identity.subject;
    if (!subject) return null;

    const user = await ctx.db
      .query('users')
      .withIndex('by_externalId', (q) => q.eq('externalId', subject))
      .unique();

    return user ?? null;
  },
});

// שליפת משתמש לפי מזהה (ID)
export const getById = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    return await ctx.db.get(userId);
  },
});

// שליפת רשימת כל המשתמשים הפעילים
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('users')
      .filter((q) => q.eq(q.field('isActive'), true))
      .collect();
  },
});

// עדכון פרופיל המשתמש (למשל, שינוי שם)
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

// עדכון תוכנית מנוי עבור המשתמש הנוכחי
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

// מחיקת משתמש (פעולה למנהלים או למשתמש עצמו - כאן מיושם כמחיקה פיזית)
export const setMyRole = mutation({
  args: {
    role: v.union(
      v.literal('customer'),
      v.literal('merchant'),
      v.literal('staff'),
      v.literal('admin')
    ),
  },
  handler: async (ctx, { role }) => {
    const user = await requireCurrentUser(ctx);
    await ctx.db.patch(user._id, {
      role,
      updatedAt: Date.now(),
    });
    return user._id;
  },
});

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

// מחיקת חשבון המשתמש הנוכחי וכל הנתונים המשויכים אליו
// ⚠️ אזהרה: פעולה זו בלתי הפיכה ותמחק את כל הנתונים לצמיתות!
export const deleteMyAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('לא מחובר למערכת');
    }

    const externalId = identity.subject ?? '';
    if (!externalId) {
      throw new Error('זהות המשתמש חסרה');
    }

    const user = await findUserByExternalId(ctx, externalId);

    if (!user) {
      return {
        success: true,
        message: `לא נמצאה רשומת משתמש עבור ${externalId}`,
        deletedCount: 0,
      };
    }

    await ctx.db.delete(user._id);

    return {
      success: true,
      message: `נמחקה רשומת משתמש עבור ${externalId}`,
      deletedCount: 1,
    };
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
