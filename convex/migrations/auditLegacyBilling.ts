import { internalQuery } from '../_generated/server';
import { resolveCanonicalBillingState } from '../lib/billing/lifecycle';

export const auditLegacyBillingReadOnly = internalQuery({
  args: {},
  handler: async (ctx) => {
    const businesses = await ctx.db.query('businesses').collect();
    const summary = {
      total: 0,
      providerEvidence: 0,
      inactiveUnpaid: 0,
      activeProviderBacked: 0,
      needsReview: 0,
    };
    const rows = [];
    for (const business of businesses) {
      summary.total += 1;
      const subscriptions = await ctx.db
        .query('subscriptions')
        .withIndex('by_businessId', (q) => q.eq('businessId', business._id))
        .collect();
      const hasProviderEvidence = subscriptions.some(
        (row) => row.provider === 'revenuecat'
      );
      const state = resolveCanonicalBillingState({
        plan: business.subscriptionPlan,
        status: business.subscriptionStatus,
        currentPeriodEndAt: business.subscriptionEndAt,
        hasProviderEvidence,
      });
      if (hasProviderEvidence) {
        summary.providerEvidence += 1;
      }
      if (state.operationalAccess) {
        summary.activeProviderBacked += 1;
      } else {
        summary.inactiveUnpaid += 1;
      }
      const targetAccessStatus = hasProviderEvidence
        ? state.operationalAccess
          ? 'active'
          : 'inactive'
        : 'inactive';
      rows.push({
        businessId: String(business._id),
        legacyPlan: business.subscriptionPlan ?? null,
        legacyStatus: business.subscriptionStatus ?? null,
        hasProviderEvidence,
        hasSubscriptionRow: subscriptions.length > 0,
        targetAccessStatus,
        targetPlan: state.lastPlan,
      });
    }
    return { summary, rows };
  },
});
