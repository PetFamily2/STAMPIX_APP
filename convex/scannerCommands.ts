import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireActorHasBusinessCapability } from './guards';

const operation = v.union(
  v.literal('resolve'),
  v.literal('stamp'),
  v.literal('redeem'),
  v.literal('continuation'),
  v.literal('undo'),
  v.literal('referral')
);
const identity = {
  operationId: v.string(),
  operation,
  businessId: v.id('businesses'),
  programId: v.id('loyaltyPrograms'),
  runtimeId: v.string(),
  deviceId: v.string(),
};
const failureCodes = [
  'BUSINESS_PERMANENT_DELETION_IN_PROGRESS',
  'PROGRAM_NOT_SCANNER_ELIGIBLE',
  'UNDO_SESSION_CONTINUITY_BROKEN',
  'UNDO_NOT_LAST_MEMBERSHIP_EVENT',
  'UNDO_NOT_LAST_SESSION_EVENT',
  'UNDO_BLOCKED_REFERRAL_REWARD',
  'UNDO_REDEEM_DISABLED',
  'SUBSCRIPTION_INACTIVE',
  'PLAN_LIMIT_REACHED',
  'FEATURE_NOT_AVAILABLE',
  'SCAN_SESSION_EXPIRED',
  'INVALID_SCAN_SESSION',
  'SCAN_SESSION_FAILED',
  'INVALID_SCAN_ACTION',
  'TOKEN_ALREADY_USED',
  'POS_ENROLL_DISABLED',
  'PROGRAM_NOT_FOUND',
  'MEMBERSHIP_NOT_FOUND',
  'NOT_ENOUGH_STAMPS',
  'CUSTOMER_NOT_FOUND',
  'BUSINESS_NOT_FOUND',
  'BUSINESS_CLOSED',
  'NOT_AUTHENTICATED',
  'NOT_AUTHORIZED',
  'UNDO_PERMISSION_DENIED',
  'UNDO_SESSION_MISMATCH',
  'UNDO_EXPIRED',
  'EVENT_NOT_FOUND',
  'EVENT_NOT_REVERSIBLE',
  'UNDO_NOT_ALLOWED',
  'INVALID_QR',
  'EXPIRED_TOKEN',
  'SELF_STAMP',
  'RATE_LIMITED',
  'REWARD_EXPIRED',
  'REWARD_NOT_AVAILABLE',
  'REWARD_ALREADY_REDEEMED',
];
function failureCode(error: unknown) {
  const text = error instanceof Error ? error.message : '';
  return (
    failureCodes.find((code) => new RegExp(`\\b${code}\\b`).test(text)) ??
    'SCANNER_COMMAND_FAILED'
  );
}
const paths = {
  resolve: 'scanner:resolveScan',
  stamp: 'scanner:commitStamp',
  redeem: 'scanner:commitRedeem',
  continuation: 'scanner:commitCompletedStampRedeem',
  undo: 'scanner:undoLastScannerAction',
  referral: 'referrals:redeemReferralBenefit',
};
function validIdentity(args: {
  operationId: string;
  runtimeId: string;
  deviceId: string;
}) {
  if (
    ![args.operationId, args.runtimeId, args.deviceId].every(
      (s) => s.length > 0 && s.length <= 160
    )
  )
    throw new Error('INVALID_SCAN_SESSION');
}

/** The receipt and nested business mutation commit atomically. Never stores QR or write arguments. */
export const execute = mutation({
  args: {
    ...identity,
    qrData: v.optional(v.string()),
    sessionId: v.optional(v.id('scanSessions')),
    eventId: v.optional(v.id('events')),
    rewardId: v.optional(v.id('referralRewards')),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    validIdentity(args);
    const { actor } = await requireActorHasBusinessCapability(
      ctx,
      args.businessId,
      'scanner_access'
    );
    const program = await ctx.db.get(args.programId);
    if (!program || program.businessId !== args.businessId)
      throw new Error('NOT_AUTHORIZED');
    const binding = JSON.stringify([
      args.businessId,
      args.programId,
      args.runtimeId,
      args.deviceId,
      args.operation,
      args.sessionId ?? null,
      args.eventId ?? null,
      args.rewardId ?? null,
    ]);
    const prior = await ctx.db
      .query('scannerCommandReceipts')
      .withIndex('by_actor_operation', (q) =>
        q.eq('actorId', actor._id).eq('operationId', args.operationId)
      )
      .unique();
    if (prior) {
      if (prior.binding !== binding)
        throw new Error('OPERATION_SCOPE_MISMATCH');
      return prior.result;
    }
    let customerId: typeof actor._id | undefined;
    if (args.operation !== 'resolve') {
      const session = args.sessionId ? await ctx.db.get(args.sessionId) : null;
      if (
        !session ||
        session.actorUserId !== actor._id ||
        session.businessId !== args.businessId ||
        session.programId !== args.programId ||
        session.scannerRuntimeSessionId !== args.runtimeId ||
        session.deviceId !== args.deviceId
      )
        throw new Error('NOT_AUTHORIZED');
      customerId = session.customerId;
      if (args.operation === 'undo') {
        const event = args.eventId ? await ctx.db.get(args.eventId) : null;
        if (
          !event ||
          event.actorUserId !== actor._id ||
          event.businessId !== args.businessId ||
          event.programId !== args.programId ||
          event.scannerRuntimeSessionId !== args.runtimeId ||
          event.deviceId !== args.deviceId
        )
          throw new Error('NOT_AUTHORIZED');
      }
      if (args.operation === 'referral') {
        const reward = args.rewardId ? await ctx.db.get(args.rewardId) : null;
        if (
          !reward ||
          reward.businessId !== args.businessId ||
          reward.recipientUserId !== session.customerId
        )
          throw new Error('NOT_AUTHORIZED');
      }
    }
    const callArgs =
      args.operation === 'resolve'
        ? {
            qrData: args.qrData ?? '',
            businessId: args.businessId,
            programId: args.programId,
            scannerRuntimeSessionId: args.runtimeId,
            deviceId: args.deviceId,
          }
        : args.operation === 'undo'
          ? {
              eventId: args.eventId,
              scannerRuntimeSessionId: args.runtimeId,
              deviceId: args.deviceId,
            }
          : args.operation === 'referral'
            ? {
                businessId: args.businessId,
                rewardId: args.rewardId,
                scannerRuntimeSessionId: args.runtimeId,
                deviceId: args.deviceId,
              }
            : { scanSessionId: args.sessionId };
    let result: Record<string, any>;
    try {
      result = await ctx.runMutation(
        makeFunctionReference<'mutation'>(paths[args.operation]),
        callArgs
      );
    } catch (error) {
      // A failed nested mutation rolls back its subtransaction. The outer receipt
      // records a terminal rejection without retaining messages or QR data.
      result = { commandFailureCode: failureCode(error) };
    }
    await ctx.db.insert('scannerCommandReceipts', {
      actorId: actor._id,
      operationId: args.operationId,
      operation: args.operation,
      businessId: args.businessId,
      programId: args.programId,
      runtimeId: args.runtimeId,
      deviceId: args.deviceId,
      binding,
      result,
      ...(customerId || result.customerUserId
        ? { customerId: customerId ?? result.customerUserId }
        : {}),
      createdAt: Date.now(),
    });
    return result;
  },
});

/** Absence remains UNKNOWN: a sent request may still be executing. */
export const getReceipt = query({
  args: identity,
  returns: v.object({
    status: v.union(v.literal('CONFIRMED'), v.literal('UNKNOWN')),
    receipt: v.any(),
  }),
  handler: async (ctx, args) => {
    validIdentity(args);
    const { actor } = await requireActorHasBusinessCapability(
      ctx,
      args.businessId,
      'scanner_access'
    );
    const row = await ctx.db
      .query('scannerCommandReceipts')
      .withIndex('by_actor_operation', (q) =>
        q.eq('actorId', actor._id).eq('operationId', args.operationId)
      )
      .unique();
    if (!row) return { status: 'UNKNOWN' as const, receipt: null };
    if (
      row.businessId !== args.businessId ||
      row.programId !== args.programId ||
      row.runtimeId !== args.runtimeId ||
      row.deviceId !== args.deviceId ||
      row.operation !== args.operation
    )
      throw new Error('NOT_AUTHORIZED');
    return { status: 'CONFIRMED' as const, receipt: row.result };
  },
});
