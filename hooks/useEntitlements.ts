import { useQuery } from 'convex/react';
import { useMemo } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

type FeatureKey =
  | 'canManageTeam'
  | 'canSeeAdvancedReports'
  | 'canUseMarketingHubAI'
  | 'canUseSmartAnalytics'
  | 'canUseAdvancedSegmentation';

type LimitKey = 'maxCards' | 'maxCustomers' | 'maxAiCampaignsPerMonth';
type BusinessPlan = 'starter' | 'pro' | 'unlimited';

type GateResult = {
  isLocked: boolean;
  hasAccess: boolean;
  requiredPlan: BusinessPlan | null;
  reason: 'feature_locked' | 'subscription_inactive' | null;
};

type LimitStatus = {
  isUnlimited: boolean;
  limitValue: number | null;
  currentValue: number;
  remaining: number | null;
  isAtLimit: boolean;
};

export function useEntitlements(businessId: Id<'businesses'> | null) {
  const entitlements = useQuery(
    api.entitlements.getBusinessEntitlements,
    businessId ? { businessId } : 'skip'
  );
  const planCatalog = useQuery(api.entitlements.getPlanCatalog, {});

  const gate = useMemo(
    () =>
      (featureKey: FeatureKey): GateResult => {
        if (!entitlements) {
          return {
            isLocked: false,
            hasAccess: true,
            requiredPlan: null,
            reason: null,
          };
        }

        if (
          !entitlements.isSubscriptionActive &&
          entitlements.plan !== 'starter'
        ) {
          return {
            isLocked: true,
            hasAccess: false,
            requiredPlan: entitlements.plan,
            reason: 'subscription_inactive',
          };
        }

        const hasFeature = entitlements.features?.[featureKey] === true;
        const requiredPlan =
          entitlements.requiredPlanMap?.byFeature?.[featureKey] ?? null;

        return {
          isLocked: !hasFeature,
          hasAccess: hasFeature,
          requiredPlan,
          reason: hasFeature ? null : 'feature_locked',
        };
      },
    [entitlements]
  );

  const limitStatus = useMemo(
    () =>
      (limitKey: LimitKey, currentValue?: number): LimitStatus => {
        if (!entitlements) {
          return {
            isUnlimited: false,
            limitValue: null,
            currentValue: currentValue ?? 0,
            remaining: null,
            isAtLimit: false,
          };
        }

        const limitValue = entitlements.limits[limitKey];
        const normalizedCurrent =
          typeof currentValue === 'number' && Number.isFinite(currentValue)
            ? Math.max(0, Math.floor(currentValue))
            : limitKey === 'maxAiCampaignsPerMonth'
              ? entitlements.usage.aiCampaignsUsedThisMonth
              : 0;
        const isUnlimited = limitValue === -1;
        const remaining = isUnlimited
          ? null
          : Math.max(0, limitValue - normalizedCurrent);

        return {
          isUnlimited,
          limitValue: isUnlimited ? null : limitValue,
          currentValue: normalizedCurrent,
          remaining,
          isAtLimit: !isUnlimited && normalizedCurrent >= limitValue,
        };
      },
    [entitlements]
  );

  return {
    entitlements: entitlements ?? null,
    planCatalog: planCatalog ?? [],
    isLoading:
      (businessId ? entitlements === undefined : false) ||
      planCatalog === undefined,
    gate,
    limitStatus,
  };
}
