import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
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


