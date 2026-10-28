import { afterEach, expect, test } from 'bun:test';
import { Alert, alertSnapshot, clearAlerts, closeAlert } from '../alert.web';
import { mapZoom, validCoordinate } from '../maps/webMap';
import { businessHref } from '../navigation/businessHref';
import { Share } from '../share.web';
import { previewInviteUrl } from '../shareUrl.web';

const previousNavigator = globalThis.navigator;
afterEach(() => {
  clearAlerts();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: previousNavigator,
  });
});
test('dialog queue preserves explicit confirmation callbacks and resets stale scope', () => {
  let invoked = 0;
  Alert.alert('Delete', 'Confirm', [
    { text: 'Cancel' },
    { text: 'Delete', onPress: () => invoked++ },
  ]);
  Alert.alert('Next');
  const current = alertSnapshot();
  expect(invoked).toBe(0);
  current.buttons[1].onPress();
  closeAlert(current.id);
  expect(invoked).toBe(1);
  expect(alertSnapshot().title).toBe('Next');
  clearAlerts();
  expect(alertSnapshot()).toBeNull();
});
test('desktop share uses clipboard, unavailable sharing fails without false success', async () => {
  let copied;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (value) => {
          copied = value;
        },
      },
    },
  });
  expect((await Share.share({ message: 'synthetic invite' })).action).toBe(
    'copiedAction'
  );
  expect(copied).toBe('synthetic invite');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {},
  });
  await expect(Share.share({ message: 'not copied' })).rejects.toThrow(
    'UNAVAILABLE'
  );
});
test('browser share dismissal is not reported as shared', async () => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      share: async () => {
        throw new DOMException('cancel', 'AbortError');
      },
    },
  });
  expect((await Share.share({ message: 'invite' })).action).toBe(
    'dismissedAction'
  );
});
test('coordinates and zoom stay finite and bounded', () => {
  expect(validCoordinate(32, 35)).toBe(true);
  for (const lat of [Infinity, NaN, 91, -91])
    expect(validCoordinate(lat, 35)).toBe(false);
  expect(validCoordinate(0, 181)).toBe(false);
  expect(mapZoom(0)).toBeGreaterThanOrEqual(3);
  expect(mapZoom(0)).toBeLessThanOrEqual(18);
  expect(Number.isFinite(mapZoom(NaN))).toBe(true);
  expect(mapZoom(360)).toBe(3);
});
test('Native navigation remains identical while Web uses real management routes', () => {
  for (const path of [
    '/(authenticated)/(business)/cards',
    '/(authenticated)/(business)/cards/new',
    '/(authenticated)/(business)/cards/[programId]',
  ]) {
    expect(businessHref('ios', path)).toBe(path);
    expect(businessHref('android', path)).toBe(path);
    expect(businessHref('web', path)).toMatch(/^\/business\//);
  }
});

test('synthetic Preview invitations remain in the same isolated Web origin', () => {
  const origin = 'https://stampaix-business--abc123.expo.app';
  expect(
    previewInviteUrl(
      'https://stampaix.com/join?ref=synthetic',
      'preview',
      origin
    )
  ).toBe(`${origin}/join?ref=synthetic`);
  expect(
    previewInviteUrl('https://stampaix.com/join?ref=synthetic', 'prod', origin)
  ).toBe('https://stampaix.com/join?ref=synthetic');
  expect(
    previewInviteUrl(
      'https://evil.example/join?ref=synthetic',
      'preview',
      origin
    )
  ).toBe('https://evil.example/join?ref=synthetic');
});

test('pending write fence remains busy until every operation ends and tolerates duplicate cleanup', async () => {
  const { beginPendingWrite, pendingWriteCount } = await import(
    '../network/pendingWrites'
  );
  const first = beginPendingWrite(),
    second = beginPendingWrite();
  expect(pendingWriteCount()).toBe(2);
  first();
  first();
  expect(pendingWriteCount()).toBe(1);
  second();
  expect(pendingWriteCount()).toBe(0);
});
