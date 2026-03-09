import Apple from '@auth/core/providers/apple';
import Google from '@auth/core/providers/google';
import { Email } from '@convex-dev/auth/providers/Email';
import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth, getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation } from './_generated/server';

const AUTH_REDIRECT_APP_PREFIXES = [
  'stampix://',
  'exp://',
  'exps://',
  'https://auth.expo.io/',
] as const;
const EMAIL_OTP_LENGTH = 6;
const EMAIL_OTP_MAX_AGE_SECONDS = 3 * 60;

function normalizeEmailIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function generateEmailOtpToken(): string {
  return Array.from({ length: EMAIL_OTP_LENGTH }, () =>
    Math.floor(Math.random() * 10).toString()
  ).join('');
}

async function sendEmailVerificationOtp(email: string, token: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error('OTP_NOT_CONFIGURED');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'קוד אימות ל-Stampix',
      html: `<div dir="rtl" style="font-family: Arial, sans-serif; color:#0f172a;">
<p>הקוד שלך הוא:</p>
<p style="font-size:28px;font-weight:800;letter-spacing:4px;margin:8px 0;">${token}</p>
<p>תוקף הקוד: 3 דקות.</p>
</div>`,
    }),
  });

  if (!response.ok) {
    throw new Error(`EMAIL_SEND_FAILED:${response.status}`);
  }
}

type IdentityProvider = 'google' | 'apple' | 'email';

type NormalizedIdentityInput = {
  provider: IdentityProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  avatarUrl?: string;
  now: number;
};

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNamePart(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : undefined;
}

function splitFullName(fullName?: string): {
  firstName?: string;
  lastName?: string;
} {
  if (!fullName) {
    return {};
  }
  const tokens = fullName
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return {};
  }

  if (tokens.length === 1) {
    return { firstName: tokens[0] };
  }

  return {
    firstName: tokens[0],
    lastName: tokens.slice(1).join(' '),
  };
}

function joinNameParts(
  firstName?: string,
  lastName?: string
): string | undefined {
  const parts = [firstName, lastName].filter((part): part is string =>
    Boolean(part?.trim())
  );
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join(' ');
}

function normalizeProviderId(rawProviderId: unknown): IdentityProvider | null {
  if (rawProviderId === 'google') {
    return 'google';
  }
  if (rawProviderId === 'apple') {
    return 'apple';
  }
  if (rawProviderId === 'email' || rawProviderId === 'password') {
    return 'email';
  }
  return null;
}

function resolveProviderUserId(
  provider: IdentityProvider,
  profile: Record<string, unknown>
): string | null {
  if (provider === 'email') {
    return normalizeEmail(profile.email);
  }

  const candidates = [profile.subject, profile.sub, profile.id, profile.userId];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const normalized = candidate.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function resolveEmailVerified(profile: Record<string, unknown>): boolean {
  if (typeof profile.emailVerified === 'boolean') {
    return profile.emailVerified;
  }
  if (typeof profile.email_verified === 'boolean') {
    return profile.email_verified;
  }
  return false;
}

function resolveNameData(profile: Record<string, unknown>) {
  const providedFirstName = normalizeNamePart(
    profile.firstName ?? profile.given_name
  );
  const providedLastName = normalizeNamePart(
    profile.lastName ?? profile.family_name
  );
  const providedFullName = normalizeNamePart(profile.name);

  const splitFromFull = splitFullName(providedFullName);
  const firstName = providedFirstName ?? splitFromFull.firstName;
  const lastName = providedLastName ?? splitFromFull.lastName;

  return {
    firstName,
    lastName,
    fullName: providedFullName ?? joinNameParts(firstName, lastName),
  };
}

function resolveAvatarUrl(
  profile: Record<string, unknown>
): string | undefined {
  if (typeof profile.image === 'string' && profile.image.trim()) {
    return profile.image.trim();
  }
  if (typeof profile.picture === 'string' && profile.picture.trim()) {
    return profile.picture.trim();
  }
  return undefined;
}

function buildUserMetadataPatch(user: any, input: NormalizedIdentityInput) {
  const patch: Record<string, unknown> = {};

  if (input.email && !normalizeEmail(user?.email)) {
    patch.email = input.email;
  }

  if (input.emailVerified && user?.emailVerified !== true) {
    patch.emailVerified = true;
  }

  if (!normalizeNamePart(user?.firstName) && input.firstName) {
    patch.firstName = input.firstName;
  }

  if (!normalizeNamePart(user?.lastName) && input.lastName) {
    patch.lastName = input.lastName;
  }

  if (!normalizeNamePart(user?.fullName)) {
    const derivedFullName =
      input.fullName ??
      joinNameParts(
        (patch.firstName as string | undefined) ??
          normalizeNamePart(user?.firstName),
        (patch.lastName as string | undefined) ??
          normalizeNamePart(user?.lastName)
      );
    if (derivedFullName) {
      patch.fullName = derivedFullName;
    }
  }

  if (!normalizeNamePart(user?.avatarUrl) && input.avatarUrl) {
    patch.avatarUrl = input.avatarUrl;
  }

  patch.updatedAt = input.now;

  return patch;
}

async function findSingleUserByNormalizedEmail(ctx: any, email: string) {
  const matches = await ctx.db
    .query('users')
    .withIndex('by_email', (q: any) => q.eq('email', email))
    .collect();

  if (matches.length !== 1) {
    return null;
  }
  return matches[0];
}

async function upsertIdentityRecord(
  ctx: any,
  input: NormalizedIdentityInput,
  userId: Id<'users'>
) {
  const existingIdentity = await ctx.db
    .query('userIdentities')
    .withIndex('by_provider_providerUserId', (q: any) =>
      q
        .eq('provider', input.provider)
        .eq('providerUserId', input.providerUserId)
    )
    .unique();

  if (existingIdentity) {
    const patch: Record<string, unknown> = {};
    if (String(existingIdentity.userId) !== String(userId)) {
      patch.userId = userId;
    }
    if (input.email && existingIdentity.email !== input.email) {
      patch.email = input.email;
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = input.now;
      await ctx.db.patch(existingIdentity._id, patch);
    }
    return existingIdentity;
  }

  return await ctx.db.insert('userIdentities', {
    userId,
    provider: input.provider,
    providerUserId: input.providerUserId,
    email: input.email ?? undefined,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

async function linkIdentityToUser(
  ctx: any,
  input: NormalizedIdentityInput
): Promise<Id<'users'>> {
  const directIdentity = await ctx.db
    .query('userIdentities')
    .withIndex('by_provider_providerUserId', (q: any) =>
      q
        .eq('provider', input.provider)
        .eq('providerUserId', input.providerUserId)
    )
    .unique();

  if (directIdentity) {
    const linkedUser = await ctx.db.get(directIdentity.userId);
    if (linkedUser) {
      await ctx.db.patch(
        linkedUser._id,
        buildUserMetadataPatch(linkedUser, input)
      );
      await upsertIdentityRecord(ctx, input, linkedUser._id);
      return linkedUser._id;
    }
  }

  if (input.email && input.emailVerified) {
    const existingByVerifiedEmail = await findSingleUserByNormalizedEmail(
      ctx,
      input.email
    );

    if (existingByVerifiedEmail) {
      await upsertIdentityRecord(ctx, input, existingByVerifiedEmail._id);
      await ctx.db.patch(
        existingByVerifiedEmail._id,
        buildUserMetadataPatch(existingByVerifiedEmail, input)
      );
      return existingByVerifiedEmail._id;
    }
  }

  const firstName = input.firstName;
  const lastName = input.lastName;
  const fullName =
    input.fullName ?? joinNameParts(firstName, lastName) ?? 'User';

  const userId = await ctx.db.insert('users', {
    externalId: `${input.provider}:${input.providerUserId}`,
    email: input.email ?? undefined,
    emailVerified: input.emailVerified,
    firstName,
    lastName,
    fullName,
    customerOnboardedAt: undefined,
    businessOnboardedAt: undefined,
    activeMode: 'customer',
    avatarUrl: input.avatarUrl,
    userType: 'free',
    subscriptionPlan: 'starter',
    subscriptionStatus: 'inactive',
    subscriptionProductId: undefined,
    subscriptionUpdatedAt: input.now,
    isActive: true,
    createdAt: input.now,
    updatedAt: input.now,
  });

  await upsertIdentityRecord(ctx, input, userId);
  return userId;
}

function resolveAuthRedirectUrl(redirectTo: string): string {
  const isAppDeepLink = AUTH_REDIRECT_APP_PREFIXES.some((prefix) =>
    redirectTo.startsWith(prefix)
  );
  if (isAppDeepLink) {
    return redirectTo;
  }

  const siteUrl = process.env.CONVEX_SITE_URL ?? process.env.SITE_URL;
  if (!siteUrl) {
    throw new Error(
      'Missing auth site URL. Set CONVEX_SITE_URL (recommended) or SITE_URL.'
    );
  }

  const normalizedSiteUrl = siteUrl.trim();
  const normalizedSiteUrlNoSlash = normalizedSiteUrl.endsWith('://')
    ? normalizedSiteUrl
    : normalizedSiteUrl.replace(/\/+$/, '');

  if (redirectTo.startsWith('?') || redirectTo.startsWith('/')) {
    if (redirectTo.startsWith('?')) {
      return `${normalizedSiteUrlNoSlash}/${redirectTo}`;
    }
    return `${normalizedSiteUrlNoSlash}${redirectTo}`;
  }

  if (redirectTo.startsWith(normalizedSiteUrl)) {
    const charAfterBase = redirectTo[normalizedSiteUrl.length];
    if (!charAfterBase || charAfterBase === '/' || charAfterBase === '?') {
      return redirectTo;
    }
  }

  if (redirectTo.startsWith(normalizedSiteUrlNoSlash)) {
    const charAfterBase = redirectTo[normalizedSiteUrlNoSlash.length];
    if (!charAfterBase || charAfterBase === '/' || charAfterBase === '?') {
      return redirectTo;
    }
  }

  throw new Error(
    `Invalid redirectTo URL: ${redirectTo}. Must be relative, on CONVEX_SITE_URL/SITE_URL, or app deep link.`
  );
}

async function createOrUpdateUserHandler(ctx: any, args: any) {
  const authUserId = await getAuthUserId(ctx);
  if (!args?.provider) {
    if (!authUserId) {
      throw new Error('NOT_AUTHENTICATED');
    }
    const existingUser = await ctx.db.get(authUserId);
    if (existingUser) {
      return existingUser._id;
    }
    throw new Error('AUTH_USER_NOT_FOUND');
  }

  const provider = normalizeProviderId(args.provider?.id ?? args.provider);
  if (!provider) {
    throw new Error(
      `UNSUPPORTED_AUTH_PROVIDER:${String(args.provider?.id ?? args.provider)}`
    );
  }

  const profile = (args.profile ?? {}) as Record<string, unknown>;
  const providerUserId = resolveProviderUserId(provider, profile);
  if (!providerUserId) {
    throw new Error('MISSING_PROVIDER_USER_ID');
  }

  const email = normalizeEmail(profile.email);
  const emailVerified = resolveEmailVerified(profile);
  const nameData = resolveNameData(profile);
  const avatarUrl = resolveAvatarUrl(profile);
  const normalizedIdentityInput: NormalizedIdentityInput = {
    provider,
    providerUserId,
    email,
    emailVerified,
    firstName: nameData.firstName,
    lastName: nameData.lastName,
    fullName: nameData.fullName,
    avatarUrl,
    now: Date.now(),
  };

  if (args.existingUserId) {
    const existingUser = await ctx.db.get(args.existingUserId);
    if (existingUser) {
      await upsertIdentityRecord(
        ctx,
        normalizedIdentityInput,
        existingUser._id
      );
      await ctx.db.patch(
        existingUser._id,
        buildUserMetadataPatch(existingUser, normalizedIdentityInput)
      );
      return existingUser._id;
    }
  }

  return await linkIdentityToUser(ctx, normalizedIdentityInput);
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Email({
      maxAge: EMAIL_OTP_MAX_AGE_SECONDS,
      normalizeIdentifier(identifier: string) {
        return normalizeEmailIdentifier(identifier);
      },
      async generateVerificationToken() {
        return generateEmailOtpToken();
      },
      async sendVerificationRequest({ identifier, token }) {
        await sendEmailVerificationOtp(
          normalizeEmailIdentifier(identifier),
          token
        );
      },
    }),
    Password,
    Google({
      allowDangerousEmailAccountLinking: false,
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
          given_name:
            typeof profile.given_name === 'string'
              ? profile.given_name
              : undefined,
          family_name:
            typeof profile.family_name === 'string'
              ? profile.family_name
              : undefined,
          firstName:
            typeof profile.given_name === 'string'
              ? profile.given_name
              : undefined,
          lastName:
            typeof profile.family_name === 'string'
              ? profile.family_name
              : undefined,
          name: typeof profile.name === 'string' ? profile.name : undefined,
          image:
            typeof profile.picture === 'string' ? profile.picture : undefined,
          emailVerified: profile.email_verified === true,
          email_verified: profile.email_verified === true,
        };
      },
    }),
    Apple({
      allowDangerousEmailAccountLinking: false,
      profile(rawProfile) {
        const profile = rawProfile as Record<string, unknown>;
        const subject =
          typeof profile.sub === 'string' ? profile.sub : undefined;

        if (!subject) {
          throw new Error('Apple profile is missing subject');
        }

        const userRecord =
          typeof profile.user === 'object' && profile.user !== null
            ? (profile.user as Record<string, unknown>)
            : null;
        const rawName =
          userRecord && typeof userRecord.name === 'object' && userRecord.name
            ? (userRecord.name as Record<string, unknown>)
            : null;
        const firstName =
          typeof rawName?.firstName === 'string'
            ? rawName.firstName
            : typeof rawName?.first_name === 'string'
              ? rawName.first_name
              : undefined;
        const lastName =
          typeof rawName?.lastName === 'string'
            ? rawName.lastName
            : typeof rawName?.last_name === 'string'
              ? rawName.last_name
              : undefined;
        const fullName =
          firstName || lastName
            ? joinNameParts(firstName, lastName)
            : typeof profile.name === 'string'
              ? profile.name
              : undefined;

        return {
          id: subject,
          subject,
          email: typeof profile.email === 'string' ? profile.email : undefined,
          firstName,
          lastName,
          name: fullName,
          image: null,
          emailVerified:
            profile.email_verified === true ||
            profile.email_verified === 'true',
          email_verified:
            profile.email_verified === true ||
            profile.email_verified === 'true',
          isPrivateEmail:
            profile.is_private_email === true ||
            profile.is_private_email === 'true',
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
    provider: v.optional(v.any()),
    existingUserId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    return await createOrUpdateUserHandler(ctx, args);
  },
});
