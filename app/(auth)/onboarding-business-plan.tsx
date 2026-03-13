import { useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { SubscriptionSalesPanel } from '@/components/subscription/SubscriptionSalesPanel';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import type { BillingPeriod } from '@/config/appConfig';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { api } from '@/convex/_generated/api';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_ROUTES,
  BUSINESS_ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboarding/businessOnboardingFlow';
import {
  buildComparisonRows,
  normalizePlanCatalog,
  type PlanId,
} from '@/lib/subscription/planComparison';

export default function OnboardingBusinessPlanScreen() {
  const { businessId } = useOnboarding();
  const planCatalogQuery = useQuery(api.entitlements.getPlanCatalog, {}) ?? [];
  const syncBusinessSubscription = useMutation(
    api.entitlements.syncBusinessSubscription
  );

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('pro');
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('yearly');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);

  useEffect(() => {
    if (businessId) {
      return;
    }

    safePush(BUSINESS_ONBOARDING_ROUTES.createBusiness);
  }, [businessId]);

  const planCatalog = useMemo(
    () => normalizePlanCatalog(planCatalogQuery),
    [planCatalogQuery]
  );
  const comparisonRows = useMemo(
    () => buildComparisonRows(planCatalog),
    [planCatalog]
  );

  const handleContinue = async () => {
    if (!businessId || isSubmitting) {
      return;
    }

    setError(null);

    if (selectedPlan === 'starter') {
      setIsSubmitting(true);
      try {
        await syncBusinessSubscription({
          businessId,
          plan: 'starter',
          status: 'active',
          provider: 'manual',
        });
        safePush(BUSINESS_ONBOARDING_ROUTES.createProgram);
      } catch {
        setError('לא הצלחנו לשמור את בחירת המסלול. נסו שוב.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsUpgradeVisible(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeDismissTo(BUSINESS_ONBOARDING_ROUTES.usageArea)}
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.plan}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>בחירת מסלול לעסק</Text>
          <Text style={styles.subtitle}>
            Starter מתאים להתחלה. Pro AI פותח את המוצר המלא לרוב העסקים,
            ו-Premium AI מוסיף בניית סגמנטים ושמירת קהלים לעבודה מדויקת יותר.
          </Text>
        </View>

        {isSubmitting && selectedPlan === 'starter' ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#2563EB" />
            <Text style={styles.loadingText}>שומרים בחירה...</Text>
          </View>
        ) : null}

        <View style={styles.panelWrap}>
          <SubscriptionSalesPanel
            plans={planCatalog}
            rows={comparisonRows}
            selectedPlan={selectedPlan}
            billingPeriod={billingPeriod}
            context="onboarding"
            ctaLabel={
              selectedPlan === 'starter' ? 'המשך עם Starter' : 'המשך למסלול'
            }
            ctaDisabled={isSubmitting}
            ctaLoading={isSubmitting && selectedPlan === 'starter'}
            footerNote={error ?? undefined}
            footerNoteTone={error ? 'error' : 'default'}
            onSelectPlan={(plan) => {
              setError(null);
              setSelectedPlan(plan);
            }}
            onBillingPeriodChange={setBillingPeriod}
            onPressCta={() => {
              void handleContinue();
            }}
          />
        </View>
      </View>

      <UpgradeModal
        visible={isUpgradeVisible}
        businessId={businessId}
        initialPlan={selectedPlan === 'premium' ? 'premium' : 'pro'}
        initialBillingPeriod={billingPeriod}
        reason="onboarding_plan"
        featureKey="onboarding_plan_selection"
        onClose={() => setIsUpgradeVisible(false)}
        onSuccess={() => {
          safePush(BUSINESS_ONBOARDING_ROUTES.createProgram);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBFAF7',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    marginTop: 24,
    gap: 8,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'right',
  },
  loadingRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
    textAlign: 'right',
  },
  panelWrap: {
    flex: 1,
    paddingTop: 14,
  },
});
