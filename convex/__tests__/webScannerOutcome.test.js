import { describe, expect, test } from 'bun:test';
import {
  commitCompletedStampRedeem,
  commitStamp,
  resolveScan,
  undoLastScannerAction,
} from '../scanner';
import { buildScanToken } from '../scanTokens';
import { getOutcome } from '../webScanner';
import { baseTables, buildCtx, buildProgram } from './helpers/scannerFixtures';

process.env.SCAN_TOKEN_SECRET ||= 'test-secret';
process.env.SCAN_TOKEN_KID ||= 'test-kid';
const args = {
  businessId: 'business_1',
  programId: 'program_1',
  runtimeId: 'runtime',
  deviceId: 'device',
  operation: 'probe',
};
async function resolvedFixture(stamps = 0) {
  const tables = baseTables({
    memberships: [
      {
        _id: 'member',
        businessId: 'business_1',
        programId: 'program_1',
        userId: 'customer_1',
        currentStamps: stamps,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  });
  const ctx = buildCtx(tables);
  const token = await buildScanToken('customer_1');
  const session = await resolveScan._handler(ctx, {
    qrData: token.scanToken,
    businessId: args.businessId,
    programId: args.programId,
    scannerRuntimeSessionId: args.runtimeId,
    deviceId: args.deviceId,
  });
  return { tables, ctx, session };
}
describe('additive reconciliation query against real handlers', () => {
  test('authenticated business scoped probe; no DB writes', async () => {
    const tables = baseTables();
    const before = JSON.stringify(tables);
    const result = await getOutcome._handler(buildCtx(tables), args);
    expect(result.status).toBe('AUTHORIZED');
    expect(JSON.stringify(tables)).toBe(before);
  });
  test.each([
    null,
    'customer_1',
    'other_actor',
  ])('unauthorized direct query %s is rejected', async (actor) => {
    await expect(
      getOutcome._handler(buildCtx(baseTables(), actor), args)
    ).rejects.toThrow();
  });
  test('suspended staff cannot probe/reconcile', async () => {
    const tables = baseTables();
    tables.businessStaff[0].status = 'suspended';
    await expect(getOutcome._handler(buildCtx(tables), args)).rejects.toThrow(
      'NOT_AUTHORIZED'
    );
  });
  test('unavailable program is not authorized to create a command', async () => {
    expect(
      (
        await getOutcome._handler(
          buildCtx(
            baseTables({ loyaltyPrograms: [buildProgram({ isActive: false })] })
          ),
          args
        )
      ).status
    ).toBe('UNAVAILABLE');
  });
  test('lost resolve response discovers original session without exposing token', async () => {
    const f = await resolvedFixture();
    const o = await getOutcome._handler(f.ctx, {
      ...args,
      operation: 'resolve',
    });
    expect(o.receipt.scanSessionId).toBe(f.session.scanSessionId);
    expect(JSON.stringify(o)).not.toMatch(/tokenSignature|tokenNonce|qrData/);
  });
  test('foreign runtime/device/business cannot read a session', async () => {
    const f = await resolvedFixture();
    for (const delta of [
      { deviceId: 'other' },
      { runtimeId: 'other' },
      { businessId: 'other' },
    ])
      await expect(
        getOutcome._handler(f.ctx, {
          ...args,
          operation: 'stamp',
          sessionId: f.session.scanSessionId,
          ...delta,
        })
      ).rejects.toThrow();
  });
  test('ready and expired do not falsely establish failure of a sent commit', async () => {
    const f = await resolvedFixture();
    const a = {
      ...args,
      operation: 'stamp',
      sessionId: f.session.scanSessionId,
    };
    expect((await getOutcome._handler(f.ctx, a)).status).toBe('UNKNOWN');
    await f.ctx.db.patch(f.session.scanSessionId, { expiresAt: 0 });
    expect((await getOutcome._handler(f.ctx, a)).status).toBe('UNKNOWN');
  });
  test('actual stamp + repeated same-session commit yields one canonical event', async () => {
    const f = await resolvedFixture();
    const receipt = await commitStamp._handler(f.ctx, {
      scanSessionId: f.session.scanSessionId,
    });
    const again = await commitStamp._handler(f.ctx, {
      scanSessionId: f.session.scanSessionId,
    });
    expect(again.eventId).toBe(receipt.eventId);
    const o = await getOutcome._handler(f.ctx, {
      ...args,
      operation: 'stamp',
      sessionId: f.session.scanSessionId,
    });
    expect(o.status).toBe('CONFIRMED');
    expect(o.receipt.eventId).toBe(receipt.eventId);
  });
  test('completed stamp continuation has distinct receipt, not the primary stamp receipt', async () => {
    const f = await resolvedFixture(9);
    await commitStamp._handler(f.ctx, {
      scanSessionId: f.session.scanSessionId,
    });
    expect(
      (
        await getOutcome._handler(f.ctx, {
          ...args,
          operation: 'continuation',
          sessionId: f.session.scanSessionId,
        })
      ).status
    ).toBe('UNKNOWN');
    const r = await commitCompletedStampRedeem._handler(f.ctx, {
      scanSessionId: f.session.scanSessionId,
    });
    const o = await getOutcome._handler(f.ctx, {
      ...args,
      operation: 'continuation',
      sessionId: f.session.scanSessionId,
    });
    expect(o.status).toBe('CONFIRMED');
    expect(o.receipt.eventId).toBe(r.eventId);
  });
  test('actual undo confirmed via bound reversal, original stamp receipt is insufficient', async () => {
    const f = await resolvedFixture();
    const r = await commitStamp._handler(f.ctx, {
      scanSessionId: f.session.scanSessionId,
    });
    const a = {
      ...args,
      operation: 'undo',
      sessionId: f.session.scanSessionId,
      eventId: r.eventId,
    };
    expect((await getOutcome._handler(f.ctx, a)).status).toBe('UNKNOWN');
    const reversed = await undoLastScannerAction._handler(f.ctx, {
      eventId: r.eventId,
      scannerRuntimeSessionId: args.runtimeId,
      deviceId: args.deviceId,
    });
    const o = await getOutcome._handler(f.ctx, a);
    expect(o.status).toBe('CONFIRMED');
    expect(o.receipt.reversalEventId).toBe(reversed.reversalEventId);
  });
  test('referral confirmation requires recipient/actor/business/runtime/event proof', async () => {
    const f = await resolvedFixture();
    f.tables.referralRewards = [
      {
        _id: 'reward',
        businessId: 'business_1',
        recipientUserId: 'customer_1',
        status: 'redeemed',
        redeemedByUserId: 'staff_1',
        redeemedEventId: 'benefit_event',
      },
    ];
    f.tables.events.push({
      _id: 'benefit_event',
      type: 'REFERRAL_BENEFIT_REDEEMED',
      businessId: 'business_1',
      actorUserId: 'staff_1',
      scannerRuntimeSessionId: 'runtime',
      deviceId: 'device',
      metadata: { referralRewardId: 'reward' },
    });
    const a = {
      ...args,
      operation: 'referral',
      sessionId: f.session.scanSessionId,
      rewardId: 'reward',
    };
    expect((await getOutcome._handler(f.ctx, a)).status).toBe('CONFIRMED');
    f.tables.events.at(-1).scannerRuntimeSessionId = 'other';
    expect((await getOutcome._handler(f.ctx, a)).status).toBe('UNKNOWN');
  });
  test('referral redeemed without event cannot prove same scanner operation', async () => {
    const f = await resolvedFixture();
    f.tables.referralRewards = [
      {
        _id: 'reward',
        businessId: 'business_1',
        recipientUserId: 'customer_1',
        status: 'redeemed',
        redeemedByUserId: 'staff_1',
      },
    ];
    expect(
      (
        await getOutcome._handler(f.ctx, {
          ...args,
          operation: 'referral',
          sessionId: f.session.scanSessionId,
          rewardId: 'reward',
        })
      ).status
    ).toBe('UNKNOWN');
  });
  test('reload recovery never treats historical primary stamp as proof of an unknown undo', async () => {
    const f = await resolvedFixture();
    await commitStamp._handler(f.ctx, {
      scanSessionId: f.session.scanSessionId,
    });
    expect(
      (await getOutcome._handler(f.ctx, { ...args, operation: 'recovery' }))
        .status
    ).toBe('UNKNOWN');
  });
});
