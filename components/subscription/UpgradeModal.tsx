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
  type BillingPeriod,
  PAYMENT_SYSTEM_ENABLED,
  REVENUECAT_PACKAGE_BY_PLAN_PERIOD,
} from '@/config/appConfig';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getUpgradeAreaLabel } from '@/lib/subscription/lockedAreaCopy';
import {
  getPlanPriceForPeriod,
  normalizePlanCatalog,
  type PlanCatalogItem,
} from '@/lib/subscription/planComparison';

const PLAN_LABELS: Record<'pro' | 'premium', string> = {
  pro: 'Pro AI',
  premium: 'Premium AI',
};

type UpgradeModalProps = {
  visible: boolean;
  businessId: Id<'businesses'> | null;
  initialPlan?: 'pro' | 'premium';
  initialBillingPeriod?: BillingPeriod;
  reason?:
    | 'feature_locked'
    | 'limit_reached'
    | 'subscription_inactive'
    | string;
  featureKey?: string;
  onClose: () => void;
  onSuccess?: () => void;
};

const PLAN_REASON_COPY: Record<string, string> = {
  feature_locked: 'האזור שבחרתם זמין במסלול מתקדם יותר.',
  limit_reached: 'הגעתם למגבלת השימוש של המסלול הנוכחי.',
  subscription_inactive: 'המנוי של העסק לא פעיל כרגע.',
  onboarding_plan: 'אפשר להתחיל עם Starter או לבחור מסלול בתשלום כבר עכשיו.',
};

function buildFallbackPlans(): PlanCatalogItem[] {
  return normalizePlanCatalog([
    {
      plan: 'pro',
      label: PLAN_LABELS.pro,
      pricing: { monthly: 129, yearly: 1238, currency: 'ILS' },
      limits: {
        maxCards: 5,
        maxCustomers: 2000,
        maxActiveRetentionActions: 5,
      },
      features: {
        team: true,
        advancedReports: true,
        marketingHub: true,
        smartAnalytics: true,
        segmentationBuilder: false,
        savedSegments: false,
      },
    },
    {
      plan: 'premium',
      label: PLAN_LABELS.premium,
      pricing: { monthly: 249, yearly: 2390, currency: 'ILS' },
      limits: {
        maxCards: 10,
        maxCustomers: 10000,
        maxActiveRetentionActions: 15,
      },
      features: {
        team: true,
        advancedReports: true,
        marketingHub: true,
        smartAnalytics: true,
        segmentationBuilder: true,
        savedSegments: true,
      },
    },
  ]).filter((plan) => plan.plan !== 'starter');
}

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
  const planCatalogQuery = useQuery(api.entitlements.getPlanCatalog, {}) ?? [];
  const syncBusinessSubscription = useMutation(
    api.entitlements.syncBusinessSubscription
  );
  const { isConfigured, isExpoGo, purchasePackage, refreshPurchaserInfo } =
    useRevenueCat();

  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'premium'>(
    initialPlan
  );
  const [billingPeriod, setBillingPeriod] =
    useState<BillingPeriod>(initialBillingPeriod);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSelectedPlan(initialPlan);
    setBillingPeriod(initialBillingPeriod);
  }, [initialBillingPeriod, initialPlan, visible]);

  const paidPlans = useMemo(() => {
    const normalized = normalizePlanCatalog(planCatalogQuery).filter(
      (plan): plan is PlanCatalogItem & { plan: 'pro' | 'premium' } =>
        plan.plan === 'pro' || plan.plan === 'premium'
    );

    return normalized.length > 0 ? normalized : buildFallbackPlans();
  }, [planCatalogQuery]);

  const selectedPlanCard =
    paidPlans.find((plan) => plan.plan === selectedPlan) ?? paidPlans[0];
  const reasonCopy =
    PLAN_REASON_COPY[reason] ?? 'שדרוג פותח יותר יכולות ניהול ושימור לקוחות.';
  const featureAreaLabel = getUpgradeAreaLabel(featureKey);
  const isBillingLive = PAYMENT_SYSTEM_ENABLED && isConfigured && !isExpoGo;

  const handleUpgrade = async () => {
    if (!businessId || isSubmitting || !selectedPlanCard) {
      return;
    }

    setIsSubmitting(true);
    try {
      const rcPackageId =
        REVENUECAT_PACKAGE_BY_PLAN_PERIOD[selectedPlan][billingPeriod];

      if (isBillingLive) {
        if (!rcPackageId) {
          Alert.alert(
            'תצורה חסרה',
            'לא הוגדר מזהה RevenueCat למסלול ולמחזור החיוב שנבחרו.'
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
        provider: isBillingLive ? 'revenuecat' : 'manual',
      });

      if (!isBillingLive) {
        Alert.alert(
          'מצב בדיקה',
          'התשלומים כבויים כרגע, לכן עודכן מסלול בדיקה לעסק במקום רכישה אמיתית.'
        );
      }

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
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>שדרוג מסלול</Text>
          <Text style={styles.subtitle}>{reasonCopy}</Text>
          {featureAreaLabel ? (
            <Text style={styles.featureText}>אזור: {featureAreaLabel}</Text>
          ) : null}

          {!isBillingLive ? (
            <View style={styles.devBanner}>
              <Text style={styles.devBannerTitle}>מצב בדיקה</Text>
              <Text style={styles.devBannerText}>
                רכישה אמיתית לא זמינה כרגע. בלחיצה על הכפתור יתעדכן לעסק מסלול
                בדיקה כדי לאפשר לכם להמשיך לבדוק את המוצר.
              </Text>
            </View>
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
            {paidPlans.map((plan) => {
              const active = selectedPlan === plan.plan;
              const price = getPlanPriceForPeriod(plan, billingPeriod);

              return (
                <Pressable
                  key={plan.plan}
                  onPress={() =>
                    setSelectedPlan(plan.plan === 'premium' ? 'premium' : 'pro')
                  }
                  style={[
                    styles.planCard,
                    active ? styles.planCardActive : null,
                  ]}
                >
                  <View style={styles.planHeader}>
                    <View style={styles.planTitleWrap}>
                      <Text style={styles.planName}>{plan.label}</Text>
                      <Text style={styles.planPrice}>
                        ₪{price}
                        <Text style={styles.planPriceSuffix}>
                          {billingPeriod === 'monthly' ? ' / חודש' : ' / שנה'}
                        </Text>
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.selectionDot,
                        active ? styles.selectionDotActive : null,
                      ]}
                    />
                  </View>

                  <View style={styles.planMetaGrid}>
                    <Text style={styles.planMeta}>
                      כרטיסים: {plan.limits.maxCards}
                    </Text>
                    <Text style={styles.planMeta}>
                      לקוחות: {plan.limits.maxCustomers}
                    </Text>
                    <Text style={styles.planMeta}>
                      קמפייני שימור פעילים:{' '}
                      {plan.limits.maxActiveRetentionActions}
                    </Text>
                  </View>

                  <View style={styles.featureRow}>
                    <Text style={styles.featureBadge}>
                      {plan.features.team ? 'צוות' : 'ללא צוות'}
                    </Text>
                    <Text style={styles.featureBadge}>
                      {plan.features.smartAnalytics
                        ? 'תובנות לקוחות'
                        : 'ללא תובנות'}
                    </Text>
                    <Text style={styles.featureBadge}>
                      {plan.features.segmentationBuilder
                        ? 'בונה סגמנטים'
                        : 'ללא סגמנטים'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            style={[
              styles.upgradeButton,
              isSubmitting ? styles.disabled : null,
            ]}
            onPress={handleUpgrade}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.upgradeButtonText}>
                {isBillingLive ? 'המשך לרכישה' : 'הפעלת מסלול בדיקה'}
              </Text>
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
    fontSize: 22,
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
    marginTop: 6,
    fontSize: 12,
    color: '#1D4ED8',
    textAlign: 'right',
    fontWeight: '700',
  },
  devBanner: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  devBannerTitle: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
  },
  devBannerText: {
    color: '#B45309',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'right',
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
    maxHeight: 320,
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
    gap: 8,
  },
  planCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  planHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  planTitleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  planName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'right',
  },
  planPrice: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '900',
    color: '#1E3A8A',
    textAlign: 'right',
  },
  planPriceSuffix: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  selectionDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#94A3B8',
    marginTop: 2,
  },
  selectionDotActive: {
    borderColor: '#2563EB',
    backgroundColor: '#2563EB',
  },
  planMetaGrid: {
    gap: 4,
  },
  planMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'right',
  },
  featureRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  featureBadge: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5E1F2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
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
