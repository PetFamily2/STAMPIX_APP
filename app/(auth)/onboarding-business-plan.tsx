import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  BUSINESS_ONBOARDING_ROUTES,
  getBusinessOnboardingProgressStep,
  getBusinessOnboardingTotalSteps,
  isAdditionalBusinessFlow,
  withBusinessOnboardingFlow,
} from '@/lib/onboarding/businessOnboardingFlow';
import { useBusinessOnboardingDraftPersistence } from '@/lib/onboarding/useBusinessOnboardingDraftPersistence';
import {
  buildComparisonRows,
  normalizePlanCatalog,
  type PlanId,
} from '@/lib/subscription/planComparison';

export default function OnboardingBusinessPlanScreen() {
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const { businessId } = useOnboarding();
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);
  const isAdditionalFlow = isAdditionalBusinessFlow(flow);
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
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'plan', flow }).catch(() => {});
  }, [flow, saveStep]);

  useEffect(() => {
    if (businessId) {
      return;
    }

    safePush(
      withBusinessOnboardingFlow(
        BUSINESS_ONBOARDING_ROUTES.createBusiness,
        flow
      )
    );
  }, [businessId, flow]);

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
    try {
      await saveStep({ step: 'plan', flow });
    } catch {
      // Keep onboarding flow moving even if draft persistence fails.
    }

    if (selectedPlan === 'starter') {
      setIsSubmitting(true);
      try {
        await syncBusinessSubscription({
          businessId,
          plan: 'starter',
          status: 'active',
          provider: 'manual',
        });
        safePush(
          withBusinessOnboardingFlow(
            BUSINESS_ONBOARDING_ROUTES.createProgram,
            flow
          )
        );
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
            onPress={() =>
              safeDismissTo(
                isAdditionalFlow
                  ? withBusinessOnboardingFlow(
                      BUSINESS_ONBOARDING_ROUTES.createBusiness,
                      flow
                    )
                  : BUSINESS_ONBOARDING_ROUTES.businessCampaignRelevance
              )
            }
          />
          <OnboardingProgress
            total={getBusinessOnboardingTotalSteps(flow)}
            current={getBusinessOnboardingProgressStep('plan', flow)}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>בחירת מסלול לעסק</Text>
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
          safePush(
            withBusinessOnboardingFlow(
              BUSINESS_ONBOARDING_ROUTES.createProgram,
              flow
            )
          );
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
    marginTop: 10,
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
