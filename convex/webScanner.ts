import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireActorHasBusinessCapability } from './guards';
import { resolveProgramLifecycle } from './loyaltyPrograms';

/** Additive read-only API. No QR/token fields are ever returned. */
export const getOutcome = query({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    runtimeId: v.string(),
    deviceId: v.string(),
    operation: v.union(
      v.literal('probe'),
      v.literal('resolve'),
      v.literal('stamp'),
      v.literal('redeem'),
      v.literal('continuation'),
      v.literal('undo'),
      v.literal('referral'),
      v.literal('recovery')
    ),
    sessionId: v.optional(v.id('scanSessions')),
    eventId: v.optional(v.id('events')),
    rewardId: v.optional(v.id('referralRewards')),
  },
  returns: v.object({
    actorId: v.id('users'),
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    serverNow: v.number(),
    status: v.union(
      v.literal('AUTHORIZED'),
      v.literal('RESOLVED'),
      v.literal('CONFIRMED'),
      v.literal('UNKNOWN'),
      v.literal('UNAVAILABLE')
    ),
    sessionId: v.union(v.id('scanSessions'), v.null()),
    expiresAt: v.union(v.number(), v.null()),
    receipt: v.any(),
  }),
  handler: async (ctx, args) => {
    const { actor } = await requireActorHasBusinessCapability(
      ctx,
      args.businessId,
      'scanner_access'
    );
    // HTTP query only, never a reactive useQuery subscription. The clock is advisory;
    // expiration of a ready row does not establish a sent command's final outcome.
    const base = {
      actorId: actor._id,
      businessId: args.businessId,
      programId: args.programId,
      serverNow: Date.now(),
      sessionId: null,
      expiresAt: null,
      receipt: null,
    };
    const program = await ctx.db.get(args.programId);
    if (!program || program.businessId !== args.businessId)
      throw new Error('NOT_AUTHORIZED');
    if (args.runtimeId.length > 160 || args.deviceId.length > 160)
      throw new Error('INVALID_SCAN_SESSION');
    if (args.operation === 'probe') {
      if (
        program.isActive !== true ||
        resolveProgramLifecycle(program) !== 'active'
      ) {
        return { ...base, status: 'UNAVAILABLE' as const };
      }
      return { ...base, status: 'AUTHORIZED' as const };
    }
    let session = args.sessionId ? await ctx.db.get(args.sessionId) : null;
    if (!args.sessionId) {
      // Exact runtime is freshly rotated per scan; bounded, indexed discovery.
      const matches = await ctx.db
        .query('scanSessions')
        .withIndex('by_scannerRuntimeSessionId', (q) =>
          q.eq('scannerRuntimeSessionId', args.runtimeId)
        )
        .take(2);
      if (matches.length !== 1) return { ...base, status: 'UNKNOWN' as const };
      session = matches[0];
    }
    if (
      !session ||
      session.actorUserId !== actor._id ||
      session.businessId !== args.businessId ||
      session.programId !== args.programId ||
      session.scannerRuntimeSessionId !== args.runtimeId ||
      session.deviceId !== args.deviceId
    )
      throw new Error('NOT_AUTHORIZED');
    const scoped = {
      ...base,
      sessionId: session._id,
      expiresAt: session.expiresAt,
    };
    const result = session.result as Record<string, any> | undefined;
    const summary = (r: Record<string, any>) => ({
      eventId: r.eventId ?? null,
      eventType: r.eventType ?? null,
      eventCreatedAt: r.eventCreatedAt ?? null,
      membershipId: r.membershipId ?? null,
      currentStamps: r.currentStamps ?? null,
      maxStamps: r.maxStamps ?? null,
      canRedeemNow: r.canRedeemNow === true,
      undoAvailableUntil: r.undoAvailableUntil ?? null,
      undoBlockedReason: r.undoBlockedReason ?? null,
      redemptionContinuationAvailableUntil:
        r.redemptionContinuationAvailableUntil ?? null,
    });
    if (args.operation === 'recovery') {
      // A reload loses operation identity. History is NOT confirmation of an unknown write.
      return {
        ...scoped,
        status: 'UNKNOWN' as const,
        receipt: result ? summary(result) : null,
      };
    }
    if (args.operation === 'referral') {
      if (!args.rewardId) throw new Error('REFERRAL_REWARD_NOT_FOUND');
      const reward = await ctx.db.get(args.rewardId);
      if (
        !reward ||
        reward.businessId !== args.businessId ||
        reward.recipientUserId !== session.customerId
      ) {
        throw new Error('NOT_AUTHORIZED');
      }
      const event = reward.redeemedEventId
        ? await ctx.db.get(reward.redeemedEventId)
        : null;
      const matches =
        reward.status === 'redeemed' &&
        reward.redeemedByUserId === actor._id &&
        event?.actorUserId === actor._id &&
        event.businessId === args.businessId &&
        event.scannerRuntimeSessionId === args.runtimeId &&
        event.deviceId === args.deviceId &&
        event.type === 'REFERRAL_BENEFIT_REDEEMED' &&
        event.metadata?.referralRewardId === String(reward._id);
      return {
        ...scoped,
        status: matches ? ('CONFIRMED' as const) : ('UNKNOWN' as const),
        receipt: matches
          ? {
              rewardId: reward._id,
              eventId: event._id,
              redeemedAt: reward.redeemedAt ?? null,
            }
          : null,
      };
    }
    if (args.operation === 'undo') {
      const continuation = result?.continuationRedeemResult;
      if (
        !args.eventId ||
        (args.eventId !== result?.eventId &&
          args.eventId !== continuation?.eventId)
      ) {
        throw new Error('NOT_AUTHORIZED');
      }
      const event = await ctx.db.get(args.eventId);
      if (
        !event ||
        event.actorUserId !== actor._id ||
        event.businessId !== args.businessId ||
        event.scannerRuntimeSessionId !== args.runtimeId ||
        event.deviceId !== args.deviceId
      )
        throw new Error('NOT_AUTHORIZED');
      const reversal = await ctx.db
        .query('events')
        .withIndex('by_revertsEventId', (q) =>
          q.eq('revertsEventId', event._id)
        )
        .first();
      const confirmed =
        reversal?.actorUserId === actor._id &&
        reversal.businessId === args.businessId &&
        reversal.source === 'scanner_undo' &&
        reversal.scannerRuntimeSessionId === args.runtimeId &&
        reversal.deviceId === args.deviceId;
      return {
        ...scoped,
        status: confirmed ? ('CONFIRMED' as const) : ('UNKNOWN' as const),
        receipt: confirmed
          ? {
              eventId: event._id,
              reversalEventId: reversal._id,
              status: 'reverted',
            }
          : null,
      };
    }
    if (args.operation === 'continuation') {
      const receipt = result?.continuationRedeemResult;
      return {
        ...scoped,
        status: receipt ? ('CONFIRMED' as const) : ('UNKNOWN' as const),
        receipt: receipt ? summary(receipt) : null,
      };
    }
    if (args.operation === 'resolve') {
      if (
        session.status !== 'ready' ||
        Date.now() > session.expiresAt ||
        Date.now() > session.tokenExpiresAt
      ) {
        return { ...scoped, status: 'UNKNOWN' as const };
      }
      const customer = session.customerId
        ? await ctx.db.get(session.customerId)
        : null;
      return {
        ...scoped,
        status: 'RESOLVED' as const,
        receipt: {
          scanSessionId: session._id,
          sessionExpiresAt: session.expiresAt,
          customerUserId: session.customerId ?? null,
          customerDisplayName: customer?.fullName ?? 'לקוח',
          resolution:
            session.actionType === 'redeem' ? 'REDEEM_AVAILABLE' : 'AUTO_STAMP',
        },
      };
    }
    if (
      (args.operation === 'stamp' && session.actionType !== 'stamp') ||
      (args.operation === 'redeem' && session.actionType !== 'redeem')
    )
      throw new Error('INVALID_SCAN_ACTION');
    return {
      ...scoped,
      status:
        session.status === 'committed' && result
          ? ('CONFIRMED' as const)
          : ('UNKNOWN' as const),
      receipt:
        session.status === 'committed' && result ? summary(result) : null,
    };
  },
});
