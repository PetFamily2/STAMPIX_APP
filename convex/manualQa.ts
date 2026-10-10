import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import {
  MANUAL_QA_ROLES,
  manualQaBackendEnabled,
  manualQaEmail,
} from '../lib/auth/manualQaPolicy';
import { mutation, query } from './_generated/server';

const roleValidator = v.union(
  v.literal('customer'),
  v.literal('owner'),
  v.literal('manager'),
  v.literal('staff')
);

// Public synthetic credentials are explicitly authorized for this disposable Preview.
// This query creates no session; the Password provider must still authenticate normally.
export const getAccess = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      backendUrl: v.string(),
      password: v.string(),
      accounts: v.array(
        v.object({
          role: roleValidator,
          email: v.string(),
          userId: v.id('users'),
        })
      ),
    })
  ),
  handler: async (ctx) => {
    if (!manualQaBackendEnabled()) return null;
    const accounts = [];
    for (const role of MANUAL_QA_ROLES) {
      const email = manualQaEmail(role);
      const matches = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', email))
        .take(2);
      if (matches.length !== 1 || !matches[0].isActive) return null;
      accounts.push({ role, email, userId: matches[0]._id });
    }
    return {
      backendUrl: process.env.CONVEX_CLOUD_URL!,
      password: process.env.MANUAL_QA_PASSWORD!,
      accounts,
    };
  },
});

// A tester can replay their own normal onboarding, without creating a different identity.
export const restartOnboarding = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!manualQaBackendEnabled()) throw new Error('MANUAL_QA_DISABLED');
    const id = await getAuthUserId(ctx);
    const user = id ? await ctx.db.get(id) : null;
    if (
      !user?.isActive ||
      ![manualQaEmail('customer'), manualQaEmail('owner')].includes(
        user.email ?? ''
      )
    )
      throw new Error('MANUAL_QA_ACTOR_DENIED');
    await ctx.db.patch(user._id, {
      customerOnboardedAt: undefined,
      firstName: undefined,
      lastName: undefined,
      fullName: undefined,
      ...(user.email === manualQaEmail('owner')
        ? { businessOnboardedAt: undefined }
        : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});
