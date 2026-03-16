import { getAuthUserId } from '@convex-dev/auth/server';
import type { Doc, Id } from './_generated/dataModel';

function resolveProgramLifecycle(program: any) {
  if (
    program?.status === 'draft' ||
    program?.status === 'active' ||
    program?.status === 'archived'
  ) {
    return program.status;
  }
  if (program?.isArchived === true) {
    return 'archived';
  }
  return 'active';
}

export async function getCurrentUserOrNull(
  ctx: any
): Promise<Doc<'users'> | null> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) {
    return null;
  }
  const user = await ctx.db.get(authUserId);

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
  const programLifecycle = resolveProgramLifecycle(program);
  if (
    !program ||
    program.isActive !== true ||
    programLifecycle === 'draft' ||
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

export async function requireActorIsBusinessOwnerOrManager(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const { actor, staffRole } = await requireActorIsStaffForBusiness(
    ctx,
    businessId
  );
  if (staffRole !== 'owner' && staffRole !== 'manager') {
    throw new Error('NOT_AUTHORIZED');
  }
  return { actor, staffRole };
}
