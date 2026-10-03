import { v } from 'convex/values';
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


function normalizeAdminSearchTerm(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}

async function readAdminBusinessSummary(ctx: any, business: any) {
  const account = await ctx.db
    .query('businessBillingAccounts')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', business._id))
    .first();
  const owner = await ctx.db.get(business.ownerUserId);
  return {
    businessId: business._id,
    name: business.name,
    externalId: business.externalId,
    businessPublicId: business.businessPublicId ?? null,
    joinCode: business.joinCode ?? null,
    ownerName: owner?.fullName ?? null,
    ownerEmail: owner?.email ?? null,
    plan: account?.plan ?? business.subscriptionPlan ?? null,
    status: account?.status ?? business.subscriptionStatus ?? 'inactive',
    provider: account?.provider ?? null,
    currentPeriodEndAt: account?.currentPeriodEndAt ?? null,
    gracePeriodEndAt: account?.gracePeriodEndAt ?? null,
    isActive: business.isActive === true,
    closedAt: business.closedAt ?? null,
    createdAt: business.createdAt ?? business._creationTime,
  };
}

export const searchBusinesses = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    await requireSystemAdmin(ctx);
    const normalized = normalizeAdminSearchTerm(term);
    if (normalized.length < 2) {
      return [];
    }
    const lower = normalized.toLocaleLowerCase('he-IL');
    const matches = new Map<string, any>();

    async function add(business: any | null | undefined) {
      if (!business) return;
      matches.set(String(business._id), business);
    }

    await add(
      await ctx.db
        .query('businesses')
        .withIndex('by_externalId', (q: any) => q.eq('externalId', normalized))
        .first()
    );
    await add(
      await ctx.db
        .query('businesses')
        .withIndex('by_businessPublicId', (q: any) =>
          q.eq('businessPublicId', normalized)
        )
        .first()
    );
    await add(
      await ctx.db
        .query('businesses')
        .withIndex('by_joinCode', (q: any) => q.eq('joinCode', normalized))
        .first()
    );

    if (normalized.includes('@')) {
      const owner = await ctx.db
        .query('users')
        .withIndex('by_email', (q: any) => q.eq('email', lower))
        .first();
      if (owner) {
        const owned = await ctx.db
          .query('businesses')
          .withIndex('by_ownerUserId', (q: any) =>
            q.eq('ownerUserId', owner._id)
          )
          .collect();
        for (const business of owned) {
          await add(business);
        }
      }
    }

    const recent = await ctx.db.query('businesses').order('desc').take(200);
    for (const business of recent) {
      const haystack = [
        business.name,
        business.externalId,
        business.businessPublicId,
        business.joinCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('he-IL');
      if (haystack.includes(lower)) {
        await add(business);
      }
      if (matches.size >= 20) {
        break;
      }
    }

    const summaries = [];
    for (const business of [...matches.values()].slice(0, 20)) {
      summaries.push(await readAdminBusinessSummary(ctx, business));
    }
    return summaries;
  },
});

export const getBusinessDetail = query({
  args: { businessId: v.id('businesses') },
  handler: async (ctx, { businessId }) => {
    await requireSystemAdmin(ctx);
    const business = await ctx.db.get(businessId);
    if (!business) {
      return null;
    }

    const [owner, account, usage, intents, staff] = await Promise.all([
      ctx.db.get(business.ownerUserId),
      ctx.db
        .query('businessBillingAccounts')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .first(),
      ctx.db
        .query('businessUsageCounters')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .first(),
      ctx.db
        .query('sumitCheckoutIntents')
        .withIndex('by_businessId_createdAt', (q: any) =>
          q.eq('businessId', businessId)
        )
        .order('desc')
        .take(20),
      ctx.db
        .query('businessStaff')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .collect(),
    ]);

    const providerEvents = await ctx.db
      .query('sumitProviderEvents')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .collect();

    return {
      business: {
        businessId: business._id,
        name: business.name,
        externalId: business.externalId,
        businessPublicId: business.businessPublicId ?? null,
        joinCode: business.joinCode ?? null,
        formattedAddress: business.formattedAddress ?? null,
        isActive: business.isActive === true,
        closedAt: business.closedAt ?? null,
        createdAt: business.createdAt ?? business._creationTime,
        updatedAt: business.updatedAt,
      },
      owner: owner
        ? {
            userId: owner._id,
            fullName: owner.fullName ?? null,
            email: owner.email ?? null,
            phone: owner.phone ?? null,
            isActive: owner.isActive,
          }
        : null,
      billing: account
        ? {
            plan: account.plan ?? account.lastPlan ?? null,
            status: account.status ?? null,
            billingPeriod: account.billingPeriod ?? null,
            provider: account.provider ?? null,
            providerProductId: account.providerProductId ?? null,
            providerSubscriptionIdentifier:
              account.providerSubscriptionIdentifier ?? null,
            currentPeriodStartAt: account.currentPeriodStartAt ?? null,
            currentPeriodEndAt: account.currentPeriodEndAt ?? null,
            gracePeriodEndAt: account.gracePeriodEndAt ?? null,
            canceledAt: account.canceledAt ?? null,
            entitlementRevokedAt: account.entitlementRevokedAt ?? null,
            hasProviderEvidence: account.hasProviderEvidence === true,
            lastReconciledAt: account.lastReconciledAt ?? null,
            lastReconciliationOk: account.lastReconciliationOk ?? null,
            lastReconciliationCode: account.lastReconciliationCode ?? null,
            updatedAt: account.updatedAt,
          }
        : null,
      usage: usage
        ? {
            nonArchivedCards: usage.nonArchivedCards,
            activeUniqueCustomers: usage.activeUniqueCustomers,
            teamSeats: usage.teamSeats,
            activeCampaigns: usage.activeCampaigns,
            activeRetentionActions: usage.activeRetentionActions,
            aiExecutionsThisMonth: usage.aiExecutionsThisMonth,
            updatedAt: usage.updatedAt,
          }
        : null,
      team: {
        total: staff.length,
        active: staff.filter((row: any) => row.status === 'active').length,
        managers: staff.filter(
          (row: any) => row.status === 'active' && row.staffRole === 'manager'
        ).length,
        staff: staff.filter(
          (row: any) => row.status === 'active' && row.staffRole === 'staff'
        ).length,
      },
      checkoutIntents: intents.map((intent: any) => ({
        checkoutId: intent.checkoutId,
        plan: intent.plan,
        billingPeriod: intent.billingPeriod,
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        createdAt: intent.createdAt,
        expiresAt: intent.expiresAt,
      })),
      providerEvents: providerEvents
        .sort(
          (left: any, right: any) =>
            (right.providerEventAt ?? right.receivedAt) -
            (left.providerEventAt ?? left.receivedAt)
        )
        .slice(0, 20)
        .map((event: any) => ({
          externalEventId: event.externalEventId,
          eventType: event.eventType,
          status: event.status,
          ignoredReason: event.ignoredReason ?? null,
          amount: event.amount ?? null,
          currency: event.currency ?? null,
          providerProductId: event.providerProductId ?? null,
          documentNumber: event.documentNumber ?? null,
          providerEventAt: event.providerEventAt ?? null,
          receivedAt: event.receivedAt,
        })),
    };
  },
});
