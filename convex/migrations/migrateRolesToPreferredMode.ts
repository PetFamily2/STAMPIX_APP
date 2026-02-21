/**
 * One-time migration: Populate preferredMode and isAdmin from existing role field.
 * Verifies businessStaff consistency for merchant/staff users.
 *
 * Run via Convex dashboard or CLI:
 *   bunx convex run migrations/migrateRolesToPreferredMode
 */
import type { Id } from '../_generated/dataModel';
import { mutation } from '../_generated/server';
import { ensureBusinessOwnerStaff } from '../business';

type AppMode = 'customer' | 'business' | 'staff';

export default mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const now = Date.now();
    let patched = 0;
    const warnings: string[] = [];

    for (const user of users) {
      const patches: Record<string, unknown> = {};
      let shouldPatch = false;

      if (user.role === 'admin') {
        patches.isAdmin = true;
        shouldPatch = true;
      }

      const staffEntries = await ctx.db
        .query('businessStaff')
        .withIndex('by_userId', (q: any) => q.eq('userId', user._id))
        .filter((q: any) => q.eq(q.field('isActive'), true))
        .collect();

      const hasOwnerOrManager = staffEntries.some(
        (s) => s.staffRole === 'owner' || s.staffRole === 'manager'
      );
      const hasAnyStaff = staffEntries.length > 0;

      let preferredMode: AppMode;
      if (hasOwnerOrManager) {
        preferredMode = 'business';
      } else if (hasAnyStaff) {
        preferredMode = 'staff';
      } else {
        preferredMode = 'customer';
      }

      if (!user.preferredMode || user.preferredMode !== preferredMode) {
        patches.preferredMode = preferredMode;
        shouldPatch = true;
      }

      if (user.role === 'merchant') {
        const hasOwnerRecord = staffEntries.some(
          (s) => s.staffRole === 'owner'
        );
        if (!hasOwnerRecord) {
          const ownedBiz = await ctx.db
            .query('businesses')
            .withIndex('by_ownerUserId', (q: any) =>
              q.eq('ownerUserId', user._id)
            )
            .first();
          if (ownedBiz) {
            await ensureBusinessOwnerStaff(
              ctx,
              ownedBiz._id,
              user._id as Id<'users'>,
              now
            );
            warnings.push(
              `Created missing businessStaff owner for user ${user._id} (business ${ownedBiz._id})`
            );
          } else {
            warnings.push(
              `User ${user._id} has role=merchant but no owned business and no businessStaff`
            );
          }
        }
      }

      if (user.role === 'staff' && !hasAnyStaff) {
        warnings.push(
          `User ${user._id} has role=staff but no businessStaff record (orphan). preferredMode=customer.`
        );
      }

      if (shouldPatch) {
        await ctx.db.patch(user._id, {
          ...patches,
          updatedAt: now,
        });
        patched++;
      }
    }

    return {
      total: users.length,
      patched,
      warnings,
    };
  },
});
