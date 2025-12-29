import type { AuditEvent, Membership } from '../domain/entities';

export function addStamp(params: {
  membership: Membership;
  stampCount?: number; // future-ready
  now: number;
}): { nextMembership: Membership; event: Omit<AuditEvent, 'id'> } {
  const stampCount = params.stampCount ?? 1;

  const nextMembership: Membership = {
    ...params.membership,
    currentStamps: params.membership.currentStamps + stampCount,
    updatedAt: params.now,
  };

  const event: Omit<AuditEvent, 'id'> = {
    type: 'STAMP_ADDED',
    actorUserId: params.membership.userId, // placeholder - actual actor is staff in app
    businessId: params.membership.businessId,
    membershipId: params.membership.id,
    programId: params.membership.programId,
    stampCount,
    source: 'app',
    createdAt: params.now,
  };

  return { nextMembership, event };
}

export function redeemReward(params: { membership: Membership; now: number }): {
  nextMembership: Membership;
  event: Omit<AuditEvent, 'id'>;
} {
  const nextMembership: Membership = {
    ...params.membership,
    currentStamps: 0,
    cycle: params.membership.cycle + 1,
    updatedAt: params.now,
  };

  const event: Omit<AuditEvent, 'id'> = {
    type: 'REWARD_REDEEMED',
    actorUserId: params.membership.userId, // placeholder - actual actor is staff in app
    businessId: params.membership.businessId,
    membershipId: params.membership.id,
    programId: params.membership.programId,
    source: 'app',
    createdAt: params.now,
  };

  return { nextMembership, event };
}
