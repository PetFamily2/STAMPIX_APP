import { describe, expect, test } from 'bun:test';
import { Password } from '@convex-dev/auth/providers/Password';
import {
  MANUAL_QA_BRANCH,
  MANUAL_QA_PASSWORD,
  MANUAL_QA_PREVIEW_NAME,
  manualQaBackendEnabled,
  manualQaClientEnabled,
  manualQaPasswordProfile,
} from '../auth/manualQaPolicy';

const url = 'https://synthetic-preview.convex.cloud';
const env = {
  STAMPAIX_ENV: 'preview',
  MANUAL_QA_ENABLED: 'true',
  MANUAL_QA_DEPLOYMENT_TYPE: 'preview',
  MANUAL_QA_SOURCE_BRANCH: MANUAL_QA_BRANCH,
  MANUAL_QA_PASSWORD,
  PHASE3_PREVIEW_NAME: MANUAL_QA_PREVIEW_NAME,
  CONVEX_CLOUD_URL: url,
  CONVEX_SITE_URL: url.replace('.cloud', '.site'),
  PHASE3_PREVIEW_URL: url,
  PHASE3_FIXTURE_SECRET: 's'.repeat(40),
};
const input = {
  platform: 'web',
  environment: 'preview',
  flag: 'true',
  url,
  previewUrl: url,
  backend: 'verified-preview',
};

describe('manual Preview login must fail closed', () => {
  test('exact dedicated Preview is required on both sides', () => {
    expect(manualQaBackendEnabled(env)).toBe(true);
    expect(manualQaClientEnabled(input)).toBe(true);
    expect(manualQaBackendEnabled({})).toBe(false);
    expect(manualQaClientEnabled({ platform: 'web' })).toBe(false);
  });
  test.each(
    Object.keys(env)
  )('missing server gate %s prevents login', (key) => {
    expect(manualQaBackendEnabled({ ...env, [key]: undefined })).toBe(false);
  });
  test.each([
    { STAMPAIX_ENV: 'prod' },
    { STAMPAIX_ENV: 'dev' },
    { MANUAL_QA_DEPLOYMENT_TYPE: 'prod' },
    { MANUAL_QA_DEPLOYMENT_TYPE: 'dev' },
    { MANUAL_QA_SOURCE_BRANCH: 'main' },
    { MANUAL_QA_ENABLED: 'false' },
    { PHASE3_PREVIEW_NAME: 'other-preview' },
    { CONVEX_CLOUD_URL: 'https://other-preview.convex.cloud' },
    { CONVEX_SITE_URL: 'https://other-preview.convex.site' },
    { PHASE3_PREVIEW_URL: 'http://synthetic-preview.convex.cloud' },
    { MANUAL_QA_PASSWORD: 'production-password' },
  ])('wrong environment/binding cannot authorize QA: %j', (change) => {
    const disabled = { ...env, ...change };
    expect(manualQaBackendEnabled(disabled)).toBe(false);
    expect(() =>
      manualQaPasswordProfile(
        {
          flow: 'signIn',
          email: 'phase3-owner@example.invalid',
          password: MANUAL_QA_PASSWORD,
        },
        disabled
      )
    ).toThrow('MANUAL_QA_DISABLED');
  });
  test.each([
    { environment: 'prod' },
    { environment: 'dev' },
    { flag: 'false' },
    { flag: undefined },
    { platform: 'ios' },
    { platform: 'android' },
    { backend: 'verified-production' },
    { previewUrl: 'https://other-preview.convex.cloud' },
    {
      url: 'https://utmost-fennec-280.convex.cloud',
      previewUrl: 'https://utmost-fennec-280.convex.cloud',
    },
    {
      url: 'https://aware-llama-850.convex.cloud',
      previewUrl: 'https://aware-llama-850.convex.cloud',
    },
  ])('client denies %j', (change) =>
    expect(manualQaClientEnabled({ ...input, ...change })).toBe(false));
  test('credentials cannot create real users or publicly provision synthetic accounts', () => {
    expect(() =>
      manualQaPasswordProfile(
        { email: 'real@example.com', flow: 'signIn' },
        env
      )
    ).toThrow();
    expect(() =>
      manualQaPasswordProfile(
        { email: 'phase3-owner@example.invalid', flow: 'signUp' },
        env
      )
    ).toThrow('MANUAL_QA_PROVISIONING_DENIED');
    expect(() =>
      manualQaPasswordProfile(
        { email: 'phase3-owner@example.invalid', flow: 'reset' },
        env
      )
    ).toThrow('MANUAL_QA_FLOW_DENIED');
    expect(
      manualQaPasswordProfile(
        {
          email: 'phase3-owner@example.invalid',
          flow: 'signUp',
          qaProvisioningSecret: env.PHASE3_FIXTURE_SECRET,
        },
        env
      )
    ).toEqual({ email: 'phase3-owner@example.invalid' });
    expect(
      manualQaPasswordProfile(
        { email: 'ordinary@example.com', flow: 'signIn' },
        {}
      )
    ).toEqual({ email: 'ordinary@example.com' });
  });
  test('actual Password provider rejects forbidden QA before touching any auth account', async () => {
    let authCalls = 0;
    const provider = Password({
      profile: (params) =>
        manualQaPasswordProfile(params, { ...env, STAMPAIX_ENV: 'prod' }),
    });
    await expect(
      provider.options.authorize(
        {
          flow: 'signIn',
          email: 'phase3-owner@example.invalid',
          password: MANUAL_QA_PASSWORD,
        },
        {
          runMutation: () => {
            authCalls++;
            throw new Error('unexpected auth call');
          },
        }
      )
    ).rejects.toThrow('MANUAL_QA_DISABLED');
    expect(authCalls).toBe(0);
  });
});
