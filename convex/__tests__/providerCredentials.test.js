import { describe, expect, test } from 'bun:test';

import {
  attemptProviderRevocation,
  completeProviderRevocationJobImpl,
  decryptProviderToken,
  encryptProviderCredentialCapture,
  retryProviderRevocationJobImpl,
  sweepProviderRevocationJobsImpl,
  upsertProviderRevocationCredential,
} from '../providerCredentials';

const TEST_KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const TEST_ENV = {
  AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY: TEST_KEY,
  AUTH_APPLE_ID: 'com.stampix.test',
  AUTH_APPLE_SECRET: 'test-apple-client-secret',
};

const clone = (value) => JSON.parse(JSON.stringify(value));

class FakeQuery {
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
      lte(field, value) {
        predicates.push(
          (doc) => typeof doc[field] === 'number' && doc[field] <= value
        );
        return q;
      },
    };
    builder(q);
    return new FakeQuery(
      this.docs.filter((doc) => predicates.every((predicate) => predicate(doc)))
    );
  }

  async unique() {
    if (this.docs.length > 1) {
      throw new Error('Expected unique result');
    }
    return this.docs[0] ?? null;
  }

  async collect() {
    return this.docs;
  }

  async take(count) {
    return this.docs.slice(0, count);
  }
}

class FakeDb {
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
    return new FakeQuery(this.rows(table));
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
    const id = `${table}_${this.insertCount}`;
    this.rows(table).push({ _id: id, ...clone(value) });
    return id;
  }

  async patch(id, updates) {
    const row = await this.get(id);
    if (!row) throw new Error(`Missing row ${id}`);
    for (const [field, value] of Object.entries(updates)) {
      if (value === undefined) {
        delete row[field];
      } else {
        row[field] = clone(value);
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
  }
}

function buildCtx(tables = {}) {
  const scheduled = [];
  return {
    db: new FakeDb(tables),
    scheduled,
    scheduler: {
      runAfter: async (delay, fn, args) => scheduled.push({ delay, fn, args }),
    },
  };
}

async function encryptedJob(provider, options = {}) {
  const providerAccountId = `${provider}_subject`;
  const capture = await encryptProviderCredentialCapture(
    provider,
    providerAccountId,
    {
      access_token: `${provider}-access-token`,
      refresh_token: options.refresh === false ? undefined : `${provider}-refresh-token`,
      id_token: `${provider}-id-token`,
      expires_at: 2_000_000_000,
      token_type: 'Bearer',
    },
    { env: TEST_ENV, now: 1_000 }
  );
  return {
    _id: `${provider}_job`,
    provider,
    providerAccountId,
    ...capture,
    status: 'running',
    attemptCount: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
  };
}

async function attemptGoogleHttp400(body) {
  const job = await encryptedJob('google', { refresh: false });
  const result = await attemptProviderRevocation(job, {
    env: TEST_ENV,
    fetchImpl: async () =>
      new Response(body, {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    now: 1_000,
  });
  return { job, result };
}

describe('provider credential capture', () => {
  test('encrypts Apple access and refresh tokens without retaining the ID token', async () => {
    const capture = await encryptProviderCredentialCapture(
      'apple',
      'apple_subject',
      {
        access_token: 'raw-apple-access',
        refresh_token: 'raw-apple-refresh',
        id_token: 'raw-apple-id-token',
        expires_at: 2_000_000_000,
        token_type: 'Bearer',
      },
      { env: TEST_ENV, now: 1_000 }
    );

    const persistedRepresentation = JSON.stringify(capture);
    expect(persistedRepresentation).not.toContain('raw-apple-access');
    expect(persistedRepresentation).not.toContain('raw-apple-refresh');
    expect(persistedRepresentation).not.toContain('raw-apple-id-token');
    expect(capture).not.toHaveProperty('idToken');
    expect(capture).not.toHaveProperty('encryptedIdToken');
    await expect(
      decryptProviderToken(
        'apple',
        'apple_subject',
        'access',
        capture.encryptedAccessToken,
        TEST_ENV
      )
    ).resolves.toBe('raw-apple-access');
    await expect(
      decryptProviderToken(
        'apple',
        'apple_subject',
        'refresh',
        capture.encryptedRefreshToken,
        TEST_ENV
      )
    ).resolves.toBe('raw-apple-refresh');
  });

  test('encrypts the Google access token without changing or storing scopes and ID token', async () => {
    const capture = await encryptProviderCredentialCapture(
      'google',
      'google_subject',
      {
        access_token: 'raw-google-access',
        id_token: 'raw-google-id-token',
        expires_in: 3_600,
      },
      { env: TEST_ENV, now: 10_000 }
    );

    expect(JSON.stringify(capture)).not.toContain('raw-google-access');
    expect(JSON.stringify(capture)).not.toContain('raw-google-id-token');
    expect(capture.accessTokenExpiresAt).toBe(3_610_000);
    expect(capture).not.toHaveProperty('scope');
    await expect(
      decryptProviderToken(
        'google',
        'google_subject',
        'access',
        capture.encryptedAccessToken,
        TEST_ENV
      )
    ).resolves.toBe('raw-google-access');
  });

  test('uses a fresh random IV for every encrypted value', async () => {
    const first = await encryptProviderCredentialCapture(
      'google',
      'google_subject',
      { access_token: 'same-token' },
      { env: TEST_ENV }
    );
    const second = await encryptProviderCredentialCapture(
      'google',
      'google_subject',
      { access_token: 'same-token' },
      { env: TEST_ENV }
    );

    expect(first.encryptedAccessToken).not.toBe(second.encryptedAccessToken);
  });

  test('preserves an existing refresh token when a later login omits it', async () => {
    const ctx = buildCtx();
    const first = await encryptProviderCredentialCapture(
      'apple',
      'apple_subject',
      { access_token: 'access-one', refresh_token: 'refresh-one' },
      { env: TEST_ENV }
    );
    await upsertProviderRevocationCredential(ctx, {
      userId: 'user_one',
      provider: 'apple',
      providerAccountId: 'apple_subject',
      capture: first,
      now: 1,
    });
    const originalRefresh = ctx.db.rows('providerRevocationCredentials')[0]
      .encryptedRefreshToken;
    const second = await encryptProviderCredentialCapture(
      'apple',
      'apple_subject',
      { access_token: 'access-two' },
      { env: TEST_ENV }
    );
    await upsertProviderRevocationCredential(ctx, {
      userId: 'user_one',
      provider: 'apple',
      providerAccountId: 'apple_subject',
      capture: second,
      now: 2,
    });

    const stored = ctx.db.rows('providerRevocationCredentials')[0];
    expect(stored.userId).toBe('user_one');
    expect(stored.provider).toBe('apple');
    expect(stored.providerAccountId).toBe('apple_subject');
    expect(stored.encryptedRefreshToken).toBe(originalRefresh);
    await expect(
      decryptProviderToken(
        'apple',
        'apple_subject',
        'access',
        stored.encryptedAccessToken,
        TEST_ENV
      )
    ).resolves.toBe('access-two');
  });

  test('replaces an existing refresh token when the provider rotates it', async () => {
    const ctx = buildCtx();
    for (const [now, refreshToken] of [
      [1, 'refresh-one'],
      [2, 'refresh-two'],
    ]) {
      const capture = await encryptProviderCredentialCapture(
        'apple',
        'apple_subject',
        { access_token: `access-${now}`, refresh_token: refreshToken },
        { env: TEST_ENV }
      );
      await upsertProviderRevocationCredential(ctx, {
        userId: 'user_one',
        provider: 'apple',
        providerAccountId: 'apple_subject',
        capture,
        now,
      });
    }

    expect(ctx.db.rows('providerRevocationCredentials')).toHaveLength(1);
    const stored = ctx.db.rows('providerRevocationCredentials')[0];
    await expect(
      decryptProviderToken(
        'apple',
        'apple_subject',
        'refresh',
        stored.encryptedRefreshToken,
        TEST_ENV
      )
    ).resolves.toBe('refresh-two');
  });
});

describe('provider revocation execution', () => {
  test('Apple prefers refresh token and sends the matching hint', async () => {
    const job = await encryptedJob('apple');
    let requestBody;
    const result = await attemptProviderRevocation(job, {
      env: TEST_ENV,
      fetchImpl: async (_url, init) => {
        requestBody = new URLSearchParams(init.body);
        return new Response(null, { status: 200 });
      },
      now: 1_000,
    });

    expect(result).toEqual({ kind: 'completed', code: 'REVOKED' });
    expect(requestBody.get('token')).toBe('apple-refresh-token');
    expect(requestBody.get('token_type_hint')).toBe('refresh_token');
    expect(requestBody.get('client_id')).toBe(TEST_ENV.AUTH_APPLE_ID);
  });

  test('Apple falls back to a usable access token', async () => {
    const job = await encryptedJob('apple', { refresh: false });
    let requestBody;
    const result = await attemptProviderRevocation(job, {
      env: TEST_ENV,
      fetchImpl: async (_url, init) => {
        requestBody = new URLSearchParams(init.body);
        return new Response(null, { status: 200 });
      },
      now: 1_000,
    });

    expect(result.kind).toBe('completed');
    expect(requestBody.get('token')).toBe('apple-access-token');
    expect(requestBody.get('token_type_hint')).toBe('access_token');
  });

  test('Google prefers a legitimately available refresh token and otherwise uses access', async () => {
    for (const refresh of [true, false]) {
      const job = await encryptedJob('google', { refresh });
      let requestBody;
      const result = await attemptProviderRevocation(job, {
        env: TEST_ENV,
        fetchImpl: async (_url, init) => {
          requestBody = new URLSearchParams(init.body);
          return new Response(null, { status: 200 });
        },
        now: 1_000,
      });

      expect(result.kind).toBe('completed');
      expect(requestBody.get('token')).toBe(
        refresh ? 'google-refresh-token' : 'google-access-token'
      );
    }
  });

  test('classifies network, rate-limit, and provider failures without throwing', async () => {
    const job = await encryptedJob('google', { refresh: false });
    await expect(
      attemptProviderRevocation(job, {
        env: TEST_ENV,
        fetchImpl: async () => {
          throw new Error('network down');
        },
      })
    ).resolves.toEqual({ kind: 'transient', code: 'NETWORK_OR_TIMEOUT' });
    await expect(
      attemptProviderRevocation(job, {
        env: TEST_ENV,
        fetchImpl: async () => new Response(null, { status: 429 }),
      })
    ).resolves.toEqual({ kind: 'transient', code: 'HTTP_429' });
    await expect(
      attemptProviderRevocation(job, {
        env: TEST_ENV,
        fetchImpl: async () => new Response(null, { status: 503 }),
      })
    ).resolves.toEqual({ kind: 'transient', code: 'HTTP_503' });
  });

  test('Google invalid_token is already invalid and terminal completion destroys credentials', async () => {
    const { job, result } = await attemptGoogleHttp400(
      JSON.stringify({ error: 'invalid_token' })
    );
    expect(result).toEqual({ kind: 'completed', code: 'ALREADY_INVALID' });

    const ctx = buildCtx({ providerRevocationJobs: [job] });
    await completeProviderRevocationJobImpl(ctx, {
      jobId: job._id,
      status: result.kind,
      terminalCode: result.code,
      now: 10_000,
    });

    const stored = ctx.db.rows('providerRevocationJobs')[0];
    expect(stored.status).toBe('completed');
    expect(stored.encryptedAccessToken).toBeUndefined();
    expect(stored.encryptedRefreshToken).toBeUndefined();
    expect(stored.providerAccountId).toBeUndefined();
  });

  test('Google invalid_request becomes sanitized manual-required without persisting response details', async () => {
    const providerDetail = 'provider response detail must stay ephemeral';
    const responseBody = JSON.stringify({
      error: 'invalid_request',
      error_description: providerDetail,
    });
    const { job, result } = await attemptGoogleHttp400(responseBody);

    expect(result).toEqual({
      kind: 'manual_required',
      code: 'GOOGLE_INVALID_REQUEST',
    });
    expect(JSON.stringify(result)).not.toContain(providerDetail);
    expect(JSON.stringify(result)).not.toContain(responseBody);

    const ctx = buildCtx({ providerRevocationJobs: [job] });
    await completeProviderRevocationJobImpl(ctx, {
      jobId: job._id,
      status: result.kind,
      terminalCode: result.code,
      now: 10_000,
    });
    expect(JSON.stringify(ctx.db.rows('providerRevocationJobs'))).not.toContain(
      providerDetail
    );
    expect(JSON.stringify(ctx.db.rows('providerRevocationJobs'))).not.toContain(
      responseBody
    );
  });

  test('Google unknown HTTP 400 error codes become manual-required', async () => {
    const { result } = await attemptGoogleHttp400(
      JSON.stringify({ error: 'unexpected_provider_error' })
    );
    expect(result).toEqual({
      kind: 'manual_required',
      code: 'GOOGLE_HTTP_400',
    });
  });

  test('Google malformed and empty HTTP 400 bodies become manual-required', async () => {
    for (const body of ['{malformed-json', null]) {
      const { result } = await attemptGoogleHttp400(body);
      expect(result).toEqual({
        kind: 'manual_required',
        code: 'GOOGLE_HTTP_400',
      });
    }
  });

  test('expired Google access without refresh becomes manual-required and is never sent', async () => {
    const job = await encryptedJob('google', { refresh: false });
    job.accessTokenExpiresAt = 500;
    let called = false;
    const result = await attemptProviderRevocation(job, {
      env: TEST_ENV,
      now: 1_000,
      fetchImpl: async () => {
        called = true;
        return new Response(null, { status: 200 });
      },
    });

    expect(result).toEqual({
      kind: 'manual_required',
      code: 'NO_USABLE_TOKEN',
    });
    expect(called).toBe(false);
  });

  test('completion destroys encrypted material while another provider job remains isolated', async () => {
    const appleJob = await encryptedJob('apple');
    const googleJob = await encryptedJob('google');
    const ctx = buildCtx({
      providerRevocationJobs: [appleJob, googleJob],
    });

    await completeProviderRevocationJobImpl(ctx, {
      jobId: appleJob._id,
      status: 'completed',
      terminalCode: 'REVOKED',
      now: 10_000,
    });

    const completed = ctx.db.rows('providerRevocationJobs')[0];
    expect(completed.status).toBe('completed');
    expect(completed.encryptedAccessToken).toBeUndefined();
    expect(completed.encryptedRefreshToken).toBeUndefined();
    expect(completed.providerAccountId).toBeUndefined();
    expect(ctx.db.rows('providerRevocationJobs')[1]).toEqual(googleJob);
  });

  test('transient failures retry with bounded scheduling and terminal attempts purge tokens', async () => {
    const retryable = await encryptedJob('google');
    const terminal = { ...(await encryptedJob('apple')), _id: 'terminal_job', attemptCount: 3 };
    const ctx = buildCtx({ providerRevocationJobs: [retryable, terminal] });

    const retryResult = await retryProviderRevocationJobImpl(ctx, {
      jobId: retryable._id,
      terminalCode: 'HTTP_503',
      now: 10_000,
    });
    expect(retryResult.status).toBe('queued');
    expect(ctx.scheduled).toHaveLength(1);

    const terminalResult = await retryProviderRevocationJobImpl(ctx, {
      jobId: terminal._id,
      terminalCode: 'NETWORK_OR_TIMEOUT',
      now: 20_000,
    });
    expect(terminalResult.status).toBe('manual_required');
    const terminalStored = ctx.db
      .rows('providerRevocationJobs')
      .find((job) => job._id === terminal._id);
    expect(terminalStored.encryptedAccessToken).toBeUndefined();
    expect(terminalStored.encryptedRefreshToken).toBeUndefined();
  });

  test('hourly cleanup is bounded and purges only terminal receipts', async () => {
    const now = 1_000_000;
    const receipts = Array.from({ length: 60 }, (_, index) => ({
      _id: `receipt_${index}`,
      provider: 'google',
      credentialVersion: 1,
      status: index % 2 === 0 ? 'completed' : 'manual_required',
      attemptCount: 1,
      createdAt: 1,
      updatedAt: 1,
      completedAt: 2,
      purgeAfter: now - 1,
    }));
    const active = {
      _id: 'active_job',
      provider: 'google',
      providerAccountId: 'active_subject',
      encryptedAccessToken: 'encrypted',
      credentialVersion: 1,
      status: 'queued',
      attemptCount: 0,
      nextAttemptAt: now + 60_000,
      createdAt: now,
      updatedAt: now,
    };
    const ctx = buildCtx({ providerRevocationJobs: [...receipts, active] });

    const result = await sweepProviderRevocationJobsImpl(ctx, now);

    expect(result.purged).toBe(50);
    expect(ctx.db.rows('providerRevocationJobs')).toHaveLength(11);
    expect(ctx.db.rows('providerRevocationJobs')).toContainEqual(active);
  });
});
