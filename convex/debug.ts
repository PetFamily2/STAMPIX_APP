import { v } from 'convex/values';
import { mutation } from './_generated/server';

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
