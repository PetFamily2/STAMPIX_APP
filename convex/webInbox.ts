import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireCurrentUser } from './guards';
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id('messageLog'),
      title: v.string(),
      body: v.string(),
      createdAt: v.number(),
      readAt: v.union(v.number(), v.null()),
    })
  ),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    if (user.isActive !== true) throw new Error('NOT_AUTHORIZED');
    const rows = await ctx.db
      .query('messageLog')
      .withIndex('by_toUserId', (q) => q.eq('toUserId', user._id))
      .order('desc')
      .take(100);
    return rows.map((row) => ({
      id: row._id,
      title:
        typeof row.inboxPayload?.title === 'string'
          ? row.inboxPayload.title
          : 'עדכון חדש',
      body:
        typeof row.inboxPayload?.body === 'string'
          ? row.inboxPayload.body
          : 'יש עדכון חדש עבורך',
      createdAt: row.createdAt,
      readAt: row.readAt ?? null,
    }));
  },
});
export const markRead = mutation({
  args: { id: v.id('messageLog') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const row = await ctx.db.get(args.id);
    if (user.isActive !== true || !row || row.toUserId !== user._id)
      throw new Error('NOT_AUTHORIZED');
    if (!row.readAt) await ctx.db.patch(row._id, { readAt: Date.now() });
    return null;
  },
});
