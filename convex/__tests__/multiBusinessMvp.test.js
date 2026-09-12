import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { MVP_FEATURE_FLAGS } from '../lib/billing/productionContract';
import { assertMvpAdditionalBusinessCreationAllowed } from '../business';

describe('multi-business MVP disablement', () => {
  test('canonical flag disables additional business creation', () => {
    expect(MVP_FEATURE_FLAGS.additionalBusinessCreationEnabled).toBe(false);
    expect(MVP_FEATURE_FLAGS).not.toHaveProperty('maxBusinesses');
  });

  test('server creation path blocks a second business', async () => {
    const ctx = {
      db: {
        query: () => {
          const chain = {
            withIndex: () => chain,
            collect: async () => [{ _id: 'b1', isActive: true }],
          };
          return chain;
        },
      },
    };
    await expect(
      assertMvpAdditionalBusinessCreationAllowed(ctx, 'user_1')
    ).rejects.toThrow('ADDITIONAL_BUSINESS_CREATION_DISABLED');
  });

  test('UI entry is hidden by the same flag', () => {
    const source = readFileSync(
      'components/business-settings/AddBusinessCta.tsx',
      'utf8'
    );
    expect(source).toContain('MVP_FEATURE_FLAGS.additionalBusinessCreationEnabled');
    expect(source).toContain('return null');
  });
});
