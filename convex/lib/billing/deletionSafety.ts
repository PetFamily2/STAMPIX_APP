import type { Id } from '../../_generated/dataModel';
import type { QueryCtx } from '../../_generated/server';
import type { BillingPeriod, BusinessPlan } from './productionContract';

// A destructive action needs recent provider evidence, not operational entitlement.
export const DELETION_BILLING_EVIDENCE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const REVIEW_LIMIT = 100;

export async function readDeletionBillingSafety(
  ctx: QueryCtx,
  businessId: Id<'businesses'>,
  legacy: {
    provider: string | null;
    status: string | null;
    plan: BusinessPlan | null;
    period: BillingPeriod | null;
    endAt: number | null;
    renewalActive: boolean;
  },
  now = Date.now()
) {
  const accounts = await ctx.db
    .query('businessBillingAccounts')
    .withIndex('by_businessId', (q) => q.eq('businessId', businessId))
    .take(2);
  const account = accounts.length === 1 ? accounts[0] : null;
  const base = {
    deletionSafetyVersion: 1,
    provider: account?.provider ?? legacy.provider,
    status: account?.status ?? legacy.status,
    plan: account?.plan ?? legacy.plan,
    period: account?.billingPeriod ?? legacy.period,
    endAt: account?.currentPeriodEndAt ?? legacy.endAt,
    renewalActive:
      legacy.renewalActive ||
      ['active', 'trialing', 'past_due'].includes(account?.status ?? ''),
  };
  const block = (
    deletionBlockReason:
      | 'renewal_active'
      | 'billing_unverified'
      | 'payment_pending'
  ) => ({
    ...base,
    deletionEligible: false,
    deletionBlockReason,
  });
  if (base.renewalActive) {
    return block('renewal_active');
  }
  if (accounts.length > 1) {
    return block('billing_unverified');
  }

  for (const table of [
    'sumitCheckoutIntents',
    'payplusCheckoutIntents',
  ] as const) {
    const intents = await ctx.db
      .query(table)
      .withIndex('by_businessId_createdAt', (q) =>
        q.eq('businessId', businessId)
      )
      .order('desc')
      .take(REVIEW_LIMIT + 1);
    // Expiry of a local checkout is not proof that a provider took no money.
    if (
      intents.length > REVIEW_LIMIT ||
      intents.some((intent) => intent.status !== 'verified')
    ) {
      return block('payment_pending');
    }
    if (
      intents.some(
        (intent) =>
          !account ||
          account.hasProviderEvidence !== true ||
          (table === 'sumitCheckoutIntents' &&
            (!('sumitRecurringId' in intent) ||
              !intent.sumitRecurringId ||
              intent.sumitRecurringId !==
                account.providerSubscriptionIdentifier)) ||
          (intent.createdAt > (account.canceledAt ?? 0) &&
            account.status === 'canceled')
      )
    ) {
      return block('billing_unverified');
    }
  }
  if (!account) {
    return legacy.provider &&
      ['canceled', 'inactive'].includes(legacy.status ?? '')
      ? { ...base, deletionEligible: true, deletionBlockReason: null }
      : block('billing_unverified');
  }
  if (account.lastReconciliationOk === false) {
    return block('billing_unverified');
  }
  if (
    account.status === 'inactive' &&
    account.hasProviderEvidence === false &&
    !account.provider &&
    !account.providerSubscriptionIdentifier &&
    !account.lastProviderEventId
  ) {
    return { ...base, deletionEligible: true, deletionBlockReason: null };
  }
  if (
    account.provider === 'revenuecat' &&
    legacy.provider === 'revenuecat' &&
    ['canceled', 'inactive'].includes(account.status ?? '') &&
    ['canceled', 'inactive'].includes(legacy.status ?? '')
  ) {
    return { ...base, deletionEligible: true, deletionBlockReason: null };
  }
  if (
    account.provider !== 'sumit' ||
    account.status !== 'canceled' ||
    account.hasProviderEvidence !== true ||
    typeof account.canceledAt !== 'number' ||
    !account.providerSubscriptionIdentifier ||
    !account.lastProviderEventId
  ) {
    return block('billing_unverified');
  }
  const lastProviderEventId = account.lastProviderEventId;
  const events = await ctx.db
    .query('sumitProviderEvents')
    .withIndex('by_externalEventId', (q) =>
      q.eq('externalEventId', lastProviderEventId)
    )
    .take(2);
  const evidence = events.length === 1 ? events[0] : null;
  const verifiedAt = evidence?.providerEventAt;
  if (
    !evidence ||
    evidence.status !== 'processed' ||
    evidence.eventType !== 'recurring_canceled' ||
    String(evidence.businessId) !== String(businessId) ||
    evidence.sumitRecurringId !== account.providerSubscriptionIdentifier ||
    typeof verifiedAt !== 'number' ||
    verifiedAt < account.canceledAt ||
    verifiedAt !== account.lastProviderEventAt ||
    verifiedAt > now ||
    now - verifiedAt > DELETION_BILLING_EVIDENCE_MAX_AGE_MS
  ) {
    return block('billing_unverified');
  }
  return { ...base, deletionEligible: true, deletionBlockReason: null };
}
