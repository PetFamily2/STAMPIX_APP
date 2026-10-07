import { expect, test } from 'bun:test';
import { canPaintPublicWelcome } from '../auth/publicWelcome';
test('only Web public welcome can paint during session hydration', () => {
  expect(canPaintPublicWelcome('web', ['(auth)', 'welcome'])).toBe(true);
  for (const platform of ['ios', 'android']) expect(canPaintPublicWelcome(platform, ['(auth)', 'welcome'])).toBe(false);
  for (const segments of [[], ['welcome'], ['(authenticated)', 'welcome'], ['(auth)', 'name-capture'], ['(auth)', 'oauth-callback'], ['(auth)', 'welcome', 'private'], ['(authenticated)', '(customer)', 'wallet'], ['(web-business)', 'business']])
    expect(canPaintPublicWelcome('web', segments)).toBe(false);
});
