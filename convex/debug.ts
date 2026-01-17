import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { requireCurrentUser } from './guards';

export const linkMeAsOwner = mutation({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, { businessId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const email = identity?.email;
    if (!email) throw new Error('NOT_AUTHENTICATED');

    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .first();

    if (!user) throw new Error('USER_NOT_FOUND');

    const now = Date.now();

    const existing = await ctx.db
      .query('businessStaff')
      .withIndex('by_businessId_userId', (q) =>
        q.eq('businessId', businessId).eq('userId', user._id),
      )
      .first();

    if (existing) {
      if (!existing.isActive || existing.staffRole !== 'owner') {
        await ctx.db.patch(existing._id, {
          staffRole: 'owner',
          isActive: true,
          updatedAt: now,
        });
      }
      return { ok: true, businessId, staffId: existing._id, alreadyExisted: true };
    }

    const staffId = await ctx.db.insert('businessStaff', {
      businessId,
      userId: user._id,
      staffRole: 'owner',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true, businessId, staffId, alreadyExisted: false };
  },
});

export const linkEmailAsOwner = mutation({
  args: { businessId: v.id('businesses'), email: v.string() },
  handler: async (ctx, { businessId, email }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .first();

    if (!user) throw new Error('USER_NOT_FOUND');

    const now = Date.now();

    const existing = await ctx.db
      .query('businessStaff')
      .withIndex('by_businessId_userId', (q) =>
        q.eq('businessId', businessId).eq('userId', user._id),
      )
      .first();

    if (existing) {
      if (!existing.isActive || existing.staffRole !== 'owner') {
        await ctx.db.patch(existing._id, {
          staffRole: 'owner',
          isActive: true,
          updatedAt: now,
        });
      }
      return { ok: true, businessId, staffId: existing._id, alreadyExisted: true };
    }

    const staffId = await ctx.db.insert('businessStaff', {
      businessId,
      userId: user._id,
      staffRole: 'owner',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true, businessId, staffId, alreadyExisted: false };
  },
});

export const setUserEmailByExternalId = mutation({
  args: { externalId: v.string(), email: v.string() },
  handler: async (ctx, { externalId, email }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_externalId', (q) => q.eq('externalId', externalId))
      .first();

    if (!user) throw new Error('USER_NOT_FOUND');

    const now = Date.now();
    await ctx.db.patch(user._id, { email, updatedAt: now });

    return { ok: true, userId: user._id, externalId, email };
  },
});

export const listStaffForBusiness = mutation({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, { businessId }) => {
    const staff = await ctx.db
      .query('businessStaff')
      .withIndex('by_businessId', (q) => q.eq('businessId', businessId))
      .collect();

    return staff.map((s) => ({
      staffId: s._id,
      businessId: s.businessId,
      userId: s.userId,
      staffRole: s.staffRole,
      isActive: s.isActive,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },
});

export const whoAmI = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const email = identity?.email ?? null;

    const user = email
      ? await ctx.db
          .query('users')
          .withIndex('by_email', (q) => q.eq('email', email))
          .first()
      : null;

    return {
      identity,
      email,
      user,
    };
  },
});

export const findUsersByEmailLower = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const target = email.toLowerCase();

    const all = await ctx.db.query('users').collect();
    const matches = all.filter((u) => (u.email ?? '').toLowerCase() === target);

    return matches.map((u) => ({
      _id: u._id,
      email: u.email ?? null,
      externalId: u.externalId ?? null,
      fullName: u.fullName ?? null,
      isActive: u.isActive,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));
  },
});

export const setBusinessOwnerByEmail = mutation({
  args: { businessId: v.id('businesses'), email: v.string() },
  handler: async (ctx, { businessId, email }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .first();

    if (!user) throw new Error('USER_NOT_FOUND');

    const business = await ctx.db.get(businessId);
    if (!business) throw new Error('BUSINESS_NOT_FOUND');

    await ctx.db.patch(businessId, { ownerUserId: user._id, updatedAt: Date.now() });

    return { ok: true, businessId, ownerUserId: user._id, email };
  },
});

// Creates a demo membership for the CURRENT authenticated user (so Wallet isn't empty)
export const createDemoMembershipForMe = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();

    // Prefer existing active program (so we don't create duplicates)
    const existingProgram = await ctx.db
      .query('loyaltyPrograms')
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .first();

    let businessId = existingProgram?.businessId;
    let programId = existingProgram?._id;

    if (!businessId || !programId) {
      businessId = await ctx.db.insert('businesses', {
        ownerUserId: user._id,
        externalId: `demo-biz:${now}`,
        name: 'Demo Coffee',
        logoUrl: undefined,
        colors: undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert('businessStaff', {
        businessId,
        userId: user._id,
        staffRole: 'owner',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      programId = await ctx.db.insert('loyaltyPrograms', {
        businessId,
        title: 'Coffee Club',
        rewardName: 'Free Coffee',
        maxStamps: 10,
        stampIcon: 'coffee',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existingMembership = await ctx.db
      .query('memberships')
      .withIndex('by_userId_programId', (q: any) =>
        q.eq('userId', user._id).eq('programId', programId),
      )
      .first();

    const business = businessId ? await ctx.db.get(businessId) : null;
    const businessExternalId = business?.externalId ?? null;
    const businessQrData = businessExternalId ? `businessExternalId:${businessExternalId}` : null;

    if (existingMembership) {
      await ctx.db.patch(existingMembership._id, {
        isActive: true,
        updatedAt: now,
      });
      return { ok: true, membershipId: existingMembership._id, businessId, programId, alreadyExisted: true, businessExternalId, businessQrData };
    }

    const membershipId = await ctx.db.insert('memberships', {
      userId: user._id,
      businessId,
      programId,
      currentStamps: 3,
      lastStampAt: now,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true, membershipId, businessId, programId, alreadyExisted: false, businessExternalId, businessQrData };
  },
});


/**
 * Creates demo business + program + membership for a given externalId.
 * Intended for `npx convex run` (no auth identity).
 */
export const createDemoMembershipForExternalId = mutation({
  args: {
    externalId: v.string(),
    fullName: v.optional(v.string()),
  },
  handler: async (ctx, { externalId, fullName }) => {
    const now = Date.now();

    const targetExternalId = String(externalId).trim();
    if (!targetExternalId) throw new Error('INVALID_EXTERNAL_ID');

    let user = await ctx.db
      .query('users')
      .withIndex('by_externalId', (q: any) => q.eq('externalId', targetExternalId))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert('users', {
        externalId: targetExternalId,
        email: undefined,
        phone: undefined,
        fullName: fullName ?? 'Demo Customer',
        avatarUrl: undefined,
        userType: 'free',
        role: 'customer',
        isActive: true,
        subscriptionPlan: 'free',
        subscriptionStatus: 'inactive',
        subscriptionProductId: undefined,
        subscriptionUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      user = await ctx.db.get(userId);
    }

    if (!user) throw new Error('USER_CREATE_FAILED');

    // Prefer existing active program (avoid duplicates)
    const existingProgram = await ctx.db
      .query('loyaltyPrograms')
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .first();

    let businessId = existingProgram?.businessId;
    let programId = existingProgram?._id;

    if (!businessId || !programId) {
      businessId = await ctx.db.insert('businesses', {
        ownerUserId: user._id,
        externalId: `demo-biz:${now}`,
        name: 'Demo Coffee',
        logoUrl: undefined,
        colors: undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert('businessStaff', {
        businessId,
        userId: user._id,
        staffRole: 'owner',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      programId = await ctx.db.insert('loyaltyPrograms', {
        businessId,
        title: 'Coffee Club',
        rewardName: 'Free Coffee',
        maxStamps: 10,
        stampIcon: 'coffee',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const business = businessId ? await ctx.db.get(businessId) : null;
    const businessExternalId = business?.externalId ?? null;
    const businessQrData = businessExternalId ? `businessExternalId:${businessExternalId}` : null;

    const existingMembership = await ctx.db
      .query('memberships')
      .withIndex('by_userId_programId', (q: any) =>
        q.eq('userId', user._id).eq('programId', programId),
      )
      .first();

    if (existingMembership) {
      await ctx.db.patch(existingMembership._id, { isActive: true, updatedAt: now });
      return {
        ok: true,
        alreadyExisted: true,
        userId: user._id,
        userExternalId: targetExternalId,
        membershipId: existingMembership._id,
        businessId,
        programId,
        businessExternalId,
        businessQrData,
      };
    }

    const membershipId = await ctx.db.insert('memberships', {
      userId: user._id,
      businessId,
      programId,
      currentStamps: 0,
      lastStampAt: undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return {
      ok: true,
      alreadyExisted: false,
      userId: user._id,
      userExternalId: targetExternalId,
      membershipId,
      businessId,
      programId,
      businessExternalId,
      businessQrData,
    };
  },
});
