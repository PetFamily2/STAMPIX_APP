import { describe, expect, test } from 'bun:test';
import { normalizeSignInEmail } from '../lib/signInEmail';

describe('email OTP recipient identity', () => {
  test.each([
    [' Alice+rewards@Example.COM ', 'alice+rewards@example.com'],
    ["o'brien@example.co.il", "o'brien@example.co.il"],
    ['alice@xn--4dbib1b.example', 'alice@xn--4dbib1b.example'],
  ])('canonical account and recipient are identical for %s', (input, output) => {
    expect(normalizeSignInEmail(input)).toBe(output);
  });

  test.each([
    'Ａlice＠example.com',
    'victim@example.com＠attacker.test',
    'victim＠example.com@attacker.test',
    'victim@example.com﹫attacker.test',
    'victim@example.com,attacker@test.invalid',
    'victim@example.com;attacker@test.invalid',
    'Victim <victim@example.com>',
    'victim@example.com\r\nBcc:attacker@test.invalid',
    'victim\u200b@example.com',
    'victim\u202e@example.com',
    'victim@exámple.com',
    'משתמש@example.com',
    'victim@example..com',
    'victim@-example.com',
    'victim@example-.com',
    'victim@example.com.',
    '.victim@example.com',
    'victim.@example.com',
    'vic..tim@example.com',
    'victim@localhost',
    `${'a'.repeat(65)}@example.com`,
    `victim@${'a'.repeat(64)}.com`,
    '',
    ' ',
    null,
    {},
  ])('rejects ambiguous or unsupported recipient before delivery: %s', (input) => {
    expect(() => normalizeSignInEmail(input)).toThrow('INVALID_EMAIL');
  });
});
