import { useQuery } from 'convex/react';
import { useMemo } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

type FeatureKey =
  | 'team'
  | 'advancedReports'
  | 'marketingHub'
  | 'smartAnalytics'
  | 'segmentationBuilder'
  | 'savedSegments'
  | 'canManageTeam'
  | 'canSeeAdvancedReports'
  | 'canUseMarketingHubAI'
  | 'canUseSmartAnalytics'
  | 'canUseAdvancedSegmentation';

type LimitKey =
  | 'maxCards'
  | 'maxCustomers'
  | 'maxActiveRetentionActions'
  | 'maxCampaigns'
  | 'maxAiExecutionsPerMonth'
  | 'maxTeamSeats';
type BusinessPlan = 'starter' | 'pro' | 'premium';

type GateResult = {
  isLocked: boolean;
  hasAccess: boolean;
  requiredPlan: BusinessPlan | null;
  reason: 'feature_locked' | 'subscription_inactive' | null;
};

type LimitStatus = {
  limitValue: number;
  currentValue: number;
  remaining: number;
  isAtLimit: boolean;
  isOverLimit: boolean;
  usageRatio: number;
  isNearLimit: boolean;
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

        const hasFeature = entitlements.features?.[featureKey] === true;
        const requiredPlan =
          entitlements.requiredPlanMap?.byFeature?.[featureKey] ?? null;
        if (
          !hasFeature &&
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
            limitValue: 0,
            currentValue: currentValue ?? 0,
            remaining: 0,
            isAtLimit: false,
            isOverLimit: false,
            usageRatio: 0,
            isNearLimit: false,
          };
        }

        const limitValue = entitlements.limits[limitKey];
        const normalizedCurrent =
          typeof currentValue === 'number' && Number.isFinite(currentValue)
            ? Math.max(0, Math.floor(currentValue))
            : limitKey === 'maxActiveRetentionActions'
              ? entitlements.usage.activeRetentionActions
              : limitKey === 'maxCampaigns'
                ? entitlements.usage.activeManagementCampaigns
                : limitKey === 'maxAiExecutionsPerMonth'
                  ? entitlements.usage.aiExecutionsThisMonth
                  : 0;
        const remaining = Math.max(0, limitValue - normalizedCurrent);
        const usageRatio = limitValue > 0 ? normalizedCurrent / limitValue : 1;

        return {
          limitValue,
          currentValue: normalizedCurrent,
          remaining,
          isAtLimit: normalizedCurrent >= limitValue,
          isOverLimit: normalizedCurrent > limitValue,
          usageRatio,
          isNearLimit: normalizedCurrent < limitValue && usageRatio >= 0.8,
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
