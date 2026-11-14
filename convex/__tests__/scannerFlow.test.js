import { describe, expect, test } from 'bun:test';
import { joinSelectedPrograms } from '../memberships';
import {
  commitCompletedStampRedeem,
  commitRedeem,
  commitStamp,
  myBusinesses,
  resolveScan,
  undoLastScannerAction,
} from '../scanner';
import { buildScanToken } from '../scanTokens';

process.env.SCAN_TOKEN_SECRET = process.env.SCAN_TOKEN_SECRET || 'test-secret';
process.env.SCAN_TOKEN_KID = process.env.SCAN_TOKEN_KID || 'test-kid';

import {
  baseTables,
  buildBusiness,
  buildCtx,
  buildProgram,
} from './helpers/scannerFixtures';

async function createToken() {
  const { scanToken } = await buildScanToken('customer_1');
  return scanToken;
}

describe('scanner flow', () => {
  test('resolve, commit, and undo require active scanner access', async () => {
    const unauthorizedTables = baseTables({ businessStaff: [] });
    const unauthorizedCtx = buildCtx(unauthorizedTables);

    await expect(
      resolveScan._handler(unauthorizedCtx, {
        qrData: await createToken(),
        businessId: 'business_1',
        programId: 'program_1',
        scannerRuntimeSessionId: 'runtime_unauthorized',
        deviceId: 'device_unauthorized',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');

    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_authorization',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);
    const resolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_authorization',
      deviceId: 'device_authorization',
    });
    const staffLink = ctx.db.rows('businessStaff')[0];

    staffLink.isActive = false;
    await expect(
      commitStamp._handler(ctx, { scanSessionId: resolved.scanSessionId })
    ).rejects.toThrow('NOT_AUTHORIZED');

    staffLink.isActive = true;
    await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    const targetEvent = ctx.db
      .rows('events')
      .find((event) => event.type === 'STAMP_ADDED');

    staffLink.isActive = false;
    await expect(
      undoLastScannerAction._handler(ctx, {
        eventId: targetEvent._id,
        scannerRuntimeSessionId: 'runtime_authorization',
        deviceId: 'device_authorization',
      })
    ).rejects.toThrow('NOT_AUTHORIZED');
  });

  test('closed business is absent operationally and rejects joins and scanner writes', async () => {
    const now = Date.now();
    const tables = baseTables({
      businesses: [buildBusiness({ isActive: false, closedAt: now })],
      scanSessions: [
        {
          _id: 'scan_session_stamp_closed',
          actorUserId: 'staff_1',
          businessId: 'business_1',
          programId: 'program_1',
          actionType: 'stamp',
          status: 'ready',
          expiresAt: now + 60_000,
          createdAt: now,
        },
        {
          _id: 'scan_session_redeem_closed',
          actorUserId: 'staff_1',
          businessId: 'business_1',
          programId: 'program_1',
          actionType: 'redeem',
          status: 'ready',
          expiresAt: now + 60_000,
          createdAt: now,
        },
      ],
    });
    const staffCtx = buildCtx(tables);
    const customerCtx = buildCtx(tables, 'customer_1');

    expect(await myBusinesses._handler(staffCtx, {})).toEqual([]);
    await expect(
      joinSelectedPrograms._handler(customerCtx, {
        businessId: 'business_1',
        programIds: ['program_1'],
      })
    ).rejects.toThrow('BUSINESS_CLOSED');
    await expect(
      resolveScan._handler(staffCtx, {
        qrData: 'closed-business-token',
        businessId: 'business_1',
        programId: 'program_1',
        scannerRuntimeSessionId: 'runtime_closed',
        deviceId: 'device_closed',
      })
    ).rejects.toThrow('BUSINESS_CLOSED');
    await expect(
      commitStamp._handler(staffCtx, {
        scanSessionId: 'scan_session_stamp_closed',
      })
    ).rejects.toThrow('BUSINESS_CLOSED');
    await expect(
      commitRedeem._handler(staffCtx, {
        scanSessionId: 'scan_session_redeem_closed',
      })
    ).rejects.toThrow('BUSINESS_CLOSED');
  });

  test('resolve does not consume token, commit consumes and is idempotent on retry', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);
    const qrData = await createToken();

    const resolved = await resolveScan._handler(ctx, {
      qrData,
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });

    expect(typeof resolved.scanSessionId).toBe('string');
    expect(resolved.resolution).toBe('AUTO_STAMP');
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(0);

    const committed = await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(committed.currentStamps).toBe(3);
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(1);

    const committedAgain = await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(committedAgain).toEqual(committed);
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(1);

    const session = ctx.db.rows('scanSessions')[0];
    expect(session.status).toBe('committed');
  });

  test('technical commit failure keeps session ready and supports retry on same session', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 4,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);
    const qrData = await createToken();

    const resolved = await resolveScan._handler(ctx, {
      qrData,
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    expect(resolved.resolution).toBe('AUTO_STAMP');

    ctx.db.failNextScanTokenLookup = true;
    await expect(
      commitStamp._handler(ctx, {
        scanSessionId: resolved.scanSessionId,
      })
    ).rejects.toThrow('TRANSIENT_DB_ERROR');

    const sessionAfterFailure = ctx.db.rows('scanSessions')[0];
    expect(sessionAfterFailure.status).toBe('ready');
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(0);

    const committed = await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(committed.currentStamps).toBe(5);
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(1);
    expect(ctx.db.rows('scanSessions')[0].status).toBe('committed');
  });

  test('resolve returns JOIN_AND_STAMP for non-member and commitStamp creates membership', async () => {
    const tables = baseTables();
    const ctx = buildCtx(tables);
    const qrData = await createToken();

    const resolved = await resolveScan._handler(ctx, {
      qrData,
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });

    expect(resolved.resolution).toBe('JOIN_AND_STAMP');
    expect(resolved.membership).toBeNull();

    const committed = await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(committed.currentStamps).toBe(1);
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(1);
  });

  test('resolve blocks enrollment when customer is not a member and POS enroll is disabled', async () => {
    const tables = baseTables({
      loyaltyPrograms: [buildProgram({ allowPosEnroll: false })],
    });
    const ctx = buildCtx(tables);
    const qrData = await createToken();

    await expect(
      resolveScan._handler(ctx, {
        qrData,
        businessId: 'business_1',
        programId: 'program_1',
        scannerRuntimeSessionId: 'runtime_1',
        deviceId: 'device_1',
      })
    ).rejects.toThrow('POS_ENROLL_DISABLED');

    expect(ctx.db.rows('scanSessions')).toHaveLength(0);
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(0);
  });

  test('entitlement failure is terminal business failure and does not consume token', async () => {
    const now = Date.now();
    const membershipsAtLimit = Array.from({ length: 250 }, (_, index) => ({
      _id: `membership_limit_${index + 1}`,
      userId: `customer_limit_${index + 1}`,
      businessId: 'business_1',
      programId: 'program_1',
      currentStamps: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));

    const tables = baseTables({
      memberships: membershipsAtLimit,
    });
    const ctx = buildCtx(tables);
    const qrData = await createToken();

    const resolved = await resolveScan._handler(ctx, {
      qrData,
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });

    await expect(
      commitStamp._handler(ctx, {
        scanSessionId: resolved.scanSessionId,
      })
    ).rejects.toThrow();

    const session = ctx.db.rows('scanSessions')[0];
    expect(session.status).toBe('failed_business');
    expect(session.failedCode).toBe('PLAN_LIMIT_REACHED');
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(0);
  });

  test('undo within 30s reverts exactly once and duplicate undo is idempotent', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);

    const resolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    const commitResult = await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(commitResult.currentStamps).toBe(3);

    const targetEvent = ctx.db
      .rows('events')
      .find((event) => event.type === 'STAMP_ADDED');
    expect(targetEvent).toBeDefined();

    const undoResult = await undoLastScannerAction._handler(ctx, {
      eventId: targetEvent._id,
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    expect(undoResult.status).toBe('reverted');
    expect(undoResult.membership.currentStamps).toBe(2);

    const duplicateUndo = await undoLastScannerAction._handler(ctx, {
      eventId: targetEvent._id,
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    expect(duplicateUndo.status).toBe('already_reverted');
    expect(
      ctx.db
        .rows('events')
        .filter((event) => event.revertsEventId === targetEvent._id)
    ).toHaveLength(1);
  });

  test('undo after 30s fails', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);

    const resolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });

    const targetEvent = ctx.db
      .rows('events')
      .find((event) => event.type === 'STAMP_ADDED');
    targetEvent.createdAt = Date.now() - 31_000;

    await expect(
      undoLastScannerAction._handler(ctx, {
        eventId: targetEvent._id,
        scannerRuntimeSessionId: 'runtime_1',
        deviceId: 'device_1',
      })
    ).rejects.toThrow('UNDO_EXPIRED');
  });

  test('undo after a new scan starts fails', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);

    const resolvedFirst = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    await commitStamp._handler(ctx, {
      scanSessionId: resolvedFirst.scanSessionId,
    });
    const targetEvent = ctx.db
      .rows('events')
      .find((event) => event.type === 'STAMP_ADDED');
    const membershipRow = ctx.db
      .rows('memberships')
      .find((membership) => membership._id === 'membership_1');
    membershipRow.lastStampAt = Date.now() - 61_000;

    await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });

    await expect(
      undoLastScannerAction._handler(ctx, {
        eventId: targetEvent._id,
        scannerRuntimeSessionId: 'runtime_1',
        deviceId: 'device_1',
      })
    ).rejects.toThrow('UNDO_SESSION_CONTINUITY_BROKEN');
  });

  test('undo remains blocked after the stamp grants a referral reward', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);
    const resolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_referral_undo',
      deviceId: 'device_referral_undo',
    });
    const committed = await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    ctx.db.rows('customerReferrals').push({
      _id: 'referral_completed',
      businessId: 'business_1',
      qualificationEventId: committed.eventId,
      status: 'completed',
      rewardGrantStatus: 'granted',
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      undoLastScannerAction._handler(ctx, {
        eventId: committed.eventId,
        scannerRuntimeSessionId: 'runtime_referral_undo',
        deviceId: 'device_referral_undo',
      })
    ).rejects.toThrow('UNDO_BLOCKED_REFERRAL_REWARD');
  });

  test('undo fails when a newer membership balance event exists', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 2,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = buildCtx(tables);

    const firstResolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    await commitStamp._handler(ctx, {
      scanSessionId: firstResolved.scanSessionId,
    });
    const firstEvent = ctx.db
      .rows('events')
      .find((event) => event.type === 'STAMP_ADDED');
    const membershipRow = ctx.db
      .rows('memberships')
      .find((membership) => membership._id === 'membership_1');
    membershipRow.lastStampAt = Date.now() - 61_000;

    const secondResolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    await commitStamp._handler(ctx, {
      scanSessionId: secondResolved.scanSessionId,
    });

    await expect(
      undoLastScannerAction._handler(ctx, {
        eventId: firstEvent._id,
        scannerRuntimeSessionId: 'runtime_1',
        deviceId: 'device_1',
      })
    ).rejects.toThrow('UNDO_NOT_LAST_MEMBERSHIP_EVENT');
  });

  test('undo supports redeem events', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 10,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          lastStampAt: now - 60_000,
        },
      ],
    });
    const ctx = buildCtx(tables);

    const resolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    expect(resolved.resolution).toBe('REDEEM_AVAILABLE');

    await expect(
      commitStamp._handler(ctx, {
        scanSessionId: resolved.scanSessionId,
      })
    ).rejects.toThrow('INVALID_SCAN_ACTION');

    const committed = await commitRedeem._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(committed.currentStamps).toBe(0);

    const redeemEvent = ctx.db
      .rows('events')
      .find((event) => event.type === 'REWARD_REDEEMED');
    expect(ctx.db.rows('redemptionCelebrationReceipts')).toHaveLength(1);
    expect(ctx.db.rows('redemptionCelebrationReceipts')[0].ownerUserId).toBe(
      'customer_1'
    );
    const undo = await undoLastScannerAction._handler(ctx, {
      eventId: redeemEvent._id,
      scannerRuntimeSessionId: 'runtime_1',
      deviceId: 'device_1',
    });
    expect(undo.status).toBe('reverted');
    expect(undo.membership.currentStamps).toBe(10);
    expect(ctx.db.rows('redemptionCelebrationReceipts')[0].status).toBe(
      'revoked'
    );
  });

  test('a final stamp authorizes one idempotent redemption without another QR scan', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 9,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          lastStampAt: now - 60_000,
        },
      ],
    });
    const ctx = buildCtx(tables);
    const resolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_final_stamp',
      deviceId: 'device_final_stamp',
    });

    const stamped = await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(stamped.currentStamps).toBe(10);
    expect(stamped.canRedeemNow).toBe(true);
    expect(stamped.redemptionContinuationAvailableUntil).toBeGreaterThan(now);

    await expect(
      commitRedeem._handler(ctx, {
        scanSessionId: resolved.scanSessionId,
      })
    ).rejects.toThrow('INVALID_SCAN_ACTION');

    const redeemed = await commitCompletedStampRedeem._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(redeemed.currentStamps).toBe(0);
    expect(redeemed.eventType).toBe('REWARD_REDEEMED');
    expect(ctx.db.rows('scanSessions')).toHaveLength(1);
    expect(ctx.db.rows('scanTokenEvents')).toHaveLength(1);
    expect(
      ctx.db.rows('events').filter((event) => event.type === 'REWARD_REDEEMED')
    ).toHaveLength(1);
    expect(ctx.db.rows('redemptionCelebrationReceipts')).toHaveLength(1);
    expect(ctx.db.rows('redemptionCelebrationReceipts')[0].ownerUserId).toBe(
      'customer_1'
    );

    const replayed = await commitCompletedStampRedeem._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });
    expect(replayed).toEqual(redeemed);
    expect(
      ctx.db.rows('events').filter((event) => event.type === 'REWARD_REDEEMED')
    ).toHaveLength(1);
    expect(ctx.db.rows('redemptionCelebrationReceipts')).toHaveLength(1);

    const undo = await undoLastScannerAction._handler(ctx, {
      eventId: redeemed.eventId,
      scannerRuntimeSessionId: 'runtime_final_stamp',
      deviceId: 'device_final_stamp',
    });
    expect(undo.status).toBe('reverted');
    expect(undo.membership.currentStamps).toBe(10);
    expect(ctx.db.rows('redemptionCelebrationReceipts')[0].status).toBe(
      'revoked'
    );
  });

  test('the completing stamp remains undoable before redemption continuation', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 9,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          lastStampAt: now - 60_000,
        },
      ],
    });
    const ctx = buildCtx(tables);
    const resolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_final_stamp_undo',
      deviceId: 'device_final_stamp_undo',
    });
    const stamped = await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });

    const undo = await undoLastScannerAction._handler(ctx, {
      eventId: stamped.eventId,
      scannerRuntimeSessionId: 'runtime_final_stamp_undo',
      deviceId: 'device_final_stamp_undo',
    });
    expect(undo.status).toBe('reverted');
    expect(undo.membership.currentStamps).toBe(9);

    await expect(
      commitCompletedStampRedeem._handler(ctx, {
        scanSessionId: resolved.scanSessionId,
      })
    ).rejects.toThrow('NOT_ENOUGH_STAMPS');
    expect(
      ctx.db.rows('events').filter((event) => event.type === 'REWARD_REDEEMED')
    ).toHaveLength(0);
  });

  test('same-scan redemption independently verifies its bound transaction identities', async () => {
    async function createCompletedStamp() {
      const now = Date.now();
      const tables = baseTables({
        memberships: [
          {
            _id: 'membership_1',
            userId: 'customer_1',
            businessId: 'business_1',
            programId: 'program_1',
            currentStamps: 9,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            lastStampAt: now - 60_000,
          },
        ],
      });
      const ctx = buildCtx(tables);
      const resolved = await resolveScan._handler(ctx, {
        qrData: await createToken(),
        businessId: 'business_1',
        programId: 'program_1',
        scannerRuntimeSessionId: `runtime_bound_${Math.random()}`,
        deviceId: 'device_bound',
      });
      await commitStamp._handler(ctx, {
        scanSessionId: resolved.scanSessionId,
      });
      return { ctx, scanSessionId: resolved.scanSessionId };
    }

    const wrongMembership = await createCompletedStamp();
    wrongMembership.ctx.db.rows('scanSessions')[0].result.membershipId =
      'membership_other';
    await expect(
      commitCompletedStampRedeem._handler(wrongMembership.ctx, {
        scanSessionId: wrongMembership.scanSessionId,
      })
    ).rejects.toThrow('INVALID_SCAN_SESSION');

    const wrongCustomer = await createCompletedStamp();
    wrongCustomer.ctx.db.rows('scanSessions')[0].customerId = 'customer_other';
    await expect(
      commitCompletedStampRedeem._handler(wrongCustomer.ctx, {
        scanSessionId: wrongCustomer.scanSessionId,
      })
    ).rejects.toThrow('INVALID_SCAN_SESSION');

    const wrongProgram = await createCompletedStamp();
    wrongProgram.ctx.db
      .rows('loyaltyPrograms')
      .push(buildProgram({ _id: 'program_other' }));
    wrongProgram.ctx.db.rows('scanSessions')[0].programId = 'program_other';
    await expect(
      commitCompletedStampRedeem._handler(wrongProgram.ctx, {
        scanSessionId: wrongProgram.scanSessionId,
      })
    ).rejects.toThrow('INVALID_SCAN_SESSION');

    const crossBusiness = await createCompletedStamp();
    crossBusiness.ctx.db
      .rows('businesses')
      .push(buildBusiness({ _id: 'business_other' }));
    crossBusiness.ctx.db.rows('businessStaff').push({
      _id: 'staff_link_other',
      businessId: 'business_other',
      userId: 'staff_1',
      staffRole: 'owner',
      isActive: true,
      createdAt: Date.now(),
    });
    crossBusiness.ctx.db.rows('scanSessions')[0].businessId = 'business_other';
    await expect(
      commitCompletedStampRedeem._handler(crossBusiness.ctx, {
        scanSessionId: crossBusiness.scanSessionId,
      })
    ).rejects.toThrow();
  });

  test('same-scan redemption expires server-side and never trusts a stale full balance', async () => {
    const now = Date.now();
    const tables = baseTables({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          businessId: 'business_1',
          programId: 'program_1',
          currentStamps: 9,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          lastStampAt: now - 60_000,
        },
      ],
    });
    const ctx = buildCtx(tables);
    const resolved = await resolveScan._handler(ctx, {
      qrData: await createToken(),
      businessId: 'business_1',
      programId: 'program_1',
      scannerRuntimeSessionId: 'runtime_expired_continuation',
      deviceId: 'device_expired_continuation',
    });
    await commitStamp._handler(ctx, {
      scanSessionId: resolved.scanSessionId,
    });

    ctx.db.rows('scanSessions')[0].result.redemptionContinuationAvailableUntil =
      Date.now() - 1;
    await expect(
      commitCompletedStampRedeem._handler(ctx, {
        scanSessionId: resolved.scanSessionId,
      })
    ).rejects.toThrow('SCAN_SESSION_EXPIRED');

    ctx.db.rows('scanSessions')[0].result.redemptionContinuationAvailableUntil =
      Date.now() + 30_000;
    ctx.db.rows('memberships')[0].currentStamps = 8;
    await expect(
      commitCompletedStampRedeem._handler(ctx, {
        scanSessionId: resolved.scanSessionId,
      })
    ).rejects.toThrow('NOT_ENOUGH_STAMPS');
  });
});
