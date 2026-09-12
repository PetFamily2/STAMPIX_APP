import type { Id } from '../../_generated/dataModel';
import { createProviderAppUserId, isUsableProviderAppUserId } from './identity';

export async function getBillingAccountForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  return await ctx.db
    .query('businessBillingAccounts')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .first();
}

export async function getBillingAccountByProviderAppUserId(
  ctx: any,
  providerAppUserId: string
) {
  return await ctx.db
    .query('businessBillingAccounts')
    .withIndex('by_providerAppUserId', (q: any) =>
      q.eq('providerAppUserId', providerAppUserId)
    )
    .first();
}

export async function ensureBusinessBillingAccount(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    ownerUserId: Id<'users'>;
    preferredProviderAppUserId?: string | null;
    now?: number;
  }
) {
  const existing = await getBillingAccountForBusiness(ctx, args.businessId);
  if (existing) {
    return existing;
  }

  const now = args.now ?? Date.now();
  const providerAppUserId = isUsableProviderAppUserId(
    args.preferredProviderAppUserId
  )
    ? String(args.preferredProviderAppUserId)
    : createProviderAppUserId();

  const id = await ctx.db.insert('businessBillingAccounts', {
    businessId: args.businessId,
    ownerUserId: args.ownerUserId,
    providerAppUserId,
    plan: undefined,
    lastPlan: undefined,
    status: 'inactive',
    billingPeriod: null,
    hasProviderEvidence: false,
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.get(id);
}
