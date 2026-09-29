import type { Id } from '../../../_generated/dataModel';
import type { VerifiedBillingEvent } from '../canonicalEvent';
import type {
  BillingPeriod,
  BusinessPlan,
  BusinessSubscriptionStatus,
} from '../productionContract';
import { getDirectProviderRenewalGraceEnd } from '../productionContract';
import { addSumitBillingPeriod, sumitAmountsMatch } from './checkout';
import { sumitCancellationEventId, sumitPaymentEventId } from './verify';

export type SumitMapResult =
  | { ok: true; event: VerifiedBillingEvent }
  | { ok: false; code: string };

function activationKind(args: {
  priorSuccessfulPaymentCount: number;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  currentPlan: BusinessPlan | null;
  currentPeriod: BillingPeriod | null;
  currentStatus: string | null;
}): 'initial_payment' | 'renewal' | 'plan_change' | 'recovery' {
  if (args.priorSuccessfulPaymentCount === 0) {
    return 'initial_payment';
  }
  if (
    args.currentPlan === args.plan &&
    args.currentPeriod === args.billingPeriod
  ) {
    return args.currentStatus === 'past_due' ? 'recovery' : 'renewal';
  }
  return 'plan_change';
}

export function mapVerifiedSumitPaymentEvidence(args: {
  businessId: Id<'businesses'>;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  expectedAmount: number;
  paymentId: string;
  validPayment: boolean;
  amount: number;
  currency: string;
  occurredAt: number;
  recurringId: string | null;
  providerProductId: string;
  priorSuccessfulPaymentCount: number;
  currentProvider: string | null;
  currentPlan: BusinessPlan | null;
  currentPeriod: BillingPeriod | null;
  currentStatus: string | null;
  currentRecurringId: string | null;
  existingPeriodStartAt: number | null;
  existingPeriodEndAt: number | null;
  now: number;
}): SumitMapResult {
  if (args.currency !== 'ILS') {
    return { ok: false, code: 'SUMIT_CURRENCY_MISMATCH' };
  }
  if (!sumitAmountsMatch(args.amount, args.expectedAmount)) {
    return { ok: false, code: 'SUMIT_AMOUNT_MISMATCH' };
  }

  const base = {
    provider: 'sumit' as const,
    externalEventId: sumitPaymentEventId(args.paymentId, args.validPayment),
    businessId: args.businessId,
    occurredAt: args.occurredAt,
    appliedAt: args.now,
    plan: args.plan,
    billingPeriod: args.billingPeriod,
    providerProductId: args.providerProductId,
    providerSubscriptionId: args.recurringId ?? args.paymentId,
  };

  if (!args.validPayment) {
    if (args.priorSuccessfulPaymentCount === 0) {
      return { ok: false, code: 'SUMIT_INITIAL_FAILURE_IGNORED' };
    }
    if (
      args.currentProvider !== 'sumit' ||
      !args.recurringId ||
      args.currentRecurringId !== args.recurringId ||
      args.currentPlan !== args.plan ||
      args.currentPeriod !== args.billingPeriod
    ) {
      return { ok: false, code: 'SUMIT_UNRELATED_FAILURE_IGNORED' };
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
        graceAction: {
          kind: 'set',
          value: getDirectProviderRenewalGraceEnd({
            occurredAt: args.occurredAt,
            currentPeriodEndAt: args.existingPeriodEndAt,
          }),
        },
      },
    };
  }
  if (!args.recurringId) {
    return { ok: false, code: 'SUMIT_RECURRING_ID_MISSING' };
  }

  const eventKind = activationKind(args);
  const extendExisting =
    (eventKind === 'renewal' || eventKind === 'recovery') &&
    args.existingPeriodEndAt !== null;
  const periodStartAt = extendExisting
    ? (args.existingPeriodEndAt as number)
    : args.occurredAt;
  return {
    ok: true,
    event: {
      ...base,
      eventKind,
      status: 'active' satisfies BusinessSubscriptionStatus,
      periodStartAt,
      periodEndAt: addSumitBillingPeriod(periodStartAt, args.billingPeriod),
      recordsPaidServicePeriod:
        eventKind === 'initial_payment' ||
        eventKind === 'renewal' ||
        eventKind === 'recovery',
      revokesReferral: false,
      canceledAtAction: { kind: 'clear' },
      revokeAction: { kind: 'clear' },
      graceAction: { kind: 'clear' },
    },
  };
}

export function mapSumitCancellation(args: {
  businessId: Id<'businesses'>;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  recurringId: string;
  providerProductId: string;
  periodStartAt: number;
  periodEndAt: number;
  now: number;
}): VerifiedBillingEvent {
  return {
    provider: 'sumit',
    externalEventId: sumitCancellationEventId(args.recurringId),
    businessId: args.businessId,
    occurredAt: args.now,
    appliedAt: args.now,
    eventKind: 'cancellation',
    plan: args.plan,
    billingPeriod: args.billingPeriod,
    status: 'canceled',
    periodStartAt: args.periodStartAt,
    periodEndAt: args.periodEndAt,
    providerProductId: args.providerProductId,
    providerSubscriptionId: args.recurringId,
    recordsPaidServicePeriod: false,
    revokesReferral: false,
    canceledAtAction: { kind: 'set', value: args.now },
    revokeAction: { kind: 'clear' },
    graceAction: { kind: 'clear' },
  };
}

export function mapVerifiedSumitRefund(args: {
  externalEventId: string;
  businessId: Id<'businesses'>;
  plan: BusinessPlan;
  billingPeriod: BillingPeriod;
  recurringId: string;
  providerProductId: string;
  periodStartAt: number;
  occurredAt: number;
  now: number;
}): VerifiedBillingEvent {
  return {
    provider: 'sumit',
    externalEventId: args.externalEventId,
    businessId: args.businessId,
    occurredAt: args.occurredAt,
    appliedAt: args.now,
    eventKind: 'refund',
    plan: args.plan,
    billingPeriod: args.billingPeriod,
    status: 'inactive',
    periodStartAt: args.periodStartAt,
    periodEndAt: args.occurredAt,
    providerProductId: args.providerProductId,
    providerSubscriptionId: args.recurringId,
    recordsPaidServicePeriod: false,
    revokesReferral: true,
    canceledAtAction: { kind: 'preserve' },
    revokeAction: { kind: 'set', value: args.now, reason: 'refund' },
    graceAction: { kind: 'clear' },
  };
}
