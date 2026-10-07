import { describe, expect, test } from 'bun:test';
import {
  readWebAuthWithDeadline,
  requireWebAuthProvider,
} from '../auth/webProviderAvailability';

describe('Web provider preflight before initiating sign-in', () => {
  test('an offline read has a bounded unavailable state', async () => {
    await expect(
      readWebAuthWithDeadline(() => new Promise(() => {}), 5)
    ).rejects.toThrow('WEB_AUTH_CONFIGURATION_UNAVAILABLE');
  });
  test.each([
    'google',
    'apple',
    'email',
  ])('missing %s never initiates authentication', async (provider) => {
    let writes = 0;
    await expect(
      (async () => {
        await requireWebAuthProvider(provider, async () => ({
          google: false,
          apple: false,
          email: false,
        }));
        writes++;
      })()
    ).rejects.toThrow('WEB_AUTH_PROVIDER_NOT_CONFIGURED');
    expect(writes).toBe(0);
  });
  test('offline/unknown configuration fails closed', async () => {
    await expect(
      requireWebAuthProvider('google', async () => {
        throw new Error('offline');
      })
    ).rejects.toThrow('WEB_AUTH_CONFIGURATION_UNAVAILABLE');
    await expect(
      requireWebAuthProvider('google', async () => ({}))
    ).rejects.toThrow('WEB_AUTH_PROVIDER_NOT_CONFIGURED');
  });
  test('fresh configuration is rechecked after a provider is removed', async () => {
    let ready = true;
    const read = async () => ({ google: ready, apple: false, email: false });
    await requireWebAuthProvider('google', read);
    ready = false;
    await expect(requireWebAuthProvider('google', read)).rejects.toThrow(
      'WEB_AUTH_PROVIDER_NOT_CONFIGURED'
    );
  });
});
