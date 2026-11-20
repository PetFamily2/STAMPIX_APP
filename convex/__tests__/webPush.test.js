import { afterEach, describe, expect, test } from 'bun:test';
import webpush from 'web-push';
import {
  allowedPushEndpoint,
  claimWebDelivery,
  configuration,
  deliveryTargets,
  expireWebClaim,
  finishWebDelivery,
  scheduleWebPush,
  subscribe,
  unsubscribe,
} from '../webPush';
import { send as deliverWebPush } from '../webPushDelivery';
import { baseTables, buildCtx } from './helpers/scannerFixtures';

const saved = { ...process.env };
afterEach(() => {
  for (const k of [
    'WEB_PUSH_ENABLED',
    'PWA_RELEASE_GATE',
    'STAMPAIX_ENV',
    'WEB_PUSH_VAPID_PUBLIC_KEY',
    'WEB_PUSH_VAPID_PRIVATE_KEY',
    'WEB_PUSH_VAPID_SUBJECT',
  ]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
const input = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic',
  p256dh: 'a'.repeat(87),
  auth: 'b'.repeat(22),
};
function context(tables, actor = 'staff_1') {
  const ctx = buildCtx(tables, actor);
  ctx.db.delete = async (id) => {
    for (const name of Object.keys(tables))
      tables[name] = tables[name].filter((row) => row._id !== id);
  };
  return ctx;
}
const enable = () => {
  process.env.WEB_PUSH_ENABLED = 'true';
  process.env.STAMPAIX_ENV = 'preview';
};
describe('Web Push server ownership and safe provider targets', () => {
  test.each([
    'http://fcm.googleapis.com/x',
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://fcm.googleapis.com.evil.example/x',
    'https://evilpush.apple.com/x',
    'https://user@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:444/x',
    'https://fcm.googleapis.com/x#private',
  ])('rejects SSRF target %s', (endpoint) =>
    expect(allowedPushEndpoint(endpoint)).toBe(false));
  test.each([
    'https://fcm.googleapis.com/x',
    'https://updates.push.services.mozilla.com/wpush/v2/x',
    'https://web.push.apple.com/x',
  ])('allows explicit browser provider %s', (endpoint) =>
    expect(allowedPushEndpoint(endpoint)).toBe(true));
  test('Production remains disabled even with opt-in flag', async () => {
    enable();
    process.env.STAMPAIX_ENV = 'production';
    const ctx = buildCtx(baseTables());
    await expect(subscribe._handler(ctx, input)).rejects.toThrow('DISABLED');
  });
  test('Production pilot requires physical attestation in addition to its flag', async () => {
    enable();
    process.env.STAMPAIX_ENV = 'production';
    process.env.PWA_RELEASE_GATE = 'DEVICE_VERIFY';
    await expect(
      subscribe._handler(buildCtx(baseTables()), input)
    ).rejects.toThrow('DISABLED');
    process.env.PWA_RELEASE_GATE = 'device-verified-pilot-v1';
    const tables = baseTables();
    await subscribe._handler(buildCtx(tables), input);
    expect(tables.webPushSubscriptions).toHaveLength(1);
    process.env.WEB_PUSH_ENABLED = 'false';
    await expect(subscribe._handler(buildCtx(tables), input)).rejects.toThrow(
      'DISABLED'
    );
  });
  test('configuration is disabled unless both server keys and subject exist', async () => {
    enable();
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'public';
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    expect(
      (await configuration._handler(buildCtx(baseTables()), {})).enabled
    ).toBe(false);
  });
  test('unauthenticated and inactive actors cannot subscribe', async () => {
    enable();
    await expect(
      subscribe._handler(buildCtx(baseTables(), null), input)
    ).rejects.toThrow();
    const tables = baseTables();
    tables.users.find((u) => u._id === 'staff_1').isActive = false;
    await expect(subscribe._handler(buildCtx(tables), input)).rejects.toThrow();
  });
  test('same owner is idempotent and another account cannot take ownership', async () => {
    enable();
    const tables = baseTables(),
      ctx = buildCtx(tables);
    await subscribe._handler(ctx, input);
    await subscribe._handler(ctx, input);
    expect(tables.webPushSubscriptions).toHaveLength(1);
    await expect(
      subscribe._handler(buildCtx(tables, 'customer_1'), input)
    ).rejects.toThrow('SCOPE_MISMATCH');
    expect(tables.webPushSubscriptions[0].userId).toBe('staff_1');
  });
  test('unsubscribe removes only the current actor subscription', async () => {
    enable();
    const tables = baseTables();
    await subscribe._handler(buildCtx(tables), input);
    await unsubscribe._handler(context(tables, 'customer_1'), {
      endpoint: input.endpoint,
    });
    expect(tables.webPushSubscriptions).toHaveLength(1);
    await unsubscribe._handler(context(tables), { endpoint: input.endpoint });
    expect(tables.webPushSubscriptions).toHaveLength(0);
  });
  test('malformed keys are rejected', async () => {
    enable();
    await expect(
      subscribe._handler(buildCtx(baseTables()), { ...input, auth: 'bad' })
    ).rejects.toThrow('INVALID');
  });
  test('delivery targets are bounded, user-scoped, and disabled for inactive users', async () => {
    enable();
    const tables = baseTables();
    tables.webPushSubscriptions = Array.from({ length: 15 }, (_, i) => ({
      _id: `push_${i}`,
      userId: 'staff_1',
      active: true,
      ...input,
    }));
    expect(
      await deliveryTargets._handler(buildCtx(tables), { userId: 'staff_1' })
    ).toHaveLength(10);
    expect(
      await deliveryTargets._handler(buildCtx(tables), { userId: 'customer_1' })
    ).toHaveLength(0);
    tables.users.find((u) => u._id === 'staff_1').isActive = false;
    expect(
      await deliveryTargets._handler(buildCtx(tables), { userId: 'staff_1' })
    ).toHaveLength(0);
  });
});

test('web delivery claim rejects wrong owner and stale claimed work becomes unknown', async () => {
  const tables = baseTables({
    pushDeliveryOutbox: [
      { _id: 'outbox_1', toUserId: 'staff_1', webDeliveryStatus: 'pending' },
    ],
  });
  const ctx = buildCtx(tables);
  let scheduled = 0;
  ctx.scheduler = { runAfter: async () => scheduled++ };
  expect(
    await claimWebDelivery._handler(ctx, {
      outboxId: 'outbox_1',
      userId: 'customer_1',
    })
  ).toBe(false);
  expect(
    await claimWebDelivery._handler(ctx, {
      outboxId: 'outbox_1',
      userId: 'staff_1',
    })
  ).toBe(true);
  expect(
    await claimWebDelivery._handler(ctx, {
      outboxId: 'outbox_1',
      userId: 'staff_1',
    })
  ).toBe(false);
  await ctx.db.patch('outbox_1', { webClaimedAt: Date.now() - 16 * 60 * 1000 });
  expect(await expireWebClaim._handler(ctx, { outboxId: 'outbox_1' })).toBe(
    true
  );
  expect(tables.pushDeliveryOutbox[0].webDeliveryStatus).toBe('unknown');
  expect(
    await finishWebDelivery._handler(ctx, {
      outboxId: 'outbox_1',
      status: 'sent',
    })
  ).toBe(false);
  expect(scheduled).toBe(1);
});

test('new web push intent is persisted and scheduled with its outbox ID', async () => {
  enable();
  const tables = baseTables({
    pushDeliveryOutbox: [{ _id: 'outbox_2', toUserId: 'staff_1' }],
  });
  const ctx = buildCtx(tables),
    scheduled = [];
  ctx.scheduler = {
    runAfter: async (delay, fn, args) => scheduled.push({ delay, fn, args }),
  };
  await scheduleWebPush(ctx, 'staff_1', 'outbox_2');
  expect(tables.pushDeliveryOutbox[0].webDeliveryStatus).toBe('pending');
  expect(scheduled[0].args).toEqual({
    userId: 'staff_1',
    outboxId: 'outbox_2',
  });
});

test('ambiguous browser push attempt is never resent by replay', async () => {
  enable();
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'fake';
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'fake';
  process.env.WEB_PUSH_VAPID_SUBJECT = 'mailto:fake@example.com';
  const tables = baseTables({
    pushDeliveryOutbox: [
      { _id: 'outbox_3', toUserId: 'staff_1', webDeliveryStatus: 'pending' },
    ],
  });
  const ctx = buildCtx(tables);
  ctx.scheduler = { runAfter: async () => {} };
  ctx.runMutation = async (_ref, args) =>
    args.userId
      ? claimWebDelivery._handler(ctx, args)
      : finishWebDelivery._handler(ctx, args);
  ctx.runQuery = async () => [
    {
      id: 'subscription',
      endpoint: 'https://fcm.googleapis.com/fake',
      p256dh: 'fake',
      auth: 'fake',
    },
  ];
  const previous = webpush.sendNotification;
  let calls = 0;
  webpush.sendNotification = async () => {
    calls++;
    throw Error('timeout after provider may have accepted');
  };
  try {
    expect(
      await deliverWebPush._handler(ctx, {
        userId: 'staff_1',
        outboxId: 'outbox_3',
      })
    ).toEqual({ sent: 0, failed: 1 });
    expect(tables.pushDeliveryOutbox[0].webDeliveryStatus).toBe('unknown');
    expect(
      await deliverWebPush._handler(ctx, {
        userId: 'staff_1',
        outboxId: 'outbox_3',
      })
    ).toEqual({ sent: 0, failed: 0 });
    expect(calls).toBe(1);
  } finally {
    webpush.sendNotification = previous;
  }
});

test('partial browser delivery with a timeout remains unknown and is not replayed', async () => {
  enable();
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'fake';
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'fake';
  process.env.WEB_PUSH_VAPID_SUBJECT = 'mailto:fake@example.com';
  const tables = baseTables({
    pushDeliveryOutbox: [
      {
        _id: 'outbox_partial',
        toUserId: 'staff_1',
        webDeliveryStatus: 'pending',
      },
    ],
  });
  const ctx = buildCtx(tables);
  ctx.scheduler = { runAfter: async () => {} };
  ctx.runMutation = async (_ref, args) =>
    args.userId
      ? claimWebDelivery._handler(ctx, args)
      : finishWebDelivery._handler(ctx, args);
  ctx.runQuery = async () => [
    {
      id: 'a',
      endpoint: 'https://fcm.googleapis.com/a',
      p256dh: 'a',
      auth: 'a',
    },
    {
      id: 'b',
      endpoint: 'https://fcm.googleapis.com/b',
      p256dh: 'b',
      auth: 'b',
    },
  ];
  const prior = webpush.sendNotification;
  let calls = 0;
  webpush.sendNotification = async () => {
    calls++;
    if (calls === 2) throw Error('ambiguous');
  };
  try {
    expect(
      await deliverWebPush._handler(ctx, {
        userId: 'staff_1',
        outboxId: 'outbox_partial',
      })
    ).toEqual({ sent: 1, failed: 1 });
    expect(tables.pushDeliveryOutbox[0].webDeliveryStatus).toBe('unknown');
    await deliverWebPush._handler(ctx, {
      userId: 'staff_1',
      outboxId: 'outbox_partial',
    });
    expect(calls).toBe(2);
  } finally {
    webpush.sendNotification = prior;
  }
});

test('temporarily unavailable browser push configuration does not claim or lose pending work', async () => {
  enable();
  delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  let claimed = false;
  const result = await deliverWebPush._handler(
    {
      runMutation: async () => {
        claimed = true;
      },
      runQuery: async () => {
        throw Error('unexpected delivery');
      },
    },
    { userId: 'staff_1', outboxId: 'outbox_pending' }
  );
  expect(result).toEqual({ sent: 0, failed: 0 });
  expect(claimed).toBe(false);
});

test('deferred browser marketing delivery skips withdrawn consent before requesting the provider', async () => {
  const userId = 'staff_1';
  const tables = baseTables({
    pushDeliveryOutbox: [
      {
        _id: 'outbox_consent',
        toUserId: userId,
        campaignId: 'campaign_1',
        webDeliveryStatus: 'pending',
      },
    ],
  });
  const ctx = context(tables);
  await ctx.db.patch(userId, { marketingOptIn: false });
  expect(
    await claimWebDelivery._handler(ctx, { outboxId: 'outbox_consent', userId })
  ).toBeFalse();
  expect(tables.pushDeliveryOutbox[0].webDeliveryStatus).toBe('skipped');
});
