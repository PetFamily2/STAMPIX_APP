import { ScrollView, Text, View } from 'react-native';

import { Card, ListRow, PrimaryButton, SectionHeader } from '@/components/ui';
import { tw } from '@/lib/rtl';

const MENU_ITEMS = [
  {
    title: 'פרטי בעל העסק',
    subtitle: 'שם, טלפון, אימייל וסיסמה',
    icon: 'person',
  },
  {
    title: 'מנויים ותשלומים',
    subtitle: 'חשבוניות ותשלומי כרטיס אשראי',
    icon: 'credit_card',
  },
  {
    title: 'תמיכה וסטטוס',
    subtitle: 'פנה לצוות STAMPIX או שחרר משימה',
    icon: 'help',
  },
];

export default function MerchantProfileSettingsScreen() {
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 48 }}
      className="flex-1 bg-slate-50"
    >
      <View className="px-5 pt-6 pb-8">
        <SectionHeader
          title="הגדרות וחשבון"
          description="כל מה שצריך לניהול החשבון מתחיל כאן"
        />

        <Card className="mt-6 p-5 bg-white">
          <View className={`${tw.flexRow} items-center gap-4`}>
            <View className="h-20 w-20 rounded-[26px] bg-gray-100 items-center justify-center">
              <Text className="text-4xl">א</Text>
            </View>
            <View>
              <Text className="text-2xl font-black text-text-main">
                ארומה אספרסו בר
              </Text>
              <Text className="text-xs text-gray-400 font-bold mt-1">
                ניהול חשבון ראשי
              </Text>
            </View>
          </View>
        </Card>

        <View className="mt-6 space-y-3">
          {MENU_ITEMS.map((item) => (
            <ListRow
              key={item.title}
              title={item.title}
              subtitle={item.subtitle}
              leading={
                <View className="h-10 w-10 rounded-2xl bg-blue-50 items-center justify-center">
                  <Text className="text-blue-600 text-xl">{item.icon}</Text>
                </View>
              }
              trailing={
                <Text className="text-gray-300 font-bold text-xs">›</Text>
              }
            />
          ))}
        </View>

        <View className="mt-8 space-y-3">
          <Card className="p-4 border border-gray-100">
            <Text className="text-base font-black text-text-main">
              סטטוס מנוי: Pro
            </Text>
            <Text className="text-xs text-gray-400 mt-1">
              חיוב הבאה: 12/02/2025
            </Text>
          </Card>
          <Card className="p-4 border border-gray-100">
            <Text className="text-base font-black text-text-main">
              גרסת STAMPIX OS
            </Text>
            <Text className="text-xs text-gray-400 mt-1">
              v2.7.1 • Production
            </Text>
          </Card>
        </View>

        <PrimaryButton title="התנתק מהמערכת" className="mt-6" />
      </View>
    </ScrollView>
  );
}
