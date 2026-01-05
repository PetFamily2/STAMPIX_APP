import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  session: {
    totalDurationMs: 30 * 24 * 60 * 60 * 1000,
  },
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      const now = Date.now();
      const profile = (args as any)?.profile ?? {};
      const rawExternalId =
        (args as any)?.userId ??
        profile.subject ??
        profile.sub ??
        profile.id ??
        profile.userId ??
        '';

      if (!rawExternalId) {
        throw new Error('Missing identity subject for externalId');
      }

      const externalId = String(rawExternalId);
      const rawEmail = profile.email ?? null;
      const email = rawEmail ? String(rawEmail).toLowerCase() : null;

      const defaultRole = 'customer' as const;
      const basePatch = {
        externalId,
        email: email ?? undefined,
        emailVerified: profile.emailVerified ?? false,
        fullName: profile.name || 'User',
        userType: 'free' as const,
        subscriptionPlan: 'free' as const,
        subscriptionStatus: 'inactive' as const,
        subscriptionProductId: undefined,
        subscriptionUpdatedAt: now,
        role: defaultRole,
        isActive: true,
        updatedAt: now,
      };

      const existingFromArgs = (args as any)?.existingUserId;

      if (existingFromArgs) {
        const existingUser = await ctx.db.get(existingFromArgs);
        await ctx.db.patch(existingFromArgs, {
          ...basePatch,
          role: existingUser?.role ?? defaultRole,
        });
        return existingFromArgs;
      }

      const existing = await ctx.db
        .query('users')
        .filter((q) => q.eq(q.field('externalId'), externalId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...basePatch,
          role: existing.role ?? defaultRole,
        });
        return existing._id;
      }

      return await ctx.db.insert('users', {
        ...basePatch,
        createdAt: now,
      });
    },
  },
});
