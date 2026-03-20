import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import {
  assertEntitlement,
  countActiveCustomersForBusiness,
} from './entitlements';
import {
  getBusinessStaffStatus,
  getCurrentUserOrNull,
  requireActorIsStaffForBusiness,
  requireBusinessAndProgram,
  requireCurrentUser,
} from './guards';
import {
  assertScanTokenSignature,
  buildScanToken,
  getScanTokenIdentity,
  isScanTokenExpired,
  parseScanToken,
  type ScanTokenPayload,
} from './scanTokens';
import {
  getRoleCapabilities,
  type BusinessCapabilityMap,
} from './lib/staffPermissions';

const STAMP_RATE_LIMIT_MS = 30_000;
const SCAN_SESSION_VALID_MS = 30_000;
const UNDO_WINDOW_MS = 30_000;
const ALLOW_REDEEM_UNDO = true;

const BALANCE_EVENT_TYPES = new Set([
  'STAMP_ADDED',
  'REWARD_REDEEMED',
  'STAMP_REVERTED',
  'REWARD_REDEEM_REVERTED',
]);

const COMMIT_BUSINESS_ERROR_CODES = new Set([
  'PROGRAM_NOT_SCANNER_ELIGIBLE',
  'TOKEN_ALREADY_USED',
  'EXPIRED_TOKEN',
  'CUSTOMER_NOT_FOUND',
  'SELF_STAMP',
  'RATE_LIMITED',
  'POS_ENROLL_DISABLED',
  'MEMBERSHIP_NOT_FOUND',
  'NOT_ENOUGH_STAMPS',
  'NOT_AUTHORIZED',
  'INVALID_SCAN_ACTION',
  'SCAN_SESSION_EXPIRED',
  'INVALID_SCAN_SESSION',
  'SCAN_SESSION_FAILED',
  'FEATURE_NOT_AVAILABLE',
  'PLAN_LIMIT_REACHED',
  'SUBSCRIPTION_INACTIVE',
]);

const ENTITLEMENT_ERROR_CODES = new Set([
  'FEATURE_NOT_AVAILABLE',
  'PLAN_LIMIT_REACHED',
  'SUBSCRIPTION_INACTIVE',
]);

type BusinessForStaff = {
  businessId: Id<'businesses'>;
  name: string;
  externalId: string;
  businessPublicId: string | null;
  joinCode: string | null;
  logoUrl: string | null;
  colors: unknown | null;
  staffRole: 'owner' | 'manager' | 'staff';
  capabilities: BusinessCapabilityMap;
};

type ResolveScanOutcome = 'AUTO_STAMP' | 'REDEEM_AVAILABLE' | 'JOIN_AND_STAMP';

type MembershipStateSnapshot = {
  currentStamps: number;
  lastStampAt?: number;
  isActive: boolean;
};

type ReversalReasonCode =
  | 'mistake'
  | 'wrong_program'
  | 'wrong_customer'
  | 'duplicate'
  | 'customer_service'
  | 'other';

function resolveProgramLifecycle(
  program: any
): 'draft' | 'active' | 'archived' {
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

function isProgramScannerEligible(program: any) {
  if (!program || program.isActive !== true) {
    return false;
  }
  return resolveProgramLifecycle(program) === 'active';
}

function toErrorCode(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'cause' in error &&
    error.cause &&
    typeof error.cause === 'object' &&
    'data' in error.cause &&
    error.cause.data &&
    typeof error.cause.data === 'object' &&
    'code' in error.cause.data &&
    typeof (error.cause.data as { code: unknown }).code === 'string'
  ) {
    return (error.cause.data as { code: string }).code;
  }
  if (
    error &&
    typeof error === 'object' &&
    'data' in error &&
    error.data &&
    typeof error.data === 'object' &&
    'code' in error.data &&
    typeof (error.data as { code: unknown }).code === 'string'
  ) {
    return (error.data as { code: string }).code;
  }
  if (error instanceof ConvexError) {
    const data = error.data as { code?: unknown } | null;
    if (typeof data?.code === 'string') {
      return data.code;
    }
    return 'UNKNOWN';
  }
  if (!(error instanceof Error)) {
    return 'UNKNOWN';
  }
  const message = error.message ?? '';
  if (message.startsWith('{') && message.endsWith('}')) {
    try {
      const parsed = JSON.parse(message) as { code?: unknown };
      if (typeof parsed.code === 'string') {
        return parsed.code;
      }
    } catch {
      // Ignore invalid JSON payloads and fallback to message.
    }
  }
  for (const entitlementCode of ENTITLEMENT_ERROR_CODES) {
    if (message.includes(entitlementCode)) {
      return entitlementCode;
    }
  }
  return message || 'UNKNOWN';
}

function buildEntitlementErrorPayload(
  error: unknown,
  params: {
    code: string;
    businessId: Id<'businesses'>;
  }
) {
  if (
    error &&
    typeof error === 'object' &&
    'data' in error &&
    error.data &&
    typeof error.data === 'object'
  ) {
    const payload = error.data as Record<string, unknown>;
    return {
      ...payload,
      code: params.code,
      businessId:
        typeof payload.businessId === 'string'
          ? payload.businessId
          : String(params.businessId),
    };
  }

  if (error instanceof Error) {
    const message = error.message ?? '';
    if (message.startsWith('{') && message.endsWith('}')) {
      try {
        const parsed = JSON.parse(message) as Record<string, unknown>;
        return {
          ...parsed,
          code: params.code,
          businessId:
            typeof parsed.businessId === 'string'
              ? parsed.businessId
              : String(params.businessId),
        };
      } catch {
        // Ignore invalid JSON message payload.
      }
    }
    if (
      error &&
      typeof error === 'object' &&
      'cause' in error &&
      error.cause &&
      typeof error.cause === 'object' &&
      'data' in error.cause &&
      error.cause.data &&
      typeof error.cause.data === 'object'
    ) {
      const payload = error.cause.data as Record<string, unknown>;
      return {
        ...payload,
        code: params.code,
        businessId:
          typeof payload.businessId === 'string'
            ? payload.businessId
            : String(params.businessId),
      };
    }
  }

  return {
    code: params.code,
    businessId: String(params.businessId),
  };
}

function buildCustomerDisplayName(customer: any) {
  return (
    customer.fullName ?? customer.email ?? customer.externalId ?? 'Customer'
  );
}

function buildMembershipSummary(membership: any, maxStamps: number) {
  if (!membership) {
    return null;
  }
  const currentStamps = membership.currentStamps ?? 0;
  return {
    membershipId: membership._id,
    currentStamps,
    maxStamps,
    canRedeemNow: currentStamps >= maxStamps,
  };
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

function isReversibleEventType(eventType: string) {
  return eventType === 'STAMP_ADDED' || eventType === 'REWARD_REDEEMED';
}

async function getActiveMembershipForProgram(
  ctx: any,
  userId: Id<'users'>,
  programId: Id<'loyaltyPrograms'>
) {
  return await ctx.db
    .query('memberships')
    .withIndex('by_userId_programId', (q: any) =>
      q.eq('userId', userId).eq('programId', programId)
    )
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .first();
}

async function getMembershipsForBusiness(
  ctx: any,
  userId: Id<'users'>,
  businessId: Id<'businesses'>
) {
  return await ctx.db
    .query('memberships')
    .withIndex('by_userId_businessId', (q: any) =>
      q.eq('userId', userId).eq('businessId', businessId)
    )
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .collect();
}

async function requireScannerEligibleProgram(
  ctx: any,
  businessId: Id<'businesses'>,
  programId: Id<'loyaltyPrograms'>
) {
  const { business, program } = await requireBusinessAndProgram(
    ctx,
    businessId,
    programId
  );
  if (!isProgramScannerEligible(program)) {
    throw new Error('PROGRAM_NOT_SCANNER_ELIGIBLE');
  }
  return { business, program };
}

async function findConsumedTokenEvent(
  ctx: any,
  tokenIdentity: ReturnType<typeof getScanTokenIdentity>
) {
  if (tokenIdentity.nonce) {
    const usageByNonce = await ctx.db
      .query('scanTokenEvents')
      .withIndex('by_nonce', (q: any) => q.eq('nonce', tokenIdentity.nonce))
      .first();
    if (usageByNonce) {
      return usageByNonce;
    }
  }

  return await ctx.db
    .query('scanTokenEvents')
    .withIndex('by_signature', (q: any) =>
      q.eq('signature', tokenIdentity.signature)
    )
    .first();
}

async function consumeTokenEvent(
  ctx: any,
  params: {
    businessId: Id<'businesses'>;
    programId: Id<'loyaltyPrograms'>;
    customerId: Id<'users'>;
    actorUserId: Id<'users'>;
    actionType: 'stamp' | 'redeem';
    membershipId: Id<'memberships'> | null;
    scanSessionId: Id<'scanSessions'> | null;
    tokenIdentity: ReturnType<typeof getScanTokenIdentity>;
  }
) {
  const now = Date.now();
  await ctx.db.insert('scanTokenEvents', {
    businessId: params.businessId,
    programId: params.programId,
    customerId: params.customerId,
    signature: params.tokenIdentity.signature,
    nonce: params.tokenIdentity.nonce ?? undefined,
    tokenVersion: params.tokenIdentity.version,
    actionType: params.actionType,
    membershipId: params.membershipId ?? undefined,
    actorUserId: params.actorUserId,
    scanSessionId: params.scanSessionId ?? undefined,
    tokenTimestamp: params.tokenIdentity.issuedAt,
    consumedAt: now,
    createdAt: now,
  });
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

async function getLatestSessionCommitEvent(
  ctx: any,
  scannerRuntimeSessionId: string
) {
  const sessionEvents = await ctx.db
    .query('events')
    .withIndex('by_scannerRuntimeSessionId_createdAt', (q: any) =>
      q.eq('scannerRuntimeSessionId', scannerRuntimeSessionId)
    )
    .collect();

  const commits = sessionEvents.filter(
    (event: any) =>
      event.source === 'scanner_commit' &&
      (event.type === 'STAMP_ADDED' || event.type === 'REWARD_REDEEMED')
  );
  if (commits.length === 0) {
    return null;
  }
  commits.sort((left: any, right: any) => {
    if (left.createdAt !== right.createdAt) {
      return right.createdAt - left.createdAt;
    }
    return String(right._id).localeCompare(String(left._id));
  });
  return commits[0];
}

async function hasNewerScanInRuntimeSession(
  ctx: any,
  params: {
    scannerRuntimeSessionId: string;
    createdAfter: number;
    actorUserId: Id<'users'>;
    businessId: Id<'businesses'>;
  }
) {
  const sessions = await ctx.db
    .query('scanSessions')
    .withIndex('by_scannerRuntimeSessionId_createdAt', (q: any) =>
      q.eq('scannerRuntimeSessionId', params.scannerRuntimeSessionId)
    )
    .collect();

  return sessions.some(
    (session: any) =>
      session.createdAt > params.createdAfter &&
      String(session.actorUserId) === String(params.actorUserId) &&
      String(session.businessId) === String(params.businessId)
  );
}

async function loadMembershipForEventOrThrow(ctx: any, targetEvent: any) {
  const membershipId = targetEvent.membershipId as
    | Id<'memberships'>
    | undefined;
  if (!membershipId) {
    throw new Error('EVENT_NOT_REVERSIBLE');
  }

  const membership = await ctx.db.get(membershipId);
  if (!membership || membership.isActive !== true) {
    throw new Error('MEMBERSHIP_NOT_FOUND');
  }

  if (String(membership.businessId) !== String(targetEvent.businessId)) {
    throw new Error('EVENT_BUSINESS_MISMATCH');
  }
  if (String(membership.programId) !== String(targetEvent.programId)) {
    throw new Error('EVENT_PROGRAM_MISMATCH');
  }
  if (String(membership.userId) !== String(targetEvent.customerUserId)) {
    throw new Error('EVENT_CUSTOMER_MISMATCH');
  }

  return membership;
}

async function applyStamp(
  ctx: any,
  params: {
    actorUserId: Id<'users'>;
    businessId: Id<'businesses'>;
    program: any;
    customerUserId: Id<'users'>;
    source: 'scanner_commit' | 'scanner_undo' | 'manual_adjustment';
    scannerRuntimeSessionId?: string;
    deviceId?: string;
  }
) {
  if (String(params.actorUserId) === String(params.customerUserId)) {
    throw new Error('SELF_STAMP');
  }

  const customer = await ctx.db.get(params.customerUserId);
  if (!customer || customer.isActive !== true) {
    throw new Error('CUSTOMER_NOT_FOUND');
  }

  const now = Date.now();
  const existingMembership = await getActiveMembershipForProgram(
    ctx,
    customer._id,
    params.program._id
  );

  if (existingMembership?.lastStampAt) {
    const elapsed = now - existingMembership.lastStampAt;
    if (elapsed < STAMP_RATE_LIMIT_MS) {
      throw new Error('RATE_LIMITED');
    }
  }

  if (!existingMembership) {
    if (params.program.allowPosEnroll === false) {
      throw new Error('POS_ENROLL_DISABLED');
    }

    const existingBusinessMembership = await ctx.db
      .query('memberships')
      .withIndex('by_userId_businessId', (q: any) =>
        q.eq('userId', customer._id).eq('businessId', params.businessId)
      )
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .first();

    if (!existingBusinessMembership) {
      const activeCustomersCount = await countActiveCustomersForBusiness(
        ctx,
        params.businessId
      );
      await assertEntitlement(ctx, params.businessId, {
        limitKey: 'maxCustomers',
        currentValue: activeCustomersCount,
      });
    }

    const membershipId = await ctx.db.insert('memberships', {
      userId: customer._id,
      businessId: params.businessId,
      programId: params.program._id,
      currentStamps: 1,
      lastStampAt: now,
      joinSource: 'scanner_pos',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const membershipStateBefore: MembershipStateSnapshot = {
      currentStamps: 0,
      lastStampAt: undefined,
      isActive: false,
    };
    const membershipStateAfter: MembershipStateSnapshot = {
      currentStamps: 1,
      lastStampAt: now,
      isActive: true,
    };

    const eventId = await ctx.db.insert('events', {
      type: 'STAMP_ADDED',
      businessId: params.businessId,
      programId: params.program._id,
      membershipId,
      actorUserId: params.actorUserId,
      customerUserId: customer._id,
      source: params.source,
      scannerRuntimeSessionId: params.scannerRuntimeSessionId,
      deviceId: params.deviceId,
      membershipStateBefore,
      membershipStateAfter,
      metadata: {
        source: params.source,
        previous: 0,
        next: 1,
      },
      createdAt: now,
    });

    return {
      membershipId,
      currentStamps: 1,
      maxStamps: params.program.maxStamps,
      canRedeemNow: 1 >= params.program.maxStamps,
      customerDisplayName: buildCustomerDisplayName(customer),
      eventId,
      eventType: 'STAMP_ADDED' as const,
      eventCreatedAt: now,
    };
  }

  const membershipStateBefore = captureMembershipState(existingMembership);
  const nextStamps = Math.min(
    existingMembership.currentStamps + 1,
    params.program.maxStamps
  );

  await ctx.db.patch(existingMembership._id, {
    currentStamps: nextStamps,
    lastStampAt: now,
    updatedAt: now,
  });

  const membershipStateAfter: MembershipStateSnapshot = {
    currentStamps: nextStamps,
    lastStampAt: now,
    isActive: true,
  };

  const eventId = await ctx.db.insert('events', {
    type: 'STAMP_ADDED',
    businessId: params.businessId,
    programId: params.program._id,
    membershipId: existingMembership._id,
    actorUserId: params.actorUserId,
    customerUserId: customer._id,
    source: params.source,
    scannerRuntimeSessionId: params.scannerRuntimeSessionId,
    deviceId: params.deviceId,
    membershipStateBefore,
    membershipStateAfter,
    metadata: {
      source: params.source,
      previous: existingMembership.currentStamps,
      next: nextStamps,
    },
    createdAt: now,
  });

  return {
    membershipId: existingMembership._id,
    currentStamps: nextStamps,
    maxStamps: params.program.maxStamps,
    canRedeemNow: nextStamps >= params.program.maxStamps,
    customerDisplayName: buildCustomerDisplayName(customer),
    eventId,
    eventType: 'STAMP_ADDED' as const,
    eventCreatedAt: now,
  };
}

async function applyRedeem(
  ctx: any,
  params: {
    actorUserId: Id<'users'>;
    businessId: Id<'businesses'>;
    program: any;
    customerUserId: Id<'users'>;
    source: 'scanner_commit' | 'scanner_undo' | 'manual_adjustment';
    scannerRuntimeSessionId?: string;
    deviceId?: string;
  }
) {
  const customer = await ctx.db.get(params.customerUserId);
  if (!customer || customer.isActive !== true) {
    throw new Error('CUSTOMER_NOT_FOUND');
  }

  const membership = await getActiveMembershipForProgram(
    ctx,
    customer._id,
    params.program._id
  );
  if (!membership) {
    throw new Error('MEMBERSHIP_NOT_FOUND');
  }
  if (membership.currentStamps < params.program.maxStamps) {
    throw new Error('NOT_ENOUGH_STAMPS');
  }

  const now = Date.now();
  const membershipStateBefore = captureMembershipState(membership);
  await ctx.db.patch(membership._id, {
    currentStamps: 0,
    updatedAt: now,
  });

  const membershipStateAfter: MembershipStateSnapshot = {
    currentStamps: 0,
    lastStampAt:
      typeof membership.lastStampAt === 'number'
        ? membership.lastStampAt
        : undefined,
    isActive: true,
  };

  const eventId = await ctx.db.insert('events', {
    type: 'REWARD_REDEEMED',
    businessId: params.businessId,
    programId: params.program._id,
    membershipId: membership._id,
    actorUserId: params.actorUserId,
    customerUserId: customer._id,
    source: params.source,
    scannerRuntimeSessionId: params.scannerRuntimeSessionId,
    deviceId: params.deviceId,
    membershipStateBefore,
    membershipStateAfter,
    metadata: { source: params.source, redeemedFrom: membership.currentStamps },
    createdAt: now,
  });

  return {
    membershipId: membership._id,
    currentStamps: 0,
    maxStamps: params.program.maxStamps,
    canRedeemNow: false,
    redeemedAt: now,
    customerDisplayName: buildCustomerDisplayName(customer),
    eventId,
    eventType: 'REWARD_REDEEMED' as const,
    eventCreatedAt: now,
  };
}

function buildProgramSummary(program: any) {
  return {
    programId: program._id,
    title: program.title,
    rewardName: program.rewardName,
    maxStamps: program.maxStamps,
    stampIcon: program.stampIcon,
    stampShape: program.stampShape ?? 'circle',
  };
}

async function createReversalForEvent(
  ctx: any,
  params: {
    originalEvent: any;
    actorUserId: Id<'users'>;
    source: 'scanner_undo' | 'manual_adjustment';
    scannerRuntimeSessionId?: string;
    deviceId?: string;
    reasonCode?: ReversalReasonCode;
    reasonNote?: string;
  }
) {
  // Exactly-once guard: lock reversals on the original event document.
  // Convex OCC retries make this deterministic under concurrent requests.
  const originalEvent = await ctx.db.get(params.originalEvent._id);
  if (!originalEvent) {
    throw new Error('EVENT_NOT_FOUND');
  }

  const existingReversal = await getExistingReversalForOriginalEvent(
    ctx,
    originalEvent
  );
  if (existingReversal) {
    const membership = await loadMembershipForEventOrThrow(ctx, originalEvent);
    const program = await ctx.db.get(originalEvent.programId);
    if (!program) {
      throw new Error('PROGRAM_NOT_FOUND');
    }
    return {
      idempotent: true,
      reversalEvent: existingReversal,
      membership,
      program,
    };
  }

  const membership = await loadMembershipForEventOrThrow(ctx, originalEvent);
  const program = await ctx.db.get(originalEvent.programId);
  if (
    !program ||
    String(program.businessId) !== String(originalEvent.businessId)
  ) {
    throw new Error('PROGRAM_NOT_FOUND');
  }

  const restoreSnapshot = sanitizeSnapshot(originalEvent.membershipStateBefore);
  if (!restoreSnapshot) {
    throw new Error('EVENT_NOT_REVERSIBLE');
  }

  const membershipStateBefore = captureMembershipState(membership);
  const now = Date.now();
  await ctx.db.patch(membership._id, toMembershipPatch(restoreSnapshot, now));

  const reversalType = mapReversalType(originalEvent.type);
  const reversalEventId = await ctx.db.insert('events', {
    type: reversalType,
    businessId: originalEvent.businessId,
    programId: originalEvent.programId,
    membershipId: membership._id,
    actorUserId: params.actorUserId,
    customerUserId: membership.userId,
    source: params.source,
    revertsEventId: originalEvent._id,
    reasonCode: params.reasonCode,
    reasonNote: params.reasonNote,
    scannerRuntimeSessionId: params.scannerRuntimeSessionId,
    deviceId: params.deviceId,
    membershipStateBefore,
    membershipStateAfter: restoreSnapshot,
    metadata: {
      source: params.source,
      originalEventType: originalEvent.type,
    },
    createdAt: now,
  });

  await ctx.db.patch(originalEvent._id, {
    reversalEventId,
  });

  const updatedMembership = await ctx.db.get(membership._id);
  if (!updatedMembership) {
    throw new Error('MEMBERSHIP_NOT_FOUND');
  }
  const reversalEvent = await ctx.db.get(reversalEventId);

  return {
    idempotent: false,
    reversalEvent,
    membership: updatedMembership,
    program,
  };
}

async function resolveScanSessionCommit(
  ctx: any,
  args: {
    scanSessionId: Id<'scanSessions'>;
    expectedAction: 'stamp' | 'redeem';
  }
) {
  const session = await ctx.db.get(args.scanSessionId);
  if (!session) {
    throw new Error('INVALID_SCAN_SESSION');
  }

  const { actor } = await requireActorIsStaffForBusiness(
    ctx,
    session.businessId
  );
  if (String(actor._id) !== String(session.actorUserId)) {
    throw new Error('NOT_AUTHORIZED');
  }

  if (session.actionType !== args.expectedAction) {
    throw new Error('INVALID_SCAN_ACTION');
  }

  if (session.status === 'committed') {
    return session.result;
  }
  if (session.status === 'failed_business') {
    throw new Error(session.failedCode ?? 'SCAN_SESSION_FAILED');
  }
  if (session.status === 'expired') {
    throw new Error('SCAN_SESSION_EXPIRED');
  }

  const now = Date.now();
  if (now > session.expiresAt || now > session.tokenExpiresAt) {
    await ctx.db.patch(session._id, {
      status: 'expired',
      failedCode:
        now > session.tokenExpiresAt ? 'EXPIRED_TOKEN' : 'SCAN_SESSION_EXPIRED',
    });
    throw new Error(
      now > session.tokenExpiresAt ? 'EXPIRED_TOKEN' : 'SCAN_SESSION_EXPIRED'
    );
  }

  const { program } = await requireScannerEligibleProgram(
    ctx,
    session.businessId,
    session.programId
  );

  const tokenIdentity = {
    customerId: String(session.customerId),
    signature: session.tokenSignature,
    nonce: session.tokenNonce ?? null,
    issuedAt: session.tokenIssuedAt,
    expiresAt: session.tokenExpiresAt,
    version: session.tokenVersion === 2 ? 2 : 1,
  } as const;

  const existingUsage = await findConsumedTokenEvent(ctx, tokenIdentity);
  if (existingUsage) {
    await ctx.db.patch(session._id, {
      status: 'failed_business',
      failedCode: 'TOKEN_ALREADY_USED',
    });
    throw new Error('TOKEN_ALREADY_USED');
  }

  try {
    const result =
      args.expectedAction === 'stamp'
        ? await applyStamp(ctx, {
            actorUserId: actor._id,
            businessId: session.businessId,
            program,
            customerUserId: session.customerId,
            source: 'scanner_commit',
            scannerRuntimeSessionId: session.scannerRuntimeSessionId,
            deviceId: session.deviceId,
          })
        : await applyRedeem(ctx, {
            actorUserId: actor._id,
            businessId: session.businessId,
            program,
            customerUserId: session.customerId,
            source: 'scanner_commit',
            scannerRuntimeSessionId: session.scannerRuntimeSessionId,
            deviceId: session.deviceId,
          });

    await consumeTokenEvent(ctx, {
      businessId: session.businessId,
      programId: session.programId,
      customerId: session.customerId,
      actorUserId: actor._id,
      actionType: args.expectedAction,
      membershipId:
        (result?.membershipId as Id<'memberships'> | undefined) ?? null,
      scanSessionId: session._id,
      tokenIdentity,
    });

    await ctx.db.patch(session._id, {
      status: 'committed',
      failedCode: undefined,
      result: {
        ...result,
        undoAvailableUntil: result.eventCreatedAt + UNDO_WINDOW_MS,
      },
      committedAt: Date.now(),
    });

    return {
      ...result,
      undoAvailableUntil: result.eventCreatedAt + UNDO_WINDOW_MS,
    };
  } catch (error) {
    const code = toErrorCode(error);
    if (COMMIT_BUSINESS_ERROR_CODES.has(code)) {
      await ctx.db.patch(session._id, {
        status: 'failed_business',
        failedCode: code,
      });
      if (ENTITLEMENT_ERROR_CODES.has(code)) {
        throw new ConvexError(
          buildEntitlementErrorPayload(error, {
            code,
            businessId: session.businessId,
          })
        );
      }
      throw new Error(code);
    }
    throw error;
  }
}

export const myBusinesses = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getCurrentUserOrNull(ctx);
    if (!actor) {
      return [];
    }

    const staffEntries = await ctx.db
      .query('businessStaff')
      .withIndex('by_userId', (q: any) => q.eq('userId', actor._id))
      .collect();

    const businesses: Array<BusinessForStaff | null> = await Promise.all(
      staffEntries.map(async (staff): Promise<BusinessForStaff | null> => {
        if (getBusinessStaffStatus(staff) !== 'active') {
          return null;
        }
        const business = await ctx.db.get(staff.businessId);
        if (!business || business.isActive !== true) {
          return null;
        }
        return {
          businessId: business._id,
          name: business.name,
          externalId: business.externalId,
          businessPublicId: business.businessPublicId ?? null,
          joinCode: business.joinCode ?? null,
          logoUrl: business.logoUrl ?? null,
          colors: business.colors ?? null,
          staffRole: staff.staffRole,
          capabilities: getRoleCapabilities(staff.staffRole),
        };
      })
    );

    return businesses.filter(
      (business): business is BusinessForStaff => business !== null
    );
  },
});

export const createScanToken = mutation({
  args: {
    membershipId: v.id('memberships'),
  },
  handler: async (ctx, { membershipId }) => {
    const user = await requireCurrentUser(ctx);
    const membership = await ctx.db.get(membershipId);
    if (
      !membership ||
      membership.userId !== user._id ||
      membership.isActive !== true
    ) {
      throw new Error('MEMBERSHIP_NOT_FOUND');
    }

    await requireBusinessAndProgram(
      ctx,
      membership.businessId,
      membership.programId
    );

    const { scanToken, payload } = await buildScanToken(user._id);
    const tokenIdentity = getScanTokenIdentity(payload);
    return {
      scanToken,
      customerId: tokenIdentity.customerId,
      issuedAt: tokenIdentity.issuedAt,
      expiresAt: tokenIdentity.expiresAt,
      signature: tokenIdentity.signature,
      nonce: tokenIdentity.nonce,
      tokenVersion: tokenIdentity.version,
    };
  },
});

export const createCustomerScanToken = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    if (user.isActive !== true) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }

    const { scanToken, payload } = await buildScanToken(user._id);
    const tokenIdentity = getScanTokenIdentity(payload);
    return {
      scanToken,
      customerId: tokenIdentity.customerId,
      issuedAt: tokenIdentity.issuedAt,
      expiresAt: tokenIdentity.expiresAt,
      signature: tokenIdentity.signature,
      nonce: tokenIdentity.nonce,
      tokenVersion: tokenIdentity.version,
    };
  },
});

export const resolveScan = mutation({
  args: {
    qrData: v.string(),
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    scannerRuntimeSessionId: v.string(),
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireActorIsStaffForBusiness(
      ctx,
      args.businessId
    );

    const { program } = await requireScannerEligibleProgram(
      ctx,
      args.businessId,
      args.programId
    );

    const normalizedQrData = args.qrData.trim();
    let tokenPayload: ScanTokenPayload;
    try {
      tokenPayload = parseScanToken(normalizedQrData);
    } catch {
      throw new Error('INVALID_QR');
    }

    try {
      await assertScanTokenSignature(tokenPayload);
    } catch {
      throw new Error('INVALID_QR');
    }

    if (isScanTokenExpired(tokenPayload)) {
      throw new Error('EXPIRED_TOKEN');
    }

    const tokenIdentity = getScanTokenIdentity(tokenPayload);
    const existingUsage = await findConsumedTokenEvent(ctx, tokenIdentity);
    if (existingUsage) {
      throw new Error('TOKEN_ALREADY_USED');
    }

    const customerUserId = tokenIdentity.customerId as Id<'users'>;
    const customer = await ctx.db.get(customerUserId);
    if (!customer || customer.isActive !== true) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }

    const businessMemberships = await getMembershipsForBusiness(
      ctx,
      customer._id,
      args.businessId
    );
    const membership =
      businessMemberships.find(
        (entry: any) => String(entry.programId) === String(program._id)
      ) ?? null;
    const canRedeemNow =
      membership !== null && membership.currentStamps >= program.maxStamps;

    let resolution: ResolveScanOutcome;
    if (membership) {
      resolution = canRedeemNow ? 'REDEEM_AVAILABLE' : 'AUTO_STAMP';
    } else if (program.allowPosEnroll === false) {
      throw new Error('POS_ENROLL_DISABLED');
    } else {
      resolution = 'JOIN_AND_STAMP';
    }

    const actionType = resolution === 'REDEEM_AVAILABLE' ? 'redeem' : 'stamp';

    const now = Date.now();
    const sessionExpiresAt = Math.min(
      tokenIdentity.expiresAt,
      now + SCAN_SESSION_VALID_MS
    );
    const scanSessionId = await ctx.db.insert('scanSessions', {
      businessId: args.businessId,
      programId: args.programId,
      customerId: customer._id,
      actorUserId: actor._id,
      scannerRuntimeSessionId: args.scannerRuntimeSessionId,
      deviceId: args.deviceId,
      actionType,
      tokenVersion: tokenIdentity.version,
      tokenSignature: tokenIdentity.signature,
      tokenNonce: tokenIdentity.nonce ?? undefined,
      tokenIssuedAt: tokenIdentity.issuedAt,
      tokenExpiresAt: tokenIdentity.expiresAt,
      resolvedMembershipId: membership?._id ?? undefined,
      status: 'ready',
      failedCode: undefined,
      result: undefined,
      createdAt: now,
      expiresAt: sessionExpiresAt,
      committedAt: undefined,
    });

    return {
      scanSessionId,
      sessionExpiresAt,
      customerUserId: customer._id,
      customerDisplayName: buildCustomerDisplayName(customer),
      membership: buildMembershipSummary(membership, program.maxStamps),
      resolution,
    };
  },
});

export const commitStamp = mutation({
  args: {
    scanSessionId: v.id('scanSessions'),
  },
  handler: async (ctx, { scanSessionId }) => {
    return await resolveScanSessionCommit(ctx, {
      scanSessionId,
      expectedAction: 'stamp',
    });
  },
});

export const commitRedeem = mutation({
  args: {
    scanSessionId: v.id('scanSessions'),
  },
  handler: async (ctx, { scanSessionId }) => {
    return await resolveScanSessionCommit(ctx, {
      scanSessionId,
      expectedAction: 'redeem',
    });
  },
});

export const undoLastScannerAction = mutation({
  args: {
    eventId: v.id('events'),
    scannerRuntimeSessionId: v.string(),
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const targetEvent = await ctx.db.get(args.eventId);
    if (!targetEvent) {
      throw new Error('EVENT_NOT_FOUND');
    }
    if (!isReversibleEventType(targetEvent.type)) {
      throw new Error('EVENT_NOT_REVERSIBLE');
    }
    if (targetEvent.source !== 'scanner_commit') {
      throw new Error('UNDO_NOT_ALLOWED');
    }

    const { actor } = await requireActorIsStaffForBusiness(
      ctx,
      targetEvent.businessId
    );
    if (String(actor._id) !== String(targetEvent.actorUserId)) {
      throw new Error('UNDO_PERMISSION_DENIED');
    }

    if (
      targetEvent.scannerRuntimeSessionId !== args.scannerRuntimeSessionId ||
      targetEvent.deviceId !== args.deviceId
    ) {
      throw new Error('UNDO_SESSION_MISMATCH');
    }

    const existingReversal = await getExistingReversalForOriginalEvent(
      ctx,
      targetEvent
    );
    if (existingReversal) {
      const membership = await loadMembershipForEventOrThrow(ctx, targetEvent);
      const program = await ctx.db.get(targetEvent.programId);
      if (!program) {
        throw new Error('PROGRAM_NOT_FOUND');
      }
      return {
        status: 'already_reverted' as const,
        reversalEventId: existingReversal._id,
        membership: buildMembershipSummary(membership, program.maxStamps),
        program: buildProgramSummary(program),
      };
    }

    if (Date.now() - targetEvent.createdAt > UNDO_WINDOW_MS) {
      throw new Error('UNDO_EXPIRED');
    }

    const membership = await loadMembershipForEventOrThrow(ctx, targetEvent);

    const latestMembershipEvent = await getLatestBalanceEventForMembership(
      ctx,
      membership._id
    );
    if (
      !latestMembershipEvent ||
      String(latestMembershipEvent._id) !== String(targetEvent._id)
    ) {
      throw new Error('UNDO_NOT_LAST_MEMBERSHIP_EVENT');
    }

    const latestSessionEvent = await getLatestSessionCommitEvent(
      ctx,
      args.scannerRuntimeSessionId
    );
    if (
      !latestSessionEvent ||
      String(latestSessionEvent._id) !== String(args.eventId)
    ) {
      throw new Error('UNDO_NOT_LAST_SESSION_EVENT');
    }

    const hasNewerScan = await hasNewerScanInRuntimeSession(ctx, {
      scannerRuntimeSessionId: args.scannerRuntimeSessionId,
      createdAfter: targetEvent.createdAt,
      actorUserId: actor._id,
      businessId: targetEvent.businessId,
    });
    if (hasNewerScan) {
      throw new Error('UNDO_SESSION_CONTINUITY_BROKEN');
    }

    if (targetEvent.type === 'REWARD_REDEEMED' && !ALLOW_REDEEM_UNDO) {
      throw new Error('UNDO_REDEEM_DISABLED');
    }

    const reversalResult = await createReversalForEvent(ctx, {
      originalEvent: targetEvent,
      actorUserId: actor._id,
      source: 'scanner_undo',
      scannerRuntimeSessionId: args.scannerRuntimeSessionId,
      deviceId: args.deviceId,
    });

    return {
      status: reversalResult.idempotent
        ? ('already_reverted' as const)
        : ('reverted' as const),
      reversalEventId: reversalResult.reversalEvent?._id ?? null,
      membership: buildMembershipSummary(
        reversalResult.membership,
        reversalResult.program.maxStamps
      ),
      program: buildProgramSummary(reversalResult.program),
    };
  },
});

/**
 * Legacy endpoint kept for migration safety.
 * New scanner flow should use resolveScan + commitStamp.
 */
export const addStamp = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    customerUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireActorIsStaffForBusiness(
      ctx,
      args.businessId
    );
    const { program } = await requireScannerEligibleProgram(
      ctx,
      args.businessId,
      args.programId
    );

    const result = await applyStamp(ctx, {
      actorUserId: actor._id,
      businessId: args.businessId,
      program,
      customerUserId: args.customerUserId,
      source: 'scanner_commit',
    });

    return {
      membershipId: result.membershipId,
      currentStamps: result.currentStamps,
      maxStamps: result.maxStamps,
      canRedeemNow: result.canRedeemNow,
    };
  },
});

/**
 * Legacy endpoint kept for migration safety.
 * New scanner flow should use resolveScan + commitRedeem.
 */
export const redeemReward = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    customerUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const { actor } = await requireActorIsStaffForBusiness(
      ctx,
      args.businessId
    );
    const { program } = await requireScannerEligibleProgram(
      ctx,
      args.businessId,
      args.programId
    );

    const result = await applyRedeem(ctx, {
      actorUserId: actor._id,
      businessId: args.businessId,
      program,
      customerUserId: args.customerUserId,
      source: 'scanner_commit',
    });

    return {
      membershipId: result.membershipId,
      currentStamps: result.currentStamps,
      maxStamps: result.maxStamps,
      canRedeemNow: result.canRedeemNow,
      redeemedAt: result.redeemedAt,
    };
  },
});
