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

      const patch = {
        email: args.profile.email ?? undefined,
        emailVerified: args.profile.emailVerified ?? false,
        fullName: args.profile.name || 'User',
        userType: 'free' as const,
        isActive: true,
        updatedAt: now,
      };

      if (args.existingUserId) {
        await ctx.db.patch(args.existingUserId, patch);
        return args.existingUserId;
      }

      return await ctx.db.insert('users', {
        ...patch,
        createdAt: now,
      });
    },
  },
});
