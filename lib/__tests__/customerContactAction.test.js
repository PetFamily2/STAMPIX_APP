import { describe, expect, test } from 'bun:test';

import { resolveCustomerContactRecommendation } from '../customers/contactAction';

describe('customer contact recommendation', () => {
  test('is triggered only by the existing NEEDS_WINBACK state', () => {
    expect(
      resolveCustomerContactRecommendation({
        customerState: 'ACTIVE',
        phone: '050-123-4567',
        email: null,
      })
    ).toBeNull();
  });

  test('uses a normalized real phone and falls back to a valid email', () => {
    expect(
      resolveCustomerContactRecommendation({
        customerState: 'NEEDS_WINBACK',
        phone: '+972 (50) 123-4567',
        email: 'customer@example.com',
      })
    ).toEqual({ kind: 'phone', href: 'tel:+972501234567' });

    expect(
      resolveCustomerContactRecommendation({
        customerState: 'NEEDS_WINBACK',
        phone: '123',
        email: 'customer@example.com',
      })
    ).toEqual({
      kind: 'email',
      href: 'mailto:customer%40example.com',
    });
  });

  test('suppresses passive recommendations without a valid contact method', () => {
    expect(
      resolveCustomerContactRecommendation({
        customerState: 'NEEDS_WINBACK',
        phone: null,
        email: 'not-an-email',
      })
    ).toBeNull();
  });
});
