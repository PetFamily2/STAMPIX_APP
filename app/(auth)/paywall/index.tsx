import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Check, ChevronLeft, X } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WebViewModal } from '@/components/WebViewModal';
import { IS_DEV_MODE, PRIVACY_URL, TERMS_URL } from '@/config/appConfig';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { safeBack } from '@/lib/navigation';
import { tw } from '@/lib/rtl';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { clearOnboardingSessionId } from '@/lib/onboarding/session';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

// ============================================================================
// ׳§׳•׳ ׳₪׳™׳’׳•׳¨׳¦׳™׳™׳× ׳×׳›׳•׳ ׳•׳× ׳׳׳¡׳ ׳”׳×׳©׳׳•׳
// ============================================================================

const FEATURES = [
  '׳×׳›׳•׳ ׳” #1 - ׳×׳™׳׳•׳¨ ׳”׳×׳›׳•׳ ׳”',
  '׳×׳›׳•׳ ׳” #2 - ׳×׳™׳׳•׳¨ ׳”׳×׳›׳•׳ ׳”',
  '׳×׳›׳•׳ ׳” #3 - ׳×׳™׳׳•׳¨ ׳”׳×׳›׳•׳ ׳”',
];

// ============================================================================
// ׳׳¡׳ ׳”׳×׳©׳׳•׳ (Paywall)
// ============================================================================

export default function PaywallScreen() {
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode =
    (IS_DEV_MODE && preview === 'true') || map === 'true';

  const {
    packages,
    isLoading,
    purchasePackage,
    restorePurchases,
    isExpoGo,
    isConfigured,
  } = useRevenueCat();
  const { completeStep, trackContinue, trackEvent } = useOnboardingTracking({
    screen: 'paywall',
    role: 'business',
  });
  const completionRef = useRef(false);

  // ׳׳¦׳™׳׳× ׳”׳—׳‘׳™׳׳•׳× ׳”׳—׳•׳“׳©׳™׳× ׳•׳”׳©׳ ׳×׳™׳×
  const monthlyPackage = packages.find((p) => p.packageType === 'monthly');
  const annualPackage = packages.find((p) => p.packageType === 'annual');

  // ׳‘׳—׳™׳¨׳× ׳×׳•׳›׳ ׳™׳× - ׳‘׳¨׳™׳¨׳× ׳׳—׳“׳: ׳©׳ ׳×׳™׳×
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>(
    'annual'
  );
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      trackEvent(ANALYTICS_EVENTS.paywallViewed);
    }, [trackEvent])
  );

  const finishOnboarding = useCallback(() => {
    if (completionRef.current) {
      return;
    }
    completionRef.current = true;
    trackEvent(ANALYTICS_EVENTS.onboardingCompleted, { role: 'business' });
    void clearOnboardingSessionId();
  }, [trackEvent]);

  // ============================================================================
  // ׳₪׳¢׳•׳׳•׳×
  // ============================================================================

  const handleClose = () => {
    completeStep();
    finishOnboarding();
    safeBack('/(auth)/sign-in');
  };

  const handleContinue = async () => {
    if (isPreviewMode) {
      // ׳‘׳׳¦׳‘ ׳×׳¦׳•׳’׳” ׳׳§׳“׳™׳׳” - ׳׳ ׳׳‘׳¦׳¢׳™׳ ׳¨׳›׳™׳©׳” ׳׳׳™׳×׳™׳×
      return;
    }

    const packageId =
      selectedPlan === 'monthly'
        ? monthlyPackage?.identifier
        : annualPackage?.identifier;

    if (!packageId) {
      return;
    }

    setIsPurchasing(true);
    trackContinue();
    trackEvent(ANALYTICS_EVENTS.checkoutStarted, { plan_id: packageId });
    try {
      const success = await purchasePackage(packageId);
      if (success) {
        trackEvent(ANALYTICS_EVENTS.purchaseCompleted, { plan_id: packageId });
        completeStep();
        finishOnboarding();
        safeBack('/(auth)/sign-in');
      } else {
        trackEvent(ANALYTICS_EVENTS.purchaseFailed, {
          plan_id: packageId,
          error_code: isExpoGo
            ? 'expo_go'
            : isConfigured
              ? 'cancelled_or_failed'
              : 'not_configured',
        });
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (isPreviewMode) {
      return;
    }

    setIsRestoring(true);
    try {
      const success = await restorePurchases();
      if (success) {
        completeStep();
        finishOnboarding();
        safeBack('/(auth)/sign-in');
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleTerms = () => {
    setTermsModalVisible(true);
  };

  const handlePrivacy = () => {
    setPrivacyModalVisible(true);
  };

  // ============================================================================
  // ׳¨׳™׳ ׳“׳•׳¨
  // ============================================================================

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-[#0a0a0a] items-center justify-center">
        <ActivityIndicator size="large" color="#4fc3f7" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0a0a0a]" edges={['top', 'bottom']}>
      {/* ׳׳•׳“׳׳™׳ ׳׳×׳ ׳׳™ ׳©׳™׳׳•׳© ׳•׳׳“׳™׳ ׳™׳•׳× ׳₪׳¨׳˜׳™׳•׳× */}
      <WebViewModal
        visible={termsModalVisible}
        url={TERMS_URL}
        title="׳×׳ ׳׳™ ׳”׳©׳™׳׳•׳©"
        onClose={() => setTermsModalVisible(false)}
      />

      <WebViewModal
        visible={privacyModalVisible}
        url={PRIVACY_URL}
        title="׳׳“׳™׳ ׳™׳•׳× ׳”׳₪׳¨׳˜׳™׳•׳×"
        onClose={() => setPrivacyModalVisible(false)}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ׳›׳₪׳×׳•׳¨ ׳¡׳’׳™׳¨׳” */}
        <View className={`${tw.flexRow} ${tw.justifyEnd} px-4 pt-4`}>
          <TouchableOpacity
            onPress={handleClose}
            className="w-10 h-10 items-center justify-center rounded-full bg-zinc-800"
            hitSlop={8}
          >
            <X size={24} color="#a1a1aa" />
          </TouchableOpacity>
        </View>

        {/* ׳‘׳׳ ׳¨ ׳׳¦׳‘ ׳×׳¦׳•׳’׳” ׳׳§׳“׳™׳׳” */}
        {isPreviewMode && (
          <View className="mx-4 mt-2 mb-4 p-3 rounded-lg bg-yellow-500/20 border border-yellow-500/50">
            <Text className="text-yellow-400 text-center text-sm font-medium">
              ׳׳¦׳‘ ׳×׳¦׳•׳’׳” ׳׳§׳“׳™׳׳” - ׳¨׳›׳™׳©׳•׳× ׳׳•׳©׳‘׳×׳•׳×
            </Text>
          </View>
        )}

        {/* ׳‘׳׳ ׳¨ Expo Go */}
        {isExpoGo && !isPreviewMode && (
          <View className="mx-4 mt-2 mb-4 p-3 rounded-lg bg-blue-500/20 border border-blue-500/50">
            <Text className="text-blue-400 text-center text-sm font-medium">
              Expo Go - ׳¨׳›׳™׳©׳•׳× ׳׳ ׳–׳׳™׳ ׳•׳×
            </Text>
          </View>
        )}

        {/* ׳›׳•׳×׳¨׳× */}
        <View className="px-6 pt-4 pb-6">
          <Text className="text-white text-3xl font-bold text-center mb-2">
            ׳›׳•׳×׳¨׳× ׳׳¡׳ ׳”׳×׳©׳׳•׳
          </Text>
          <Text className="text-zinc-400 text-base text-center">
            ׳›׳•׳×׳¨׳× ׳׳©׳ ׳” ׳׳׳¡׳ ׳”׳×׳©׳׳•׳
          </Text>
        </View>

        {/* ׳¨׳©׳™׳׳× ׳×׳›׳•׳ ׳•׳× */}
        <View className="px-6 pb-6">
          {FEATURES.map((feature) => (
            <View
              key={feature}
              className={`${tw.flexRow} items-center gap-3 mb-3`}
            >
              <View className="w-6 h-6 items-center justify-center">
                <ChevronLeft size={20} color="#4fc3f7" />
              </View>
              <Text className={`text-white text-base flex-1 ${tw.textStart}`}>
                {feature}
              </Text>
            </View>
          ))}
        </View>

        {/* ׳›׳•׳×׳¨׳× ׳×׳׳—׳•׳¨ */}
        <View className="bg-white py-3 px-6">
          <Text className="text-zinc-900 text-center font-semibold text-base">
            ׳”׳¦׳˜׳¨׳£ ׳”׳™׳•׳ ׳‘׳׳—׳™׳¨ ׳”׳˜׳•׳‘ ׳‘׳™׳•׳×׳¨
          </Text>
        </View>

        {/* ׳›׳¨׳˜׳™׳¡׳™ ׳×׳•׳›׳ ׳™׳•׳× */}
        <View className="px-4 py-6 gap-3">
          {/* ׳×׳•׳›׳ ׳™׳× ׳—׳•׳“׳©׳™׳× */}
          {monthlyPackage && (
            <TouchableOpacity
              onPress={() => {
                setSelectedPlan('monthly');
                trackEvent(ANALYTICS_EVENTS.planSelected, {
                  plan_id: monthlyPackage.identifier,
                  billing_period: 'monthly',
                });
              }}
              className={`rounded-xl p-4 border-2 ${
                selectedPlan === 'monthly'
                  ? 'border-[#4fc3f7] bg-zinc-900'
                  : 'border-zinc-700 bg-zinc-900'
              }`}
            >
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-zinc-400 text-lg font-semibold">
                  {monthlyPackage.priceString}
                </Text>
                <View className={`${tw.flexRow} items-center gap-3`}>
                  <Text className="text-white text-lg font-semibold">
                    ׳—׳•׳“׳©׳™
                  </Text>
                  <View
                    className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                      selectedPlan === 'monthly'
                        ? 'border-[#4fc3f7] bg-[#4fc3f7]'
                        : 'border-zinc-600'
                    }`}
                  >
                    {selectedPlan === 'monthly' && (
                      <Check size={14} color="#0a0a0a" strokeWidth={3} />
                    )}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* ׳×׳•׳›׳ ׳™׳× ׳©׳ ׳×׳™׳× */}
          {annualPackage && (
            <TouchableOpacity
              onPress={() => {
                setSelectedPlan('annual');
                trackEvent(ANALYTICS_EVENTS.planSelected, {
                  plan_id: annualPackage.identifier,
                  billing_period: 'yearly',
                });
              }}
              className={`rounded-xl p-4 border-2 ${
                selectedPlan === 'annual'
                  ? 'border-[#4fc3f7] bg-zinc-900'
                  : 'border-zinc-700 bg-zinc-900'
              }`}
            >
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-zinc-400 text-lg font-semibold">
                  {annualPackage.priceString}
                </Text>
                <View className={`${tw.flexRow} items-center gap-3`}>
                  <Text className="text-white text-lg font-semibold">׳©׳ ׳×׳™</Text>
                  <View
                    className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                      selectedPlan === 'annual'
                        ? 'border-[#4fc3f7] bg-[#4fc3f7]'
                        : 'border-zinc-600'
                    }`}
                  >
                    {selectedPlan === 'annual' && (
                      <Check size={14} color="#0a0a0a" strokeWidth={3} />
                    )}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ׳˜׳§׳¡׳˜ ׳׳™׳“׳¢ */}
        <Text className="text-zinc-500 text-center text-sm px-6 mb-4">
          ׳”׳¦׳˜׳¨׳£ ׳”׳™׳•׳, ׳‘׳˜׳ ׳‘׳›׳ ׳¢׳×.
        </Text>

        {/* ׳›׳₪׳×׳•׳¨ ׳”׳׳©׳ */}
        <View className="px-6 mb-6">
          <TouchableOpacity
            onPress={handleContinue}
            disabled={isPurchasing || isPreviewMode}
            className={`bg-[#4fc3f7] rounded-xl py-4 items-center ${
              isPurchasing || isPreviewMode ? 'opacity-60' : ''
            }`}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text className="text-[#0a0a0a] text-lg font-bold">׳”׳׳©׳</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ׳§׳™׳©׳•׳¨׳™׳ ׳×׳—׳×׳•׳ ׳™׳ */}
        <View className={`${tw.flexRow} justify-center gap-8 pb-6`}>
          <TouchableOpacity
            onPress={handleRestore}
            disabled={isRestoring || isPreviewMode}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#a1a1aa" />
            ) : (
              <Text className="text-zinc-500 text-sm">׳©׳—׳–׳•׳¨</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleTerms}>
            <Text className="text-zinc-500 text-sm">׳×׳ ׳׳™ ׳©׳™׳׳•׳©</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handlePrivacy}>
            <Text className="text-zinc-500 text-sm">׳₪׳¨׳˜׳™׳•׳×</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

