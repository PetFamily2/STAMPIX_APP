import { useQuery } from 'convex/react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/convex/_generated/api';
import { tw } from '@/lib/rtl';

export default function ScannerScreen() {
  const businesses = useQuery(api.scanner.myBusinesses) ?? [];

  return (
    <SafeAreaView className="flex-1 bg-[#0a0a0a]" edges={['top']}>
      <ScrollView className="flex-1">
        <View className="max-w-3xl w-full mx-auto px-6 pb-12 pt-6 space-y-6">
          <Text className={`text-[#ededed] text-3xl font-bold ${tw.textStart}`}>סריקה זמנית מושבתת</Text>
          <Text className={`text-sm text-zinc-400 ${tw.textStart}`}>
            מתקנים בעיה טכנית. הסורק מושבת עד שייבחר פתרון יציב יותר.
          </Text>

          <View className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
            <Text className={`text-xs uppercase tracking-[0.3em] text-zinc-500 ${tw.textStart}`}>
              עסקים זמינים
            </Text>
            {businesses.length === 0 ? (
              <Text className={`text-zinc-500 text-sm ${tw.textStart}`}>אין עסקים פעילים כרגע.</Text>
            ) : (
              businesses.map((business) => (
                <View key={business.businessId} className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                  <Text className="text-base font-semibold text-white">{business.name}</Text>
                  <Text className="text-[11px] text-zinc-500">{business.externalId}</Text>
                </View>
              ))
            )}
          </View>

          <View className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
            <Text className={`text-sm text-zinc-400 ${tw.textStart}`}>מודול סריקה</Text>
            <Text className={`text-xs text-zinc-500 ${tw.textStart}`}>
              המודול `ExpoBarCodeScanner` לא מותקן כרגע, אז מסך זה מציג רק סטטוס.
            </Text>
            <TouchableOpacity
              onPress={() => {}}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 items-center"
            >
              <Text className="text-sm font-bold text-cyan-300">חזור שוב בהמשך</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
