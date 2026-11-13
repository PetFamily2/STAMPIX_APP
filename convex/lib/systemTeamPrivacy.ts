import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

async function deleteAssignments(
  ctx: MutationCtx,
  memberId: Id<'systemTeamMembers'>
) {
  while (true) {
    const rows = await ctx.db
      .query('systemTeamAssignments')
      .withIndex('by_memberId', (q) => q.eq('memberId', memberId))
      .take(50);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    if (rows.length < 50) {
      return;
    }
  }
}

/** Called inside the established account-deletion transaction, never by the client. */
export async function deleteSystemTeamUserData(
  ctx: MutationCtx,
  user: Doc<'users'>
) {
  while (true) {
    const rows = await ctx.db
      .query('systemTeamMembers')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .take(50);
    for (const row of rows) {
      await deleteAssignments(ctx, row._id);
      await ctx.db.delete(row._id);
    }
    if (rows.length < 50) {
      break;
    }
  }
  const email = user.email?.trim().toLowerCase();
  if (email) {
    while (true) {
      const rows = await ctx.db
        .query('systemTeamMembers')
        .withIndex('by_email_userId', (q) =>
          q.eq('email', email).eq('userId', undefined)
        )
        .take(50);
      for (const row of rows) {
        await deleteAssignments(ctx, row._id);
        await ctx.db.delete(row._id);
      }
      if (rows.length < 50) {
        break;
      }
    }
  }
  // Notes attached to a support request belong to the deletion scope of its author.
  let cursor: string | null = null;
  while (true) {
    const page = await ctx.db
      .query('supportRequests')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .paginate({ cursor, numItems: 50 });
    for (const request of page.page) {
      while (true) {
        const assignments = await ctx.db
          .query('systemTeamAssignments')
          .withIndex('by_supportRequestId', (q) =>
            q.eq('supportRequestId', request._id)
          )
          .take(50);
        for (const row of assignments) {
          await ctx.db.delete(row._id);
        }
        if (assignments.length < 50) {
          break;
        }
      }
    }
    if (page.isDone) {
      break;
    }
    cursor = page.continueCursor;
  }
}
