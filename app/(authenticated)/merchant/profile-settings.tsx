import { useAuthActions } from '@convex-dev/auth/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

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
    subtitle: 'פנה לצוות STAMPAIX או שחרר משימה',
    icon: 'help',
  },
];

export default function MerchantProfileSettingsScreen() {
  const { signOut } = useAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    try {
      setIsSigningOut(true);
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch {
      Alert.alert(
        '\u05e9\u05d2\u05d9\u05d0\u05d4',
        '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05d1\u05e6\u05e2 \u05d9\u05e6\u05d9\u05d0\u05d4, \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1.'
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  const confirmSignOut = () => {
    if (isSigningOut) {
      return;
    }

    Alert.alert(
      '\u05d0\u05d9\u05e9\u05d5\u05e8 \u05d9\u05e6\u05d9\u05d0\u05d4',
      '\u05d4\u05d0\u05dd \u05d0\u05ea\u05dd \u05d1\u05d8\u05d5\u05d7\u05d9\u05dd \u05e9\u05d1\u05e8\u05e6\u05d5\u05e0\u05db\u05dd \u05dc\u05d4\u05ea\u05e0\u05ea\u05e7 \u05de\u05d4\u05d7\u05e9\u05d1\u05d5\u05df?',
      [
        { text: '\u05d1\u05d9\u05d8\u05d5\u05dc', style: 'cancel' },
        {
          text: '\u05d9\u05e6\u05d9\u05d0\u05d4 \u05de\u05d4\u05d7\u05e9\u05d1\u05d5\u05df',
          style: 'destructive',
          onPress: () => {
            void handleSignOut();
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 48 }}
      className="flex-1 bg-[#E9F0FF]"
    >
      <View className="px-5 pt-6 pb-8">
        <SectionHeader
          title="הגדרות וחשבון"
          description="כל מה שצריך לניהול החשבון מתחיל כאן"
        />

        <Card className="mt-6 border border-[#E3E9FF] bg-white p-5">
          <View className={`${tw.flexRow} items-center gap-4`}>
            <View className="h-20 w-20 rounded-[26px] bg-[#D4EDFF] items-center justify-center">
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
          <Card className="border border-[#E3E9FF] p-4">
            <Text className="text-base font-black text-text-main">
              סטטוס מנוי: Pro
            </Text>
            <Text className="text-xs text-gray-400 mt-1">
              חיוב הבאה: 12/02/2025
            </Text>
          </Card>
          <Card className="border border-[#E3E9FF] p-4">
            <Text className="text-base font-black text-text-main">
              גרסת STAMPAIX OS
            </Text>
            <Text className="text-xs text-gray-400 mt-1">
              v2.7.1 • Production
            </Text>
          </Card>
        </View>

        <PrimaryButton
          title="התנתק מהמערכת"
          className="mt-6"
          loading={isSigningOut}
          onPress={confirmSignOut}
        />
      </View>
    </ScrollView>
  );
}
