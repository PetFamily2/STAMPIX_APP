import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { PlanComparisonTable } from '@/components/subscription/PlanComparisonTable';
import { BILLING_PERIOD_LABELS, type BillingPeriod } from '@/config/appConfig';
import { IS_RTL } from '@/lib/rtl';
import {
  buildComparisonRows,
  type ComparisonRow,
  computeAnnualSavings,
  computeEquivalentMonthlyPrice,
  formatPlanPrice,
  type PlanCatalogItem,
  type PlanId,
} from '@/lib/subscription/planComparison';

type SubscriptionSalesContext =
  | 'paywall'
  | 'onboarding'
  | 'settings'
  | 'upgrade';

type FooterMode = 'sticky' | 'inline';

type SubscriptionSalesPanelProps = {
  plans: PlanCatalogItem[];
  rows?: ComparisonRow[];
  selectedPlan: PlanId;
  billingPeriod: BillingPeriod;
  visiblePlans?: PlanId[];
  currentPlan?: PlanId;
  context: SubscriptionSalesContext;
  footerMode?: FooterMode;
  showPlanSelector?: boolean;
  ctaLabel: string;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
  footerNote?: string;
  footerNoteTone?: 'default' | 'error';
  footerInsetBottom?: number;
  footerBottomSlot?: ReactNode;
  onSelectPlan: (plan: PlanId) => void;
  onBillingPeriodChange: (period: BillingPeriod) => void;
  onPressCta: () => void;
};

type BillingDiscountBadgeProps = {
  percent: number;
  animate: boolean;
};

const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'premium'];
const COMPACT_BREAKPOINT = 392;

function BillingDiscountBadge({ percent, animate }: BillingDiscountBadgeProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      scale.setValue(1);
      translateY.setValue(0);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.08,
            duration: 650,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -1,
            duration: 650,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 650,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 650,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    pulseLoop.start();
    return () => {
      pulseLoop.stop();
    };
  }, [animate, scale, translateY]);

  return (
    <Animated.View
      style={[
        styles.billingOptionDiscountBadge,
        animate ? styles.billingOptionDiscountBadgeAnimated : null,
        {
          transform: [{ scale }, { translateY }],
        },
      ]}
    >
      <Text style={styles.billingOptionDiscountBadgeText}>{percent}% OFF</Text>
    </Animated.View>
  );
}

export function SubscriptionSalesPanel({
  plans,
  rows,
  selectedPlan,
  billingPeriod,
  visiblePlans,
  currentPlan,
  context,
  footerMode = 'sticky',
  showPlanSelector = true,
  ctaLabel,
  ctaDisabled = false,
  ctaLoading = false,
  footerNote,
  footerNoteTone = 'default',
  footerInsetBottom = 0,
  footerBottomSlot,
  onSelectPlan,
  onBillingPeriodChange,
  onPressCta,
}: SubscriptionSalesPanelProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isCompact = windowWidth <= COMPACT_BREAKPOINT || context === 'upgrade';
  const isStickyFooter = footerMode === 'sticky';

  const orderedPlans = useMemo(() => {
    const visibleOrder =
      visiblePlans && visiblePlans.length > 0
        ? PLAN_ORDER.filter((planId) => visiblePlans.includes(planId))
        : PLAN_ORDER;
    const byPlan = new Map<PlanId, PlanCatalogItem>(
      plans.map((plan) => [plan.plan, plan])
    );

    return visibleOrder
      .map((planId) => byPlan.get(planId))
      .filter((plan): plan is PlanCatalogItem => Boolean(plan));
  }, [plans, visiblePlans]);

  const comparisonRows = useMemo(
    () => rows ?? buildComparisonRows(orderedPlans),
    [orderedPlans, rows]
  );

  const selectedPlanCard =
    orderedPlans.find((plan) => plan.plan === selectedPlan) ?? orderedPlans[0];

  if (!selectedPlanCard) {
    return null;
  }

  const equivalentMonthly =
    selectedPlanCard.plan !== 'starter'
      ? computeEquivalentMonthlyPrice(selectedPlanCard.pricing)
      : null;
  const annualSavings =
    selectedPlanCard.plan !== 'starter'
      ? computeAnnualSavings(selectedPlanCard.pricing)
      : null;
  const isCurrentSelectedPlan = currentPlan === selectedPlanCard.plan;
  const footerSummaryLabel = isCurrentSelectedPlan
    ? 'המסלול הפעיל'
    : 'המסלול שבחרת';
  const monthlyBillingAmount = `₪${formatPlanPrice(selectedPlanCard.pricing.monthly)}`;
  const yearlyBillingAmount = `₪${formatPlanPrice(selectedPlanCard.pricing.yearly)}`;
  const monthlyOptionPrice =
    selectedPlanCard.plan === 'starter'
      ? 'חינם'
      : `${monthlyBillingAmount}/חודש`;
  const yearlyOptionPrice =
    selectedPlanCard.plan === 'starter'
      ? 'חינם'
      : equivalentMonthly
        ? `₪${formatPlanPrice(equivalentMonthly)}/חודש`
        : `${yearlyBillingAmount}/שנה`;

  const billingPeriods =
    selectedPlanCard.plan === 'starter'
      ? (['monthly'] as const)
      : (['monthly', 'yearly'] as const);

  const selectorSection = (
    <View style={styles.selectorRow}>
      {orderedPlans.map((plan) => {
        const active = plan.plan === selectedPlanCard.plan;
        const isCurrentPlan = currentPlan === plan.plan;

        return (
          <Pressable
            key={plan.plan}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelectPlan(plan.plan)}
            style={[
              styles.selectorButton,
              isCompact ? styles.selectorButtonCompact : null,
              active ? styles.selectorButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.selectorText,
                isCompact ? styles.selectorTextCompact : null,
                active ? styles.selectorTextActive : null,
              ]}
              numberOfLines={2}
            >
              {plan.label}
            </Text>
            {isCurrentPlan ? (
              <View
                style={[
                  styles.currentPlanBadge,
                  active ? styles.currentPlanBadgeActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.currentPlanBadgeText,
                    active ? styles.currentPlanBadgeTextActive : null,
                  ]}
                  numberOfLines={1}
                >
                  פעיל
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  const comparisonTable = (
    <PlanComparisonTable
      plans={plans}
      rows={comparisonRows}
      selectedPlan={selectedPlanCard.plan}
      visiblePlans={visiblePlans}
      currentPlan={currentPlan}
      onSelectPlan={onSelectPlan}
      headerSelectable={!showPlanSelector}
    />
  );

  const footerSection = (
    <View
      style={[
        styles.footerWrap,
        !isStickyFooter ? styles.footerWrapInline : null,
        { paddingBottom: footerInsetBottom },
      ]}
    >
      <View style={styles.footerCard}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryEyebrow}>{footerSummaryLabel}</Text>
          <Text
            style={[
              styles.summaryPlanName,
              isCompact ? styles.summaryPlanNameCompact : null,
            ]}
            numberOfLines={1}
          >
            {selectedPlanCard.label}
          </Text>
        </View>

        <View style={styles.billingOptionsRow}>
          {billingPeriods.map((period) => {
            const isStarterPlan = selectedPlanCard.plan === 'starter';
            const active = isStarterPlan || billingPeriod === period;
            const isYearly = period === 'yearly';
            const optionPrice = isYearly
              ? yearlyOptionPrice
              : monthlyOptionPrice;
            const optionLabel = isStarterPlan
              ? 'ללא חיוב'
              : BILLING_PERIOD_LABELS[period];
            const optionSubline = isStarterPlan
              ? 'ללא חיוב'
              : isYearly
                ? `חיוב ${yearlyBillingAmount} לשנה`
                : `חיוב ${monthlyBillingAmount} לחודש`;

            return (
              <Pressable
                key={period}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onBillingPeriodChange(period)}
                style={[
                  styles.billingOptionCard,
                  active ? styles.billingOptionCardActive : null,
                ]}
              >
                {isYearly && annualSavings ? (
                  <BillingDiscountBadge
                    percent={annualSavings.percent}
                    animate={annualSavings.percent === 20}
                  />
                ) : null}

                <View style={styles.billingOptionHeader}>
                  <Text
                    style={[
                      styles.billingOptionLabel,
                      active ? styles.billingOptionLabelActive : null,
                    ]}
                    numberOfLines={1}
                  >
                    {optionLabel}
                  </Text>

                  <View
                    style={[
                      styles.billingOptionIndicator,
                      active ? styles.billingOptionIndicatorActive : null,
                    ]}
                  >
                    {active ? (
                      <Text style={styles.billingOptionIndicatorText}>✓</Text>
                    ) : null}
                  </View>
                </View>

                <Text
                  style={[
                    styles.billingOptionPrice,
                    active ? styles.billingOptionPriceActive : null,
                  ]}
                  numberOfLines={1}
                >
                  {optionPrice}
                </Text>

                <Text style={styles.billingOptionSubline} numberOfLines={1}>
                  {optionSubline}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {footerNote ? (
          <Text
            style={[
              styles.footerNote,
              footerNoteTone === 'error' ? styles.footerNoteError : null,
            ]}
          >
            {footerNote}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: ctaDisabled || ctaLoading }}
          onPress={onPressCta}
          disabled={ctaDisabled || ctaLoading}
          style={[
            styles.ctaButton,
            ctaDisabled ? styles.ctaButtonDisabled : null,
          ]}
        >
          {ctaLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          )}
        </Pressable>

        {footerBottomSlot ? footerBottomSlot : null}
      </View>
    </View>
  );

  if (!isStickyFooter) {
    return (
      <View style={[styles.root, styles.rootInline]}>
        <View style={styles.inlineContent}>
          {showPlanSelector ? selectorSection : null}
          <View style={styles.inlineTableWrap}>{comparisonTable}</View>
          {footerSection}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        {showPlanSelector ? selectorSection : null}
        <View style={styles.tableWrap}>
          <ScrollView
            contentContainerStyle={styles.tableContent}
            showsVerticalScrollIndicator={false}
          >
            {comparisonTable}
          </ScrollView>
        </View>
      </View>

      {footerSection}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 12,
  },
  rootInline: {
    flex: 0,
    justifyContent: 'flex-start',
  },
  content: {
    flex: 1,
    minHeight: 0,
    gap: 10,
  },
  inlineContent: {
    gap: 10,
  },
  selectorRow: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    gap: 8,
  },
  selectorButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CFE0F7',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  selectorButtonCompact: {
    minHeight: 50,
    borderRadius: 16,
  },
  selectorButtonActive: {
    borderColor: '#2F6BFF',
    backgroundColor: '#EAF2FF',
  },
  selectorText: {
    color: '#0F172A',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  selectorTextCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  selectorTextActive: {
    color: '#1D4ED8',
  },
  currentPlanBadge: {
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  currentPlanBadgeActive: {
    backgroundColor: '#D9E8FF',
  },
  currentPlanBadgeText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
  },
  currentPlanBadgeTextActive: {
    color: '#1D4ED8',
  },
  tableWrap: {
    flex: 1,
    minHeight: 0,
  },
  inlineTableWrap: {
    gap: 0,
  },
  tableContent: {
    paddingBottom: 10,
  },
  footerWrap: {
    paddingTop: 2,
  },
  footerWrapInline: {
    paddingTop: 0,
  },
  footerCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D6E2F6',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
    shadowColor: '#2F6BFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  summaryHeader: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryEyebrow: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  summaryPlanName: {
    flexShrink: 1,
    color: '#0F172A',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  summaryPlanNameCompact: {
    fontSize: 17,
  },
  savingsBadge: {
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  savingsText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '800',
  },
  billingOptionsRow: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    gap: 8,
  },
  billingOptionCard: {
    flex: 1,
    minHeight: 86,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7E4F8',
    backgroundColor: '#F8FBFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    position: 'relative',
    overflow: 'visible',
  },
  billingOptionCardActive: {
    borderColor: '#2F6BFF',
    backgroundColor: '#EAF2FF',
  },
  billingOptionDiscountBadge: {
    position: 'absolute',
    top: -9,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    zIndex: 1,
  },
  billingOptionDiscountBadgeAnimated: {
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  billingOptionDiscountBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  billingOptionHeader: {
    flexDirection: IS_RTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  billingOptionLabel: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  billingOptionLabelActive: {
    color: '#1D4ED8',
  },
  billingOptionIndicator: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  billingOptionIndicatorActive: {
    borderColor: '#2F6BFF',
    backgroundColor: '#2F6BFF',
  },
  billingOptionIndicatorText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  billingOptionPrice: {
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  billingOptionPriceActive: {
    color: '#0B2A73',
  },
  billingOptionSubline: {
    color: '#64748B',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  footerNote: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: IS_RTL ? 'right' : 'left',
  },
  footerNoteError: {
    color: '#DC2626',
  },
  ctaButton: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#2F56D6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
});
