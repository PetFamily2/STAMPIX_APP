import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { normalizeEmailAddress } from './email';

type OAuthProvider = 'google' | 'apple';

/**
 * After a verified email OTP, return an OAuth user id only when the current
 * user is a disposable email shell and exactly one safe OAuth target exists.
 * Convex Auth 0.0.90 then reassigns the email auth account and session.
 * This module does not patch auth account rows. Ambiguous cases return null
 * so the caller keeps the email user. A safe link tombstones the shell row.
 */
export async function linkVerifiedEmailOtpToExistingOAuthUser(
  ctx: MutationCtx,
  input: {
    existingUserId: Id<'users'>;
    email: string;
    now: number;
  }
): Promise<Id<'users'> | null> {
  const email = normalizeEmailAddress(input.email);
  if (!email) {
    return null;
  }

  const existingUser = await ctx.db.get(input.existingUserId);
  if (!existingUser) {
    return null;
  }

  if (isEstablishedVerifiedEmailUser(existingUser, email)) {
    return null;
  }

  const disposable = await isDisposableEmailOtpShell(ctx, existingUser, email);
  if (!disposable) {
    return null;
  }

  const verifiedOthers = await findOtherVerifiedUsers(
    ctx,
    email,
    existingUser._id
  );
  if (verifiedOthers.length !== 1) {
    return null;
  }

  const target = verifiedOthers[0];
  if (!(await isSafeOAuthEmailTarget(ctx, target, email))) {
    return null;
  }

  const moved = await moveEmailIdentityOntoTarget(ctx, {
    email,
    temporaryUserId: existingUser._id,
    targetUserId: target._id,
    now: input.now,
  });
  if (!moved) {
    return null;
  }
  return target._id;
}

function isEstablishedVerifiedEmailUser(
  user: Doc<'users'>,
  email: string
): boolean {
  return (
    user.emailVerified === true && normalizeEmailAddress(user.email) === email
  );
}

/**
 * Matches the user document `linkIdentityToUser` inserts for an email OTP
 * send, plus the single email identity and email auth account that send
 * creates. A later profile edit, session, or domain row means the account
 * was used on its own and must not be tombstoned or merged.
 */
async function isDisposableEmailOtpShell(
  ctx: MutationCtx,
  user: Doc<'users'>,
  email: string
): Promise<boolean> {
  if (!matchesEmailOtpCreationContract(user, email)) {
    return false;
  }
  if (!(await hasOnlyEmailOtpIdentity(ctx, user._id, email))) {
    return false;
  }
  if (!(await hasOnlyEmailOtpAccount(ctx, user._id, email))) {
    return false;
  }
  if (await hasAuthSession(ctx, user._id)) {
    return false;
  }
  if (await hasIndependentAccountUse(ctx, user._id)) {
    return false;
  }
  return true;
}

function matchesEmailOtpCreationContract(
  user: Doc<'users'>,
  email: string
): boolean {
  if (normalizeEmailAddress(user.email) !== email) {
    return false;
  }
  if (user.emailVerified === true) {
    return false;
  }
  if (user.externalId !== `email:${email}`) {
    return false;
  }
  if (user.isActive !== true) {
    return false;
  }
  if (user.activeMode !== 'customer') {
    return false;
  }
  if (user.fullName !== 'User') {
    return false;
  }
  if (hasText(user.firstName) || hasText(user.lastName)) {
    return false;
  }
  if (
    hasText(user.phone) ||
    hasText(user.avatarUrl) ||
    user.customerOnboardedAt !== undefined ||
    user.businessOnboardedAt !== undefined ||
    user.activeBusinessId !== undefined ||
    user.subscriptionProductId !== undefined ||
    user.role !== undefined ||
    user.isAdmin !== undefined ||
    user.preferredMode !== undefined ||
    user.marketingOptIn !== undefined ||
    user.marketingOptInAt !== undefined ||
    user.needsNameCapture !== undefined ||
    user.postAuthOnboardingRequired !== undefined ||
    user.birthdayMonth !== undefined ||
    user.birthdayDay !== undefined ||
    user.anniversaryMonth !== undefined ||
    user.anniversaryDay !== undefined
  ) {
    return false;
  }
  if (user.userType !== 'free') {
    return false;
  }
  if (user.subscriptionPlan !== 'starter') {
    return false;
  }
  if (user.subscriptionStatus !== 'inactive') {
    return false;
  }
  return true;
}

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

async function hasOnlyEmailOtpIdentity(
  ctx: MutationCtx,
  userId: Id<'users'>,
  email: string
): Promise<boolean> {
  const identities = await ctx.db
    .query('userIdentities')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(2);
  if (identities.length !== 1) {
    return false;
  }
  const identity = identities[0];
  return (
    identity.provider === 'email' &&
    identity.providerUserId === email &&
    normalizeEmailAddress(identity.email) === email &&
    sameId(identity.userId, userId)
  );
}

async function hasOnlyEmailOtpAccount(
  ctx: MutationCtx,
  userId: Id<'users'>,
  email: string
): Promise<boolean> {
  const accounts = await ctx.db
    .query('authAccounts')
    .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
    .take(2);
  if (accounts.length !== 1) {
    return false;
  }
  const account = accounts[0];
  return (
    account.provider === 'email' &&
    normalizeEmailAddress(account.providerAccountId) === email &&
    account.secret === undefined &&
    account.emailVerified === undefined &&
    account.phoneVerified === undefined
  );
}

async function hasAuthSession(
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<boolean> {
  const session = await ctx.db
    .query('authSessions')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .first();
  return session !== null;
}

async function hasIndependentAccountUse(
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<boolean> {
  if (
    await ctx.db
      .query('memberships')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('businesses')
      .withIndex('by_ownerUserId', (q) => q.eq('ownerUserId', userId))
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('businessStaff')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('events')
      .withIndex('by_customerUserId', (q) => q.eq('customerUserId', userId))
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('events')
      .withIndex('by_actorUserId', (q) => q.eq('actorUserId', userId))
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('customerReferrals')
      .withIndex('by_referredUserId', (q) => q.eq('referredUserId', userId))
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('customerReferrals')
      .withIndex('by_referrerUserId_businessId_createdAt', (q) =>
        q.eq('referrerUserId', userId)
      )
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('customerReferralLinks')
      .withIndex('by_referrer_business_origin_status', (q) =>
        q.eq('referrerUserId', userId)
      )
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('businessReferrals')
      .withIndex('by_createdByUserId', (q) => q.eq('createdByUserId', userId))
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('businessReferralLinks')
      .withIndex('by_createdByUserId', (q) => q.eq('createdByUserId', userId))
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('referralRewards')
      .withIndex('by_recipientUserId_status_expiresAt', (q) =>
        q.eq('recipientUserId', userId)
      )
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('legalAcceptances')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('businessOnboardingDrafts')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('providerRevocationCredentials')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('pushTokens')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
  ) {
    return true;
  }
  if (
    await ctx.db
      .query('marketingConsentEvents')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
  ) {
    return true;
  }
  return false;
}

async function findOtherVerifiedUsers(
  ctx: MutationCtx,
  email: string,
  existingUserId: Id<'users'>
): Promise<Doc<'users'>[]> {
  const matches = await ctx.db
    .query('users')
    .withIndex('by_email', (q) => q.eq('email', email))
    .collect();

  return matches.filter(
    (user) =>
      !sameId(user._id, existingUserId) &&
      user.emailVerified === true &&
      normalizeEmailAddress(user.email) === email
  );
}

async function isSafeOAuthEmailTarget(
  ctx: MutationCtx,
  user: Doc<'users'>,
  email: string
): Promise<boolean> {
  if (user.emailVerified !== true) {
    return false;
  }
  if (normalizeEmailAddress(user.email) !== email) {
    return false;
  }
  if (user.isActive === false) {
    return false;
  }

  const identities = await ctx.db
    .query('userIdentities')
    .withIndex('by_userId', (q) => q.eq('userId', user._id))
    .collect();

  const oauthIdentities = identities.filter(
    (identity): identity is Doc<'userIdentities'> & {
      provider: OAuthProvider;
    } => identity.provider === 'google' || identity.provider === 'apple'
  );
  if (oauthIdentities.length === 0) {
    return false;
  }

  let hasConsistentIdentity = false;
  for (const identity of oauthIdentities) {
    const identityEmail = normalizeEmailAddress(identity.email);
    if (identityEmail === null) {
      continue;
    }
    if (identityEmail !== email) {
      return false;
    }
    hasConsistentIdentity = true;
  }
  if (!hasConsistentIdentity) {
    return false;
  }

  const hasEmailIdentity = identities.some(
    (identity) => identity.provider === 'email'
  );
  return !hasEmailIdentity;
}

async function moveEmailIdentityOntoTarget(
  ctx: MutationCtx,
  input: {
    email: string;
    temporaryUserId: Id<'users'>;
    targetUserId: Id<'users'>;
    now: number;
  }
): Promise<boolean> {
  if (sameId(input.temporaryUserId, input.targetUserId)) {
    return false;
  }

  const existingIdentity = await ctx.db
    .query('userIdentities')
    .withIndex('by_provider_providerUserId', (q) =>
      q.eq('provider', 'email').eq('providerUserId', input.email)
    )
    .unique();
  if (
    !existingIdentity ||
    !sameId(existingIdentity.userId, input.temporaryUserId) ||
    normalizeEmailAddress(existingIdentity.email) !== input.email
  ) {
    return false;
  }

  const target = await ctx.db.get(input.targetUserId);
  if (
    !target ||
    target.emailVerified !== true ||
    normalizeEmailAddress(target.email) !== input.email
  ) {
    return false;
  }

  const previousIdentity = {
    userId: existingIdentity.userId,
    email: existingIdentity.email,
    updatedAt: existingIdentity.updatedAt,
  };
  await ctx.db.patch(existingIdentity._id, {
    userId: input.targetUserId,
    email: input.email,
    updatedAt: input.now,
  });

  const leftoverIdentity = await ctx.db
    .query('userIdentities')
    .withIndex('by_userId', (q) => q.eq('userId', input.temporaryUserId))
    .first();
  if (leftoverIdentity) {
    await ctx.db.patch(existingIdentity._id, previousIdentity);
    return false;
  }

  // Keep the row. Undefined clears optional fields under Convex patch rules
  // so this id no longer matches users.by_email.
  await ctx.db.patch(input.temporaryUserId, {
    email: undefined,
    emailVerified: false,
    isActive: false,
    activeBusinessId: undefined,
    externalId: `merged-email-shell:${input.temporaryUserId}`,
    updatedAt: input.now,
  });
  return true;
}

function sameId(left: unknown, right: unknown): boolean {
  return String(left) === String(right);
}
