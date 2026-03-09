import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { FeatureGate } from '@/components/subscription/LockedFeatureWrapper';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { tw } from '@/lib/rtl';
import { getLockedAreaCopy } from '@/lib/subscription/lockedAreaCopy';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

const WEEKDAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;
const TOP_TABS = [
  { key: 'reports', label: 'דוחות' },
  { key: 'customers', label: 'לקוחות' },
] as const;

function formatNumber(value: number) {
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(
    value
  );
}

function formatGrowth(value: number) {
  return `${value > 0 ? '+' : ''}${Math.round(value)}%`;
}

function calculateGrowthFromWeekly(weekly?: Array<{ stamps: number }>) {
  if (!weekly || weekly.length < 2) {
    return 0;
  }
  const latestWeek = weekly[weekly.length - 1]?.stamps ?? 0;
  const previousWeek = weekly[weekly.length - 2]?.stamps ?? 0;
  if (previousWeek === 0) {
    return 0;
  }
  return Math.round(((latestWeek - previousWeek) / previousWeek) * 100);
}

export default function BusinessAnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map, tab } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    tab?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const activeTopTab = tab === 'customers' ? 'customers' : 'reports';
  const { activeBusinessId } = useActiveBusiness();

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  useEffect(() => {
    if (activeTopTab === 'customers') {
      router.replace({
        pathname: '/(authenticated)/(business)/customers',
        params: { tab: 'customers' },
      });
    }
  }, [activeTopTab, router]);

  const { entitlements, gate } = useEntitlements(activeBusinessId);
  const advancedReportsGate = gate('advancedReports');
  const advancedReportsCopy = getLockedAreaCopy(
    'advancedReports',
    advancedReportsGate.requiredPlan
  );

  const basicAnalytics = useQuery(
    api.analytics.getBusinessActivity,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const advancedAnalytics = useQuery(
    api.analytics.getMerchantActivity,
    activeBusinessId && entitlements && !advancedReportsGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip'
  );

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

  const dailyStamps = useMemo(() => {
    const rawDaily = basicAnalytics?.daily ?? [];
    const fallback = WEEKDAY_LABELS.map(() => 0);
    if (!rawDaily.length) {
      return fallback;
    }
    return rawDaily
      .slice(-WEEKDAY_LABELS.length)
      .map((day) => day.stamps)
      .concat(fallback)
      .slice(0, WEEKDAY_LABELS.length);
  }, [basicAnalytics]);

  const chartHeights = useMemo(() => {
    const maxValue = Math.max(...dailyStamps, 0);
    if (maxValue === 0) {
      return dailyStamps.map(() => 8);
    }
    return dailyStamps.map((value) =>
      Math.max(12, Math.round((value / maxValue) * 120))
    );
  }, [dailyStamps]);

  const growthPercent =
    advancedAnalytics?.growthPercent ??
    calculateGrowthFromWeekly(basicAnalytics?.weekly);

  return (
    <SafeAreaView className="flex-1 bg-[#F6F7FB]" edges={[]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 12,
          paddingBottom: (insets.bottom || 0) + 30,
        }}
      >
        <BusinessScreenHeader
          title="דוחות"
          subtitle="פעילות העסק, מגמות שימוש וצמיחה"
          titleAccessory={
            <TouchableOpacity
              onPress={() =>
                router.replace('/(authenticated)/(business)/dashboard')
              }
              className="h-10 w-10 items-center justify-center rounded-full border border-[#E5EAF2] bg-white"
            >
              <Ionicons name="arrow-forward" size={18} color="#1A2B4A" />
            </TouchableOpacity>
          }
        />

        <View
          className={`mt-4 rounded-full border border-[#D6E2F8] bg-[#EEF3FF] p-1 ${tw.flexRow} gap-1`}
        >
          {TOP_TABS.map((topTab) => {
            const isActive = activeTopTab === topTab.key;
            return (
              <TouchableOpacity
                key={topTab.key}
                onPress={() => {
                  if (topTab.key === 'customers') {
                    router.replace({
                      pathname: '/(authenticated)/(business)/customers',
                      params: { tab: 'customers' },
                    });
                    return;
                  }
                  router.replace('/(authenticated)/(business)/analytics');
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

        <View className="mt-5 rounded-3xl border border-[#E5EAF2] bg-white p-5">
          <View className={`${tw.flexRow} items-center justify-between`}>
            <Text
              className={`text-2xl font-black text-[#15233A] ${tw.textStart}`}
            >
              ניקובים השבוע
            </Text>
            <View className="rounded-full border border-[#CFE0FF] bg-[#F1F6FF] px-3 py-1">
              <Text className="text-[11px] font-bold text-[#2F6BFF]">
                סה״כ {formatNumber(basicAnalytics?.totals.stamps ?? 0)}
              </Text>
            </View>
          </View>

          <View className="mt-4 h-[180px] rounded-[22px] border border-[#EEF2F8] bg-[#FCFDFF] px-3 py-4">
            {basicAnalytics === undefined ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator color="#2F6BFF" />
              </View>
            ) : (
              <View className="flex-1">
                <View
                  className={`${tw.flexRow} h-[130px] items-end justify-between gap-2`}
                >
                  {WEEKDAY_LABELS.map((dayLabel, index) => (
                    <View
                      key={dayLabel}
                      className="flex-1 items-center justify-end"
                    >
                      <View
                        className="w-[8px] rounded-full bg-[#2F6BFF]"
                        style={{
                          height: chartHeights[index],
                          opacity: dailyStamps[index] > 0 ? 1 : 0.2,
                        }}
                      />
                    </View>
                  ))}
                </View>
                <View className={`${tw.flexRow} mt-4 justify-between`}>
                  {WEEKDAY_LABELS.map((dayLabel) => (
                    <Text
                      key={`${dayLabel}-label`}
                      className="flex-1 text-center text-[11px] font-semibold text-[#A0AABA]"
                    >
                      {dayLabel}
                    </Text>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>

        <View className={`${tw.flexRow} mt-5 gap-3`}>
          <View className="flex-1 rounded-3xl border border-[#E5EAF2] bg-white p-4">
            <Text className="text-right text-xs font-semibold text-[#64748B]">
              מימושים השבוע
            </Text>
            <Text className="mt-1 text-right text-3xl font-black text-[#0F294B]">
              {formatNumber(basicAnalytics?.totals.redemptions ?? 0)}
            </Text>
          </View>
          <View className="flex-1 rounded-3xl border border-[#E5EAF2] bg-white p-4">
            <Text className="text-right text-xs font-semibold text-[#64748B]">
              לקוחות פעילים השבוע
            </Text>
            <Text className="mt-1 text-right text-3xl font-black text-[#0F294B]">
              {formatNumber(basicAnalytics?.totals.uniqueCustomers ?? 0)}
            </Text>
          </View>
        </View>

        <View className="mt-5">
          <FeatureGate
            isLocked={advancedReportsGate.isLocked}
            requiredPlan={advancedReportsGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'advancedReports',
                advancedReportsGate.requiredPlan,
                advancedReportsGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title={advancedReportsCopy.lockedTitle}
            subtitle={advancedReportsCopy.lockedSubtitle}
            benefits={advancedReportsCopy.benefits}
          >
            <View className="rounded-3xl border border-[#E5EAF2] bg-white p-5">
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text
                  className={`text-lg font-black text-[#15233A] ${tw.textStart}`}
                >
                  צמיחה תקופתית
                </Text>
                <View className="rounded-full bg-[#EAF8F2] px-3 py-1">
                  <Text className="text-sm font-bold text-[#0EAD69]">
                    {advancedReportsGate.isLocked
                      ? '--'
                      : formatGrowth(growthPercent)}
                  </Text>
                </View>
              </View>
              <Text className={`mt-3 text-sm text-[#64748B] ${tw.textStart}`}>
                {advancedReportsGate.isLocked
                  ? 'שדרוג ל-Pro AI יפתח דוחות מתקדמים והשוואה בין תקופות.'
                  : 'האחוז מחושב על בסיס השוואת הניקובים של השבוע האחרון מול השבוע שקדם לו.'}
              </Text>
            </View>
          </FeatureGate>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
