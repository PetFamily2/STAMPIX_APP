import { useConvex, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  BILLING_UNAVAILABLE_TITLE_HE,
  buildRevenueCatBusinessAppUserId,
  evaluateRevenueCatBillingGuard,
  isServerConfirmedPaidEntitlement,
  SERVER_AUTHORITATIVE_BILLING_ENABLED,
  SERVER_SYNC_PENDING_MESSAGE_HE,
  SERVER_SYNC_TIMEOUT_MESSAGE_HE,
} from '@/lib/subscription/billingGuards';
import { getUpgradeAreaLabel } from '@/lib/subscription/lockedAreaCopy';
import {
  normalizePlanCatalog,
  type PlanCatalogItem,
} from '@/lib/subscription/planComparison';
import { SubscriptionSalesPanel } from './SubscriptionSalesPanel';
import { alignItems, flexDirection, justifyContent } from '@/lib/rtl';

const PLAN_LABELS: Record<'pro' | 'premium', string> = {
  pro: 'Pro',
  premium: 'Premium',
};

const SERVER_SYNC_TIMEOUT_MS = 30_000;
const SERVER_SYNC_POLL_INTERVAL_MS = 2_000;

type BillingSyncStatus =
  | 'idle'
  | 'pending_purchase'
  | 'pending_restore'
  | 'timeout';

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const convex = useConvex();
  const planCatalogQuery = useQuery(api.entitlements.getPlanCatalog, {}) ?? [];
  const { isConfigured, isExpoGo, purchasePackage, restorePurchases } =
    useRevenueCat();

  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'premium'>(
    initialPlan
  );
  const [billingPeriod, setBillingPeriod] =
    useState<BillingPeriod>(initialBillingPeriod);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<BillingSyncStatus>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    mode: 'purchase' | 'restore';
    plan: 'pro' | 'premium';
    billingPeriod: BillingPeriod;
  } | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSelectedPlan(initialPlan);
    setBillingPeriod(initialBillingPeriod);
    setSyncStatus('idle');
    setSyncMessage(null);
    setPendingConfirmation(null);
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
  const rcPackageId =
    REVENUECAT_PACKAGE_BY_PLAN_PERIOD[selectedPlan][billingPeriod];
  const businessAppUserId = buildRevenueCatBusinessAppUserId(
    businessId ? String(businessId) : null
  );
  const billingGuard = evaluateRevenueCatBillingGuard({
    paymentSystemEnabled: PAYMENT_SYSTEM_ENABLED,
    serverAuthoritativeBillingEnabled: SERVER_AUTHORITATIVE_BILLING_ENABLED,
    isRevenueCatConfigured: isConfigured,
    isExpoGo,
    packageId: rcPackageId,
    businessAppUserId,
  });
  const isBillingLive = billingGuard.canStart;
  const isWaitingForServer =
    syncStatus === 'pending_purchase' || syncStatus === 'pending_restore';
  const isBusy = isSubmitting || isWaitingForServer;

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
      setPendingConfirmation({ mode, plan, billingPeriod: period });
      setSyncStatus(
        mode === 'purchase' ? 'pending_purchase' : 'pending_restore'
      );
      setSyncMessage(SERVER_SYNC_PENDING_MESSAGE_HE);

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
            setSyncStatus('idle');
            setSyncMessage(null);
            setPendingConfirmation(null);
            onSuccess?.();
            onClose();
            return true;
          }
        } catch {
          // Brief Convex/network lag is expected while the webhook is processed.
        }

        await sleep(SERVER_SYNC_POLL_INTERVAL_MS);
      }

      setSyncStatus('timeout');
      setSyncMessage(SERVER_SYNC_TIMEOUT_MESSAGE_HE);
      return false;
    },
    [businessId, convex, onClose, onSuccess]
  );

  const retryServerSync = async () => {
    if (!pendingConfirmation || isBusy) {
      return;
    }

    setIsSubmitting(true);
    try {
      await waitForServerEntitlements(
        pendingConfirmation.mode,
        pendingConfirmation.plan,
        pendingConfirmation.billingPeriod
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpgrade = async () => {
    if (syncStatus === 'timeout' && pendingConfirmation) {
      await retryServerSync();
      return;
    }

    if (!businessId || isBusy) {
      return;
    }

    if (!billingGuard.canStart || !rcPackageId || !businessAppUserId) {
      const guardMessage =
        billingGuard.message ?? SERVER_SYNC_TIMEOUT_MESSAGE_HE;
      setSyncMessage(guardMessage);
      Alert.alert(BILLING_UNAVAILABLE_TITLE_HE, guardMessage);
      return;
    }

    setIsSubmitting(true);
    try {
      const purchased = await purchasePackage(rcPackageId, {
        appUserId: businessAppUserId,
        syncUserSubscription: false,
      });
      if (!purchased) {
        return;
      }

      await waitForServerEntitlements('purchase', selectedPlan, billingPeriod);
    } catch {
      Alert.alert('שגיאה', 'לא הצלחנו להשלים את השדרוג. נסו שוב.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestore = async () => {
    if (!businessId || isBusy) {
      return;
    }

    if (!billingGuard.canStart || !businessAppUserId) {
      const guardMessage =
        billingGuard.message ?? SERVER_SYNC_TIMEOUT_MESSAGE_HE;
      setSyncMessage(guardMessage);
      Alert.alert(BILLING_UNAVAILABLE_TITLE_HE, guardMessage);
      return;
    }

    setIsSubmitting(true);
    try {
      const restored = await restorePurchases({
        appUserId: businessAppUserId,
        syncUserSubscription: false,
      });
      if (!restored) {
        return;
      }

      await waitForServerEntitlements('restore', selectedPlan, billingPeriod);
    } finally {
      setIsSubmitting(false);
    }
  };

  const ctaLabel =
    syncStatus === 'timeout'
      ? 'בדיקה חוזרת'
      : isWaitingForServer
        ? 'מאמתים...'
        : isBillingLive
          ? 'המשך לרכישה'
          : 'רכישה לא זמינה';

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
              <Text style={styles.devBannerTitle}>חיוב לא זמין</Text>
              <Text style={styles.devBannerText}>{billingGuard.message}</Text>
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
              ctaLabel={ctaLabel}
              ctaDisabled={isBusy}
              ctaLoading={isBusy}
              footerNote={syncMessage ?? undefined}
              footerNoteTone={syncStatus === 'timeout' ? 'error' : 'default'}
              footerInsetBottom={Math.max(insets.bottom, 6)}
              footerBottomSlot={
                <View style={styles.footerActionsRow}>
                  <Pressable
                    disabled={isBusy}
                    onPress={() => {
                      void handleRestore();
                    }}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelText}>שחזור רכישות</Text>
                  </Pressable>
                  <Pressable
                    disabled={isBusy}
                    onPress={onClose}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelText}>אולי אחר כך</Text>
                  </Pressable>
                </View>
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
    justifyContent: justifyContent.end,
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
    alignItems: alignItems.end,
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
  footerActionsRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
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
