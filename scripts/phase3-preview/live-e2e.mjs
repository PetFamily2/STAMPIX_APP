import { randomBytes, randomUUID } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { createWebReceiptAdapter } from '../../lib/scanner/webReceiptAdapter.ts';
import { WebScannerCommands } from '../../lib/web-scanner/command.ts';

const ref = (path) => makeFunctionReference(path);
const requireThat = (value, code) => {
  if (!value) throw new Error(code);
};
const waitFor = async (predicate) => {
  const until = Date.now() + 15000;
  while (!predicate() && Date.now() < until)
    await new Promise((r) => setTimeout(r, 50));
  requireThat(predicate(), 'LIVE_STATE_WAIT_FAILED');
};
export async function liveE2e({ target, admin, secret, report, stage }) {
  const actors = {};
  for (const role of ['owner', 'staff', 'customer']) {
    stage(`AUTH_${role.toUpperCase()}`);
    const publicClient = new ConvexHttpClient(target.url, { logger: false });
    let password = randomBytes(32).toString('base64url');
    const signUp = await publicClient.action(ref('auth:signIn'), {
      provider: 'password',
      params: {
        flow: 'signUp',
        email: `phase3-${role}@example.invalid`,
        password,
      },
    });
    requireThat(
      typeof signUp?.tokens?.token === 'string',
      'NORMAL_PASSWORD_AUTH_FAILED'
    );
    // Verify normal password sign-in, then resolve identity through the ordinary authenticated query.
    const signIn = await publicClient.action(ref('auth:signIn'), {
      provider: 'password',
      params: {
        flow: 'signIn',
        email: `phase3-${role}@example.invalid`,
        password,
      },
    });
    password = '';
    const token = signIn?.tokens?.token;
    requireThat(typeof token === 'string', 'NORMAL_PASSWORD_SIGN_IN_FAILED');
    const client = new ConvexHttpClient(target.url, {
      logger: false,
      auth: token,
    });
    const user = await client.query(ref('users:getCurrentUser'), {});
    requireThat(
      user?.email === `phase3-${role}@example.invalid` && user?.isActive,
      'AUTHENTICATED_ACTOR_NOT_PROVEN'
    );
    actors[role] = { token, id: user._id, client };
  }
  stage('SEED');
  const fixtures = await admin.mutation(
    ref('phase3Fixtures:seed'),
    {
      secret,
      owner: actors.owner.id,
      staff: actors.staff.id,
      customer: actors.customer.id,
    },
    { skipQueue: true }
  );
  report.seedCompleted = true;
  report.fixtures = {
    syntheticOnly: true,
    accounts: 3,
    businesses: 2,
    programs: 1,
    memberships: 1,
    referralLinks: 1,
    referrals: 1,
    benefitRewards: 1,
    authentication: 'EXISTING_PASSWORD_PROVIDER',
    seedVisibility: 'INTERNAL_PREVIEW_ONLY',
  };
  const arrange = (stamps, extra = {}) =>
    admin.mutation(
      ref('phase3Fixtures:arrange'),
      {
        secret,
        fixtures,
        stamps,
        ...extra,
      },
      { skipQueue: true }
    );
  const evidence = (scope) =>
    admin.query(ref('phase3Fixtures:evidence'), {
      secret,
      fixtures,
      runtimeId: scope.runtimeId,
    });
  const fixture = () => {
    let online = true,
      current = true,
      token = actors.staff.token,
      fault = null,
      checkpoint = false,
      receiptIdentity = null;
    let writes = 0;
    const states = [];
    const scope = {
      actorId: actors.staff.id,
      businessId: fixtures.businessId,
      programId: fixtures.programId,
      runtimeId: randomUUID(),
      deviceId: randomUUID(),
    };
    const transport = createWebReceiptAdapter({
      url: target.url,
      token: () => token,
      valid: () => current,
      online: () => online,
      timeoutMs: 10000,
      fetch: async (input, init) => {
        const mutation = String(input).endsWith('/api/mutation');
        if (mutation) writes++;
        const activeFault = mutation ? fault : null;
        if (activeFault) fault = null;
        if (activeFault === 'drop-before-server')
          throw new TypeError('SIMULATED_DISCONNECT');
        if (activeFault === 'in-flight') {
          const request = fetch(input, init);
          online = false;
          engine.networkChanged();
          const response = await request;
          requireThat(response.ok, 'LIVE_MUTATION_NOT_ACCEPTED');
          throw new TypeError('SIMULATED_DISCONNECT');
        }
        const response = await fetch(input, init);
        if (
          activeFault === 'account-switch-after-commit' ||
          activeFault === 'business-switch-after-commit'
        ) {
          requireThat(response.ok, 'LIVE_MUTATION_NOT_ACCEPTED');
          current = false;
          if (activeFault === 'account-switch-after-commit')
            token = actors.owner.token;
          engine.invalidate();
        }
        if (activeFault === 'response-lost') {
          requireThat(response.ok, 'LIVE_MUTATION_NOT_ACCEPTED');
          online = false;
          throw new TypeError('SIMULATED_RESPONSE_LOSS');
        }
        return response;
      },
    });
    const engine = new WebScannerCommands({
      scope,
      transport,
      online: () => online,
      current: () => current,
      checkpoint: (value, identity) => {
        checkpoint = value;
        if (identity) receiptIdentity = identity;
      },
      onState: (state) => {
        states.push(state.phase);
      },
    });
    engine.cameraReady();
    return {
      engine,
      scope,
      transport,
      states,
      online: (v) => {
        online = v;
      },
      fault: (v) => {
        fault = v;
      },
      switch: (nextToken) => {
        current = false;
        token = nextToken;
        engine.invalidate();
      },
      writes: () => writes,
      uncertain: () => checkpoint,
      receiptIdentity: () => receiptIdentity,
    };
  };
  const decode = async (f) => {
    let qr = (
      await actors.customer.client.mutation(
        ref('scanner:createCustomerScanToken'),
        {},
        { skipQueue: true }
      )
    ).scanToken;
    requireThat(typeof qr === 'string', 'SYNTHETIC_QR_NOT_CREATED');
    try {
      await f.engine.decode(qr);
    } finally {
      qr = '';
    }
  };
  const ready = async (stamps = 0) => {
    await arrange(stamps);
    const f = fixture();
    await decode(f);
    requireThat(
      f.engine.state.phase === 'READY_FOR_ACTION',
      'LIVE_RESOLVE_FAILED'
    );
    return f;
  };
  const reconnect = async (f, expected = 'SUCCESS') => {
    requireThat(
      f.engine.state.phase === 'UNKNOWN_OUTCOME' && f.uncertain(),
      'UNKNOWN_OUTCOME_NOT_HELD'
    );
    requireThat(!f.engine.reset(), 'UNCERTAIN_RESET_ALLOWED');
    const writes = f.writes();
    f.online(true);
    f.engine.networkChanged();
    await waitFor(() => f.engine.state.phase === expected);
    requireThat(
      f.writes() === writes && !f.uncertain(),
      'RECONNECT_REPLAY_OR_RECEIPT_FAILED'
    );
  };
  const record = (kind, name, detail = {}) => {
    report[kind] ??= {};
    report[kind][name] = { status: 'PASS', ...detail };
  };

  stage('RESOLVE_RESPONSE_LOST');
  await arrange(0);
  let f = fixture();
  f.fault('response-lost');
  await decode(f);
  await reconnect(f, 'READY_FOR_ACTION');
  requireThat(
    (await evidence(f.scope)).sessions === 1,
    'DUPLICATE_RESOLVE_SESSION'
  );
  record('actions', 'resolveScan', { lostResponseReconciled: true });

  stage('STAMP_RESPONSE_LOST');
  f = await ready();
  f.fault('response-lost');
  await f.engine.action('stamp');
  await reconnect(f);
  requireThat(
    f.engine.state.receipt?.eventType === 'STAMP_ADDED' &&
      (await evidence(f.scope)).events === 1,
    'CANONICAL_STAMP_FAILED'
  );
  record('actions', 'stamp', { lostResponseReconciled: true });

  stage('UNDO_RESPONSE_LOST');
  f.fault('response-lost');
  await f.engine.action('undo');
  await reconnect(f);
  requireThat(
    f.engine.state.receipt?.status === 'reverted' &&
      (await evidence(f.scope)).stamps === 0,
    'CANONICAL_UNDO_FAILED'
  );
  record('actions', 'undo', { lostResponseReconciled: true });

  stage('REDEEM_RESPONSE_LOST');
  f = await ready(3);
  f.fault('response-lost');
  await f.engine.action('redeem');
  await reconnect(f);
  requireThat(
    f.engine.state.receipt?.eventType === 'REWARD_REDEEMED' &&
      (await evidence(f.scope)).stamps === 0,
    'CANONICAL_REDEEM_FAILED'
  );
  record('actions', 'redeem', { lostResponseReconciled: true });

  stage('CONTINUATION_RESPONSE_LOST');
  f = await ready(2);
  await f.engine.action('stamp');
  requireThat(
    f.engine.state.phase === 'SUCCESS' &&
      f.engine.state.receipt?.currentStamps === 3,
    'CONTINUATION_BASE_FAILED'
  );
  f.fault('response-lost');
  await f.engine.action('continuation');
  await reconnect(f);
  requireThat(
    f.engine.state.receipt?.eventType === 'REWARD_REDEEMED' &&
      (await evidence(f.scope)).events === 2,
    'CANONICAL_CONTINUATION_FAILED'
  );
  record('actions', 'completed-stamp-redeem', { lostResponseReconciled: true });

  stage('REFERRAL_RESPONSE_LOST');
  f = await ready();
  await f.engine.action('stamp');
  f.fault('response-lost');
  await f.engine.action('referral', fixtures.rewardId);
  await reconnect(f);
  requireThat(
    f.engine.state.receipt?.rewardId === fixtures.rewardId &&
      (await evidence(f.scope)).rewardStatus === 'redeemed',
    'CANONICAL_REFERRAL_FAILED'
  );
  const duplicate = await actors.staff.client.mutation(
    ref('referrals:redeemReferralBenefit'),
    {
      businessId: fixtures.businessId,
      rewardId: fixtures.rewardId,
      scannerRuntimeSessionId: f.scope.runtimeId,
      deviceId: f.scope.deviceId,
    },
    { skipQueue: true }
  );
  requireThat(
    duplicate.reused === true && (await evidence(f.scope)).events === 2,
    'REFERRAL_DUPLICATED'
  );
  record('actions', 'referral benefit', {
    lostResponseReconciled: true,
    duplicateSuppressed: true,
  });

  stage('OFFLINE_BEFORE_RESOLVE');
  f = fixture();
  f.online(false);
  await f.engine.decode('synthetic-never-sent');
  requireThat(
    f.engine.state.phase === 'OFFLINE' && f.writes() === 0,
    'OFFLINE_RESOLVE_SENT'
  );
  record('network', 'offline-before-resolve');
  stage('REFRESH_AFTER_LOST_WRITE_RESPONSE');
  f = await ready();
  f.fault('response-lost');
  await f.engine.action('stamp');
  const recoveredOperation = f.receiptIdentity();
  requireThat(
    recoveredOperation?.operation === 'stamp',
    'DURABLE_OPERATION_ID_MISSING'
  );
  f.engine.invalidate();
  f.online(true);
  const refreshed = new WebScannerCommands({
    scope: f.scope,
    transport: f.transport,
    online: () => true,
    current: () => true,
    checkpoint: () => {},
    onState: () => {},
    recovery: true,
    recoveredOperation,
  });
  const refreshWrites = f.writes();
  await refreshed.reconcile();
  requireThat(
    refreshed.state.phase === 'SUCCESS' &&
      f.writes() === refreshWrites &&
      (await evidence(f.scope)).events === 1,
    'REFRESH_RECEIPT_RECOVERY_FAILED'
  );
  record('network', 'refresh-during-write', {
    sameOperationReceipt: true,
    automaticWrite: false,
  });

  stage('EVENTLESS_REFERRAL_RESPONSE_LOST');
  f = await ready();
  await f.engine.action('stamp');
  await arrange(1, { eventlessReward: true });
  f.fault('response-lost');
  await f.engine.action('referral', fixtures.rewardId);
  await reconnect(f);
  requireThat(
    f.engine.state.receipt?.status === 'redeemed' &&
      (await evidence(f.scope)).rewardStatus === 'redeemed' &&
      (await evidence(f.scope)).events === 1,
    'EVENTLESS_REFERRAL_RECEIPT_FAILED'
  );
  report.fixtures.additionalInactivePrograms = 1;
  record('network', 'eventless-referral', {
    durableReceipt: true,
    lostResponseReconciled: true,
  });

  stage('DISCONNECT_BEFORE_COMMIT');
  f = await ready();
  const before = f.writes();
  f.online(false);
  await f.engine.action('stamp');
  f.online(true);
  f.engine.networkChanged();
  await new Promise((r) => setTimeout(r, 250));
  requireThat(
    f.writes() === before && (await evidence(f.scope)).events === 0,
    'OFFLINE_COMMIT_REPLAYED'
  );
  record('network', 'disconnect-before-commit', { reconnectWrites: 0 });

  stage('DISCONNECT_DURING_COMMIT');
  f = await ready();
  f.fault('in-flight');
  await f.engine.action('stamp');
  await reconnect(f);
  requireThat(
    (await evidence(f.scope)).events === 1,
    'IN_FLIGHT_COMMIT_FAILED'
  );
  record('network', 'disconnect-during-commit', { canonicalEvents: 1 });

  stage('SAME_SESSION_RETRY');
  f = await ready();
  const session = f.engine.state.session.scanSessionId;
  f.fault('drop-before-server');
  await f.engine.action('stamp');
  requireThat(
    f.engine.state.phase === 'UNKNOWN_OUTCOME' &&
      (await evidence(f.scope)).events === 0,
    'DROPPED_REQUEST_NOT_UNKNOWN'
  );
  await f.engine.reconcile();
  requireThat(
    f.engine.state.phase === 'UNKNOWN_OUTCOME',
    'MISSING_COMMIT_WRONGLY_CONFIRMED'
  );
  await f.engine.retrySameSession();
  requireThat(
    f.engine.state.phase === 'SUCCESS' &&
      f.engine.state.session.scanSessionId === session &&
      (await evidence(f.scope)).events === 1 &&
      (await evidence(f.scope)).sessions === 1,
    'SAME_SESSION_RETRY_FAILED'
  );
  record('network', 'same-session-retry', { canonicalEvents: 1, sessions: 1 });

  stage('LOST_RESPONSE_RETRY_READ_ONLY');
  f = await ready();
  f.fault('response-lost');
  await f.engine.action('stamp');
  f.online(true);
  const sent = f.writes();
  await f.engine.retrySameSession();
  requireThat(
    f.engine.state.phase === 'SUCCESS' && sent === f.writes(),
    'CONFIRMED_RETRY_SENT_WRITE'
  );
  record('network', 'server-commit-response-lost-retry', { retryWrites: 0 });

  stage('DUPLICATE_CALLBACK_DOUBLE_CLICK');
  await arrange(0);
  f = fixture();
  let qr = (
    await actors.customer.client.mutation(
      ref('scanner:createCustomerScanToken'),
      {},
      { skipQueue: true }
    )
  ).scanToken;
  await Promise.all([f.engine.decode(qr), f.engine.decode(qr)]);
  qr = '';
  await Promise.all([f.engine.action('stamp'), f.engine.action('stamp')]);
  requireThat(
    f.engine.state.phase === 'SUCCESS' &&
      (await evidence(f.scope)).events === 1 &&
      (await evidence(f.scope)).sessions === 1,
    'DUPLICATE_CALLBACK_OR_CLICK'
  );
  record('network', 'duplicate-callback-double-click');

  stage('CONCURRENT_SAME_SESSION');
  f = await ready();
  const args = { scanSessionId: f.engine.state.session.scanSessionId };
  await Promise.all([
    actors.staff.client.mutation(ref('scanner:commitStamp'), args, {
      skipQueue: true,
    }),
    actors.staff.client.mutation(ref('scanner:commitStamp'), args, {
      skipQueue: true,
    }),
  ]);
  const canonical = await f.transport.outcome('stamp', args, f.scope);
  requireThat(
    canonical.status === 'CONFIRMED' && (await evidence(f.scope)).events === 1,
    'CONCURRENT_COMMIT_DUPLICATED'
  );
  record('network', 'concurrent-same-session');

  stage('ACCOUNT_SWITCH');
  f = await ready();
  f.switch(actors.owner.token);
  await f.engine.action('stamp');
  requireThat(
    f.engine.state.phase !== 'SUCCESS' &&
      (await evidence(f.scope)).events === 0,
    'STALE_ACCOUNT_WRITE'
  );
  let denied = false;
  try {
    await actors.owner.client.mutation(
      ref('scanner:commitStamp'),
      { scanSessionId: f.engine.state.session.scanSessionId },
      { skipQueue: true }
    );
  } catch {
    denied = true;
  }
  requireThat(denied, 'OTHER_ACTOR_COMMIT_ALLOWED');
  record('network', 'account-switch', {
    staleWriteSuppressed: true,
    otherActorRejected: true,
  });

  stage('BUSINESS_SWITCH');
  f = await ready();
  f.switch(actors.staff.token);
  await f.engine.action('stamp');
  requireThat(
    (await evidence(f.scope)).events === 0 &&
      f.engine.state.phase !== 'SUCCESS',
    'STALE_BUSINESS_WRITE'
  );
  denied = false;
  try {
    await actors.owner.client.query(ref('webScanner:getOutcome'), {
      runtimeId: f.scope.runtimeId,
      deviceId: f.scope.deviceId,
      programId: fixtures.programId,
      businessId: fixtures.secondBusinessId,
      operation: 'stamp',
      sessionId: f.engine.state.session.scanSessionId,
    });
  } catch {
    denied = true;
  }
  requireThat(denied, 'CROSS_BUSINESS_QUERY_ALLOWED');
  record('network', 'business-switch', {
    staleWriteSuppressed: true,
    crossScopeRejected: true,
  });

  for (const type of ['account', 'business']) {
    stage(`${type.toUpperCase()}_SWITCH_AFTER_SEND`);
    const switching = await ready();
    switching.fault(`${type}-switch-after-commit`);
    await switching.engine.action('stamp');
    requireThat(
      switching.engine.state.phase === 'UNKNOWN_OUTCOME' &&
        switching.uncertain(),
      'STALE_SCOPE_SUCCESS'
    );
    const canonical = await actors.staff.client.query(
      ref('webScanner:getOutcome'),
      {
        businessId: switching.scope.businessId,
        programId: switching.scope.programId,
        runtimeId: switching.scope.runtimeId,
        deviceId: switching.scope.deviceId,
        operation: 'stamp',
        sessionId: switching.engine.state.session.scanSessionId,
      }
    );
    requireThat(
      canonical.status === 'CONFIRMED' &&
        (await evidence(switching.scope)).events === 1,
      'OLD_SCOPE_CANONICAL_OUTCOME_MISSING'
    );
    record('network', `${type}-switch-after-send`, {
      staleSuccessSuppressed: true,
      canonicalEvents: 1,
    });
  }

  stage('UNAUTHORIZED_REQUEST');
  denied = false;
  try {
    await new ConvexHttpClient(target.url, { logger: false }).mutation(
      ref('scanner:commitStamp'),
      { scanSessionId: f.engine.state.session.scanSessionId },
      { skipQueue: true }
    );
  } catch {
    denied = true;
  }
  requireThat(denied, 'UNAUTHENTICATED_COMMIT_ALLOWED');
  record('network', 'unauthorized-direct-request');

  stage('SUSPENDED_STAFF');
  f = await ready();
  await arrange(0, { staffActive: false });
  await f.engine.action('stamp');
  requireThat(
    f.engine.state.phase !== 'SUCCESS' &&
      (await evidence(f.scope)).events === 0,
    'SUSPENDED_STAFF_WRITE'
  );
  await arrange(0, { staffActive: true });
  record('network', 'staff-suspended');
  stage('PROGRAM_UNAVAILABLE');
  f = await ready();
  await arrange(0, { programActive: false });
  await f.engine.action('stamp');
  requireThat(
    f.engine.state.phase !== 'SUCCESS' &&
      (await evidence(f.scope)).events === 0,
    'INACTIVE_PROGRAM_WRITE'
  );
  await arrange(0, { programActive: true });
  record('network', 'program-unavailable');

  stage('SESSION_EXPIRY_WAIT');
  f = await ready();
  const expires = f.engine.state.session.sessionExpiresAt;
  await new Promise((r) =>
    setTimeout(r, Math.max(0, expires - Date.now() + 1200))
  );
  await f.engine.action('stamp');
  requireThat(
    f.engine.state.phase === 'ERROR' &&
      f.engine.state.code === 'SCAN_SESSION_EXPIRED' &&
      (await evidence(f.scope)).events === 0,
    'EXPIRED_SESSION_WRITE'
  );
  denied = false;
  try {
    await actors.staff.client.mutation(
      ref('scanner:commitStamp'),
      { scanSessionId: f.engine.state.session.scanSessionId },
      { skipQueue: true }
    );
  } catch {
    denied = true;
  }
  requireThat(denied, 'SERVER_ACCEPTED_EXPIRED_SESSION');
  record('network', 'session-expiry', { realClock: true });

  report.network.model =
    'REAL_CONVEX_HTTP_WITH_CLIENT_SIDE_NETWORK_FAULT_INJECTION';
  report.deviceVerify = [
    'Safari iPhone',
    'Chrome Android',
    'Samsung Internet',
    'physical camera decoding',
  ];
  report.remaining = [];
  report.durableReceiptRecovery = true;
  // Public IDs are only rollout selectors, never credentials. No passwords or JWTs leave this function.
  return {
    actorIds: [actors.owner.id, actors.staff.id],
    businessIds: [fixtures.businessId, fixtures.secondBusinessId],
  };
}
