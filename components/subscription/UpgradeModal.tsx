import { useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  normalizePlanCatalog,
  type PlanCatalogItem,
} from '@/lib/subscription/planComparison';
import { SubscriptionSalesPanel } from './SubscriptionSalesPanel';

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

function buildRevenueCatBusinessAppUserId(businessId: Id<'businesses'>) {
  return `business:${String(businessId)}`;
}

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
        maxCampaigns: 5,
        maxAiExecutionsPerMonth: 100,
        maxTeamSeats: 5,
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
        maxCampaigns: 10,
        maxAiExecutionsPerMonth: 300,
        maxTeamSeats: 20,
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
  const insets = useSafeAreaInsets();
  const planCatalogQuery = useQuery(api.entitlements.getPlanCatalog, {}) ?? [];
  const syncBusinessSubscription = useMutation(
    api.entitlements.syncBusinessSubscription
  );
  const { isConfigured, isExpoGo, purchasePackage } = useRevenueCat();

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

  const reasonCopy =
    PLAN_REASON_COPY[reason] ??
    'שדרוג פותח יותר יכולות ניהול קמפיינים ופעילות לקוחות.';
  const featureAreaLabel = getUpgradeAreaLabel(featureKey);
  const isBillingLive = PAYMENT_SYSTEM_ENABLED && isConfigured && !isExpoGo;

  const handleUpgrade = async () => {
    if (!businessId || isSubmitting) {
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

        const purchased = await purchasePackage(rcPackageId, {
          appUserId: buildRevenueCatBusinessAppUserId(businessId),
          syncUserSubscription: false,
        });
        if (!purchased) {
          return;
        }
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
    } catch {
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
                רכישה אמיתית לא זמינה כרגע. לחיצה על הכפתור תעדכן לעסק מסלול
                בדיקה כדי לאפשר לכם להמשיך לבדוק את המוצר.
              </Text>
            </View>
          ) : null}

          <View style={styles.periodSummary}>
            <Text style={styles.periodSummaryText}>
              מחזור נוכחי: {BILLING_PERIOD_LABELS[billingPeriod]}
            </Text>
          </View>

          <View style={styles.panelWrap}>
            <SubscriptionSalesPanel
              plans={paidPlans}
              selectedPlan={selectedPlan}
              billingPeriod={billingPeriod}
              visiblePlans={['pro', 'premium']}
              context="upgrade"
              ctaLabel={isBillingLive ? 'המשך לרכישה' : 'הפעלת מסלול בדיקה'}
              ctaDisabled={isSubmitting}
              ctaLoading={isSubmitting}
              footerInsetBottom={Math.max(insets.bottom, 6)}
              footerBottomSlot={
                <Pressable onPress={onClose} style={styles.cancelButton}>
                  <Text style={styles.cancelText}>אולי אחר כך</Text>
                </Pressable>
              }
              onSelectPlan={(plan) =>
                setSelectedPlan(plan === 'premium' ? 'premium' : 'pro')
              }
              onBillingPeriodChange={setBillingPeriod}
              onPressCta={() => {
                void handleUpgrade();
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 12,
    maxHeight: '92%',
    minHeight: 560,
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
    lineHeight: 26,
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
    marginTop: 12,
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
  periodSummary: {
    marginTop: 10,
    alignItems: 'flex-end',
  },
  periodSummaryText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },
  panelWrap: {
    flex: 1,
    paddingTop: 10,
  },
  cancelButton: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
});
