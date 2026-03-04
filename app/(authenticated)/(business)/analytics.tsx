import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { LockedFeatureWrapper } from '@/components/subscription/LockedFeatureWrapper';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useEntitlements } from '@/hooks/useEntitlements';
import { tw } from '@/lib/rtl';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

function formatGrowth(value: number) {
  if (!Number.isFinite(value)) {
    return '+0%';
  }
  return `${value > 0 ? '+' : ''}${Math.round(value)}%`;
}

export default function BusinessAnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();

  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const [selectedBusinessId, setSelectedBusinessId] =
    useState<Id<'businesses'> | null>(null);

  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'unlimited'>('pro');
  const [upgradeReason, setUpgradeReason] = useState<
    'feature_locked' | 'limit_reached' | 'subscription_inactive'
  >('feature_locked');
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<string | undefined>(
    undefined
  );

  useEffect(() => {
    setSelectedBusinessId((current) => {
      if (!businesses.length) {
        return null;
      }
      if (current && businesses.some((business) => business.businessId === current)) {
        return current;
      }
      return businesses[0].businessId;
    });
  }, [businesses]);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const { entitlements, gate } = useEntitlements(selectedBusinessId);
  const advancedReportsGate = gate('canSeeAdvancedReports');
  const smartAnalyticsGate = gate('canUseSmartAnalytics');

  const openUpgrade = (
    featureKey: string,
    requiredPlan: 'starter' | 'pro' | 'unlimited' | null,
    reason: 'feature_locked' | 'limit_reached' | 'subscription_inactive' = 'feature_locked'
  ) => {
    setUpgradeFeatureKey(featureKey);
    setUpgradeReason(reason);
    setUpgradePlan(requiredPlan === 'unlimited' ? 'unlimited' : 'pro');
    setIsUpgradeVisible(true);
  };

  const basicAnalytics = useQuery(
    api.analytics.getBusinessActivity,
    selectedBusinessId ? { businessId: selectedBusinessId } : 'skip'
  );

  const advancedAnalytics = useQuery(
    api.analytics.getMerchantActivity,
    selectedBusinessId && entitlements && !advancedReportsGate.isLocked
      ? { businessId: selectedBusinessId }
      : 'skip'
  );

  const smartCustomersData = useQuery(
    api.events.getMerchantCustomers,
    selectedBusinessId && entitlements && !smartAnalyticsGate.isLocked
      ? { businessId: selectedBusinessId }
      : 'skip'
  );

  const recentActivity = useQuery(
    api.events.getRecentActivity,
    selectedBusinessId ? { businessId: selectedBusinessId, limit: 5 } : 'skip'
  );

  const selectedBusinessName =
    businesses.find((business) => business.businessId === selectedBusinessId)?.name ??
    'עסק';
  const isLoadingBasic = selectedBusinessId !== null && basicAnalytics === undefined;

  const basicStats = useMemo(
    () => [
      {
        id: 'stamps',
        label: 'ניקובים השבוע',
        value: formatNumber(basicAnalytics?.totals.stamps ?? 0),
      },
      {
        id: 'redemptions',
        label: 'מימושים השבוע',
        value: formatNumber(basicAnalytics?.totals.redemptions ?? 0),
      },
      {
        id: 'customers',
        label: 'לקוחות פעילים',
        value: formatNumber(basicAnalytics?.totals.uniqueCustomers ?? 0),
      },
    ],
    [basicAnalytics]
  );

  const riskCount = smartCustomersData?.riskCount ?? 0;
  const newCustomersLastWeek = smartCustomersData?.newCustomersLastWeek ?? 0;
  const recommendationText =
    riskCount > 0
      ? `זוהו ${riskCount} לקוחות בסיכון. מומלץ לשלוח קמפיין חזרה ממוקד.`
      : 'אין כרגע לקוחות בסיכון גבוה. המשיכו לשמור על רצף פעילות.';

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 12,
          paddingBottom: (insets.bottom || 0) + 30,
        }}
      >
        <BusinessScreenHeader
          title="דוחות ואנליטיקה"
          subtitle={selectedBusinessName}
          titleAccessory={
            <TouchableOpacity
              onPress={() => router.replace('/(authenticated)/(business)/dashboard')}
              className="h-10 w-10 items-center justify-center rounded-full bg-white"
            >
              <Text className="text-lg text-[#1A2B4A]">←</Text>
            </TouchableOpacity>
          }
        />

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
          <Text className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}>
            עסק נבחר
          </Text>
          <View className={`${tw.flexRow} flex-wrap gap-2`}>
            {businesses.map((business) => {
              const isActive = business.businessId === selectedBusinessId;
              return (
                <TouchableOpacity
                  key={business.businessId}
                  onPress={() => setSelectedBusinessId(business.businessId)}
                  className={`rounded-2xl border px-4 py-2 ${
                    isActive
                      ? 'border-[#A9C7FF] bg-[#E7F0FF]'
                      : 'border-[#E3E9FF] bg-[#F6F8FC]'
                  }`}
                >
                  <Text className="text-right text-sm font-semibold text-[#1A2B4A]">
                    {business.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {!advancedReportsGate.isLocked || !smartAnalyticsGate.isLocked ? null : (
            <TouchableOpacity
              onPress={() =>
                openUpgrade('canSeeAdvancedReports', advancedReportsGate.requiredPlan)
              }
              className="self-end rounded-xl border border-[#2F6BFF] bg-[#EEF3FF] px-4 py-2"
            >
              <Text className="text-sm font-bold text-[#2F6BFF]">שדרגו לאנליטיקה מתקדמת</Text>
            </TouchableOpacity>
          )}
        </View>

        <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}>
            נתונים בסיסיים
          </Text>
          {isLoadingBasic ? (
            <View className="mt-4 items-center justify-center py-6">
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : (
            <View className={`${tw.flexRow} mt-4 flex-wrap gap-3`}>
              {basicStats.map((stat) => (
                <View
                  key={stat.id}
                  className="w-[31%] min-w-[100px] rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-3 py-3"
                >
                  <Text className="text-right text-xs font-semibold text-[#64748B]">
                    {stat.label}
                  </Text>
                  <Text className="mt-1 text-right text-lg font-black text-[#1A2B4A]">
                    {stat.value}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View className="mt-5">
          <LockedFeatureWrapper
            isLocked={advancedReportsGate.isLocked}
            requiredPlan={advancedReportsGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'canSeeAdvancedReports',
                advancedReportsGate.requiredPlan,
                advancedReportsGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title="דוחות מתקדמים נעולים"
            subtitle="מדדי צמיחה והשוואות תקופתיות זמינים במסלול Pro ומעלה."
          >
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}>
                דוחות מתקדמים
              </Text>
              <View className={`${tw.flexRow} gap-3`}>
                <View className="flex-1 rounded-2xl border border-[#DCE6F7] bg-[#F8FAFF] px-4 py-3">
                  <Text className="text-right text-xs font-semibold text-[#64748B]">
                    צמיחת ניקובים
                  </Text>
                  <Text className="mt-1 text-right text-xl font-black text-[#1A2B4A]">
                    {advancedReportsGate.isLocked
                      ? '--'
                      : formatGrowth(advancedAnalytics?.growthPercent ?? 0)}
                  </Text>
                </View>
                <View className="flex-1 rounded-2xl border border-[#DCE6F7] bg-[#F8FAFF] px-4 py-3">
                  <Text className="text-right text-xs font-semibold text-[#64748B]">
                    שבוע אחרון
                  </Text>
                  <Text className="mt-1 text-right text-xl font-black text-[#1A2B4A]">
                    {advancedReportsGate.isLocked
                      ? '--'
                      : formatNumber(advancedAnalytics?.weekly.at(-1)?.stamps ?? 0)}
                  </Text>
                </View>
              </View>
            </View>
          </LockedFeatureWrapper>
        </View>

        <View className="mt-5">
          <LockedFeatureWrapper
            isLocked={smartAnalyticsGate.isLocked}
            requiredPlan={smartAnalyticsGate.requiredPlan}
            onUpgradeClick={() =>
              openUpgrade(
                'canUseSmartAnalytics',
                smartAnalyticsGate.requiredPlan,
                smartAnalyticsGate.reason === 'subscription_inactive'
                  ? 'subscription_inactive'
                  : 'feature_locked'
              )
            }
            title="Smart Analytics נעול"
            subtitle="רשימת לקוחות בסיכון והמלצות שימור זמינות במסלול Pro ומעלה."
            benefits={[
              'איתור לקוחות בסיכון נטישה',
              'המלצות שימור אוטומטיות',
              'פילוח לקוחות מתקדם',
            ]}
          >
            <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}>
                Smart Analytics
              </Text>
              <View className="rounded-2xl border border-[#DCE6F7] bg-[#F8FAFF] px-4 py-3">
                <Text className="text-right text-xs font-semibold text-[#64748B]">
                  לקוחות בסיכון
                </Text>
                <Text className="mt-1 text-right text-xl font-black text-[#1A2B4A]">
                  {smartAnalyticsGate.isLocked ? '--' : formatNumber(riskCount)}
                </Text>
              </View>
              <View className="rounded-2xl border border-[#DCE6F7] bg-[#F8FAFF] px-4 py-3">
                <Text className="text-right text-xs font-semibold text-[#64748B]">
                  לקוחות חדשים השבוע
                </Text>
                <Text className="mt-1 text-right text-xl font-black text-[#1A2B4A]">
                  {smartAnalyticsGate.isLocked
                    ? '--'
                    : formatNumber(newCustomersLastWeek)}
                </Text>
              </View>
              <View className="rounded-2xl border border-[#DCE6F7] bg-[#F8FAFF] px-4 py-3">
                <Text className={`text-sm font-semibold text-[#334155] ${tw.textStart}`}>
                  {smartAnalyticsGate.isLocked
                    ? 'שדרוג למסלול Pro יפתח המלצות שימור לקוחות בזמן אמת.'
                    : recommendationText}
                </Text>
              </View>
            </View>
          </LockedFeatureWrapper>
        </View>

        <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
          <Text className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}>
            פעילות אחרונה
          </Text>
          {(recentActivity ?? []).length === 0 ? (
            <Text className={`text-sm text-[#7B86A0] ${tw.textStart}`}>
              עדיין אין פעילות להצגה.
            </Text>
          ) : (
            (recentActivity ?? []).map((activity) => (
              <View
                key={activity.id}
                className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3"
              >
                <View className={`${tw.flexRow} items-center justify-between`}>
                  <View className="items-end">
                    <Text className={`text-sm font-bold text-[#1A2B4A] ${tw.textStart}`}>
                      {activity.customer}
                    </Text>
                    <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                      {activity.detail}
                    </Text>
                  </View>
                  <Text className="text-xs font-semibold text-[#64748B]">{activity.time}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <UpgradeModal
        visible={isUpgradeVisible}
        businessId={selectedBusinessId}
        initialPlan={upgradePlan}
        reason={upgradeReason}
        featureKey={upgradeFeatureKey}
        onClose={() => setIsUpgradeVisible(false)}
      />
    </SafeAreaView>
  );
}
