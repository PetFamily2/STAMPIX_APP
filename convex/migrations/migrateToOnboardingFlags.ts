/**
 * One-time migration: Populate customerOnboardedAt, businessOnboardedAt, activeMode
 * from existing needsNameCapture, postAuthOnboardingRequired, preferredMode.
 *
 * Run via Convex dashboard or CLI:
 *   bunx convex run migrations/migrateToOnboardingFlags
 */
import { mutation } from '../_generated/server';

function hasSavedNames(user: {
  firstName?: string | null;
  lastName?: string | null;
}) {
  return Boolean(
    typeof user?.firstName === 'string' &&
      user.firstName.trim().length > 0 &&
      typeof user?.lastName === 'string' &&
      user.lastName.trim().length > 0
  );
}

export default mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    const now = Date.now();
    let patched = 0;

    for (const user of users) {
      const patches: Record<string, unknown> = {};
      let shouldPatch = false;

      const staffEntries = await ctx.db
        .query('businessStaff')
        .withIndex('by_userId', (q: any) => q.eq('userId', user._id))
        .filter((q: any) => q.eq(q.field('isActive'), true))
        .collect();
      const hasOwnerOrManager = staffEntries.some(
        (s) => s.staffRole === 'owner' || s.staffRole === 'manager'
      );

      // customerOnboardedAt: if needsNameCapture === false AND has names, consider onboarded
      if (user.customerOnboardedAt === undefined) {
        const wasOnboarded =
          user.needsNameCapture === false ||
          (user.postAuthOnboardingRequired === false && hasSavedNames(user));
        if (wasOnboarded) {
          patches.customerOnboardedAt = user.createdAt ?? now;
          shouldPatch = true;
        }
      }

      // businessOnboardedAt: if user has owner/manager businessStaff, consider business onboarded
      if (user.businessOnboardedAt === undefined && hasOwnerOrManager) {
        patches.businessOnboardedAt = user.createdAt ?? now;
        shouldPatch = true;
      }

      // activeMode: map preferredMode (staff -> customer, keep customer/business)
      if (user.activeMode === undefined) {
        const activeMode: 'customer' | 'business' =
          user.preferredMode === 'business' && hasOwnerOrManager
            ? 'business'
            : 'customer';
        patches.activeMode = activeMode;
        shouldPatch = true;
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
    };
  },
});
