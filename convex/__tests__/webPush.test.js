import { afterEach, describe, expect, test } from 'bun:test';
import {
  allowedPushEndpoint,
  configuration,
  deliveryTargets,
  subscribe,
  unsubscribe,
} from '../webPush';
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
