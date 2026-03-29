import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { tw } from '@/lib/rtl';

type CustomerState =
  | 'NEW'
  | 'ACTIVE'
  | 'NEEDS_NURTURE'
  | 'NEEDS_WINBACK'
  | 'CLOSE_TO_REWARD';
type CustomerValueTier = 'REGULAR' | 'LOYAL' | 'VIP';
type LegacyLifecycleStatus =
  | 'NEW_CUSTOMER'
  | 'ACTIVE'
  | 'AT_RISK'
  | 'NEAR_REWARD'
  | 'VIP';

const STATE_LABELS: Record<CustomerState, string> = {
  NEW: 'חדש',
  ACTIVE: 'פעיל',
  NEEDS_NURTURE: 'צריך חיזוק',
  NEEDS_WINBACK: 'צריך וינבאק',
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
  REGULAR: 'רגיל',
  LOYAL: 'נאמן',
  VIP: 'VIP',
};

const VALUE_TIER_COLORS: Record<CustomerValueTier, string> = {
  REGULAR: 'bg-slate-100 text-slate-700',
  LOYAL: 'bg-emerald-100 text-emerald-700',
  VIP: 'bg-indigo-100 text-indigo-700',
};

function resolveCustomerState(customer: {
  customerState?: string | null;
  lifecycleStatus?: string | null;
}) {
  const state = customer.customerState;
  if (
    state === 'NEW' ||
    state === 'ACTIVE' ||
    state === 'NEEDS_NURTURE' ||
    state === 'NEEDS_WINBACK' ||
    state === 'CLOSE_TO_REWARD'
  ) {
    return state;
  }

  const legacy = customer.lifecycleStatus as LegacyLifecycleStatus | undefined;
  if (legacy === 'NEW_CUSTOMER') return 'NEW';
  if (legacy === 'AT_RISK') return 'NEEDS_WINBACK';
  if (legacy === 'NEAR_REWARD') return 'CLOSE_TO_REWARD';
  return 'ACTIVE';
}

function resolveCustomerValueTier(customer: {
  customerValueTier?: string | null;
  lifecycleStatus?: string | null;
}) {
  const tier = customer.customerValueTier;
  if (tier === 'REGULAR' || tier === 'LOYAL' || tier === 'VIP') {
    return tier;
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

export default function StaffCustomersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const { activeBusinessId } = useActiveBusiness();

  const customerList = useQuery(
    api.customerCards.listBusinessCustomersBase,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );

  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.navigate('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const filteredCustomers = useMemo(() => {
    const customers = customerList ?? [];
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return customers;
    }
    return customers.filter((customer) =>
      `${customer.name} ${customer.phone ?? ''}`
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [customerList, search]);

  const openCustomerCard = (customerUserId: string) => {
    router.push({
      pathname: '/(authenticated)/(staff)/customer/[customerUserId]',
      params: { customerUserId },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
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
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="לקוחות"
            subtitle="חיפוש וצפייה בפרטי לקוחות"
          />
        </StickyScrollHeader>

        <View className="mt-4 rounded-full border border-[#D6E2F8] bg-white px-4 py-3">
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
                      <Text
                        className={`text-xs text-[#94A3B8] ${tw.textStart}`}
                      >
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
                      </View>
                      <Text
                        className={`mt-2 text-xs text-[#475569] ${tw.textStart}`}
                      >
                        התקדמות להטבה: {customer.loyaltyProgress}/
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
