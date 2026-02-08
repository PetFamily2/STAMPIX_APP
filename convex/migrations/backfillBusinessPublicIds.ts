/**
 * One-time migration: Backfill businessPublicId and joinCode for existing businesses.
 *
 * Run via Convex dashboard or CLI:
 *   npx convex run migrations/backfillBusinessPublicIds
 */
import { mutation } from '../_generated/server';
import { generateJoinCode, generatePublicId } from '../lib/ids';

export default mutation({
  args: {},
  handler: async (ctx) => {
    const businesses = await ctx.db.query('businesses').collect();
    let updated = 0;

    for (const biz of businesses) {
      const patches: Record<string, string> = {};

      if (!biz.businessPublicId) {
        // Generate unique publicId
        let publicId = '';
        for (let i = 0; i < 10; i++) {
          const candidate = generatePublicId(12);
          const clash = await ctx.db
            .query('businesses')
            .withIndex('by_businessPublicId', (q: any) =>
              q.eq('businessPublicId', candidate)
            )
            .first();
          if (!clash) {
            publicId = candidate;
            break;
          }
        }
        if (publicId) {
          patches.businessPublicId = publicId;
        }
      }

      if (!biz.joinCode) {
        // Generate unique joinCode
        let code = '';
        for (let i = 0; i < 10; i++) {
          const candidate = generateJoinCode(8);
          const clash = await ctx.db
            .query('businesses')
            .withIndex('by_joinCode', (q: any) =>
              q.eq('joinCode', candidate)
            )
            .first();
          if (!clash) {
            code = candidate;
            break;
          }
        }
        if (code) {
          patches.joinCode = code;
        }
      }

      if (Object.keys(patches).length > 0) {
        await ctx.db.patch(biz._id, patches);
        updated++;
      }
    }

    return { total: businesses.length, updated };
  },
});
