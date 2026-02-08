import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { BackButton } from '@/components/BackButton';
import { PreviewModeBanner } from '@/components/PreviewModeBanner';
import { IS_DEV_MODE } from '@/config/appConfig';
import { safeBack } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

const TEXT = {
  title: 'באיזו דרך תרצו להתחבר?',
  subtitle: 'בחרו את דרך ההתחברות המתאימה לכם להתחלה',
  apple: 'המשך עם Apple',
  google: 'המשך עם Google',
  email: 'המשך עם אימייל',
  extra: 'אפשרויות נוספות',
  terms: 'בלחיצה על המשך, אתם מסכימים לתנאי השימוש ולמדיניות הפרטיות',
};

type AuthMethod = 'apple' | 'google' | 'email';

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 533.5 544.3"
      accessible={false}
    >
      <Path
        fill="#4285F4"
        d="M533.5 278.4c0-17.4-1.6-34.1-4.6-50.2H272v95h146.9c-6.3 34-25 62.8-53.2 82v68h86.1c50.4-46.5 79.7-115.1 79.7-194.8z"
      />
      <Path
        fill="#34A853"
        d="M272 544.3c72.6 0 133.6-24.1 178.1-65.7l-86.1-68c-24 16.2-54.6 25.7-92 25.7-70.7 0-130.5-47.7-151.8-111.8h-89v70.4c44.3 87.3 134.9 149.7 240.8 149.7z"
      />
      <Path
        fill="#FBBC05"
        d="M120.2 324.5c-10.2-30.4-10.2-63.6 0-94l-89-70.4C-14.7 229.3-14.7 314.7 31.2 384.9l89-70.4z"
      />
      <Path
        fill="#EA4335"
        d="M272 107.7c39.5-.6 77.2 14.5 105.9 41.9l79.1-79.1C414.5 24.3 344.5-1.4 272 0 166.1 0 75.4 62.4 31.1 149.7l89 70.4C141.5 155.4 201.3 107.7 272 107.7z"
      />
    </Svg>
  );
}

export default function SignUpScreen() {
  const router = useRouter();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreviewMode = IS_DEV_MODE && preview === 'true';
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'sign_up',
  });
  const [selectedMethod, setSelectedMethod] = useState<AuthMethod | null>(null);

  const handleBack = () => {
    safeBack('/(auth)/welcome');
  };

  const handleSelect = (method: AuthMethod) => {
    setSelectedMethod(method);
    trackChoice('auth_method', method, { method });
  };

  const handleContinue = () => {
    if (!selectedMethod) return;
    trackContinue({ method: selectedMethod });
    completeStep({ method: selectedMethod });
    router.push('/(auth)/onboarding-client-role');
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F8F7F4]">
      {isPreviewMode && <PreviewModeBanner onClose={() => safeBack()} />}

      <View className="flex-1 px-6 pt-5 pb-8">
        <View className="items-end">
          <BackButton onPress={handleBack} />
        </View>

        <View className="mt-10 items-end">
          <Text className="text-[22px] font-black text-slate-900 text-right">
            {TEXT.title}
          </Text>
          <Text className="mt-2 text-[13px] font-semibold text-slate-500 text-right">
            {TEXT.subtitle}
          </Text>
        </View>

        <View className="mt-10">
          <Pressable
            onPress={() => handleSelect('apple')}
            accessibilityRole="button"
            accessibilityLabel={TEXT.apple}
            accessibilityState={{ selected: selectedMethod === 'apple' }}
            style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
            className={`rounded-2xl px-6 py-4 border shadow-[0_12px_24px_rgba(15,23,42,0.06)] ${
              selectedMethod === 'apple'
                ? 'border-blue-300 bg-blue-50'
                : 'border-slate-200 bg-white'
            }`}
          >
            <View className="flex-row-reverse items-center justify-center gap-3">
              <Ionicons
                name="logo-apple"
                size={18}
                color={selectedMethod === 'apple' ? '#2563eb' : '#111827'}
              />
              <Text
                className={`text-base font-bold ${
                  selectedMethod === 'apple' ? 'text-blue-600' : 'text-slate-900'
                }`}
              >
                {TEXT.apple}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => handleSelect('google')}
            accessibilityRole="button"
            accessibilityLabel={TEXT.google}
            accessibilityState={{ selected: selectedMethod === 'google' }}
            style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
            className={`mt-4 rounded-2xl px-6 py-4 border shadow-[0_12px_24px_rgba(15,23,42,0.06)] ${
              selectedMethod === 'google'
                ? 'border-blue-300 bg-blue-50'
                : 'border-slate-200 bg-white'
            }`}
          >
            <View className="flex-row-reverse items-center justify-center gap-3">
              <GoogleLogo size={20} />
              <Text
                className={`text-base font-bold ${
                  selectedMethod === 'google'
                    ? 'text-blue-600'
                    : 'text-slate-900'
                }`}
              >
                {TEXT.google}
              </Text>
            </View>
          </Pressable>

          <View className="flex-row items-center gap-3 my-6">
            <View className="flex-1 h-px bg-slate-200" />
            <Text className="text-[11px] font-bold text-slate-300">
              {TEXT.extra}
            </Text>
            <View className="flex-1 h-px bg-slate-200" />
          </View>

          <Pressable
            onPress={() => handleSelect('email')}
            accessibilityRole="button"
            accessibilityLabel={TEXT.email}
            accessibilityState={{ selected: selectedMethod === 'email' }}
            style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
            className={`rounded-2xl px-6 py-4 border ${
              selectedMethod === 'email'
                ? 'border-blue-300 bg-blue-50'
                : 'border-slate-200 bg-white'
            }`}
          >
            <View className="flex-row-reverse items-center justify-center gap-3">
              <Ionicons
                name="mail-outline"
                size={20}
                color={selectedMethod === 'email' ? '#2563eb' : '#111827'}
              />
              <Text
                className={`text-base font-bold ${
                  selectedMethod === 'email'
                    ? 'text-blue-600'
                    : 'text-slate-900'
                }`}
              >
                {TEXT.email}
              </Text>
            </View>
          </Pressable>
        </View>

        <View className="mt-auto pt-8">
          <Pressable
            onPress={handleContinue}
            disabled={!selectedMethod}
            accessibilityRole="button"
            accessibilityState={{ disabled: !selectedMethod }}
            style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
            className={`rounded-2xl px-6 py-4 items-center ${
              selectedMethod
                ? 'bg-blue-600 shadow-[0_14px_26px_rgba(37,99,235,0.25)]'
                : 'bg-slate-200'
            }`}
          >
            <Text
              className={`text-base font-bold ${
                selectedMethod ? 'text-white' : 'text-slate-500'
              }`}
            >
              המשך
            </Text>
          </Pressable>

          <Text className="mt-4 text-[10px] text-slate-300 text-center">
            {TEXT.terms}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}