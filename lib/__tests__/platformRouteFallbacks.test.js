import { expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { missingPlatformRouteFallbacks } from '../navigation/platformRouteFallbacks.mjs';

test('nested Web routes without a fallback are rejected before export', () => {
  expect(
    missingPlatformRouteFallbacks([
      'app/business/customer-referrals.web.tsx',
      'app/business/billing.web.tsx',
      'app/business/billing.tsx',
    ])
  ).toEqual(['app/business/customer-referrals.web.tsx']);
});
test('platform siblings and mixed supported source extensions are accepted', () => {
  expect(
    missingPlatformRouteFallbacks([
      'app/profile.web.tsx',
      'app/profile.android.tsx',
      'app/profile.ts',
    ])
  ).toEqual([]);
});
test('every actual Expo platform route has its universal fallback', () => {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else files.push(file);
    }
  }
  visit('app');
  expect(missingPlatformRouteFallbacks(files)).toEqual([]);
});
