import { useFocusEffect } from '@react-navigation/native';
import { useConvex, useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { SubscriptionSalesPanel } from '@/components/subscription/SubscriptionSalesPanel';
import {
  type BillingPeriod,
  IS_DEV_MODE,
  PAYMENT_SYSTEM_ENABLED,
  REVENUECAT_PACKAGE_BY_PLAN_PERIOD,
} from '@/config/appConfig';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { api } from '@/convex/_generated/api';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { safeBack, safePush } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';
import {
  BILLING_UNAVAILABLE_TITLE_HE,
  buildRevenueCatBusinessAppUserId,
  evaluateRevenueCatBillingGuard,
  isServerConfirmedPaidEntitlement,
  SERVER_AUTHORITATIVE_BILLING_ENABLED,
  SERVER_SYNC_PENDING_MESSAGE_HE,
  SERVER_SYNC_TIMEOUT_MESSAGE_HE,
} from '@/lib/subscription/billingGuards';
import {
  buildComparisonRows,
  normalizePlanCatalog,
  type PlanId,
} from '@/lib/subscription/planComparison';

const SERVER_SYNC_TIMEOUT_MS = 30_000;
const SERVER_SYNC_POLL_INTERVAL_MS = 2_000;
const NATIVE_REVENUECAT_UI_ENABLED = false;
const NATIVE_REVENUECAT_UI_UNAVAILABLE_HE =
  'מסך RevenueCat המובנה לא זמין כרגע. השתמשו במסלול הרכישה המאומת באפליקציה.';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const convex = useConvex();
  const { businessId } = useOnboarding();
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
  const [serverSyncMessage, setServerSyncMessage] = useState<string | null>(
    null
  );

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

  const buildBillingGuard = useCallback(
    (packageId: string | null) =>
      evaluateRevenueCatBillingGuard({
        paymentSystemEnabled: PAYMENT_SYSTEM_ENABLED,
        serverAuthoritativeBillingEnabled: SERVER_AUTHORITATIVE_BILLING_ENABLED,
        isRevenueCatConfigured: isConfigured,
        isExpoGo,
        packageId,
        businessAppUserId: buildRevenueCatBusinessAppUserId(
          businessId ? String(businessId) : null
        ),
      }),
    [businessId, isConfigured, isExpoGo]
  );

  const waitForServerEntitlements = useCallback(
    async (
      mode: 'purchase' | 'restore',
      plan: 'pro' | 'premium',
      period: BillingPeriod
    ) => {
      if (!businessId) {
        return false;
      }

      const deadline = Date.now() + SERVER_SYNC_TIMEOUT_MS;
      setServerSyncMessage(SERVER_SYNC_PENDING_MESSAGE_HE);

      while (Date.now() <= deadline) {
        try {
          const entitlements = await convex.query(
            api.entitlements.getBusinessEntitlements,
            { businessId }
          );
          const confirmed =
            mode === 'purchase'
              ? isServerConfirmedPaidEntitlement(entitlements, plan, period)
              : isServerConfirmedPaidEntitlement(entitlements);

          if (confirmed) {
            setServerSyncMessage(null);
            return true;
          }
        } catch {
          // The webhook and Convex subscription state may lag briefly.
        }

        await sleep(SERVER_SYNC_POLL_INTERVAL_MS);
      }

      setServerSyncMessage(SERVER_SYNC_TIMEOUT_MESSAGE_HE);
      return false;
    },
    [businessId, convex]
  );

  const selectedPackageId = resolvePackageId(selectedPlan, billingPeriod);
  const selectedBillingGuard = buildBillingGuard(selectedPackageId);
  const isSelectedPaidBillingReady =
    selectedPlan !== 'starter' && selectedBillingGuard.canStart;
  const isNativeRevenueCatUiDisabled =
    !NATIVE_REVENUECAT_UI_ENABLED || !selectedBillingGuard.canStart;

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

    if (isPreviewMode || !PAYMENT_SYSTEM_ENABLED) {
      Alert.alert(
        'מצב בדיקה',
        'רכישות לא פעילות כרגע. אפשר להמשיך עם Starter או לעדכן מסלול בדיקה מתוך אזור העסק.'
      );
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

    const billingGuard = buildBillingGuard(packageId);
    const businessAppUserId = buildRevenueCatBusinessAppUserId(
      businessId ? String(businessId) : null
    );
    if (!billingGuard.canStart || !businessAppUserId) {
      const guardMessage =
        billingGuard.message ?? SERVER_SYNC_TIMEOUT_MESSAGE_HE;
      setServerSyncMessage(guardMessage);
      Alert.alert(BILLING_UNAVAILABLE_TITLE_HE, guardMessage);
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
      const success = await purchasePackage(packageId, {
        appUserId: businessAppUserId,
        syncUserSubscription: false,
      });
      if (success) {
        const confirmed = await waitForServerEntitlements(
          'purchase',
          selectedPlan === 'premium' ? 'premium' : 'pro',
          billingPeriod
        );
        if (confirmed) {
          trackEvent(ANALYTICS_EVENTS.purchaseCompleted, {
            plan_id: packageId,
            plan: selectedPlan,
            billing_period: billingPeriod,
          });
          completeStep();
          finishOnboarding();
          safeBack('/(auth)/sign-up');
        }
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
    if (!selectedBillingGuard.canStart) {
      const guardMessage =
        selectedBillingGuard.message ?? SERVER_SYNC_TIMEOUT_MESSAGE_HE;
      setServerSyncMessage(guardMessage);
      Alert.alert(BILLING_UNAVAILABLE_TITLE_HE, guardMessage);
      return;
    }

    Alert.alert(
      BILLING_UNAVAILABLE_TITLE_HE,
      NATIVE_REVENUECAT_UI_UNAVAILABLE_HE
    );
  };

  const handleCustomerCenter = async () => {
    if (!selectedBillingGuard.canStart) {
      const guardMessage =
        selectedBillingGuard.message ?? SERVER_SYNC_TIMEOUT_MESSAGE_HE;
      setServerSyncMessage(guardMessage);
      Alert.alert(BILLING_UNAVAILABLE_TITLE_HE, guardMessage);
      return;
    }

    Alert.alert(
      BILLING_UNAVAILABLE_TITLE_HE,
      NATIVE_REVENUECAT_UI_UNAVAILABLE_HE
    );
  };

  const handleRestore = async () => {
    if (isPreviewMode || !PAYMENT_SYSTEM_ENABLED) {
      return;
    }

    const packageId = resolvePackageId(selectedPlan, billingPeriod);
    const billingGuard = buildBillingGuard(packageId);
    const businessAppUserId = buildRevenueCatBusinessAppUserId(
      businessId ? String(businessId) : null
    );
    if (!billingGuard.canStart || !businessAppUserId) {
      const guardMessage =
        billingGuard.message ?? SERVER_SYNC_TIMEOUT_MESSAGE_HE;
      setServerSyncMessage(guardMessage);
      Alert.alert(BILLING_UNAVAILABLE_TITLE_HE, guardMessage);
      return;
    }

    setIsRestoring(true);
    try {
      const success = await restorePurchases({
        appUserId: businessAppUserId,
        syncUserSubscription: false,
      });
      if (success) {
        const confirmed = await waitForServerEntitlements(
          'restore',
          selectedPlan === 'premium' ? 'premium' : 'pro',
          billingPeriod
        );
        if (confirmed) {
          completeStep();
          finishOnboarding();
          safeBack('/(auth)/sign-up');
        }
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleOpenLegalDocument = () => {
    safePush('/(auth)/paywall/legal?document=terms');
  };

  const footerNote =
    serverSyncMessage ?? 'אין התחייבות ארוכה. תמיד אפשר לשנות מסלול בהמשך.';

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingSafeArea} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeButton}
            hitSlop={8}
          >
            <X size={22} color="#CBD5E1" />
          </TouchableOpacity>
        </View>

        {isPreviewMode || !PAYMENT_SYSTEM_ENABLED ? (
          <View style={[styles.banner, styles.warningBanner]}>
            <Text style={[styles.bannerText, styles.warningBannerText]}>
              מצב בדיקה. רכישות אמיתיות כבויות כרגע.
            </Text>
          </View>
        ) : null}

        {isExpoGo && !isPreviewMode ? (
          <View style={[styles.banner, styles.infoBanner]}>
            <Text style={[styles.bannerText, styles.infoBannerText]}>
              Expo Go לא תומך ברכישות. השתמשו ב-Dev Build.
            </Text>
          </View>
        ) : null}

        <View style={styles.heroBlock}>
          <Text style={styles.title}>
            בחרו את הדרך שבה העסק ישמור על לקוחות
          </Text>
        </View>

        <View style={styles.utilityLinksRow}>
          <TouchableOpacity
            onPress={handleShowPaywall}
            disabled={isNativeRevenueCatUiDisabled}
            style={styles.utilityLinkButton}
          >
            <Text
              style={[
                styles.utilityLinkText,
                isNativeRevenueCatUiDisabled
                  ? styles.utilityLinkTextDisabled
                  : null,
              ]}
            >
              הצגת Paywall של RevenueCat
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleCustomerCenter}
            disabled={isNativeRevenueCatUiDisabled}
            style={styles.utilityLinkButton}
          >
            <Text
              style={[
                styles.utilityLinkText,
                isNativeRevenueCatUiDisabled
                  ? styles.utilityLinkTextDisabled
                  : null,
              ]}
            >
              ניהול מנוי קיים
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.panelWrap}>
          <SubscriptionSalesPanel
            plans={planCatalog}
            rows={comparisonRows}
            selectedPlan={selectedPlan}
            billingPeriod={billingPeriod}
            context="paywall"
            ctaLabel={
              selectedPlan === 'starter' ? 'המשך עם Starter' : 'המשך לרכישה'
            }
            ctaDisabled={
              selectedPlan === 'starter' ? false : !isSelectedPaidBillingReady
            }
            ctaLoading={isPurchasing}
            footerNote={footerNote}
            footerNoteTone={serverSyncMessage ? 'error' : 'default'}
            footerInsetBottom={Math.max(insets.bottom, 12)}
            footerBottomSlot={
              <View style={styles.footerLinkRow}>
                <TouchableOpacity
                  onPress={() => {
                    void handleRestore();
                  }}
                  disabled={isRestoring || !selectedBillingGuard.canStart}
                >
                  {isRestoring ? (
                    <ActivityIndicator size="small" color="#94A3B8" />
                  ) : (
                    <Text style={styles.footerLinkText}>שחזור רכישות</Text>
                  )}
                </TouchableOpacity>
                <Pressable onPress={handleOpenLegalDocument}>
                  <Text style={styles.footerLinkText}>מסמך משפטי</Text>
                </Pressable>
              </View>
            }
            onSelectPlan={handleSelectPlan}
            onBillingPeriodChange={handleBillingPeriodChange}
            onPressCta={() => {
              void handleContinue();
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingSafeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  headerRow: {
    alignItems: 'flex-end',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
  },
  banner: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warningBanner: {
    borderColor: 'rgba(234, 179, 8, 0.5)',
    backgroundColor: 'rgba(234, 179, 8, 0.18)',
  },
  infoBanner: {
    borderColor: 'rgba(59, 130, 246, 0.5)',
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
  },
  bannerText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
  warningBannerText: {
    color: '#FDE68A',
  },
  infoBannerText: {
    color: '#BFDBFE',
  },
  heroBlock: {
    marginTop: 14,
    gap: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 29,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'right',
  },
  subtitle: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'right',
  },
  utilityLinksRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  utilityLinkButton: {
    flex: 1,
  },
  utilityLinkText: {
    color: '#7DD3FC',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  utilityLinkTextDisabled: {
    color: '#475569',
  },
  panelWrap: {
    flex: 1,
    paddingTop: 10,
  },
  footerLinkRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: 22,
    paddingTop: 2,
  },
  footerLinkText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
});
