import { useQuery } from 'convex/react';
import { ScrollView, Text, View } from 'react-native';

import {
  Card,
  ListRow,
  PrimaryButton,
  SectionHeader,
  StatCard,
} from '@/components/ui';
import { api } from '@/convex/_generated/api';
import { tw } from '@/lib/rtl';

const ACTIONS = [
  {
    title: 'הגדרות כרטיסיה והטבות',
    subtitle: 'ערוך פרסים, ניקובים ומיתוג',
    icon: 'edit_note',
  },
  {
    title: 'ניהול צוות עובדים',
    subtitle: 'הרשאות, משמרות וניטור',
    icon: 'badge',
  },
  {
    title: 'הפקת דוחות מהירה',
    subtitle: 'ייצוא לקוחות, כרטיסים והכנסות',
    icon: 'analytics',
  },
];

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

export default function MerchantDashboardScreen() {
  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const businessId = businesses[0]?.businessId ?? null;
  const analytics = useQuery(
    api.analytics.getMerchantActivity,
    businessId ? { businessId } : 'skip'
  );
  const customerData = useQuery(
    api.events.getMerchantCustomers,
    businessId ? { businessId } : 'skip'
  );
  const recentActivity =
    useQuery(
      api.events.getRecentActivity,
      businessId ? { businessId, limit: 5 } : 'skip'
    ) ?? [];

  const todayStamps = analytics?.daily?.at(-1)?.stamps ?? 0;
  const weeklyRedemptions = analytics?.totals?.redemptions ?? 0;
  const newCustomers = customerData?.newCustomersLastWeek ?? 0;
  const riskCount = customerData?.riskCount ?? 0;

  const statCards = [
    {
      id: 'punches',
      value: formatNumber(todayStamps),
      label: 'ניקובים היום',
      icon: 'verified',
      accent: 'bg-blue-50',
    },
    {
      id: 'new-customers',
      value: formatNumber(newCustomers),
      label: 'לקוחות חדשים',
      icon: 'person_add',
      accent: 'bg-emerald-50',
    },
    {
      id: 'rewards',
      value: formatNumber(weeklyRedemptions),
      label: 'הטבות מומשו',
      icon: 'celebration',
      accent: 'bg-orange-50',
    },
  ];

  const insightCopy =
    riskCount > 0
      ? `זיהינו ${riskCount} לקוחות שלא ביקרו מעל שבוע. שלח הודעת החזרה אחת עם הצעה חמה בטקסט שמותאם לעסק שלך.`
      : 'אין לקוחות בסיכון כרגע. המשך לשמור על קשר עם כולם.';

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 32 }}
      className="flex-1 bg-slate-50"
    >
      <View className="px-5 pt-6 pb-8">
        <SectionHeader
          title="שלום, קפה ארומה 👋"
          description="סקירה מהירה על הפעילות היומית בעסק"
          action={
            <Text className="text-xs font-bold text-blue-600">אנליטיקה</Text>
          }
        />

        <View className="mt-6">
          <PrimaryButton
            title="סריקת לקוח"
            icon={<Text className="text-white text-lg">📸</Text>}
          />
        </View>

        <View className={`${tw.flexRow} gap-4 mt-6`}>
          {statCards.map((stat) => (
            <StatCard
              key={stat.label}
              value={stat.value}
              label={stat.label}
              icon={stat.icon}
              accent={stat.accent as string}
            />
          ))}
        </View>

        <Card className="mt-6 p-5 bg-blue-600 text-white overflow-hidden">
          <View className={`${tw.flexRow} items-center justify-between`}>
            <Text className="text-white text-base font-black">תובנות AI</Text>
            <Text className="text-xs font-bold text-blue-100">חדש</Text>
          </View>
          <Text className="text-white mt-3 text-sm leading-relaxed">
            {insightCopy}
          </Text>
        </Card>

        <View className="mt-6 space-y-3">
          {ACTIONS.map((action) => (
            <ListRow
              key={action.title}
              title={action.title}
              subtitle={action.subtitle}
              leading={
                <View className="h-10 w-10 rounded-2xl bg-blue-50 items-center justify-center">
                  <Text className="text-blue-600 text-xl">{action.icon}</Text>
                </View>
              }
              trailing={
                <Text className="text-gray-300 font-bold text-xs">›</Text>
              }
            />
          ))}
        </View>

        <View className="mt-8">
          <Text className="text-lg font-black text-text-main mb-4">
            פעילות אחרונה
          </Text>
          <View className="space-y-3">
            {recentActivity.map((activity) => (
              <Card key={activity.id} className="px-4 py-3">
                <View className={`${tw.flexRow} items-center justify-between`}>
                  <View className={`${tw.flexRow} items-center gap-3 flex-1`}>
                    <View className="h-12 w-12 rounded-2xl bg-gray-100 items-center justify-center">
                      <Text className="text-xl text-gray-400">
                        {activity.type === 'punch' ? '🔵' : '🎉'}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-bold text-text-main">
                        {activity.customer}
                      </Text>
                      <Text className="text-xs font-bold text-gray-400">
                        {activity.detail}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-[11px] font-bold text-gray-300">
                    {activity.time}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
