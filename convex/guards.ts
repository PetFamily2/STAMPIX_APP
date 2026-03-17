import { getAuthUserId } from '@convex-dev/auth/server';
import type { Doc, Id } from './_generated/dataModel';

type StaffRole = 'owner' | 'manager' | 'staff';
type StaffStatus = 'active' | 'suspended' | 'removed';

function normalizeStaffStatus(value: unknown): StaffStatus | null {
  if (value === 'active' || value === 'suspended' || value === 'removed') {
    return value;
  }
  return null;
}

function resolveStaffStatus(staff: Doc<'businessStaff'>): StaffStatus {
  const normalized = normalizeStaffStatus(staff.status);
  if (normalized) {
    return normalized;
  }
  return staff.isActive === true ? 'active' : 'suspended';
}

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
  return requireActorIsActiveStaffForBusiness(ctx, businessId);
}

export async function requireActorIsActiveStaffForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const actor = await requireCurrentUser(ctx);

  const membership = await ctx.db
    .query('businessStaff')
    .withIndex('by_businessId_userId', (q: any) =>
      q.eq('businessId', businessId).eq('userId', actor._id)
    )
    .first();

  if (!membership) {
    throw new Error('NOT_AUTHORIZED');
  }

  if (resolveStaffStatus(membership) !== 'active') {
    throw new Error('NOT_AUTHORIZED');
  }

  return {
    actor,
    membership,
    staffRole: membership.staffRole as StaffRole,
    status: 'active' as const,
  };
}

export async function requireActorCanManageTeamForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const { actor, membership, staffRole } =
    await requireActorIsActiveStaffForBusiness(ctx, businessId);
  if (staffRole !== 'owner' && staffRole !== 'manager') {
    throw new Error('NOT_AUTHORIZED');
  }
  return { actor, membership, staffRole };
}

export function requireActorCanInviteRole(
  actorRole: StaffRole,
  targetRole: 'manager' | 'staff'
) {
  if (targetRole !== 'manager' && targetRole !== 'staff') {
    throw new Error('INVALID_STAFF_ROLE');
  }

  if (actorRole === 'owner') {
    return;
  }

  if (actorRole === 'manager' && targetRole === 'staff') {
    return;
  }

  throw new Error('NOT_AUTHORIZED');
}

export function requireActorCanManageTargetStaff(args: {
  actorUserId: Id<'users'>;
  actorRole: StaffRole;
  targetUserId: Id<'users'>;
  targetRole: StaffRole;
}) {
  const { actorUserId, actorRole, targetUserId, targetRole } = args;
  if (String(actorUserId) === String(targetUserId)) {
    throw new Error('CANNOT_MANAGE_SELF');
  }

  if (targetRole === 'owner') {
    throw new Error('NOT_AUTHORIZED');
  }

  if (actorRole === 'owner') {
    return;
  }

  if (actorRole === 'manager' && targetRole === 'staff') {
    return;
  }

  throw new Error('NOT_AUTHORIZED');
}

export async function requireActorIsBusinessOwner(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const { actor, staffRole } = await requireActorIsActiveStaffForBusiness(
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
  const { actor, membership, staffRole } =
    await requireActorCanManageTeamForBusiness(ctx, businessId);
  return { actor, membership, staffRole };
}

export async function getActorMembershipForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const { membership } = await requireActorIsActiveStaffForBusiness(
    ctx,
    businessId
  );
  return membership;
}

export function getBusinessStaffStatus(
  staff: Doc<'businessStaff'>
): StaffStatus {
  return resolveStaffStatus(staff);
}
