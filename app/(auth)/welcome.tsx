import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Heart, TrendingUp } from 'lucide-react-native';
import { useCallback } from 'react';
import { BackHandler, Image, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { PreviewModeBanner } from '@/components/PreviewModeBanner';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { STAMPAIX_IMAGE_LOGO } from '@/config/branding';
import { safeBack } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';
import { rtlBaseView, rtlCenterText, tw } from '@/lib/rtl';

const TEXT = {
  titleLine1: 'העסק והלקוחות',
  titleLine2A: 'נפגשים',
  titleLine2B: 'ב',
  titleLine2C: 'דיגיטל',
  subtitle: 'מצטרפים למהפכה הדיגיטלית\nכל הכרטיסיות בכיס אחד, ב-QR',
  featureCustomerTitle: 'ללקוחות שאוהבים לקבל',
  featureCustomerBody:
    'צוברים חתימות, עוקבים אחרי ההטבות ומקבלים מתנות מהעסקים',
  featureBusinessTitle: 'לעסקים שרוצים לגדול',
  featureBusinessBody:
    'מנהלים מועדון לקוחות חכם, מודדים מדדים ברורים ומשתמשים בכלי שיווק',
  getStarted: 'בואו נתחיל',
  emailEntry: 'כניסה או הרשמה באימייל',
  emailEntryHint: 'יש לכם כבר אימייל?',
};

export default function WelcomeScreen() {
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
  const { completeStep, trackContinue } = useOnboardingTracking({
    screen: 'welcome',
  });

  const handleBack = useCallback(() => {
    safeBack('/(auth)/sign-in');
  }, []);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          handleBack();
          return true;
        }
      );

      return () => subscription.remove();
    }, [handleBack])
  );

  const handleGetStarted = () => {
    trackContinue();
    completeStep();
    router.push('/(auth)/sign-up');
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {isPreviewMode && <PreviewModeBanner onClose={() => safeBack()} />}

      <View className="flex-1 px-6 py-8">
        <View className={`${tw.flexRow} items-center justify-between`}>
          <BackButton onPress={handleBack} />
          <View className="w-11 h-11" />
        </View>

        <View className="items-center mb-6 -mt-2">
          <View className="items-center justify-center">
            <Image
              source={STAMPAIX_IMAGE_LOGO}
              className="w-48 h-48"
              resizeMode="contain"
              accessibilityLabel="StampAix logo"
            />
          </View>
        </View>

        <View className="mb-8">
          <Text
            className="text-[34px] font-black text-gray-900 text-center mb-1"
            style={rtlCenterText}
          >
            {TEXT.titleLine1}
          </Text>
          <Text
            className="text-[34px] font-black text-center mb-3"
            style={rtlCenterText}
          >
            <Text className="text-gray-900">{TEXT.titleLine2A}</Text>{' '}
            <Text className="text-gray-900">{TEXT.titleLine2B}</Text>
            <Text className="text-blue-600">{TEXT.titleLine2C}</Text>
          </Text>
          <Text
            className="text-base text-gray-500 text-center leading-6"
            style={rtlCenterText}
          >
            {TEXT.subtitle}
          </Text>
        </View>

        <View className="mb-auto">
          <View className="bg-white rounded-2xl p-4 mb-4 border border-gray-200 shadow-sm shadow-gray-200">
            <View
              className={`${tw.flexRow} ${tw.itemsStart} gap-4`}
              style={rtlBaseView}
            >
              <View className="w-11 h-11 bg-blue-50 rounded-xl items-center justify-center border border-blue-100">
                <Heart size={24} color="#2563eb" fill="#dbeafe" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-extrabold text-gray-900 mb-1 text-right">
                  {TEXT.featureCustomerTitle}
                </Text>
                <Text className="text-sm text-gray-500 text-right leading-5">
                  {TEXT.featureCustomerBody}
                </Text>
              </View>
            </View>
          </View>

          <View className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm shadow-gray-200">
            <View
              className={`${tw.flexRow} ${tw.itemsStart} gap-4`}
              style={rtlBaseView}
            >
              <View className="w-11 h-11 bg-blue-50 rounded-xl items-center justify-center border border-blue-100">
                <TrendingUp size={24} color="#2563eb" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-extrabold text-gray-900 mb-1 text-right">
                  {TEXT.featureBusinessTitle}
                </Text>
                <Text className="text-sm text-gray-500 text-right leading-5">
                  {TEXT.featureBusinessBody}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View className="mt-10">
          <TouchableOpacity
            className="bg-blue-600 rounded-full px-10 py-4 items-center mb-4 shadow-[0_10px_30px_rgba(37,99,235,0.25)]"
            onPress={handleGetStarted}
            activeOpacity={0.8}
          >
            <Text
              className="text-white text-lg font-bold"
              style={rtlCenterText}
            >
              {TEXT.getStarted}
            </Text>
          </TouchableOpacity>

          <View className="items-center">
            <Text className="text-gray-500 text-base" style={rtlCenterText}>
              {TEXT.emailEntryHint}{' '}
              <Text
                className="text-blue-600 font-semibold"
                onPress={() => router.push('/(auth)/sign-in')}
              >
                {TEXT.emailEntry}
              </Text>
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
