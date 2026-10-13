import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { RequestManager } from '../../node_modules/convex/src/browser/sync/request_manager';
import { Long } from '../../node_modules/convex/src/vendor/long';
import {
  awaitCurrentTransaction,
  captureTransactionGeneration,
  invalidateTransactionGeneration,
} from '../scanner/posFlow';
import {
  NotSent,
  ServerRejected,
  WebScannerCommands,
} from '../web-scanner/command';
import { createHttpTransport } from '../web-scanner/httpTransport';
import { scannerPreviewEnabled } from '../web-scanner/previewGate';
import { recoveryIdentity } from '../web-scanner/recovery';

const scope = {
  actorId: 'actor',
  businessId: 'business',
  programId: 'program',
  runtimeId: 'runtime',
  deviceId: 'device',
};
const resolved = {
  scanSessionId: 'session',
  sessionExpiresAt: Date.now() + 30000,
  resolution: 'AUTO_STAMP',
  customerUserId: 'customer',
};
const receipt = {
  eventId: 'event',
  eventType: 'STAMP_ADDED',
  eventCreatedAt: Date.now(),
  undoAvailableUntil: Date.now() + 30000,
  redemptionContinuationAvailableUntil: Date.now() + 30000,
};
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function fixture(overrides = {}) {
  let online = true,
    current = true,
    checkpoint = false,
    sends = 0,
    reads = 0,
    commits = 0,
    canonical = null;
  const outcome = (status, data = null) => ({
    ...scope,
    serverNow: Date.now(),
    status,
    sessionId: 'session',
    expiresAt: resolved.sessionExpiresAt,
    receipt: data,
  });
  const transport = {
    probe: async () => {
      if (!online) throw new NotSent('OFFLINE');
      return outcome('AUTHORIZED');
    },
    send: async (operation) => {
      sends++;
      if (operation === 'resolve') return { ...resolved };
      commits++;
      canonical = receipt;
      return receipt;
    },
    outcome: async (operation) => {
      reads++;
      if (!online) throw new NotSent('OFFLINE');
      return outcome(
        operation === 'resolve'
          ? 'RESOLVED'
          : canonical
            ? 'CONFIRMED'
            : 'UNKNOWN',
        operation === 'resolve' ? { ...resolved } : canonical
      );
    },
    ...overrides,
  };
  const engine = new WebScannerCommands({
    scope,
    transport,
    online: () => online,
    current: () => current,
    checkpoint: (value) => {
      checkpoint = value;
    },
    onState: () => {},
    now: () => Date.now(),
  });
  return {
    engine,
    transport,
    outcome,
    online: (value) => {
      online = value;
    },
    current: (value) => {
      current = value;
    },
    checkpoint: () => checkpoint,
    sends: () => sends,
    reads: () => reads,
    commits: () => commits,
    canonical: (value) => {
      canonical = value;
    },
  };
}
describe('Web scanner command safety matrix', () => {
  test('disconnect signal after send immediately enters UNKNOWN before timeout', async () => {
    const gate = deferred();
    const f = fixture();
    await f.engine.decode('QR');
    f.transport.send = () => gate.promise;
    const p = f.engine.action('stamp');
    await flush();
    f.online(false);
    f.engine.networkChanged();
    expect(f.engine.state.phase).toBe('UNKNOWN_OUTCOME');
    expect(f.engine.reset()).toBe(false);
    gate.reject(new Error('ABORT'));
    await p;
  });
  test('1 offline before resolve has no intent and no request', async () => {
    const f = fixture();
    f.online(false);
    await f.engine.decode('SECRET-QR');
    expect(f.sends()).toBe(0);
    expect(f.engine.state.phase).toBe('OFFLINE');
    expect(f.checkpoint()).toBe(false);
  });
  test('2 disconnect after resolve before commit never queues a write', async () => {
    const f = fixture();
    await f.engine.decode('QR');
    f.online(false);
    await f.engine.action('stamp');
    expect(f.commits()).toBe(0);
    f.online(true);
    f.engine.networkChanged();
    await flush();
    expect(f.commits()).toBe(0);
  });
  test('3 disconnect during commit stays unknown, locks reset and second action', async () => {
    const gate = deferred();
    const f = fixture();
    await f.engine.decode('QR');
    f.transport.send = () => gate.promise;
    const p = f.engine.action('stamp');
    await flush();
    f.online(false);
    gate.reject(new Error('NETWORK'));
    await p;
    expect(f.engine.state.phase).toBe('UNKNOWN_OUTCOME');
    expect(f.engine.reset()).toBe(false);
    expect(f.checkpoint()).toBe(true);
    await f.engine.action('redeem');
    expect(f.engine.state.phase).toBe('UNKNOWN_OUTCOME');
  });
  test('4 server commits but response lost: no success before canonical read', async () => {
    const f = fixture();
    await f.engine.decode('QR');
    f.transport.send = async () => {
      f.canonical(receipt);
      throw new Error('RESPONSE_LOST');
    };
    await f.engine.action('stamp');
    expect(f.engine.state.phase).toBe('UNKNOWN_OUTCOME');
    expect(f.checkpoint()).toBe(true);
    await f.engine.reconcile();
    expect(f.engine.state.phase).toBe('SUCCESS');
    expect(f.engine.state.receipt.eventId).toBe('event');
    expect(f.checkpoint()).toBe(false);
  });
  test('5 reconnect after response lost performs reads only', async () => {
    let attempts = 0;
    const f = fixture();
    await f.engine.decode('QR');
    f.transport.send = async () => {
      attempts++;
      f.canonical(receipt);
      throw new Error('LOST');
    };
    await f.engine.action('stamp');
    f.engine.networkChanged();
    await flush();
    expect(attempts).toBe(1);
    expect(f.engine.state.phase).toBe('SUCCESS');
  });
  test('6 duplicate camera callback cannot create second resolve', async () => {
    const f = fixture();
    await Promise.all([f.engine.decode('QR'), f.engine.decode('QR')]);
    expect(f.sends()).toBe(1);
    expect(f.engine.state.phase).toBe('READY_FOR_ACTION');
  });
  test('7 double click produces exactly one commit', async () => {
    const f = fixture();
    await f.engine.decode('QR');
    await Promise.all([f.engine.action('stamp'), f.engine.action('stamp')]);
    expect(f.commits()).toBe(1);
  });
  test('8 refresh during commit restores uncertainty, never restores a write intent', async () => {
    const values = new Map();
    const storage = {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
    };
    const a = recoveryIdentity(storage, 'scope', () => 'random');
    a.checkpoint(true);
    expect(Object.keys(JSON.parse(values.get('scope'))).sort()).toEqual([
      'deviceId',
      'runtimeId',
      'uncertain',
    ]);
    const recovered = recoveryIdentity(storage, 'scope', () => 'different');
    const f = fixture();
    const engine = new WebScannerCommands({
      scope,
      transport: f.transport,
      online: () => true,
      current: () => true,
      checkpoint: recovered.checkpoint,
      onState: () => {},
      recovery: recovered.identity.uncertain,
    });
    await engine.decode('QR');
    await engine.reconcile();
    expect(f.sends()).toBe(0);
    expect(engine.state.phase).toBe('UNKNOWN_OUTCOME');
    expect(engine.reset()).toBe(false);
  });
  test('9 session expiry prevents a new commit', async () => {
    const f = fixture({
      send: async () => ({ ...resolved, sessionExpiresAt: 0 }),
    });
    await f.engine.decode('QR');
    await f.engine.action('stamp');
    expect(f.engine.state.code).toBe('SCAN_SESSION_EXPIRED');
    expect(f.commits()).toBe(0);
  });
  for (const [n, code] of [
    [10, 'EXPIRED_TOKEN'],
    [11, 'TOKEN_ALREADY_USED'],
    [14, 'NOT_AUTHORIZED'],
    [15, 'PROGRAM_NOT_SCANNER_ELIGIBLE'],
  ]) {
    test(`${n} authoritative rejection ${code} never displays success`, async () => {
      const f = fixture({
        send: async () => {
          throw new ServerRejected(code);
        },
      });
      await f.engine.decode('QR');
      expect(f.engine.state.phase).toBe('ERROR');
      expect(f.engine.state.code).toBe(code);
      expect(f.checkpoint()).toBe(false);
    });
  }
  for (const [n, kind] of [
    [12, 'business'],
    [13, 'account'],
  ])
    test(`${n} ${kind} switch drops old response and retains uncertainty`, async () => {
      const gate = deferred();
      const f = fixture();
      await f.engine.decode('QR');
      f.transport.send = () => gate.promise;
      const p = f.engine.action('stamp');
      await flush();
      f.current(false);
      f.engine.invalidate();
      gate.resolve(receipt);
      await p;
      expect(f.engine.state.phase).toBe('UNKNOWN_OUTCOME');
      expect(f.checkpoint()).toBe(true);
      expect(f.engine.state.receipt).toBe(null);
    });
  test('16 actor mismatch in authenticated preflight prevents direct command', async () => {
    const f = fixture({
      probe: async () => ({
        ...scope,
        actorId: 'different',
        status: 'AUTHORIZED',
      }),
    });
    await f.engine.decode('QR');
    expect(f.sends()).toBe(0);
    expect(f.engine.state.phase).toBe('ERROR');
  });
  test('17 concurrent scanner attempt while first pending cannot resolve or commit', async () => {
    const gate = deferred();
    const f = fixture();
    await f.engine.decode('QR');
    f.transport.send = () => gate.promise;
    const p = f.engine.action('stamp');
    await flush();
    await f.engine.decode('SECOND');
    await f.engine.action('stamp');
    expect(f.sends()).toBe(1);
    gate.reject(new Error('LOSS'));
    await p;
  });
  test('18 undo boundary is checked before sending', async () => {
    const f = fixture();
    await f.engine.decode('QR');
    await f.engine.action('stamp');
    f.engine.state.receipt.undoAvailableUntil = 0;
    await f.engine.action('undo');
    expect(f.commits()).toBe(1);
    expect(f.engine.state.code).toBe('UNDO_NOT_AVAILABLE');
  });
  test('19 referral redemption double click has one in-flight command', async () => {
    const f = fixture();
    await f.engine.decode('QR');
    await f.engine.action('stamp');
    await Promise.all([
      f.engine.action('referral', 'reward'),
      f.engine.action('referral', 'reward'),
    ]);
    expect(f.commits()).toBe(2);
  });
  test('20 same session reconciliation retains original resource ID and never resends', async () => {
    const f = fixture();
    await f.engine.decode('QR');
    let sentArgs;
    f.transport.send = async (_, args) => {
      sentArgs = { ...args };
      throw new Error('ABORT');
    };
    await f.engine.action('stamp');
    let readArgs;
    f.transport.outcome = async (_, args) => {
      readArgs = args;
      return f.outcome('UNKNOWN');
    };
    await f.engine.reconcile();
    await f.engine.reconcile();
    expect(sentArgs.scanSessionId).toBe('session');
    expect(readArgs.scanSessionId).toBe('session');
    expect(f.engine.state.phase).toBe('UNKNOWN_OUTCOME');
  });
  test('query NotSent after acknowledged commit is UNKNOWN, never definitive failure', async () => {
    const f = fixture({
      outcome: async () => {
        throw new NotSent('OFFLINE');
      },
    });
    await f.engine.decode('QR');
    await f.engine.action('stamp');
    expect(f.engine.state.phase).toBe('UNKNOWN_OUTCOME');
    expect(f.checkpoint()).toBe(true);
  });
  test('manual same-session retry never resolves again and cannot turn rejection into final failure', async () => {
    const f = fixture();
    await f.engine.decode('QR');
    const ids = [];
    f.transport.send = async (_, args) => {
      ids.push(args.scanSessionId);
      throw new ServerRejected('SCAN_SESSION_EXPIRED');
    };
    // First send lost its response, not an authoritative rejection.
    f.transport.send = async (_, args) => {
      ids.push(args.scanSessionId);
      throw new Error('LOST');
    };
    await f.engine.action('stamp');
    f.transport.send = async (_, args) => {
      ids.push(args.scanSessionId);
      throw new ServerRejected('SCAN_SESSION_EXPIRED');
    };
    await f.engine.retrySameSession();
    expect(ids).toEqual(['session', 'session']);
    expect(f.engine.state.phase).toBe('UNKNOWN_OUTCOME');
    expect(f.checkpoint()).toBe(true);
  });
  test('manual retry first reconciles and skips write when canonical receipt already exists', async () => {
    const f = fixture();
    await f.engine.decode('QR');
    let attempts = 0;
    f.transport.send = async () => {
      attempts++;
      f.canonical(receipt);
      throw new Error('LOST');
    };
    await f.engine.action('stamp');
    await f.engine.retrySameSession();
    expect(attempts).toBe(1);
    expect(f.engine.state.phase).toBe('SUCCESS');
  });
  test('ready session from query is not evidence of commit failure', async () => {
    const f = fixture();
    await f.engine.decode('QR');
    f.transport.send = async () => {
      throw new Error('LOST');
    };
    await f.engine.action('stamp');
    await f.engine.reconcile();
    expect(f.engine.state.phase).toBe('UNKNOWN_OUTCOME');
  });
  test('resolve response lost can discover same session without resending raw QR', async () => {
    const f = fixture({
      send: async () => {
        throw new Error('LOST');
      },
    });
    await f.engine.decode('PRIVATE');
    expect(JSON.stringify(f.engine.state)).not.toContain('PRIVATE');
    await f.engine.reconcile();
    expect(f.engine.state.phase).toBe('READY_FOR_ACTION');
    expect(f.reads()).toBe(1);
  });
  test('program switch during preflight sends nothing', async () => {
    const gate = deferred();
    const f = fixture({ probe: () => gate.promise });
    const p = f.engine.decode('QR');
    await flush();
    f.current(false);
    f.engine.invalidate();
    gate.resolve(f.outcome('AUTHORIZED'));
    await p;
    expect(f.sends()).toBe(0);
  });
  test('success requires matching canonical actor/business/program', async () => {
    const f = fixture({
      outcome: async () => ({
        ...scope,
        businessId: 'elsewhere',
        status: 'CONFIRMED',
        receipt,
      }),
    });
    await f.engine.decode('QR');
    await f.engine.action('stamp');
    expect(f.engine.state.phase).toBe('UNKNOWN_OUTCOME');
  });
});
describe('actual Convex SDK transport behavior', () => {
  test('Native SDK retains offline mutation and replays same request on restart', () => {
    const manager = new RequestManager(
      { log: () => {}, warn: () => {}, error: () => {}, logVerbose: () => {} },
      () => {}
    );
    const message = {
      type: 'Mutation',
      requestId: 1,
      udfPath: 'scanner:commitStamp',
      args: [{ scanSessionId: 'session' }],
    };
    void manager.request(message, false);
    expect(manager.restart()).toEqual([message]);
    expect(manager.restart()).toEqual([message]);
  });
  test('HTTP skipQueue sends once; a rejected request is not retained for reconnect', async () => {
    let calls = 0;
    const t = createHttpTransport({
      url: 'https://example.convex.cloud',
      token: () => 'token',
      valid: () => true,
      online: () => true,
      fetch: async () => {
        calls++;
        throw new TypeError('NETWORK');
      },
    });
    await expect(
      t.send('stamp', { scanSessionId: 'session' }, scope)
    ).rejects.toThrow('TRANSPORT_OUTCOME_UNKNOWN');
    await flush();
    expect(calls).toBe(1);
  });
  test('HTTP abort is unknown, with no transparent retry', async () => {
    let calls = 0;
    const t = createHttpTransport({
      url: 'https://example.convex.cloud',
      token: () => 'token',
      valid: () => true,
      online: () => true,
      timeoutMs: 5,
      fetch: async (_, init) => {
        calls++;
        return await new Promise((_, reject) =>
          init.signal.addEventListener('abort', () =>
            reject(new Error('ABORT'))
          )
        );
      },
    });
    await expect(
      t.send('stamp', { scanSessionId: 'session' }, scope)
    ).rejects.toThrow('TRANSPORT_OUTCOME_UNKNOWN');
    expect(calls).toBe(1);
  });
  test('only explicit UDF rejection is definitive, no raw error retained', async () => {
    const t = createHttpTransport({
      url: 'https://example.convex.cloud',
      token: () => 'token',
      valid: () => true,
      online: () => true,
      fetch: async () =>
        new Response(
          JSON.stringify({
            status: 'error',
            errorMessage: 'Uncaught Error: TOKEN_ALREADY_USED secret',
          }),
          { status: 560 }
        ),
    });
    await expect(
      t.send('stamp', { scanSessionId: 'session' }, scope)
    ).rejects.toThrow('TOKEN_ALREADY_USED');
  });
  test('HTTP fetch options do not cache, redirect or keep write alive', async () => {
    let options;
    const t = createHttpTransport({
      url: 'https://example.convex.cloud',
      token: () => 'token',
      valid: () => true,
      online: () => true,
      fetch: async (_, init) => {
        options = init;
        return new Response(
          JSON.stringify({ status: 'success', value: receipt })
        );
      },
    });
    await t.send('stamp', { scanSessionId: 'session' }, scope);
    expect(options.cache).toBe('no-store');
    expect(options.keepalive).toBe(false);
    expect(options.redirect).toBe('error');
  });
});

// Phase 3B VERIFY only: execute the pinned SDK, without Native source changes,
// a physical device, a WebSocket server, or live business writes.
describe('Phase 3B Native reconnect reproduction', () => {
  const actions = [
    [
      'resolveScan',
      'scanner:resolveScan',
      {
        qrData: 'synthetic-fixture',
        businessId: 'business_a',
        programId: 'program_a',
      },
    ],
    ['commitStamp', 'scanner:commitStamp', { scanSessionId: 'session_a' }],
    ['commitRedeem', 'scanner:commitRedeem', { scanSessionId: 'session_a' }],
    [
      'commitCompletedStampRedeem',
      'scanner:commitCompletedStampRedeem',
      { scanSessionId: 'session_a' },
    ],
    [
      'undoLastScannerAction',
      'scanner:undoLastScannerAction',
      {
        eventId: 'event_a',
        scannerRuntimeSessionId: 'runtime_a',
        deviceId: 'device_a',
      },
    ],
    [
      'redeemReferralBenefit',
      'referrals:redeemReferralBenefit',
      {
        businessId: 'business_a',
        rewardId: 'reward_a',
        scannerRuntimeSessionId: 'runtime_a',
        deviceId: 'device_a',
      },
    ],
  ];
  const managerFixture = () =>
    new RequestManager(
      { log: () => {}, warn: () => {}, error: () => {}, logVerbose: () => {} },
      () => {}
    );
  const messageFor = (path, args) => ({
    type: 'Mutation',
    requestId: 31,
    udfPath: path,
    args: [args],
  });

  for (const [action, path, args] of actions) {
    test(`${action}: offline before send is retained until reconnect`, async () => {
      const manager = managerFixture();
      const message = messageFor(path, args);
      let settled = false;
      void manager.request(message, false).then(() => {
        settled = true;
      });
      await flush();
      expect(settled).toBe(false);
      expect(manager.inflightMutations()).toBe(1);
      const reconnect = manager.restart();
      expect(reconnect).toEqual([message]);
      expect(reconnect[0]).toBe(message);
      expect(reconnect[0].args[0]).toEqual(args);
      expect(manager.restart()).toEqual([message]);
      expect(manager.inflightMutations()).toBe(1);
    });
    test(`${action}: sent without acknowledgment replays original request identity`, () => {
      const manager = managerFixture();
      const message = messageFor(path, args);
      void manager.request(message, true);
      expect(manager.hasIncompleteRequests()).toBe(true);
      expect(manager.restart()).toEqual([message]);
      expect(manager.restart()[0].requestId).toBe(31);
      expect(manager.inflightMutations()).toBe(1);
    });
  }

  for (const scopeChange of ['business switch', 'account switch']) {
    test(`${scopeChange}: real UI generation guard drops result but does not cancel SDK write`, async () => {
      const manager = managerFixture();
      const message = messageFor('scanner:commitStamp', {
        scanSessionId: 'session_a',
      });
      const generationRef = { current: 1 };
      const generation = captureTransactionGeneration(generationRef);
      const task = awaitCurrentTransaction(generationRef, generation, () =>
        manager.request(message, false)
      );
      invalidateTransactionGeneration(generationRef);
      expect(manager.restart()).toEqual([message]);
      // Synthetic protocol acknowledgment; not evidence of a live server commit.
      const timestamp = Long.fromNumber(10);
      manager.onResponse({
        type: 'MutationResponse',
        requestId: 31,
        success: true,
        result: { eventId: 'fixture_event' },
        ts: timestamp,
        logLines: [],
      });
      manager.removeCompleted(timestamp);
      expect(await task).toEqual({ status: 'stale' });
      expect(manager.restart()).toEqual([]);
    });
  }

  test('success acknowledgment can replay until server timestamp is reflected, then stops', async () => {
    const manager = managerFixture();
    const message = messageFor('scanner:commitRedeem', {
      scanSessionId: 'session_a',
    });
    const task = manager.request(message, true);
    const timestamp = Long.fromNumber(10);
    manager.onResponse({
      type: 'MutationResponse',
      requestId: 31,
      success: true,
      result: { eventId: 'fixture_event' },
      ts: timestamp,
      logLines: [],
    });
    expect(manager.restart()).toEqual([message]);
    manager.removeCompleted(timestamp);
    expect((await task).success).toBe(true);
    expect(manager.restart()).toEqual([]);
  });

  test('definitive rejection removes request; reconnect does not replay it', async () => {
    const manager = managerFixture();
    const message = messageFor('scanner:commitStamp', {
      scanSessionId: 'session_a',
    });
    const task = manager.request(message, true);
    manager.onResponse({
      type: 'MutationResponse',
      requestId: 31,
      success: false,
      result: 'NOT_AUTHORIZED',
      logLines: [],
    });
    expect((await task).success).toBe(false);
    expect(manager.restart()).toEqual([]);
  });

  test('all six Native commands use safe HTTP ownership and Staff reuses the same scanner', () => {
    const business = readFileSync(
      new URL(
        '../../app/(authenticated)/(business)/scanner.tsx',
        import.meta.url
      ),
      'utf8'
    );
    const staff = readFileSync(
      new URL('../../app/(authenticated)/(staff)/scanner.tsx', import.meta.url),
      'utf8'
    );
    expect(business.includes('useMutation')).toBe(false);
    expect(business.includes('useScannerCommandSafety')).toBe(true);
    for (const operation of [
      'resolve',
      'stamp',
      'redeem',
      'continuation',
      'undo',
      'referral',
    ]) {
      expect(business.includes(`safeRun('${operation}', args)`)).toBe(true);
    }
    expect(staff.trim()).toBe(
      "export { default } from '../(business)/scanner';"
    );
  });
});
describe('disabled by default and storage fail closed', () => {
  const flags = {
    platform: 'web',
    environment: 'preview',
    flag: 'true',
    backend: 'verified-preview',
    actorId: 'a',
    businessId: 'b',
    actors: 'a',
    businesses: 'b',
    url: 'https://synthetic-preview.convex.cloud',
    previewUrl: 'https://synthetic-preview.convex.cloud',
    prodUrl: 'https://prod.convex.cloud',
  };
  test('only allowlisted actors/businesses in isolated Preview can enter', () => {
    expect(scannerPreviewEnabled(flags)).toBe(true);
    for (const change of [
      { platform: 'ios' },
      { platform: 'android' },
      { environment: 'production' },
      { flag: 'false' },
      { backend: undefined },
      { backend: 'verified-dev' },
      { previewUrl: undefined },
      {
        url: 'https://utmost-fennec-280.convex.cloud',
        previewUrl: 'https://utmost-fennec-280.convex.cloud',
      },
      {
        url: 'https://aware-llama-850.convex.cloud',
        previewUrl: 'https://aware-llama-850.convex.cloud',
      },
      { actorId: 'real-user' },
      { businessId: 'real-business' },
      { url: flags.prodUrl },
    ])
      expect(scannerPreviewEnabled({ ...flags, ...change })).toBe(false);
  });
  test('storage unavailable or malformed never enables writes', () => {
    expect(() =>
      recoveryIdentity(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('DENIED');
          },
        },
        'key'
      )
    ).toThrow();
    expect(() =>
      recoveryIdentity({ getItem: () => '{', setItem: () => {} }, 'key')
    ).toThrow();
  });
});

test('refresh cannot bypass an unresolved operation by selecting another program', async () => {
  const { pendingProgram } = await import('../web-scanner/recovery');
  const values = new Map([
    [
      'stampaix:web-scanner-recovery:actor:business:original',
      JSON.stringify({ uncertain: true, operationId: 'receipt-only' }),
    ],
    [
      'stampaix:web-scanner-recovery:other:business:ignored',
      JSON.stringify({ uncertain: true }),
    ],
  ]);
  const storage = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (key) => values.get(key) ?? null,
  };
  expect(pendingProgram(storage, 'actor', 'business')).toBe('original');
  values.set(
    'stampaix:web-scanner-recovery:actor:business:another',
    JSON.stringify({ uncertain: true })
  );
  expect(() => pendingProgram(storage, 'actor', 'business')).toThrow(
    'REQUIRES_REVIEW'
  );
});
