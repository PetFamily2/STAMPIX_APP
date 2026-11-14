import { describe, expect, test } from 'bun:test';
import { execute, getReceipt } from '../scannerCommands';
import { baseTables, buildCtx } from './helpers/scannerFixtures';

const args = {
  operationId: 'operation',
  operation: 'resolve',
  businessId: 'business_1',
  programId: 'program_1',
  runtimeId: 'runtime',
  deviceId: 'device',
  qrData: 'memory-only-test',
};
function fixture() {
  const tables = baseTables();
  const ctx = buildCtx(tables);
  let calls = 0;
  ctx.runMutation = async () => {
    calls++;
    return {
      scanSessionId: 'session',
      sessionExpiresAt: 123,
      resolution: 'AUTO_STAMP',
    };
  };
  return { ctx, tables, calls: () => calls };
}
describe('atomic receipt wrapper authorization and binding', () => {
  test('same identity returns canonical receipt without a second business invocation', async () => {
    const f = fixture();
    const first = await execute._handler(f.ctx, args);
    expect(await execute._handler(f.ctx, args)).toEqual(first);
    expect(f.calls()).toBe(1);
    expect(JSON.stringify(f.tables.scannerCommandReceipts)).not.toMatch(
      /memory-only-test|qrData|tokenSignature/
    );
    const { qrData, ...identity } = args;
    expect((await getReceipt._handler(f.ctx, identity)).status).toBe(
      'CONFIRMED'
    );
  });
  test('absence is UNKNOWN, never definitive failure', async () => {
    const f = fixture();
    const { qrData, ...identity } = args;
    expect((await getReceipt._handler(f.ctx, identity)).status).toBe('UNKNOWN');
  });
  test.each([
    null,
    'customer_1',
    'other_actor',
  ])('unauthorized actor %s cannot invoke or reconcile', async (actor) => {
    const ctx = buildCtx(baseTables(), actor);
    const { qrData, ...identity } = args;
    await expect(execute._handler(ctx, args)).rejects.toThrow();
    await expect(getReceipt._handler(ctx, identity)).rejects.toThrow();
  });
  test('operation identity cannot change resource scope', async () => {
    const f = fixture();
    await execute._handler(f.ctx, args);
    await expect(
      execute._handler(f.ctx, { ...args, runtimeId: 'other' })
    ).rejects.toThrow('OPERATION_SCOPE_MISMATCH');
    expect(f.calls()).toBe(1);
  });
  test('failed nested mutation has a sanitized terminal receipt', async () => {
    const f = fixture();
    f.ctx.runMutation = async () => {
      throw new Error('INVALID_QR private memory-only-test');
    };
    expect(await execute._handler(f.ctx, args)).toEqual({
      commandFailureCode: 'INVALID_QR',
    });
    expect(f.tables.scannerCommandReceipts).toHaveLength(1);
    expect(JSON.stringify(f.tables.scannerCommandReceipts)).not.toContain(
      'memory-only-test'
    );
    expect(await execute._handler(f.ctx, args)).toEqual({
      commandFailureCode: 'INVALID_QR',
    });
  });
  test('eventless referral result still has a canonical durable receipt', async () => {
    const f = fixture();
    f.tables.scanSessions = [
      {
        _id: 'session',
        businessId: args.businessId,
        programId: args.programId,
        actorUserId: 'staff_1',
        customerId: 'customer_1',
        scannerRuntimeSessionId: args.runtimeId,
        deviceId: args.deviceId,
      },
    ];
    f.tables.referralRewards = [
      {
        _id: 'reward',
        businessId: args.businessId,
        recipientUserId: 'customer_1',
      },
    ];
    f.ctx.runMutation = async () => ({
      ok: true,
      rewardId: 'reward',
      status: 'redeemed',
      redeemedAt: 123,
      redeemedEventId: null,
    });
    const { qrData, ...identity } = {
      ...args,
      operation: 'referral',
      sessionId: 'session',
      rewardId: 'reward',
    };
    await execute._handler(f.ctx, identity);
    const { sessionId, rewardId, ...query } = identity;
    expect((await getReceipt._handler(f.ctx, query)).receipt.status).toBe(
      'redeemed'
    );
  });
});
