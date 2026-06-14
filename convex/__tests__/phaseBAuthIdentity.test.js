import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { createOrUpdateUser, getEmailSignInStatus } from '../auth';

function createEmailStatusCtx(users = []) {
  return {
    db: {
      query: (tableName) => {
        expect(tableName).toBe('users');

        return {
          withIndex: (_indexName, buildIndex) => {
            const filters = [];
            const q = {
              eq(field, value) {
                filters.push([field, value]);
                return q;
              },
            };

            buildIndex(q);

            return {
              collect: async () =>
                users.filter((user) =>
                  filters.every(([field, value]) => user[field] === value)
                ),
            };
          },
          collect: async () => users,
        };
      },
    },
  };
}

async function expectCreateOrUpdateUserRejects(args) {
  await expect(createOrUpdateUser._handler({}, args)).rejects.toThrow(
    'PUBLIC_AUTH_LINKING_DISABLED'
  );
}

describe('Phase B1 email OTP sign-up', () => {
  test('new email sign-up does not preflight block unknown email addresses', () => {
    const source = readFileSync('app/(auth)/sign-up-email.tsx', 'utf8');

    expect(source).not.toContain('api.auth.getEmailSignInStatus');
    expect(source).not.toContain('convex.query(api.auth.getEmailSignInStatus');
    expect(source).toContain("signIn('email'");
  });

  test('existing email status query remains available for sign-in flows', async () => {
    const ctx = createEmailStatusCtx([
      {
        _id: 'user_existing',
        email: 'existing@example.com',
      },
    ]);

    await expect(
      getEmailSignInStatus._handler(ctx, {
        email: ' Existing@Example.com ',
      })
    ).resolves.toEqual({ exists: true });

    await expect(
      getEmailSignInStatus._handler(ctx, {
        email: 'new@example.com',
      })
    ).resolves.toEqual({ exists: false });
  });
});

describe('Phase B1 public auth identity hardening', () => {
  test('createOrUpdateUser rejects every client-supplied identity field', async () => {
    await expectCreateOrUpdateUserRejects({
      existingUserId: 'user_victim',
    });
    await expectCreateOrUpdateUserRejects({
      provider: 'google',
    });
    await expectCreateOrUpdateUserRejects({
      profile: { email: 'attacker@example.com' },
    });
    await expectCreateOrUpdateUserRejects({
      existingUserId: 'user_victim',
      provider: 'google',
      profile: { email: 'attacker@example.com' },
    });
  });
});
