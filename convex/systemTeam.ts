import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from './_generated/server';
import { SUPPORT_RETENTION_MS } from './dataRetention';
import {
  isBusinessPermanentDeletionInProgress,
  requireCurrentUser,
} from './guards';
import { normalizeSignInEmail } from './lib/signInEmail';
import {
  assertSystemTaskScope,
  boundedTeamNote,
  SYSTEM_TEAM_INVITE_MS,
  SYSTEM_TEAM_RETENTION_MS,
  systemTaskStatus,
  systemTeamRole,
  systemTeamStatus,
} from './lib/systemTeamPolicy';

const memberSummary = v.object({
  id: v.id('systemTeamMembers'),
  email: v.string(),
  role: systemTeamRole,
  status: systemTeamStatus,
  expiresAt: v.union(v.number(), v.null()),
});
const summarize = (member: Doc<'systemTeamMembers'>) => ({
  id: member._id,
  email: member.email,
  role: member.role,
  status: member.status,
  expiresAt: member.expiresAt ?? null,
});
function verifiedInvitationEmail(user: Doc<'users'>) {
  if (user.emailVerified !== true || !user.email) {
    return null;
  }
  try {
    return normalizeSignInEmail(user.email);
  } catch {
    return null;
  }
}
async function activeUser(ctx: QueryCtx | MutationCtx) {
  const user = await requireCurrentUser(ctx);
  if (!user.isActive) {
    throw new Error('NOT_AUTHENTICATED');
  }
  return user;
}
async function administrator(ctx: QueryCtx | MutationCtx) {
  const user = await activeUser(ctx);
  if (user.isAdmin !== true) {
    throw new Error('ADMIN_REQUIRED');
  }
  return user;
}
async function activeMember(ctx: QueryCtx | MutationCtx) {
  const user = await activeUser(ctx);
  const member = await ctx.db
    .query('systemTeamMembers')
    .withIndex('by_userId_status', (q) =>
      q.eq('userId', user._id).eq('status', 'active')
    )
    .unique();
  if (!member) {
    throw new Error('SYSTEM_TEAM_REQUIRED');
  }
  return { user, member };
}
async function audit(
  ctx: MutationCtx,
  memberId: Id<'systemTeamMembers'>,
  actorUserId: Id<'users'>,
  event: Doc<'systemTeamAudit'>['event']
) {
  const now = Date.now();
  await ctx.db.insert('systemTeamAudit', {
    memberId,
    actorUserId,
    event,
    createdAt: now,
    purgeAfter: now + 365 * 86400000,
  });
}

export const viewer = query({
  args: {},
  returns: v.object({
    administrator: v.boolean(),
    member: v.union(memberSummary, v.null()),
    invitations: v.array(memberSummary),
  }),
  handler: async (ctx) => {
    const user = await activeUser(ctx);
    const member = await ctx.db
      .query('systemTeamMembers')
      .withIndex('by_userId_status', (q) =>
        q.eq('userId', user._id).eq('status', 'active')
      )
      .unique();
    const email = verifiedInvitationEmail(user);
    const candidates = email
      ? await ctx.db
          .query('systemTeamMembers')
          .withIndex('by_email', (q) => q.eq('email', email))
          .order('desc')
          .take(10)
      : [];
    return {
      administrator: user.isAdmin === true,
      member: member ? summarize(member) : null,
      invitations: candidates
        .filter(
          (row) => row.status === 'invited' && (row.expiresAt ?? 0) > Date.now()
        )
        .map(summarize),
    };
  },
});

export const listMembers = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(memberSummary),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await administrator(ctx);
    const result = await ctx.db
      .query('systemTeamMembers')
      .order('desc')
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(30, Math.max(1, args.paginationOpts.numItems)),
      });
    return {
      page: result.page.map(summarize),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const invite = mutation({
  args: { email: v.string(), role: systemTeamRole },
  returns: v.id('systemTeamMembers'),
  handler: async (ctx, args) => {
    const admin = await administrator(ctx);
    const email = normalizeSignInEmail(args.email);
    const previous = await ctx.db
      .query('systemTeamMembers')
      .withIndex('by_email', (q) => q.eq('email', email))
      .order('desc')
      .first();
    const now = Date.now();
    if (previous && previous.status !== 'revoked') {
      if (
        previous.status === 'invited' &&
        (previous.expiresAt ?? 0) > now &&
        previous.role === args.role
      ) {
        return previous._id;
      }
      if (previous.status !== 'invited') {
        throw new Error('SYSTEM_MEMBER_ALREADY_EXISTS');
      }
      await ctx.db.patch(previous._id, {
        status: 'revoked',
        updatedAt: now,
        purgeAfter: now + SYSTEM_TEAM_RETENTION_MS,
      });
      await audit(ctx, previous._id, admin._id, 'revoked');
    }
    const id = await ctx.db.insert('systemTeamMembers', {
      email,
      role: args.role,
      status: 'invited',
      createdByUserId: admin._id,
      expiresAt: now + SYSTEM_TEAM_INVITE_MS,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, id, admin._id, 'invited');
    return id;
  },
});

export const acceptInvite = mutation({
  args: { memberId: v.id('systemTeamMembers') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await activeUser(ctx);
    const member = await ctx.db.get(args.memberId);
    if (
      !member ||
      member.status !== 'invited' ||
      (member.expiresAt ?? 0) <= Date.now() ||
      verifiedInvitationEmail(user) !== member.email
    ) {
      throw new Error('SYSTEM_INVITE_INVALID');
    }
    for (const status of ['active', 'suspended'] as const) {
      const existing = await ctx.db
        .query('systemTeamMembers')
        .withIndex('by_userId_status', (q) =>
          q.eq('userId', user._id).eq('status', status)
        )
        .first();
      if (existing) {
        throw new Error('SYSTEM_MEMBER_ALREADY_EXISTS');
      }
    }
    await ctx.db.patch(member._id, {
      userId: user._id,
      status: 'active',
      expiresAt: undefined,
      updatedAt: Date.now(),
    });
    await audit(ctx, member._id, user._id, 'accepted');
    return null;
  },
});

export const setMemberStatus = mutation({
  args: {
    memberId: v.id('systemTeamMembers'),
    status: v.union(
      v.literal('active'),
      v.literal('suspended'),
      v.literal('revoked')
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await administrator(ctx);
    const member = await ctx.db.get(args.memberId);
    if (
      !member ||
      member.status === 'revoked' ||
      (member.status === 'invited' && args.status !== 'revoked')
    ) {
      throw new Error('SYSTEM_MEMBER_STATE_INVALID');
    }
    await ctx.db.patch(member._id, {
      status: args.status,
      updatedAt: Date.now(),
      purgeAfter:
        args.status === 'revoked'
          ? Date.now() + SYSTEM_TEAM_RETENTION_MS
          : undefined,
    });
    await audit(ctx, member._id, admin._id, args.status);
    return null;
  },
});

export const assignmentTargets = query({
  args: {
    kind: v.union(v.literal('business'), v.literal('support')),
    term: v.string(),
  },
  returns: v.array(
    v.object({ id: v.string(), title: v.string(), detail: v.string() })
  ),
  handler: async (ctx, args) => {
    await administrator(ctx);
    const term = args.term.trim().slice(0, 120);
    if (args.kind === 'support') {
      const rows = await ctx.db
        .query('supportRequests')
        .withIndex('by_status', (q) => q.eq('status', 'new'))
        .order('desc')
        .take(20);
      return rows.map((row) => ({
        id: String(row._id),
        title: row.name,
        detail: row.message.slice(0, 160),
      }));
    }
    if (term.length < 2) {
      return [];
    }
    const rows = await ctx.db
      .query('businesses')
      .withSearchIndex('search_public_name', (q) =>
        q.search('name', term).eq('isActive', true)
      )
      .take(20);
    return rows
      .filter((row) => !isBusinessPermanentDeletionInProgress(row))
      .map((row) => ({
        id: String(row._id),
        title: row.name,
        detail: row.formattedAddress ?? '',
      }));
  },
});

const targetValidator = v.union(
  v.object({ kind: v.literal('business'), businessId: v.id('businesses') }),
  v.object({
    kind: v.literal('support'),
    supportRequestId: v.id('supportRequests'),
  })
);
export const assign = mutation({
  args: { memberId: v.id('systemTeamMembers'), target: targetValidator },
  returns: v.id('systemTeamAssignments'),
  handler: async (ctx, args) => {
    const admin = await administrator(ctx);
    const member = await ctx.db.get(args.memberId);
    if (
      !member ||
      member.status !== 'active' ||
      (args.target.kind === 'support' && member.role !== 'service')
    ) {
      throw new Error('SYSTEM_TASK_NOT_AUTHORIZED');
    }
    if (args.target.kind === 'business') {
      const business = await ctx.db.get(args.target.businessId);
      if (
        !business?.isActive ||
        isBusinessPermanentDeletionInProgress(business)
      ) {
        throw new Error('BUSINESS_NOT_FOUND');
      }
    } else if (!(await ctx.db.get(args.target.supportRequestId))) {
      throw new Error('SUPPORT_REQUEST_NOT_FOUND');
    }
    const targetKey =
      args.target.kind === 'business'
        ? `business:${args.target.businessId}`
        : `support:${args.target.supportRequestId}`;
    const previous = await ctx.db
      .query('systemTeamAssignments')
      .withIndex('by_memberId_targetKey', (q) =>
        q.eq('memberId', member._id).eq('targetKey', targetKey)
      )
      .unique();
    if (previous) {
      if (previous.status === 'resolved') {
        await ctx.db.patch(previous._id, {
          status: 'open',
          updatedAt: Math.max(Date.now(), previous.updatedAt + 1),
          purgeAfter: undefined,
        });
        await audit(ctx, member._id, admin._id, 'assigned');
      }
      return previous._id;
    }
    const now = Date.now();
    const id = await ctx.db.insert('systemTeamAssignments', {
      memberId: member._id,
      targetKey,
      ...args.target,
      status: 'open',
      note: '',
      createdByUserId: admin._id,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, member._id, admin._id, 'assigned');
    return id;
  },
});

export const assignedTasks = query({
  args: { status: systemTaskStatus, paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        id: v.id('systemTeamAssignments'),
        kind: v.union(v.literal('business'), v.literal('support')),
        status: systemTaskStatus,
        note: v.string(),
        updatedAt: v.number(),
        title: v.string(),
        detail: v.string(),
        contact: v.string(),
        targetAvailable: v.boolean(),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const { member } = await activeMember(ctx);
    const result = await ctx.db
      .query('systemTeamAssignments')
      .withIndex('by_memberId_status', (q) =>
        q.eq('memberId', member._id).eq('status', args.status)
      )
      .order('desc')
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(20, Math.max(1, args.paginationOpts.numItems)),
      });
    const page = await Promise.all(
      result.page.map(async (task) => {
        assertSystemTaskScope({
          role: member.role,
          memberStatus: member.status,
          memberId: String(member._id),
          assignedMemberId: String(task.memberId),
          kind: task.kind,
        });
        const business = task.businessId
          ? await ctx.db.get(task.businessId)
          : null;
        const support = task.supportRequestId
          ? await ctx.db.get(task.supportRequestId)
          : null;
        const available =
          task.kind === 'business'
            ? !!business?.isActive &&
              !isBusinessPermanentDeletionInProgress(business)
            : !!support;
        return {
          id: task._id,
          kind: task.kind,
          status: task.status,
          note: task.note,
          updatedAt: task.updatedAt,
          targetAvailable: available,
          title: available
            ? (business?.name ?? support?.name ?? 'משימה')
            : 'הרשומה אינה זמינה',
          detail: available
            ? (business?.formattedAddress ?? support?.message ?? '')
            : '',
          contact: available
            ? (business?.businessPhone ?? support?.email ?? '')
            : '',
        };
      })
    );
    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id('systemTeamAssignments'),
    status: systemTaskStatus,
    note: v.string(),
    expectedUpdatedAt: v.number(),
    closeSupport: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, member } = await activeMember(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error('SYSTEM_TASK_NOT_FOUND');
    }
    assertSystemTaskScope({
      role: member.role,
      memberStatus: member.status,
      memberId: String(member._id),
      assignedMemberId: String(task.memberId),
      kind: task.kind,
    });
    if (task.updatedAt !== args.expectedUpdatedAt) {
      throw new Error('SYSTEM_TASK_CHANGED');
    }
    const note = boundedTeamNote(args.note);
    const now = Math.max(Date.now(), task.updatedAt + 1);
    if (args.closeSupport) {
      if (
        task.kind !== 'support' ||
        member.role !== 'service' ||
        !task.supportRequestId ||
        args.status !== 'resolved'
      ) {
        throw new Error('SYSTEM_TASK_NOT_AUTHORIZED');
      }
      const request = await ctx.db.get(task.supportRequestId);
      if (!request) {
        throw new Error('SUPPORT_REQUEST_NOT_FOUND');
      }
      if (request.status !== 'handled') {
        await ctx.db.patch(request._id, {
          status: 'handled',
          updatedAt: now,
          closedAt: now,
          purgeAfter: now + SUPPORT_RETENTION_MS,
        });
      }
      await audit(ctx, member._id, user._id, 'support_closed');
    }
    await ctx.db.patch(task._id, {
      status: args.status,
      note,
      updatedAt: now,
      purgeAfter:
        args.status === 'resolved' ? now + SYSTEM_TEAM_RETENTION_MS : undefined,
    });
    await audit(ctx, member._id, user._id, 'task_updated');
    return null;
  },
});

export const auditTrail = query({
  args: { memberId: v.id('systemTeamMembers') },
  returns: v.array(
    v.object({
      id: v.id('systemTeamAudit'),
      event: v.string(),
      createdAt: v.number(),
      actorName: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    await administrator(ctx);
    const rows = await ctx.db
      .query('systemTeamAudit')
      .withIndex('by_memberId', (q) => q.eq('memberId', args.memberId))
      .order('desc')
      .take(50);
    return await Promise.all(
      rows.map(async (row) => {
        const actor = row.actorUserId
          ? await ctx.db.get(row.actorUserId)
          : null;
        return {
          id: row._id,
          event: row.event,
          createdAt: row.createdAt,
          actorName: actor?.fullName ?? actor?.email ?? 'חשבון שהוסר',
        };
      })
    );
  },
});

export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query('systemTeamMembers')
      .withIndex('by_status_expiresAt', (q) =>
        q.eq('status', 'invited').lte('expiresAt', now)
      )
      .take(100);
    for (const member of expired) {
      await ctx.db.patch(member._id, {
        status: 'revoked',
        updatedAt: now,
        purgeAfter: now + SYSTEM_TEAM_RETENTION_MS,
      });
    }
    for (const table of ['systemTeamAudit', 'systemTeamAssignments'] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_purgeAfter', (q) =>
          q.gt('purgeAfter', 0).lte('purgeAfter', now)
        )
        .take(100);
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
    }
    const members = await ctx.db
      .query('systemTeamMembers')
      .withIndex('by_purgeAfter', (q) =>
        q.gt('purgeAfter', 0).lte('purgeAfter', now)
      )
      .take(20);
    for (const member of members) {
      const tasks = await ctx.db
        .query('systemTeamAssignments')
        .withIndex('by_memberId', (q) => q.eq('memberId', member._id))
        .take(100);
      for (const task of tasks) {
        await ctx.db.delete(task._id);
      }
      if (tasks.length < 100) {
        await ctx.db.delete(member._id);
      }
    }
    return null;
  },
});
