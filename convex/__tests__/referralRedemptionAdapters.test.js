import { describe, expect, test } from 'bun:test';

import {
  createAppleRedemptionProvider,
  createGoogleRedemptionProvider,
} from '../lib/referrals/redemptionProvider';

describe('Google referral redemption adapter', () => {
  test('eligible reward calls exactly one supported defer request', async () => {
    const calls = [];
    const provider = createGoogleRedemptionProvider({
      secretApiKey: 'test_secret',
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return {
          ok: true,
          json: async () => ({ expiry_time_ms: 123 }),
        };
      },
    });
    const prepared = provider.canRedeem({
      months: 1,
      hasActivePaidSubscription: true,
      storeProductId: 'stampaix_pro:monthly',
    });
    expect(prepared.canRedeem).toBe(true);
    const result = await provider.apply({
      months: 1,
      providerAppUserId: 'ba_abc',
      productId: 'stampaix_pro:monthly',
      idempotencyKey: 'reward_1',
    });
    expect(calls).toHaveLength(1);
    expect(result.ok).toBe(true);
    expect(result.monthsConfirmed).toBe(1);
    expect(result.newPeriodEndAt).toBe(123);
  });

  test('provider failure leaves reward unredeemed and retry is idempotent', async () => {
    const provider = createGoogleRedemptionProvider({
      secretApiKey: 'test_secret',
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    const first = await provider.apply({
      months: 2,
      providerAppUserId: 'ba_abc',
      productId: 'stampaix_pro:yearly',
      idempotencyKey: 'reward_2',
    });
    const second = await provider.apply({
      months: 2,
      providerAppUserId: 'ba_abc',
      productId: 'stampaix_pro:yearly',
      idempotencyKey: 'reward_2',
    });
    expect(first.ok).toBe(false);
    expect(second.requestFingerprint).toBe(first.requestFingerprint);
  });
});

describe('Apple referral redemption adapter', () => {
  test('unsupported offer does not burn the reward', () => {
    const provider = createAppleRedemptionProvider({
      promotionalOfferByMonths: {},
    });
    const prepared = provider.canRedeem({
      months: 1,
      hasActivePaidSubscription: true,
    });
    expect(prepared.canRedeem).toBe(false);
    expect(prepared.code).toBe('PROMO_OFFER_UNCONFIGURED');
  });

  test('prepared promotional offer waits for Store confirmation', async () => {
    const provider = createAppleRedemptionProvider({
      promotionalOfferByMonths: { 1: 'promo_1m' },
    });
    const prepared = provider.canRedeem({
      months: 1,
      hasActivePaidSubscription: true,
    });
    expect(prepared.canRedeem).toBe(true);
    if (prepared.canRedeem) {
      expect(prepared.offerIdentifier).toBe('promo_1m');
    }
    const applied = await provider.apply({
      months: 1,
      providerAppUserId: 'ba_abc',
      idempotencyKey: 'apple_1',
    });
    expect(applied.ok).toBe(false);
    expect(applied.failureCode).toBe('AWAITING_STOREKIT_CONFIRMATION');
  });
});
