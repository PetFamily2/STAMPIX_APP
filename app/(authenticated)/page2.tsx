import { ScrollView, Text, View } from 'react-native'; // רכיבי UI בסיסיים
import { SafeAreaView } from 'react-native-safe-area-context'; // רכיב לשמירה על אזור בטוח (Safe Area)
import { tw } from '@/lib/rtl'; // כלי עזר ל-RTL

// עמוד דוגמה 2
export default function Page2() {
  return (
    <SafeAreaView className="flex-1 bg-[#0a0a0a]" edges={['top']}>
      <ScrollView className="flex-1">
        <View className="max-w-3xl w-full mx-auto px-8 pb-12 pt-8">
          <Text
            className={`text-[#ededed] text-4xl font-bold mb-5 ${tw.textStart}`}
          >
            עמוד 2
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
