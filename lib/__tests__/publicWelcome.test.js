import { expect, test } from 'bun:test';
import { canPaintPublicWelcome } from '../auth/publicWelcome';

test('public Web welcome can paint independently of a network session', () => {
  expect(canPaintPublicWelcome('web', '/welcome')).toBe(true);
  for (const platform of ['ios', 'android'])
    expect(canPaintPublicWelcome(platform, '/welcome')).toBe(false);
  for (const path of [
    '/wallet',
    '/business',
    '/staff',
    '/oauth-callback',
    '/name-capture',
    '/onboarding-client-name',
    '/welcome/private',
    '/welcome?token=x',
  ])
    expect(canPaintPublicWelcome('web', path)).toBe(false);
});
