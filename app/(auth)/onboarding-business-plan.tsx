import { useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { BILLING_PERIOD_LABELS, type BillingPeriod } from '@/config/appConfig';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { api } from '@/convex/_generated/api';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_ROUTES,
  BUSINESS_ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboarding/businessOnboardingFlow';

type PlanId = 'starter' | 'pro' | 'unlimited';

const FALLBACK_CATALOG = [
  {
    plan: 'starter' as const,
    label: 'Starter',
    pricing: { monthly: 0, yearly: 0, currency: 'ILS' as const },
    limits: { maxCards: 1, maxCustomers: 30, maxAiCampaignsPerMonth: 0 },
  },
  {
    plan: 'pro' as const,
    label: 'Pro AI',
    pricing: { monthly: 129, yearly: 1238, currency: 'ILS' as const },
    limits: { maxCards: 5, maxCustomers: -1, maxAiCampaignsPerMonth: 5 },
  },
  {
    plan: 'unlimited' as const,
    label: 'Unlimited AI',
    pricing: { monthly: 249, yearly: 2390, currency: 'ILS' as const },
    limits: { maxCards: -1, maxCustomers: -1, maxAiCampaignsPerMonth: 15 },
  },
];

export default function OnboardingBusinessPlanScreen() {
  const { businessId } = useOnboarding();
  const planCatalogQuery = useQuery(api.entitlements.getPlanCatalog, {}) ?? [];
  const syncBusinessSubscription = useMutation(
    api.entitlements.syncBusinessSubscription
  );

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('starter');
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);

  useEffect(() => {
    if (businessId) {
      return;
    }
    safePush(BUSINESS_ONBOARDING_ROUTES.createBusiness);
  }, [businessId]);

  const planCatalog = useMemo(() => {
    const normalized = planCatalogQuery
      .filter(
        (plan) =>
          plan.plan === 'starter' ||
          plan.plan === 'pro' ||
          plan.plan === 'unlimited'
      )
      .map((plan) => ({
        plan: plan.plan as PlanId,
        label: plan.label,
        pricing: plan.pricing,
        limits: plan.limits,
      }));
    return normalized.length > 0 ? normalized : FALLBACK_CATALOG;
  }, [planCatalogQuery]);

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
            Starter חינם להתחלה. מסלולי Pro ו-Unlimited פותחים יכולות AI ודוחות מתקדמים.
          </Text>
        </View>

        <View style={styles.periodWrap}>
          {(['monthly', 'yearly'] as const).map((period) => {
            const active = billingPeriod === period;
            return (
              <Pressable
                key={period}
                onPress={() => setBillingPeriod(period)}
                style={[styles.periodButton, active ? styles.periodButtonActive : null]}
              >
                <Text
                  style={[styles.periodText, active ? styles.periodTextActive : null]}
                >
                  {BILLING_PERIOD_LABELS[period]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.cardList}>
          {planCatalog.map((plan) => {
            const isActive = selectedPlan === plan.plan;
            const price =
              billingPeriod === 'monthly' ? plan.pricing.monthly : plan.pricing.yearly;

            return (
              <Pressable
                key={plan.plan}
                onPress={() => setSelectedPlan(plan.plan)}
                style={[styles.planCard, isActive ? styles.planCardActive : null]}
              >
                <View style={styles.planTopRow}>
                  <Text style={styles.planPrice}>₪{price}</Text>
                  <Text style={styles.planLabel}>{plan.label}</Text>
                </View>
                <Text style={styles.planMeta}>
                  כרטיסים: {plan.limits.maxCards === -1 ? 'ללא הגבלה' : plan.limits.maxCards}
                </Text>
                <Text style={styles.planMeta}>
                  לקוחות:{' '}
                  {plan.limits.maxCustomers === -1 ? 'ללא הגבלה' : plan.limits.maxCustomers}
                </Text>
                <Text style={styles.planMeta}>
                  קמפייני AI בחודש:{' '}
                  {plan.limits.maxAiCampaignsPerMonth === -1
                    ? 'ללא הגבלה'
                    : plan.limits.maxAiCampaignsPerMonth}
                </Text>
              </Pressable>
            );
          })}
        </View>

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
            label={selectedPlan === 'starter' ? 'המשך עם Starter' : 'המשך לתשלום'}
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
  periodWrap: {
    marginTop: 20,
    flexDirection: 'row-reverse',
    gap: 10,
  },
  periodButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodButtonActive: {
    borderColor: '#2563EB',
    backgroundColor: '#DBEAFE',
  },
  periodText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  periodTextActive: {
    color: '#1D4ED8',
  },
  cardList: {
    marginTop: 16,
    gap: 10,
  },
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 3,
  },
  planCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  planTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  planLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'right',
  },
  planPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1E3A8A',
    textAlign: 'left',
  },
  planMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
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
