import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { generateNumericCode, generateReferralCode } from '../lib/secureRandom';

function queue(values) {
  const pending = [...values];
  return (target) => {
    for (let index = 0; index < target.length; index += 1) {
      const next = pending.shift();
      if (next === undefined) {
        throw new Error('test random source exhausted');
      }
      target[index] = next;
    }
    return target;
  };
}

function alwaysRejected(target) {
  target.fill(255);
  return target;
}

describe('secure identifiers', () => {
  test('numeric codes reject biased bytes and keep a 6-digit format', () => {
    expect(generateNumericCode(6, queue([0, 1, 2, 3, 4, 5]))).toBe('012345');
    expect(generateNumericCode(4, queue([250, 251, 9, 0, 8, 7]))).toBe('9087');
    expect(generateNumericCode(6, queue([0, 1, 2, 3, 4, 5]))).toMatch(
      /^\d{6}$/
    );
  });

  test('referral codes keep the historical prefix, length, and alphabet', () => {
    const now = Date.UTC(2026, 0, 15);
    const timePart = now.toString(36).slice(-4).toUpperCase();
    const customerCode = generateReferralCode(
      'ref',
      now,
      queue([0, 1, 2, 3, 4, 5])
    );
    const businessCode = generateReferralCode(
      'bref',
      now,
      queue([10, 11, 12, 13, 14, 15])
    );

    expect(customerCode).toBe(`REF_012345${timePart}`);
    expect(customerCode).toMatch(/^REF_[0-9A-Z]{10}$/);
    expect(businessCode).toMatch(/^BREF_[0-9A-Z]{10}$/);
    expect(businessCode.startsWith('BREF_')).toBe(true);
  });

  test('a rejected-only source fails closed', () => {
    expect(() => generateNumericCode(1, alwaysRejected)).toThrow(
      'SECURE_RANDOM_EXHAUSTED'
    );
    expect(() => generateReferralCode('ref', 1, alwaysRejected)).toThrow(
      'SECURE_RANDOM_EXHAUSTED'
    );
  });

  test('OTP and referral generators no longer use Math.random', () => {
    const auth = readFileSync('convex/auth.ts', 'utf8');
    const otp = readFileSync('convex/otp.ts', 'utf8');
    const referrals = readFileSync('convex/referrals.ts', 'utf8');

    expect(auth).not.toContain('Math.random');
    expect(otp).not.toContain('Math.random');
    expect(referrals).not.toContain('Math.random');
    expect(auth).toContain('generateNumericCode(EMAIL_OTP_LENGTH)');
    expect(otp).toContain('generateNumericCode(OTP_LENGTH)');
    expect(referrals).toContain('generateReferralCode(prefix)');
  });
});
