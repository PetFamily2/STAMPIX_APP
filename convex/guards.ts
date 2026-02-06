import type { Doc, Id } from './_generated/dataModel';

export async function getCurrentUserOrNull(
  ctx: any
): Promise<Doc<'users'> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  const externalId = identity.subject ?? '';
  if (!externalId) {
    return null;
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_externalId', (q: any) => q.eq('externalId', externalId))
    .unique();

  return user ?? null;
}

export async function requireCurrentUser(ctx: any): Promise<Doc<'users'>> {
  const user = await getCurrentUserOrNull(ctx);
  if (!user) {
    throw new Error('NOT_AUTHENTICATED');
  }

  return user;
}

export async function requireBusinessAndProgram(
  ctx: any,
  businessId: Id<'businesses'>,
  programId: Id<'loyaltyPrograms'>
) {
  const business = await ctx.db.get(businessId);
  if (!business || business.isActive !== true) {
    throw new Error('BUSINESS_INACTIVE');
  }

  const program = await ctx.db.get(programId);
  if (
    !program ||
    program.isActive !== true ||
    program.businessId !== businessId
  ) {
    throw new Error('PROGRAM_NOT_FOUND');
  }

  return { business, program };
}

export async function requireActorIsStaffForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const actor = await requireCurrentUser(ctx);

  const staff = await ctx.db
    .query('businessStaff')
    .withIndex('by_businessId_userId', (q: any) =>
      q.eq('businessId', businessId).eq('userId', actor._id)
    )
    .first();

  if (!staff || staff.isActive !== true) {
    throw new Error('NOT_AUTHORIZED');
  }

  return { actor, staffRole: staff.staffRole };
}

export async function requireActorIsBusinessOwner(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const { actor, staffRole } = await requireActorIsStaffForBusiness(
    ctx,
    businessId
  );
  if (staffRole !== 'owner') {
    throw new Error('NOT_AUTHORIZED');
  }
  return actor;
}
