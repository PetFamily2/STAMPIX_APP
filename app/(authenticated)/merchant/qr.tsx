import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { Card, PrimaryButton, SectionHeader } from '@/components/ui';
import { tw } from '@/lib/rtl';

const QR_IMAGE = 'https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=STAMPIX_MERCHANT_01';

export default function MerchantQRCodeScreen() {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }} className="flex-1 bg-slate-50">
      <View className="px-5 pt-6 pb-8">
        <SectionHeader title="הקוד של העסק שלי" description="הראה את זה ללקוחות כדי להצטרף ברגע" />

        <Card className="mt-6 p-6 relative overflow-hidden">
          <View className="absolute top-0 left-0 h-1 w-full bg-blue-600" />
          <View className="items-center justify-center mb-4">
            <Text className="text-2xl font-black text-text-main">STAMPIX</Text>
            <Text className="text-xs font-bold text-gray-400 mt-1">
              קוד העסק שלך בביטחון מלא
            </Text>
          </View>
          <View className="bg-gray-100 rounded-3xl p-4 items-center justify-center">
            <Image
              source={{ uri: QR_IMAGE }}
              className="h-60 w-60 rounded-3xl border border-dashed border-gray-300"
              accessibilityLabel="QR code"
            />
          </View>
          <Text className="text-center text-sm text-gray-400 mt-4">
            שתפו עם לקוחות חדשים או הדפיסו לתצוגת קופה
          </Text>
        </Card>

        <PrimaryButton title="שתף קישור להצטרפות" className="mt-6" />

        <TouchableOpacity
          className="mt-4 flex-row items-center justify-center gap-2 rounded-[28px] border border-gray-200 bg-white py-3 shadow-sm"
        >
          <Text className="text-blue-600 font-black text-sm">הדפס פוסטר לקופה</Text>
        </TouchableOpacity>

        <View className="mt-8">
          <Text className="text-[10px] font-black text-gray-400 text-center uppercase tracking-[0.3em]">
            STAMPIX BUSINESS ENGINE • v2.7.0
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

