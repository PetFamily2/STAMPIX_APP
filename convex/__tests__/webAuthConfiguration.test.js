import { describe, expect, test } from 'bun:test';
import { readWebAuthProviderAvailability } from '../lib/webAuthConfiguration';

const configured = {
  AUTH_GOOGLE_ID: '123-synthetic.apps.googleusercontent.com',
  AUTH_GOOGLE_SECRET: 'synthetic-google-secret',
  AUTH_APPLE_ID: 'com.synthetic.preview',
  AUTH_APPLE_SECRET: 'synthetic-apple-secret',
  AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY: btoa('x'.repeat(32)),
  RESEND_API_KEY: 'synthetic-resend-key',
  RESEND_FROM_EMAIL: 'synthetic@example.invalid',
};

describe('public Web auth configuration readiness', () => {
  test('missing server credentials cannot enable a provider', () => {
    expect(readWebAuthProviderAvailability({})).toEqual({
      google: false,
      apple: false,
      email: false,
    });
  });
  test('only public booleans leave the server', () => {
    const result = readWebAuthProviderAvailability(configured);
    expect(result).toEqual({ google: true, apple: true, email: true });
    expect(
      Object.values(result).every((value) => typeof value === 'boolean')
    ).toBe(true);
  });
  test.each([
    'undefined',
    'null',
    'placeholder',
    '',
    '123-synthetic.apps.googleusercontent.com ',
    'not-a-google-client',
  ])('invalid client id fails closed: %s', (value) => {
    expect(
      readWebAuthProviderAvailability({ ...configured, AUTH_GOOGLE_ID: value })
        .google
    ).toBe(false);
  });
  test.each([
    'undefined',
    'null',
    'placeholder',
    '',
    ' synthetic-secret ',
  ])('missing/placeholder secret fails closed: %s', (value) => {
    expect(
      readWebAuthProviderAvailability({
        ...configured,
        AUTH_GOOGLE_SECRET: value,
      }).google
    ).toBe(false);
  });
  test.each([
    undefined,
    '',
    'bad!',
    btoa('x'.repeat(31)),
    btoa('x'.repeat(33)),
  ])('OAuth requires a valid token encryption key', (value) => {
    expect(
      readWebAuthProviderAvailability({
        ...configured,
        AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY: value,
      })
    ).toEqual({ google: false, apple: false, email: true });
  });
  test('existing encryption keys use the same whitespace normalization as token storage', () => {
    expect(
      readWebAuthProviderAvailability({
        ...configured,
        AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY: ` \n${configured.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY}\r\n `,
      })
    ).toEqual({ google: true, apple: true, email: true });
    expect(
      readWebAuthProviderAvailability({
        ...configured,
        AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY: ' \r\n ',
      })
    ).toEqual({ google: false, apple: false, email: true });
  });
  test('email fallback is unavailable when delivery is not configured', () => {
    expect(
      readWebAuthProviderAvailability({ ...configured, RESEND_API_KEY: '' })
        .email
    ).toBe(false);
    expect(
      readWebAuthProviderAvailability({ ...configured, RESEND_FROM_EMAIL: '' })
        .email
    ).toBe(false);
  });
});
