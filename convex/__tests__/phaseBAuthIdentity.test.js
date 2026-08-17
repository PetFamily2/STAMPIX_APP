import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  assertProductionAuthLogLevelSafe,
  createOrUpdateUser,
  createOrUpdateUserHandler,
  getEmailSignInStatus,
} from '../auth';
import {
  createProviderAccountFingerprint,
  encryptProviderCredentialCapture,
  PROVIDER_CREDENTIAL_PROFILE_FIELD,
  PROVIDER_OAUTH_ISSUED_AT_PROFILE_FIELD,
  resolveOAuthProviderIssuedAt,
} from '../providerCredentials';

const TEST_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const originalProviderEncryptionKey =
  process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY;
const TEST_PROVIDER_IAT_SECONDS = 1_800_000_000;

const clone = (value) => JSON.parse(JSON.stringify(value));

class FakeAuthQuery {
  constructor(docs) {
    this.docs = docs;
  }

  withIndex(_name, builder) {
    const predicates = [];
    const q = {
      eq(field, value) {
        predicates.push((doc) => doc[field] === value);
        return q;
      },
    };
    builder(q);
    return new FakeAuthQuery(
      this.docs.filter((doc) => predicates.every((predicate) => predicate(doc)))
    );
  }

  async collect() {
    return this.docs;
  }

  async unique() {
    if (this.docs.length > 1) {
      throw new Error('Expected unique result');
    }
    return this.docs[0] ?? null;
  }
}

class FakeAuthDb {
  constructor(tables = {}) {
    this.tables = clone(tables);
    this.insertCount = 0;
  }

  rows(table) {
    if (!this.tables[table]) {
      this.tables[table] = [];
    }
    return this.tables[table];
  }

  query(table) {
    return new FakeAuthQuery(this.rows(table));
  }

  async get(id) {
    for (const rows of Object.values(this.tables)) {
      const row = rows.find((candidate) => candidate._id === id);
      if (row) return row;
    }
    return null;
  }

  async insert(table, value) {
    this.insertCount += 1;
    const id = `${table}_fresh_${this.insertCount}`;
    this.rows(table).push({ _id: id, ...clone(value) });
    return id;
  }

  async patch(id, updates) {
    const row = await this.get(id);
    if (!row) throw new Error(`Missing row ${id}`);
    Object.assign(row, clone(updates));
  }
}

function createOAuthCtx(tables = {}, { authIdentity = null } = {}) {
  return {
    db: new FakeAuthDb(tables),
    auth: {
      getUserIdentity: async () => authIdentity,
    },
  };
}

async function createOAuthProfile(provider, subject, overrides = {}) {
  const capture = await encryptProviderCredentialCapture(
    provider,
    subject,
    {
      access_token: `fresh-${provider}-access`,
      refresh_token: `fresh-${provider}-refresh`,
    },
    {
      env: { AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY: TEST_KEY },
      now: 5_000,
    }
  );
  const providerIssuedAt = resolveOAuthProviderIssuedAt({
    iat: TEST_PROVIDER_IAT_SECONDS,
    exp: TEST_PROVIDER_IAT_SECONDS + 3_600,
  });
  if (providerIssuedAt === null) {
    throw new Error('Invalid provider issuance test fixture');
  }
  return {
    subject,
    [PROVIDER_OAUTH_ISSUED_AT_PROFILE_FIELD]: providerIssuedAt,
    [PROVIDER_CREDENTIAL_PROFILE_FIELD]: capture,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  if (originalProviderEncryptionKey === undefined) {
    delete process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY =
      originalProviderEncryptionKey;
  }
});

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

describe('deleted provider identity re-sign-up', () => {
  for (const provider of ['google', 'apple']) {
    test(`same ${provider} subject creates a fresh user after old mappings are gone`, async () => {
      const subject = `${provider}_returning_subject`;
      const ctx = createOAuthCtx();
      const profile = await createOAuthProfile(
        provider,
        subject,
        provider === 'google'
          ? {
              email: 'returning@example.com',
              emailVerified: true,
              name: 'Returning User',
            }
          : {}
      );

      const userId = await createOrUpdateUserHandler(ctx, {
        type: 'oauth',
        provider: { id: provider },
        profile,
        existingUserId: null,
      });

      expect(userId).toBe('users_fresh_1');
      expect(ctx.db.rows('users')).toEqual([
        expect.objectContaining({
          _id: 'users_fresh_1',
          externalId: `${provider}:${subject}`,
          activeMode: 'customer',
        }),
      ]);
      expect(ctx.db.rows('users')[0]).not.toHaveProperty(
        'customerOnboardedAt'
      );
      expect(ctx.db.rows('users')[0]).not.toHaveProperty(
        'businessOnboardedAt'
      );
      expect(ctx.db.rows('userIdentities')).toEqual([
        expect.objectContaining({
          userId,
          provider,
          providerUserId: subject,
        }),
      ]);
      expect(ctx.db.rows('providerRevocationCredentials')).toEqual([
        expect.objectContaining({
          userId,
          provider,
          providerAccountId: subject,
        }),
      ]);
    });
  }

  test('Apple fresh sign-up does not require Apple to return email or name again', async () => {
    const ctx = createOAuthCtx();
    const userId = await createOrUpdateUserHandler(ctx, {
      type: 'oauth',
      provider: { id: 'apple' },
      profile: await createOAuthProfile('apple', 'apple_private_subject'),
      existingUserId: null,
    });

    expect(userId).toBe('users_fresh_1');
    expect(ctx.db.rows('users')[0]).toMatchObject({
      _id: userId,
      fullName: 'User',
      emailVerified: false,
    });
    expect(ctx.db.rows('users')[0]).not.toHaveProperty('email');
  });

  test('overlap retry guard runs before any new application account state is written', async () => {
    const subject = 'google_overlap_subject';
    const fingerprint = await createProviderAccountFingerprint(
      'google',
      subject,
      { AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY: TEST_KEY }
    );
    const ctx = createOAuthCtx({
      providerRevocationJobs: [
        {
          _id: 'old_queued_job',
          provider: 'google',
          providerAccountFingerprint: fingerprint,
          credentialVersion: 1,
          status: 'queued',
          attemptCount: 0,
          nextAttemptAt: 6_000,
          createdAt: 1_000,
          updatedAt: 1_000,
        },
      ],
    });

    await expect(
      createOrUpdateUserHandler(ctx, {
        type: 'oauth',
        provider: { id: 'google' },
        profile: await createOAuthProfile('google', subject, {
          email: 'fresh@example.com',
          emailVerified: true,
        }),
        existingUserId: null,
      })
    ).rejects.toThrow('PROVIDER_REAUTH_RETRY_REQUIRED');

    for (const table of [
      'users',
      'userIdentities',
      'providerRevocationCredentials',
    ]) {
      expect(ctx.db.rows(table)).toEqual([]);
    }
  });

  test('missing or malformed provider issuance time retries before callback writes', async () => {
    for (const unsafeIssuedAt of [undefined, 'not-a-provider-timestamp']) {
      const profile = await createOAuthProfile(
        'google',
        'google_unsafe_iat_subject',
        {
          [PROVIDER_OAUTH_ISSUED_AT_PROFILE_FIELD]: unsafeIssuedAt,
        }
      );
      const ctx = createOAuthCtx();

      await expect(
        createOrUpdateUserHandler(ctx, {
          type: 'oauth',
          provider: { id: 'google' },
          profile,
          existingUserId: null,
        })
      ).rejects.toThrow('PROVIDER_REAUTH_RETRY_REQUIRED');

      for (const table of [
        'users',
        'userIdentities',
        'providerRevocationCredentials',
      ]) {
        expect(ctx.db.rows(table)).toEqual([]);
      }
    }
  });

  test('installed Convex Auth invokes the custom callback before account creation in one mutation', () => {
    const usersSource = readFileSync(
      'node_modules/@convex-dev/auth/src/server/implementation/users.ts',
      'utf8'
    );
    const oauthMutationSource = readFileSync(
      'node_modules/@convex-dev/auth/src/server/implementation/mutations/userOAuth.ts',
      'utf8'
    );

    expect(usersSource.indexOf('config.callbacks.createOrUpdateUser')).toBeLessThan(
      usersSource.indexOf('ctx.db.insert("authAccounts"')
    );
    expect(oauthMutationSource).toContain(
      'const { accountId } = await upsertUserAndAccount'
    );
    expect(oauthMutationSource.indexOf('upsertUserAndAccount')).toBeLessThan(
      oauthMutationSource.indexOf('ctx.db.insert("authVerificationCodes"')
    );
    expect(oauthMutationSource).not.toContain('authSessions');
    expect(oauthMutationSource).not.toContain('authRefreshTokens');
  });

  test('an existing live provider identity continues to resolve to its current user', async () => {
    const ctx = createOAuthCtx({
      users: [
        {
          _id: 'live_user',
          fullName: 'Live User',
          isActive: true,
          createdAt: 1_000,
          updatedAt: 1_000,
        },
      ],
      userIdentities: [
        {
          _id: 'live_google_identity',
          userId: 'live_user',
          provider: 'google',
          providerUserId: 'live_google_subject',
          createdAt: 1_000,
          updatedAt: 1_000,
        },
      ],
    });

    const userId = await createOrUpdateUserHandler(ctx, {
      type: 'oauth',
      provider: { id: 'google' },
      profile: await createOAuthProfile('google', 'live_google_subject'),
      existingUserId: 'live_user',
    });

    expect(userId).toBe('live_user');
    expect(ctx.db.rows('users')).toHaveLength(1);
    expect(ctx.db.rows('userIdentities')).toHaveLength(1);
  });
});

describe('production auth logging guard', () => {
  test('rejects DEBUG auth logging in production', () => {
    expect(() =>
      assertProductionAuthLogLevelSafe({
        STAMPAIX_ENV: 'production',
        AUTH_LOG_LEVEL: 'DEBUG',
      })
    ).toThrow('AUTH_LOG_LEVEL_DEBUG_FORBIDDEN_IN_PRODUCTION');
  });

  test('allows DEBUG only with an explicit development marker', () => {
    expect(() =>
      assertProductionAuthLogLevelSafe({
        STAMPAIX_ENV: 'development',
        AUTH_LOG_LEVEL: 'DEBUG',
      })
    ).not.toThrow();
  });

  test('rejects DEBUG when the explicit environment marker is missing', () => {
    expect(() =>
      assertProductionAuthLogLevelSafe({ AUTH_LOG_LEVEL: 'DEBUG' })
    ).toThrow('AUTH_LOG_LEVEL_DEBUG_FORBIDDEN_IN_PRODUCTION');
  });

  test('rejects DEBUG for unknown and preview environment markers', () => {
    for (const environment of ['unknown', 'preview']) {
      expect(() =>
        assertProductionAuthLogLevelSafe({
          STAMPAIX_ENV: environment,
          AUTH_LOG_LEVEL: 'DEBUG',
        })
      ).toThrow('AUTH_LOG_LEVEL_DEBUG_FORBIDDEN_IN_PRODUCTION');
    }
  });

  test('allows non-DEBUG logging when the marker is missing', () => {
    expect(() =>
      assertProductionAuthLogLevelSafe({ AUTH_LOG_LEVEL: 'INFO' })
    ).not.toThrow();
  });

  test('does not trust CONVEX_DEPLOYMENT alone to authorize DEBUG', () => {
    expect(() =>
      assertProductionAuthLogLevelSafe({
        CONVEX_DEPLOYMENT: 'dev:stampix',
        AUTH_LOG_LEVEL: 'DEBUG',
      })
    ).toThrow('AUTH_LOG_LEVEL_DEBUG_FORBIDDEN_IN_PRODUCTION');
  });
});
