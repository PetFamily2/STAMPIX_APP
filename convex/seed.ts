import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation } from './_generated/server';
import { createBusinessForOwner } from './business';

/**
 * Seed (MVP):
 * - Creates one business + one program
 * - Ensures an owner user exists (auth user if exists, otherwise a seed owner)
 * - Ensures demo customer exists by externalId
 *
 * IMPORTANT:
 * This is intended for dev/testing via `convex run` which has no auth identity.
 */
type SeedOwnerArgs = {
  seedOwnerExternalId?: string;
  seedOwnerName?: string;
};

export const seedMvp = mutation({
  args: {
    businessName: v.optional(v.string()),
    programTitle: v.optional(v.string()),
    rewardName: v.optional(v.string()),
    maxStamps: v.optional(v.number()),
    stampIcon: v.optional(v.string()),
    demoCustomerExternalId: v.optional(v.string()),
    demoCustomerName: v.optional(v.string()),

    // Optional: if you want a predictable seed owner
    seedOwnerExternalId: v.optional(v.string()),
    seedOwnerName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const identity = await ctx.auth.getUserIdentity();
    const ownerUserId: Id<'users'> = identity?.subject
      ? await findOrCreateUserByExternalId(ctx, identity.subject, identity, now)
      : await findOrCreateSeedOwner(ctx, args, now);

    // 2) Create business
    const businessName = args.businessName ?? 'Demo Coffee';
    const { businessId } = await createBusinessForOwner(ctx, {
      ownerUserId,
      externalId: `biz:${now}`,
      name: businessName,
      logoUrl: undefined,
      colors: undefined,
      now,
    });

    // 3) Ensure staff(owner) record
    // Handled by createBusinessForOwner guard.

    // 4) Create program
    const programId = await ctx.db.insert('loyaltyPrograms', {
      businessId,
      title: args.programTitle ?? 'Coffee Club',
      rewardName: args.rewardName ?? 'Free Coffee',
      maxStamps: args.maxStamps ?? 10,
      stampIcon: args.stampIcon ?? 'coffee',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // 5) Ensure demo customer by externalId
    const demoExternalId = args.demoCustomerExternalId ?? 'demo-customer-1';
    const existingCustomer = await ctx.db
      .query('users')
      .withIndex('by_externalId', (q) => q.eq('externalId', demoExternalId))
      .unique();

    const demoCustomerUserId =
      existingCustomer?._id ??
      (await ctx.db.insert('users', {
        externalId: demoExternalId,
        email: undefined,
        phone: undefined,
        fullName: args.demoCustomerName ?? 'Demo Customer',
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
      }));

    return {
      businessId,
      programId,
      demoCustomerExternalId: demoExternalId,
      demoCustomerUserId,
      howToUse: {
        businessIdPaste: String(businessId),
        programIdPaste: String(programId),
        qrData: `externalId:${demoExternalId}`,
      },
    };
  },
});

async function findOrCreateUserByExternalId(
  ctx: any,
  externalId: string,
  identity: any,
  now: number
): Promise<Id<'users'>> {
  const existing = await ctx.db
    .query('users')
    .withIndex('by_externalId', (q: any) => q.eq('externalId', externalId))
    .unique();

  if (existing) {
    return existing._id;
  }

  const email = identity?.email ? String(identity.email).toLowerCase() : undefined;
  const fullName = identity?.name || identity?.nickname || 'User';

  return await ctx.db.insert('users', {
    externalId,
    email,
    phone: undefined,
    fullName,
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
}

async function findOrCreateSeedOwner(
  ctx: any,
  args: SeedOwnerArgs,
  now: number
): Promise<Id<'users'>> {
  const seedExternalId = args.seedOwnerExternalId ?? 'seed-owner';
  const existing = await ctx.db
    .query('users')
    .withIndex('by_externalId', (q: any) => q.eq('externalId', seedExternalId))
    .unique();

  if (existing) {
    return existing._id;
  }

  return await ctx.db.insert('users', {
    externalId: seedExternalId,
    email: undefined,
    phone: undefined,
    fullName: args.seedOwnerName ?? 'Seed Owner',
    avatarUrl: undefined,
    userType: 'free',
    role: 'merchant',
    isActive: true,
    subscriptionPlan: 'free',
    subscriptionStatus: 'inactive',
    subscriptionProductId: undefined,
    subscriptionUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}
