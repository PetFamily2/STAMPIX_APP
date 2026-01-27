import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireActorIsStaffForBusiness, requireCurrentUser } from './guards';

export interface BusinessCreationInput {
  ownerUserId: Id<'users'>;
  externalId: string;
  name: string;
  logoUrl?: string;
  colors?: unknown;
  now?: number;
}

async function ensureBusinessStaffRecord(
  ctx: any,
  businessId: Id<'businesses'>,
  userId: Id<'users'>,
  staffRole: 'owner' | 'staff',
  now?: number
) {
  const timestamp = now ?? Date.now();
  const existingStaff = await ctx.db
    .query('businessStaff')
    .withIndex('by_businessId_userId', (q: any) =>
      q.eq('businessId', businessId).eq('userId', userId)
    )
    .first();

  if (existingStaff) {
    const patchData: Record<string, unknown> = {
      isActive: true,
      updatedAt: timestamp,
    };
    if (existingStaff.staffRole !== staffRole) {
      patchData.staffRole = staffRole;
    }
    await ctx.db.patch(existingStaff._id, patchData);
    return existingStaff._id;
  }

  const staffId = await ctx.db.insert('businessStaff', {
    businessId,
    userId,
    staffRole,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return staffId;
}

export async function ensureBusinessOwnerStaff(
  ctx: any,
  businessId: Id<'businesses'>,
  ownerUserId: Id<'users'>,
  now?: number
) {
  return ensureBusinessStaffRecord(ctx, businessId, ownerUserId, 'owner', now);
}

export async function createBusinessForOwner(
  ctx: any,
  input: BusinessCreationInput
) {
  const now = input.now ?? Date.now();
  const businessId = await ctx.db.insert('businesses', {
    ownerUserId: input.ownerUserId,
    externalId: input.externalId,
    name: input.name,
    logoUrl: input.logoUrl,
    colors: input.colors,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  await ensureBusinessOwnerStaff(ctx, businessId, input.ownerUserId, now);
  await ctx.db.patch(input.ownerUserId, {
    role: 'merchant',
    updatedAt: now,
  });
  return { businessId };
}

export const createBusiness = mutation({
  args: {
    name: v.string(),
    externalId: v.string(),
    logoUrl: v.optional(v.string()),
    colors: v.optional(v.any()),
  },
  handler: async (ctx, { name, externalId, logoUrl, colors }) => {
    const user = await requireCurrentUser(ctx);
    const normalizedName = name.trim();
    const normalizedExternalId = externalId.trim();
    if (!normalizedName) {
      throw new Error('NAME_REQUIRED');
    }
    if (!normalizedExternalId) {
      throw new Error('EXTERNAL_ID_REQUIRED');
    }

    const existing = await ctx.db
      .query('businesses')
      .withIndex('by_externalId', (q: any) =>
        q.eq('externalId', normalizedExternalId)
      )
      .first();

    if (existing) {
      throw new Error('EXTERNAL_ID_TAKEN');
    }

    const { businessId } = await createBusinessForOwner(ctx, {
      ownerUserId: user._id,
      externalId: normalizedExternalId,
      name: normalizedName,
      logoUrl,
      colors,
      now: Date.now(),
    });

    return { businessId };
  },
});

type BusinessStaffView = {
  staffId: Id<'businessStaff'>;
  userId: Id<'users'>;
  staffRole: 'owner' | 'staff';
  isActive: boolean;
  createdAt: number;
  updatedAt: number | null;
  displayName: string;
  email: string | null;
  role: 'staff' | 'merchant' | 'customer' | 'admin' | null;
};

export const listBusinessStaff = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return [];
    }

    await requireActorIsStaffForBusiness(ctx, businessId);

    const staffRecords = await ctx.db
      .query('businessStaff')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    const populated = await Promise.all(
      staffRecords.map(async (record) => {
        const user = await ctx.db.get(record.userId);
        if (!user || user.isActive !== true) {
          return null;
        }
        const displayName =
          user.fullName ?? user.email ?? user.externalId ?? 'עובד';
        return {
          staffId: record._id,
          userId: record.userId,
          staffRole: record.staffRole,
          isActive: record.isActive,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt ?? null,
          displayName,
          email: user.email ?? null,
          role: user.role ?? null,
        };
      })
    );

    return populated
      .filter((entry): entry is BusinessStaffView => entry !== null)
      .sort((a, b) => {
        if (a.staffRole === 'owner' && b.staffRole !== 'owner') return -1;
        if (b.staffRole === 'owner' && a.staffRole !== 'owner') return 1;
        return b.createdAt - a.createdAt;
      });
  },
});

export const inviteBusinessStaff = mutation({
  args: {
    businessId: v.id('businesses'),
    email: v.string(),
  },
  handler: async (ctx, { businessId, email }) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('EMAIL_REQUIRED');
    }

    const { actor, staffRole } = await requireActorIsStaffForBusiness(
      ctx,
      businessId
    );
    if (staffRole !== 'owner') {
      throw new Error('NOT_AUTHORIZED');
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q: any) => q.eq('email', normalizedEmail))
      .unique();

    if (!user || user.isActive !== true) {
      throw new Error('USER_NOT_FOUND');
    }

    if (String(user._id) === String(actor._id)) {
      throw new Error('CANNOT_INVITE_SELF');
    }

    const staffId = await ensureBusinessStaffRecord(
      ctx,
      businessId,
      user._id,
      'staff'
    );

    const desiredRole = user.role === 'merchant' ? 'merchant' : 'staff';
    if (user.role !== desiredRole) {
      await ctx.db.patch(user._id, {
        role: desiredRole,
        updatedAt: Date.now(),
      });
    }

    return { staffId, userId: user._id };
  },
});
