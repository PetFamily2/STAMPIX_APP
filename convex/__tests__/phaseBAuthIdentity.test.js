import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { upsertUserAndAccount } from '../../node_modules/@convex-dev/auth/src/server/implementation/users.ts';
import { createVerificationCodeImpl } from '../../node_modules/@convex-dev/auth/src/server/implementation/mutations/createVerificationCode.ts';
import { verifyCodeAndSignInImpl } from '../../node_modules/@convex-dev/auth/src/server/implementation/mutations/verifyCodeAndSignIn.ts';
import { sha256 } from '../../node_modules/@convex-dev/auth/src/server/implementation/utils.ts';
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

  async take(count) {
    return this.docs.slice(0, count);
  }

  async first() {
    return this.docs[0] ?? null;
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
    for (const key of Object.keys(updates)) {
      if (updates[key] === undefined) {
        delete row[key];
      } else {
        row[key] = clone(updates[key]);
      }
    }
  }

  async delete(id) {
    for (const rows of Object.values(this.tables)) {
      const index = rows.findIndex((candidate) => candidate._id === id);
      if (index >= 0) {
        rows.splice(index, 1);
        return;
      }
    }
    throw new Error(`Missing row ${id}`);
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
        CONVEX_DEPLOYMENT: 'dev:stampaix',
        AUTH_LOG_LEVEL: 'DEBUG',
      })
    ).toThrow('AUTH_LOG_LEVEL_DEBUG_FORBIDDEN_IN_PRODUCTION');
  });
});

const PERSON_EMAIL = 'person@example.com';
const AUTH_IMPL_ROOT =
  'node_modules/@convex-dev/auth/src/server/implementation';

const emailProviderConfig = {
  id: 'email',
  type: 'email',
  async authorize(params, account) {
    if (typeof params.email !== 'string') {
      throw new Error('Token verification requires an email');
    }
    if (account.providerAccountId !== params.email) {
      throw new Error('Verification email does not match the account');
    }
  },
};

function getEmailProviderOrThrow(providerId) {
  if (providerId !== 'email') {
    throw new Error(`Unexpected provider ${providerId}`);
  }
  return emailProviderConfig;
}

function callbackConfig(calls) {
  return {
    callbacks: {
      async createOrUpdateUser(ctx, args) {
        calls.push({
          type: args.type,
          existingUserId: args.existingUserId ?? null,
          emailVerified: args.profile?.emailVerified === true,
        });
        return await createOrUpdateUserHandler(ctx, args);
      },
    },
  };
}

function shellUser(id, email, overrides = {}) {
  return {
    _id: id,
    externalId: `email:${email}`,
    email,
    emailVerified: false,
    fullName: 'User',
    activeMode: 'customer',
    userType: 'free',
    subscriptionPlan: 'starter',
    subscriptionStatus: 'inactive',
    isActive: true,
    createdAt: 1_000,
    updatedAt: 1_000 + 24 * 60 * 60 * 1000,
    subscriptionUpdatedAt: 1_000,
    ...overrides,
  };
}

function oauthUser(id, provider, subject, email, overrides = {}) {
  return {
    _id: id,
    externalId: `${provider}:${subject}`,
    email,
    emailVerified: true,
    firstName: 'Noa',
    lastName: 'Levi',
    fullName: 'Noa Levi',
    avatarUrl: `https://example.com/${provider}.png`,
    activeMode: 'customer',
    userType: 'free',
    subscriptionPlan: 'starter',
    subscriptionStatus: 'inactive',
    isActive: true,
    createdAt: 500,
    updatedAt: 800,
    ...overrides,
  };
}

function userIdentity(id, userId, provider, providerUserId, email) {
  return {
    _id: id,
    userId,
    provider,
    providerUserId,
    email,
    createdAt: 500,
    updatedAt: 500,
  };
}

function providerAccount(id, userId, provider, providerAccountId) {
  return {
    _id: id,
    userId,
    provider,
    providerAccountId,
  };
}

function oauthThenEmailTables(provider, email = PERSON_EMAIL) {
  const userId = `${provider}_user`;
  const subject = `${provider}_subject`;
  return {
    users: [
      oauthUser(userId, provider, subject, email),
      shellUser('temp_user', email),
    ],
    userIdentities: [
      userIdentity(
        `${provider}_identity`,
        userId,
        provider,
        subject,
        email
      ),
      userIdentity('email_identity', 'temp_user', 'email', email, email),
    ],
    authAccounts: [
      providerAccount(`${provider}_account`, userId, provider, subject),
      providerAccount('email_account', 'temp_user', 'email', email),
    ],
    memberships: [
      {
        _id: `${provider}_membership`,
        userId,
        businessId: 'business_1',
        programId: 'program_1',
        currentStamps: 3,
      },
    ],
    providerRevocationCredentials: [
      {
        _id: `${provider}_credential`,
        userId,
        provider,
        providerAccountId: subject,
        credentialVersion: 1,
      },
    ],
  };
}

function verifiedEmailArgs(existingUserId, email = PERSON_EMAIL) {
  return {
    type: 'verification',
    provider: { id: 'email', type: 'email' },
    profile: { email, emailVerified: true },
    existingUserId,
  };
}

async function runEmailOtpVerification(ctx, options) {
  const calls = [];
  const code = options.code ?? '123456';
  if (options.insertCode !== false) {
    await ctx.db.insert('authVerificationCodes', {
      accountId: options.accountId,
      provider: 'email',
      code: await sha256(code),
      expirationTime: options.expirationTime ?? Date.now() + 60_000,
      emailVerified: options.email,
      ...(options.codeVerifier ? { verifier: options.codeVerifier } : {}),
    });
  }
  const result = await verifyCodeAndSignInImpl(
    ctx,
    {
      params: { email: options.email, code },
      provider: 'email',
      verifier: options.verifier,
      generateTokens: false,
      allowExtraProviders: false,
    },
    getEmailProviderOrThrow,
    callbackConfig(calls)
  );
  return { result, calls };
}

function expectEmailShellTombstone(user) {
  expect(user).toMatchObject({
    _id: 'temp_user',
    isActive: false,
    emailVerified: false,
    externalId: 'merged-email-shell:temp_user',
  });
  expect(user).not.toHaveProperty('email');
  expect(user).not.toHaveProperty('activeBusinessId');
}

function expectStillActiveEmailUser(user) {
  expect(user).toMatchObject({
    isActive: true,
    email: PERSON_EMAIL,
    externalId: `email:${PERSON_EMAIL}`,
  });
  expect(String(user.externalId).startsWith('merged-email-shell:')).toBe(false);
}

async function expectVerifiedEmailLinksToOAuth(provider) {
  const userId = `${provider}_user`;
  const ctx = createOAuthCtx(oauthThenEmailTables(provider));
  const shell = ctx.db.rows('users').find((user) => user._id === 'temp_user');
  expect(shell.updatedAt - shell.createdAt).toBeGreaterThan(60 * 60 * 1000);

  const beforeUser = clone(
    ctx.db.rows('users').find((user) => user._id === userId)
  );
  const beforeOAuthIdentity = clone(
    ctx.db
      .rows('userIdentities')
      .find((identity) => identity.provider === provider)
  );
  const beforeCredential = clone(
    ctx.db.rows('providerRevocationCredentials')[0]
  );
  const beforeMembership = clone(ctx.db.rows('memberships')[0]);
  const beforeOAuthAccount = clone(
    ctx.db.rows('authAccounts').find((account) => account.provider === provider)
  );

  const { result, calls } = await runEmailOtpVerification(ctx, {
    email: PERSON_EMAIL,
    accountId: 'email_account',
  });

  expect(calls).toEqual([
    {
      type: 'verification',
      existingUserId: 'temp_user',
      emailVerified: true,
    },
  ]);
  expect(result.userId).toBe(userId);
  expect(ctx.db.rows('authSessions').map((session) => session.userId)).toEqual([
    userId,
  ]);
  expect(ctx.db.rows('users').map((user) => user._id)).toEqual([
    userId,
    'temp_user',
  ]);
  expect(ctx.db.rows('users').find((user) => user._id === userId)).toEqual(
    beforeUser
  );
  expectEmailShellTombstone(
    ctx.db.rows('users').find((user) => user._id === 'temp_user')
  );
  expect(
    ctx.db.rows('userIdentities').some((identity) => identity.userId === 'temp_user')
  ).toBe(false);
  expect(
    ctx.db.rows('authAccounts').some((account) => account.userId === 'temp_user')
  ).toBe(false);
  expect(
    ctx.db
      .rows('userIdentities')
      .find((identity) => identity.provider === provider)
  ).toEqual(beforeOAuthIdentity);
  expect(ctx.db.rows('providerRevocationCredentials')).toEqual([
    beforeCredential,
  ]);
  expect(ctx.db.rows('memberships')).toEqual([beforeMembership]);
  expect(
    ctx.db.rows('authAccounts').find((account) => account.provider === provider)
  ).toEqual(beforeOAuthAccount);

  const emailAccount = ctx.db
    .rows('authAccounts')
    .find((account) => account.provider === 'email');
  expect(emailAccount).toMatchObject({
    _id: 'email_account',
    userId,
    provider: 'email',
    providerAccountId: PERSON_EMAIL,
    emailVerified: PERSON_EMAIL,
  });

  const emailIdentity = ctx.db
    .rows('userIdentities')
    .find((identity) => identity.provider === 'email');
  expect(emailIdentity).toMatchObject({
    _id: 'email_identity',
    userId,
    provider: 'email',
    providerUserId: PERSON_EMAIL,
    email: PERSON_EMAIL,
  });
  expect(emailIdentity.createdAt).toBe(500);
  expect(ctx.db.rows('userIdentities')).toHaveLength(2);
  return ctx;
}

describe('verified email OTP account linking', () => {
  test('brand-new verified email sign-in keeps a single email user', async () => {
    const ctx = createOAuthCtx({
      users: [shellUser('temp_user', PERSON_EMAIL)],
      userIdentities: [
        userIdentity(
          'email_identity',
          'temp_user',
          'email',
          PERSON_EMAIL,
          PERSON_EMAIL
        ),
      ],
      authAccounts: [
        providerAccount('email_account', 'temp_user', 'email', PERSON_EMAIL),
      ],
    });

    const { result } = await runEmailOtpVerification(ctx, {
      email: PERSON_EMAIL,
      accountId: 'email_account',
    });

    expect(result.userId).toBe('temp_user');
    expect(ctx.db.rows('users')).toHaveLength(1);
    expect(ctx.db.rows('users')[0]).toMatchObject({
      _id: 'temp_user',
      email: PERSON_EMAIL,
      emailVerified: true,
      externalId: `email:${PERSON_EMAIL}`,
    });
    expect(ctx.db.rows('userIdentities')).toEqual([
      expect.objectContaining({
        userId: 'temp_user',
        provider: 'email',
        providerUserId: PERSON_EMAIL,
      }),
    ]);
    expect(ctx.db.rows('authAccounts')[0].userId).toBe('temp_user');
    expect(ctx.db.rows('authSessions').map((session) => session.userId)).toEqual(
      ['temp_user']
    );
  });

  test('existing verified email sign-in returns the same email user', async () => {
    const ctx = createOAuthCtx({
      users: [
        {
          _id: 'email_user',
          externalId: `email:${PERSON_EMAIL}`,
          email: PERSON_EMAIL,
          emailVerified: true,
          fullName: 'Established Email',
          isActive: true,
          createdAt: 100,
          updatedAt: 100,
        },
      ],
      userIdentities: [
        userIdentity(
          'email_identity',
          'email_user',
          'email',
          PERSON_EMAIL,
          PERSON_EMAIL
        ),
      ],
      authAccounts: [
        providerAccount('email_account', 'email_user', 'email', PERSON_EMAIL),
      ],
      memberships: [
        {
          _id: 'email_membership',
          userId: 'email_user',
          currentStamps: 4,
        },
      ],
    });

    const { result } = await runEmailOtpVerification(ctx, {
      email: PERSON_EMAIL,
      accountId: 'email_account',
    });

    expect(result.userId).toBe('email_user');
    expect(ctx.db.rows('users')).toHaveLength(1);
    expect(ctx.db.rows('users')[0]).toMatchObject({
      _id: 'email_user',
      fullName: 'Established Email',
      emailVerified: true,
    });
    expect(ctx.db.rows('memberships')).toEqual([
      expect.objectContaining({
        _id: 'email_membership',
        userId: 'email_user',
        currentStamps: 4,
      }),
    ]);
    expect(ctx.db.rows('authAccounts')[0].userId).toBe('email_user');
    expect(ctx.db.rows('authSessions').map((session) => session.userId)).toEqual(
      ['email_user']
    );
  });

  test('verified Google or Apple sign-in after email links to that email user', async () => {
    for (const provider of ['google', 'apple']) {
      const subject = `${provider}_subject`;
      const ctx = createOAuthCtx({
        users: [
          {
            _id: 'email_user',
            externalId: `email:${PERSON_EMAIL}`,
            email: PERSON_EMAIL,
            emailVerified: true,
            firstName: 'Email',
            lastName: 'Person',
            fullName: 'Email Person',
            activeMode: 'customer',
            isActive: true,
            createdAt: 100,
            updatedAt: 100,
          },
        ],
        userIdentities: [
          userIdentity(
            'email_identity',
            'email_user',
            'email',
            PERSON_EMAIL,
            PERSON_EMAIL
          ),
        ],
        authAccounts: [
          providerAccount('email_account', 'email_user', 'email', PERSON_EMAIL),
        ],
      });
      const profile = await createOAuthProfile(provider, subject, {
        email: PERSON_EMAIL,
        emailVerified: true,
        name: 'Email Person',
      });

      const { userId, accountId } = await upsertUserAndAccount(
        ctx,
        null,
        { providerAccountId: subject },
        {
          type: 'oauth',
          provider: { id: provider, type: 'oauth' },
          profile,
        },
        {
          callbacks: {
            createOrUpdateUser: (authCtx, args) =>
              createOrUpdateUserHandler(authCtx, args),
          },
        }
      );

      expect(userId).toBe('email_user');
      expect(ctx.db.rows('users')).toHaveLength(1);
      expect(
        ctx.db.rows('authAccounts').find((account) => account._id === accountId)
      ).toMatchObject({
        userId: 'email_user',
        provider,
        providerAccountId: subject,
      });
      expect(ctx.db.rows('userIdentities')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: 'email_user',
            provider: 'email',
            providerUserId: PERSON_EMAIL,
          }),
          expect.objectContaining({
            userId: 'email_user',
            provider,
            providerUserId: subject,
          }),
        ])
      );
    }
  });

  test('email OTP send alone does not link to an existing OAuth user', async () => {
    const ctx = createOAuthCtx({
      users: [
        oauthUser('google_user', 'google', 'google_subject', PERSON_EMAIL),
      ],
      userIdentities: [
        userIdentity(
          'google_identity',
          'google_user',
          'google',
          'google_subject',
          PERSON_EMAIL
        ),
      ],
      authAccounts: [
        providerAccount(
          'google_account',
          'google_user',
          'google',
          'google_subject'
        ),
      ],
      providerRevocationCredentials: [
        {
          _id: 'google_credential',
          userId: 'google_user',
          provider: 'google',
          providerAccountId: 'google_subject',
          credentialVersion: 1,
        },
      ],
    });
    const beforeUser = clone(ctx.db.rows('users')[0]);
    const beforeIdentity = clone(ctx.db.rows('userIdentities')[0]);
    const beforeCredential = clone(
      ctx.db.rows('providerRevocationCredentials')[0]
    );
    const calls = [];

    await createVerificationCodeImpl(
      ctx,
      {
        provider: 'email',
        email: PERSON_EMAIL,
        code: '111111',
        expirationTime: Date.now() + 60_000,
        allowExtraProviders: false,
      },
      getEmailProviderOrThrow,
      callbackConfig(calls)
    );

    const created = ctx.db
      .rows('users')
      .find((user) => user._id !== 'google_user');
    expect(created).toMatchObject({
      externalId: `email:${PERSON_EMAIL}`,
      email: PERSON_EMAIL,
      emailVerified: false,
      fullName: 'User',
      activeMode: 'customer',
      userType: 'free',
      subscriptionPlan: 'starter',
      subscriptionStatus: 'inactive',
      isActive: true,
    });
    expect(calls).toEqual([
      {
        type: 'email',
        existingUserId: null,
        emailVerified: false,
      },
    ]);
    expect(ctx.db.rows('users')).toHaveLength(2);
    expect(ctx.db.rows('authSessions')).toEqual([]);
    expect(
      ctx.db.rows('authAccounts').find((account) => account.provider === 'email')
    ).toMatchObject({
      userId: created._id,
      provider: 'email',
      providerAccountId: PERSON_EMAIL,
    });
    expect(
      ctx.db
        .rows('authAccounts')
        .find((account) => account.provider === 'email').emailVerified
    ).toBeUndefined();
    expect(
      ctx.db
        .rows('userIdentities')
        .find((identity) => identity.provider === 'email')
    ).toMatchObject({
      userId: created._id,
      providerUserId: PERSON_EMAIL,
    });
    expect(ctx.db.rows('users').find((user) => user._id === 'google_user')).toEqual(
      beforeUser
    );
    expect(
      ctx.db
        .rows('userIdentities')
        .find((identity) => identity.provider === 'google')
    ).toEqual(beforeIdentity);
    expect(ctx.db.rows('providerRevocationCredentials')).toEqual([
      beforeCredential,
    ]);

    await createVerificationCodeImpl(
      ctx,
      {
        provider: 'email',
        email: PERSON_EMAIL,
        code: '222222',
        expirationTime: Date.now() + 60_000,
        allowExtraProviders: false,
      },
      getEmailProviderOrThrow,
      callbackConfig(calls)
    );

    expect(calls[1]).toEqual({
      type: 'email',
      existingUserId: created._id,
      emailVerified: false,
    });
    expect(ctx.db.rows('users')).toHaveLength(2);
    expect(
      ctx.db.rows('authAccounts').find((account) => account.provider === 'email')
        .userId
    ).toBe(created._id);
    expect(ctx.db.rows('users').find((user) => user._id === 'google_user')).toEqual(
      beforeUser
    );
    expect(ctx.db.rows('authSessions')).toEqual([]);
  });

  test('verified email after Google returns the Google user', async () => {
    await expectVerifiedEmailLinksToOAuth('google');
  });

  test('verified email after Apple returns the Apple user', async () => {
    await expectVerifiedEmailLinksToOAuth('apple');
  });

  test('successful link tombstones the temporary user and keeps one email identity', async () => {
    const ctx = await expectVerifiedEmailLinksToOAuth('google');
    expectEmailShellTombstone(
      ctx.db.rows('users').find((user) => user._id === 'temp_user')
    );
    expect(
      ctx.db.rows('userIdentities').filter((identity) => identity.provider === 'email')
    ).toHaveLength(1);
    expect(
      ctx.db.rows('userIdentities').some((identity) => identity.userId === 'temp_user')
    ).toBe(false);
  });

  test('an email tombstone does not block a later Apple link to the Google user', async () => {
    const ctx = await expectVerifiedEmailLinksToOAuth('google');
    const beforeTombstone = clone(
      ctx.db.rows('users').find((user) => user._id === 'temp_user')
    );
    const profile = await createOAuthProfile('apple', 'apple_subject', {
      email: PERSON_EMAIL,
      emailVerified: true,
      name: 'Noa Levi',
    });

    const { userId, accountId } = await upsertUserAndAccount(
      ctx,
      null,
      { providerAccountId: 'apple_subject' },
      {
        type: 'oauth',
        provider: { id: 'apple', type: 'oauth' },
        profile,
      },
      {
        callbacks: {
          createOrUpdateUser: (authCtx, args) =>
            createOrUpdateUserHandler(authCtx, args),
        },
      }
    );

    expect(userId).toBe('google_user');
    expect(ctx.db.rows('users').map((user) => user._id)).toEqual([
      'google_user',
      'temp_user',
    ]);
    expect(
      ctx.db.rows('authAccounts').find((account) => account._id === accountId)
    ).toMatchObject({
      userId: 'google_user',
      provider: 'apple',
      providerAccountId: 'apple_subject',
    });
    expect(ctx.db.rows('userIdentities')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'google_user',
          provider: 'google',
          providerUserId: 'google_subject',
        }),
        expect.objectContaining({
          userId: 'google_user',
          provider: 'email',
          providerUserId: PERSON_EMAIL,
        }),
        expect.objectContaining({
          userId: 'google_user',
          provider: 'apple',
          providerUserId: 'apple_subject',
        }),
      ])
    );
    expect(ctx.db.rows('users').find((user) => user._id === 'temp_user')).toEqual(
      beforeTombstone
    );
    expect(
      ctx.db.rows('userIdentities').some((identity) => identity.userId === 'temp_user')
    ).toBe(false);
  });

  test('a later email OTP stays on the linked OAuth user', async () => {
    const ctx = await expectVerifiedEmailLinksToOAuth('google');
    const beforeIdentity = clone(
      ctx.db
        .rows('userIdentities')
        .find((identity) => identity.provider === 'google')
    );

    const { result } = await runEmailOtpVerification(ctx, {
      email: PERSON_EMAIL,
      accountId: 'email_account',
      code: '654321',
    });

    expect(result.userId).toBe('google_user');
    expect(ctx.db.rows('users')).toHaveLength(2);
    expect(ctx.db.rows('users').find((user) => user._id === 'google_user'))
      .toMatchObject({
        externalId: 'google:google_subject',
        fullName: 'Noa Levi',
        avatarUrl: 'https://example.com/google.png',
        email: PERSON_EMAIL,
        emailVerified: true,
        isActive: true,
      });
    expectEmailShellTombstone(
      ctx.db.rows('users').find((user) => user._id === 'temp_user')
    );
    expect(
      ctx.db
        .rows('userIdentities')
        .find((identity) => identity.provider === 'google')
    ).toEqual(beforeIdentity);
    expect(
      ctx.db.rows('authSessions').every((session) => session.userId === 'google_user')
    ).toBe(true);
    expect(
      ctx.db.rows('authAccounts').find((account) => account.provider === 'email')
        .userId
    ).toBe('google_user');
  });

  test('wrong, expired, or unverified email callbacks do not link accounts', async () => {
    const wrongCtx = createOAuthCtx(oauthThenEmailTables('google'));
    const beforeWrongUsers = clone(wrongCtx.db.rows('users'));
    const beforeWrongIdentities = clone(wrongCtx.db.rows('userIdentities'));
    const beforeWrongAccounts = clone(wrongCtx.db.rows('authAccounts'));
    const wrong = await runEmailOtpVerification(wrongCtx, {
      email: PERSON_EMAIL,
      accountId: 'email_account',
      code: '000000',
      insertCode: false,
    });
    expect(wrong.result).toBeNull();
    expect(wrong.calls).toEqual([]);
    expect(wrongCtx.db.rows('users')).toEqual(beforeWrongUsers);
    expect(wrongCtx.db.rows('userIdentities')).toEqual(beforeWrongIdentities);
    expect(wrongCtx.db.rows('authAccounts')).toEqual(beforeWrongAccounts);
    expect(wrongCtx.db.rows('authSessions')).toEqual([]);

    const expiredCtx = createOAuthCtx(oauthThenEmailTables('google'));
    const beforeExpiredUsers = clone(expiredCtx.db.rows('users'));
    const beforeExpiredIdentities = clone(expiredCtx.db.rows('userIdentities'));
    const beforeExpiredAccounts = clone(expiredCtx.db.rows('authAccounts'));
    const expired = await runEmailOtpVerification(expiredCtx, {
      email: PERSON_EMAIL,
      accountId: 'email_account',
      expirationTime: Date.now() - 5_000,
    });
    expect(expired.result).toBeNull();
    expect(expired.calls).toEqual([]);
    expect(expiredCtx.db.rows('users')).toEqual(beforeExpiredUsers);
    expect(expiredCtx.db.rows('userIdentities')).toEqual(beforeExpiredIdentities);
    expect(expiredCtx.db.rows('authAccounts')).toEqual(beforeExpiredAccounts);
    expect(expiredCtx.db.rows('authSessions')).toEqual([]);

    const verifierCtx = createOAuthCtx(oauthThenEmailTables('apple'));
    const beforeVerifierUsers = clone(verifierCtx.db.rows('users'));
    const verifier = await runEmailOtpVerification(verifierCtx, {
      email: PERSON_EMAIL,
      accountId: 'email_account',
      codeVerifier: 'expected-verifier',
      verifier: 'wrong-verifier',
    });
    expect(verifier.result).toBeNull();
    expect(verifier.calls).toEqual([]);
    expect(verifierCtx.db.rows('users')).toEqual(beforeVerifierUsers);
    expect(verifierCtx.db.rows('authSessions')).toEqual([]);

    const sendShapedCtx = createOAuthCtx(oauthThenEmailTables('google'));
    const sendShapedId = await createOrUpdateUserHandler(sendShapedCtx, {
      type: 'email',
      provider: { id: 'email', type: 'email' },
      profile: { email: PERSON_EMAIL, emailVerified: true },
      existingUserId: 'temp_user',
    });
    expect(sendShapedId).toBe('temp_user');
    expect(
      sendShapedCtx.db
        .rows('userIdentities')
        .find((identity) => identity.provider === 'google').userId
    ).toBe('google_user');
    expect(sendShapedCtx.db.rows('users')).toHaveLength(2);

    const unverifiedCtx = createOAuthCtx(oauthThenEmailTables('google'));
    const unverifiedId = await createOrUpdateUserHandler(unverifiedCtx, {
      type: 'verification',
      provider: { id: 'email', type: 'email' },
      profile: { email: PERSON_EMAIL, emailVerified: false },
      existingUserId: 'temp_user',
    });
    expect(unverifiedId).toBe('temp_user');
    expect(unverifiedCtx.db.rows('users').find((user) => user._id === 'temp_user'))
      .toMatchObject({ emailVerified: false });
    expect(
      unverifiedCtx.db
        .rows('userIdentities')
        .find((identity) => identity.provider === 'google').userId
    ).toBe('google_user');

    const unverifiedOAuthCtx = createOAuthCtx(
      oauthThenEmailTables('google', PERSON_EMAIL)
    );
    const oauthRow = unverifiedOAuthCtx.db
      .rows('users')
      .find((user) => user._id === 'google_user');
    oauthRow.emailVerified = false;
    const keptId = await createOrUpdateUserHandler(
      unverifiedOAuthCtx,
      verifiedEmailArgs('temp_user')
    );
    expect(keptId).toBe('temp_user');
    expect(unverifiedOAuthCtx.db.rows('users')).toHaveLength(2);
    expect(
      unverifiedOAuthCtx.db
        .rows('userIdentities')
        .find((identity) => identity.provider === 'google').userId
    ).toBe('google_user');
  });

  test('multiple verified same-email OAuth users stay on the email user', async () => {
    const google = oauthThenEmailTables('google');
    const ctx = createOAuthCtx({
      ...google,
      users: [
        ...google.users,
        oauthUser('apple_user', 'apple', 'apple_subject', PERSON_EMAIL),
      ],
      userIdentities: [
        ...google.userIdentities,
        userIdentity(
          'apple_identity',
          'apple_user',
          'apple',
          'apple_subject',
          PERSON_EMAIL
        ),
      ],
      authAccounts: [
        ...google.authAccounts,
        providerAccount('apple_account', 'apple_user', 'apple', 'apple_subject'),
      ],
    });
    const beforeGoogle = clone(
      ctx.db.rows('users').find((user) => user._id === 'google_user')
    );
    const beforeApple = clone(
      ctx.db.rows('users').find((user) => user._id === 'apple_user')
    );
    const beforeIdentities = clone(ctx.db.rows('userIdentities'));

    const { result } = await runEmailOtpVerification(ctx, {
      email: PERSON_EMAIL,
      accountId: 'email_account',
    });

    expect(result.userId).toBe('temp_user');
    expect(ctx.db.rows('users').map((user) => user._id)).toEqual([
      'google_user',
      'temp_user',
      'apple_user',
    ]);
    expectStillActiveEmailUser(
      ctx.db.rows('users').find((user) => user._id === 'temp_user')
    );
    expect(ctx.db.rows('users').find((user) => user._id === 'temp_user'))
      .toMatchObject({ emailVerified: true });
    expect(ctx.db.rows('users').find((user) => user._id === 'google_user')).toEqual(
      beforeGoogle
    );
    expect(ctx.db.rows('users').find((user) => user._id === 'apple_user')).toEqual(
      beforeApple
    );
    expect(ctx.db.rows('userIdentities')).toEqual(beforeIdentities);
    expect(
      ctx.db.rows('authAccounts').find((account) => account.provider === 'email')
        .userId
    ).toBe('temp_user');
    expect(ctx.db.rows('authSessions').map((session) => session.userId)).toEqual([
      'temp_user',
    ]);
  });

  test('a verified user without a matching OAuth identity stays on the email user', async () => {
    const ctx = createOAuthCtx({
      users: [
        shellUser('temp_user', PERSON_EMAIL),
        {
          _id: 'historical_email_user',
          email: PERSON_EMAIL,
          emailVerified: true,
          fullName: 'Historical Email',
          isActive: true,
          createdAt: 100,
          updatedAt: 100,
        },
      ],
      userIdentities: [
        userIdentity(
          'email_identity',
          'temp_user',
          'email',
          PERSON_EMAIL,
          PERSON_EMAIL
        ),
      ],
      authAccounts: [
        providerAccount('email_account', 'temp_user', 'email', PERSON_EMAIL),
      ],
    });
    const beforeHistorical = clone(
      ctx.db.rows('users').find((user) => user._id === 'historical_email_user')
    );
    const beforeIdentities = clone(ctx.db.rows('userIdentities'));

    const userId = await createOrUpdateUserHandler(
      ctx,
      verifiedEmailArgs('temp_user')
    );

    expect(userId).toBe('temp_user');
    expect(ctx.db.rows('users').map((user) => user._id)).toEqual([
      'temp_user',
      'historical_email_user',
    ]);
    expectStillActiveEmailUser(
      ctx.db.rows('users').find((user) => user._id === 'temp_user')
    );
    expect(ctx.db.rows('users').find((user) => user._id === 'temp_user'))
      .toMatchObject({ emailVerified: true });
    expect(
      ctx.db.rows('users').find((user) => user._id === 'historical_email_user')
    ).toEqual(beforeHistorical);
    expect(ctx.db.rows('userIdentities')).toEqual(beforeIdentities);
  });

  test('a conflicting OAuth identity email stays on the email user', async () => {
    const tables = oauthThenEmailTables('google');
    tables.userIdentities[0].email = 'other@example.com';
    const ctx = createOAuthCtx(tables);
    const beforeGoogle = clone(
      ctx.db.rows('users').find((user) => user._id === 'google_user')
    );
    const beforeIdentities = clone(ctx.db.rows('userIdentities'));

    const userId = await createOrUpdateUserHandler(
      ctx,
      verifiedEmailArgs('temp_user')
    );

    expect(userId).toBe('temp_user');
    expect(ctx.db.rows('users').map((user) => user._id)).toEqual([
      'google_user',
      'temp_user',
    ]);
    expectStillActiveEmailUser(
      ctx.db.rows('users').find((user) => user._id === 'temp_user')
    );
    expect(ctx.db.rows('users').find((user) => user._id === 'temp_user'))
      .toMatchObject({ emailVerified: true });
    expect(ctx.db.rows('users').find((user) => user._id === 'google_user')).toEqual(
      beforeGoogle
    );
    expect(ctx.db.rows('userIdentities')).toEqual(beforeIdentities);
  });

  test('an inactive OAuth user stays unverified as a link target', async () => {
    const tables = oauthThenEmailTables('apple');
    tables.users[0].isActive = false;
    const ctx = createOAuthCtx(tables);
    const beforeApple = clone(
      ctx.db.rows('users').find((user) => user._id === 'apple_user')
    );
    const beforeIdentities = clone(ctx.db.rows('userIdentities'));

    const userId = await createOrUpdateUserHandler(
      ctx,
      verifiedEmailArgs('temp_user')
    );

    expect(userId).toBe('temp_user');
    expect(ctx.db.rows('users').map((user) => user._id)).toEqual([
      'apple_user',
      'temp_user',
    ]);
    expectStillActiveEmailUser(
      ctx.db.rows('users').find((user) => user._id === 'temp_user')
    );
    expect(ctx.db.rows('users').find((user) => user._id === 'temp_user'))
      .toMatchObject({ emailVerified: true });
    expect(ctx.db.rows('users').find((user) => user._id === 'apple_user')).toEqual(
      beforeApple
    );
    expect(ctx.db.rows('userIdentities')).toEqual(beforeIdentities);
  });

  test('an established verified email user is not merged into historical duplicates', async () => {
    const ctx = createOAuthCtx({
      users: [
        {
          _id: 'email_user',
          externalId: `email:${PERSON_EMAIL}`,
          email: PERSON_EMAIL,
          emailVerified: true,
          fullName: 'Established Email',
          firstName: 'Established',
          lastName: 'Email',
          isActive: true,
          createdAt: 100,
          updatedAt: 100,
        },
        oauthUser('google_user', 'google', 'google_subject', PERSON_EMAIL),
        oauthUser('apple_user', 'apple', 'apple_subject', PERSON_EMAIL),
      ],
      userIdentities: [
        userIdentity(
          'email_identity',
          'email_user',
          'email',
          PERSON_EMAIL,
          PERSON_EMAIL
        ),
        userIdentity(
          'google_identity',
          'google_user',
          'google',
          'google_subject',
          PERSON_EMAIL
        ),
        userIdentity(
          'apple_identity',
          'apple_user',
          'apple',
          'apple_subject',
          PERSON_EMAIL
        ),
      ],
      authAccounts: [
        providerAccount('email_account', 'email_user', 'email', PERSON_EMAIL),
        providerAccount(
          'google_account',
          'google_user',
          'google',
          'google_subject'
        ),
        providerAccount('apple_account', 'apple_user', 'apple', 'apple_subject'),
      ],
      memberships: [
        { _id: 'email_membership', userId: 'email_user', currentStamps: 1 },
        { _id: 'google_membership', userId: 'google_user', currentStamps: 2 },
        { _id: 'apple_membership', userId: 'apple_user', currentStamps: 3 },
      ],
    });
    const beforeGoogle = clone(
      ctx.db.rows('users').find((user) => user._id === 'google_user')
    );
    const beforeApple = clone(
      ctx.db.rows('users').find((user) => user._id === 'apple_user')
    );
    const beforeIdentities = clone(ctx.db.rows('userIdentities'));
    const beforeMemberships = clone(ctx.db.rows('memberships'));

    const userId = await createOrUpdateUserHandler(
      ctx,
      verifiedEmailArgs('email_user')
    );

    expect(userId).toBe('email_user');
    expect(ctx.db.rows('users')).toHaveLength(3);
    expect(ctx.db.rows('users').find((user) => user._id === 'email_user'))
      .toMatchObject({
        fullName: 'Established Email',
        emailVerified: true,
        isActive: true,
        email: PERSON_EMAIL,
        externalId: `email:${PERSON_EMAIL}`,
      });
    expect(ctx.db.rows('users').find((user) => user._id === 'google_user')).toEqual(
      beforeGoogle
    );
    expect(ctx.db.rows('users').find((user) => user._id === 'apple_user')).toEqual(
      beforeApple
    );
    expect(ctx.db.rows('userIdentities')).toEqual(beforeIdentities);
    expect(ctx.db.rows('memberships')).toEqual(beforeMemberships);
  });

  test('a different email stays a separate user', async () => {
    const ctx = createOAuthCtx({
      users: [
        oauthUser('google_user', 'google', 'google_subject', 'other@example.com'),
        shellUser('temp_user', PERSON_EMAIL),
      ],
      userIdentities: [
        userIdentity(
          'google_identity',
          'google_user',
          'google',
          'google_subject',
          'other@example.com'
        ),
        userIdentity(
          'email_identity',
          'temp_user',
          'email',
          PERSON_EMAIL,
          PERSON_EMAIL
        ),
      ],
      authAccounts: [
        providerAccount(
          'google_account',
          'google_user',
          'google',
          'google_subject'
        ),
        providerAccount('email_account', 'temp_user', 'email', PERSON_EMAIL),
      ],
    });
    const beforeGoogle = clone(
      ctx.db.rows('users').find((user) => user._id === 'google_user')
    );
    const beforeIdentity = clone(
      ctx.db
        .rows('userIdentities')
        .find((identity) => identity.provider === 'google')
    );

    const { result } = await runEmailOtpVerification(ctx, {
      email: PERSON_EMAIL,
      accountId: 'email_account',
    });

    expect(result.userId).toBe('temp_user');
    expect(ctx.db.rows('users')).toHaveLength(2);
    expectStillActiveEmailUser(
      ctx.db.rows('users').find((user) => user._id === 'temp_user')
    );
    expect(ctx.db.rows('users').find((user) => user._id === 'temp_user'))
      .toMatchObject({ emailVerified: true });
    expect(ctx.db.rows('users').find((user) => user._id === 'google_user')).toEqual(
      beforeGoogle
    );
    expect(
      ctx.db
        .rows('userIdentities')
        .find((identity) => identity.provider === 'google')
    ).toEqual(beforeIdentity);
    expect(ctx.db.rows('authSessions').map((session) => session.userId)).toEqual([
      'temp_user',
    ]);
    expect(
      ctx.db.rows('authAccounts').find((account) => account.provider === 'email')
        .userId
    ).toBe('temp_user');
  });

  test('email trimming and case normalization stay consistent', async () => {
    const createdCtx = createOAuthCtx();
    const createdId = await createOrUpdateUserHandler(createdCtx, {
      type: 'email',
      provider: { id: 'email', type: 'email' },
      profile: { email: '  TeSt@Example.com ' },
      existingUserId: null,
    });
    expect(createdCtx.db.rows('users')).toHaveLength(1);
    expect(createdCtx.db.rows('users')[0].email).toBe('test@example.com');
    expect(createdCtx.db.rows('userIdentities')[0]).toMatchObject({
      userId: createdId,
      provider: 'email',
      providerUserId: 'test@example.com',
      email: 'test@example.com',
    });

    const email = 'test@example.com';
    const linkCtx = createOAuthCtx({
      users: [
        oauthUser('google_user', 'google', 'google_subject', email),
        shellUser('temp_user', email),
      ],
      userIdentities: [
        userIdentity(
          'google_identity',
          'google_user',
          'google',
          'google_subject',
          'Test@Example.com'
        ),
        userIdentity(
          'email_identity',
          'temp_user',
          'email',
          email,
          'Test@Example.com'
        ),
      ],
      authAccounts: [
        providerAccount(
          'google_account',
          'google_user',
          'google',
          'google_subject'
        ),
        providerAccount('email_account', 'temp_user', 'email', 'TeSt@Example.com'),
      ],
    });
    const beforeGoogleIdentity = clone(
      linkCtx.db
        .rows('userIdentities')
        .find((identity) => identity.provider === 'google')
    );
    const emailAccount = linkCtx.db
      .rows('authAccounts')
      .find((account) => account.provider === 'email');

    const { userId } = await upsertUserAndAccount(
      linkCtx,
      null,
      { existingAccount: emailAccount },
      {
        type: 'verification',
        provider: { id: 'email', type: 'email' },
        profile: { email: '  TeSt@Example.com ', emailVerified: true },
      },
      {
        callbacks: {
          createOrUpdateUser: (authCtx, args) =>
            createOrUpdateUserHandler(authCtx, args),
        },
      }
    );

    expect(userId).toBe('google_user');
    expect(emailAccount.userId).toBe('google_user');
    expect(emailAccount.providerAccountId).toBe('TeSt@Example.com');
    expect(linkCtx.db.rows('users').map((user) => user._id)).toEqual([
      'google_user',
      'temp_user',
    ]);
    expect(
      linkCtx.db.rows('users').find((user) => user._id === 'google_user').email
    ).toBe(email);
    expectEmailShellTombstone(
      linkCtx.db.rows('users').find((user) => user._id === 'temp_user')
    );
    expect(
      linkCtx.db
        .rows('userIdentities')
        .find((identity) => identity.provider === 'google')
    ).toEqual(beforeGoogleIdentity);
    expect(
      linkCtx.db
        .rows('userIdentities')
        .find((identity) => identity.provider === 'email')
    ).toMatchObject({
      userId: 'google_user',
      providerUserId: email,
      email,
    });
  });

  test('OAuth provider identities stay unchanged after email linking', async () => {
    await expectVerifiedEmailLinksToOAuth('google');
    await expectVerifiedEmailLinksToOAuth('apple');
  });

  test('public createOrUpdateUser still rejects client identity injection', async () => {
    await expectCreateOrUpdateUserRejects({
      existingUserId: 'user_victim',
      provider: { id: 'email', type: 'email' },
      profile: {
        email: 'victim@example.com',
        emailVerified: true,
      },
    });
  });

  test('an email user with domain data and no OAuth match is kept', async () => {
    const ctx = createOAuthCtx({
      users: [shellUser('temp_user', PERSON_EMAIL)],
      userIdentities: [
        userIdentity(
          'email_identity',
          'temp_user',
          'email',
          PERSON_EMAIL,
          PERSON_EMAIL
        ),
      ],
      authAccounts: [
        providerAccount('email_account', 'temp_user', 'email', PERSON_EMAIL),
      ],
      memberships: [
        {
          _id: 'temp_membership',
          userId: 'temp_user',
          currentStamps: 2,
        },
      ],
    });

    const userId = await createOrUpdateUserHandler(
      ctx,
      verifiedEmailArgs('temp_user')
    );

    expect(userId).toBe('temp_user');
    expect(ctx.db.rows('users')).toHaveLength(1);
    expect(ctx.db.rows('users')[0].emailVerified).toBe(true);
    expect(ctx.db.rows('memberships')).toEqual([
      expect.objectContaining({
        _id: 'temp_membership',
        userId: 'temp_user',
        currentStamps: 2,
      }),
    ]);
  });

  const establishedUseRows = [
    ['memberships', 'userId'],
    ['businesses', 'ownerUserId'],
    ['businessStaff', 'userId'],
    ['events', 'customerUserId'],
    ['events', 'actorUserId'],
    ['customerReferrals', 'referredUserId'],
    ['customerReferrals', 'referrerUserId'],
    ['customerReferralLinks', 'referrerUserId'],
    ['businessReferrals', 'createdByUserId'],
    ['businessReferralLinks', 'createdByUserId'],
    ['referralRewards', 'recipientUserId'],
    ['legalAcceptances', 'userId'],
    ['businessOnboardingDrafts', 'userId'],
    ['providerRevocationCredentials', 'userId'],
    ['pushTokens', 'userId'],
    ['marketingConsentEvents', 'userId'],
  ];

  for (const [table, field] of establishedUseRows) {
    test(`non-pristine email user with ${table}.${field} verifies without merging`, async () => {
      const ctx = createOAuthCtx(oauthThenEmailTables('google'));
      ctx.db.rows(table).push({
        _id: `${table}_${field}`,
        [field]: 'temp_user',
      });
      const beforeGoogle = clone(
        ctx.db.rows('users').find((user) => user._id === 'google_user')
      );
      const beforeIdentities = clone(ctx.db.rows('userIdentities'));

      const userId = await createOrUpdateUserHandler(
        ctx,
        verifiedEmailArgs('temp_user')
      );

      expect(userId).toBe('temp_user');
      expect(ctx.db.rows('users').map((user) => user._id)).toEqual([
        'google_user',
        'temp_user',
      ]);
      expectStillActiveEmailUser(
        ctx.db.rows('users').find((user) => user._id === 'temp_user')
      );
      expect(ctx.db.rows('users').find((user) => user._id === 'temp_user'))
        .toMatchObject({ emailVerified: true });
      expect(
        ctx.db.rows('users').find((user) => user._id === 'google_user')
      ).toEqual(beforeGoogle);
      expect(ctx.db.rows('userIdentities')).toEqual(beforeIdentities);
      expect(
        ctx.db.rows(table).some((row) => row[field] === 'temp_user')
      ).toBe(true);
    });
  }

  test('a temporary user with a session verifies without merging', async () => {
    const ctx = createOAuthCtx(oauthThenEmailTables('google'));
    ctx.db.rows('authSessions').push({
      _id: 'temp_session',
      userId: 'temp_user',
      expirationTime: Date.now() + 60_000,
    });
    const beforeIdentities = clone(ctx.db.rows('userIdentities'));

    const userId = await createOrUpdateUserHandler(
      ctx,
      verifiedEmailArgs('temp_user')
    );

    expect(userId).toBe('temp_user');
    expect(ctx.db.rows('users').map((user) => user._id)).toEqual([
      'google_user',
      'temp_user',
    ]);
    expectStillActiveEmailUser(
      ctx.db.rows('users').find((user) => user._id === 'temp_user')
    );
    expect(ctx.db.rows('users').find((user) => user._id === 'temp_user'))
      .toMatchObject({ emailVerified: true });
    expect(ctx.db.rows('userIdentities')).toEqual(beforeIdentities);
    expect(ctx.db.rows('authSessions')).toEqual([
      expect.objectContaining({ _id: 'temp_session', userId: 'temp_user' }),
    ]);
  });

  test('a temporary user with a second auth account verifies without merging', async () => {
    const ctx = createOAuthCtx(oauthThenEmailTables('google'));
    ctx.db.rows('authAccounts').push({
      _id: 'extra_google_account',
      userId: 'temp_user',
      provider: 'google',
      providerAccountId: 'extra_subject',
    });
    const beforeIdentities = clone(ctx.db.rows('userIdentities'));

    const userId = await createOrUpdateUserHandler(
      ctx,
      verifiedEmailArgs('temp_user')
    );

    expect(userId).toBe('temp_user');
    expect(ctx.db.rows('users').map((user) => user._id)).toEqual([
      'google_user',
      'temp_user',
    ]);
    expectStillActiveEmailUser(
      ctx.db.rows('users').find((user) => user._id === 'temp_user')
    );
    expect(ctx.db.rows('users').find((user) => user._id === 'temp_user'))
      .toMatchObject({ emailVerified: true });
    expect(ctx.db.rows('userIdentities')).toEqual(beforeIdentities);
    expect(
      ctx.db.rows('authAccounts').find((account) => account._id === 'extra_google_account')
        .userId
    ).toBe('temp_user');
  });
});

describe('installed Convex Auth verification account contract', () => {
  test('callback user id is written onto the existing auth account', async () => {
    const ctx = createOAuthCtx({
      users: [
        { _id: 'temp_user', email: PERSON_EMAIL },
        { _id: 'oauth_user', email: PERSON_EMAIL },
      ],
      authAccounts: [
        {
          _id: 'email_account',
          userId: 'temp_user',
          provider: 'email',
          providerAccountId: PERSON_EMAIL,
        },
      ],
    });
    const account = ctx.db.rows('authAccounts')[0];

    const result = await upsertUserAndAccount(
      ctx,
      null,
      { existingAccount: account },
      {
        type: 'verification',
        provider: { id: 'email', type: 'email' },
        profile: { email: PERSON_EMAIL, emailVerified: true },
      },
      {
        callbacks: {
          async createOrUpdateUser(_ctx, args) {
            expect(args.existingUserId).toBe('temp_user');
            expect(args.type).toBe('verification');
            expect(args.profile.emailVerified).toBe(true);
            return 'oauth_user';
          },
        },
      }
    );

    expect(result.userId).toBe('oauth_user');
    expect(result.accountId).toBe('email_account');
    expect(account).toMatchObject({
      userId: 'oauth_user',
      provider: 'email',
      providerAccountId: PERSON_EMAIL,
      emailVerified: PERSON_EMAIL,
    });
  });

  test('verification source uses the callback id for the account and session', () => {
    const usersSource = readFileSync(`${AUTH_IMPL_ROOT}/users.ts`, 'utf8');
    const verifySource = readFileSync(
      `${AUTH_IMPL_ROOT}/mutations/verifyCodeAndSignIn.ts`,
      'utf8'
    );
    const createSource = readFileSync(
      `${AUTH_IMPL_ROOT}/mutations/createVerificationCode.ts`,
      'utf8'
    );
    const signInSource = readFileSync(`${AUTH_IMPL_ROOT}/signIn.ts`, 'utf8');

    const callbackIndex = usersSource.indexOf(
      'config.callbacks.createOrUpdateUser'
    );
    const reassignIndex = usersSource.indexOf(
      'account.existingAccount.userId !== userId'
    );
    expect(callbackIndex).toBeGreaterThan(-1);
    expect(reassignIndex).toBeGreaterThan(callbackIndex);
    expect(usersSource).toContain('await ctx.db.patch(accountId, { userId })');

    const invalidCodeIndex = verifySource.indexOf('Invalid verification code');
    const expiredCodeIndex = verifySource.indexOf('Expired verification code');
    const upsertIndex = verifySource.indexOf('await upsertUserAndAccount');
    const resultUserIndex = verifySource.indexOf(
      'const { userId } = verifyResult'
    );
    const sessionIndex = verifySource.indexOf(
      'await createNewAndDeleteExistingSession'
    );
    expect(invalidCodeIndex).toBeGreaterThan(-1);
    expect(expiredCodeIndex).toBeGreaterThan(-1);
    expect(upsertIndex).toBeGreaterThan(-1);
    expect(invalidCodeIndex).toBeLessThan(upsertIndex);
    expect(expiredCodeIndex).toBeLessThan(upsertIndex);
    expect(resultUserIndex).toBeGreaterThan(-1);
    expect(sessionIndex).toBeGreaterThan(resultUserIndex);

    expect(createSource).toContain('profile: { email: email! }');
    expect(createSource).not.toContain('emailVerified: true');
    expect(signInSource.indexOf('callCreateVerificationCode')).toBeGreaterThan(
      -1
    );
    expect(signInSource.indexOf('callCreateVerificationCode')).toBeLessThan(
      signInSource.indexOf('sendVerificationRequest')
    );
  });
});
