import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import {
  getCurrentUserOrNull,
  requireActorIsStaffForBusiness,
  requireBusinessAndProgram,
  requireCurrentUser,
} from './guards';
import {
  assertScanTokenSignature,
  buildScanToken,
  isScanTokenExpired,
  parseScanToken,
  type ScanTokenPayload,
} from './scanTokens';

type BusinessForStaff = {
  businessId: Id<'businesses'>;
  name: string;
  externalId: string;
  logoUrl: string | null;
  colors: unknown | null;
  staffRole: 'owner' | 'staff';
};

export const myBusinesses = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getCurrentUserOrNull(ctx);
    if (!actor) {
      return [];
    }

    const staffEntries = await ctx.db
      .query('businessStaff')
      .withIndex('by_userId', (q: any) => q.eq('userId', actor._id))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    const businesses = await Promise.all<BusinessForStaff | null>(
      staffEntries.map(async (staff) => {
        const business = await ctx.db.get(staff.businessId);
        if (!business || business.isActive !== true) {
          return null;
        }
        return {
          businessId: business._id,
          name: business.name,
          externalId: business.externalId,
          logoUrl: business.logoUrl ?? null,
          colors: business.colors ?? null,
          staffRole: staff.staffRole,
        };
      })
    );

    return businesses.filter(
      (business): business is BusinessForStaff => business !== null
    );
  },
});

export const createScanToken = mutation({
  args: {
    membershipId: v.id('memberships'),
  },
  handler: async (ctx, { membershipId }) => {
    const user = await requireCurrentUser(ctx);
    const membership = await ctx.db.get(membershipId);
    if (
      !membership ||
      membership.userId !== user._id ||
      membership.isActive !== true
    ) {
      throw new Error('MEMBERSHIP_NOT_FOUND');
    }

    await requireBusinessAndProgram(
      ctx,
      membership.businessId,
      membership.programId
    );

    const { scanToken, payload } = await buildScanToken(user._id);
    return {
      scanToken,
      customerId: payload.customerId,
      timestamp: payload.timestamp,
      signature: payload.signature,
    };
  },
});

/**
 * Step 1: Resolve scan payload (MVP)
 *
 * The QR payload is a signed scan token (prefixed with "scanToken:") that
 * includes the customerId, timestamp, and signature. The server validates the
 * signature, expiry, and prevents replays before resolving the customer.
 */
export const resolveScan = mutation({
  args: {
    qrData: v.string(),
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireActorIsStaffForBusiness(
      ctx,
      args.businessId
    );
    const actorUserId = actor._id;

    // 1) Validate business + program are active and connected
    const { program } = await requireBusinessAndProgram(
      ctx,
      args.businessId,
      args.programId
    );

    const normalizedQrData = args.qrData.trim();
    let tokenPayload: ScanTokenPayload;
    try {
      tokenPayload = parseScanToken(normalizedQrData);
    } catch (error) {
      throw new Error('INVALID_QR');
    }

    try {
      await assertScanTokenSignature(tokenPayload);
    } catch (error) {
      throw new Error('INVALID_QR');
    }

    if (isScanTokenExpired(tokenPayload.timestamp)) {
      throw new Error('INVALID_QR');
    }

    const existingUsage = await ctx.db
      .query('scanTokenEvents')
      .withIndex('by_signature', (q: any) =>
        q.eq('signature', tokenPayload.signature)
      )
      .first();

    if (existingUsage) {
      throw new Error('INVALID_QR');
    }

    const customerUserId = tokenPayload.customerId as Id<'users'>;

    // 3) Load customer
    const customer = await ctx.db.get(customerUserId);
    if (!customer || customer.isActive !== true) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }

    // 4) Find membership for this business + program
    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_userId_programId', (q: any) =>
        q.eq('userId', customer._id).eq('programId', program._id)
      )
      .first();

    const currentStamps = membership?.currentStamps ?? 0;
    const canRedeemNow = currentStamps >= program.maxStamps;

    const now = Date.now();
    await ctx.db.insert('scanTokenEvents', {
      businessId: args.businessId,
      programId: args.programId,
      customerId: customerUserId,
      signature: tokenPayload.signature,
      tokenTimestamp: tokenPayload.timestamp,
      createdAt: now,
    });

    return {
      customerUserId: customer._id,
      customerDisplayName:
        customer.fullName ??
        customer.email ??
        customer.externalId ??
        'Customer',
      membership: membership
        ? {
            membershipId: membership._id,
            currentStamps,
            maxStamps: program.maxStamps,
            canRedeemNow,
          }
        : null,
    };
  },
});

/**
 * Step 2: Add stamp (MVP)
 */
export const addStamp = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    customerUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireActorIsStaffForBusiness(
      ctx,
      args.businessId
    );
    const actorUserId = actor._id;
    const { program } = await requireBusinessAndProgram(
      ctx,
      args.businessId,
      args.programId
    );

    const customer = await ctx.db.get(args.customerUserId);
    if (!customer || customer.isActive !== true) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }
    const customerUserId = customer._id;

    const now = Date.now();

    // membership lookup
    const existing = await ctx.db
      .query('memberships')
      .withIndex('by_userId_programId', (q: any) =>
        q.eq('userId', customerUserId).eq('programId', args.programId)
      )
      .first();

    // Decide MVP rule: cap at maxStamps (prevents overflow)
    if (!existing) {
      const membershipId = await ctx.db.insert('memberships', {
        userId: customerUserId,
        businessId: args.businessId,
        programId: args.programId,
        currentStamps: 1,
        lastStampAt: now,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert('events', {
        type: 'STAMP_ADDED',
        businessId: args.businessId,
        programId: args.programId,
        membershipId,
        actorUserId,
        customerUserId,
        metadata: { source: 'scanner' },
        createdAt: now,
      });

      const canRedeemNow = 1 >= program.maxStamps;

      return {
        membershipId,
        currentStamps: 1,
        maxStamps: program.maxStamps,
        canRedeemNow,
      };
    }

    const nextStamps = Math.min(existing.currentStamps + 1, program.maxStamps);

    await ctx.db.patch(existing._id, {
      currentStamps: nextStamps,
      lastStampAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('events', {
      type: 'STAMP_ADDED',
      businessId: args.businessId,
      programId: args.programId,
      membershipId: existing._id,
      actorUserId,
      customerUserId: args.customerUserId,
      metadata: {
        source: 'scanner',
        previous: existing.currentStamps,
        next: nextStamps,
      },
      createdAt: now,
    });

    const canRedeemNow = nextStamps >= program.maxStamps;

    return {
      membershipId: existing._id,
      currentStamps: nextStamps,
      maxStamps: program.maxStamps,
      canRedeemNow,
    };
  },
});

/**
 * Step 3: Redeem reward (MVP)
 */
export const redeemReward = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    customerUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireActorIsStaffForBusiness(
      ctx,
      args.businessId
    );
    const actorUserId = actor._id;
    const { program } = await requireBusinessAndProgram(
      ctx,
      args.businessId,
      args.programId
    );

    const customer = await ctx.db.get(args.customerUserId);
    if (!customer || customer.isActive !== true) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }
    const customerUserId = customer._id;

    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_userId_programId', (q: any) =>
        q.eq('userId', customerUserId).eq('programId', args.programId)
      )
      .first();

    if (!membership || membership.isActive !== true) {
      throw new Error('MEMBERSHIP_NOT_FOUND');
    }

    if (membership.currentStamps < program.maxStamps) {
      throw new Error('NOT_ENOUGH_STAMPS');
    }

    const now = Date.now();

    // MVP rule: reset to 0 on redeem
    await ctx.db.patch(membership._id, {
      currentStamps: 0,
      updatedAt: now,
    });

    await ctx.db.insert('events', {
      type: 'REWARD_REDEEMED',
      businessId: args.businessId,
      programId: args.programId,
      membershipId: membership._id,
      actorUserId,
      customerUserId,
      metadata: { source: 'scanner', redeemedFrom: membership.currentStamps },
      createdAt: now,
    });

    return {
      membershipId: membership._id,
      currentStamps: 0,
      maxStamps: program.maxStamps,
      canRedeemNow: false,
      redeemedAt: now,
    };
  },
});
