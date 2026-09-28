import {
  isBusinessPlan,
  REQUIRED_PLAN_BY_CANONICAL_FEATURE,
  type BusinessPlan,
} from '@/lib/billing/productionContract';

export type WebTeamGateReason = 'feature_locked' | 'subscription_inactive' | null;

const PLAN_LABEL: Record<BusinessPlan, string> = {
  starter: 'Starter',
  pro: 'Pro',
  premium: 'Premium',
};

/**
 * Team's minimum plan comes from the canonical feature contract.
 * `gate().requiredPlan` is that minimum only for `feature_locked`.
 * For `subscription_inactive` the gate returns the business's current plan,
 * which must not be presented as the minimum (a legacy Premium plan would
 * otherwise look like the Team requirement).
 */
export function resolveWebTeamLockedRequiredPlan(args: {
  featureRequiredPlan?: string | null;
  gateRequiredPlan?: string | null;
  gateReason?: WebTeamGateReason;
}): BusinessPlan {
  const canonical = REQUIRED_PLAN_BY_CANONICAL_FEATURE.team;
  const featurePlan = isBusinessPlan(args.featureRequiredPlan)
    ? args.featureRequiredPlan
    : null;

  if (featurePlan === canonical) {
    return featurePlan;
  }

  if (
    args.gateReason === 'feature_locked' &&
    args.gateRequiredPlan === canonical
  ) {
    return canonical;
  }

  return canonical;
}

export function buildWebTeamLockedCopy(requiredPlan: BusinessPlan) {
  const requiredPlanLabel = PLAN_LABEL[requiredPlan];
  return {
    title: 'ניהול צוות נעול במסלול הנוכחי',
    description: `ניהול צוות זמין במסלול ${requiredPlanLabel} ומעלה.`,
    detail: 'שדרוג המסלול יהיה זמין דרך StampAix Business.',
  };
}
