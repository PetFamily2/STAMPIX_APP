import { describe, expect, test } from 'bun:test';

import {
  ACCOUNT_DELETION_CLEANUP_BATCH_SIZE,
  ACCOUNT_DELETION_EMAIL_RATE_LIMIT_NAME,
  isAccountDeletionRateLimitError,
  listAccountDeletionRequestsImpl,
  purgeExpiredHandledRequestsImpl,
  resetAccountDeletionEmailRateLimit,
  setAccountDeletionRequestStatusImpl,
  submitAccountDeletionRequestImpl,
} from '../accountDeletionRequests';
import {
  handleAccountDeletionPageRequest,
  handleAccountDeletionSubmissionRequest,
} from '../http';

class FakeQuery {
  constructor(db, tableName) {
    this.db = db;
    this.tableName = tableName;
    this.predicates = [];
    this.direction = 'asc';
    this.sortField = 'createdAt';
  }

  withIndex(indexName, builder) {
    this.sortField = indexName === 'by_purgeAfter' ? 'purgeAfter' : 'createdAt';
    const conditions = [];
    const q = {
      eq: (field, value) => {
        conditions.push({ kind: 'eq', field, value });
        return q;
      },
      gte: (field, value) => {
        conditions.push({ kind: 'gte', field, value });
        return q;
      },
      lte: (field, value) => {
        conditions.push({ kind: 'lte', field, value });
        return q;
      },
    };
    builder(q);
    this.predicates.push((doc) =>
      conditions.every((condition) => {
        if (condition.kind === 'eq') {
          return doc[condition.field] === condition.value;
        }
        if (condition.kind === 'gte') {
          return doc[condition.field] >= condition.value;
        }
        return doc[condition.field] <= condition.value;
      })
    );
    return this;
  }

  order(direction) {
    this.direction = direction;
    return this;
  }

  docs() {
    const docs = this.db
      .rows(this.tableName)
      .filter((doc) => this.predicates.every((predicate) => predicate(doc)));
    docs.sort(
      (a, b) =>
        (a[this.sortField] ?? 0) -
        (b[this.sortField] ?? 0)
    );
    return this.direction === 'desc' ? docs.reverse() : docs;
  }

  async take(count) {
    return this.docs().slice(0, count);
  }

  async first() {
    return this.docs()[0] ?? null;
  }
}

class FakeDb {
  constructor(tables = {}) {
    this.tables = tables;
    this.sequence = 0;
  }

  rows(tableName) {
    this.tables[tableName] ??= [];
    return this.tables[tableName];
  }

  query(tableName) {
    return new FakeQuery(this, tableName);
  }

  async insert(tableName, value) {
    this.sequence += 1;
    const id = `${tableName}_${this.sequence}`;
    this.rows(tableName).push({ _id: id, ...value });
    return id;
  }

  async get(id) {
    for (const rows of Object.values(this.tables)) {
      const match = rows.find((row) => row._id === id);
      if (match) {
        return match;
      }
    }
    return null;
  }

  async patch(id, patch) {
    const row = await this.get(id);
    if (!row) {
      throw new Error('ROW_NOT_FOUND');
    }
    Object.assign(row, patch);
  }

  async delete(id) {
    for (const rows of Object.values(this.tables)) {
      const index = rows.findIndex((row) => row._id === id);
      if (index >= 0) {
        rows.splice(index, 1);
        return;
      }
    }
  }
}

function buildAuthCtx(db, userId) {
  return {
    db,
    auth: {
      getUserIdentity: async () => (userId ? { subject: userId } : null),
    },
  };
}

function buildFormRequest(values) {
  return new Request('https://example.convex.site/account-deletion/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values).toString(),
  });
}

const allowLimiter = {
  limit: async () => ({ ok: true, retryAfter: 0 }),
};

describe('public account deletion page', () => {
  test('is public Hebrew RTL HTML with security headers and a prominent form', async () => {
    const response = await handleAccountDeletionPageRequest();
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'"
    );
    expect(html).toContain('<html lang="he" dir="rtl">');
    expect(html).toContain('StampAix');
    expect(html).toContain('מחיקת חשבון');
    expect(html).toContain('action="/account-deletion/request"');
    expect(html).toContain('name="confirmDeletion"');
    expect(html).toContain('name="website"');
    expect(html).not.toContain('<script');
  });
});

describe('public account deletion submission', () => {
  test('stores only normalized minimum intake data and returns neutral success', async () => {
    const db = new FakeDb();
    const calls = [];
    const response = await handleAccountDeletionSubmissionRequest(
      {
        runMutation: async (_ref, args) => {
          calls.push(args);
          return await submitAccountDeletionRequestImpl(
            { db },
            args,
            allowLimiter
          );
        },
      },
      buildFormRequest({
        email: '  PERSON@Example.COM ',
        confirmDeletion: 'yes',
        website: '',
      })
    );
    const html = await response.text();
    const stored = db.rows('accountDeletionRequests')[0];

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(calls).toHaveLength(1);
    expect(stored.email).toBe('person@example.com');
    expect(stored.status).toBe('new');
    expect(stored.source).toBe('google_play_web');
    expect(stored.requestReference).toMatch(/^ADR-[a-f0-9]{24}$/);
    expect(Object.keys(stored).sort()).toEqual(
      [
        '_id',
        'createdAt',
        'email',
        'requestReference',
        'source',
        'status',
        'updatedAt',
      ].sort()
    );
    expect(html).toContain('בקשת המחיקה התקבלה');
    expect(html).toContain('אינה מאשרת אם קיים חשבון');
    expect(html).not.toContain('person@example.com');
  });

  test('rejects invalid email and missing confirmation without backend calls', async () => {
    let mutationCalls = 0;
    const ctx = {
      runMutation: async () => {
        mutationCalls += 1;
      },
    };

    const invalid = await handleAccountDeletionSubmissionRequest(
      ctx,
      buildFormRequest({ email: 'not-an-email', confirmDeletion: 'yes' })
    );
    const missingEmail = await handleAccountDeletionSubmissionRequest(
      ctx,
      buildFormRequest({ confirmDeletion: 'yes' })
    );
    const missingConfirmation = await handleAccountDeletionSubmissionRequest(
      ctx,
      buildFormRequest({ email: 'person@example.com' })
    );

    expect(invalid.status).toBe(400);
    expect(await invalid.text()).toContain('אימייל לא תקינה');
    expect(missingEmail.status).toBe(400);
    expect(await missingEmail.text()).toContain('אימייל לא תקינה');
    expect(missingConfirmation.status).toBe(400);
    expect(await missingConfirmation.text()).toContain('יש לאשר');
    expect(mutationCalls).toBe(0);
  });

  test('silently accepts a filled honeypot without creating a request', async () => {
    let mutationCalls = 0;
    const response = await handleAccountDeletionSubmissionRequest(
      {
        runMutation: async () => {
          mutationCalls += 1;
        },
      },
      buildFormRequest({
        email: 'bot@example.com',
        confirmDeletion: 'yes',
        website: 'https://spam.example',
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('בקשת המחיקה התקבלה');
    expect(mutationCalls).toBe(0);
  });

  test('known and unknown emails have identical non-enumerating semantics', async () => {
    const ctx = { runMutation: async () => ({}) };
    const known = await handleAccountDeletionSubmissionRequest(
      ctx,
      buildFormRequest({
        email: 'known@example.com',
        confirmDeletion: 'yes',
      })
    );
    const unknown = await handleAccountDeletionSubmissionRequest(
      ctx,
      buildFormRequest({
        email: 'unknown@example.com',
        confirmDeletion: 'yes',
      })
    );
    const knownHtml = await known.text();
    const unknownHtml = await unknown.text();

    expect(known.status).toBe(unknown.status);
    expect(knownHtml).toContain('אינה מאשרת אם קיים חשבון');
    expect(unknownHtml).toContain('אינה מאשרת אם קיים חשבון');
    expect(knownHtml).not.toContain('known@example.com');
    expect(unknownHtml).not.toContain('unknown@example.com');
  });

  test('passes no destructive target, user id, provider, password, or token', async () => {
    let submittedArgs;
    await handleAccountDeletionSubmissionRequest(
      {
        runMutation: async (_ref, args) => {
          submittedArgs = args;
        },
      },
      buildFormRequest({
        email: 'person@example.com',
        confirmDeletion: 'yes',
        userId: 'users_123',
        provider: 'google',
        token: 'secret',
        password: 'secret',
      })
    );

    expect(Object.keys(submittedArgs).sort()).toEqual([
      'email',
      'requestReference',
    ]);
  });

  test('does not reflect backend errors and returns generic no-store failure', async () => {
    const response = await handleAccountDeletionSubmissionRequest(
      {
        runMutation: async () => {
          throw new Error('USER_NOT_FOUND private@example.com google');
        },
      },
      buildFormRequest({
        email: 'private@example.com',
        confirmDeletion: 'yes',
      })
    );
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(html).not.toContain('USER_NOT_FOUND');
    expect(html).not.toContain('private@example.com');
    expect(html).not.toContain('google');
  });
});

describe('account deletion request abuse protection', () => {
  test('resets the exact normalized per-email limiter key with sanitized failures', async () => {
    const ctx = {};
    const calls = [];
    await resetAccountDeletionEmailRateLimit(
      ctx,
      ' Person@Example.com ',
      {
        reset: async (receivedCtx, name, args) => {
          calls.push({ receivedCtx, name, args });
        },
      }
    );

    expect(calls).toEqual([
      {
        receivedCtx: ctx,
        name: ACCOUNT_DELETION_EMAIL_RATE_LIMIT_NAME,
        args: { key: 'person@example.com' },
      },
    ]);

    let caught;
    try {
      await resetAccountDeletionEmailRateLimit(
        ctx,
        'private@example.com',
        {
          reset: async () => {
            throw new Error('private@example.com');
          },
        }
      );
    } catch (error) {
      caught = error;
    }
    expect(caught.message).toBe(
      'ACCOUNT_DELETION_EMAIL_RATE_LIMIT_RESET_FAILED'
    );
    expect(caught.message).not.toContain('private@example.com');
  });

  test('consumes normalized per-email and global limits', async () => {
    const db = new FakeDb();
    const calls = [];
    await submitAccountDeletionRequestImpl(
      { db },
      {
        email: ' Person@Example.com ',
        requestReference: 'ADR-0123456789abcdef',
      },
      {
        limit: async (_ctx, name, options) => {
          calls.push({ name, options });
          return { ok: true, retryAfter: 0 };
        },
      }
    );

    expect(calls).toEqual([
      {
        name: 'accountDeletionRequestEmailDailyV1',
        options: {
          key: 'person@example.com',
          reserve: false,
          throws: true,
        },
      },
      {
        name: 'accountDeletionRequestGlobalHourlyV1',
        options: { reserve: false, throws: true },
      },
    ]);
  });

  test('blocks per-email and global exhaustion before storage', async () => {
    for (const blockedName of [
      'accountDeletionRequestEmailDailyV1',
      'accountDeletionRequestGlobalHourlyV1',
    ]) {
      const db = new FakeDb();
      let caught;
      try {
        await submitAccountDeletionRequestImpl(
          { db },
          {
            email: 'person@example.com',
            requestReference: 'ADR-0123456789abcdef',
          },
          {
            limit: async (_ctx, name) => ({
              ok: name !== blockedName,
              retryAfter: 1000,
            }),
          }
        );
      } catch (error) {
        caught = error;
      }

      expect(isAccountDeletionRateLimitError(caught)).toBe(true);
      expect(db.rows('accountDeletionRequests')).toHaveLength(0);
    }
  });

  test('public 429 is generic and does not reveal account existence', async () => {
    const response = await handleAccountDeletionSubmissionRequest(
      {
        runMutation: async () => {
          throw {
            data: { code: 'ACCOUNT_DELETION_REQUEST_RATE_LIMITED' },
          };
        },
      },
      buildFormRequest({
        email: 'person@example.com',
        confirmDeletion: 'yes',
      })
    );
    const html = await response.text();

    expect(response.status).toBe(429);
    expect(html).toContain('בקשות רבות מדי');
    expect(html).not.toContain('person@example.com');
    expect(html).not.toContain('קיים חשבון עבור');
  });
});

describe('account deletion request admin and retention', () => {
  test('non-admin cannot list and admin can list newest requests', async () => {
    const db = new FakeDb({
      users: [
        { _id: 'users_non_admin', isAdmin: false },
        { _id: 'users_admin', isAdmin: true },
      ],
      accountDeletionRequests: [
        { _id: 'adr_old', status: 'new', createdAt: 10 },
        { _id: 'adr_new', status: 'in_review', createdAt: 20 },
      ],
    });

    await expect(
      listAccountDeletionRequestsImpl(buildAuthCtx(db, 'users_non_admin'))
    ).rejects.toThrow('NOT_AUTHORIZED');
    const requests = await listAccountDeletionRequestsImpl(
      buildAuthCtx(db, 'users_admin')
    );
    expect(requests.map((request) => request._id)).toEqual([
      'adr_new',
      'adr_old',
    ]);
  });

  test('admin can mark in review and handled with a 30-day purge date', async () => {
    const now = 1_800_000_000_000;
    const request = {
      _id: 'adr_1',
      status: 'new',
      createdAt: now - 100,
    };
    const db = new FakeDb({
      users: [{ _id: 'users_admin', isAdmin: true }],
      accountDeletionRequests: [request],
    });
    const ctx = buildAuthCtx(db, 'users_admin');

    await expect(
      setAccountDeletionRequestStatusImpl(
        buildAuthCtx(
          new FakeDb({
            users: [{ _id: 'users_non_admin', isAdmin: false }],
            accountDeletionRequests: [request],
          }),
          'users_non_admin'
        ),
        { requestId: request._id, status: 'handled' },
        now
      )
    ).rejects.toThrow('NOT_AUTHORIZED');

    await setAccountDeletionRequestStatusImpl(
      ctx,
      { requestId: request._id, status: 'in_review' },
      now
    );
    expect(request.status).toBe('in_review');
    expect(request.purgeAfter).toBeUndefined();

    await setAccountDeletionRequestStatusImpl(
      ctx,
      { requestId: request._id, status: 'handled' },
      now
    );
    expect(request.status).toBe('handled');
    expect(request.handledAt).toBe(now);
    expect(request.purgeAfter).toBe(now + 30 * 24 * 60 * 60 * 1000);
  });

  test('cleanup deletes at most 50 expired handled rows and preserves active rows', async () => {
    const now = 1_800_000_000_000;
    const expiredHandled = Array.from({ length: 55 }, (_, index) => ({
      _id: `handled_${index}`,
      email: `handled-${index}@example.com`,
      status: 'handled',
      purgeAfter: now - 1000 + index,
      createdAt: index,
    }));
    const active = {
      _id: 'active_1',
      email: 'active@example.com',
      status: 'in_review',
      purgeAfter: now - 5000,
      createdAt: 100,
    };
    const future = {
      _id: 'future_1',
      email: 'future@example.com',
      status: 'handled',
      purgeAfter: now + 1000,
      createdAt: 101,
    };
    const db = new FakeDb({
      accountDeletionRequests: [...expiredHandled, active, future],
    });

    const resetEmails = [];
    const result = await purgeExpiredHandledRequestsImpl(
      { db },
      now,
      async (_ctx, email) => {
        resetEmails.push(email);
      }
    );

    expect(result.examined).toBe(ACCOUNT_DELETION_CLEANUP_BATCH_SIZE);
    expect(result.deleted).toBe(ACCOUNT_DELETION_CLEANUP_BATCH_SIZE - 1);
    expect(result.resetEmailLimits).toBe(
      ACCOUNT_DELETION_CLEANUP_BATCH_SIZE - 1
    );
    expect(resetEmails).toHaveLength(
      ACCOUNT_DELETION_CLEANUP_BATCH_SIZE - 1
    );
    expect(resetEmails).not.toContain('handled-49@example.com');
    expect(
      db
        .rows('accountDeletionRequests')
        .some((request) => request._id === 'handled_49')
    ).toBe(true);
    expect(db.rows('accountDeletionRequests')).toContain(active);
    expect(db.rows('accountDeletionRequests')).toContain(future);
    expect(
      db
        .rows('accountDeletionRequests')
        .filter((request) => request.status === 'handled' && request.purgeAfter <= now)
        .length
    ).toBeGreaterThan(0);
  });

  test('cleanup does not reset a same-email limiter until the final bounded batch is purged', async () => {
    const now = 1_800_000_000_000;
    const email = 'shared-batch@example.com';
    const db = new FakeDb({
      accountDeletionRequests: Array.from({ length: 55 }, (_, index) => ({
        _id: `shared_batch_${index}`,
        email,
        status: 'handled',
        purgeAfter: now - 1000 + index,
        createdAt: index,
      })),
    });
    const resetEmails = [];
    const resetEmailRateLimit = async (_ctx, resetEmail) => {
      resetEmails.push(resetEmail);
    };

    const firstResult = await purgeExpiredHandledRequestsImpl(
      { db },
      now,
      resetEmailRateLimit
    );

    expect(firstResult).toEqual({
      examined: ACCOUNT_DELETION_CLEANUP_BATCH_SIZE,
      deleted: ACCOUNT_DELETION_CLEANUP_BATCH_SIZE,
      resetEmailLimits: 0,
    });
    expect(resetEmails).toEqual([]);
    expect(db.rows('accountDeletionRequests')).toHaveLength(5);
    expect(
      db
        .rows('accountDeletionRequests')
        .every((request) => request.email === email)
    ).toBe(true);

    const finalResult = await purgeExpiredHandledRequestsImpl(
      { db },
      now,
      resetEmailRateLimit
    );

    expect(finalResult).toEqual({
      examined: 5,
      deleted: 5,
      resetEmailLimits: 1,
    });
    expect(resetEmails).toEqual([email]);
    expect(db.rows('accountDeletionRequests')).toHaveLength(0);
  });

  test('cleanup resets the limiter once when the final request is purged', async () => {
    const now = 1_800_000_000_000;
    const db = new FakeDb({
      accountDeletionRequests: [
        {
          _id: 'final_1',
          email: 'final@example.com',
          status: 'handled',
          purgeAfter: now - 1,
          createdAt: now - 100,
        },
      ],
    });
    const resetEmails = [];

    const result = await purgeExpiredHandledRequestsImpl(
      { db },
      now,
      async (_ctx, email) => {
        resetEmails.push(email);
      }
    );

    expect(result).toEqual({ examined: 1, deleted: 1, resetEmailLimits: 1 });
    expect(resetEmails).toEqual(['final@example.com']);
    expect(db.rows('accountDeletionRequests')).toHaveLength(0);
  });

  test('cleanup keeps the limiter when another same-email request survives', async () => {
    const now = 1_800_000_000_000;
    const surviving = {
      _id: 'current_1',
      email: 'shared@example.com',
      status: 'in_review',
      createdAt: now,
    };
    const db = new FakeDb({
      accountDeletionRequests: [
        {
          _id: 'expired_1',
          email: 'shared@example.com',
          status: 'handled',
          purgeAfter: now - 1,
          createdAt: now - 100,
        },
        surviving,
      ],
    });
    const resetEmails = [];

    const result = await purgeExpiredHandledRequestsImpl(
      { db },
      now,
      async (_ctx, email) => {
        resetEmails.push(email);
      }
    );

    expect(result).toEqual({ examined: 1, deleted: 1, resetEmailLimits: 0 });
    expect(resetEmails).toEqual([]);
    expect(db.rows('accountDeletionRequests')).toEqual([surviving]);
  });

  test('cleanup deduplicates emails and resets only final retained requests', async () => {
    const now = 1_800_000_000_000;
    const db = new FakeDb({
      accountDeletionRequests: [
        {
          _id: 'a_1',
          email: 'a@example.com',
          status: 'handled',
          purgeAfter: now - 3,
          createdAt: 1,
        },
        {
          _id: 'a_2',
          email: 'a@example.com',
          status: 'handled',
          purgeAfter: now - 2,
          createdAt: 2,
        },
        {
          _id: 'b_expired',
          email: 'b@example.com',
          status: 'handled',
          purgeAfter: now - 1,
          createdAt: 3,
        },
        {
          _id: 'b_current',
          email: 'b@example.com',
          status: 'new',
          createdAt: 4,
        },
        {
          _id: 'c_1',
          email: 'c@example.com',
          status: 'handled',
          purgeAfter: now - 1,
          createdAt: 5,
        },
      ],
    });
    const resetEmails = [];

    const result = await purgeExpiredHandledRequestsImpl(
      { db },
      now,
      async (_ctx, email) => {
        resetEmails.push(email);
      }
    );

    expect(result).toEqual({ examined: 4, deleted: 4, resetEmailLimits: 2 });
    expect(resetEmails.sort()).toEqual(['a@example.com', 'c@example.com']);
    expect(db.rows('accountDeletionRequests').map((row) => row._id)).toEqual([
      'b_current',
    ]);
  });
});
