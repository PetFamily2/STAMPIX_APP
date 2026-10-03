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
import { resolveCanonicalBillingState } from './lib/billing/lifecycle';

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
    const canonicalState = resolveCanonicalBillingState({
      plan: account?.plan ?? business.subscriptionPlan,
      lastPlan: account?.lastPlan,
      status: account?.status ?? business.subscriptionStatus,
      billingPeriod: account?.billingPeriod ?? business.billingPeriod,
      subscriptionStartAt:
        account?.subscriptionStartAt ?? business.subscriptionStartAt,
      currentPeriodStartAt: account?.currentPeriodStartAt ?? null,
      currentPeriodEndAt:
        account?.currentPeriodEndAt ?? business.subscriptionEndAt,
      gracePeriodEndAt: account?.gracePeriodEndAt ?? null,
      canceledAt: account?.canceledAt ?? null,
      hasProviderEvidence: account?.hasProviderEvidence === true,
      entitlementRevokedAt: account?.entitlementRevokedAt ?? null,
      trialSource: account?.trialSource,
      trialEndsAt: account?.trialEndsAt ?? null,
    });
    const hasOperationalAccess = canonicalState.operationalAccess;
    const hasCurrentPaidAccess =
      account?.hasProviderEvidence === true && hasOperationalAccess;
    const isTrialing =
      canonicalState.status === 'trialing' &&
      canonicalState.trialSource === 'stampaix' &&
      account?.hasProviderEvidence !== true;
    return {
      businessId,
      providerAppUserId: account?.providerAppUserId ?? null,
      hasProviderEvidence: account?.hasProviderEvidence === true,
      hasCurrentPaidAccess,
      hasOperationalAccess,
      isTrialing,
      trialEndsAt: canonicalState.trialEndsAt,
      status: canonicalState.status,
      plan: account?.plan ?? business.subscriptionPlan ?? 'starter',
      billingPeriod: account?.billingPeriod ?? business.billingPeriod ?? null,
      currentPeriodEndAt:
        account?.currentPeriodEndAt ?? business.subscriptionEndAt ?? null,
      gracePeriodEndAt: account?.gracePeriodEndAt ?? null,
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
    const canonicalState = resolveCanonicalBillingState({
      plan: account?.plan ?? business.subscriptionPlan,
      lastPlan: account?.lastPlan,
      status: account?.status ?? business.subscriptionStatus,
      billingPeriod: account?.billingPeriod ?? business.billingPeriod,
      subscriptionStartAt:
        account?.subscriptionStartAt ?? business.subscriptionStartAt,
      currentPeriodStartAt: account?.currentPeriodStartAt ?? null,
      currentPeriodEndAt:
        account?.currentPeriodEndAt ?? business.subscriptionEndAt,
      gracePeriodEndAt: account?.gracePeriodEndAt ?? null,
      canceledAt: account?.canceledAt ?? null,
      hasProviderEvidence: account?.hasProviderEvidence === true,
      entitlementRevokedAt: account?.entitlementRevokedAt ?? null,
      trialSource: account?.trialSource,
      trialEndsAt: account?.trialEndsAt ?? null,
    });
    const hasOperationalAccess = canonicalState.operationalAccess;
    const hasCurrentPaidAccess =
      account?.hasProviderEvidence === true && hasOperationalAccess;
    const isTrialing =
      canonicalState.status === 'trialing' &&
      canonicalState.trialSource === 'stampaix' &&
      account?.hasProviderEvidence !== true;
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
      plan: account?.plan ?? business.subscriptionPlan ?? null,
      status: canonicalState.status,
      billingPeriod: account?.billingPeriod ?? business.billingPeriod ?? null,
      currentPeriodStartAt:
        account?.currentPeriodStartAt ?? business.subscriptionStartAt ?? null,
      currentPeriodEndAt:
        account?.currentPeriodEndAt ?? business.subscriptionEndAt ?? null,
      gracePeriodEndAt: account?.gracePeriodEndAt ?? null,
      canceledAt: account?.canceledAt ?? null,
      provider: account?.provider ?? null,
      hasProviderEvidence: account?.hasProviderEvidence === true,
      hasCurrentPaidAccess,
      hasOperationalAccess,
      isTrialing,
      trialEndsAt: canonicalState.trialEndsAt,
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
