import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { useSessionContext } from '@/contexts/UserContext';
import { tw } from '@/lib/rtl';

export default function BusinessSettingsAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sessionContext = useSessionContext();
  const { signOut } = useAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const user = sessionContext?.user;
  const userFullName =
    user?.fullName?.trim() ||
    [user?.firstName?.trim(), user?.lastName?.trim()]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    'ללא שם';

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    try {
      setIsSigningOut(true);
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch {
      Alert.alert('שגיאה', 'לא הצלחנו לבצע יציאה. נסו שוב.');
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 12,
          paddingBottom: 30,
          gap: 12,
        }}
      >
        <BusinessScreenHeader
          title="פרטי חשבון"
          subtitle="נתוני המשתמש המחובר והגדרות התחברות"
          titleAccessory={
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => ({
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <Text style={{ fontSize: 16, color: '#0F172A' }}>←</Text>
            </Pressable>
          }
        />

        <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            חשבון משתמש
          </Text>

          <View className="mt-4 gap-3">
            <View className={`${tw.flexRow} items-center justify-between`}>
              <Text className="text-sm font-bold text-[#1A2B4A]">
                {userFullName}
              </Text>
              <Text className="text-xs text-[#64748B]">שם מלא</Text>
            </View>
            <View className={`${tw.flexRow} items-center justify-between`}>
              <Text className="text-sm font-bold text-[#1A2B4A]">
                {user?.email || 'לא מוגדר'}
              </Text>
              <Text className="text-xs text-[#64748B]">אימייל</Text>
            </View>
            <View className={`${tw.flexRow} items-center justify-between`}>
              <Text className="text-sm font-bold text-[#1A2B4A]">
                {user?.phone || 'לא מוגדר'}
              </Text>
              <Text className="text-xs text-[#64748B]">טלפון</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => {
            void handleSignOut();
          }}
          disabled={isSigningOut}
          className={`rounded-2xl px-4 py-3 ${
            isSigningOut ? 'bg-[#FCA5A5]' : 'bg-[#DC2626]'
          }`}
        >
          {isSigningOut ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-center text-sm font-bold text-white">
              יציאה מהחשבון
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
