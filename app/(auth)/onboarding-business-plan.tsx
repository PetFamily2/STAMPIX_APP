import { useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { PlanComparisonTable } from '@/components/subscription/PlanComparisonTable';
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
    <SafeAreaView style={styles.container}>
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
            Starter חינם להתחלה. מסלולי Pro ו-Unlimited פותחים יכולות AI ודוחות
            מתקדמים.
          </Text>
        </View>

        <PlanComparisonTable
          plans={planCatalog}
          rows={comparisonRows}
          selectedPlan={selectedPlan}
          billingPeriod={billingPeriod}
          onSelectPlan={setSelectedPlan}
          onBillingPeriodChange={setBillingPeriod}
          popularPlan="pro"
          popularLabel="הכי פופולרי"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.footer}>
          {isSubmitting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#2563EB" />
              <Text style={styles.loadingText}>שומרים בחירה...</Text>
            </View>
          ) : null}
          <ContinueButton
            onPress={() => {
              void handleContinue();
            }}
            label={
              selectedPlan === 'starter' ? 'המשך עם Starter' : 'המשך לתשלום'
            }
            disabled={isSubmitting}
          />
        </View>
      </View>

      <UpgradeModal
        visible={isUpgradeVisible}
        businessId={businessId}
        initialPlan={selectedPlan === 'unlimited' ? 'unlimited' : 'pro'}
        initialBillingPeriod={billingPeriod}
        reason="onboarding_plan"
        featureKey="business_onboarding"
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
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    marginTop: 32,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    lineHeight: 20,
    textAlign: 'right',
  },
  errorText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
    textAlign: 'right',
  },
  footer: {
    marginTop: 'auto',
  },
  loadingRow: {
    marginBottom: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
    textAlign: 'right',
  },
});
