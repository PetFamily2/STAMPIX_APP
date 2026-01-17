import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireCurrentUser } from './guards';

type CustomerMembershipRecord = {
  membershipId: Id<'memberships'>;
  userId: Id<'users'>;
  businessId: Id<'businesses'>;
  programId: Id<'loyaltyPrograms'>;
  businessName: string;
  businessLogoUrl: string | null;
  programTitle: string;
  rewardName: string;
  stampIcon: string;
  currentStamps: number;
  maxStamps: number;
  lastStampAt: number;
  canRedeem: boolean;
};

export const byCustomer = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_userId', (q: any) => q.eq('userId', user._id))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    const resolved = await Promise.all(
      memberships.map(async (membership) => {
        const [business, program] = await Promise.all([
          ctx.db.get(membership.businessId),
          ctx.db.get(membership.programId),
        ]);

        if (!business || business.isActive !== true) {
          return null;
        }
        if (!program || program.isActive !== true || program.businessId !== business._id) {
          return null;
        }

        const lastStampAt =
          membership.lastStampAt ?? membership.updatedAt ?? membership.createdAt ?? Date.now();

        return {
          membershipId: membership._id,
          userId: membership.userId,
          businessId: business._id,
          programId: program._id,
          businessName: business.name,
          businessLogoUrl: business.logoUrl ?? null,
          programTitle: program.title,
          rewardName: program.rewardName,
          stampIcon: program.stampIcon,
          currentStamps: membership.currentStamps,
          maxStamps: program.maxStamps,
          lastStampAt,
          canRedeem: membership.currentStamps >= program.maxStamps,
        };
      })
    );

    const customers = resolved.filter(
      (item): item is CustomerMembershipRecord => item !== null
    );

    customers.sort((a, b) => b.lastStampAt - a.lastStampAt);

    return customers;
  },
});






// Join a business (create membership) by scanning the BUSINESS QR (customer flow).
// QR payload formats supported:
// - "businessExternalId:<value>"
// - "<value>" (raw externalId)
export const joinByBusinessQr = mutation({
  args: { qrData: v.string() },
  handler: async (ctx, { qrData }) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();

    const raw = (qrData ?? '').trim();
    if (!raw) throw new Error('INVALID_QR');

    const prefix = 'businessExternalId:';
    const businessExternalId = raw.startsWith(prefix) ? raw.slice(prefix.length).trim() : raw;

    if (!businessExternalId) throw new Error('INVALID_QR');

    const business = await ctx.db
      .query('businesses')
      .withIndex('by_externalId', (q: any) => q.eq('externalId', businessExternalId))
      .unique();

    if (!business || business.isActive !== true) throw new Error('BUSINESS_NOT_FOUND');

    const program = await ctx.db
      .query('loyaltyPrograms')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', business._id))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .first();

    if (!program) throw new Error('PROGRAM_NOT_FOUND');

    const existing = await ctx.db
      .query('memberships')
      .withIndex('by_userId_programId', (q: any) =>
        q.eq('userId', user._id).eq('programId', program._id),
      )
      .first();

    if (existing) {
      if (!existing.isActive) {
        await ctx.db.patch(existing._id, { isActive: true, updatedAt: now });
      }
      return {
        ok: true,
        membershipId: existing._id,
        businessId: business._id,
        programId: program._id,
        alreadyExisted: true,
      };
    }

    const membershipId = await ctx.db.insert('memberships', {
      userId: user._id,
      businessId: business._id,
      programId: program._id,
      currentStamps: 0,
      lastStampAt: undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return {
      ok: true,
      membershipId,
      businessId: business._id,
      programId: program._id,
      alreadyExisted: false,
    };
  },
});
