import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { BackButton } from '@/components/BackButton';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { FeatureGate } from '@/components/subscription/LockedFeatureWrapper';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import { tw } from '@/lib/rtl';
import { getLockedAreaCopy } from '@/lib/subscription/lockedAreaCopy';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

type ReportsTopTab = 'reports' | 'customers';
type CustomerRouteFilter =
  | 'near_reward'
  | 'at_risk'
  | 'new_customers'
  | 'reward_eligible';
type CustomerState =
  | 'NEW'
  | 'ACTIVE'
  | 'NEEDS_NURTURE'
  | 'NEEDS_WINBACK'
  | 'CLOSE_TO_REWARD';
type CustomerValueTier = 'REGULAR' | 'LOYAL' | 'VIP';
type CustomerStatus =
  | 'NEW_CUSTOMER'
  | 'ACTIVE'
  | 'AT_RISK'
  | 'NEAR_REWARD'
  | 'VIP';
type SegmentField =
  | 'lastVisitDaysAgo'
  | 'visitCount'
  | 'loyaltyProgress'
  | 'customerStatus'
  | 'customerState'
  | 'customerValueTier'
  | 'joinedDaysAgo';
type SegmentOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
type SegmentCondition = {
  field: SegmentField;
  operator: SegmentOperator;
  value: number | string;
};
type QuickSegmentKey =
  | 'NEEDS_WINBACK'
  | 'CLOSE_TO_REWARD'
  | 'VIP_VALUE'
  | 'NEW'
  | 'ACTIVE';

const TOP_TABS: Array<{ key: ReportsTopTab; label: string }> = [
  { key: 'reports', label: 'דוחות' },
  { key: 'customers', label: 'לקוחות' },
];

const STATE_LABELS: Record<CustomerState, string> = {
  NEW: 'חדש',
  ACTIVE: 'פעיל',
  NEEDS_NURTURE: 'דורש טיפוח',
  NEEDS_WINBACK: 'דורש החזרה',
  CLOSE_TO_REWARD: 'קרוב להטבה',
};

const STATE_COLORS: Record<CustomerState, string> = {
  NEW: 'bg-sky-100 text-sky-700',
  ACTIVE: 'bg-slate-100 text-slate-700',
  NEEDS_NURTURE: 'bg-orange-100 text-orange-700',
  NEEDS_WINBACK: 'bg-rose-100 text-rose-700',
  CLOSE_TO_REWARD: 'bg-amber-100 text-amber-700',
};

const VALUE_TIER_LABELS: Record<CustomerValueTier, string> = {
  REGULAR: 'Regular',
  LOYAL: 'Loyal',
  VIP: 'VIP',
};

const VALUE_TIER_COLORS: Record<CustomerValueTier, string> = {
  REGULAR: 'bg-slate-100 text-slate-700',
  LOYAL: 'bg-indigo-100 text-indigo-700',
  VIP: 'bg-fuchsia-100 text-fuchsia-700',
};

const STATUS_LABELS: Record<CustomerStatus, string> = {
  NEW_CUSTOMER: 'חדש',
  ACTIVE: 'פעיל',
  AT_RISK: 'בסיכון',
  NEAR_REWARD: 'קרוב להטבה',
  VIP: 'VIP',
};

const STATUS_COLORS: Record<CustomerStatus, string> = {
  NEW_CUSTOMER: 'bg-sky-100 text-sky-700',
  ACTIVE: 'bg-slate-100 text-slate-700',
  AT_RISK: 'bg-rose-100 text-rose-700',
  NEAR_REWARD: 'bg-amber-100 text-amber-700',
  VIP: 'bg-indigo-100 text-indigo-700',
};

const FIELD_OPTIONS: Array<{ key: SegmentField; label: string }> = [
  { key: 'lastVisitDaysAgo', label: 'ימים מאז ביקור' },
  { key: 'visitCount', label: 'מספר ביקורים' },
  { key: 'loyaltyProgress', label: 'התקדמות בכרטיס' },
  { key: 'customerStatus', label: 'סטטוס לקוח' },
  { key: 'joinedDaysAgo', label: 'ימים מאז הצטרפות' },
];

const OPERATOR_OPTIONS: Array<{ key: SegmentOperator; label: string }> = [
  { key: 'gte', label: 'לפחות' },
  { key: 'lte', label: 'עד' },
  { key: 'eq', label: 'שווה ל' },
  { key: 'gt', label: 'יותר מ-' },
  { key: 'lt', label: 'פחות מ-' },
];

const STATUS_OPTIONS: CustomerStatus[] = [
  'AT_RISK',
  'NEAR_REWARD',
  'VIP',
  'NEW_CUSTOMER',
  'ACTIVE',
];

const SEGMENT_FIELD_OPTIONS: Array<{ key: SegmentField; label: string }> = [
  ...FIELD_OPTIONS.filter((option) => option.key !== 'customerStatus'),
  { key: 'customerState', label: 'Customer State' },
  { key: 'customerValueTier', label: 'Value Tier' },
  { key: 'customerStatus', label: 'Status (Legacy)' },
];

const QUICK_SEGMENT_OPTIONS: Array<{ key: QuickSegmentKey; label: string }> = [
  { key: 'NEEDS_WINBACK', label: STATE_LABELS.NEEDS_WINBACK },
  { key: 'CLOSE_TO_REWARD', label: STATE_LABELS.CLOSE_TO_REWARD },
  { key: 'VIP_VALUE', label: VALUE_TIER_LABELS.VIP },
  { key: 'NEW', label: STATE_LABELS.NEW },
  { key: 'ACTIVE', label: STATE_LABELS.ACTIVE },
];

const CUSTOMER_STATE_OPTIONS: CustomerState[] = [
  'NEEDS_WINBACK',
  'NEEDS_NURTURE',
  'CLOSE_TO_REWARD',
  'NEW',
  'ACTIVE',
];

const CUSTOMER_VALUE_TIER_OPTIONS: CustomerValueTier[] = [
  'VIP',
  'LOYAL',
  'REGULAR',
];

function resolveCustomerState(customer: {
  customerState?: string | null;
  lifecycleStatus?: string | null;
}): CustomerState {
  if (
    customer.customerState === 'NEW' ||
    customer.customerState === 'ACTIVE' ||
    customer.customerState === 'NEEDS_NURTURE' ||
    customer.customerState === 'NEEDS_WINBACK' ||
    customer.customerState === 'CLOSE_TO_REWARD'
  ) {
    return customer.customerState;
  }
  if (customer.lifecycleStatus === 'NEW_CUSTOMER') {
    return 'NEW';
  }
  if (customer.lifecycleStatus === 'AT_RISK') {
    return 'NEEDS_WINBACK';
  }
  if (customer.lifecycleStatus === 'NEAR_REWARD') {
    return 'CLOSE_TO_REWARD';
  }
  return 'ACTIVE';
}

function resolveCustomerValueTier(customer: {
  customerValueTier?: string | null;
  lifecycleStatus?: string | null;
}): CustomerValueTier {
  if (
    customer.customerValueTier === 'REGULAR' ||
    customer.customerValueTier === 'LOYAL' ||
    customer.customerValueTier === 'VIP'
  ) {
    return customer.customerValueTier;
  }
  if (customer.lifecycleStatus === 'VIP') {
    return 'VIP';
  }
  return 'REGULAR';
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(
    value
  );
}

function formatLastVisit(daysAgo: number) {
  if (daysAgo <= 0) {
    return 'היום';
  }
  if (daysAgo === 1) {
    return 'אתמול';
  }
  return `לפני ${daysAgo} ימים`;
}

function cycleOption<T extends string>(options: readonly T[], current: T) {
  const index = options.indexOf(current);
  return options[(index + 1) % options.length];
}

function defaultValueForField(field: SegmentField): number | string {
  if (field === 'customerState') {
    return 'NEEDS_WINBACK';
  }
  if (field === 'customerValueTier') {
    return 'VIP';
  }
  if (field === 'customerStatus') {
    return 'AT_RISK';
  }
  if (field === 'joinedDaysAgo') {
    return 7;
  }
  if (field === 'visitCount') {
    return 5;
  }
  if (field === 'loyaltyProgress') {
    return 6;
  }
  return 30;
}

function quickSegmentPreset(preset: QuickSegmentKey) {
  if (preset === 'NEEDS_WINBACK') {
    return {
      name: STATE_LABELS.NEEDS_WINBACK,
      rules: {
        match: 'all' as const,
        conditions: [
          {
            field: 'customerState' as const,
            operator: 'eq' as const,
            value: 'NEEDS_WINBACK',
          },
        ],
      },
    };
  }
  if (preset === 'CLOSE_TO_REWARD') {
    return {
      name: STATE_LABELS.CLOSE_TO_REWARD,
      rules: {
        match: 'all' as const,
        conditions: [
          {
            field: 'customerState' as const,
            operator: 'eq' as const,
            value: 'CLOSE_TO_REWARD',
          },
        ],
      },
    };
  }
  if (preset === 'VIP_VALUE') {
    return {
      name: VALUE_TIER_LABELS.VIP,
      rules: {
        match: 'all' as const,
        conditions: [
          {
            field: 'customerValueTier' as const,
            operator: 'eq' as const,
            value: 'VIP',
          },
        ],
      },
    };
  }
  if (preset === 'NEW') {
    return {
      name: STATE_LABELS.NEW,
      rules: {
        match: 'all' as const,
        conditions: [
          {
            field: 'customerState' as const,
            operator: 'eq' as const,
            value: 'NEW',
          },
        ],
      },
    };
  }
  return {
    name: STATE_LABELS.ACTIVE,
    rules: {
      match: 'all' as const,
      conditions: [
        {
          field: 'customerState' as const,
          operator: 'eq' as const,
          value: 'ACTIVE',
        },
      ],
    },
  };
}

function quickSegment(status: CustomerStatus) {
  switch (status) {
    case 'AT_RISK':
      return {
        name: 'לקוחות בסיכון',
        rules: {
          match: 'all' as const,
          conditions: [
            {
              field: 'lastVisitDaysAgo' as const,
              operator: 'gte' as const,
              value: 30,
            },
          ],
        },
      };
    case 'NEAR_REWARD':
      return {
        name: 'קרובים להטבה',
        rules: {
          match: 'all' as const,
          conditions: [
            {
              field: 'customerStatus' as const,
              operator: 'eq' as const,
              value: 'NEAR_REWARD',
            },
          ],
        },
      };
    case 'VIP':
      return {
        name: 'VIP',
        rules: {
          match: 'all' as const,
          conditions: [
            {
              field: 'customerStatus' as const,
              operator: 'eq' as const,
              value: 'VIP',
            },
          ],
        },
      };
    case 'NEW_CUSTOMER':
      return {
        name: 'לקוחות חדשים',
        rules: {
          match: 'all' as const,
          conditions: [
            {
              field: 'joinedDaysAgo' as const,
              operator: 'lte' as const,
              value: 7,
            },
          ],
        },
      };
    default:
      return {
        name: 'לקוחות פעילים',
        rules: {
          match: 'all' as const,
          conditions: [
            {
              field: 'customerStatus' as const,
              operator: 'eq' as const,
              value: 'ACTIVE',
            },
          ],
        },
      };
  }
}

export function CustomersHubContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map, filter } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    filter?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const activeFilter: CustomerRouteFilter | null =
    filter === 'near_reward' ||
    filter === 'at_risk' ||
    filter === 'new_customers' ||
    filter === 'reward_eligible'
      ? filter
      : null;
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const activeBusinessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canManageSegments = activeBusinessCapabilities?.edit_campaigns === true;
  const { entitlements, gate } = useEntitlements(activeBusinessId);
  const smartGate = gate('smartAnalytics');
  const segmentationGate = gate('segmentationBuilder');
  const savedSegmentsGate = gate('savedSegments');
  const segmentationRequiredPlan =
    segmentationGate.requiredPlan ?? savedSegmentsGate.requiredPlan;
  const smartCopy = getLockedAreaCopy('smartAnalytics', smartGate.requiredPlan);
  const segmentationCopy = getLockedAreaCopy(
    'segmentationBuilder',
    segmentationRequiredPlan
  );
  const customerList = useQuery(
    api.customerCards.listBusinessCustomersBase,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const snapshot = useQuery(
    api.events.getCustomerManagementSnapshot,
    activeBusinessId && entitlements && !smartGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip'
  );
  const rewardEligibilitySummary = useQuery(
    api.memberships.getBusinessRewardEligibilitySummary,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const savedSegments = useQuery(
    api.segments.listSegments,
    activeBusinessId && entitlements && !savedSegmentsGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip'
  );
  const [search, setSearch] = useState('');
  const [segmentName, setSegmentName] = useState('קהל חדש');
  const [segmentRules, setSegmentRules] = useState<{
    match: 'all' | 'any';
    conditions: SegmentCondition[];
  }>({
    match: 'all',
    conditions: [{ field: 'lastVisitDaysAgo', operator: 'gte', value: 30 }],
  });
  const previewSegment = useQuery(
    api.segments.previewSegment,
    activeBusinessId && !segmentationGate.isLocked
      ? { businessId: activeBusinessId, rules: segmentRules }
      : 'skip'
  );
  const createSegment = useMutation(api.segments.createSegment);
  const deleteSegment = useMutation(api.segments.deleteSegment);
  const [isSavingSegment, setIsSavingSegment] = useState(false);
  const [activeDeleteId, setActiveDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const openUpgrade = (
    featureKey: string,
    requiredPlan: 'starter' | 'pro' | 'premium' | null,
    reason:
      | 'feature_locked'
      | 'limit_reached'
      | 'subscription_inactive' = 'feature_locked'
  ) => {
    openSubscriptionComparison(router, { featureKey, requiredPlan, reason });
  };

  const summary = snapshot?.summary ?? {
    totalCustomers: 0,
    activeCustomers: 0,
    needsNurtureCustomers: 0,
    needsWinbackCustomers: 0,
    closeToRewardCustomers: 0,
    loyalCustomers: 0,
    atRiskCustomers: 0,
    nearRewardCustomers: 0,
    vipCustomers: 0,
    newCustomers: 0,
  };
  const needsAttentionCustomersRaw =
    (summary.needsNurtureCustomers ?? 0) + (summary.needsWinbackCustomers ?? 0);
  const needsAttentionCustomers =
    needsAttentionCustomersRaw > 0
      ? needsAttentionCustomersRaw
      : (summary.atRiskCustomers ?? 0);
  const closeToRewardCustomers =
    (summary.closeToRewardCustomers ?? 0) > 0
      ? summary.closeToRewardCustomers
      : (summary.nearRewardCustomers ?? 0);
  const rewardEligibleCustomers =
    rewardEligibilitySummary?.redeemableCustomers ?? 0;
  const rewardEligibleCards = rewardEligibilitySummary?.redeemableCards ?? 0;

  const filteredCustomers = useMemo(() => {
    const customers = customerList ?? [];
    const routeFilteredCustomers = activeFilter
      ? customers.filter((customer) => {
          const state = resolveCustomerState(customer);
          if (activeFilter === 'near_reward') {
            return state === 'CLOSE_TO_REWARD';
          }
          if (activeFilter === 'at_risk') {
            return state === 'NEEDS_NURTURE' || state === 'NEEDS_WINBACK';
          }
          if (activeFilter === 'reward_eligible') {
            return (
              Number(customer.rewardThreshold) > 0 &&
              Number(customer.loyaltyProgress) >=
                Number(customer.rewardThreshold)
            );
          }
          return state === 'NEW';
        })
      : customers;
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return routeFilteredCustomers;
    }
    return routeFilteredCustomers.filter((customer) =>
      `${customer.name} ${customer.phone ?? ''}`
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [activeFilter, customerList, search]);

  const updateCondition = (index: number, patch: Partial<SegmentCondition>) => {
    setSegmentRules((current) => ({
      ...current,
      conditions: current.conditions.map((condition, conditionIndex) =>
        conditionIndex === index ? { ...condition, ...patch } : condition
      ),
    }));
  };

  const saveSegment = async () => {
    if (
      !activeBusinessId ||
      isSavingSegment ||
      segmentationGate.isLocked ||
      savedSegmentsGate.isLocked
    ) {
      return;
    }
    setIsSavingSegment(true);
    try {
      await createSegment({
        businessId: activeBusinessId,
        name: segmentName,
        rules: segmentRules,
      });
      Alert.alert('נשמר', 'הקהל נשמר בהצלחה.');
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error && error.message
          ? error.message
          : 'לא הצלחנו לשמור את הקהל.'
      );
    } finally {
      setIsSavingSegment(false);
    }
  };

  const removeSegment = async (segmentId: string) => {
    if (!activeBusinessId || activeDeleteId) {
      return;
    }
    setActiveDeleteId(segmentId);
    try {
      await deleteSegment({
        businessId: activeBusinessId,
        segmentId: segmentId as never,
      });
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error && error.message
          ? error.message
          : 'לא הצלחנו למחוק את הקהל.'
      );
    } finally {
      setActiveDeleteId(null);
    }
  };

  const openCustomerCard = (customerUserId: string) => {
    router.push({
      pathname: '/(authenticated)/(business)/customer/[customerUserId]',
      params: { customerUserId },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7FB]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: (insets.bottom || 0) + 30,
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#F6F7FB"
        >
          <BusinessScreenHeader
            title="לקוחות"
            subtitle="מצב לקוחות, דרגות ערך והזדמנויות קמפיין"
            titleAccessory={<BackButton onPress={() => router.replace('/(authenticated)/(business)/dashboard')} />}
          />
        </StickyScrollHeader>
        <View
          className={`mt-4 rounded-full border border-[#D6E2F8] bg-[#EEF3FF] p-1 ${tw.flexRow} gap-1`}
        >
          {TOP_TABS.map((topTab) => {
            const isActive = topTab.key === 'customers';
            return (
              <TouchableOpacity
                key={topTab.key}
                onPress={() => {
                  if (topTab.key === 'reports') {
                    router.setParams({ tab: 'reports' });
                    return;
                  }
                }}
                className={`flex-1 rounded-full py-2.5 ${
                  isActive ? 'bg-[#2F6BFF]' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-center text-sm font-extrabold ${
                    isActive ? 'text-white' : 'text-[#51617F]'
                  }`}
                >
                  {topTab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="mt-5">
          <FeatureGate
            isLocked={smartGate.isLocked}
            requiredPlan={smartGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'smartAnalytics',
                smartGate.requiredPlan,
                smartGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title={smartCopy.lockedTitle}
            subtitle={smartCopy.lockedSubtitle}
            benefits={smartCopy.benefits}
          >
            <View className="rounded-3xl border border-[#E5EAF2] bg-white p-5">
              <View className={`${tw.flexRow} flex-wrap gap-3`}>
                <View className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#F8FAFF] p-3">
                  <Text className="text-right text-xs font-semibold text-[#64748B]">
                    פעילים
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#0F294B]">
                    {smartGate.isLocked
                      ? '--'
                      : formatNumber(summary.activeCustomers)}
                  </Text>
                </View>
                <View className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#FFF6F6] p-3">
                  <Text className="text-right text-xs font-semibold text-[#B45353]">
                    בסיכון
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#B42318]">
                    {smartGate.isLocked
                      ? '--'
                      : formatNumber(needsAttentionCustomers)}
                  </Text>
                </View>
                <View className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#FFF7ED] p-3">
                  <Text className="text-right text-xs font-semibold text-[#B45309]">
                    קרובים להטבה
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#C2410C]">
                    {smartGate.isLocked
                      ? '--'
                      : formatNumber(closeToRewardCustomers)}
                  </Text>
                </View>
                <View className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#EEF2FF] p-3">
                  <Text className="text-right text-xs font-semibold text-[#4338CA]">
                    VIP / Loyal
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#3730A3]">
                    {smartGate.isLocked
                      ? '--'
                      : `${formatNumber(summary.vipCustomers ?? 0)} / ${formatNumber(
                          summary.loyalCustomers ?? 0
                        )}`}
                  </Text>
                </View>
              </View>
              <Text
                className={`mt-3 text-xs font-semibold text-[#64748B] ${tw.textStart}`}
              >
                לקוחות זכאים להטבה:{' '}
                {smartGate.isLocked
                  ? '--'
                  : formatNumber(rewardEligibleCustomers)}{' '}
                · כרטיסיות מלאות:{' '}
                {smartGate.isLocked ? '--' : formatNumber(rewardEligibleCards)}
              </Text>

              <View className="mt-4 rounded-3xl border border-[#E5EAF2] bg-[#182F4E] px-5 py-5">
                <Text
                  className={`text-lg font-black text-[#7EB1FF] ${tw.textStart}`}
                >
                  תובנות לקוחות
                </Text>
                {smartGate.isLocked ? (
                  <Text
                    className={`mt-2 text-sm leading-6 text-[#E2E8F6] ${tw.textStart}`}
                  >
                    שדרוג ל-Pro AI יפתח תובנות לקוחות בזמן אמת.
                  </Text>
                ) : snapshot === undefined ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                    style={{ marginTop: 12 }}
                  />
                ) : snapshot.insights.length === 0 ? (
                  <Text
                    className={`mt-2 text-sm leading-6 text-[#E2E8F6] ${tw.textStart}`}
                  >
                    אין כרגע תובנות להצגה.
                  </Text>
                ) : (
                  <View className="mt-2 gap-2">
                    {snapshot.insights.map((insight) => (
                      <Text
                        key={insight}
                        className={`text-sm leading-6 text-[#E2E8F6] ${tw.textStart}`}
                      >
                        • {insight}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </FeatureGate>
        </View>

        <View className="mt-5 rounded-full border border-[#E5EAF2] bg-white px-4 py-3">
          <View className={`${tw.flexRow} items-center gap-2`}>
            <Ionicons name="search-outline" size={20} color="#B0BAC8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="חפשו לקוח לפי שם או טלפון"
              placeholderTextColor="#B0BAC8"
              className={`flex-1 text-sm font-semibold text-[#1A2B4A] ${tw.textStart}`}
            />
          </View>
        </View>

        <View className={`${tw.flexRow} mt-4 items-center justify-between`}>
          <Text className="text-xs font-semibold text-[#64748B]">
            {`${formatNumber(filteredCustomers.length)} לקוחות`}
          </Text>
          {customerList ? (
            <Text className="text-xs font-semibold text-[#64748B]">
              {formatNumber(customerList.length)} סה״כ
            </Text>
          ) : null}
        </View>

        {activeFilter ? (
          <View
            className={`${tw.selfStart} mt-2 rounded-full bg-[#E8F1FF] px-3 py-1`}
          >
            <Text className="text-[11px] font-bold text-[#1D4ED8]">
              {activeFilter === 'near_reward'
                ? 'מסונן: לקוחות קרובים להטבה'
                : activeFilter === 'at_risk'
                  ? 'מסונן: לקוחות בסיכון'
                  : activeFilter === 'reward_eligible'
                    ? 'מסונן: ממתינים למימוש'
                    : 'מסונן: לקוחות חדשים'}
            </Text>
          </View>
        ) : null}

        <View className="mt-3 gap-3">
          {customerList === undefined ? (
            <View className="items-center justify-center py-8">
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : filteredCustomers.length === 0 ? (
            <View className="rounded-2xl border border-[#E5EAF2] bg-white p-4">
              <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                לא נמצאו לקוחות שתואמים לחיפוש.
              </Text>
            </View>
          ) : (
            filteredCustomers.map((customer) => {
              const customerState = resolveCustomerState(customer);
              const customerValueTier = resolveCustomerValueTier(customer);

              return (
              <Pressable
                key={customer.primaryMembershipId}
                onPress={() => openCustomerCard(String(customer.customerId))}
                className="rounded-2xl border border-[#E5EAF2] bg-white px-4 py-4"
              >
                <View className={`${tw.flexRow} items-start justify-between`}>
                  <View className="items-end">
                    <Text className={`text-xs text-[#94A3B8] ${tw.textStart}`}>
                      ביקור אחרון
                    </Text>
                    <Text
                      className={`mt-1 text-sm font-black text-[#0F172A] ${tw.textStart}`}
                    >
                      {formatLastVisit(customer.lastVisitDaysAgo)}
                    </Text>
                    <Text
                      className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                    >
                      {customer.visitCount} ביקורים •{' '}
                      {customer.primaryProgramName}
                    </Text>
                  </View>

                  <View className="flex-1 items-end px-3">
                    <Text
                      className={`text-lg font-black text-[#0F294B] ${tw.textStart}`}
                    >
                      {customer.name}
                    </Text>
                    <Text
                      className={`mt-1 text-xs text-[#8A97AC] ${tw.textStart}`}
                    >
                      {customer.phone ?? 'ללא טלפון'}
                    </Text>
                    <View className={`${tw.flexRow} mt-2 items-center gap-2`}>
                      <View
                        className={`rounded-full px-3 py-1 ${
                          STATE_COLORS[customerState]
                        }`}
                      >
                        <Text className="text-xs font-bold">
                          {STATE_LABELS[customerState]}
                        </Text>
                      </View>
                      <View
                        className={`rounded-full px-3 py-1 ${
                          VALUE_TIER_COLORS[customerValueTier]
                        }`}
                      >
                        <Text className="text-xs font-bold">
                          {VALUE_TIER_LABELS[customerValueTier]}
                        </Text>
                      </View>
                      {Number(customer.rewardThreshold) > 0 &&
                      Number(customer.loyaltyProgress) >=
                        Number(customer.rewardThreshold) ? (
                        <View className="rounded-full bg-emerald-100 px-3 py-1">
                          <Text className="text-xs font-bold text-emerald-700">
                            {
                              '\u05d6\u05db\u05d0\u05d9 \u05dc\u05de\u05d9\u05de\u05d5\u05e9'
                            }
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      className={`mt-2 text-xs text-[#475569] ${tw.textStart}`}
                    >
                      התקדמות להטבה: {customer.loyaltyProgress}/
                      {customer.rewardThreshold}
                    </Text>
                  </View>

                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#ECF1FF]">
                  <Ionicons name="person-outline" size={20} color="#2F6BFF" />
                </View>
              </View>
              </Pressable>
              );
            })
          )}
        </View>

        <View className="mt-6">
          <FeatureGate
            isLocked={segmentationGate.isLocked || savedSegmentsGate.isLocked}
            requiredPlan={segmentationRequiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'segmentationBuilder',
                segmentationRequiredPlan,
                segmentationGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title={segmentationCopy.lockedTitle}
            subtitle={segmentationCopy.lockedSubtitle}
            benefits={segmentationCopy.benefits}
          >
            <View className="rounded-3xl border border-[#E5EAF2] bg-white p-5">
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text
                  className={`text-lg font-black text-[#15233A] ${tw.textStart}`}
                >
                  {segmentationCopy.sectionTitle}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setSegmentRules((current) => ({
                      ...current,
                      match: current.match === 'all' ? 'any' : 'all',
                    }))
                  }
                  className="rounded-full border border-[#CBD5E1] bg-[#F8FAFF] px-3 py-1"
                >
                  <Text className="text-xs font-bold text-[#334155]">
                    {segmentRules.match === 'all' ? 'כל התנאים' : 'אחד מהתנאים'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View className={`${tw.flexRow} mt-3 flex-wrap gap-2`}>
                {QUICK_SEGMENT_OPTIONS.map((preset) => (
                  <TouchableOpacity
                    key={preset.key}
                    onPress={() => {
                      const template = quickSegmentPreset(preset.key);
                      setSegmentName(template.name);
                      setSegmentRules(template.rules);
                    }}
                    className="rounded-full border border-[#D6E2F8] bg-[#EEF3FF] px-3 py-1"
                  >
                    <Text className="text-xs font-bold text-[#2F6BFF]">
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View className="mt-4 gap-3">
                {segmentRules.conditions.map((condition, index) => {
                  const isLegacyStatusField =
                    condition.field === 'customerStatus';
                  const isCustomerStateField =
                    condition.field === 'customerState';
                  const isCustomerValueTierField =
                    condition.field === 'customerValueTier';
                  return (
                    <View
                      key={`${condition.field}-${index}`}
                      className="rounded-2xl border border-[#E5EAF2] bg-[#F8FAFF] p-3"
                    >
                      <View className={`${tw.flexRow} items-center gap-2`}>
                        <TouchableOpacity
                          onPress={() =>
                            updateCondition(index, {
                              field: cycleOption(
                                SEGMENT_FIELD_OPTIONS.map(
                                  (option) => option.key
                                ),
                                condition.field
                              ),
                              value: defaultValueForField(
                                cycleOption(
                                  SEGMENT_FIELD_OPTIONS.map(
                                    (option) => option.key
                                  ),
                                  condition.field
                                )
                              ),
                            })
                          }
                          className="flex-1 rounded-xl border border-[#CBD5E1] bg-white px-3 py-2"
                        >
                          <Text className="text-center text-xs font-bold text-[#334155]">
                            {
                              SEGMENT_FIELD_OPTIONS.find(
                                (option) => option.key === condition.field
                              )?.label
                            }
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            updateCondition(index, {
                              operator: cycleOption(
                                OPERATOR_OPTIONS.map((option) => option.key),
                                condition.operator
                              ),
                            })
                          }
                          className="flex-1 rounded-xl border border-[#CBD5E1] bg-white px-3 py-2"
                        >
                          <Text className="text-center text-xs font-bold text-[#334155]">
                            {
                              OPERATOR_OPTIONS.find(
                                (option) => option.key === condition.operator
                              )?.label
                            }
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            setSegmentRules((current) => ({
                              ...current,
                              conditions: current.conditions.filter(
                                (_, conditionIndex) => conditionIndex !== index
                              ),
                            }))
                          }
                          className="rounded-xl bg-[#FEE2E2] px-3 py-2"
                        >
                          <Text className="text-xs font-bold text-[#B91C1C]">
                            הסר
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {isLegacyStatusField ? (
                        <TouchableOpacity
                          onPress={() =>
                            updateCondition(index, {
                              value: cycleOption(
                                STATUS_OPTIONS,
                                (condition.value as CustomerStatus) || 'AT_RISK'
                              ),
                            })
                          }
                          className="mt-2 rounded-xl border border-[#CBD5E1] bg-white px-3 py-3"
                        >
                          <Text className="text-center text-sm font-bold text-[#334155]">
                            {
                              STATUS_LABELS[
                                ((condition.value as CustomerStatus) ||
                                  'AT_RISK') as CustomerStatus
                              ]
                            }
                          </Text>
                        </TouchableOpacity>
                      ) : isCustomerStateField ? (
                        <TouchableOpacity
                          onPress={() =>
                            updateCondition(index, {
                              value: cycleOption(
                                CUSTOMER_STATE_OPTIONS,
                                (condition.value as CustomerState) ||
                                  'NEEDS_WINBACK'
                              ),
                            })
                          }
                          className="mt-2 rounded-xl border border-[#CBD5E1] bg-white px-3 py-3"
                        >
                          <Text className="text-center text-sm font-bold text-[#334155]">
                            {
                              STATE_LABELS[
                                ((condition.value as CustomerState) ||
                                  'NEEDS_WINBACK') as CustomerState
                              ]
                            }
                          </Text>
                        </TouchableOpacity>
                      ) : isCustomerValueTierField ? (
                        <TouchableOpacity
                          onPress={() =>
                            updateCondition(index, {
                              value: cycleOption(
                                CUSTOMER_VALUE_TIER_OPTIONS,
                                (condition.value as CustomerValueTier) || 'VIP'
                              ),
                            })
                          }
                          className="mt-2 rounded-xl border border-[#CBD5E1] bg-white px-3 py-3"
                        >
                          <Text className="text-center text-sm font-bold text-[#334155]">
                            {
                              VALUE_TIER_LABELS[
                                ((condition.value as CustomerValueTier) ||
                                  'VIP') as CustomerValueTier
                              ]
                            }
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TextInput
                          value={String(condition.value)}
                          onChangeText={(value) =>
                            updateCondition(index, {
                              value: Number(value) || 0,
                            })
                          }
                          keyboardType="number-pad"
                          className="mt-2 rounded-xl border border-[#CBD5E1] bg-white px-3 py-3 text-right text-sm font-semibold text-[#0F172A]"
                        />
                      )}
                    </View>
                  );
                })}
              </View>

              <View className={`${tw.flexRow} mt-3 gap-2`}>
                <TouchableOpacity
                  onPress={() =>
                    setSegmentRules((current) => ({
                      ...current,
                      conditions: [
                        ...current.conditions,
                        { field: 'visitCount', operator: 'gte', value: 5 },
                      ],
                    }))
                  }
                  className="flex-1 rounded-2xl border border-[#CBD5E1] bg-white py-3"
                >
                  <Text className="text-center text-sm font-bold text-[#334155]">
                    הוספת תנאי
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveSegment}
                  disabled={!canManageSegments || isSavingSegment}
                  className={`flex-1 rounded-2xl py-3 ${
                    canManageSegments && !isSavingSegment
                      ? 'bg-[#2563EB]'
                      : 'bg-[#CBD5E1]'
                  }`}
                >
                  {isSavingSegment ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-center text-sm font-bold text-white">
                      שמירת קהל
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <TextInput
                value={segmentName}
                onChangeText={setSegmentName}
                placeholder="שם הקהל"
                placeholderTextColor="#94A3B8"
                className="mt-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />

              <View className="mt-4 rounded-2xl border border-[#E5EAF2] bg-[#EEF6FF] p-4">
                <Text
                  className={`text-sm font-bold text-[#1D4ED8] ${tw.textStart}`}
                >
                  תצוגה מקדימה
                </Text>
                <Text className={`mt-1 text-xs text-[#475569] ${tw.textStart}`}>
                  {previewSegment
                    ? `${formatNumber(previewSegment.count)} לקוחות מתאימים כרגע`
                    : 'טוען התאמות...'}
                </Text>
              </View>

              <View className="mt-4 rounded-2xl border border-[#E5EAF2] bg-[#F8FAFF] p-4">
                <Text
                  className={`text-sm font-black text-[#15233A] ${tw.textStart}`}
                >
                  קהלים שמורים
                </Text>
                {savedSegments === undefined ? (
                  <ActivityIndicator
                    color="#2F6BFF"
                    style={{ marginTop: 12 }}
                  />
                ) : savedSegments.length === 0 ? (
                  <Text
                    className={`mt-2 text-sm text-[#64748B] ${tw.textStart}`}
                  >
                    עדיין לא שמרתם קהלים.
                  </Text>
                ) : (
                  <View className="mt-3 gap-2">
                    {savedSegments.map((segment) => (
                      <View
                        key={segment.segmentId}
                        className="rounded-2xl border border-[#D6E2F8] bg-white p-3"
                      >
                        <View
                          className={`${tw.flexRow} items-center justify-between`}
                        >
                          <TouchableOpacity
                            onPress={() =>
                              removeSegment(String(segment.segmentId))
                            }
                            disabled={
                              activeDeleteId === String(segment.segmentId)
                            }
                            className="rounded-full bg-[#FEE2E2] px-3 py-1"
                          >
                            <Text className="text-xs font-bold text-[#B91C1C]">
                              {activeDeleteId === String(segment.segmentId)
                                ? 'מוחק...'
                                : 'מחיקה'}
                            </Text>
                          </TouchableOpacity>
                          <View className="items-end">
                            <Text
                              className={`text-sm font-black text-[#15233A] ${tw.textStart}`}
                            >
                              {segment.name}
                            </Text>
                            <Text
                              className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                            >
                              {segment.rules.conditions.length} תנאים
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </FeatureGate>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function BusinessCustomersRoute() {
  const { preview, map, filter } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    filter?: string;
  }>();

  return (
    <Redirect
      href={{
        pathname: '/(authenticated)/(business)/analytics',
        params: { preview, map, tab: 'customers', filter },
      }}
    />
  );
}
