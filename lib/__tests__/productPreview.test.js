import { describe, expect, test } from 'bun:test';
import {
  approvedProductProviderEnvironment,
  productPreviewPublicEnvironment,
  requireProductPreviewTarget,
} from '../../scripts/lib/product-preview-guard.mjs';
import {
  scannerCommandsEnabled,
  scannerProductPreviewEnabled,
} from '../web-scanner/previewGate';

const authorization = {
  deploymentType: 'preview',
  reference: 'preview/stampaix-product-preview',
  deploymentName: 'dedicated-product-123',
  url: 'https://dedicated-product-123.convex.cloud',
  adminKey: 'preview-only-test-key-value',
};
const target = requireProductPreviewTarget(authorization);
const scanner = {
  platform: 'web',
  environment: 'preview',
  productPreview: 'true',
  flag: 'true',
  backend: 'verified-preview',
  actorId: 'ordinary-actor',
  businessId: 'ordinary-business',
  url: target.url,
  previewUrl: target.url,
  prodUrl: 'https://aware-llama-850.convex.cloud',
};
describe('ordinary product Preview isolation', () => {
  test('accepts only the named, authorized Preview and denies DEV, Production and synthetic targets', () => {
    expect(target.url).toBe(authorization.url);
    for (const patch of [
      { deploymentType: 'prod' },
      { reference: 'preview/stampaix-pwa-phase3-e2e' },
      { adminKey: '' },
      { url: 'https://other-target.convex.cloud' },
      ...['utmost-fennec-280', 'aware-llama-850', 'dazzling-hound-780'].map(
        (deploymentName) => ({
          deploymentName,
          url: `https://${deploymentName}.convex.cloud`,
        })
      ),
    ])
      expect(() =>
        requireProductPreviewTarget({ ...authorization, ...patch })
      ).toThrow();
  });
  test('ordinary export hides QA and never inherits provider secrets', () => {
    const env = productPreviewPublicEnvironment(target);
    expect(env.EXPO_PUBLIC_APP_ENV).toBe('preview');
    expect(env.EXPO_PUBLIC_MANUAL_QA_ENABLED).toBe('false');
    expect(env.EXPO_PUBLIC_WEB_QR_LAB).toBe('false');
    expect(env.EXPO_PUBLIC_CONVEX_URL).toBe(target.url);
    expect(
      Object.keys(env).every((name) => name.startsWith('EXPO_PUBLIC_'))
    ).toBe(true);
    expect(JSON.stringify(env)).not.toContain(authorization.adminKey);
  });
  test('provider copy requires an explicit target binding and SUMIT test mode', () => {
    const source = {
      AUTH_GOOGLE_SECRET: 'dedicated-test-secret',
      SUMIT_API_KEY: 'dedicated-test-key',
    };
    expect(approvedProductProviderEnvironment(source, target)).toEqual({});
    expect(
      approvedProductProviderEnvironment(
        { ...source, PRODUCT_PREVIEW_AUTH_APPROVED_URL: target.url },
        target
      )
    ).toEqual({ AUTH_GOOGLE_SECRET: source.AUTH_GOOGLE_SECRET });
    expect(() =>
      approvedProductProviderEnvironment(
        {
          ...source,
          PRODUCT_PREVIEW_AUTH_APPROVED_URL: 'https://wrong.convex.cloud',
        },
        target
      )
    ).toThrow();
    expect(() =>
      approvedProductProviderEnvironment(
        {
          ...source,
          PRODUCT_PREVIEW_SUMIT_APPROVED_URL: target.url,
          SUMIT_ENV: 'production',
        },
        target
      )
    ).toThrow();
    expect(
      approvedProductProviderEnvironment(
        {
          ...source,
          PRODUCT_PREVIEW_SUMIT_APPROVED_URL: target.url,
          SUMIT_ENV: 'test',
        },
        target
      )
    ).toEqual({ SUMIT_ENV: 'test', SUMIT_API_KEY: source.SUMIT_API_KEY });
  });
});
describe('ordinary scanner availability still requires a real scoped actor', () => {
  test('ordinary actors are enabled without fixture allowlists', () => {
    expect(scannerProductPreviewEnabled(scanner)).toBe(true);
    expect(scannerCommandsEnabled(scanner)).toBe(true);
  });
  test('fails closed outside explicit verified Web Preview scope', () => {
    for (const patch of [
      { platform: 'ios' },
      { platform: 'android' },
      { environment: 'dev' },
      { environment: 'production' },
      { productPreview: 'false' },
      { flag: 'false' },
      { backend: 'verified-production' },
      { actorId: '' },
      { businessId: '' },
      { previewUrl: 'https://wrong.convex.cloud' },
      { prodUrl: target.url },
      ...['utmost-fennec-280', 'aware-llama-850'].map((name) => ({
        url: `https://${name}.convex.cloud`,
        previewUrl: `https://${name}.convex.cloud`,
      })),
    ])
      expect(scannerProductPreviewEnabled({ ...scanner, ...patch })).toBe(
        false
      );
  });
});
