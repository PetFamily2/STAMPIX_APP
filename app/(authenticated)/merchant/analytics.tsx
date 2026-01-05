import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery } from 'convex/react';

import { Card, ListRow, PrimaryButton, SectionHeader, StatCard } from '@/components/ui';
import { api } from '@/convex/_generated/api';
import { tw } from '@/lib/rtl';

const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const DAY_MS = 24 * 60 * 60 * 1000;

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

const formatRelativeDate = (timestamp: number | null) => {
  if (!timestamp) {
    return 'לא ביקר עדיין';
  }
  const daysAgo = Math.floor((Date.now() - timestamp) / DAY_MS);
  if (daysAgo === 0) return 'היום';
  if (daysAgo === 1) return 'אתמול';
  if (daysAgo < 7) return `לפני ${daysAgo} ימים`;
  const weeksAgo = Math.floor(daysAgo / 7);
  if (weeksAgo < 4) {
    return weeksAgo === 1 ? 'לפני שבוע' : `לפני ${weeksAgo} שבועות`;
  }
  const monthsAgo = Math.floor(daysAgo / 30);
  if (monthsAgo <= 1) return 'לפני חודש';
  return `לפני ${monthsAgo} חודשים`;
};

const describeGrowth = (percent: number) => `${percent >= 0 ? '+' : ''}${percent}% בהשוואה לשבוע שעבר`;

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  punches: number;
  max: number;
  lastVisit: string;
  lastVisitAt: number;
  isRisk: boolean;
  isVip: boolean;
};

export default function MerchantAnalyticsScreen() {
  const [activeTab, setActiveTab] = useState<'overview' | 'customers'>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const businessId = businesses[0]?.businessId ?? null;
  const analytics = useQuery(
    api.analytics.getMerchantActivity,
    businessId ? { businessId } : 'skip',
  );
  const customerData = useQuery(
    api.events.getMerchantCustomers,
    businessId ? { businessId } : 'skip',
  );

  const customers: CustomerRow[] = (customerData?.customers ?? []).map((customer) => ({
    id: String(customer.membershipId),
    name: customer.name,
    phone: customer.phone ?? '',
    punches: customer.currentStamps,
    max: customer.maxStamps,
    lastVisitAt: customer.lastVisitAt,
    lastVisit: formatRelativeDate(customer.lastVisitAt),
    isRisk: customer.isRisk,
    isVip: customer.isVip,
  }));

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) {
      return customers;
    }
    const normalizedQuery = searchQuery.trim();
    return customers.filter((customer) =>
      customer.name.includes(normalizedQuery) || customer.phone.includes(normalizedQuery),
    );
  }, [searchQuery, customers]);

  const riskCount = customerData?.riskCount ?? 0;
  const growthPercent = analytics?.growthPercent ?? 0;

  const metrics = [
    {
      id: 'weekly-stamps',
      value: formatNumber(analytics?.totals?.stamps ?? 0),
      label: 'ניקובים השבוע',
      icon: 'verified',
      accent: 'bg-blue-50',
    },
    {
      id: 'growth',
      value: describeGrowth(growthPercent),
      label: 'צמיחה מחודש שעבר',
      icon: 'trending_up',
      accent: 'bg-emerald-50',
    },
    {
      id: 'risk',
      value: formatNumber(riskCount),
      label: 'לקוחות בסיכון',
      icon: 'warning',
      accent: 'bg-amber-50',
    },
  ];

  const insights = [
    {
      id: 'risk',
      title: 'לקוחות בסיכון',
      subtitle:
        riskCount > 0
          ? `${riskCount} לקוחות לא ביקרו מעל שבוע`
          : 'אין לקוחות בסיכון בשבוע האחרון',
      icon: 'warning',
    },
    {
      id: 'growth',
      title: 'צמיחה חודשית',
      subtitle: describeGrowth(growthPercent),
      icon: 'trending_up',
    },
  ];

  const dailyActivity = analytics?.daily ?? [];
  const graphData = DAYS.map((_, index) => dailyActivity[index] ?? {
    start: 0,
    stamps: 0,
    redemptions: 0,
    uniqueCustomers: 0,
  });
  const maxWeekly = Math.max(
    1,
    ...graphData.map((period) => Math.max(period.stamps, period.redemptions)),
  );

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }} className="flex-1 bg-slate-50">
      <View className="px-5 pt-6 pb-8">
        <SectionHeader
          title="מרכז ניהול ואנליטיקה"
          description="תובנות מהירות על העסק שלך"
          action={
            <TouchableOpacity className="px-3 py-1 rounded-xl bg-white/60">
              <Text className="text-xs font-bold text-blue-600">חזור</Text>
            </TouchableOpacity>
          }
        />

        <View className={`${tw.flexRow} gap-3 mt-4 rounded-2xl bg-white p-1`}>
          {(['overview', 'customers'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              className={`flex-1 rounded-xl py-2.5 items-center ${activeTab === tab ? 'bg-blue-600 shadow-sm' : ''}`}
              onPress={() => setActiveTab(tab)}
            >
              <Text className={`text-sm font-black ${activeTab === tab ? 'text-white' : 'text-gray-400'}`}>
                {tab === 'overview' ? 'סקירה כללית' : 'ניהול לקוחות'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'overview' ? (
          <View className="mt-6 space-y-6">
            <View className={`${tw.flexRow} gap-4`}>
              {metrics.map((metric) => (
                <StatCard
                  key={metric.id}
                  value={metric.value}
                  label={metric.label}
                  icon={metric.icon}
                  accent={metric.accent as string}
                />
              ))}
            </View>

            <View className="bg-white rounded-[26px] border border-gray-100 p-4 shadow-sm">
              <Text className="text-sm font-black text-text-main mb-2">ניקובים השבוע</Text>
              <View className={`mt-3 ${tw.flexRow} items-end gap-2 h-32`}>
                {graphData.map((value, index) => {
                  const heightPercent = (value.stamps / maxWeekly) * 100;
                  return (
                    <View key={index} className="flex-1 items-center">
                      <View
                        className={`w-full rounded-t-xl ${index === 4 ? 'bg-blue-600' : 'bg-blue-200'}`}
                        style={{ height: `${heightPercent}%` }}
                      />
                      <Text className="text-[10px] font-black text-gray-400 mt-2">{DAYS[index]}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View className="space-y-3">
              {insights.map((insight) => (
                <ListRow
                  key={insight.id}
                  title={insight.title}
                  subtitle={insight.subtitle}
                  leading={
                    <View className="h-10 w-10 rounded-2xl bg-gray-100 items-center justify-center">
                      <Text className="text-blue-600 text-xl">{insight.icon}</Text>
                    </View>
                  }
                />
              ))}
            </View>
          </View>
        ) : (
          <View className="mt-6 space-y-5">
            <TextInput
              placeholder="חפש לקוח לפי שם או טלפון..."
              placeholderTextColor="#94a3b8"
              className="h-12 rounded-2xl bg-white px-4 text-sm font-medium border border-gray-100"
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{ textAlign: 'right' }}
            />

            <View>
              <Text className="text-sm font-black text-text-main mb-2">
                כל הלקוחות ({filteredCustomers.length})
              </Text>

              <View className="space-y-3">
                {filteredCustomers.map((customer) => {
                  const progress = Math.min(1, customer.punches / customer.max);
                  return (
                    <Card
                      key={customer.id}
                      className={`p-4 border ${customer.isRisk ? 'border-amber-100 bg-amber-50/50' : 'border-gray-100 bg-white'}`}
                    >
                      <View className={`${tw.flexRow} items-center justify-between`}>
                        <View className={`${tw.flexRow} items-center gap-3`}>
                          <View className={`h-12 w-12 rounded-2xl items-center justify-center ${customer.isRisk ? 'bg-amber-100 text-amber-500' : 'bg-blue-50'}`}>
                            <Text className="text-xl font-black text-blue-600">👤</Text>
                          </View>
                          <View>
                            <Text className="text-base font-bold text-text-main">{customer.name}</Text>
                            <Text className="text-[11px] font-bold text-gray-400">{customer.phone}</Text>
                          </View>
                        </View>
                        <Text className="text-[10px] font-bold text-gray-400">{customer.lastVisit}</Text>
                      </View>
                      <View className="mt-3">
                        <View className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                          <View className="h-full bg-blue-600" style={{ width: `${progress * 100}%` }} />
                        </View>
                        <Text className="text-[10px] font-bold text-gray-400 mt-1">
                          {customer.punches} / {customer.max} ניקובים
                        </Text>
                      </View>
                    </Card>
                  );
                })}
              </View>
            </View>

            <PrimaryButton title="צור הודעת שימור חמה" className="mt-2" />
          </View>
        )}
      </View>
    </ScrollView>
  );
}
