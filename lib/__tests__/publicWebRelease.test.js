import { expect, test } from 'bun:test';
import { resolveWebRoleRoutingFlag } from '../auth/webRoleRouting';
import {
  productionPilotEnabled,
  productionPublicEnabled,
} from '../pwa/releaseGate';
import { scannerCommandsEnabled } from '../web-scanner/previewGate';

const publicScanner = {
  platform: 'web',
  environment: 'production',
  releaseGate: 'accepted-web-public-v1',
  flag: 'true',
  backend: 'verified-production',
  actorId: 'ordinary-actor',
  businessId: 'ordinary-business',
  url: 'https://release-example.convex.cloud',
  prodUrl: 'https://release-example.convex.cloud',
  previewUrl: 'https://preview-example.convex.cloud',
};
test('public release is explicit and separate from the restricted pilot', () => {
  expect(productionPublicEnabled('production', 'accepted-web-public-v1')).toBe(
    true
  );
  expect(productionPilotEnabled('production', 'accepted-web-public-v1')).toBe(
    false
  );
  expect(scannerCommandsEnabled(publicScanner)).toBe(true);
  for (const change of [
    { environment: 'preview' },
    { releaseGate: '' },
    { releaseGate: 'accepted-web-public-v1 ' },
    { actorId: '' },
    { businessId: '' },
    { backend: 'existing-shared' },
    { flag: 'false' },
    { url: publicScanner.previewUrl },
    { prodUrl: publicScanner.previewUrl },
    { platform: 'ios' },
    { platform: 'android' },
  ]) {
    expect(scannerCommandsEnabled({ ...publicScanner, ...change })).toBe(false);
  }
});
test('a public flag cannot select a known development backend', () => {
  for (const host of ['utmost-fennec-280']) {
    const url = `https://${host}.convex.cloud`;
    expect(
      scannerCommandsEnabled({ ...publicScanner, url, prodUrl: url })
    ).toBe(false);
  }
});
test('ordinary role routing still requires a Web platform and explicit feature flag', () => {
  const input = {
    platform: 'web',
    appEnvironment: 'production',
    flag: 'true',
    releaseGate: 'accepted-web-public-v1',
  };
  expect(resolveWebRoleRoutingFlag(input)).toBe(true);
  expect(resolveWebRoleRoutingFlag({ ...input, flag: undefined })).toBe(false);
  expect(resolveWebRoleRoutingFlag({ ...input, platform: 'android' })).toBe(
    false
  );
});
