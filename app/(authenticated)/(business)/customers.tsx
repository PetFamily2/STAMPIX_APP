import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { SurfaceCard } from '@/components/business-ui';
import { UsageProgressBar } from '@/components/business-ui/UsageProgressBar';
import { useGuidedTargetRef } from '@/components/guidance/GuidedActionAnchor';
import { GuidedActionScreenOverlay } from '@/components/guidance/GuidedActionOverlay';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { FeatureGate } from '@/components/subscription/LockedFeatureWrapper';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import {
  alignItems,
  flexDirection,
  rtlBaseView,
  selfStart,
  tw,
} from '@/lib/rtl';
import { getLockedAreaCopy } from '@/lib/subscription/lockedAreaCopy';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

type CustomerRouteFilter =
  | 'near_reward'
  | 'at_risk'
  | 'new_customers'
  | 'reward_eligible';
type CustomerState =
  | 'NEW'
  | 'ACTIVE'
  | 'NEEDS_NURTURE'
  | 'NEEDS_WINBACK'
  | 'CLOSE_TO_REWARD';

type CustomerRow = {
  primaryMembershipId: string;
  customerId: string;
  name: string;
  phone?: string | null;
  customerState?: string | null;
  customerValueTier?: string | null;
  lastVisitDaysAgo: number;
  visitCount: number;
  primaryProgramName: string;
  rewardThreshold: number;
  loyaltyProgress: number;
};

const STATE_LABELS: Record<CustomerState, string> = {
  NEW: 'חדש',
  ACTIVE: 'פעיל',
  NEEDS_NURTURE: 'דורש חימום',
  NEEDS_WINBACK: 'דורש חזרה',
  CLOSE_TO_REWARD: 'קרוב להטבה',
};

const STATE_COLORS: Record<CustomerState, { bg: string; fg: string }> = {
  NEW: { bg: '#E0F2FE', fg: '#0369A1' },
  ACTIVE: { bg: '#EEF2FF', fg: '#3730A3' },
  NEEDS_NURTURE: { bg: '#FFEDD5', fg: '#C2410C' },
  NEEDS_WINBACK: { bg: '#FEE2E2', fg: '#B91C1C' },
  CLOSE_TO_REWARD: { bg: '#FEF3C7', fg: '#B45309' },
};

function resolveCustomerState(customer: {
  customerState?: string | null;
}): CustomerState {
  if (
    customer.customerState === 'NEW' ||
    customer.customerState === 'ACTIVE' ||
    customer.customerState === 'NEEDS_NURTURE' ||
    customer.customerState === 'NEEDS_WINBACK' ||
    customer.customerState === 'CLOSE_TO_REWARD'
  ) {
    return customer.customerState;
  }
  return 'ACTIVE';
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(
    value
  );
}

function formatLastVisit(daysAgo: number) {
  if (daysAgo <= 0) {
    return 'היום';
  }
  if (daysAgo === 1) {
    return 'אתמול';
  }
  return `לפני ${daysAgo} ימים`;
}

function buildActiveFilterLabel(activeFilter: CustomerRouteFilter) {
  if (activeFilter === 'near_reward') {
    return 'מסונן: קרובים להטבה';
  }
  if (activeFilter === 'at_risk') {
    return 'מסונן: לקוחות בסיכון';
  }
  if (activeFilter === 'reward_eligible') {
    return 'מסונן: זכאים למימוש';
  }
  return 'מסונן: לקוחות חדשים';
}

function isInsightsCustomerFilter(activeFilter: CustomerRouteFilter | null) {
  return (
    activeFilter === 'near_reward' ||
    activeFilter === 'at_risk' ||
    activeFilter === 'new_customers'
  );
}

export function CustomersHubContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map, filter } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    filter?: string;
  }>();
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const activeFilter: CustomerRouteFilter | null =
    filter === 'near_reward' ||
    filter === 'at_risk' ||
    filter === 'new_customers' ||
    filter === 'reward_eligible'
      ? filter
      : null;

  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const guideTargetRef = useGuidedTargetRef();
  const guideScrollRef = useRef<ScrollView | null>(null);
  const businessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canCreateCampaigns = businessCapabilities?.create_campaigns === true;
  const canViewUsageQuota = businessCapabilities?.view_usage_quota === true;
  const { entitlements, gate, limitStatus } = useEntitlements(activeBusinessId);
  const smartGate = gate('smartAnalytics');
  const smartCopy = getLockedAreaCopy('smartAnalytics', smartGate.requiredPlan);
  const createCampaignDraft = useMutation(api.campaigns.createCampaignDraft);
  const customerList = (useQuery(
    api.customerCards.listBusinessCustomersBase,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  ) ?? []) as CustomerRow[];
  const usageSummary = useQuery(
    api.entitlements.getBusinessUsageSummary,
    activeBusinessId && canViewUsageQuota
      ? { businessId: activeBusinessId }
      : 'skip'
  );
  const [search, setSearch] = useState('');
  const [isCreatingWinbackCampaign, setIsCreatingWinbackCampaign] =
    useState(false);
  const hasLockedInsightsFilter =
    smartGate.isLocked && isInsightsCustomerFilter(activeFilter);
  const effectiveFilter = hasLockedInsightsFilter ? null : activeFilter;
  const showLifecycleInsights = !smartGate.isLocked;
  const customerLimitRequiredPlan =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxCustomers ?? null;
  const customerLimitCopy = getLockedAreaCopy(
    'maxCustomers',
    customerLimitRequiredPlan
  );
  const customersUsed =
    typeof usageSummary?.customersUsed === 'number' &&
    Number.isFinite(usageSummary.customersUsed)
      ? usageSummary.customersUsed
      : null;
  const customerLimitStatus =
    entitlements && customersUsed !== null
      ? limitStatus('maxCustomers', customersUsed)
      : null;
  const showCustomerUsageStatus =
    canViewUsageQuota &&
    customerLimitStatus !== null &&
    customerLimitStatus.limitValue > 0;

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.navigate('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const openUpgrade = (
    featureKey: string,
    requiredPlan: 'starter' | 'pro' | 'premium' | null,
    reason:
      | 'feature_locked'
      | 'limit_reached'
      | 'subscription_inactive' = 'feature_locked'
  ) => {
    openSubscriptionComparison(router, { featureKey, requiredPlan, reason });
  };

  const openCampaigns = () => {
    router.push('/(authenticated)/(business)/campaigns');
  };
  const openBusinessQr = () => {
    router.push('/(authenticated)/(business)/qr');
  };
  const openScanner = () => {
    router.push('/(authenticated)/(business)/scanner');
  };

  const showAtRiskActionCard =
    !smartGate.isLocked && effectiveFilter === 'at_risk';

  const handleCreateAtRiskCampaign = async () => {
    if (!activeBusinessId || isCreatingWinbackCampaign) {
      return;
    }

    if (!canCreateCampaigns) {
      Alert.alert(
        'אין הרשאה',
        'רק בעלים או מנהלים יכולים ליצור קמפיין ללקוחות בסיכון.'
      );
      return;
    }

    setIsCreatingWinbackCampaign(true);
    try {
      const created = await createCampaignDraft({
        businessId: activeBusinessId,
        type: 'winback',
        rules: { audience: 'inactive_days', daysInactive: 30 },
      });

      router.push({
        pathname: '/(authenticated)/(business)/cards/campaign/[campaignId]',
        params: {
          campaignId: String(created.campaignId),
          businessId: String(activeBusinessId),
        },
      });
    } catch (error) {
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        Alert.alert(
          'לא ניתן ליצור קמפיין',
          entitlementErrorToHebrewMessage(entitlementError),
          [
            {
              text: 'שדרוג',
              onPress: () =>
                openUpgrade(
                  entitlementError.limitKey ??
                    entitlementError.featureKey ??
                    'marketingHub',
                  entitlementError.requiredPlan ?? null,
                  entitlementError.code === 'SUBSCRIPTION_INACTIVE'
                    ? 'subscription_inactive'
                    : entitlementError.code === 'PLAN_LIMIT_REACHED'
                      ? 'limit_reached'
                      : 'feature_locked'
                ),
            },
            { text: 'אישור', style: 'cancel' },
          ]
        );
        return;
      }

      Alert.alert('שגיאה', 'יצירת קמפיין החזרה נכשלה.');
    } finally {
      setIsCreatingWinbackCampaign(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    const routeFilteredCustomers = effectiveFilter
      ? customerList.filter((customer) => {
          const state = resolveCustomerState(customer);
          if (effectiveFilter === 'near_reward') {
            return state === 'CLOSE_TO_REWARD';
          }
          if (effectiveFilter === 'at_risk') {
            return state === 'NEEDS_NURTURE' || state === 'NEEDS_WINBACK';
          }
          if (effectiveFilter === 'reward_eligible') {
            return (
              Number(customer.rewardThreshold) > 0 &&
              Number(customer.loyaltyProgress) >=
                Number(customer.rewardThreshold)
            );
          }
          return state === 'NEW';
        })
      : customerList;
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return routeFilteredCustomers;
    }
    return routeFilteredCustomers.filter((customer) =>
      `${customer.name} ${customer.phone ?? ''}`
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [customerList, effectiveFilter, search]);

  const openCustomerCard = (customerUserId: string) => {
    router.push({
      pathname: '/(authenticated)/(business)/customer/[customerUserId]',
      params: { customerUserId },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        ref={guideScrollRef}
        stickyHeaderIndices={[0]}
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: DASHBOARD_TOKENS.spacingPageHorizontal,
          paddingBottom: (insets.bottom || 0) + 30,
          width: '100%',
          maxWidth: 960,
          alignSelf: 'center',
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor={DASHBOARD_TOKENS.pageBackground}
        >
          <BusinessScreenHeader
            title="לקוחות"
            subtitle="חיפוש, פתיחת כרטיס וניהול לקוחות"
          />
        </StickyScrollHeader>

        <SurfaceCard style={styles.searchCard}>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={20} color="#64748B" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="חיפוש לקוח לפי שם או טלפון"
              placeholderTextColor="#94A3B8"
              className={tw.textStart}
              style={styles.searchInput}
            />
          </View>
        </SurfaceCard>

        {hasLockedInsightsFilter ? (
          <View style={{ marginTop: 12 }}>
            <FeatureGate
              isLocked={smartGate.isLocked}
              requiredPlan={smartGate.requiredPlan}
              onUpgradeClick={() =>
                openUpgrade(
                  'smartAnalytics',
                  smartGate.requiredPlan,
                  smartGate.reason === 'subscription_inactive'
                    ? 'subscription_inactive'
                    : 'feature_locked'
                )
              }
              title={smartCopy.lockedTitle}
              subtitle={smartCopy.lockedSubtitle}
              benefits={smartCopy.benefits}
            >
              <View />
            </FeatureGate>
          </View>
        ) : null}

        {showAtRiskActionCard ? (
          <SurfaceCard style={styles.atRiskActionCard}>
            <Text className={tw.textStart} style={styles.atRiskTitle}>
              פעולה ללקוחות בסיכון
            </Text>
            <Text className={tw.textStart} style={styles.atRiskBody}>
              צרו קמפיין החזרה ללקוחות שלא חזרו בזמן.
            </Text>
            <View style={styles.atRiskActions}>
              <Pressable
                disabled={isCreatingWinbackCampaign || !canCreateCampaigns}
                onPress={() => {
                  void handleCreateAtRiskCampaign();
                }}
                style={({ pressed }) => [
                  styles.primaryAction,
                  (!canCreateCampaigns || isCreatingWinbackCampaign) &&
                    styles.actionDisabled,
                  pressed && canCreateCampaigns
                    ? styles.primaryActionPressed
                    : null,
                ]}
              >
                {isCreatingWinbackCampaign ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryActionText}>צרו קמפיין החזרה</Text>
                )}
              </Pressable>
              <Pressable
                onPress={openCampaigns}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  pressed ? styles.secondaryActionPressed : null,
                ]}
              >
                <Text style={styles.secondaryActionText}>כל הקמפיינים</Text>
              </Pressable>
            </View>
            {!canCreateCampaigns ? (
              <Text className={tw.textStart} style={styles.permissionHint}>
                למשתמש הנוכחי אין הרשאה ליצור קמפיינים.
              </Text>
            ) : null}
          </SurfaceCard>
        ) : null}
        {showCustomerUsageStatus &&
        customerLimitStatus &&
        (customerLimitStatus.isNearLimit || customerLimitStatus.isAtLimit) ? (
          <SurfaceCard
            style={[
              styles.customerUsageCard,
              customerLimitStatus.isAtLimit
                ? styles.customerUsageCardAtLimit
                : customerLimitStatus.isNearLimit
                  ? styles.customerUsageCardNearLimit
                  : null,
            ]}
          >
            <View style={styles.customerUsageHeader}>
              <View style={styles.customerUsageIconWrap}>
                <Ionicons name="people-outline" size={20} color="#1D4ED8" />
              </View>
              <View style={styles.customerUsageCopy}>
                <Text
                  className={tw.textStart}
                  style={styles.customerUsageTitle}
                >
                  {customerLimitStatus.isAtLimit
                    ? customerLimitCopy.lockedTitle
                    : 'מכסת לקוחות'}
                </Text>
                <Text className={tw.textStart} style={styles.customerUsageBody}>
                  {customerLimitStatus.isAtLimit
                    ? `${customerLimitCopy.lockedSubtitle} אפשר להמשיך לחפש, לפתוח ולנהל לקוחות קיימים.`
                    : customerLimitStatus.isNearLimit
                      ? `אתם מתקרבים למכסת הלקוחות במסלול הנוכחי. נותרו ${formatNumber(
                          customerLimitStatus.remaining
                        )} מקומות פנויים.`
                      : 'רואים כאן כמה לקוחות פעילים כבר נספרו מתוך המכסה במסלול הנוכחי.'}
                </Text>
              </View>
            </View>

            <View style={styles.customerUsageProgressWrap}>
              <UsageProgressBar
                label="לקוחות בשימוש"
                used={customerLimitStatus.currentValue}
                limit={customerLimitStatus.limitValue}
                accent="#1D4ED8"
              />
            </View>

            {customerLimitStatus.isAtLimit ? (
              <View style={styles.customerUsageUpgradeRow}>
                <Text className={tw.textStart} style={styles.customerUsageHint}>
                  הוספת לקוחות חדשים תצריך שדרוג מסלול.
                </Text>
                <Pressable
                  onPress={() =>
                    openUpgrade(
                      'maxCustomers',
                      customerLimitRequiredPlan,
                      'limit_reached'
                    )
                  }
                  style={({ pressed }) => [
                    styles.customerUsageUpgradeButton,
                    pressed ? styles.customerUsageUpgradeButtonPressed : null,
                  ]}
                >
                  <Text style={styles.customerUsageUpgradeButtonText}>
                    שדרוג
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </SurfaceCard>
        ) : null}

        <View
          ref={
            effectiveFilter === 'at_risk' || effectiveFilter === 'near_reward'
              ? guideTargetRef
              : undefined
          }
          collapsable={false}
        >
          <View style={styles.listHeader}>
            <Text
              style={styles.listHeaderText}
            >{`${formatNumber(filteredCustomers.length)} לקוחות`}</Text>
            <Text
              style={styles.listHeaderText}
            >{`${formatNumber(customerList.length)} סה"כ`}</Text>
          </View>

          {effectiveFilter ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>
                {buildActiveFilterLabel(effectiveFilter)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.listWrap}>
          {customerList.length === 0 ? (
            <SurfaceCard style={styles.emptyCustomersCard}>
              <Text className={tw.textStart} style={styles.emptyTitle}>
                עדיין אין לקוחות
              </Text>
              <Text className={tw.textStart} style={styles.emptyBody}>
                לקוחות יופיעו כאן אחרי שיצטרפו לכרטיסייה ויקבלו ניקוב ראשון.
              </Text>
              <View style={styles.emptyActionsRow}>
                <Pressable
                  onPress={openBusinessQr}
                  style={({ pressed }) => [
                    styles.emptyPrimaryButton,
                    pressed ? styles.emptyButtonPressed : null,
                  ]}
                >
                  <Text style={styles.emptyPrimaryButtonText}>
                    הצגת QR להצטרפות
                  </Text>
                </Pressable>
                <Pressable
                  onPress={openScanner}
                  style={({ pressed }) => [
                    styles.emptySecondaryButton,
                    pressed ? styles.emptyButtonPressed : null,
                  ]}
                >
                  <Text style={styles.emptySecondaryButtonText}>
                    פתיחת סורק
                  </Text>
                </Pressable>
              </View>
            </SurfaceCard>
          ) : filteredCustomers.length === 0 ? (
            <SurfaceCard>
              <Text className={tw.textStart} style={styles.emptyText}>
                לא נמצאו לקוחות התואמים לחיפוש.
              </Text>
            </SurfaceCard>
          ) : (
            filteredCustomers.map((customer) => {
              const customerState = resolveCustomerState(customer);
              return (
                <Pressable
                  key={customer.primaryMembershipId}
                  onPress={() => openCustomerCard(String(customer.customerId))}
                  style={styles.customerCard}
                >
                  <View style={styles.customerRow}>
                    <View style={styles.avatar}>
                      <Ionicons
                        name="person-outline"
                        size={20}
                        color="#2F6BFF"
                      />
                    </View>

                    <View style={styles.customerMain}>
                      <Text
                        className={tw.textStart}
                        style={styles.customerName}
                      >
                        {customer.name}
                      </Text>
                      <Text
                        className={tw.textStart}
                        style={styles.customerSecondary}
                      >
                        {customer.phone ?? 'ללא טלפון'}
                      </Text>
                      {showLifecycleInsights ? (
                        <View style={styles.badges}>
                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor: STATE_COLORS[customerState].bg,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeText,
                                { color: STATE_COLORS[customerState].fg },
                              ]}
                            >
                              {STATE_LABELS[customerState]}
                            </Text>
                          </View>
                        </View>
                      ) : null}
                      <Text
                        className={tw.textStart}
                        style={styles.progressText}
                      >
                        התקדמות להטבה: {customer.loyaltyProgress}/
                        {customer.rewardThreshold}
                      </Text>
                    </View>

                    <View style={styles.customerMeta}>
                      <Text className={tw.textStart} style={styles.metaTitle}>
                        ביקור אחרון
                      </Text>
                      <Text className={tw.textStart} style={styles.metaValue}>
                        {formatLastVisit(customer.lastVisitDaysAgo)}
                      </Text>
                      <Text className={tw.textStart} style={styles.metaSub}>
                        {customer.primaryProgramName}
                      </Text>
                    </View>
                    <Ionicons name="chevron-back" size={18} color="#64748B" />
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
      <GuidedActionScreenOverlay
        activeBusinessId={activeBusinessId}
        routeKey="customers"
        destinationTargetValid={
          effectiveFilter === 'at_risk' || effectiveFilter === 'near_reward'
        }
        targetRef={guideTargetRef}
        scrollTargetIntoView={() =>
          guideScrollRef.current?.scrollTo({
            y: 220,
            animated: false,
          })
        }
      />
    </SafeAreaView>
  );
}

export default function BusinessCustomersRoute() {
  return <CustomersHubContent />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DASHBOARD_TOKENS.pageBackground,
  },
  scroll: {
    flex: 1,
  },
  customerUsageCard: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#DCE7F8',
  },
  customerUsageCardNearLimit: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFDF5',
  },
  customerUsageCardAtLimit: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFF7ED',
  },
  customerUsageHeader: {
    ...rtlBaseView,
    flexDirection: flexDirection.row,
    alignItems: alignItems.start,
    gap: 12,
  },
  customerUsageIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F1FF',
  },
  customerUsageCopy: {
    flex: 1,
    minWidth: 0,
  },
  customerUsageTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  customerUsageBody: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: '#64748B',
  },
  customerUsageProgressWrap: {
    marginTop: 14,
  },
  customerUsageUpgradeRow: {
    ...rtlBaseView,
    marginTop: 14,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
  },
  customerUsageHint: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#B45309',
  },
  customerUsageUpgradeButton: {
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  customerUsageUpgradeButtonPressed: {
    opacity: 0.88,
  },
  customerUsageUpgradeButtonText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  searchCard: {
    marginTop: 18,
  },
  searchRow: {
    ...rtlBaseView,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1A2B4A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  listHeader: {
    marginTop: 16,
    flexDirection: flexDirection.row,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  emptyCustomersCard: {
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  emptyActionsRow: {
    ...rtlBaseView,
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 10,
  },
  emptyPrimaryButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: '#2F6BFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptySecondaryButton: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFD3FF',
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyButtonPressed: {
    opacity: 0.86,
  },
  emptyPrimaryButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptySecondaryButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#1D4ED8',
    textAlign: 'center',
  },
  atRiskActionCard: {
    marginTop: 16,
  },
  atRiskTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    color: '#0F172A',
  },
  atRiskBody: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: '#64748B',
  },
  atRiskActions: {
    ...rtlBaseView,
    marginTop: 14,
    flexDirection: flexDirection.row,
    gap: 10,
  },
  primaryAction: {
    ...rtlBaseView,
    minHeight: 44,
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: flexDirection.row,
    gap: 7,
    paddingHorizontal: 14,
  },
  primaryActionPressed: {
    opacity: 0.88,
  },
  secondaryAction: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BFE7E2',
    backgroundColor: '#F0FDFA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryActionPressed: {
    opacity: 0.82,
  },
  actionDisabled: {
    backgroundColor: '#CBD5E1',
  },
  primaryActionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  secondaryActionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#0F766E',
  },
  permissionHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#B45309',
  },
  filterBadge: {
    alignSelf: selfStart,
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: '#E8F1FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  listWrap: {
    marginTop: 10,
    gap: 0,
  },
  customerCard: {
    borderBottomWidth: 1,
    borderColor: '#E3E9F4',
    paddingVertical: 16,
  },
  customerRow: {
    ...rtlBaseView,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECF1FF',
  },
  customerMain: {
    flex: 1,
    alignItems: alignItems.start,
  },
  customerName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F294B',
  },
  customerSecondary: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#8A97AC',
  },
  badges: {
    ...rtlBaseView,
    marginTop: 8,
    flexDirection: flexDirection.row,
    gap: 6,
    flexWrap: 'wrap',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  customerMeta: {
    minWidth: 92,
    alignItems: alignItems.start,
  },
  metaTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  metaValue: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  metaSub: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
});
