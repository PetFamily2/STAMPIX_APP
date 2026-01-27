import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { Card, ListRow, PrimaryButton, SectionHeader } from '@/components/ui';
import { tw } from '@/lib/rtl';

const BRAND_COLORS = [
  { id: 'blue', label: 'כחול מותג', colorClass: 'bg-blue-600' },
  { id: 'orange', label: 'כתום ארומה', colorClass: 'bg-orange-500' },
  { id: 'green', label: 'ירוק רענן', colorClass: 'bg-emerald-600' },
  { id: 'gold', label: 'זהב קלאסי', colorClass: 'bg-amber-600' },
  { id: 'pink', label: 'ורוד פסטל', colorClass: 'bg-rose-500' },
  { id: 'dark', label: 'שחור יוקרתי', colorClass: 'bg-zinc-800' },
];

const STORE_FIELDS = [
  { title: 'שם העסק שיופיע ללקוח', value: 'קפה ארומה' },
  { title: 'הטבה עיקרית', value: 'קפה ומאפה חינם' },
];

export default function MerchantStoreSettingsScreen() {
  const [selectedColor, setSelectedColor] = useState(BRAND_COLORS[0]);
  const [maxStamps, setMaxStamps] = useState(10);
  const [isLocked, setIsLocked] = useState(false);

  const stamps = Array.from({ length: maxStamps });

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 48 }}
      className="flex-1 bg-slate-50"
    >
      <View className="px-5 pt-6 pb-8">
        <SectionHeader
          title="הגדרות כרטיס העסק"
          description="צור כרטיסיה שמדויקת למותג ולאינטרקציות הנוכחיות"
        />

        <Card
          className={`mt-6 p-5 border ${isLocked ? 'border-emerald-200' : 'border-gray-100'}`}
        >
          <View className={`${tw.flexRow} items-center justify-between mb-4`}>
            <Text className="text-base font-black text-text-main">
              תצוגה מקדימה ללקוח
            </Text>
            <Text className="text-xs font-bold text-gray-400">
              {isLocked ? 'כרטיס נעול' : 'אי אפשר לערוך פרטים'}
            </Text>
          </View>
          <View className="rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm">
            <View className={`h-1 rounded-full ${selectedColor.colorClass}`} />
            <View className={`${tw.flexRow} items-center justify-between mt-4`}>
              <View>
                <Text className="text-lg font-black text-text-main">
                  קפה ארומה
                </Text>
                <Text className="text-xs text-gray-400 mt-1">
                  צבור {maxStamps} ניקובים לקבלת קפה ומאפה חינם
                </Text>
              </View>
              <View
                className={`h-12 w-12 rounded-[20px] items-center justify-center ${selectedColor.colorClass}`}
              >
                <Text className="text-white font-black">☕️</Text>
              </View>
            </View>
            <View className={`mt-4 ${tw.flexRow} flex-wrap gap-2`}>
              {stamps.map((_, index) => (
                <View
                  key={`stamp-${index}`}
                  className={`h-8 w-8 rounded-full border ${index < 3 ? selectedColor.colorClass : 'border-gray-200 bg-gray-50'}`}
                />
              ))}
            </View>
          </View>
        </Card>

        <View className="mt-6 space-y-4">
          {STORE_FIELDS.map((field) => (
            <ListRow
              key={field.title}
              title={field.title}
              subtitle={field.value}
              leading={
                <View className="h-10 w-10 rounded-2xl bg-blue-50 items-center justify-center">
                  <Text className="text-blue-600 text-xl">✏️</Text>
                </View>
              }
              trailing={
                <Text className="text-xs font-bold text-gray-400">
                  {field.title === 'הטבה עיקרית' ? `${maxStamps} ניקובים` : '›'}
                </Text>
              }
            />
          ))}
        </View>

        <View className="mt-6">
          <Text className="text-sm font-black text-text-main mb-2">
            בחירת צבע מותג
          </Text>
          <View className={`${tw.flexRow} flex-wrap gap-3`}>
            {BRAND_COLORS.map((color) => (
              <TouchableOpacity
                key={color.id}
                disabled={isLocked}
                className={`h-16 w-16 rounded-[20px] items-center justify-center ${color.colorClass} ${
                  selectedColor.id === color.id
                    ? 'opacity-100 shadow-lg'
                    : 'opacity-70'
                }`}
                onPress={() => setSelectedColor(color)}
              >
                <Text className="text-xs font-black text-white">
                  {color.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className={`${tw.flexRow} items-center justify-between mt-6`}>
          <Text className="text-sm font-bold text-text-main">
            כמות ניקובים לכרטיס מלא
          </Text>
          <View className={`${tw.flexRow} items-center gap-2`}>
            <TouchableOpacity
              disabled={isLocked || maxStamps <= 3}
              className="h-10 w-10 rounded-2xl bg-gray-100 items-center justify-center"
              onPress={() => setMaxStamps((prev) => Math.max(3, prev - 1))}
            >
              <Text className="text-lg font-black text-text-main">-</Text>
            </TouchableOpacity>
            <Text className="text-base font-black text-text-main">
              {maxStamps}
            </Text>
            <TouchableOpacity
              disabled={isLocked || maxStamps >= 12}
              className="h-10 w-10 rounded-2xl bg-gray-100 items-center justify-center"
              onPress={() => setMaxStamps((prev) => Math.min(12, prev + 1))}
            >
              <Text className="text-lg font-black text-text-main">+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <PrimaryButton
          title={isLocked ? 'הכרטיס נעול' : 'שמור שינויים'}
          disabled={isLocked}
          className="mt-6"
        />

        <TouchableOpacity
          className="mt-4 items-center justify-center"
          onPress={() => setIsLocked((prev) => !prev)}
        >
          <Text className="text-xs font-black text-blue-600">
            {isLocked ? 'בטל נעילה כדי לערוך שוב' : 'נעל והפעל כרטיסיה'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
