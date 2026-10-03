import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  requireActorHasBusinessCapability,
  requireCurrentUser,
} from './guards';
import {
  ensureBusinessBillingAccount,
  getBillingAccountForBusiness,
} from './lib/billing/accounts';
import {
  hasOperationalAccessFromStatus,
  resolveCanonicalBillingState,
} from './lib/billing/lifecycle';

export const getBusinessBillingIdentity = query({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'manage_subscription'
    );
    const business = await ctx.db.get(businessId);
    if (!business) {
      return null;
    }
    const account = await getBillingAccountForBusiness(ctx, businessId);
    const canonical = account
      ? resolveCanonicalBillingState({
          plan: account.plan ?? account.lastPlan,
          lastPlan: account.lastPlan,
          status: account.status,
          billingPeriod: account.billingPeriod,
          subscriptionStartAt: account.subscriptionStartAt,
          currentPeriodStartAt: account.currentPeriodStartAt,
          currentPeriodEndAt: account.currentPeriodEndAt,
          gracePeriodEndAt: account.gracePeriodEndAt,
          canceledAt: account.canceledAt,
          trialStartedAt: account.trialStartedAt,
          trialEndAt: account.trialEndAt,
          hasProviderEvidence: account.hasProviderEvidence === true,
          entitlementRevokedAt: account.entitlementRevokedAt,
        })
      : null;
    const hasCurrentOperationalAccess = canonical?.operationalAccess === true;
    const hasCurrentPaidAccess =
      hasCurrentOperationalAccess && account?.hasProviderEvidence === true;
    return {
      businessId,
      providerAppUserId: account?.providerAppUserId ?? null,
      hasProviderEvidence: account?.hasProviderEvidence === true,
      hasCurrentPaidAccess:
        hasCurrentPaidAccess && account?.hasProviderEvidence === true,
      status: account?.status ?? business.subscriptionStatus ?? 'inactive',
      plan: account?.plan ?? business.subscriptionPlan ?? 'starter',
      billingPeriod: account?.billingPeriod ?? business.billingPeriod ?? null,
      currentPeriodEndAt:
        account?.currentPeriodEndAt ?? business.subscriptionEndAt ?? null,
      gracePeriodEndAt: account?.gracePeriodEndAt ?? null,
      trialStartedAt: account?.trialStartedAt ?? null,
      trialEndAt: account?.trialEndAt ?? null,
      isTrialing:
        canonical?.status === 'trialing' && canonical.operationalAccess === true,
      canceledAt: account?.canceledAt ?? null,
    };
  },
});

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Provider-neutral, customer-safe billing read model for Business Web.
 * Raw provider identifiers, payloads, credentials, and event blobs never leave
 * Convex through this query.
 */
export const getBusinessBillingOverview = query({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'manage_subscription'
    );
    const business = await ctx.db.get(businessId);
    if (!business) {
      return null;
    }
    const account = await getBillingAccountForBusiness(ctx, businessId);
    const hasCurrentPaidAccess = account
      ? hasOperationalAccessFromStatus({
          status: account.status ?? 'inactive',
          hasProviderEvidence: account.hasProviderEvidence === true,
          currentPeriodEndAt: account.currentPeriodEndAt ?? null,
          gracePeriodEndAt: account.gracePeriodEndAt ?? null,
          trialEndAt: account.trialEndAt ?? null,
          entitlementRevokedAt: account.entitlementRevokedAt ?? null,
        })
      : false;
    const sumitEvents = await ctx.db
      .query('sumitProviderEvents')
      .withIndex('by_businessId', (q) => q.eq('businessId', businessId))
      .collect();
    const documents = sumitEvents
      .filter(
        (event) =>
          event.status === 'processed' &&
          event.eventType === 'payment_succeeded' &&
          (event.documentNumber || event.documentType || event.documentUrl)
      )
      .map((event) => ({
        documentNumber: event.documentNumber ?? null,
        documentType: event.documentType ?? null,
        documentUrl: safeHttpsUrl(event.documentUrl),
        issuedAt:
          event.providerEventAt ?? event.processedAt ?? event.receivedAt,
      }))
      .sort((left, right) => right.issuedAt - left.issuedAt);

    return {
      businessId,
      plan: canonical?.plan ?? account?.plan ?? business.subscriptionPlan ?? null,
      status: canonical?.status ?? business.subscriptionStatus ?? 'inactive',
      billingPeriod: canonical?.billingPeriod ?? business.billingPeriod ?? null,
      currentPeriodStartAt:
        account?.currentPeriodStartAt ?? business.subscriptionStartAt ?? null,
      currentPeriodEndAt:
        account?.currentPeriodEndAt ?? business.subscriptionEndAt ?? null,
      gracePeriodEndAt: account?.gracePeriodEndAt ?? null,
      canceledAt: account?.canceledAt ?? null,
      provider: account?.provider ?? null,
      hasProviderEvidence: account?.hasProviderEvidence === true,
      hasCurrentOperationalAccess,
      hasCurrentPaidAccess,
      canCancel:
        account?.provider === 'sumit' &&
        typeof account.providerSubscriptionIdentifier === 'string' &&
        account.providerSubscriptionIdentifier.length > 0 &&
        account.status !== 'canceled' &&
        account.status !== 'inactive',
      documents,
    };
  },
});

export const ensureMyBusinessBillingIdentity = mutation({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    const user = await requireCurrentUser(ctx);
    await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'manage_subscription'
    );
    const business = await ctx.db.get(businessId);
    if (!business) {
      throw new Error('BUSINESS_NOT_FOUND');
    }
    const account = await ensureBusinessBillingAccount(ctx, {
      businessId,
      ownerUserId: business.ownerUserId ?? user._id,
    });
    return {
      providerAppUserId: account.providerAppUserId,
    };
  },
});
