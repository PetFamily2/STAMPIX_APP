import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Gift, Store } from 'lucide-react-native';
import { useCallback } from 'react';
import {
  BackHandler,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { PreviewModeBanner } from '@/components/PreviewModeBanner';
import { BRAND_IMAGE_LOGO } from '@/config/branding';
import { safeBack } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { rtlBaseText, rtlCenterText, tw } from '@/lib/rtl';

const TEXT = {
  titleLine1: 'העסק והלקוחות',
  titleLine2A: 'נפגשים',
  titleLine2B: 'ב',
  titleLine2C: 'דיגיטל',
  subtitle: 'כל כרטיסי הנאמנות וההטבות במקום אחד',
  featureCustomerLabel: 'ללקוחות',
  featureCustomerTitle: 'צוברים חותמות, מממשים הטבות ונהנים יותר בכל ביקור',
  featureBusinessLabel: 'לעסקים',
  featureBusinessTitle:
    'מנהלים מועדון לקוחות חכם, מחזירים לקוחות ומחזקים נאמנות',
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

      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View
          className="flex-1 px-6 py-6"
          style={{ width: '100%', maxWidth: 620, alignSelf: 'center' }}
        >
          <View className={`${tw.flexRow} items-center justify-between`}>
            <BackButton onPress={handleBack} />
            <View className="w-11 h-11" />
          </View>

          <View className="items-center mb-2 -mt-3">
            <View className="items-center justify-center">
              <Image
                source={BRAND_IMAGE_LOGO}
                className="w-36 h-36"
                resizeMode="contain"
                accessibilityLabel="StampAix logo"
              />
            </View>
          </View>

          <View className="mb-7">
            <Text
              className="text-[30px] font-black text-gray-900 text-center mb-1"
              style={rtlCenterText}
            >
              {TEXT.titleLine1}
            </Text>
            <Text
              className="text-[30px] font-black text-center mb-3"
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

          <View className="mb-auto" style={styles.benefitsShadow}>
            <View style={styles.benefitsCard}>
              {[
                {
                  key: 'customer',
                  label: TEXT.featureCustomerLabel,
                  title: TEXT.featureCustomerTitle,
                  Icon: Gift,
                  iconColor: '#2563EB',
                  iconBackground: '#EAF2FF',
                },
                {
                  key: 'business',
                  label: TEXT.featureBusinessLabel,
                  title: TEXT.featureBusinessTitle,
                  Icon: Store,
                  iconColor: '#4F46E5',
                  iconBackground: '#EEF0FF',
                },
              ].map((benefit, index) => (
                <View key={benefit.key}>
                  {index > 0 && <View style={styles.benefitDivider} />}
                  <View
                    className={`${tw.flexRow} items-center gap-3 px-4 py-[15px]`}
                  >
                    <View
                      className="h-10 w-10 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: benefit.iconBackground }}
                    >
                      <benefit.Icon
                        color={benefit.iconColor}
                        size={19}
                        strokeWidth={2.25}
                      />
                    </View>
                    <View className={`flex-1 ${tw.itemsStart} gap-0.5`}>
                      <Text
                        className="w-full text-right text-xs font-bold text-blue-600"
                        style={rtlBaseText}
                      >
                        {benefit.label}
                      </Text>
                      <Text
                        className="w-full text-right text-[15px] font-semibold leading-[22px] text-[#14213D]"
                        style={rtlBaseText}
                      >
                        {benefit.title}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View className="mt-8">
            <TouchableOpacity
              className="bg-blue-600 rounded-2xl px-8 py-[15px] items-center mb-4"
              onPress={handleGetStarted}
              activeOpacity={0.8}
            >
              <Text
                className="text-white text-base font-bold"
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  benefitsShadow: {
    width: '100%',
    borderRadius: 22,
    backgroundColor: '#F9FBFF',
    shadowColor: '#163A70',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  benefitsCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E3EAF5',
    borderRadius: 22,
    backgroundColor: '#F9FBFF',
  },
  benefitDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    backgroundColor: '#DCE5F2',
  },
});
