import type { Id } from '../../../_generated/dataModel';
import type { VerifiedBillingEvent } from '../canonicalEvent';
import type {
  BillingPeriod,
  BusinessPlan,
  BusinessSubscriptionStatus,
} from '../productionContract';
import { addContractBillingPeriod, payPlusAmountsMatch } from './checkout';
import { payPlusCancellationEventId, payPlusChargeEventId } from './verify';

export type PayPlusMapResult =
  | { ok: true; event: VerifiedBillingEvent }
  | { ok: false; code: string };

function providerProductId(plan: BusinessPlan, period: BillingPeriod): string {
  return `${plan}_${period}`;
}

function activationKind(args: {
  priorSuccessfulChargeCount: number;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  currentPlan: BusinessPlan | null;
  currentPeriod: BillingPeriod | null;
}): 'initial_payment' | 'renewal' | 'plan_change' {
  if (args.priorSuccessfulChargeCount === 0) {
    return 'initial_payment';
  }
  if (
    args.currentPlan === args.plan &&
    args.currentPeriod === args.billingPeriod
  ) {
    return 'renewal';
  }
  return 'plan_change';
}

export function mapVerifiedPayPlusEvidence(args: {
  businessId: Id<'businesses'>;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  expectedAmount: number;
  transactionUid: string;
  transactionType: string;
  statusCode: string;
  amount: number;
  currency: string;
  occurredAt: number;
  recurringUid: string | null;
  transactionIsCancelled: boolean;
  priorSuccessfulChargeCount: number;
  checkoutSuccessfulChargeCount?: number;
  currentPlan: BusinessPlan | null;
  currentPeriod: BillingPeriod | null;
  existingPeriodStartAt: number | null;
  existingPeriodEndAt: number | null;
  now: number;
}): PayPlusMapResult {
  if (args.currency.toUpperCase() !== 'ILS') {
    return { ok: false, code: 'PAYPLUS_CURRENCY_MISMATCH' };
  }
  const type = args.transactionType.trim().toLowerCase();
  const fullAmount = payPlusAmountsMatch(args.amount, args.expectedAmount);
  if (type === 'refund' && !fullAmount) {
    return { ok: false, code: 'PAYPLUS_PARTIAL_REFUND_UNMAPPED' };
  }
  if (!fullAmount) {
    return { ok: false, code: 'PAYPLUS_AMOUNT_MISMATCH' };
  }

  const subscriptionId = args.recurringUid ?? args.transactionUid;
  const base = {
    provider: 'payplus' as const,
    externalEventId: payPlusChargeEventId(args.transactionUid),
    businessId: args.businessId,
    occurredAt: args.occurredAt,
    appliedAt: args.now,
    plan: args.plan,
    billingPeriod: args.billingPeriod,
    providerProductId: providerProductId(args.plan, args.billingPeriod),
    providerSubscriptionId: subscriptionId,
  };

  const successfulReversal = args.transactionIsCancelled || type === 'refund';
  if (successfulReversal && args.statusCode === '000') {
    return {
      ok: true,
      event: {
        ...base,
        eventKind: 'refund',
        status: 'inactive',
        periodStartAt: args.existingPeriodStartAt ?? args.occurredAt,
        periodEndAt: args.occurredAt,
        recordsPaidServicePeriod: false,
        revokesReferral: true,
        canceledAtAction: { kind: 'preserve' },
        revokeAction: {
          kind: 'set',
          value: args.now,
          reason: type === 'refund' ? 'refund' : 'reversal',
        },
        graceAction: { kind: 'clear' },
      },
    };
  }

  if (type !== 'charge') {
    return { ok: false, code: 'PAYPLUS_UNMAPPED_TRANSACTION_TYPE' };
  }

  if (args.statusCode !== '000') {
    const checkoutSuccesses =
      args.checkoutSuccessfulChargeCount ?? args.priorSuccessfulChargeCount;
    if (checkoutSuccesses === 0) {
      return { ok: false, code: 'PAYPLUS_INITIAL_FAILURE_IGNORED' };
    }
    if (
      args.currentPlan !== args.plan ||
      args.currentPeriod !== args.billingPeriod
    ) {
      return { ok: false, code: 'PAYPLUS_UNRELATED_FAILURE_IGNORED' };
    }
    return {
      ok: true,
      event: {
        ...base,
        eventKind: 'billing_issue',
        status: 'past_due',
        periodStartAt: args.existingPeriodStartAt ?? args.occurredAt,
        periodEndAt: args.existingPeriodEndAt,
        recordsPaidServicePeriod: false,
        revokesReferral: false,
        canceledAtAction: { kind: 'preserve' },
        revokeAction: { kind: 'clear' },
        graceAction: { kind: 'set', value: args.existingPeriodEndAt },
      },
    };
  }

  const eventKind = activationKind(args);
  return {
    ok: true,
    event: {
      ...base,
      eventKind,
      status: 'active' satisfies BusinessSubscriptionStatus,
      periodStartAt: args.occurredAt,
      periodEndAt: addContractBillingPeriod(
        args.occurredAt,
        args.billingPeriod
      ),
      recordsPaidServicePeriod:
        eventKind === 'initial_payment' || eventKind === 'renewal',
      revokesReferral: false,
      canceledAtAction: { kind: 'clear' },
      revokeAction: { kind: 'clear' },
      graceAction: { kind: 'clear' },
    },
  };
}

export function mapPayPlusCancellation(args: {
  businessId: Id<'businesses'>;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  recurringUid: string;
  periodStartAt: number;
  periodEndAt: number | null;
  now: number;
}): VerifiedBillingEvent {
  return {
    provider: 'payplus',
    externalEventId: payPlusCancellationEventId(args.recurringUid),
    businessId: args.businessId,
    occurredAt: args.now,
    appliedAt: args.now,
    eventKind: 'cancellation',
    plan: args.plan,
    billingPeriod: args.billingPeriod,
    status: 'canceled',
    periodStartAt: args.periodStartAt,
    periodEndAt: args.periodEndAt,
    providerProductId: providerProductId(args.plan, args.billingPeriod),
    providerSubscriptionId: args.recurringUid,
    recordsPaidServicePeriod: false,
    revokesReferral: false,
    canceledAtAction: { kind: 'set', value: args.now },
    revokeAction: { kind: 'clear' },
    graceAction: { kind: 'clear' },
  };
}
