import Google from '@auth/core/providers/google';
import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation } from './_generated/server';

const AUTH_REDIRECT_APP_PREFIXES = [
  'stampix://',
  'exp://',
  'exps://',
  'https://auth.expo.io/',
] as const;

function resolveAuthRedirectUrl(redirectTo: string): string {
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error('CONVEX_SITE_URL is not configured');
  }

  if (redirectTo.startsWith('?') || redirectTo.startsWith('/')) {
    return `${siteUrl}${redirectTo}`;
  }

  if (redirectTo.startsWith(siteUrl)) {
    const charAfterBase = redirectTo[siteUrl.length];
    if (!charAfterBase || charAfterBase === '/' || charAfterBase === '?') {
      return redirectTo;
    }
  }

  if (
    AUTH_REDIRECT_APP_PREFIXES.some((prefix) => redirectTo.startsWith(prefix))
  ) {
    return redirectTo;
  }

  throw new Error(
    `Invalid redirectTo URL: ${redirectTo}. Must be relative, on CONVEX_SITE_URL, or app deep link.`
  );
}

async function createOrUpdateUserHandler(ctx: any, args: any) {
  const now = Date.now();
  const identity =
    typeof ctx.auth?.getUserIdentity === 'function'
      ? await ctx.auth.getUserIdentity()
      : null;
  const subjectFromCtx = identity?.subject;
  const profile = (args as any)?.profile ?? {};
  const rawExternalId =
    subjectFromCtx ??
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
    emailVerified: Boolean(
      profile.emailVerified ?? profile.email_verified ?? false
    ),
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
    .filter((q: any) => q.eq(q.field('externalId'), externalId))
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
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password,
    Google({
      allowDangerousEmailAccountLinking: true,
      profile(rawProfile) {
        const profile = rawProfile as Record<string, unknown>;
        const subject =
          typeof profile.sub === 'string' ? profile.sub : undefined;

        if (!subject) {
          throw new Error('Google profile is missing subject');
        }

        return {
          id: subject,
          subject,
          email: typeof profile.email === 'string' ? profile.email : undefined,
          name: typeof profile.name === 'string' ? profile.name : undefined,
          image:
            typeof profile.picture === 'string' ? profile.picture : undefined,
          emailVerified: profile.email_verified === true,
        };
      },
    }),
  ],
  session: {
    totalDurationMs: 30 * 24 * 60 * 60 * 1000,
  },
  callbacks: {
    async redirect({ redirectTo }) {
      return resolveAuthRedirectUrl(redirectTo);
    },
    async createOrUpdateUser(ctx, args) {
      return await createOrUpdateUserHandler(ctx, args);
    },
  },
});

export const createOrUpdateUser = mutation({
  args: {
    profile: v.optional(v.any()),
    existingUserId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    return await createOrUpdateUserHandler(ctx, args);
  },
});
