import { query } from './_generated/server';
import { requireCurrentUser } from './guards';

const LIST_LIMIT = 12;

async function requireSystemAdmin(ctx: any) {
  const user = await requireCurrentUser(ctx);
  if (user.isAdmin !== true) {
    throw new Error('ADMIN_REQUIRED');
  }
  return user;
}

export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireSystemAdmin(ctx);

    const [businesses, billingAccounts, newSupport, newDeletions, reviewDeletions] =
      await Promise.all([
        ctx.db.query('businesses').order('desc').take(LIST_LIMIT),
        ctx.db.query('businessBillingAccounts').order('desc').take(LIST_LIMIT),
        ctx.db
          .query('supportRequests')
          .withIndex('by_status', (q: any) => q.eq('status', 'new'))
          .order('desc')
          .take(LIST_LIMIT + 1),
        ctx.db
          .query('accountDeletionRequests')
          .withIndex('by_status_createdAt', (q: any) => q.eq('status', 'new'))
          .order('desc')
          .take(LIST_LIMIT + 1),
        ctx.db
          .query('accountDeletionRequests')
          .withIndex('by_status_createdAt', (q: any) => q.eq('status', 'in_review'))
          .order('desc')
          .take(LIST_LIMIT + 1),
      ]);

    const businessNames = new Map(
      businesses.map((business: any) => [String(business._id), business.name])
    );

    for (const account of billingAccounts) {
      const key = String(account.businessId);
      if (!businessNames.has(key)) {
        const business = await ctx.db.get(account.businessId);
        if (business) {
          businessNames.set(key, business.name);
        }
      }
    }

    return {
      viewer: {
        userId: admin._id,
        email: admin.email ?? null,
        fullName: admin.fullName ?? null,
      },
      queues: {
        support: {
          visibleCount: Math.min(newSupport.length, LIST_LIMIT),
          hasMore: newSupport.length > LIST_LIMIT,
        },
        accountDeletion: {
          visibleCount: Math.min(
            newDeletions.length + reviewDeletions.length,
            LIST_LIMIT * 2
          ),
          hasMore:
            newDeletions.length > LIST_LIMIT ||
            reviewDeletions.length > LIST_LIMIT,
        },
      },
      recentBusinesses: businesses.map((business: any) => ({
        businessId: business._id,
        name: business.name,
        plan: business.subscriptionPlan ?? null,
        status: business.subscriptionStatus ?? null,
        createdAt: business._creationTime,
        closedAt: business.closedAt ?? null,
      })),
      recentBillingAccounts: billingAccounts.map((account: any) => ({
        businessId: account.businessId,
        businessName:
          businessNames.get(String(account.businessId)) ?? 'עסק לא זמין',
        plan: account.plan ?? account.lastPlan ?? null,
        status: account.status ?? null,
        billingPeriod: account.billingPeriod ?? null,
        provider: account.provider ?? null,
        currentPeriodEndAt: account.currentPeriodEndAt ?? null,
        gracePeriodEndAt: account.gracePeriodEndAt ?? null,
        hasProviderEvidence: account.hasProviderEvidence,
        updatedAt: account.updatedAt,
      })),
      recentSupport: newSupport.slice(0, LIST_LIMIT).map((request: any) => ({
        requestId: request._id,
        name: request.name,
        email: request.email ?? null,
        createdAt: request.createdAt,
      })),
      recentDeletionRequests: [...newDeletions, ...reviewDeletions]
        .sort((a: any, b: any) => b.createdAt - a.createdAt)
        .slice(0, LIST_LIMIT)
        .map((request: any) => ({
          requestId: request._id,
          email: request.email,
          status: request.status,
          requestReference: request.requestReference,
          createdAt: request.createdAt,
        })),
    };
  },
});
