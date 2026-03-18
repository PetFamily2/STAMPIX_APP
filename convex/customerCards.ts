import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import {
  buildCustomerLifecycleSnapshotForBusiness,
  getCustomerLifecycleStatus,
} from './customerLifecycle';
import {
  requireActorIsBusinessOwnerOrManager,
  requireActorIsStaffForBusiness,
} from './guards';

type ProgramLifecycle = 'draft' | 'active' | 'archived';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMELINE_LIMIT = 100;
const MAX_TIMELINE_LIMIT = 200;

const BALANCE_EVENT_TYPES = new Set([
  'STAMP_ADDED',
  'REWARD_REDEEMED',
  'STAMP_REVERTED',
  'REWARD_REDEEM_REVERTED',
]);

const REVERSIBLE_EVENT_TYPES = new Set(['STAMP_ADDED', 'REWARD_REDEEMED']);

const VALID_REASON_CODES = new Set([
  'mistake',
  'wrong_program',
  'wrong_customer',
  'duplicate',
  'customer_service',
  'other',
]);

type MembershipStateSnapshot = {
  currentStamps: number;
  lastStampAt?: number;
  isActive: boolean;
};

function getDaysAgo(timestamp: number, now: number) {
  return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
}

function resolveProgramLifecycle(program: any): ProgramLifecycle {
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

function isLifecycleOperational(lifecycle: ProgramLifecycle) {
  return lifecycle === 'active' || lifecycle === 'archived';
}

function captureMembershipState(membership: any): MembershipStateSnapshot {
  return {
    currentStamps: Math.max(0, Number(membership?.currentStamps ?? 0)),
    lastStampAt:
      typeof membership?.lastStampAt === 'number'
        ? membership.lastStampAt
        : undefined,
    isActive: membership?.isActive === true,
  };
}

function sanitizeSnapshot(snapshot: any): MembershipStateSnapshot | null {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }
  if (typeof snapshot.currentStamps !== 'number') {
    return null;
  }
  return {
    currentStamps: Math.max(0, Math.floor(snapshot.currentStamps)),
    lastStampAt:
      typeof snapshot.lastStampAt === 'number'
        ? snapshot.lastStampAt
        : undefined,
    isActive: snapshot.isActive !== false,
  };
}

function toMembershipPatch(
  snapshot: MembershipStateSnapshot,
  updatedAt: number
) {
  return {
    currentStamps: snapshot.currentStamps,
    lastStampAt: snapshot.lastStampAt,
    isActive: snapshot.isActive,
    updatedAt,
  };
}

function mapReversalType(eventType: string) {
  if (eventType === 'STAMP_ADDED') {
    return 'STAMP_REVERTED';
  }
  if (eventType === 'REWARD_REDEEMED') {
    return 'REWARD_REDEEM_REVERTED';
  }
  throw new Error('EVENT_NOT_REVERSIBLE');
}

function isReasonCode(value: string) {
  return VALID_REASON_CODES.has(value);
}

async function findReversalEvent(ctx: any, originalEventId: Id<'events'>) {
  return await ctx.db
    .query('events')
    .withIndex('by_revertsEventId', (q: any) =>
      q.eq('revertsEventId', originalEventId)
    )
    .first();
}

async function getExistingReversalForOriginalEvent(
  ctx: any,
  originalEvent: any
) {
  const reversalId = originalEvent.reversalEventId as Id<'events'> | undefined;
  if (reversalId) {
    const reversalEvent = await ctx.db.get(reversalId);
    if (reversalEvent) {
      return reversalEvent;
    }
  }

  const reversalByLink = await findReversalEvent(ctx, originalEvent._id);
  if (reversalByLink && !reversalId) {
    await ctx.db.patch(originalEvent._id, {
      reversalEventId: reversalByLink._id,
    });
  }
  return reversalByLink;
}

async function getLatestBalanceEventForMembership(
  ctx: any,
  membershipId: Id<'memberships'>
) {
  const events = await ctx.db
    .query('events')
    .withIndex('by_membershipId_createdAt', (q: any) =>
      q.eq('membershipId', membershipId)
    )
    .collect();
  const balanceEvents = events.filter((event: any) =>
    BALANCE_EVENT_TYPES.has(event.type)
  );
  if (balanceEvents.length === 0) {
    return null;
  }

  balanceEvents.sort((left: any, right: any) => {
    if (left.createdAt !== right.createdAt) {
      return right.createdAt - left.createdAt;
    }
    return String(right._id).localeCompare(String(left._id));
  });
  return balanceEvents[0];
}

async function loadMembershipForEventOrThrow(ctx: any, event: any) {
  const membershipId = event.membershipId as Id<'memberships'> | undefined;
  if (!membershipId) {
    throw new Error('EVENT_NOT_REVERSIBLE');
  }

  const membership = await ctx.db.get(membershipId);
  if (!membership) {
    throw new Error('MEMBERSHIP_NOT_FOUND');
  }

  if (String(membership.businessId) !== String(event.businessId)) {
    throw new Error('EVENT_BUSINESS_MISMATCH');
  }
  if (String(membership.programId) !== String(event.programId)) {
    throw new Error('EVENT_PROGRAM_MISMATCH');
  }
  if (String(membership.userId) !== String(event.customerUserId)) {
    throw new Error('EVENT_CUSTOMER_MISMATCH');
  }

  return membership;
}

function buildMembershipSummary(membership: any, maxStamps: number) {
  const currentStamps = Math.max(0, Number(membership?.currentStamps ?? 0));
  return {
    membershipId: membership._id,
    currentStamps,
    maxStamps,
    canRedeemNow: currentStamps >= maxStamps,
    isActive: membership.isActive === true,
  };
}

export const listBusinessCustomersBase = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return [];
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    const snapshot = await buildCustomerLifecycleSnapshotForBusiness(
      ctx,
      businessId
    );
    return snapshot.customers;
  },
});

export const getBusinessCustomerCard = query({
  args: {
    businessId: v.id('businesses'),
    customerUserId: v.id('users'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { businessId, customerUserId, limit }) => {
    const { staffRole } = await requireActorIsStaffForBusiness(ctx, businessId);
    const canManualAdjust = staffRole === 'owner' || staffRole === 'manager';

    const customer = await ctx.db.get(customerUserId);
    if (!customer || customer.isActive !== true) {
      return null;
    }

    const activeMemberships = await ctx.db
      .query('memberships')
      .withIndex('by_userId_businessId', (q: any) =>
        q.eq('userId', customerUserId).eq('businessId', businessId)
      )
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    if (activeMemberships.length === 0) {
      return null;
    }

    const uniqueProgramIds = [
      ...new Set(
        activeMemberships.map((membership) => String(membership.programId))
      ),
    ];
    const programs = await Promise.all(
      uniqueProgramIds.map((programId) =>
        ctx.db.get(programId as Id<'loyaltyPrograms'>)
      )
    );

    const programById = new Map<string, Doc<'loyaltyPrograms'>>();
    for (const program of programs) {
      if (!program || program.isActive !== true) {
        continue;
      }
      if (String(program.businessId) !== String(businessId)) {
        continue;
      }
      if (!isLifecycleOperational(resolveProgramLifecycle(program))) {
        continue;
      }
      programById.set(String(program._id), program);
    }

    const memberships = activeMemberships.filter((membership) =>
      programById.has(String(membership.programId))
    );
    if (memberships.length === 0) {
      return null;
    }

    const events = await ctx.db
      .query('events')
      .withIndex('by_businessId_customerUserId_createdAt', (q: any) =>
        q.eq('businessId', businessId).eq('customerUserId', customerUserId)
      )
      .collect();

    const actorUserIds = [
      ...new Set(events.map((event) => String(event.actorUserId))),
    ];
    const actorUsers = await Promise.all(
      actorUserIds.map((actorUserId) => ctx.db.get(actorUserId as Id<'users'>))
    );
    const actorNameById = new Map<string, string>();
    for (const actor of actorUsers) {
      if (!actor || actor.isActive !== true) {
        continue;
      }
      actorNameById.set(
        String(actor._id),
        actor.fullName ?? actor.email ?? actor.externalId ?? 'צוות'
      );
    }

    const now = Date.now();
    const stampEvents = events.filter((event) => event.type === 'STAMP_ADDED');
    const rewardEvents = events.filter(
      (event) => event.type === 'REWARD_REDEEMED'
    );

    const programRowsWithMeta = memberships
      .map((membership) => {
        const program = programById.get(String(membership.programId));
        if (!program) {
          return null;
        }
        const maxStamps = Math.max(1, Number(program.maxStamps ?? 0) || 1);
        const currentStamps = Math.max(
          0,
          Number(membership.currentStamps ?? 0)
        );
        const rewardProgressRatio = currentStamps / maxStamps;
        const lastActivityAt =
          membership.lastStampAt ??
          membership.updatedAt ??
          membership.createdAt;
        return {
          membershipId: membership._id,
          programId: program._id,
          programTitle: program.title,
          rewardName: program.rewardName,
          stampIcon: program.stampIcon,
          stampShape: program.stampShape ?? 'circle',
          cardThemeId: program.cardThemeId ?? null,
          currentStamps,
          maxStamps,
          canRedeem: currentStamps >= maxStamps,
          joinedAt: membership.createdAt,
          lastStampAt: membership.lastStampAt ?? null,
          lastActivityAt,
          rewardProgressRatio,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((left, right) => right.lastActivityAt - left.lastActivityAt);

    if (programRowsWithMeta.length === 0) {
      return null;
    }

    const primaryRow = [...programRowsWithMeta].sort((left, right) => {
      if (right.rewardProgressRatio !== left.rewardProgressRatio) {
        return right.rewardProgressRatio - left.rewardProgressRatio;
      }
      return right.lastActivityAt - left.lastActivityAt;
    })[0];

    const joinedAt = Math.min(
      ...programRowsWithMeta.map((row) => row.joinedAt)
    );
    const latestMembershipStampAt = Math.max(
      ...programRowsWithMeta.map((row) => row.lastStampAt ?? 0)
    );
    const latestStampEventAt = Math.max(
      ...stampEvents.map((event) => event.createdAt),
      0
    );
    const lastVisitAt = Math.max(
      joinedAt,
      latestMembershipStampAt,
      latestStampEventAt
    );

    const joinedDaysAgo = getDaysAgo(joinedAt, now);
    const lastVisitDaysAgo = getDaysAgo(lastVisitAt, now);
    const visitCount = stampEvents.length;
    const lifecycleStatus = getCustomerLifecycleStatus({
      joinedDaysAgo,
      lastVisitDaysAgo,
      rewardProgressRatio: primaryRow.rewardProgressRatio,
      visitCount,
    });

    const joinedTimeline = programRowsWithMeta.map((row) => ({
      id: `join-${String(row.membershipId)}`,
      type: 'JOINED_PROGRAM' as const,
      createdAt: row.joinedAt,
      programId: row.programId,
      programTitle: row.programTitle,
      detail: 'הצטרף לכרטיסיה',
      actorName: null as string | null,
      isReversible: false,
      isReversed: false,
      revertsEventId: null as string | null,
      reversalEventId: null as string | null,
      reasonCode: null as string | null,
      reasonNote: null as string | null,
    }));

    const reversalByOriginalEventId = new Map<string, Doc<'events'>>();
    for (const event of events) {
      if (event.revertsEventId) {
        reversalByOriginalEventId.set(String(event.revertsEventId), event);
      }
    }

    const latestBalanceEventIdByMembership = new Map<string, string>();
    for (const membership of memberships) {
      const membershipEvents = events
        .filter(
          (event) =>
            String(event.membershipId ?? '') === String(membership._id) &&
            BALANCE_EVENT_TYPES.has(event.type)
        )
        .sort((left, right) => {
          if (left.createdAt !== right.createdAt) {
            return right.createdAt - left.createdAt;
          }
          return String(right._id).localeCompare(String(left._id));
        });
      if (membershipEvents.length > 0) {
        latestBalanceEventIdByMembership.set(
          String(membership._id),
          String(membershipEvents[0]._id)
        );
      }
    }

    const eventTimeline = events
      .filter((event) => BALANCE_EVENT_TYPES.has(event.type))
      .map((event) => {
        const metadata = event.metadata as Record<string, unknown> | undefined;
        const program = programById.get(String(event.programId));
        const nextPunch =
          typeof metadata?.next === 'number' ? metadata.next : undefined;
        const previousPunch =
          typeof metadata?.previous === 'number'
            ? metadata.previous
            : undefined;
        const redeemedFrom =
          typeof metadata?.redeemedFrom === 'number'
            ? metadata.redeemedFrom
            : undefined;
        const maxStamps =
          typeof program?.maxStamps === 'number' ? program.maxStamps : null;
        const unlockedRewardByCompletion =
          event.type === 'STAMP_ADDED' &&
          typeof previousPunch === 'number' &&
          typeof nextPunch === 'number' &&
          typeof maxStamps === 'number' &&
          previousPunch < maxStamps &&
          nextPunch >= maxStamps;

        const detail =
          event.type === 'STAMP_ADDED'
            ? nextPunch
              ? `ניקוב ${nextPunch}`
              : 'ניקוב נוסף'
            : event.type === 'REWARD_REDEEMED'
              ? redeemedFrom
                ? `מימוש הטבה (${redeemedFrom} ניקובים)`
                : 'מימוש הטבה'
              : event.type === 'STAMP_REVERTED'
                ? 'ניקוב בוטל'
                : 'מימוש בוטל';

        const displayDetail =
          unlockedRewardByCompletion && event.type === 'STAMP_ADDED'
            ? program?.rewardName
              ? `השלים כרטיסיה וזכאי ל${program.rewardName}`
              : 'השלים כרטיסיה וזכאי להטבה'
            : detail;

        const isReversed = reversalByOriginalEventId.has(String(event._id));
        const latestMembershipEventId = latestBalanceEventIdByMembership.get(
          String(event.membershipId ?? '')
        );
        const isLatestOnMembership =
          latestMembershipEventId === String(event._id);

        return {
          id: String(event._id),
          type: event.type as
            | 'STAMP_ADDED'
            | 'REWARD_REDEEMED'
            | 'STAMP_REVERTED'
            | 'REWARD_REDEEM_REVERTED',
          createdAt: event.createdAt,
          programId: program?._id ?? null,
          programTitle: program?.title ?? null,
          detail: displayDetail,
          actorName: actorNameById.get(String(event.actorUserId)) ?? null,
          isReversible:
            canManualAdjust &&
            REVERSIBLE_EVENT_TYPES.has(event.type) &&
            !isReversed &&
            isLatestOnMembership,
          isReversed,
          revertsEventId: event.revertsEventId ?? null,
          reversalEventId: isReversed
            ? (reversalByOriginalEventId.get(String(event._id))?._id ?? null)
            : null,
          reasonCode: event.reasonCode ?? null,
          reasonNote: event.reasonNote ?? null,
        };
      });

    const timelineLimit = Math.max(
      1,
      Math.min(limit ?? DEFAULT_TIMELINE_LIMIT, MAX_TIMELINE_LIMIT)
    );
    const timeline = [...joinedTimeline, ...eventTimeline]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, timelineLimit);

    return {
      businessId,
      customerUserId,
      customer: {
        name:
          customer.fullName ?? customer.email ?? customer.externalId ?? 'לקוח',
        phone: customer.phone ?? null,
        email: customer.email ?? null,
        avatarUrl: customer.avatarUrl ?? null,
        marketingOptIn: customer.marketingOptIn === true,
        birthdayMonth: customer.birthdayMonth ?? null,
        birthdayDay: customer.birthdayDay ?? null,
        anniversaryMonth: customer.anniversaryMonth ?? null,
        anniversaryDay: customer.anniversaryDay ?? null,
      },
      permissions: {
        canManualAdjust,
      },
      summary: {
        joinedAt,
        joinedDaysAgo,
        lastVisitAt,
        lastVisitDaysAgo,
        visitCount,
        totalStampsAdded: stampEvents.length,
        totalRewardsRedeemed: rewardEvents.length,
        activeProgramsCount: programRowsWithMeta.length,
        redeemableProgramsCount: programRowsWithMeta.filter(
          (row) => row.canRedeem
        ).length,
        lifecycleStatus,
        primaryProgramName: primaryRow.programTitle,
        loyaltyProgress: primaryRow.currentStamps,
        rewardThreshold: primaryRow.maxStamps,
      },
      programs: programRowsWithMeta.map(
        ({ rewardProgressRatio: _rewardProgressRatio, ...row }) => row
      ),
      timeline,
    };
  },
});

export const reverseCustomerCardEvent = mutation({
  args: {
    eventId: v.id('events'),
    reasonCode: v.string(),
    reasonNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const targetEvent = await ctx.db.get(args.eventId);
    if (!targetEvent) {
      throw new Error('EVENT_NOT_FOUND');
    }
    if (!REVERSIBLE_EVENT_TYPES.has(targetEvent.type)) {
      throw new Error('EVENT_NOT_REVERSIBLE');
    }
    if (!isReasonCode(args.reasonCode)) {
      throw new Error('INVALID_REASON_CODE');
    }

    const note = args.reasonNote?.trim();
    if (args.reasonCode === 'other' && !note) {
      throw new Error('REASON_NOTE_REQUIRED');
    }

    const { actor } = await requireActorIsBusinessOwnerOrManager(
      ctx,
      targetEvent.businessId
    );

    const membership = await loadMembershipForEventOrThrow(ctx, targetEvent);
    const program = await ctx.db.get(targetEvent.programId);
    if (
      !program ||
      String(program.businessId) !== String(targetEvent.businessId)
    ) {
      throw new Error('PROGRAM_NOT_FOUND');
    }

    const existingReversal = await getExistingReversalForOriginalEvent(
      ctx,
      targetEvent
    );
    if (existingReversal) {
      return {
        status: 'already_reverted' as const,
        reversalEventId: existingReversal._id,
        membership: buildMembershipSummary(membership, program.maxStamps),
      };
    }

    const latestMembershipEvent = await getLatestBalanceEventForMembership(
      ctx,
      membership._id
    );
    if (
      !latestMembershipEvent ||
      String(latestMembershipEvent._id) !== String(targetEvent._id)
    ) {
      throw new Error('MANUAL_ADJUSTMENT_NOT_LAST_EVENT');
    }

    const restoreSnapshot = sanitizeSnapshot(targetEvent.membershipStateBefore);
    if (!restoreSnapshot) {
      throw new Error('EVENT_NOT_REVERSIBLE');
    }

    const membershipStateBefore = captureMembershipState(membership);
    const now = Date.now();
    await ctx.db.patch(membership._id, toMembershipPatch(restoreSnapshot, now));

    const reversalType = mapReversalType(targetEvent.type);
    const reversalEventId = await ctx.db.insert('events', {
      type: reversalType,
      businessId: targetEvent.businessId,
      programId: targetEvent.programId,
      membershipId: membership._id,
      actorUserId: actor._id,
      customerUserId: membership.userId,
      source: 'manual_adjustment',
      revertsEventId: targetEvent._id,
      reasonCode: args.reasonCode,
      reasonNote: note,
      membershipStateBefore,
      membershipStateAfter: restoreSnapshot,
      metadata: {
        source: 'manual_adjustment',
        originalEventType: targetEvent.type,
      },
      createdAt: now,
    });

    await ctx.db.patch(targetEvent._id, {
      reversalEventId,
    });

    const updatedMembership = await ctx.db.get(membership._id);
    if (!updatedMembership) {
      throw new Error('MEMBERSHIP_NOT_FOUND');
    }

    return {
      status: 'reverted' as const,
      reversalEventId,
      membership: buildMembershipSummary(updatedMembership, program.maxStamps),
    };
  },
});
