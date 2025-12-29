import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

/**
 * Step 1: Resolve scan payload
 */
export const resolveScan = query({
  args: {
    qrData: v.string(),
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
  },
  handler: async (ctx, args) => {
    throw new Error('NOT_IMPLEMENTED');
  },
});

/**
 * Step 2: Add stamp
 */
export const addStamp = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    customerUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    throw new Error('NOT_IMPLEMENTED');
  },
});

/**
 * Step 3: Redeem reward
 */
export const redeemReward = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    customerUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    throw new Error('NOT_IMPLEMENTED');
  },
});
