import { v } from 'convex/values';
import { query } from './_generated/server';

/**
 * Step 1: Resolve scan payload (MVP)
 *
 * Supported qrData formats for now:
 * - "userId:<usersId>"
 * - "externalId:<string>"
 *
 * Later we will support real QR payloads and enterprise mappings.
 */
export const resolveScan = query({
  args: {
    qrData: v.string(),
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('NOT_AUTHENTICATED');
    }

    // 1) Validate business + program are active and connected
    const business = await ctx.db.get(args.businessId);
    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_INACTIVE');
    }

    const program = await ctx.db.get(args.programId);
    if (!program || program.isActive !== true) {
      throw new Error('PROGRAM_NOT_FOUND');
    }
    if (program.businessId !== args.businessId) {
      throw new Error('PROGRAM_NOT_FOUND');
    }

    // 2) Parse qrData
    let customerUserId: string | null = null;

    if (args.qrData.startsWith('userId:')) {
      customerUserId = args.qrData.slice('userId:'.length).trim();
    } else if (args.qrData.startsWith('externalId:')) {
      const externalId = args.qrData.slice('externalId:'.length).trim();
      const customer = await ctx.db
        .query('users')
        .withIndex('by_externalId', (q) => q.eq('externalId', externalId))
        .unique();
      if (!customer) {
        throw new Error('CUSTOMER_NOT_FOUND');
      }
      customerUserId = customer._id;
    } else {
      throw new Error('INVALID_QR');
    }

    // 3) Load customer
    const customer = await ctx.db.get(customerUserId as any);
    if (!customer || customer.isActive !== true) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }

    // 4) Find membership for this business + program
    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_userId_programId', (q) =>
        q.eq('userId', customer._id).eq('programId', program._id)
      )
      .first();

    const currentStamps = membership?.currentStamps ?? 0;
    const canRedeemNow = currentStamps >= program.maxStamps;

    return {
      customerUserId: customer._id,
      customerDisplayName:
        customer.fullName ?? customer.email ?? customer.externalId ?? 'לקוח',
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
 * Step 2/3 are scaffolded, will implement next.
 */
