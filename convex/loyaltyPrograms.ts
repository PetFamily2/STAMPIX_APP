import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireActorIsBusinessOwner } from './guards';

export const listByBusiness = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return [];
    }

    const programs = await ctx.db
      .query('loyaltyPrograms')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    return programs.map((program) => ({
      loyaltyProgramId: program._id,
      businessId: program.businessId,
      title: program.title,
      rewardName: program.rewardName,
      maxStamps: program.maxStamps,
      stampIcon: program.stampIcon,
      isActive: program.isActive,
    }));
  },
});

export const createLoyaltyProgram = mutation({
  args: {
    businessId: v.id('businesses'),
    title: v.string(),
    rewardName: v.string(),
    maxStamps: v.number(),
    stampIcon: v.string(),
  },
  handler: async (ctx, { businessId, title, rewardName, maxStamps, stampIcon }) => {
    await requireActorIsBusinessOwner(ctx, businessId);

    const normalizedTitle = title.trim();
    const normalizedReward = rewardName.trim();
    const normalizedIcon = stampIcon.trim();

    if (!normalizedTitle) {
      throw new Error('TITLE_REQUIRED');
    }
    if (!normalizedReward) {
      throw new Error('REWARD_REQUIRED');
    }
    if (!normalizedIcon) {
      throw new Error('STAMP_ICON_REQUIRED');
    }
    if (maxStamps <= 0) {
      throw new Error('MAX_STAMPS_INVALID');
    }

    const now = Date.now();
    const loyaltyProgramId = await ctx.db.insert('loyaltyPrograms', {
      businessId,
      title: normalizedTitle,
      rewardName: normalizedReward,
      maxStamps,
      stampIcon: normalizedIcon,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return { loyaltyProgramId };
  },
});

