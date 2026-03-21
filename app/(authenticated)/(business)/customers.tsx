import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { FeatureGate } from '@/components/subscription/LockedFeatureWrapper';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
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

const TOP_TABS: Array<{ key: ReportsTopTab; label: string }> = [
  { key: 'reports', label: '׳“׳•׳—׳•׳×' },
  { key: 'customers', label: '׳׳§׳•׳—׳•׳×' },
];

const STATE_LABELS: Record<CustomerState, string> = {
  NEW: '׳—׳“׳©',
  ACTIVE: '׳₪׳¢׳™׳',
  NEEDS_NURTURE: '׳“׳•׳¨׳© ׳˜׳™׳₪׳•׳—',
  NEEDS_WINBACK: '׳“׳•׳¨׳© ׳”׳—׳–׳¨׳”',
  CLOSE_TO_REWARD: '׳§׳¨׳•׳‘ ׳׳”׳˜׳‘׳”',
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

function resolveCustomerState(customer: {
  customerState?: string | null;
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
  return 'ACTIVE';
}

function resolveCustomerValueTier(customer: {
  customerValueTier?: string | null;
}): CustomerValueTier {
  if (
    customer.customerValueTier === 'REGULAR' ||
    customer.customerValueTier === 'LOYAL' ||
    customer.customerValueTier === 'VIP'
  ) {
    return customer.customerValueTier;
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
    return '׳”׳™׳•׳';
  }
  if (daysAgo === 1) {
    return '׳׳×׳׳•׳';
  }
  return `׳׳₪׳ ׳™ ${daysAgo} ׳™׳׳™׳`;
}

function buildActiveFilterLabel(activeFilter: CustomerRouteFilter) {
  if (activeFilter === 'near_reward') {
    return '׳׳¡׳•׳ ׳: ׳׳§׳•׳—׳•׳× ׳§׳¨׳•׳‘׳™׳ ׳׳”׳˜׳‘׳”';
  }
  if (activeFilter === 'at_risk') {
    return '׳׳¡׳•׳ ׳: ׳׳§׳•׳—׳•׳× ׳‘׳¡׳™׳›׳•׳';
  }
  if (activeFilter === 'reward_eligible') {
    return '׳׳¡׳•׳ ׳: ׳׳׳×׳™׳ ׳™׳ ׳׳׳™׳׳•׳©';
  }
  return '׳׳¡׳•׳ ׳: ׳׳§׳•׳—׳•׳× ׳—׳“׳©׳™׳';
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
  const { activeBusinessId } = useActiveBusiness();
  const { entitlements, gate } = useEntitlements(activeBusinessId);
  const smartGate = gate('smartAnalytics');
  const smartCopy = getLockedAreaCopy('smartAnalytics', smartGate.requiredPlan);
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
  const [search, setSearch] = useState('');

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
            title="׳׳§׳•׳—׳•׳×"
            subtitle="׳׳¦׳‘ ׳׳§׳•׳—׳•׳×, ׳“׳¨׳’׳•׳× ׳¢׳¨׳ ׳•׳ª׳׳‘׳ ׳•׳ª ׳“׳˜׳¨׳׳™׳ ׳™׳¡׳˜׳™׳•׳ª"
            titleAccessory={
              <BackButton
                onPress={() =>
                  router.replace('/(authenticated)/(business)/dashboard')
                }
              />
            }
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
                    ׳₪׳¢׳™׳׳™׳
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#0F294B]">
                    {smartGate.isLocked
                      ? '--'
                      : formatNumber(summary.activeCustomers)}
                  </Text>
                </View>
                <View className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#FFF6F6] p-3">
                  <Text className="text-right text-xs font-semibold text-[#B45353]">
                    ׳‘׳¡׳™׳›׳•׳
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#B42318]">
                    {smartGate.isLocked
                      ? '--'
                      : formatNumber(needsAttentionCustomers)}
                  </Text>
                </View>
                <View className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#FFF7ED] p-3">
                  <Text className="text-right text-xs font-semibold text-[#B45309]">
                    ׳§׳¨׳•׳‘׳™׳ ׳׳”׳˜׳‘׳”
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
                ׳׳§׳•׳—׳•׳× ׳–׳›׳׳™׳ ׳׳”׳˜׳‘׳”:{' '}
                {smartGate.isLocked
                  ? '--'
                  : formatNumber(rewardEligibleCustomers)}{' '}
                ֲ· ׳›׳¨׳˜׳™׳¡׳™׳•׳× ׳׳׳׳•׳×:{' '}
                {smartGate.isLocked ? '--' : formatNumber(rewardEligibleCards)}
              </Text>

              <View className="mt-4 rounded-3xl border border-[#E5EAF2] bg-[#182F4E] px-5 py-5">
                <Text
                  className={`text-lg font-black text-[#7EB1FF] ${tw.textStart}`}
                >
                  ׳×׳•׳‘׳ ׳•׳× ׳׳§׳•׳—׳•׳×
                </Text>
                {smartGate.isLocked ? (
                  <Text
                    className={`mt-2 text-sm leading-6 text-[#E2E8F6] ${tw.textStart}`}
                  >
                    ׳©׳“׳¨׳•׳’ ׳-Pro AI ׳™׳₪׳×׳— ׳×׳•׳‘׳ ׳•׳× ׳׳§׳•׳—׳•׳× ׳‘׳–׳׳ ׳׳׳×.
                  </Text>
                ) : snapshot === undefined ? (
                  <ActivityIndicator color="#FFFFFF" style={{ marginTop: 12 }} />
                ) : snapshot.insights.length === 0 ? (
                  <Text
                    className={`mt-2 text-sm leading-6 text-[#E2E8F6] ${tw.textStart}`}
                  >
                    ׳׳™׳ ׳›׳¨׳’׳¢ ׳×׳•׳‘׳ ׳•׳× ׳׳”׳¦׳’׳”.
                  </Text>
                ) : (
                  <View className="mt-2 gap-2">
                    {snapshot.insights.map((insight) => (
                      <Text
                        key={insight}
                        className={`text-sm leading-6 text-[#E2E8F6] ${tw.textStart}`}
                      >
                        ג€¢ {insight}
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
              placeholder="׳—׳₪׳©׳• ׳׳§׳•׳— ׳׳₪׳™ ׳©׳ ׳׳• ׳˜׳׳₪׳•׳"
              placeholderTextColor="#B0BAC8"
              className={`flex-1 text-sm font-semibold text-[#1A2B4A] ${tw.textStart}`}
            />
          </View>
        </View>

        <View className={`${tw.flexRow} mt-4 items-center justify-between`}>
          <Text className="text-xs font-semibold text-[#64748B]">
            {`${formatNumber(filteredCustomers.length)} ׳׳§׳•׳—׳•׳×`}
          </Text>
          {customerList ? (
            <Text className="text-xs font-semibold text-[#64748B]">
              {formatNumber(customerList.length)} ׳¡׳”׳´׳›
            </Text>
          ) : null}
        </View>

        {activeFilter ? (
          <View
            className={`${tw.selfStart} mt-2 rounded-full bg-[#E8F1FF] px-3 py-1`}
          >
            <Text className="text-[11px] font-bold text-[#1D4ED8]">
              {buildActiveFilterLabel(activeFilter)}
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
                ׳׳ ׳ ׳׳¦׳׳• ׳׳§׳•׳—׳•׳× ׳©׳×׳•׳׳׳™׳ ׳׳—׳™׳₪׳•׳©.
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
                      <Text
                        className={`text-xs text-[#94A3B8] ${tw.textStart}`}
                      >
                        ׳‘׳™׳§׳•׳¨ ׳׳—׳¨׳•׳
                      </Text>
                      <Text
                        className={`mt-1 text-sm font-black text-[#0F172A] ${tw.textStart}`}
                      >
                        {formatLastVisit(customer.lastVisitDaysAgo)}
                      </Text>
                      <Text
                        className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                      >
                        {customer.visitCount} ׳‘׳™׳§׳•׳¨׳™׳ ג€¢{' '}
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
                        {customer.phone ?? '׳׳׳ ׳˜׳׳₪׳•׳'}
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
                              {'\u05d6\u05db\u05d0\u05d9 \u05dc\u05de\u05d9\u05de\u05d5\u05e9'}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        className={`mt-2 text-xs text-[#475569] ${tw.textStart}`}
                      >
                        ׳”׳×׳§׳“׳׳•׳× ׳׳”׳˜׳‘׳”: {customer.loyaltyProgress}/
                        {customer.rewardThreshold}
                      </Text>
                    </View>

                    <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#ECF1FF]">
                      <Ionicons
                        name="person-outline"
                        size={20}
                        color="#2F6BFF"
                      />
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
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
