import { CANONICAL_TERMS_URL } from '../../../lib/legalContract';
import { WEB_LEGAL_VERSION } from '../../../lib/legalWebContract';
import type { Id } from '../../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../../_generated/server';

export async function findBusinessActivationAcceptance(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
  businessId: Id<'businesses'>
) {
  return await ctx.db
    .query('legalAcceptances')
    .withIndex('by_user_document_version_business', (q) =>
      q
        .eq('userId', userId)
        .eq('documentKind', 'business_terms')
        .eq('version', WEB_LEGAL_VERSION)
        .eq('businessId', businessId)
    )
    .first();
}

export async function recordBusinessActivationAcceptance(
  ctx: Pick<MutationCtx, 'db'>,
  userId: Id<'users'>,
  businessId: Id<'businesses'>,
  now = Date.now()
) {
  const existing = await findBusinessActivationAcceptance(
    ctx,
    userId,
    businessId
  );
  if (existing) return existing._id;
  return await ctx.db.insert('legalAcceptances', {
    userId,
    businessId,
    documentKind: 'business_terms',
    version: WEB_LEGAL_VERSION,
    canonicalUrl: CANONICAL_TERMS_URL,
    source: 'business_activation',
    acceptedAt: now,
    createdAt: now,
  });
}

export async function assertBusinessActivationAccepted(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
  businessId: Id<'businesses'>
) {
  if (!(await findBusinessActivationAcceptance(ctx, userId, businessId))) {
    throw new Error('SUMIT_BUSINESS_TERMS_REQUIRED');
  }
}
