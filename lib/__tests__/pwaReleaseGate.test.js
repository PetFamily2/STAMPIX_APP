import { expect, test } from 'bun:test';
import { productionPilotEnabled } from '../pwa/releaseGate.js';
import { resolveWebRoleRoutingFlag } from '../auth/webRoleRouting';
import { scannerProductionPilotEnabled } from '../web-scanner/previewGate';
test('Production requires exact physical-verification attestation and explicit opt-in', () => {
  for (const gate of [undefined, '', 'true', 'DEVICE_VERIFY', 'device-verified-pilot-v1 '])
    expect(productionPilotEnabled('production', gate)).toBe(false);
  expect(productionPilotEnabled('preview', 'device-verified-pilot-v1')).toBe(false);
  expect(productionPilotEnabled('production', 'device-verified-pilot-v1')).toBe(true);
  expect(resolveWebRoleRoutingFlag({ platform: 'web', appEnvironment: 'production', flag: 'true' })).toBe(false);
  expect(resolveWebRoleRoutingFlag({ platform: 'web', appEnvironment: 'production', flag: 'true', releaseGate: 'device-verified-pilot-v1' })).toBe(true);
  expect(resolveWebRoleRoutingFlag({ platform: 'ios', appEnvironment: 'production', flag: 'true', releaseGate: 'device-verified-pilot-v1' })).toBe(false);
});
test('scanner pilot pins the Production URL and both scope allowlists; Preview identities cannot enable it', () => {
  const valid = { platform: 'web', environment: 'production', releaseGate: 'device-verified-pilot-v1', flag: 'true', backend: 'verified-production', actorId: 'pilot', businessId: 'pilot-business', actors: 'pilot', businesses: 'pilot-business', url: 'https://synthetic-production.convex.cloud', prodUrl: 'https://synthetic-production.convex.cloud', previewUrl: 'https://synthetic-preview.convex.cloud' };
  expect(scannerProductionPilotEnabled(valid)).toBe(true);
  for (const change of [{ platform: 'android' }, { environment: 'preview' }, { releaseGate: undefined }, { flag: 'false' }, { backend: 'verified-preview' }, { actors: undefined }, { businesses: undefined }, { actorId: 'other' }, { businessId: 'other' }, { url: valid.previewUrl }, { url: 'https://utmost-fennec-280.convex.cloud', prodUrl: 'https://utmost-fennec-280.convex.cloud' }, { url: 'http://synthetic-production.convex.cloud', prodUrl: 'http://synthetic-production.convex.cloud' }])
    expect(scannerProductionPilotEnabled({ ...valid, ...change })).toBe(false);
});
