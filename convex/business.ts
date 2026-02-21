import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import {
  requireActorIsBusinessOwner,
  requireActorIsStaffForBusiness,
  requireCurrentUser,
} from './guards';
import {
  generateInviteCode,
  generateJoinCode,
  generatePublicId,
} from './lib/ids';

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
  staffRole: 'owner' | 'manager' | 'staff',
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

/**
 * Generate a unique businessPublicId with retry on collision.
 */
async function generateUniquePublicId(
  ctx: any,
  maxRetries = 5
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const candidate = generatePublicId(12);
    const existing = await ctx.db
      .query('businesses')
      .withIndex('by_businessPublicId', (q: any) =>
        q.eq('businessPublicId', candidate)
      )
      .first();
    if (!existing) return candidate;
  }
  throw new Error('FAILED_TO_GENERATE_PUBLIC_ID');
}

/**
 * Generate a unique joinCode with retry on collision.
 */
async function generateUniqueJoinCode(
  ctx: any,
  maxRetries = 5
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const candidate = generateJoinCode(8);
    const existing = await ctx.db
      .query('businesses')
      .withIndex('by_joinCode', (q: any) => q.eq('joinCode', candidate))
      .first();
    if (!existing) return candidate;
  }
  throw new Error('FAILED_TO_GENERATE_JOIN_CODE');
}

export async function createBusinessForOwner(
  ctx: any,
  input: BusinessCreationInput
) {
  const now = input.now ?? Date.now();

  const businessPublicId = await generateUniquePublicId(ctx);
  const joinCode = await generateUniqueJoinCode(ctx);

  const businessId = await ctx.db.insert('businesses', {
    ownerUserId: input.ownerUserId,
    externalId: input.externalId,
    businessPublicId,
    joinCode,
    name: input.name,
    logoUrl: input.logoUrl,
    colors: input.colors,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  await ensureBusinessOwnerStaff(ctx, businessId, input.ownerUserId, now);
  return { businessId, businessPublicId, joinCode };
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
  staffRole: 'owner' | 'manager' | 'staff';
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

    const populated: Array<BusinessStaffView | null> = await Promise.all(
      staffRecords.map(async (record): Promise<BusinessStaffView | null> => {
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
          role:
            record.staffRole === 'owner' || record.staffRole === 'manager'
              ? 'merchant'
              : 'staff',
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

/**
 * Generate a unique invite code with retry on collision.
 */
async function generateUniqueInviteCode(
  ctx: any,
  maxRetries = 5
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const candidate = generateInviteCode(8);
    const existing = await ctx.db
      .query('staffInvites')
      .withIndex('by_inviteCode', (q: any) => q.eq('inviteCode', candidate))
      .first();
    if (!existing) return candidate;
  }
  throw new Error('FAILED_TO_GENERATE_INVITE_CODE');
}

export const inviteBusinessStaff = mutation({
  args: {
    businessId: v.id('businesses'),
    email: v.string(),
  },
  handler: async (ctx, { businessId, email }) => {
    const actor = await requireActorIsBusinessOwner(ctx, businessId);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('EMAIL_REQUIRED');
    }

    const existing = await ctx.db
      .query('staffInvites')
      .withIndex('by_invitedEmail', (q: any) =>
        q.eq('invitedEmail', normalizedEmail)
      )
      .filter((q: any) =>
        q.and(
          q.eq(q.field('businessId'), businessId),
          q.eq(q.field('status'), 'pending')
        )
      )
      .first();

    if (existing && existing.expiresAt >= Date.now()) {
      return { inviteCode: existing.inviteCode, alreadyPending: true };
    }

    const targetUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q: any) => q.eq('email', normalizedEmail))
      .first();

    if (targetUser && String(targetUser._id) === String(actor._id)) {
      throw new Error('CANNOT_INVITE_SELF');
    }

    if (targetUser && targetUser.isActive) {
      const alreadyStaff = await ctx.db
        .query('businessStaff')
        .withIndex('by_businessId_userId', (q: any) =>
          q.eq('businessId', businessId).eq('userId', targetUser._id)
        )
        .first();
      if (alreadyStaff?.isActive) {
        throw new Error('ALREADY_STAFF');
      }
    }

    const inviteCode = await generateUniqueInviteCode(ctx);
    const now = Date.now();

    await ctx.db.insert('staffInvites', {
      businessId,
      invitedEmail: normalizedEmail,
      invitedUserId: targetUser?._id,
      invitedByUserId: actor._id,
      inviteCode,
      status: 'pending',
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      createdAt: now,
    });

    return { inviteCode, alreadyPending: false };
  },
});

export const acceptStaffInvite = mutation({
  args: {
    inviteCode: v.string(),
  },
  handler: async (ctx, { inviteCode }) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();

    const invite = await ctx.db
      .query('staffInvites')
      .withIndex('by_inviteCode', (q: any) =>
        q.eq('inviteCode', inviteCode.trim())
      )
      .first();

    if (!invite) throw new Error('INVITE_NOT_FOUND');
    if (invite.status !== 'pending') throw new Error('INVITE_NOT_PENDING');
    if (invite.expiresAt < now) {
      await ctx.db.patch(invite._id, { status: 'expired' });
      throw new Error('INVITE_EXPIRED');
    }

    if (
      invite.invitedEmail &&
      user.email?.toLowerCase() !== invite.invitedEmail.toLowerCase()
    ) {
      throw new Error('EMAIL_MISMATCH');
    }

    const staffId = await ensureBusinessStaffRecord(
      ctx,
      invite.businessId,
      user._id,
      'staff',
      now
    );

    await ctx.db.patch(invite._id, {
      status: 'accepted',
      invitedUserId: user._id,
      acceptedAt: now,
    });

    const currentUser = await ctx.db.get(user._id);
    if (
      currentUser &&
      (!currentUser.preferredMode || currentUser.preferredMode === 'customer')
    ) {
      await ctx.db.patch(user._id, {
        preferredMode: 'staff',
        updatedAt: now,
      });
    }

    return { staffId, businessId: invite.businessId };
  },
});
