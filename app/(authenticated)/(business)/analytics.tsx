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
import { SafeAreaView } from 'react-native-safe-area-context';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  canAccessAdvancedFeatures,
  SUBSCRIPTION_PLAN_LABELS,
} from '@/lib/domain/subscriptions';
import { tw } from '@/lib/rtl';

const DAY_MS = 24 * 60 * 60 * 1000;

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

const formatDayLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('he-IL', { weekday: 'short' });

const formatWeekLabel = (timestamp: number) => {
  const start = new Date(timestamp);
  const end = new Date(timestamp + 6 * DAY_MS);
  const startLabel = start.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: 'short',
  });
  const endLabel = end.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: 'short',
  });
  return `${startLabel} – ${endLabel}`;
};

export default function BusinessAnalyticsScreen() {
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode =
    (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const { subscriptionPlan } = useRevenueCat();
  const showAnalytics = canAccessAdvancedFeatures(subscriptionPlan);
  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const [selectedBusinessId, setSelectedBusinessId] =
    useState<Id<'businesses'> | null>(null);

  useEffect(() => {
    setSelectedBusinessId((current) => {
      const list = businesses ?? [];
      if (!list.length) {
        return null;
      }
      if (current && list.some((business) => business.businessId === current)) {
        return current;
      }
      return list[0].businessId;
    });
  }, [businesses]);

  useEffect(() => {
    if (isPreviewMode) return;
    if (isAppModeLoading) return;
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const analyticsArgs = selectedBusinessId
    ? { businessId: selectedBusinessId }
    : 'skip';
  const analytics = useQuery(api.analytics.getBusinessActivity, analyticsArgs);
  const daily = analytics?.daily ?? [];
  const weekly = analytics?.weekly ?? [];
  const totals = analytics?.totals;
  const isLoadingData = !!selectedBusinessId && analytics === undefined;

  const dailyBarMax = useMemo(() => {
    if (!daily.length) return 1;
    return Math.max(
      1,
      ...daily.map((period) => Math.max(period.stamps, period.redemptions))
    );
  }, [daily]);

  const weeklyBarMax = useMemo(() => {
    if (!weekly.length) return 1;
    return Math.max(
      1,
      ...weekly.map((period) => Math.max(period.stamps, period.redemptions))
    );
  }, [weekly]);

  if (!showAnalytics) {
    return (
      <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-3xl font-bold text-white mb-3 text-center">
            Analytics requires Pro or Unlimited
          </Text>
          <Text className="text-sm text-zinc-400 text-center mb-6">
            התכנית שלך ({SUBSCRIPTION_PLAN_LABELS[subscriptionPlan]}) לא כוללת
            את הפיצ'ר הזה.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/(auth)/paywall')}
            className="rounded-xl bg-[#4fc3f7] px-6 py-3"
          >
            <Text className="text-[#0a0a0a] font-bold">שדרג עכשיו</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const summaryCards = [
    {
      id: 'weekly-stamps',
      label: 'ניקובים בשבוע האחרון',
      value: formatNumber(totals?.stamps ?? 0),
      helper: `לקוחות פעילים: ${formatNumber(totals?.uniqueCustomers ?? 0)}`,
      accent: 'border-emerald-500 bg-emerald-500/10 text-emerald-300',
    },
    {
      id: 'weekly-redemptions',
      label: 'הטבות מומשו בשבוע האחרון',
      value: formatNumber(totals?.redemptions ?? 0),
      helper: 'שמור על הלקוחות המחוברים שלך',
      accent: 'border-amber-500 bg-amber-500/10 text-amber-300',
    },
    {
      id: 'today-stamps',
      label: 'ניקובים היום',
      value: formatNumber(daily.at(-1)?.stamps ?? 0),
      helper: `היום (${new Date().toLocaleDateString('he-IL', { day: '2-digit', month: 'short' })})`,
      accent: 'border-blue-500 bg-blue-500/10 text-blue-300',
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView className="flex-1">
        <View className="max-w-3xl w-full mx-auto px-6 py-8 space-y-6">
          <Text className={`text-4xl font-bold text-white ${tw.textStart}`}>
            Analytics
          </Text>
          <Text className={`text-sm text-zinc-400 ${tw.textStart}`}>
            מעקב לביצועים וניהול הלקוחות העסקיים שלך.
          </Text>

          {businesses.length > 0 && (
            <View className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 space-y-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.4em] text-zinc-500 ${tw.textStart}`}
              >
                בחר עסק
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {businesses.map((business) => {
                  const isActive = business.businessId === selectedBusinessId;
                  return (
                    <TouchableOpacity
                      key={business.businessId}
                      onPress={() => setSelectedBusinessId(business.businessId)}
                      className={`px-4 py-2 rounded-2xl border ${
                        isActive
                          ? 'border-cyan-500 bg-cyan-600/20'
                          : 'border-zinc-800 bg-zinc-900'
                      }`}
                    >
                      <Text className="text-sm font-semibold text-white">
                        {business.name}
                      </Text>
                      <Text className="text-[11px] text-zinc-500">
                        {business.externalId}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <View className="grid gap-3">
            {summaryCards.map((card) => (
              <View
                key={card.id}
                className={`rounded-2xl border ${card.accent} p-4 bg-zinc-950`}
              >
                <Text className="text-2xl font-bold text-white">
                  {card.value}
                </Text>
                <Text className="text-xs uppercase tracking-[0.3em] text-zinc-400 mt-1">
                  {card.label}
                </Text>
                <Text className="text-[11px] text-zinc-500 mt-1">
                  {card.helper}
                </Text>
              </View>
            ))}
          </View>

          {isLoadingData && (
            <View className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 flex-row items-center justify-center gap-2">
              <ActivityIndicator color="#4fc3f7" />
              <Text className="text-xs text-zinc-400">טוען נתונים...</Text>
            </View>
          )}

          <View className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
            <Text className={`text-lg font-bold text-white ${tw.textStart}`}>
              גרף יומי
            </Text>
            {daily.length === 0 ? (
              <Text className="text-xs text-zinc-500">
                אין עדיין נתונים להצגה.
              </Text>
            ) : (
              daily.map((period) => (
                <View key={period.start} className="space-y-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm text-zinc-400">
                      {formatDayLabel(period.start)}
                    </Text>
                    <Text className="text-xs text-zinc-500">
                      {formatNumber(period.stamps)} ניקובים •{' '}
                      {formatNumber(period.redemptions)} הטבות
                    </Text>
                  </View>
                  <View className="space-y-1">
                    <View className="h-2 rounded-full bg-zinc-900 overflow-hidden">
                      <View
                        className="h-full bg-emerald-400"
                        style={{
                          width: `${Math.min((period.stamps / dailyBarMax) * 100, 100)}%`,
                        }}
                      />
                    </View>
                    <View className="h-2 rounded-full bg-zinc-900 overflow-hidden">
                      <View
                        className="h-full bg-amber-400"
                        style={{
                          width: `${Math.min((period.redemptions / dailyBarMax) * 100, 100)}%`,
                        }}
                      />
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          <View className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
            <Text className={`text-lg font-bold text-white ${tw.textStart}`}>
              גרף שבועי
            </Text>
            {weekly.length === 0 ? (
              <Text className="text-xs text-zinc-500">
                הנתונים עדיין נטענים.
              </Text>
            ) : (
              weekly.map((period) => (
                <View key={period.start} className="space-y-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm text-zinc-400">
                      {formatWeekLabel(period.start)}
                    </Text>
                    <Text className="text-xs text-zinc-500">
                      {formatNumber(period.uniqueCustomers)} לקוחות •{' '}
                      {formatNumber(period.stamps)} ניקובים
                    </Text>
                  </View>
                  <View className="space-y-1">
                    <View className="h-2 rounded-full bg-zinc-900 overflow-hidden">
                      <View
                        className="h-full bg-blue-400"
                        style={{
                          width: `${Math.min((period.stamps / weeklyBarMax) * 100, 100)}%`,
                        }}
                      />
                    </View>
                    <View className="h-2 rounded-full bg-zinc-900 overflow-hidden">
                      <View
                        className="h-full bg-violet-400"
                        style={{
                          width: `${Math.min((period.redemptions / weeklyBarMax) * 100, 100)}%`,
                        }}
                      />
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
