import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Card,
  ListRow,
  PrimaryButton,
  SectionHeader,
  StatCard,
} from '@/components/ui';
import { useAppMode } from '@/contexts/AppModeContext';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  canAccessAdvancedFeatures,
  SUBSCRIPTION_PLAN_LABELS,
} from '@/lib/domain/subscriptions';
import { tw } from '@/lib/rtl';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

type Activity = {
  id: string;
  customer: string;
  type: 'punch' | 'reward';
  time: string;
};

const ACTION_CARDS = [
  {
    id: 'card-settings',
    title: 'הגדרות כרטיס והטבות',
    subtitle: 'ערוך פרסים, ניקובים ומיתוג',
    icon: '📝',
  },
  {
    id: 'team',
    title: 'ניהול צוות עובדים',
    subtitle: 'הרשאות, משמרות וניטור פעילות',
    icon: '🛡️',
  },
];

const ACTIVITY_FEED: Activity[] = [
  { id: '1', customer: 'ישראל ישראלי', type: 'punch', time: '10:42' },
  { id: '2', customer: 'מיכל לוי', type: 'reward', time: '09:15' },
  { id: '3', customer: 'דני כהן', type: 'punch', time: '08:50' },
];

export default function MerchantDashboardScreen() {
  const router = useRouter();
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const { subscriptionPlan } = useRevenueCat();
  const { user } = useUser();
  const hasAccess = canAccessAdvancedFeatures(subscriptionPlan);
  const planLabel = SUBSCRIPTION_PLAN_LABELS[subscriptionPlan];
  const upgradeToPro = () => router.push('/(auth)/paywall');
  const isOwner = user?.role === 'merchant';

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
    if (isAppModeLoading) return;
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, router]);

  const analyticsArgs = selectedBusinessId
    ? { businessId: selectedBusinessId }
    : 'skip';
  const analytics = useQuery(api.analytics.getBusinessActivity, analyticsArgs);
  const today = analytics?.daily?.at(-1);
  const weeklyUnique = analytics?.totals?.uniqueCustomers ?? 0;
  const weeklyRedemptions = analytics?.totals?.redemptions ?? 0;
  const isAnalyticsLoading = !!selectedBusinessId && analytics === undefined;

  const kpiCards = [
    {
      id: 'punches',
      label: 'ניקובים היום',
      value: formatNumber(today?.stamps ?? 0),
      accent: 'bg-blue-50',
      icon: '✔️',
    },
    {
      id: 'new-customers',
      label: 'לקוחות פעילים השבוע',
      value: formatNumber(weeklyUnique),
      accent: 'bg-emerald-50',
      icon: '➕',
    },
    {
      id: 'redemptions',
      label: 'הטבות השבוע',
      value: formatNumber(weeklyRedemptions),
      accent: 'bg-orange-50',
      icon: '🎁',
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        className="flex-1"
      >
        <View className="px-5 pt-4 pb-6 border-b border-gray-200">
          <View className={`flex-row items-center justify-between`}>
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 rounded-full bg-gray-200" />
              <Text className={`text-lg text-gray-500 ${tw.textStart}`}>
                שלום, קפה ארומה 👋
              </Text>
            </View>
            <View className="h-12 w-12 rounded-full bg-gray-100 items-center justify-center">
              <Text className="text-2xl text-gray-500">👤</Text>
            </View>
          </View>
          <Text className={`text-sm text-gray-500 mt-1 ${tw.textStart}`}>
            כאן סקירה מהירה של הפעילות היומית בעסק
          </Text>
        </View>

        <View className="px-5 mt-3 space-y-3">
          {businesses.length > 0 ? (
            <Card className="rounded-2xl border border-gray-200 bg-white/5 p-4 space-y-2">
              <Text
                className={`text-[10px] uppercase tracking-[0.4em] text-zinc-500 ${tw.textStart}`}
              >
                עסק נבחר
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
                          ? 'border-cyan-500 bg-cyan-600/10'
                          : 'border-zinc-200 bg-white'
                      }`}
                    >
                      <Text className="text-sm font-semibold text-gray-800">
                        {business.name}
                      </Text>
                      <Text className="text-[11px] text-zinc-500">
                        {business.externalId}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>
          ) : (
            <Card className="rounded-2xl border border-gray-200 bg-white/5 p-4">
              <TouchableOpacity
                onPress={() => router.push('/merchant/onboarding')}
                className="mt-3 rounded-xl border border-blue-500 px-4 py-2 bg-blue-50 self-start"
              >
                <Text className="text-sm font-semibold text-blue-600">
                  ???? ???
                </Text>
              </TouchableOpacity>
              <Text className="text-xs text-zinc-500">
                אין עסקים פעילים כרגע.
              </Text>
            </Card>
          )}

          <Card className="rounded-2xl border border-zinc-200 bg-white p-4 flex-row items-center justify-between">
            <View>
              <Text className="text-[11px] text-zinc-500">תוכנית נוכחית</Text>
              <Text className="text-lg font-bold text-zinc-900">
                {planLabel}
              </Text>
            </View>
            {!hasAccess && (
              <TouchableOpacity
                onPress={upgradeToPro}
                className="rounded-full border border-blue-500 px-4 py-2 bg-blue-50"
              >
                <Text className="text-sm font-semibold text-blue-600">
                  שדרג ל-Pro
                </Text>
              </TouchableOpacity>
            )}
          </Card>
        </View>

        <View className="px-5 py-6">
          <PrimaryButton title="סריקת לקוח" onPress={() => {}} />
        </View>

        <View className="px-5">
          <Card className="rounded-2xl border border-gray-200 bg-white/5 p-4 space-y-3">
            <Text
              className={`text-[10px] uppercase tracking-[0.4em] text-zinc-500 ${tw.textStart}`}
            >
              ?????? ???
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <TouchableOpacity
                onPress={() => router.push('/merchant/store-settings')}
                className="px-4 py-2 rounded-2xl border border-zinc-200 bg-white"
              >
                <Text className="text-sm font-semibold text-gray-800">
                  ?????? ????
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/merchant/profile-settings')}
                className="px-4 py-2 rounded-2xl border border-zinc-200 bg-white"
              >
                <Text className="text-sm font-semibold text-gray-800">
                  ???? ??? ???
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/merchant/qr')}
                className="px-4 py-2 rounded-2xl border border-zinc-200 bg-white"
              >
                <Text className="text-sm font-semibold text-gray-800">
                  QR ????
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  router.push('/(authenticated)/(business)/business/qr')
                }
                className="px-4 py-2 rounded-2xl border border-zinc-200 bg-white"
              >
                <Text className="text-sm font-semibold text-gray-800">
                  QR ???????? ??????
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>

        <View className="px-5">
          <View className="flex-row flex-wrap justify-between gap-3">
            {kpiCards.map((card) => (
              <StatCard
                key={card.id}
                value={card.value}
                label={card.label}
                icon={card.icon}
                accent={card.accent}
              />
            ))}
          </View>
        </View>

        {isAnalyticsLoading && (
          <View className="px-5 mt-3">
            <View className="rounded-2xl border border-zinc-200 bg-white/5 px-4 py-3 flex-row items-center justify-center gap-2">
              <ActivityIndicator color="#4fc3f7" />
              <Text className="text-xs text-zinc-500">
                טוען נתונים עדכניים...
              </Text>
            </View>
          </View>
        )}

        <View className="px-5 mt-6 space-y-3">
          {ACTION_CARDS.filter((action) => action.id !== 'team' || isOwner).map(
            (action) => (
              <TouchableOpacity
                key={action.id}
                onPress={() => {
                  if (action.id === 'team') {
                    router.push('/(authenticated)/(business)/business/team');
                  }
                }}
                className="bg-white rounded-[26px] border border-gray-100 px-5 py-5 flex-row items-center justify-between shadow-sm active:scale-[0.98]"
              >
                <View className="flex-row items-center gap-3">
                  <View className="h-12 w-12 rounded-2xl bg-blue-50 items-center justify-center">
                    <Text className="text-2xl">{action.icon}</Text>
                  </View>
                  <View>
                    <Text className="text-base font-bold text-text-main">
                      {action.title}
                    </Text>
                    <Text className="text-[10px] text-gray-400">
                      {action.subtitle}
                    </Text>
                  </View>
                </View>
                <Text className="text-blue-300 text-xl">›</Text>
              </TouchableOpacity>
            )
          )}
        </View>

        <View className="px-5 mt-6">
          <View className="bg-[#1a2e44] rounded-[26px] p-5 flex-row items-center justify-between space-x-4">
            <View className="h-14 w-14 rounded-[26px] bg-white/10 items-center justify-center">
              <Text className="text-3xl text-blue-200">🎬</Text>
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold text-lg">
                סרטון פרסומת ב-AI
              </Text>
              <Text className="text-blue-100 text-xs mt-1">
                צור תוכן שיווקי לעסק שלך
              </Text>
            </View>
            {hasAccess ? (
              <View className="px-4 py-2.5 rounded-xl bg-blue-600">
                <Text className="text-white font-bold text-sm">
                  תכונה מתקדמת
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={upgradeToPro}
                className="px-4 py-2.5 rounded-xl border border-blue-500 bg-transparent"
              >
                <Text className="text-blue-200 font-bold text-sm">
                  שדרג ל-Pro
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {!hasAccess && (
            <Text className="text-xs text-blue-100 mt-2">
              פונקציה זו זמינה לחבילות Pro ו-Unlimited בלבד.
            </Text>
          )}
        </View>

        <View className="px-5 mt-8">
          <SectionHeader title="פעילות אחרונה" />
          <View className="space-y-3 mt-3">
            {ACTIVITY_FEED.map((item) => (
              <ListRow
                key={item.id}
                title={item.customer}
                subtitle={
                  item.type === 'punch' ? 'קיבל/ה ניקוב 1' : 'מימש/ה הטבה 🎉'
                }
                subtitleClassName={
                  item.type === 'punch' ? 'text-gray-400' : 'text-blue-600'
                }
                leading={<View className="h-12 w-12 rounded-2xl bg-gray-100" />}
                trailing={
                  <Text className="text-[11px] font-bold text-gray-300 bg-gray-50 px-2 py-1 rounded-lg">
                    {item.time}
                  </Text>
                }
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
