import { describe, expect, test } from 'bun:test';
import { ReceiptCommands } from '../scanner/receiptCommands';
import { NotSent } from '../web-scanner/command';

const scope = {
  actorId: 'actor',
  businessId: 'business',
  programId: 'program',
  runtimeId: 'runtime',
  deviceId: 'device',
};
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
function fixture() {
  let valid = true,
    sends = 0,
    receipt = null,
    persisted = null,
    mode = 'success';
  const identities = [],
    states = [];
  const owner = new ReceiptCommands({
    valid: () => valid,
    uuid: () => 'operation-1',
    save: async (value) => {
      persisted = value;
    },
    state: (p) => states.push(p),
    transport: {
      probe: async () => {
        if (!valid) throw new NotSent('OFFLINE');
      },
      send: async (identity, args) => {
        sends++;
        identities.push(identity);
        if (mode === 'before') throw new Error('NETWORK');
        receipt =
          mode === 'failed-lost'
            ? { commandFailureCode: 'INVALID_QR' }
            : { eventId: 'canonical', currentStamps: 1 };
        if (mode === 'lost' || mode === 'failed-lost')
          throw new Error('NETWORK');
        return receipt;
      },
      read: async () => ({
        status: receipt ? 'CONFIRMED' : 'UNKNOWN',
        receipt,
      }),
    },
  });
  return {
    owner,
    states,
    identities,
    valid: (v) => {
      valid = v;
    },
    mode: (v) => {
      mode = v;
    },
    sends: () => sends,
    persisted: () => persisted,
  };
}
describe('receipt command owner shared safety contract', () => {
  test('offline before action transmits nothing', async () => {
    const f = fixture();
    f.valid(false);
    await expect(f.owner.run('stamp', {}, scope)).rejects.toThrow('OFFLINE');
    expect(f.sends()).toBe(0);
  });
  test('double callback/click cannot create a second pending operation', async () => {
    const f = fixture();
    const first = f.owner.run('stamp', {}, scope);
    await expect(f.owner.run('stamp', {}, scope)).rejects.toThrow('PENDING');
    await first;
    expect(f.sends()).toBe(1);
  });
  test.each([
    'stamp',
    'redeem',
    'continuation',
    'undo',
    'referral',
  ])('lost %s response never resolves before canonical reconciliation', async (operation) => {
    const f = fixture();
    f.mode('lost');
    let accepted = false;
    const result = f.owner
      .run(operation, { scanSessionId: 'session' }, scope)
      .then((r) => {
        accepted = true;
        return r;
      });
    await flush();
    expect(accepted).toBe(false);
    expect(f.owner.phase).toBe('UNKNOWN_OUTCOME');
    expect(f.persisted().operationId).toBe('operation-1');
    await f.owner.reconcile();
    expect((await result).eventId).toBe('canonical');
    expect(f.sends()).toBe(1);
    expect(f.persisted()).toBeNull();
  });
  test('reconnect reads only; explicit same-operation retry keeps identical identity', async () => {
    const f = fixture();
    f.mode('before');
    const result = f.owner.run('stamp', { scanSessionId: 'session' }, scope);
    await flush();
    await f.owner.reconcile();
    expect(f.sends()).toBe(1);
    f.mode('success');
    await f.owner.retrySameOperation();
    await result;
    expect(f.identities[1]).toEqual(f.identities[0]);
    expect(f.sends()).toBe(2);
  });
  test('refresh recovery contains no write intent and never submits', async () => {
    const f = fixture();
    f.owner.restore({ ...scope, operation: 'stamp', operationId: 'previous' });
    await f.owner.reconcile();
    await f.owner.retrySameOperation();
    expect(f.sends()).toBe(0);
    expect(f.owner.locked).toBe(true);
  });
  test('scope invalidation suppresses late success, keeps receipt identity', async () => {
    const f = fixture();
    f.mode('lost');
    const result = f.owner.run('stamp', {}, scope).catch((e) => e.message);
    await flush();
    f.owner.invalidate();
    await f.owner.reconcile();
    expect(await result).toBe('SCOPE_CHANGED');
    expect(f.persisted().operationId).toBe('operation-1');
    expect(f.states).not.toContain('SUCCESS');
  });
});

test('acknowledged write followed by failed read remains UNKNOWN and locked', async () => {
  let reads = 0;
  const owner = new ReceiptCommands({
    valid: () => true,
    uuid: () => 'op',
    save: async () => {},
    state: () => {},
    transport: {
      probe: async () => {},
      send: async () => ({ eventId: 'committed' }),
      read: async () => {
        reads++;
        throw new NotSent('OFFLINE');
      },
    },
  });
  let accepted = false;
  void owner.run('stamp', {}, scope).then(() => {
    accepted = true;
  });
  await flush();
  expect(reads).toBe(1);
  expect(accepted).toBe(false);
  expect(owner.phase).toBe('UNKNOWN_OUTCOME');
  expect(owner.locked).toBe(true);
});
test('resolved after lost response is marked for explicit user decision, reconnect never writes', async () => {
  const f = fixture();
  f.mode('lost');
  const result = f.owner.run('resolve', { qrData: 'memory' }, scope);
  await flush();
  expect(f.owner.canRetry).toBe(false);
  await f.owner.reconcile();
  expect((await result).reconciledAfterUnknown).toBe(true);
  expect(f.sends()).toBe(1);
});
test('ordinary online resolve preserves the normal decision contract', async () => {
  const f = fixture();
  expect(
    (await f.owner.run('resolve', { qrData: 'memory' }, scope))
      .reconciledAfterUnknown
  ).toBeUndefined();
});

test('lost terminal rejection reconciles to ERROR without success or retry', async () => {
  const f = fixture();
  f.mode('failed-lost');
  const operation = f.owner.run('resolve', { qrData: 'memory-only' }, scope);
  const rejected = operation.catch((error) => error.message);
  await flush();
  expect(f.owner.phase).toBe('UNKNOWN_OUTCOME');
  await f.owner.reconcile();
  expect(await rejected).toBe('INVALID_QR');
  expect(f.owner.phase).toBe('ERROR');
  expect(f.states).not.toContain('SUCCESS');
  expect(f.owner.locked).toBe(false);
  expect(f.persisted()).toBe(null);
  expect(f.sends()).toBe(1);
});
