import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlanComparisonTable } from '@/components/subscription/PlanComparisonTable';
import {
  type BillingPeriod,
  IS_DEV_MODE,
  REVENUECAT_PACKAGE_BY_PLAN_PERIOD,
} from '@/config/appConfig';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { api } from '@/convex/_generated/api';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { safeBack } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';
import { tw } from '@/lib/rtl';
import {
  buildComparisonRows,
  normalizePlanCatalog,
  type PlanId,
} from '@/lib/subscription/planComparison';

export default function PaywallScreen() {
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';

  const planCatalogQuery = useQuery(api.entitlements.getPlanCatalog, {}) ?? [];
  const planCatalog = useMemo(
    () => normalizePlanCatalog(planCatalogQuery),
    [planCatalogQuery]
  );
  const comparisonRows = useMemo(
    () => buildComparisonRows(planCatalog),
    [planCatalog]
  );

  const {
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

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('pro');
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('yearly');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const resolvePackageId = useCallback(
    (plan: PlanId, period: BillingPeriod): string | null => {
      if (plan === 'starter') {
        return null;
      }
      return REVENUECAT_PACKAGE_BY_PLAN_PERIOD[plan][period];
    },
    []
  );

  const buildPlanAnalyticsPayload = useCallback(
    (plan: PlanId, period: BillingPeriod) => {
      const payload: Record<string, string> = {
        plan,
        billing_period: period,
      };
      const packageId = resolvePackageId(plan, period);
      if (packageId) {
        payload.plan_id = packageId;
      }
      return payload;
    },
    [resolvePackageId]
  );

  useFocusEffect(
    useCallback(() => {
      trackEvent(ANALYTICS_EVENTS.paywallViewed, {
        selected_plan: selectedPlan,
        billing_period: billingPeriod,
      });
    }, [billingPeriod, selectedPlan, trackEvent])
  );

  const finishOnboarding = useCallback(() => {
    if (completionRef.current) {
      return;
    }
    completionRef.current = true;
    trackEvent(ANALYTICS_EVENTS.onboardingCompleted, { role: 'business' });
  }, [trackEvent]);

  const handleClose = () => {
    completeStep();
    finishOnboarding();
    safeBack('/(auth)/sign-up');
  };

  const handleSelectPlan = (plan: PlanId) => {
    setSelectedPlan(plan);
    trackEvent(
      ANALYTICS_EVENTS.planSelected,
      buildPlanAnalyticsPayload(plan, billingPeriod)
    );
  };

  const handleBillingPeriodChange = (period: BillingPeriod) => {
    setBillingPeriod(period);
    trackEvent(
      ANALYTICS_EVENTS.planSelected,
      buildPlanAnalyticsPayload(selectedPlan, period)
    );
  };

  const handleContinue = async () => {
    if (selectedPlan === 'starter') {
      trackContinue({ plan: 'starter', billing_period: billingPeriod });
      completeStep();
      finishOnboarding();
      safeBack('/(auth)/sign-up');
      return;
    }

    if (isPreviewMode) {
      return;
    }

    const packageId = resolvePackageId(selectedPlan, billingPeriod);
    if (!packageId) {
      Alert.alert(
        'תצורה חסרה',
        'לא הוגדר מזהה חבילה למסלול שנבחר. בדקו EXPO_PUBLIC_RC_PACKAGE_*'
      );
      trackEvent(ANALYTICS_EVENTS.purchaseFailed, {
        plan: selectedPlan,
        billing_period: billingPeriod,
        error_code: 'missing_package_mapping',
      });
      return;
    }

    setIsPurchasing(true);
    trackContinue({
      plan: selectedPlan,
      billing_period: billingPeriod,
      plan_id: packageId,
    });
    trackEvent(ANALYTICS_EVENTS.checkoutStarted, {
      plan_id: packageId,
      plan: selectedPlan,
      billing_period: billingPeriod,
    });

    try {
      const success = await purchasePackage(packageId);
      if (success) {
        trackEvent(ANALYTICS_EVENTS.purchaseCompleted, {
          plan_id: packageId,
          plan: selectedPlan,
          billing_period: billingPeriod,
        });
        completeStep();
        finishOnboarding();
        safeBack('/(auth)/sign-up');
        return;
      }

      trackEvent(ANALYTICS_EVENTS.purchaseFailed, {
        plan_id: packageId,
        plan: selectedPlan,
        billing_period: billingPeriod,
        error_code: isExpoGo
          ? 'expo_go'
          : isConfigured
            ? 'cancelled_or_failed'
            : 'not_configured',
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleShowPaywall = async () => {
    if (isPreviewMode) {
      return;
    }
    if (isExpoGo) {
      Alert.alert('Expo Go', 'רכישות לא זמינות ב-Expo Go. השתמשו ב-Dev Build.');
      return;
    }
    if (!isConfigured) {
      Alert.alert('תצורה חסרה', 'נא לבדוק מפתחות RevenueCat בסביבה.');
      return;
    }

    try {
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: 'stampix_pro',
      });
      if (
        result === PAYWALL_RESULT.PURCHASED ||
        result === PAYWALL_RESULT.RESTORED
      ) {
        completeStep();
        finishOnboarding();
        safeBack('/(auth)/sign-up');
      }
    } catch {
      Alert.alert('שגיאה', 'לא הצלחנו לפתוח את ה-Paywall. נסו שוב.');
    }
  };

  const handleCustomerCenter = async () => {
    if (isPreviewMode) {
      return;
    }
    if (isExpoGo) {
      Alert.alert('Expo Go', 'Customer Center לא זמין ב-Expo Go.');
      return;
    }
    if (!isConfigured) {
      Alert.alert('תצורה חסרה', 'נא לבדוק מפתחות RevenueCat בסביבה.');
      return;
    }
    try {
      await RevenueCatUI.presentCustomerCenter();
    } catch {
      Alert.alert('שגיאה', 'לא הצלחנו לפתוח את Customer Center. נסו שוב.');
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
        safeBack('/(auth)/sign-up');
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleLegal = () => {
    router.push('/(auth)/legal');
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-[#0a0a0a] items-center justify-center">
        <ActivityIndicator size="large" color="#4fc3f7" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0a0a0a]" edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className={`${tw.flexRow} ${tw.justifyEnd} px-4 pt-4`}>
          <TouchableOpacity
            onPress={handleClose}
            className="w-10 h-10 items-center justify-center rounded-full bg-zinc-800"
            hitSlop={8}
          >
            <X size={24} color="#a1a1aa" />
          </TouchableOpacity>
        </View>

        {isPreviewMode ? (
          <View className="mx-4 mt-2 mb-4 p-3 rounded-lg bg-yellow-500/20 border border-yellow-500/50">
            <Text className="text-yellow-400 text-center text-sm font-medium">
              מצב תצוגה מקדימה - רכישות מושבתות
            </Text>
          </View>
        ) : null}

        {isExpoGo && !isPreviewMode ? (
          <View className="mx-4 mt-2 mb-4 p-3 rounded-lg bg-blue-500/20 border border-blue-500/50">
            <Text className="text-blue-400 text-center text-sm font-medium">
              Expo Go - רכישות לא זמינות
            </Text>
          </View>
        ) : null}

        <View className="px-6 pt-4 pb-4">
          <Text className="text-white text-3xl font-bold text-center mb-2">
            בחרו מסלול שמתאים לעסק שלכם
          </Text>
          <Text className="text-zinc-400 text-base text-center">
            Starter בחינם, או שדרוג ל-Pro AI / Unlimited AI.
          </Text>
        </View>

        <View className="px-4 pb-6">
          <PlanComparisonTable
            plans={planCatalog}
            rows={comparisonRows}
            selectedPlan={selectedPlan}
            billingPeriod={billingPeriod}
            onSelectPlan={handleSelectPlan}
            onBillingPeriodChange={handleBillingPeriodChange}
            popularPlan="pro"
            popularLabel="הכי פופולרי"
          />
        </View>

        <Text className="text-zinc-500 text-center text-sm px-6 mb-4">
          הצטרפו היום, בטלו בכל עת.
        </Text>

        <View className="px-6 mb-6">
          <TouchableOpacity
            onPress={handleContinue}
            disabled={
              isPurchasing || (isPreviewMode && selectedPlan !== 'starter')
            }
            className={`bg-[#4fc3f7] rounded-xl py-4 items-center ${
              isPurchasing || (isPreviewMode && selectedPlan !== 'starter')
                ? 'opacity-60'
                : ''
            }`}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text className="text-[#0a0a0a] text-lg font-bold">
                {selectedPlan === 'starter' ? 'המשך עם Starter' : 'המשך לתשלום'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="px-6 mb-6 gap-3">
          <TouchableOpacity
            onPress={handleShowPaywall}
            disabled={isPreviewMode}
            className={`bg-zinc-900 rounded-xl py-3 items-center border border-zinc-700 ${
              isPreviewMode ? 'opacity-60' : ''
            }`}
          >
            <Text className="text-white text-sm font-semibold">
              הצגת Paywall
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleCustomerCenter}
            disabled={isPreviewMode}
            className={`bg-transparent rounded-xl py-3 items-center border border-zinc-700 ${
              isPreviewMode ? 'opacity-60' : ''
            }`}
          >
            <Text className="text-zinc-300 text-sm font-semibold">
              ניהול מנוי (Customer Center)
            </Text>
          </TouchableOpacity>
        </View>

        <View className={`${tw.flexRow} justify-center gap-8 pb-6`}>
          <TouchableOpacity
            onPress={handleRestore}
            disabled={isRestoring || isPreviewMode}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#a1a1aa" />
            ) : (
              <Text className="text-zinc-500 text-sm">שחזור רכישות</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLegal}>
            <Text className="text-zinc-500 text-sm">מסמך משפטי</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
