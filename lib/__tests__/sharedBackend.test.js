import { expect, test } from 'bun:test';
import {
  SHARED_BACKEND_URL,
  sharedBackendEnabled,
} from '../../config/sharedBackend';
import { scannerCommandsEnabled } from '../web-scanner/previewGate';

const input = {
  platform: 'web',
  environment: 'preview',
  sharedBackend: 'true',
  flag: 'true',
  url: SHARED_BACKEND_URL,
  actorId: 'ordinary-actor',
  businessId: 'ordinary-business',
};
test('ordinary scanner uses the same backend without fixture identity allowlists', () => {
  expect(scannerCommandsEnabled(input)).toBe(true);
  expect(scannerCommandsEnabled({ ...input, environment: 'development' })).toBe(
    true
  );
});
test.each([
  { platform: 'ios' },
  { platform: 'android' },
  { environment: 'production' },
  { sharedBackend: 'false' },
  { actorId: '' },
  { businessId: '' },
  { flag: 'false' },
  { url: 'https://aware-llama-850.convex.cloud' },
  { url: 'https://dependable-squirrel-701.convex.cloud' },
])('shared availability cannot activate another target or unauthenticated scanner: %j', (change) => {
  expect(scannerCommandsEnabled({ ...input, ...change })).toBe(false);
});
test('unrecognized environments cannot select the shared database', () => {
  expect(sharedBackendEnabled({ flag: 'true', url: SHARED_BACKEND_URL })).toBe(
    false
  );
});
