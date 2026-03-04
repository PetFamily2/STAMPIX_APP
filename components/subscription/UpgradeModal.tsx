import { useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  BILLING_PERIOD_LABELS,
  PAYMENT_SYSTEM_ENABLED,
  REVENUECAT_PACKAGE_BY_PLAN_PERIOD,
  type BillingPeriod,
} from '@/config/appConfig';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

const PLAN_LABELS: Record<'pro' | 'unlimited', string> = {
  pro: 'Pro AI',
  unlimited: 'Unlimited AI',
};

type UpgradeModalProps = {
  visible: boolean;
  businessId: Id<'businesses'> | null;
  initialPlan?: 'pro' | 'unlimited';
  initialBillingPeriod?: BillingPeriod;
  reason?: 'feature_locked' | 'limit_reached' | 'subscription_inactive' | string;
  featureKey?: string;
  onClose: () => void;
  onSuccess?: () => void;
};

const PLAN_REASON_COPY: Record<string, string> = {
  feature_locked: 'הפיצ׳ר שבחרתם זמין במסלול מתקדם יותר.',
  limit_reached: 'הגעתם למגבלת המסלול. שדרוג יפתח את המגבלות.',
  subscription_inactive: 'המנוי אינו פעיל כרגע. שדרוג יחזיר גישה מלאה.',
};

export function UpgradeModal({
  visible,
  businessId,
  initialPlan = 'pro',
  initialBillingPeriod = 'monthly',
  reason = 'feature_locked',
  featureKey,
  onClose,
  onSuccess,
}: UpgradeModalProps) {
  const planCatalog = useQuery(api.entitlements.getPlanCatalog, {}) ?? [];
  const syncBusinessSubscription = useMutation(
    api.entitlements.syncBusinessSubscription
  );
  const { isConfigured, purchasePackage, refreshPurchaserInfo } =
    useRevenueCat();

  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'unlimited'>(
    initialPlan
  );
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSelectedPlan(initialPlan);
    setBillingPeriod(initialBillingPeriod);
  }, [initialBillingPeriod, initialPlan, visible]);

  const paidPlanCards = useMemo(() => {
    const fromCatalog = planCatalog
      .filter((plan) => plan.plan === 'pro' || plan.plan === 'unlimited')
      .map((plan) => ({
        plan: plan.plan as 'pro' | 'unlimited',
        label: plan.label,
        limits: plan.limits,
        pricing: plan.pricing,
      }));
    if (fromCatalog.length > 0) {
      return fromCatalog;
    }
    return [
      {
        plan: 'pro' as const,
        label: PLAN_LABELS.pro,
        limits: { maxCards: 5, maxCustomers: -1, maxAiCampaignsPerMonth: 5 },
        pricing: { monthly: 129, yearly: 1238, currency: 'ILS' as const },
      },
      {
        plan: 'unlimited' as const,
        label: PLAN_LABELS.unlimited,
        limits: { maxCards: -1, maxCustomers: -1, maxAiCampaignsPerMonth: 15 },
        pricing: { monthly: 249, yearly: 2390, currency: 'ILS' as const },
      },
    ];
  }, [planCatalog]);

  const selectedPlanCard =
    paidPlanCards.find((plan) => plan.plan === selectedPlan) ?? paidPlanCards[0];
  const reasonCopy =
    PLAN_REASON_COPY[reason] ?? 'שדרגו כדי לפתוח את הפיצ׳ר לעסק שלכם.';

  const handleUpgrade = async () => {
    if (!businessId || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const rcPackageId =
        REVENUECAT_PACKAGE_BY_PLAN_PERIOD[selectedPlan][billingPeriod];

      if (PAYMENT_SYSTEM_ENABLED && isConfigured) {
        if (!rcPackageId) {
          Alert.alert(
            'תצורה חסרה',
            'לא הוגדר מזהה חבילה ל-RevenueCat עבור המסלול שנבחר.'
          );
          return;
        }

        const purchased = await purchasePackage(rcPackageId);
        if (!purchased) {
          return;
        }
        await refreshPurchaserInfo();
      }

      await syncBusinessSubscription({
        businessId,
        plan: selectedPlan,
        status: 'active',
        period: billingPeriod,
        provider: PAYMENT_SYSTEM_ENABLED && isConfigured ? 'revenuecat' : 'mock',
      });

      onSuccess?.();
      onClose();
    } catch (_error) {
      Alert.alert('שגיאה', 'לא הצלחנו להשלים את השדרוג. נסו שוב.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>שדרוג מסלול</Text>
          <Text style={styles.subtitle}>{reasonCopy}</Text>
          {featureKey ? (
            <Text style={styles.featureText}>פיצ׳ר: {featureKey}</Text>
          ) : null}

          <View style={styles.periodWrap}>
            {(['monthly', 'yearly'] as const).map((period) => {
              const active = billingPeriod === period;
              return (
                <Pressable
                  key={period}
                  style={[
                    styles.periodButton,
                    active ? styles.periodButtonActive : null,
                  ]}
                  onPress={() => setBillingPeriod(period)}
                >
                  <Text
                    style={[
                      styles.periodText,
                      active ? styles.periodTextActive : null,
                    ]}
                  >
                    {BILLING_PERIOD_LABELS[period]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            style={styles.planList}
            contentContainerStyle={styles.planListContent}
          >
            {paidPlanCards.map((plan) => {
              const active = selectedPlan === plan.plan;
              const price =
                billingPeriod === 'monthly'
                  ? plan.pricing.monthly
                  : plan.pricing.yearly;

              return (
                <Pressable
                  key={plan.plan}
                  onPress={() => setSelectedPlan(plan.plan)}
                  style={[styles.planCard, active ? styles.planCardActive : null]}
                >
                  <View style={styles.planHeader}>
                    <Text style={styles.planName}>{plan.label}</Text>
                    <Text style={styles.planPrice}>₪{price}</Text>
                  </View>
                  <Text style={styles.planMeta}>
                    כרטיסים: {plan.limits.maxCards === -1 ? 'ללא הגבלה' : plan.limits.maxCards}
                  </Text>
                  <Text style={styles.planMeta}>
                    קמפייני AI לחודש:{' '}
                    {plan.limits.maxAiCampaignsPerMonth === -1
                      ? 'ללא הגבלה'
                      : plan.limits.maxAiCampaignsPerMonth}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            style={[styles.upgradeButton, isSubmitting ? styles.disabled : null]}
            onPress={handleUpgrade}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.upgradeButtonText}>שדרגו עכשיו</Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelText}>אולי אחר כך</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    maxHeight: '92%',
  },
  handle: {
    width: 46,
    height: 5,
    borderRadius: 99,
    alignSelf: 'center',
    backgroundColor: '#CBD5E1',
    marginBottom: 12,
  },
  title: {
    fontSize: 21,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'right',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#475569',
    textAlign: 'right',
    fontWeight: '600',
  },
  featureText: {
    marginTop: 4,
    fontSize: 12,
    color: '#1E40AF',
    textAlign: 'right',
    fontWeight: '700',
  },
  periodWrap: {
    marginTop: 14,
    flexDirection: 'row-reverse',
    gap: 8,
  },
  periodButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D5E1F2',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  periodButtonActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#2563EB',
  },
  periodText: {
    color: '#334155',
    fontWeight: '800',
    fontSize: 13,
  },
  periodTextActive: {
    color: '#1D4ED8',
  },
  planList: {
    marginTop: 12,
    maxHeight: 300,
  },
  planListContent: {
    gap: 10,
    paddingBottom: 8,
  },
  planCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D5E1F2',
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 4,
  },
  planCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  planHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  planName: {
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
  upgradeButton: {
    marginTop: 10,
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 6,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.7,
  },
});
