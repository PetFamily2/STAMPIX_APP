import { describe, expect, test } from 'bun:test';
import { assertSystemTaskScope } from '../lib/systemTeamPolicy';
import { deleteSystemTeamUserData } from '../lib/systemTeamPrivacy';
import {
  acceptInvite,
  assign,
  assignedTasks,
  assignmentTargets,
  auditTrail,
  cleanup,
  invite,
  listMembers,
  setMemberStatus,
  updateTask,
  viewer,
} from '../systemTeam';

function harness(initial = {}, actor = 'employee') {
  const state = {
    users: [
      {
        _id: 'admin',
        isAdmin: true,
        isActive: true,
        email: 'admin@example.org',
        emailVerified: true,
      },
      {
        _id: 'employee',
        isAdmin: false,
        isActive: true,
        email: 'employee@example.org',
        emailVerified: true,
      },
      {
        _id: 'other',
        isActive: true,
        email: 'other@example.org',
        emailVerified: true,
      },
    ],
    ...structuredClone(initial),
  };
  let sequence = 100;
  const rows = (table) => {
    state[table] ??= [];
    return state[table];
  };
  const find = (id) =>
    Object.values(state)
      .flat()
      .find((row) => row._id === id);
  function query(table) {
    const predicates = [];
    let descending = false;
    const selected = () =>
      rows(table)
        .filter((row) => predicates.every((predicate) => predicate(row)))
        .sort((a, b) =>
          descending
            ? (b._creationTime ?? b.createdAt ?? 0) -
              (a._creationTime ?? a.createdAt ?? 0)
            : 0
        );
    const chain = {
      withIndex(_index, builder) {
        const q = {
          eq(field, value) {
            predicates.push((row) => row[field] === value);
            return q;
          },
          gt(field, value) {
            predicates.push((row) => row[field] > value);
            return q;
          },
          lte(field, value) {
            predicates.push((row) => row[field] <= value);
            return q;
          },
        };
        builder(q);
        return chain;
      },
      order(direction) {
        descending = direction === 'desc';
        return chain;
      },
      async take(count) {
        return structuredClone(selected().slice(0, count));
      },
      async first() {
        return structuredClone(selected()[0] ?? null);
      },
      async unique() {
        const matches = selected();
        if (matches.length > 1) {
          throw new Error('NOT_UNIQUE');
        }
        return structuredClone(matches[0] ?? null);
      },
      async paginate(opts) {
        const start = Number(opts.cursor ?? 0);
        const matches = selected();
        return {
          page: structuredClone(matches.slice(start, start + opts.numItems)),
          isDone: start + opts.numItems >= matches.length,
          continueCursor: String(start + opts.numItems),
        };
      },
    };
    return chain;
  }
  const ctx = {
    auth: {
      getUserIdentity: async () =>
        actor ? { subject: `${actor}|session` } : null,
    },
    db: {
      query,
      get: async (id) => structuredClone(find(id) ?? null),
      insert: async (table, value) => {
        const id = `${table}_${++sequence}`;
        rows(table).push({
          ...structuredClone(value),
          _id: id,
          _creationTime: sequence,
        });
        return id;
      },
      patch: async (id, patch) => {
        const row = find(id);
        if (!row) {
          throw new Error('MISSING_ROW');
        }
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) {
            delete row[key];
          } else {
            row[key] = structuredClone(value);
          }
        }
      },
      delete: async (id) => {
        for (const table of Object.keys(state)) {
          state[table] = state[table].filter((row) => row._id !== id);
        }
      },
    },
  };
  return {
    ctx,
    state,
    as: (id) => {
      actor = id;
    },
  };
}
const member = (changes = {}) => ({
  _id: 'member',
  email: 'employee@example.org',
  userId: 'employee',
  role: 'service',
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
  ...changes,
});
const task = (changes = {}) => ({
  _id: 'task',
  memberId: 'member',
  kind: 'support',
  supportRequestId: 'request',
  targetKey: 'support:request',
  status: 'open',
  note: '',
  createdAt: 1,
  updatedAt: 1,
  ...changes,
});
const request = (changes = {}) => ({
  _id: 'request',
  userId: 'other',
  name: 'מבקש עזרה',
  email: 'private@example.org',
  message: 'תוכן פנייה פרטי',
  status: 'new',
  createdAt: 1,
  updatedAt: 1,
  ...changes,
});

describe('system employee scope (mock database)', () => {
  test('role/status/ownership matrix never grants a general admin capability', () => {
    for (const role of ['service', 'sales', 'admin', 'unknown']) {
      for (const memberStatus of [
        'active',
        'suspended',
        'revoked',
        'invited',
      ]) {
        for (const owned of [true, false]) {
          for (const kind of ['business', 'support', 'billing']) {
            const permitted =
              memberStatus === 'active' &&
              owned &&
              (role === 'service' || role === 'sales') &&
              (kind === 'business' ||
                (kind === 'support' && role === 'service'));
            const run = () =>
              assertSystemTaskScope({
                role,
                memberStatus,
                memberId: 'member',
                assignedMemberId: owned ? 'member' : 'someone_else',
                kind,
              });
            if (permitted) {
              expect(run).not.toThrow();
            } else {
              expect(run).toThrow('SYSTEM_TASK_NOT_AUTHORIZED');
            }
          }
        }
      }
    }
  });
  test('anonymous and disabled users are denied before viewing or writing team data', async () => {
    const h = harness({}, null);
    await expect(viewer._handler(h.ctx, {})).rejects.toThrow(
      'NOT_AUTHENTICATED'
    );
    h.as('employee');
    h.state.users[1].isActive = false;
    await expect(viewer._handler(h.ctx, {})).rejects.toThrow(
      'NOT_AUTHENTICATED'
    );
    await expect(
      invite._handler(h.ctx, { email: 'x@example.org', role: 'sales' })
    ).rejects.toThrow('NOT_AUTHENTICATED');
  });
  test('all administrator endpoints reject employees even if they are active team members', async () => {
    const h = harness({ systemTeamMembers: [member()] });
    for (const [endpoint, args] of [
      [invite, { email: 'other@example.org', role: 'sales' }],
      [listMembers, { paginationOpts: { cursor: null, numItems: 20 } }],
      [setMemberStatus, { memberId: 'member', status: 'active' }],
      [
        assign,
        {
          memberId: 'member',
          target: { kind: 'support', supportRequestId: 'request' },
        },
      ],
      [assignmentTargets, { kind: 'support', term: '' }],
      [auditTrail, { memberId: 'member' }],
    ]) {
      await expect(endpoint._handler(h.ctx, args)).rejects.toThrow(
        'ADMIN_REQUIRED'
      );
    }
    expect(h.state.users[1].isAdmin).toBe(false);
  });
  test('creating an invite is idempotent and does not activate access or send messages', async () => {
    const h = harness({}, 'admin');
    const args = { email: '  Employee@EXAMPLE.org ', role: 'sales' };
    const id = await invite._handler(h.ctx, args);
    expect(await invite._handler(h.ctx, args)).toBe(id);
    expect(h.state.systemTeamMembers).toHaveLength(1);
    expect(h.state.systemTeamMembers[0]).toMatchObject({
      email: 'employee@example.org',
      role: 'sales',
      status: 'invited',
    });
    expect(h.state.systemTeamMembers[0].userId).toBeUndefined();
    h.as('employee');
    expect((await viewer._handler(h.ctx, {})).member).toBeNull();
    expect((await viewer._handler(h.ctx, {})).invitations).toHaveLength(1);
    await expect(
      assignedTasks._handler(h.ctx, {
        status: 'open',
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).rejects.toThrow('SYSTEM_TEAM_REQUIRED');
  });
  test('claiming requires the invited verified email and a live invitation', async () => {
    for (const changes of [
      { emailVerified: false },
      { email: 'wrong@example.org' },
    ]) {
      const h = harness({
        systemTeamMembers: [
          member({
            userId: undefined,
            status: 'invited',
            expiresAt: Date.now() + 60000,
          }),
        ],
      });
      Object.assign(h.state.users[1], changes);
      await expect(
        acceptInvite._handler(h.ctx, { memberId: 'member' })
      ).rejects.toThrow('SYSTEM_INVITE_INVALID');
    }
    const expired = harness({
      systemTeamMembers: [
        member({ userId: undefined, status: 'invited', expiresAt: 1 }),
      ],
    });
    await expect(
      acceptInvite._handler(expired.ctx, { memberId: 'member' })
    ).rejects.toThrow('SYSTEM_INVITE_INVALID');
    const h = harness({
      systemTeamMembers: [
        member({
          userId: undefined,
          status: 'invited',
          expiresAt: Date.now() + 60000,
        }),
      ],
    });
    await acceptInvite._handler(h.ctx, { memberId: 'member' });
    expect(h.state.systemTeamMembers[0]).toMatchObject({
      userId: 'employee',
      status: 'active',
      role: 'service',
    });
    expect(h.state.users[1].isAdmin).toBe(false);
    expect(h.state.businessStaff).toBeUndefined();
    await expect(
      acceptInvite._handler(h.ctx, { memberId: 'member' })
    ).rejects.toThrow('SYSTEM_INVITE_INVALID');
  });
  test('suspension and revocation immediately block reads and task updates', async () => {
    for (const status of ['suspended', 'revoked']) {
      const h = harness(
        { systemTeamMembers: [member()], systemTeamAssignments: [task()] },
        'admin'
      );
      await setMemberStatus._handler(h.ctx, { memberId: 'member', status });
      h.as('employee');
      await expect(
        assignedTasks._handler(h.ctx, {
          status: 'open',
          paginationOpts: { cursor: null, numItems: 20 },
        })
      ).rejects.toThrow('SYSTEM_TEAM_REQUIRED');
      await expect(
        updateTask._handler(h.ctx, {
          taskId: 'task',
          note: 'x',
          status: 'resolved',
          expectedUpdatedAt: 1,
        })
      ).rejects.toThrow('SYSTEM_TEAM_REQUIRED');
    }
  });
  test('revoked memberships cannot be revived; a new invitation cannot inherit their assignments', async () => {
    const h = harness(
      { systemTeamMembers: [member()], systemTeamAssignments: [task()] },
      'admin'
    );
    await setMemberStatus._handler(h.ctx, {
      memberId: 'member',
      status: 'revoked',
    });
    await expect(
      setMemberStatus._handler(h.ctx, { memberId: 'member', status: 'active' })
    ).rejects.toThrow('SYSTEM_MEMBER_STATE_INVALID');
    const id = await invite._handler(h.ctx, {
      email: 'employee@example.org',
      role: 'sales',
    });
    expect(id).not.toBe('member');
    h.as('employee');
    await acceptInvite._handler(h.ctx, { memberId: id });
    expect(
      (
        await assignedTasks._handler(h.ctx, {
          status: 'open',
          paginationOpts: { cursor: null, numItems: 20 },
        })
      ).page
    ).toHaveLength(0);
  });
  test('service sees assigned requests only; unrelated records and owner-private fields are not returned', async () => {
    const h = harness({
      systemTeamMembers: [member()],
      systemTeamAssignments: [
        task(),
        task({ _id: 'other_task', memberId: 'different' }),
      ],
      supportRequests: [request()],
    });
    const result = await assignedTasks._handler(h.ctx, {
      status: 'open',
      paginationOpts: { cursor: null, numItems: 2000 },
    });
    expect(result.page).toHaveLength(1);
    expect(result.page[0].detail).toBe('תוכן פנייה פרטי');
    expect(result.page[0]).not.toHaveProperty('userId');
    await expect(
      updateTask._handler(h.ctx, {
        taskId: 'other_task',
        note: '',
        status: 'resolved',
        expectedUpdatedAt: 1,
      })
    ).rejects.toThrow('SYSTEM_TASK_NOT_AUTHORIZED');
  });
  test('sales cannot be assigned a support request or exploit a malformed support assignment', async () => {
    const h = harness(
      {
        systemTeamMembers: [member({ role: 'sales' })],
        systemTeamAssignments: [task()],
        supportRequests: [request()],
      },
      'admin'
    );
    await expect(
      assign._handler(h.ctx, {
        memberId: 'member',
        target: { kind: 'support', supportRequestId: 'request' },
      })
    ).rejects.toThrow('SYSTEM_TASK_NOT_AUTHORIZED');
    h.as('employee');
    await expect(
      assignedTasks._handler(h.ctx, {
        status: 'open',
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).rejects.toThrow('SYSTEM_TASK_NOT_AUTHORIZED');
  });
  test('task updates require the current revision and close a support request with retention metadata', async () => {
    const h = harness({
      systemTeamMembers: [member()],
      systemTeamAssignments: [task()],
      supportRequests: [request()],
    });
    const args = {
      taskId: 'task',
      note: 'טופל ללא משלוח הודעה',
      status: 'resolved',
      expectedUpdatedAt: 1,
      closeSupport: true,
    };
    await updateTask._handler(h.ctx, args);
    expect(h.state.supportRequests[0].status).toBe('handled');
    expect(h.state.supportRequests[0].purgeAfter).toBeGreaterThan(Date.now());
    expect(h.state.systemTeamAssignments[0].updatedAt).toBeGreaterThan(1);
    await expect(updateTask._handler(h.ctx, args)).rejects.toThrow(
      'SYSTEM_TASK_CHANGED'
    );
    expect(h.state.systemTeamAudit.map((row) => row.event)).toEqual([
      'support_closed',
      'task_updated',
    ]);
    expect(JSON.stringify(h.state.systemTeamAudit)).not.toContain(
      'private@example.org'
    );
  });
  test('oversized notes and fake support-close commands do not change records', async () => {
    const h = harness({
      systemTeamMembers: [member()],
      systemTeamAssignments: [
        task({
          kind: 'business',
          supportRequestId: undefined,
          businessId: 'business',
        }),
      ],
    });
    await expect(
      updateTask._handler(h.ctx, {
        taskId: 'task',
        note: 'x'.repeat(1201),
        status: 'open',
        expectedUpdatedAt: 1,
      })
    ).rejects.toThrow('SYSTEM_NOTE_TOO_LONG');
    await expect(
      updateTask._handler(h.ctx, {
        taskId: 'task',
        note: '',
        status: 'resolved',
        expectedUpdatedAt: 1,
        closeSupport: true,
      })
    ).rejects.toThrow('SYSTEM_TASK_NOT_AUTHORIZED');
    expect(h.state.systemTeamAssignments[0].status).toBe('open');
  });
  test('assigning a resolved business task reopens it without duplicating the assignment', async () => {
    const h = harness(
      {
        systemTeamMembers: [member({ role: 'sales' })],
        businesses: [{ _id: 'business', isActive: true }],
        systemTeamAssignments: [
          task({
            kind: 'business',
            businessId: 'business',
            targetKey: 'business:business',
            status: 'resolved',
            updatedAt: 100,
            purgeAfter: 200,
          }),
        ],
      },
      'admin'
    );
    expect(
      await assign._handler(h.ctx, {
        memberId: 'member',
        target: { kind: 'business', businessId: 'business' },
      })
    ).toBe('task');
    expect(h.state.systemTeamAssignments).toHaveLength(1);
    expect(h.state.systemTeamAssignments[0].status).toBe('open');
    expect(h.state.systemTeamAssignments[0].purgeAfter).toBeUndefined();
  });
  test('account deletion removes employee access and notes belonging to that user’s support requests', async () => {
    const h = harness({
      systemTeamMembers: [
        member(),
        member({ _id: 'pending', userId: undefined, status: 'invited' }),
        member({
          _id: 'other_member',
          email: 'other@example.org',
          userId: 'other',
        }),
      ],
      systemTeamAssignments: [
        task(),
        task({
          _id: 'private_note',
          memberId: 'other_member',
          supportRequestId: 'own_request',
        }),
        task({
          _id: 'unrelated',
          memberId: 'other_member',
          supportRequestId: 'other_request',
        }),
      ],
      supportRequests: [
        request({ _id: 'own_request', userId: 'employee' }),
        request({ _id: 'other_request', userId: 'other' }),
      ],
    });
    await deleteSystemTeamUserData(h.ctx, h.state.users[1]);
    expect(h.state.systemTeamMembers.map((row) => row._id)).toEqual([
      'other_member',
    ]);
    expect(h.state.systemTeamAssignments.map((row) => row._id)).toEqual([
      'unrelated',
    ]);
    expect(h.state.supportRequests).toHaveLength(2);
  });
  test('retention cleanup expires invitations and removes only due team records', async () => {
    const h = harness({
      systemTeamMembers: [
        member({ _id: 'expired', status: 'invited', expiresAt: 1 }),
        member({ _id: 'revoked', status: 'revoked', purgeAfter: 1 }),
        member(),
      ],
      systemTeamAssignments: [
        task({ _id: 'expired_task', purgeAfter: 1 }),
        task({ _id: 'revoked_task', memberId: 'revoked' }),
        task(),
      ],
      systemTeamAudit: [
        {
          _id: 'old_audit',
          memberId: 'member',
          event: 'accepted',
          purgeAfter: 1,
        },
      ],
    });
    await cleanup._handler(h.ctx, {});
    expect(
      h.state.systemTeamMembers.find((row) => row._id === 'expired').status
    ).toBe('revoked');
    expect(h.state.systemTeamMembers.some((row) => row._id === 'revoked')).toBe(
      false
    );
    expect(h.state.systemTeamAssignments.map((row) => row._id)).toEqual([
      'task',
    ]);
    expect(h.state.users).toHaveLength(3);
    expect(h.state.systemTeamAudit).toHaveLength(0);
  });
});
